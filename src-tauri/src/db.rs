use std::sync::Arc;
use tokio::sync::RwLock;

use crate::config::{AppPaths, REVIEW_INTERVAL_DAYS};
use crate::models::{Database, NoteMeta, LightNote, Note, ChatMessage, AiSession, AiSessionIndex};
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
        if let Err(e) = std::fs::create_dir_all(&self.paths.ai_sessions_folder) {
            eprintln!("[notes] create ai_sessions_folder failed: {e} (path: {:?})", self.paths.ai_sessions_folder);
        }
        if !self.paths.db_file.exists() {
            let db = Database { notes: vec![] };
            match serde_json::to_string_pretty(&db) {
                Ok(json) => {
                    if let Err(e) = std::fs::write(&self.paths.db_file, json) {
                        eprintln!("[notes] write database.json failed: {e} (path: {:?})", self.paths.db_file);
                    }
                }
                Err(e) => eprintln!("[notes] serialize database.json failed: {e}"),
            }
        }
        self.migrate_legacy_ai_chat();
        self.migrate_legacy_ai_chat_sessions();
        // No contention during initialization, safe sync refresh
        if let Ok(db) = self.load_database_raw("zh") {
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
        if let Ok(db) = self.load_database_raw("zh") {
            let mut cache = std::collections::HashMap::new();
            for note in &db.notes {
                cache.insert(note.title.clone(), notes_file::read_note_file(&self.paths, &note.title));
            }
            let mut lock = self.content_cache.write().await;
            *lock = cache;
        }
    }

    pub fn load_database_raw(&self, lang: &str) -> Result<Database, String> {
        let data = std::fs::read_to_string(&self.paths.db_file).map_err(|e| crate::i18n::text(lang, "读取数据库失败: {} (路径: {})", "Failed to read the database: {} (path: {})").replace("{}", &e.to_string()).replace("{}", &self.paths.db_file.display().to_string()))?;
        let db: Database = serde_json::from_str(&data).map_err(|e| crate::i18n::text(lang, "解析数据库失败: {}", "Failed to parse the database: {}").replace("{}", &e.to_string()))?;
        Ok(db)
    }

    pub fn save_database_raw(&self, db: &Database, lang: &str) -> Result<(), String> {
        let json = serde_json::to_string_pretty(db).map_err(|e| crate::i18n::text(lang, "序列化数据库失败: {}", "Failed to serialize the database: {}").replace("{}", &e.to_string()))?;
        std::fs::write(&self.paths.db_file, json).map_err(|e| crate::i18n::text(lang, "写入数据库失败: {}", "Failed to write the database: {}").replace("{}", &e.to_string()))
    }

    fn migrate_legacy_ai_chat(&self) {
        if self.paths.ai_chat_file.exists() {
            return;
        }
        let Ok(data) = std::fs::read_to_string(&self.paths.db_file) else {
            return;
        };
        let Ok(mut root) = serde_json::from_str::<serde_json::Value>(&data) else {
            return;
        };
        let ai_chat = root.get("ai_chat").cloned().unwrap_or_else(|| serde_json::json!([]));
        let json = match serde_json::to_string_pretty(&ai_chat) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("[notes] serialize ai_chat.json failed: {e}");
                return;
            }
        };
        if let Err(e) = std::fs::write(&self.paths.ai_chat_file, json) {
            eprintln!("[notes] write ai_chat.json failed: {e}");
            return;
        }
        if root.get("ai_chat").is_some() {
            if let Some(obj) = root.as_object_mut() {
                obj.remove("ai_chat");
            }
            match serde_json::to_string_pretty(&root) {
                Ok(db_json) => {
                    if let Err(e) = std::fs::write(&self.paths.db_file, db_json) {
                        eprintln!("[notes] rewrite database.json failed: {e}");
                    }
                }
                Err(e) => eprintln!("[notes] serialize database.json failed: {e}"),
            }
        }
    }

    fn migrate_legacy_ai_chat_sessions(&self) {
        if !self.paths.ai_chat_file.exists() {
            return;
        }
        if self.load_session_index("zh").map(|i| !i.sessions.is_empty()).unwrap_or(false) {
            return;
        }
        let Ok(data) = std::fs::read_to_string(&self.paths.ai_chat_file) else {
            return;
        };
        let Ok(messages) = serde_json::from_str::<Vec<ChatMessage>>(&data) else {
            return;
        };
        if let Ok(_) = self.create_ai_session_empty("zh") {
            if let Ok(sessions) = self.load_session_index("zh") {
                if let Some(first) = sessions.sessions.iter().find(|s| s.title.is_empty()).cloned() {
                    let _ = self.save_ai_session_messages(&first.id, &messages, "zh");
                }
            }
        }
        let _ = std::fs::remove_file(&self.paths.ai_chat_file);
    }

    // ===== AI 多会话（ai_sessions/）=====

    fn sessions_index_path(&self) -> std::path::PathBuf {
        self.paths.ai_sessions_folder.join("index.json")
    }

    fn load_session_index(&self, lang: &str) -> Result<AiSessionIndex, String> {
        let path = self.sessions_index_path();
        if !path.exists() {
            return Ok(AiSessionIndex::default());
        }
        let data = std::fs::read_to_string(&path).map_err(|e| crate::i18n::text(lang, "读取 AI 会话失败: {} (路径: {})", "Failed to read AI sessions: {} (path: {})").replace("{}", &e.to_string()).replace("{}", &path.display().to_string()))?;
        serde_json::from_str(&data).map_err(|e| crate::i18n::text(lang, "解析 AI 会话失败: {}", "Failed to parse AI sessions: {}").replace("{}", &e.to_string()))
    }

    fn save_session_index(&self, index: &AiSessionIndex, lang: &str) -> Result<(), String> {
        let json = serde_json::to_string_pretty(index).map_err(|e| crate::i18n::text(lang, "序列化 AI 会话失败: {}", "Failed to serialize AI sessions: {}").replace("{}", &e.to_string()))?;
        std::fs::write(self.sessions_index_path(), json).map_err(|e| crate::i18n::text(lang, "写入 AI 会话失败: {} (路径: {})", "Failed to write AI sessions: {} (path: {})").replace("{}", &e.to_string()).replace("{}", &self.sessions_index_path().display().to_string()))
    }

    fn session_file(&self, id: &str) -> std::path::PathBuf {
        self.paths.ai_sessions_folder.join(format!("{id}.json"))
    }

    fn now_ms() -> i64 {
        chrono::Utc::now().timestamp_millis()
    }

    pub fn list_ai_sessions(&self, lang: &str) -> Result<Vec<AiSession>, String> {
        let mut sessions = self.load_session_index(lang)?.sessions;
        for s in &mut sessions {
            let path = self.session_file(&s.id);
            let count = std::fs::read_to_string(&path).ok()
                .and_then(|data| serde_json::from_str::<Vec<serde_json::Value>>(&data).ok())
                .map(|arr| arr.len())
                .unwrap_or(0);
            s.message_count = Some(count);
        }
        sessions.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        Ok(sessions)
    }

    fn create_ai_session_empty(&self, lang: &str) -> Result<AiSession, String> {
        let id = uuid::Uuid::new_v4().simple().to_string();
        let now = Self::now_ms();
        let session = AiSession { id: id.clone(), title: String::new(), created_at: now, updated_at: now, message_count: Some(0) };
        std::fs::write(self.session_file(&id), "[]").map_err(|e| crate::i18n::text(lang, "创建 AI 会话失败: {}", "Failed to create AI session: {}").replace("{}", &e.to_string()))?;
        let mut index = self.load_session_index(lang)?;
        index.sessions.push(session.clone());
        self.save_session_index(&index, lang)?;
        Ok(session)
    }

    pub fn create_ai_session(&self, lang: &str) -> Result<AiSession, String> {
        self.create_ai_session_empty(lang)
    }

    pub fn delete_ai_session(&self, id: &str, lang: &str) -> Result<(), String> {
        let mut index = self.load_session_index(lang)?;
        index.sessions.retain(|s| s.id != id);
        self.save_session_index(&index, lang)?;
        let _ = std::fs::remove_file(self.session_file(id));
        Ok(())
    }

    pub fn rename_ai_session(&self, id: &str, title: &str, lang: &str) -> Result<(), String> {
        let mut index = self.load_session_index(lang)?;
        let Some(session) = index.sessions.iter_mut().find(|s| s.id == id) else {
            return Err(crate::i18n::text(lang, "会话不存在", "Session not found"));
        };
        let title = title.trim();
        if title.is_empty() {
            return Err(crate::i18n::text(lang, "会话标题不能为空", "Session title cannot be empty"));
        }
        session.title = title.chars().take(100).collect();
        self.save_session_index(&index, lang)
    }

    pub fn fetch_ai_session_messages(&self, id: &str, lang: &str) -> Result<Vec<ChatMessage>, String> {
        let path = self.session_file(id);
        if !path.exists() {
            return Err(crate::i18n::text(lang, "会话不存在", "Session not found"));
        }
        let data = std::fs::read_to_string(&path).map_err(|e| crate::i18n::text(lang, "读取 AI 聊天失败: {} (路径: {})", "Failed to read AI chat history: {} (path: {})").replace("{}", &e.to_string()).replace("{}", &path.display().to_string()))?;
        serde_json::from_str(&data).map_err(|e| crate::i18n::text(lang, "解析 AI 聊天失败: {}", "Failed to parse AI chat history: {}").replace("{}", &e.to_string()))
    }

    pub fn save_ai_session_messages(&self, id: &str, messages: &[ChatMessage], lang: &str) -> Result<(), String> {
        let path = self.session_file(id);
        let json = serde_json::to_string_pretty(messages).map_err(|e| crate::i18n::text(lang, "序列化 AI 聊天失败: {}", "Failed to serialize AI chat history: {}").replace("{}", &e.to_string()))?;
        std::fs::write(&path, json).map_err(|e| crate::i18n::text(lang, "写入 AI 聊天失败: {} (路径: {})", "Failed to write AI chat history: {} (path: {})").replace("{}", &e.to_string()).replace("{}", &path.display().to_string()))?;
        let mut index = self.load_session_index(lang)?;
        if let Some(s) = index.sessions.iter_mut().find(|s| s.id == id) {
            s.updated_at = Self::now_ms();
            self.save_session_index(&index, lang)?;
        }
        Ok(())
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

    fn validate_title(title: &str, lang: &str) -> Option<String> {
        if title.trim().is_empty() {
            return Some(crate::i18n::text(lang, "标题不能为空", "Title cannot be empty"));
        }
        let illegal: &[char] = &['\\', '/', ':', '*', '?', '"', '<', '>', '|'];
        if title.contains(illegal) {
            return Some(crate::i18n::text(lang, "标题不能包含以下字符：\\ / : * ? \" < > |", "Title cannot contain: \\ / : * ? \" < > |"));
        }
        if title.len() > 200 {
            return Some(crate::i18n::text(lang, "标题过长（最多 200 字符）", "Title is too long (max 200 characters)"));
        }
        None
    }

    pub fn fetch_all_notes(&self, lang: &str) -> Result<Vec<LightNote>, String> {
        let db = self.load_database_raw(lang)?;
        Ok(db.notes.iter().map(|n| LightNote {
            title: n.title.clone(),
            subject: n.subject.clone(),
            time: n.time.clone(),
        }).collect())
    }

    pub fn fetch_notes_by_day(&self, someday: &str, lang: &str) -> Result<Vec<LightNote>, String> {
        let db = self.load_database_raw(lang)?;
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

    pub fn fetch_notes_by_titles(&self, titles: &[String], lang: &str) -> Result<Vec<Note>, String> {
        let db = self.load_database_raw(lang)?;
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

    pub async fn search_notes(&self, keyword: &str, lang: &str) -> Result<Vec<LightNote>, String> {
        if keyword.trim().is_empty() {
            return Ok(vec![]);
        }
        let db = self.load_database_raw(lang)?;
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

    pub async fn add_note(&self, title: &str, subject: &str, content: &str, timestamp: &str, imgs: &[String], lang: &str) -> Result<(), String> {
        if let Some(err) = Self::validate_title(title, lang) {
            return Err(err);
        }
        let ts = if timestamp.is_empty() {
            format!("{}", chrono::Utc::now().timestamp_millis())
        } else {
            timestamp.to_string()
        };

        let mut db = self.load_database_raw(lang)?;
        if db.notes.iter().any(|n| n.title == title) {
            return Err(crate::i18n::text(lang, "标题「{}」已存在，请更换标题", "A note titled \"{}\" already exists, please pick another title").replace("{}", title));
        }

        db.notes.push(NoteMeta {
            title: title.to_string(),
            subject: subject.to_string(),
            time: ts,
        });
        self.save_database_raw(&db, lang)?;
        notes_file::save_note_file(&self.paths, title, subject, content, imgs, lang)?;

        let mut cache = self.content_cache.write().await;
        cache.insert(title.to_string(), notes_file::strip_md_content(content));
        Ok(())
    }

    pub async fn update_note(&self, old_title: &str, new_title: &str, subject: &str, content: &str, imgs: &[String], lang: &str) -> Result<(), String> {
        if let Some(err) = Self::validate_title(new_title, lang) {
            return Err(err);
        }

        let mut db = self.load_database_raw(lang)?;
        let idx = db.notes.iter().position(|n| n.title == old_title)
            .ok_or_else(|| crate::i18n::text(lang, "笔记不存在", "Note not found"))?;

        if new_title != old_title && db.notes.iter().enumerate().any(|(i, n)| n.title == new_title && i != idx) {
            return Err(crate::i18n::text(lang, "标题「{}」已存在，请更换标题", "A note titled \"{}\" already exists, please pick another title").replace("{}", new_title));
        }

        db.notes[idx].title = new_title.to_string();
        db.notes[idx].subject = subject.to_string();
        self.save_database_raw(&db, lang)?;

        notes_file::save_note_file(&self.paths, new_title, subject, content, imgs, lang)?;

        let mut cache = self.content_cache.write().await;
        if new_title != old_title {
            cache.remove(old_title);
            let _ = std::fs::remove_file(self.paths.notes_folder.join(format!("{}.md", old_title)));
        }
        cache.insert(new_title.to_string(), notes_file::strip_md_content(content));
        Ok(())
    }

    pub async fn delete_note(&self, title: &str, lang: &str) -> Result<(), String> {
        if title.trim().is_empty() {
            return Err(crate::i18n::text(lang, "标题不能为空", "Title cannot be empty"));
        }
        let mut db = self.load_database_raw(lang)?;
        let idx = db.notes.iter().position(|n| n.title == title)
            .ok_or_else(|| crate::i18n::text(lang, "笔记不存在", "Note not found"))?;

        let mut cache = self.content_cache.write().await;
        cache.remove(title);
        let imgs = notes_file::read_note_imgs(&self.paths, title);
        for img in &imgs {
            let img_path = self.paths.uploads_folder.join(img);
            let _ = std::fs::remove_file(img_path);
        }
        let md_path = self.paths.notes_folder.join(format!("{}.md", title));
        let _ = std::fs::remove_file(md_path);

        db.notes.remove(idx);
        self.save_database_raw(&db, lang)?;
        drop(cache);
        self.refresh_cache().await;
        Ok(())
    }
}
