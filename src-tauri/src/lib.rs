mod config;
mod models;
mod db;
mod notes_file;
mod routes_notes;
mod routes_ai;
mod routes_export;
mod routes_serve;
mod routes_import;
mod ai_tools;
mod ai_stream;

use std::sync::Arc;
use axum::{
    extract::DefaultBodyLimit,
    routing::{get, post, put, delete},
    Router,
};
use tower_http::cors::{CorsLayer, Any};
use tauri::Manager;
use crate::db::AppState;

fn create_router(state: Arc<AppState>) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/api/notes", get(routes_notes::get_all_notes))
        .route("/api/notes/{someday}", get(routes_notes::get_notes_by_day))
        .route("/api/note/{title}", get(routes_notes::get_note_by_title))
        .route("/api/notes/search", get(routes_notes::search_notes_route))
        .route("/api/submit", post(routes_notes::submit_note))
        .route("/api/note/{title}", put(routes_notes::update_note_route))
        .route("/api/notes/delete", delete(routes_notes::delete_notes_route))
        .route("/api/ai/status", get(routes_ai::ai_status))
        .route("/api/ai", post(routes_ai::ai_chat_stream))
        .route("/api/ai/chat", get(routes_ai::get_ai_chat))
        .route("/api/ai/chat", post(routes_ai::save_ai_chat))
        .route("/api/ai/chat", delete(routes_ai::delete_ai_chat))
        .route("/api/ai/upload", post(routes_ai::upload_ai_image))
        .route("/api/export", get(routes_export::export_notes))
        .route("/api/import", post(routes_import::import_notes))
        .route("/uploads/images/{filename}", get(routes_serve::serve_image))
        .fallback(get(routes_serve::serve_static))
        .layer(cors)
        .layer(DefaultBodyLimit::max(50 * 1024 * 1024))
        .with_state(state)
}

#[tauri::command]
async fn save_export_file(path: Option<String>, data: Vec<u8>) -> Result<String, String> {
    let save_path = match path {
        Some(p) => std::path::PathBuf::from(p),
        None => {
            #[cfg(target_os = "android")]
            {
                let download = std::path::PathBuf::from("/storage/emulated/0/Download");
                tokio::fs::create_dir_all(&download)
                    .await
                    .map_err(|e| format!("创建目录失败: {}", e))?;
                download.join("notes.zip")
            }
            #[cfg(not(target_os = "android"))]
            {
                return Err("未指定保存路径".into());
            }
        }
    };
    tokio::fs::write(&save_path, &data)
        .await
        .map_err(|e| format!("保存失败: {}", e))?;
    Ok(save_path.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![save_export_file])
        .setup(move |app| {
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .build(),
            )?;

            let data_dir = if cfg!(all(not(target_os = "android"), not(target_os = "ios"))) {
                if cfg!(debug_assertions) {
                    config::find_project_root().join("data")
                } else {
                    let exe = std::env::current_exe().unwrap_or_default();
                    exe.parent().map_or_else(
                        || config::find_project_root().join("data"),
                        |p| p.join("data"),
                    )
                }
            } else {
                app.path().app_data_dir().unwrap_or_else(|e| {
                    eprintln!("[notes] app_data_dir() failed: {e}, falling back to '.'");
                    std::path::PathBuf::from(".")
                })
            };
            eprintln!("[notes] data_dir resolved to: {:?}", data_dir);
            let paths = config::AppPaths::with_data_dir(&data_dir);
            let state = Arc::new(AppState::new_with_paths(paths));
            let router = create_router(state);

            tauri::async_runtime::spawn(async move {
                let listener = tokio::net::TcpListener::bind("127.0.0.1:5000").await.unwrap();
                log::info!("Axum server starting on http://127.0.0.1:5000");
                axum::serve(listener, router).await.unwrap();
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
