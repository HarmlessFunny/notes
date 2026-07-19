use std::sync::Arc;
use tokio::sync::RwLock;

use crate::config::{AppPaths, REVIEW_INTERVAL_DAYS};
use crate::models::{Database, NoteMeta, LightNote, Note, ChatMessage};
use crate::notes_file;

pub struct AppState {
    pub paths: AppPaths,
    pub content_cache: Arc<RwLock<std::collections::HashMap<String, String>>>,
}

impl AppState {
    pub fn new_with_paths(paths: AppPaths) -> Self {
        let content_cache = Arc::new(RwLock::new(std::collections::HashMap::new()));
        let state = Self { paths, content_cache };
        state.init_dirs();
        state
    }

    fn init_dirs(&self) {
        if let Err(e) = std::fs::create_dir_all(&self.paths.notes_folder) {
            eprintln!("[notes] create notes_folder failed: {e} (path: {:?})", self.paths.notes_folder);
        }
        if let Err(e) = std::fs::create_dir_all(&self.paths.uploads_folder) {
            eprintln!("[notes] create uploads_folder failed: {e} (path: {:?})", self.paths.uploads_folder);
        }
        if !self.paths.db_file.exists() {
            let db = Database { notes: vec![], ai_chat: vec![] };
            match serde_json::to_string_pretty(&db) {
                Ok(json) => {
                    if let Err(e) = std::fs::write(&self.paths.db_file, json) {
                        eprintln!("[notes] write database.json failed: {e} (path: {:?})", self.paths.db_file);
                    }
                }
                Err(e) => eprintln!("[notes] serialize database.json failed: {e}"),
            }
        }
        // No contention during initialization, safe sync refresh
        if let Ok(db) = self.load_database_raw() {
            let mut cache = std::collections::HashMap::new();
            for note in &db.notes {
                cache.insert(note.title.clone(), notes_file::read_note_file(&self.paths, &note.title));
            }
            if let Ok(mut lock) = self.content_cache.try_write() {
                *lock = cache;
            }
        }
    }

    pub(crate) async fn refresh_cache(&self) {
        if let Ok(db) = self.load_database_raw() {
            let mut cache = std::collections::HashMap::new();
            for note in &db.notes {
                cache.insert(note.title.clone(), notes_file::read_note_file(&self.paths, &note.title));
            }
            let mut lock = self.content_cache.write().await;
            *lock = cache;
        }
    }

    pub fn load_database_raw(&self) -> Result<Database, String> {
        let data = std::fs::read_to_string(&self.paths.db_file).map_err(|e| format!("读取数据库失败: {} (路径: {})", e, self.paths.db_file.display()))?;
        let mut db: Database = serde_json::from_str(&data).map_err(|e| format!("解析数据库失败: {}", e))?;
        if db.ai_chat.is_empty() {
            db.ai_chat = vec![];
        }
        Ok(db)
    }

    pub fn save_database_raw(&self, db: &Database) -> Result<(), String> {
        let json = serde_json::to_string_pretty(db).map_err(|e| format!("序列化数据库失败: {}", e))?;
        std::fs::write(&self.paths.db_file, json).map_err(|e| format!("写入数据库失败: {}", e))
    }

    fn days_difference(later: &str, earlier: &str) -> i32 {
        let later_sec = later.parse::<i64>().unwrap_or(i64::MAX) / 1000;
        let earlier_sec = earlier.parse::<i64>().unwrap_or(0) / 1000;
        let later_date = chrono::DateTime::from_timestamp(later_sec, 0)
            .map(|dt| dt.date_naive())
            .unwrap_or_default();
        let earlier_date = chrono::DateTime::from_timestamp(earlier_sec, 0)
            .map(|dt| dt.date_naive())
            .unwrap_or_default();
        (later_date - earlier_date).num_days() as i32
    }

    fn validate_title(title: &str) -> Option<String> {
        if title.trim().is_empty() {
            return Some("标题不能为空".into());
        }
        let illegal: &[char] = &['\\', '/', ':', '*', '?', '"', '<', '>', '|'];
        if title.contains(illegal) {
            return Some("标题不能包含以下字符：\\ / : * ? \" < > |".into());
        }
        if title.len() > 200 {
            return Some("标题过长（最多 200 字符）".into());
        }
        None
    }

    pub fn fetch_all_notes(&self) -> Result<Vec<LightNote>, String> {
        let db = self.load_database_raw()?;
        Ok(db.notes.iter().map(|n| LightNote {
            title: n.title.clone(),
            subject: n.subject.clone(),
            time: n.time.clone(),
        }).collect())
    }

    pub fn fetch_notes_by_day(&self, someday: &str) -> Result<Vec<LightNote>, String> {
        let db = self.load_database_raw()?;
        let diffs: Vec<i32> = REVIEW_INTERVAL_DAYS.to_vec();
        let filtered: Vec<LightNote> = db.notes.iter()
            .filter(|n| diffs.contains(&Self::days_difference(someday, &n.time)))
            .map(|n| LightNote {
                title: n.title.clone(),
                subject: n.subject.clone(),
                time: n.time.clone(),
            })
            .collect();
        Ok(filtered)
    }

