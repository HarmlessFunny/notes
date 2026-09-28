mod config;
mod models;
mod db;
mod i18n;
mod notes_file;
mod routes_notes;
mod routes_ai;
mod routes_export;
mod routes_serve;
mod routes_import;
mod ai_tools;
mod ai_stream;
mod export;

use std::sync::Arc;
use axum::{
    extract::DefaultBodyLimit,
    routing::{get, post, put, delete},
    Router,
};
use tower_http::cors::{CorsLayer, Any};
use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};
use crate::db::AppState;

/// 探测目录能否创建并写入（只读盘、磁盘满、无权限都会失败）。
/// 日志目录和数据目录都靠它决定是否需要回退，避免应用"能启动但功能不可用"。
fn dir_is_usable(dir: &std::path::Path) -> bool {
    if std::fs::create_dir_all(dir).is_err() {
        return false;
    }
    let probe = dir.join(".write-probe");
    match std::fs::write(&probe, b"") {
        Ok(()) => {
            let _ = std::fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

/// 把文件或整个目录复制到目标位置（用于旧数据目录迁移）
fn copy_recursively(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    if src.is_dir() {
        std::fs::create_dir_all(dst)?;
        for entry in std::fs::read_dir(src)? {
            let entry = entry?;
            copy_recursively(&entry.path(), &dst.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        if let Some(parent) = dst.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(src, dst).map(|_| ())
    }
}

/// 旧版本把数据放在可执行文件同级目录，Linux 上该位置通常只读。
/// 迁移到标准 app_data_dir 时把已有数据一并搬过去，避免用户笔记丢失。
fn migrate_legacy_data_dir(legacy: &std::path::Path, target: &std::path::Path) {
    if !legacy.is_dir() || target.join("database.json").exists() {
        return;
    }
    if std::fs::rename(legacy, target).is_ok() {
        eprintln!("[notes] migrated data dir: {:?} -> {:?}", legacy, target);
        return;
    }
    match copy_recursively(legacy, target) {
        Ok(()) => {
            let _ = std::fs::remove_dir_all(legacy);
            eprintln!("[notes] migrated data dir (copy): {:?} -> {:?}", legacy, target);
        }
        Err(e) => eprintln!("[notes] data dir migration failed: {e} (from {:?})", legacy),
    }
}

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
        .route("/api/note/{title}", delete(routes_notes::delete_note_route))
        .route("/api/ai/status", get(routes_ai::ai_status))
        .route("/api/ai", post(routes_ai::ai_chat_stream))
        .route("/api/ai/sessions", get(routes_ai::get_ai_sessions))
        .route("/api/ai/sessions", post(routes_ai::create_ai_session))
        .route("/api/ai/sessions/{session_id}", delete(routes_ai::delete_ai_session))
        .route("/api/ai/sessions/{session_id}", put(routes_ai::rename_ai_session))
        .route("/api/ai/sessions/{session_id}", get(routes_ai::get_ai_session_messages))
        .route("/api/ai/sessions/{session_id}", post(routes_ai::save_ai_session_messages))
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
async fn export_notes(
    #[cfg_attr(not(target_os = "android"), allow(unused_variables))] app: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    titles: Vec<String>,
    path: Option<String>,
    lang: Option<String>,
) -> Result<String, String> {
    let lang = lang.unwrap_or_else(|| "zh".to_string());
    let notes = state.fetch_notes_by_titles(&titles, &lang)
        .map_err(|e| format!("{}: {}", crate::i18n::text(&lang, "查询笔记失败", "Failed to query notes"), e))?;
    if notes.is_empty() {
        return Err(crate::i18n::text(&lang, "未找到要导出的笔记", "No notes found to export"));
    }

    let zip_bytes = crate::export::build_export_zip(&notes, &state.paths, &lang)?;

    let save_path = match path {
        Some(p) => std::path::PathBuf::from(p),
        None => {
            #[cfg(target_os = "android")]
            {
                let cache_dir = app
                    .path()
                    .app_cache_dir()
                    .map_err(|e| format!("{}: {}", crate::i18n::text(&lang, "获取缓存目录失败", "Failed to get cache directory"), e))?;
                let export_dir = cache_dir.join("export");
                tokio::fs::create_dir_all(&export_dir)
                    .await
                    .map_err(|e| format!("{}: {}", crate::i18n::text(&lang, "创建导出目录失败", "Failed to create export directory"), e))?;
                export_dir.join("notes.zip")
            }
            #[cfg(not(target_os = "android"))]
            {
                return Err(crate::i18n::text(&lang, "未指定保存路径", "No save path specified"));
            }
        }
    };
    tokio::fs::write(&save_path, &zip_bytes)
        .await
        .map_err(|e| format!("{}: {}", crate::i18n::text(&lang, "保存失败", "Save failed"), e))?;
    Ok(save_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn save_export_file(path: Option<String>, data: Vec<u8>, lang: Option<String>) -> Result<String, String> {
    let lang = lang.unwrap_or_else(|| "zh".to_string());
    let save_path = match path {
        Some(p) => std::path::PathBuf::from(p),
        None => {
            #[cfg(target_os = "android")]
            {
                let download = std::path::PathBuf::from("/storage/emulated/0/Download");
                tokio::fs::create_dir_all(&download)
                    .await
                    .map_err(|e| format!("{}: {}", crate::i18n::text(&lang, "创建目录失败", "Failed to create directory"), e))?;
                download.join("notes.zip")
            }
            #[cfg(not(target_os = "android"))]
            {
                return Err(crate::i18n::text(&lang, "未指定保存路径", "No save path specified"));
            }
        }
    };
    tokio::fs::write(&save_path, &data)
        .await
        .map_err(|e| format!("{}: {}", crate::i18n::text(&lang, "保存失败", "Save failed"), e))?;
    Ok(save_path.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_sharekit::init())
        .invoke_handler(tauri::generate_handler![save_export_file, export_notes])
        .setup(move |app| {
            // 日志插件默认同时写 app_log_dir() 和 stdout，写不进日志目录会让 setup 失败退出。
            // 先探测可写性：可写则显式只写文件，不可写则降级为仅 stdout。
            // 注意: Builder::target() 是追加而非替换，必须用 clear_targets() 清掉默认 target。
            let log_level = log::LevelFilter::Info;
            let log_target = match app.path().app_log_dir() {
                Ok(dir) if dir_is_usable(&dir) => {
                    Target::new(TargetKind::LogDir { file_name: None })
                }
                Ok(dir) => {
                    eprintln!(
                        "[notes] log dir not writable ({:?}), falling back to stdout-only logging",
                        dir
                    );
                    Target::new(TargetKind::Stdout)
                }
                Err(e) => {
                    eprintln!(
                        "[notes] app_log_dir() failed: {e}, falling back to stdout-only logging"
                    );
                    Target::new(TargetKind::Stdout)
                }
            };
            app.handle().plugin(
                tauri_plugin_log::Builder::new()
                    .level(log_level)
                    .clear_targets()
                    .target(log_target)
                    .build(),
            )?;

            // 统一使用各平台标准的应用数据目录（Windows: %APPDATA%，
            // Linux: $XDG_DATA_HOME，Android/iOS: 应用私有目录）。
            // 若该目录不可写（只读 HOME、容器只读挂载等），回退到临时目录并明确告警，
            // 否则应用会"能启动但数据层完全不可用"，故障难以察觉。
            let is_desktop = cfg!(all(not(target_os = "android"), not(target_os = "ios")));
            let mut data_dir = match app.path().app_data_dir() {
                Ok(dir) => dir,
                Err(e) => {
                    eprintln!("[notes] app_data_dir() failed: {e}, falling back to '.'");
                    std::path::PathBuf::from(".")
                }
            };
            if !dir_is_usable(&data_dir) {
                let fallback = std::env::temp_dir().join("notes");
                eprintln!(
                    "[notes] WARNING: data dir {:?} is not writable, falling back to {:?}. \
                     Data will not be persisted across reboots!",
                    data_dir, fallback
                );
                data_dir = fallback;
            }
            if is_desktop {
                if let Some(legacy) = std::env::current_exe()
                    .ok()
                    .and_then(|exe| exe.parent().map(|p| p.join("data")))
                {
                    migrate_legacy_data_dir(&legacy, &data_dir);
                }
            }
            eprintln!("[notes] data_dir resolved to: {:?}", data_dir);
            let paths = config::AppPaths::with_data_dir(&data_dir);
            let state = Arc::new(AppState::new_with_paths(paths));
            app.manage(state.clone());
            let router = create_router(state);

            tauri::async_runtime::spawn(async move {
                match tokio::net::TcpListener::bind("127.0.0.1:5000").await {
                    Ok(listener) => {
                        log::info!("Axum server starting on http://127.0.0.1:5000");
                        if let Err(e) = axum::serve(listener, router).await {
                            eprintln!("[notes] axum server stopped: {e}");
                        }
                    }
                    Err(e) => eprintln!(
                        "[notes] failed to bind 127.0.0.1:5000: {e} (port already in use?)"
                    ),
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
