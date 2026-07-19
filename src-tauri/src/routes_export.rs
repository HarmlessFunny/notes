use std::sync::Arc;
use axum::{
    extract::{State, RawQuery},
    http::{StatusCode, header},
    response::IntoResponse,
    Json,
};

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

    let mut buf = std::io::Cursor::new(Vec::new());
    {
        let mut zip = zip::ZipWriter::new(&mut buf);
        let options = zip::write::FileOptions::<()>::default()
            .compression_method(zip::CompressionMethod::Deflated);

        for note in &notes {
            let safe_name: String = note.title.chars().take(30).map(|c| match c { '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_', _ => c }).collect();
            let safe_name = if safe_name.is_empty() { "note".to_string() } else { safe_name };

            let mut lines = vec![note.content.clone()];
            for img in &note.imgs {
                lines.push(format!("\n![{}](data/images/{})", img, img));

                let img_path = state.paths.uploads_folder.join(img);
                if img_path.exists() {
                    if let Ok(data) = std::fs::read(&img_path) {
                        let _ = zip.start_file(format!("data/images/{}", img), options);
                        let _ = std::io::Write::write_all(&mut zip, &data);
                    }
                }
            }
            let content = lines.join("\n");
            let _ = zip.start_file(format!("data/{}.md", safe_name), options);
            let _ = std::io::Write::write_all(&mut zip, content.as_bytes());
        }
    }

    let bytes = buf.into_inner();
    let body = axum::body::Body::from(bytes);

    let response = axum::response::Response::builder()
        .status(200)
        .header(header::CONTENT_TYPE, "application/zip")
        .header(header::CONTENT_DISPOSITION, "attachment; filename=\"data.zip\"")
        .body(body)
        .unwrap();

    Ok(response)
}
