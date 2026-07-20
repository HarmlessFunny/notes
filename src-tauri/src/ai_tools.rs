use std::sync::Arc;
use serde_json::{json, Value};

use crate::db::AppState;
use crate::notes_file;

pub fn get_tool_definitions() -> Vec<Value> {
    vec![
        json!({
            "type": "function",
            "function": {
                "name": "fetch_note_by_title",
                "description": "根据标题获取单篇笔记的详细内容",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string", "description": "笔记标题"}
                    },
                    "required": ["title"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "fetch_all_notes",
                "description": "获取所有笔记的标题、科目列表（如果想查看详细内容，调用fetch_note_by_title工具）",
                "parameters": {"type": "object", "properties": {}}
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "fetch_notes_by_day",
                "description": "根据时间戳获取某一天需要复习的笔记",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "someday": {"type": "string", "description": "毫秒级时间戳（13位）"}
                    },
                    "required": ["someday"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "search_notes",
                "description": "根据关键词搜索笔记",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "keyword": {"type": "string", "description": "搜索关键词"}
                    },
                    "required": ["keyword"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "add_note",
                "description": "添加新笔记到数据库",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string", "description": "笔记标题"},
                        "subject": {"type": "string", "description": "笔记科目"},
                        "content": {"type": "string", "description": "笔记内容"}
                    },
                    "required": ["title", "subject", "content"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "delete_notes",
                "description": "根据标题列表批量删除笔记",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "titles": {"type": "array", "items": {"type": "string"}, "description": "笔记标题数组"}
                    },
                    "required": ["titles"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "update_note",
                "description": "更新单篇笔记",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "old_title": {"type": "string", "description": "当前标题"},
                        "new_title": {"type": "string", "description": "新标题"},
                        "subject": {"type": "string", "description": "科目"},
                        "content": {"type": "string", "description": "内容"},
                        "append_content": {"type": "boolean", "description": "是否追加到现有内容后（false 则覆盖）"}
                    },
                    "required": ["old_title", "new_title", "subject", "content"]
                }
            }
        }),
    ]
}

pub async fn execute_tool(state: &Arc<AppState>, name: &str, args: &Value) -> Value {
    match name {
        "fetch_note_by_title" => {
            let title = args["title"].as_str().unwrap_or("");
            match state.fetch_notes_by_titles(&[title.to_string()]) {
                Ok(mut notes) if !notes.is_empty() => {
                    json!({"status": "success", "note": notes.remove(0)})
                }
                _ => json!({"status": "error", "message": "笔记不存在"}),
            }
        }
        "fetch_all_notes" => {
            match state.fetch_all_notes() {
                Ok(notes) => json!({"status": "success", "notes": notes}),
                Err(e) => json!({"status": "error", "message": e}),
            }
        }
        "fetch_notes_by_day" => {
            let someday = args["someday"].as_str().unwrap_or("");
            match state.fetch_notes_by_day(someday) {
                Ok(notes) => json!({"status": "success", "notes": notes}),
                Err(e) => json!({"status": "error", "message": e}),
            }
        }
        "search_notes" => {
            let keyword = args["keyword"].as_str().unwrap_or("");
            match state.search_notes(keyword).await {
                Ok(notes) => json!({"status": "success", "notes": notes}),
                Err(e) => json!({"status": "error", "message": e}),
            }
        }
        "add_note" => {
            let title = args["title"].as_str().unwrap_or("");
            let subject = args["subject"].as_str().unwrap_or("");
            let content = args["content"].as_str().unwrap_or("");
            let ts = format!("{}", chrono::Utc::now().timestamp_millis());
            match state.add_note(title, subject, content, &ts, &[]).await {
                Ok(()) => json!({"status": "success", "message": "笔记已添加"}),
                Err(e) => json!({"status": "error", "message": e}),
            }
        }
        "delete_notes" => {
            let titles: Vec<String> = args["titles"].as_array()
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                .unwrap_or_default();
            match state.delete_notes(&titles).await {
                Ok(count) => json!({"status": "success", "message": format!("已删除 {} 篇笔记", count)}),
                Err(e) => json!({"status": "error", "message": e}),
            }
        }
        "update_note" => {
            let old_title = args["old_title"].as_str().unwrap_or("");
            let new_title = args["new_title"].as_str().unwrap_or("");
            let subject = args["subject"].as_str().unwrap_or("");
            let content = args["content"].as_str().unwrap_or("");
            let append_content = args["append_content"].as_bool().unwrap_or(false);
            let images: Vec<String> = args["images"].as_array()
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                .unwrap_or_else(|| {
                    notes_file::read_note_imgs(&state.paths, old_title)
                });
            match state.update_note(old_title, new_title, subject, content, &images, append_content).await {
                Ok(()) => json!({"status": "success", "message": "笔记已更新"}),
                Err(e) => json!({"status": "error", "message": e}),
            }
        }
        _ => json!({"status": "error", "message": format!("未知工具: {}", name)}),
    }
}
