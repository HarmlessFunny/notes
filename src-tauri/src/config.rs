use std::path::PathBuf;

pub struct AppPaths {
    pub db_file: PathBuf,
    pub notes_folder: PathBuf,
    pub uploads_folder: PathBuf,
    pub dist_folder: PathBuf,
}

pub const REVIEW_INTERVAL_DAYS: &[i32] = &[0, 1, 2, 4, 7, 15, 30, 60, 120, 240];

pub fn find_project_root() -> PathBuf {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir.parent().unwrap().to_path_buf()
}

impl AppPaths {
    pub fn with_data_dir(base: &std::path::Path) -> Self {
        let dist_folder = if cfg!(debug_assertions) {
            find_project_root().join("dist")
        } else {
            base.join("dist")
        };
        Self {
            db_file: base.join("database.json"),
            notes_folder: base.join("notes"),
            uploads_folder: base.join("uploads").join("images"),
            dist_folder,
        }
    }
}
