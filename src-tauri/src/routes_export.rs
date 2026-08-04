use std::sync::Arc;
use axum::{
    extract::{State, RawQuery},
    http::{StatusCode, header},
    response::IntoResponse,
    Json,
};
use crate::db::AppState;
use crate::export::build_export_zip;
use crate::i18n::Lang;
use crate::models::ApiResponse;

pub async fn export_notes(
    State(state): State<Arc<AppState>>,
    lang: Lang,
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
        return Err((StatusCode::BAD_REQUEST, Json(ApiResponse::error(&lang.t("请选择要导出的笔记", "Please select notes to export")))));
    }

    let notes = state.fetch_notes_by_titles(&titles, &lang.0)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::error(&e))))?;

    if notes.is_empty() {
        return Err((StatusCode::NOT_FOUND, Json(ApiResponse::error(&lang.t("笔记不存在", "Note not found")))));
    }

    let label = if notes.len() == 1 { notes[0].title.clone() } else { "notes-export".to_string() };

    let zip_bytes = build_export_zip(&notes, &state.paths, &lang.0)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::error(&e))))?;

    let filename = format!("{}.zip", label);
    let body = axum::body::Body::from(zip_bytes);

    let response = axum::response::Response::builder()
        .status(200)
        .header(header::CONTENT_TYPE, "application/zip")
        .header(header::CONTENT_DISPOSITION, format!("attachment; filename=\"{}\"", filename))
        .body(body)
        .unwrap();

    Ok(response)
}
