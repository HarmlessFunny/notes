use std::sync::Arc;
use axum::{
    extract::{State, RawQuery},
    http::{StatusCode, header},
    response::IntoResponse,
    Json,
};
use serde_json::json;

use crate::db::AppState;
use crate::models::ApiResponse;

pub async fn export_notes(
    State(state): State<Arc<AppState>>,
    RawQuery(raw): RawQuery,
) -> Result<impl IntoResponse, (StatusCode, Json<ApiResponse>)> {
    let titles: Vec<String> = raw.as_deref().unwrap_or("")
        .split('&')
        .filter_map(|pair| {
            let mut parts = pair.splitn(2, '=');
            let key = parts.next()?;
            let val = parts.next()?;
            if key == "titles" {
                Some(urlencoding::decode(val).unwrap_or_default().replace('+', " "))
            } else {
                None
            }
        })
        .collect();

    if titles.is_empty() {
        return Err((StatusCode::BAD_REQUEST, Json(ApiResponse::error("请选择要导出的笔记"))));
    }

    let notes = state.fetch_notes_by_titles(&titles)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::error(&e))))?;

    if notes.is_empty() {
        return Err((StatusCode::NOT_FOUND, Json(ApiResponse::error("笔记不存在"))));
    }

    let label = if notes.len() == 1 { notes[0].title.clone() } else { "notes-export".to_string() };

    let mut buf = std::io::Cursor::new(Vec::new());
    {
        let mut zip = zip::ZipWriter::new(&mut buf);
        let options = zip::write::FileOptions::<()>::default()
            .compression_method(zip::CompressionMethod::Deflated);

        // database.json
        let db_notes: Vec<serde_json::Value> = notes.iter().map(|n| json!({
            "title": n.title,
            "subject": n.subject,
            "time": n.time,
        })).collect();
        let db_content = serde_json::to_string_pretty(&json!({
            "notes": db_notes,
            "ai_chat": []
        })).unwrap_or_default();
        let _ = zip.start_file("database.json", options);
        let _ = std::io::Write::write_all(&mut zip, db_content.as_bytes());

        for note in &notes {
            // notes/<title>.md
            let mut lines = vec![format!("# {}/{}", note.subject, note.title)];
            if !note.content.is_empty() {
                lines.push(note.content.clone());
            }
            for img in &note.imgs {
                lines.push(format!("![图片](../uploads/images/{})", img));
            }
            let md_content = lines.join("\n");
            let _ = zip.start_file(format!("notes/{}.md", note.title), options);
            let _ = std::io::Write::write_all(&mut zip, md_content.as_bytes());

            // uploads/images/<img>
            for img in &note.imgs {
                let img_path = state.paths.uploads_folder.join(img);
                if img_path.exists() {
                    if let Ok(data) = std::fs::read(&img_path) {
                        let _ = zip.start_file(format!("uploads/images/{}", img), options);
                        let _ = std::io::Write::write_all(&mut zip, &data);
                    }
                }
            }
        }
    }

    let bytes = buf.into_inner();
    let filename = format!("{}.zip", label);
    let body = axum::body::Body::from(bytes);

    let response = axum::response::Response::builder()
        .status(200)
        .header(header::CONTENT_TYPE, "application/zip")
        .header(header::CONTENT_DISPOSITION, format!("attachment; filename=\"{}\"", filename))
        .body(body)
        .unwrap();

    Ok(response)
}
