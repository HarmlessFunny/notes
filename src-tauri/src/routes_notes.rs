use std::sync::Arc;
use axum::{
    extract::{Path, Query, State, Multipart},
    http::StatusCode,
    Json,
};
use serde::Deserialize;

use crate::db::AppState;
use crate::models::ApiResponse;
use crate::notes_file::unique_filepath;

#[derive(Deserialize)]
pub struct SearchQuery {
    q: Option<String>,
}

#[derive(Deserialize)]
pub struct DeleteBody {
    titles: Vec<String>,
}

pub async fn get_all_notes(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse>, (StatusCode, Json<ApiResponse>)> {
    state.fetch_all_notes()
        .map(ApiResponse::with_notes)
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::error(&e))))
}

pub async fn get_notes_by_day(
    State(state): State<Arc<AppState>>,
    Path(someday): Path<String>,
) -> Result<Json<ApiResponse>, (StatusCode, Json<ApiResponse>)> {
    state.fetch_notes_by_day(&someday)
        .map(ApiResponse::with_notes)
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::error(&e))))
}

pub async fn get_note_by_title(
    State(state): State<Arc<AppState>>,
    Path(title): Path<String>,
) -> Result<Json<ApiResponse>, (StatusCode, Json<ApiResponse>)> {
    let decoded = urlencoding::decode(&title).unwrap_or(std::borrow::Cow::Borrowed(&title));
    match state.fetch_notes_by_titles(&[decoded.to_string()]) {
        Ok(mut notes) if !notes.is_empty() => Ok(Json(ApiResponse::with_note(notes.remove(0)))),
        Ok(_) => Err((StatusCode::NOT_FOUND, Json(ApiResponse::error("笔记不存在")))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::error(&e)))),
    }
}

pub async fn search_notes_route(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SearchQuery>,
) -> Result<Json<ApiResponse>, (StatusCode, Json<ApiResponse>)> {
    let keyword = query.q.unwrap_or_default();
    state.search_notes(&keyword).await
        .map(ApiResponse::with_notes)
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::error(&e))))
}

fn sanitize_title(title: &str) -> String {
    let illegal: &[char] = &['\\', '/', ':', '*', '?', '"', '<', '>', '|'];
    let s: String = title.chars().map(|c| if illegal.contains(&c) { '_' } else { c }).collect();
    let t: String = s.chars().take(100).collect();
    if t.is_empty() { format!("note_{}", chrono::Utc::now().timestamp()) } else { t }
}

fn allowed_file(filename: &str) -> bool {
    let allowed = ["png", "jpg", "jpeg", "gif", "webp"];
    filename.rsplit('.').next().map(|ext| allowed.contains(&ext.to_lowercase().as_str())).unwrap_or(false)
}

pub async fn submit_note(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> Result<Json<ApiResponse>, (StatusCode, Json<ApiResponse>)> {
    let mut title = String::new();
    let mut subject = String::new();
    let mut content = String::new();
    let mut timestamp = String::new();
    let mut pending_images: Vec<(Vec<u8>, String)> = vec![];

    while let Ok(Some(field)) = Multipart::next_field(&mut multipart).await {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "title" => { title = field.text().await.unwrap_or_default(); }
            "subject" => { subject = field.text().await.unwrap_or_default(); }
            "content" => { content = field.text().await.unwrap_or_default(); }
            "timestamp" => { timestamp = field.text().await.unwrap_or_default(); }
            "images" => {
                let fname = field.file_name().unwrap_or("image.png").to_string();
                if !allowed_file(&fname) { continue; }
                if let Ok(data) = field.bytes().await {
                    let ext = fname.rsplit('.').next().unwrap_or("png").to_lowercase();
                    pending_images.push((data.to_vec(), ext));
                }
            }
            _ => {}
        }
    }

    if title.trim().is_empty() || subject.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, Json(ApiResponse::error("缺少必要字段: title, subject"))));
    }

    let safe = sanitize_title(&title);
    let mut saved_images: Vec<String> = vec![];
    for (idx, (data, ext)) in pending_images.iter().enumerate() {
        let img_name = if idx == 0 {
            format!("{}.{}", safe, ext)
        } else {
            format!("{}_{}.{}", safe, idx + 1, ext)
        };
        let dst = unique_filepath(&state.paths.uploads_folder, &img_name);
        if std::fs::write(&dst, &data).is_ok() {
            if let Some(fname) = dst.file_name().and_then(|n| n.to_str()).map(String::from) {
                saved_images.push(fname);
            }
        }
    }

    let ts = if timestamp.is_empty() { format!("{}", chrono::Utc::now().timestamp_millis()) } else { timestamp };
    match state.add_note(&title, &subject, &content, &ts, &saved_images).await {
        Ok(()) => Ok(Json(ApiResponse::success_msg("笔记发布成功"))),
        Err(e) => {
            for img in &saved_images {
                let _ = std::fs::remove_file(state.paths.uploads_folder.join(img));
            }
            Err((StatusCode::BAD_REQUEST, Json(ApiResponse::error(&e))))
        }
    }
}

