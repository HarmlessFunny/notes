use std::sync::Arc;
use std::path::PathBuf;
use axum::{
    body::Body,
    extract::{Path, State},
    http::{Response, Uri},
};
use crate::db::AppState;

pub async fn serve_image(
    State(state): State<Arc<AppState>>,
    Path(filename): Path<String>,
) -> Response<Body> {
    let user_path = state.paths.uploads_folder.join(&filename);
    if user_path.exists() {
        return serve_file(&user_path).await;
    }
    let dist_path = state.paths.dist_folder.join("uploads").join("images").join(&filename);
    if dist_path.exists() {
        return serve_file(&dist_path).await;
    }
    let body = serde_json::to_string(&crate::models::ApiResponse::error("图片不存在")).unwrap_or_default();
    Response::builder()
        .status(404)
        .header("content-type", "application/json")
        .body(Body::from(body))
        .unwrap()
}

async fn serve_file(path: &PathBuf) -> Response<Body> {
    match tokio::fs::read(path).await {
        Ok(data) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            Response::builder()
                .header("content-type", mime.as_ref())
                .body(Body::from(data))
                .unwrap()
        }
        Err(_) => Response::builder()
            .status(404)
            .body(Body::from("Not found"))
            .unwrap(),
    }
}

pub async fn serve_static(
    State(state): State<Arc<AppState>>,
    uri: Uri,
) -> Response<Body> {
    let path = uri.path().trim_start_matches('/');
    let file_path = state.paths.dist_folder.join(path);
    if path.is_empty() || !file_path.exists() || !file_path.is_file() {
        let index_path = state.paths.dist_folder.join("index.html");
        return serve_file(&index_path).await;
    }
    serve_file(&file_path).await
}
