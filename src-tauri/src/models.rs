use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteMeta {
    pub title: String,
    pub subject: String,
    pub time: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Database {
    pub notes: Vec<NoteMeta>,
    pub ai_chat: Vec<ChatMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub title: String,
    pub subject: String,
    pub time: String,
    pub content: String,
    pub imgs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LightNote {
    pub title: String,
    pub subject: String,
    pub time: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: serde_json::Value,
}

#[derive(Debug, Serialize, Default)]
pub struct ApiResponse<T = ()> {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<Vec<LightNote>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<Note>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub messages: Option<Vec<ChatMessage>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_available: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vision_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub urls: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_count: Option<usize>,
}

impl ApiResponse<()> {
    pub fn success() -> Self {
        Self { status: "success".into(), message: None, data: None, notes: None, note: None, messages: None, ai_available: None, vision_enabled: None, urls: None, deleted_count: None }
    }

    pub fn success_msg(message: &str) -> Self {
        Self { status: "success".into(), message: Some(message.into()), data: None, notes: None, note: None, messages: None, ai_available: None, vision_enabled: None, urls: None, deleted_count: None }
    }

    pub fn error(message: &str) -> Self {
        Self { status: "error".into(), message: Some(message.into()), data: None, notes: None, note: None, messages: None, ai_available: None, vision_enabled: None, urls: None, deleted_count: None }
    }

    pub fn with_notes(notes: Vec<LightNote>) -> Self {
        Self { status: "success".into(), message: None, data: None, notes: Some(notes), note: None, messages: None, ai_available: None, vision_enabled: None, urls: None, deleted_count: None }
    }

    pub fn with_note(note: Note) -> Self {
        Self { status: "success".into(), message: None, data: None, notes: None, note: Some(note), messages: None, ai_available: None, vision_enabled: None, urls: None, deleted_count: None }
    }

    pub fn with_messages(messages: Vec<ChatMessage>) -> Self {
        Self { status: "success".into(), message: None, data: None, notes: None, note: None, messages: Some(messages), ai_available: None, vision_enabled: None, urls: None, deleted_count: None }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiConfig {
    pub api_key: String,
    pub base_url: String,
    pub model_name: String,
    pub vision_enabled: bool,
    pub response_format: Option<String>,
    pub reasoning_effort: Option<String>,
}

impl AiConfig {
    pub fn from_headers(headers: &axum::http::HeaderMap) -> Self {
        let get_header = |key: &str| -> String {
            headers.get(key).and_then(|v| v.to_str().ok()).unwrap_or("").to_string()
        };
        let get_opt = |key: &str| -> Option<String> {
            headers.get(key).and_then(|v| v.to_str().ok()).filter(|s| !s.is_empty()).map(String::from)
        };
        let vision = get_header("X-Vision-Enabled");
        Self {
            api_key: get_header("X-Chat-Api-Key"),
            base_url: get_header("X-Chat-Base-Url"),
            model_name: get_header("X-Chat-Model-Name"),
            vision_enabled: !(vision.eq_ignore_ascii_case("false") || vision == "0" || vision.eq_ignore_ascii_case("no")),
            response_format: get_opt("X-Response-Format"),
            reasoning_effort: get_opt("X-Reasoning-Effort"),
        }
    }

    pub fn is_valid(&self) -> bool {
        !self.api_key.is_empty() && !self.base_url.is_empty() && !self.model_name.is_empty()
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SseEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_json: Option<String>,
}