pub async fn update_note_route(
    State(state): State<Arc<AppState>>,
    Path(old_title): Path<String>,
    mut multipart: Multipart,
) -> Result<Json<ApiResponse>, (StatusCode, Json<ApiResponse>)> {
    let decoded_old = urlencoding::decode(&old_title).unwrap_or(std::borrow::Cow::Borrowed(&old_title)).to_string();
    let old_imgs = match state.fetch_notes_by_titles(&[decoded_old.clone()]) {
        Ok(notes) if !notes.is_empty() => notes[0].imgs.clone(),
        _ => vec![],
    };

    let mut title = String::new();
    let mut subject = String::new();
    let mut content = String::new();
    let mut existing_images: Vec<String> = vec![];
    let mut pending_images: Vec<(Vec<u8>, String)> = vec![];

    while let Ok(Some(field)) = Multipart::next_field(&mut multipart).await {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "title" => { title = field.text().await.unwrap_or_default(); }
            "subject" => { subject = field.text().await.unwrap_or_default(); }
            "content" => { content = field.text().await.unwrap_or_default(); }
            "existing_images" => {
                let s = field.text().await.unwrap_or_default();
                if let Ok(arr) = serde_json::from_str::<Vec<String>>(&s) {
                    existing_images = arr;
                }
            }
            "images" => {
                let fname = field.file_name().unwrap_or("image.png").to_string();
                if !allowed_file(&fname) { continue; }
                if let Ok(data) = field.bytes().await {
                    let ext = fname.rsplit('.').next().unwrap_or("png").to_lowercase();
                    pending_images.push((data.to_vec(), ext));
                }
            }
            _ => {}
        }
    }

    if title.trim().is_empty() || subject.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, Json(ApiResponse::error("缺少必要字段: title, subject"))));
    }

    let safe = sanitize_title(&title);
    let mut new_images: Vec<String> = vec![];
    for (idx, (data, ext)) in pending_images.iter().enumerate() {
        let img_name = if idx == 0 {
            format!("{}.{}", safe, ext)
        } else {
            format!("{}_{}.{}", safe, idx + 1, ext)
        };
        let dst = unique_filepath(&state.paths.uploads_folder, &img_name);
        if std::fs::write(&dst, &data).is_ok() {
            if let Some(fname) = dst.file_name().and_then(|n| n.to_str()).map(String::from) {
                new_images.push(fname);
            }
        }
    }

    let all_images: Vec<String> = existing_images.into_iter().chain(new_images).collect();

    match state.update_note(&decoded_old, &title, &subject, &content, &all_images, false).await {
        Ok(()) => {
            for img in &old_imgs {
                if !all_images.contains(img) {
                    let _ = std::fs::remove_file(state.paths.uploads_folder.join(img));
                }
            }
            Ok(Json(ApiResponse::success_msg("笔记更新成功")))
        }
        Err(e) => Err((StatusCode::BAD_REQUEST, Json(ApiResponse::error(&e)))),
    }
}

pub async fn delete_notes_route(
    State(state): State<Arc<AppState>>,
    Json(body): Json<DeleteBody>,
) -> Result<Json<ApiResponse>, (StatusCode, Json<ApiResponse>)> {
    if body.titles.is_empty() {
        return Err((StatusCode::BAD_REQUEST, Json(ApiResponse::error("请选择要删除的笔记"))));
    }
    match state.delete_notes(&body.titles).await {
        Ok(count) => Ok(Json(ApiResponse {
            status: "success".into(),
            message: Some(format!("已删除 {} 篇笔记", count)),
            deleted_count: Some(count),
            ..Default::default()
        })),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::error(&e)))),
    }
}
