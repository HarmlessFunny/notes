use std::sync::Arc;
use std::convert::Infallible;
use axum::{
    extract::{State, Multipart},
    http::{StatusCode, HeaderMap},
    response::sse::{Event, Sse},
    Json,
};
use futures::stream::Stream;
use serde::Deserialize;

use crate::db::AppState;
use crate::models::{AiConfig, ApiResponse, ChatMessage};
use crate::ai_stream;
use crate::notes_file::unique_filepath;

#[derive(Deserialize)]
pub struct AiChatBody {
    messages: Vec<ChatMessage>,
}

#[derive(Deserialize)]
pub struct SaveChatBody {
    messages: Vec<ChatMessage>,
}

pub async fn ai_status(
    headers: HeaderMap,
) -> Json<ApiResponse> {
    let config = AiConfig::from_headers(&headers);
    let available = config.is_valid();
    Json(ApiResponse {
        status: "success".into(),
        ai_available: Some(available),
        vision_enabled: Some(config.vision_enabled),
        ..Default::default()
    })
}

pub async fn ai_chat_stream(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<AiChatBody>,
) -> Result<
    Sse<impl Stream<Item = Result<Event, Infallible>>>,
    (StatusCode, Json<ApiResponse>),
> {
    let config = AiConfig::from_headers(&headers);
    if !config.is_valid() {
        return Err((StatusCode::BAD_REQUEST, Json(ApiResponse::error("AI 功能未配置，请先设置 API 配置"))));
    }
    if body.messages.is_empty() {
        return Err((StatusCode::BAD_REQUEST, Json(ApiResponse::error("请输入问题"))));
    }

    let stream = ai_stream::stream_ai_chat(state, config, body.messages);
    Ok(Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(std::time::Duration::from_secs(15))
            .text("keep-alive"),
    ))
}

pub async fn get_ai_chat(
    State(state): State<Arc<AppState>>,
) -> Json<ApiResponse> {
    match state.fetch_ai_chat() {
        Ok(messages) => Json(ApiResponse::with_messages(messages)),
        Err(e) => Json(ApiResponse::error(&e)),
    }
}

pub async fn save_ai_chat(
    State(state): State<Arc<AppState>>,
    Json(body): Json<SaveChatBody>,
) -> Json<ApiResponse> {
    match state.save_ai_chat(&body.messages) {
        Ok(()) => Json(ApiResponse::success()),
        Err(e) => Json(ApiResponse::error(&e)),
    }
}

pub async fn delete_ai_chat(
    State(state): State<Arc<AppState>>,
) -> Json<ApiResponse> {
    match state.delete_ai_chat() {
        Ok(()) => Json(ApiResponse::success()),
        Err(e) => Json(ApiResponse::error(&e)),
    }
}

pub async fn upload_ai_image(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> Result<Json<ApiResponse>, (StatusCode, Json<ApiResponse>)> {
    let mut saved: Vec<String> = vec![];

    while let Ok(Some(field)) = Multipart::next_field(&mut multipart).await {
        if field.name().unwrap_or("") == "images" {
            let filename = field.file_name().unwrap_or("image.png").to_string();
            let allowed = ["png", "jpg", "jpeg", "gif", "webp"];
            let ext = filename.rsplit('.').next().unwrap_or("png").to_lowercase();
            if !allowed.contains(&ext.as_str()) { continue; }
            if let Ok(data) = field.bytes().await {
                let img_name = format!("ai_{}_{}.{}", chrono::Utc::now().timestamp(), saved.len() + 1, ext);
                let dst = unique_filepath(&state.paths.uploads_folder, &img_name);
                if std::fs::write(&dst, &data).is_ok() {
                    if let Some(fname) = dst.file_name().and_then(|n| n.to_str()).map(String::from) {
                        saved.push(fname);
                    }
                }
            }
        }
    }

    let urls: Vec<String> = saved.iter().map(|f| format!("/uploads/images/{}", f)).collect();
    Ok(Json(ApiResponse {
        status: "success".into(),
        urls: Some(urls),
        ..Default::default()
    }))
}
