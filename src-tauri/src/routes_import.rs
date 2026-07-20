use std::sync::Arc;
use axum::{
    extract::{State, Multipart},
    http::StatusCode,
    Json,
};
use serde_json::Value;

use crate::db::AppState;
use crate::models::ApiResponse;

pub async fn import_notes(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> Result<Json<ApiResponse>, (StatusCode, Json<ApiResponse>)> {
    let mut zip_data: Option<Vec<u8>> = None;
    while let Ok(Some(field)) = axum::extract::multipart::Multipart::next_field(&mut multipart).await {
        if field.name() == Some("file") {
            zip_data = Some(field.bytes().await.unwrap_or_default().to_vec());
            break;
        }
    }

    let zip_data = zip_data.ok_or_else(|| {
        (StatusCode::BAD_REQUEST, Json(ApiResponse::error("缺少导入文件")))
    })?;

    let cursor = std::io::Cursor::new(&zip_data);
    let mut archive = zip::ZipArchive::new(cursor)
        .map_err(|_| (StatusCode::BAD_REQUEST, Json(ApiResponse::error("无效的 ZIP 文件"))))?;

    let mut db_content: Option<String> = None;
    let mut file_map: std::collections::HashMap<String, Vec<u8>> = std::collections::HashMap::new();

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::error("读取 ZIP 文件失败"))))?;
        let path = file.name().to_string();
        if file.is_dir() { continue; }
        // 全局路径穿越校验
        if path.contains("..") { continue; }

        let mut data = Vec::new();
        std::io::Read::read_to_end(&mut file, &mut data)
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::error("读取 ZIP 条目失败"))))?;

        if path == "database.json" {
            db_content = Some(String::from_utf8_lossy(&data).to_string());
        } else {
            file_map.insert(path, data);
        }
    }

    let db_content = db_content.ok_or_else(|| {
        (StatusCode::BAD_REQUEST, Json(ApiResponse::error("ZIP 中缺少 database.json")))
    })?;

    let imported: Value = serde_json::from_str(&db_content)
        .map_err(|_| (StatusCode::BAD_REQUEST, Json(ApiResponse::error("database.json 格式无效"))))?;

    let imported_notes = imported["notes"].as_array()
        .ok_or_else(|| (StatusCode::BAD_REQUEST, Json(ApiResponse::error("database.json 缺少 notes 字段"))))?;

    let mut current_db = state.load_database_raw()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::error(&e))))?;

    let mut imported_count = 0;

    for entry in imported_notes {
        let title = entry["title"].as_str().unwrap_or("");
        let subject = entry["subject"].as_str().unwrap_or("");
        let time = entry["time"].as_str().unwrap_or("");

        if title.is_empty() { continue; }
        // 路径穿越校验：拒绝含 .. / \ 的标题
        if title.contains("..") || title.contains('/') || title.contains('\\') { continue; }

        // Copy notes/<title>.md
        let md_key = format!("notes/{}.md", title);
        if let Some(md_data) = file_map.get(&md_key) {
            let md_path = state.paths.notes_folder.join(format!("{}.md", title));
            let _ = std::fs::write(&md_path, md_data);
        }

        // Add/update note in database
        if let Some(existing) = current_db.notes.iter_mut().find(|n| n.title == title) {
            existing.subject = subject.to_string();
            existing.time = time.to_string();
        } else {
            current_db.notes.push(crate::models::NoteMeta {
                title: title.to_string(),
                subject: subject.to_string(),
                time: time.to_string(),
            });
        }
        imported_count += 1;
    }

    // Copy all uploads/images/* from ZIP
    for (path, data) in &file_map {
        if let Some(filename) = path.strip_prefix("uploads/images/") {
            if !filename.is_empty() && !filename.contains('/') {
                let img_path = state.paths.uploads_folder.join(filename);
                let _ = std::fs::write(&img_path, data);
            }
        }
    }

    state.save_database_raw(&current_db)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::error(&e))))?;

    state.refresh_cache().await;

    Ok(Json(ApiResponse::success_msg(&format!("成功导入 {} 篇笔记", imported_count))))
}