    pub fn fetch_notes_by_titles(&self, titles: &[String]) -> Result<Vec<Note>, String> {
        let db = self.load_database_raw()?;
        let title_set: std::collections::HashSet<String> = titles.iter().cloned().collect();
        let mut result = Vec::new();
        for meta in &db.notes {
            if title_set.contains(&meta.title) {
                let content = notes_file::read_note_file(&self.paths, &meta.title);
                let imgs = notes_file::read_note_imgs(&self.paths, &meta.title);
                result.push(Note {
                    title: meta.title.clone(),
                    subject: meta.subject.clone(),
                    time: meta.time.clone(),
                    content,
                    imgs,
                });
            }
        }
        Ok(result)
    }

    pub async fn search_notes(&self, keyword: &str) -> Result<Vec<LightNote>, String> {
        if keyword.trim().is_empty() {
            return Ok(vec![]);
        }
        let db = self.load_database_raw()?;
        let q = keyword.trim().to_lowercase();
        let cache = self.content_cache.read().await;
        let mut matched = Vec::new();
        for meta in &db.notes {
            if meta.title.to_lowercase().contains(&q) || meta.subject.to_lowercase().contains(&q) {
                matched.push(LightNote {
                    title: meta.title.clone(),
                    subject: meta.subject.clone(),
                    time: meta.time.clone(),
                });
            } else if let Some(content) = cache.get(&meta.title) {
                if content.to_lowercase().contains(&q) {
                    matched.push(LightNote {
                        title: meta.title.clone(),
                        subject: meta.subject.clone(),
                        time: meta.time.clone(),
                    });
                }
            }
        }
        Ok(matched)
    }

    pub async fn add_note(&self, title: &str, subject: &str, content: &str, timestamp: &str, imgs: &[String]) -> Result<(), String> {
        if let Some(err) = Self::validate_title(title) {
            return Err(err);
        }
        let ts = if timestamp.is_empty() {
            format!("{}", chrono::Utc::now().timestamp_millis())
        } else {
            timestamp.to_string()
        };

        let mut db = self.load_database_raw()?;
        if db.notes.iter().any(|n| n.title == title) {
            return Err(format!("标题「{}」已存在，请更换标题", title));
        }

        db.notes.push(NoteMeta {
            title: title.to_string(),
            subject: subject.to_string(),
            time: ts,
        });
        self.save_database_raw(&db)?;
        notes_file::save_note_file(&self.paths, title, subject, content, imgs)?;

        let mut cache = self.content_cache.write().await;
        cache.insert(title.to_string(), notes_file::strip_md_content(content));
        Ok(())
    }

    pub async fn update_note(&self, old_title: &str, new_title: &str, subject: &str, content: &str, imgs: &[String]) -> Result<(), String> {
        if let Some(err) = Self::validate_title(new_title) {
            return Err(err);
        }

        let mut db = self.load_database_raw()?;
        let idx = db.notes.iter().position(|n| n.title == old_title)
            .ok_or_else(|| "笔记不存在".to_string())?;

        if new_title != old_title && db.notes.iter().enumerate().any(|(i, n)| n.title == new_title && i != idx) {
            return Err(format!("标题「{}」已存在，请更换标题", new_title));
        }

        db.notes[idx].title = new_title.to_string();
        db.notes[idx].subject = subject.to_string();
        self.save_database_raw(&db)?;

        notes_file::save_note_file(&self.paths, new_title, subject, content, imgs)?;

        let mut cache = self.content_cache.write().await;
        if new_title != old_title {
            cache.remove(old_title);
            let _ = std::fs::remove_file(self.paths.notes_folder.join(format!("{}.md", old_title)));
        }
        cache.insert(new_title.to_string(), notes_file::strip_md_content(content));
        Ok(())
    }

    pub async fn delete_notes(&self, titles: &[String]) -> Result<usize, String> {
        if titles.is_empty() {
            return Err("标题列表不能为空".into());
        }
        let mut db = self.load_database_raw()?;
        let title_set: std::collections::HashSet<String> = titles.iter().cloned().collect();

        let to_delete: Vec<NoteMeta> = db.notes.iter()
            .filter(|n| title_set.contains(&n.title))
            .cloned()
            .collect();

        for note in &to_delete {
            let mut cache = self.content_cache.write().await;
            cache.remove(&note.title);
            let imgs = notes_file::read_note_imgs(&self.paths, &note.title);
            for img in &imgs {
                let img_path = self.paths.uploads_folder.join(img);
                let _ = std::fs::remove_file(img_path);
            }
            let md_path = self.paths.notes_folder.join(format!("{}.md", note.title));
            let _ = std::fs::remove_file(md_path);
        }

        db.notes.retain(|n| !title_set.contains(&n.title));
        self.save_database_raw(&db)?;
        self.refresh_cache().await;
        Ok(to_delete.len())
    }

    pub fn fetch_ai_chat(&self) -> Result<Vec<ChatMessage>, String> {
        let db = self.load_database_raw()?;
        Ok(db.ai_chat)
    }

    pub fn save_ai_chat(&self, messages: &[ChatMessage]) -> Result<(), String> {
        let mut db = self.load_database_raw()?;
        db.ai_chat = messages.to_vec();
        self.save_database_raw(&db)
    }

    pub fn delete_ai_chat(&self) -> Result<(), String> {
        let mut db = self.load_database_raw()?;
        db.ai_chat = vec![];
        self.save_database_raw(&db)
    }
}
