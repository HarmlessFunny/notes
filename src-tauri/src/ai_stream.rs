use std::convert::Infallible;
use std::sync::Arc;
use axum::response::sse::Event;
use futures::stream::Stream;
use reqwest::Client;
use serde_json::{json, Value};
use tokio_stream::StreamExt;

use base64::Engine;

use crate::ai_tools;
use crate::db::AppState;
use crate::models::{AiConfig, ChatMessage, SseEvent};

fn make_event(event: &SseEvent) -> Result<Event, Infallible> {
    let data = serde_json::to_string(event).unwrap_or_default();
    Ok(Event::default().data(data))
}

fn build_openai_body(
    config: &AiConfig,
    messages: &[Value],
    tools: &[Value],
) -> Value {
    let mut body = json!({
        "model": config.model_name,
        "messages": messages,
        "stream": true,
        "stream_options": {"include_usage": true}
    });
    if !tools.is_empty() {
        body["tools"] = json!(tools);
    }
    if let Some(rf) = &config.response_format {
        if rf == "json_object" {
            body["response_format"] = json!({"type": "json_object"});
        }
    }
    if let Some(re) = &config.reasoning_effort {
        body["reasoning_effort"] = json!(re);
    }
    body
}

fn convert_image_to_base64(uploads_dir: &std::path::Path, url: &str) -> String {
    let filename = std::path::Path::new(url).file_name()
        .and_then(|n| n.to_str()).unwrap_or("");
    let img_path = uploads_dir.join(filename);
    let data = match std::fs::read(&img_path) {
        Ok(d) => d,
        Err(_) => return url.to_string(),
    };
    let ext = filename.rsplit('.').next().unwrap_or("png").to_lowercase();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "image/png",
    };
    let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
    format!("data:{};base64,{}", mime, b64)
}

fn prepare_messages(messages: &[ChatMessage], uploads_dir: &std::path::Path) -> Vec<Value> {
    messages.iter().map(|m| {
        match &m.content {
            Value::Array(parts) => {
                let converted: Vec<Value> = parts.iter().map(|part| {
                    if part.get("type").and_then(|t| t.as_str()) == Some("image_url") {
                        let mut p = part.clone();
                        if let Some(url) = p["image_url"]["url"].as_str() {
                            if url.starts_with("/uploads/images/") {
                                p["image_url"]["url"] = json!(convert_image_to_base64(uploads_dir, url));
                            }
                        }
                        p
                    } else {
                        part.clone()
                    }
                }).collect();
                json!({ "role": m.role, "content": converted })
            }
            _ => json!({ "role": m.role, "content": m.content }),
        }
    }).collect()
}

fn parse_sse_line(line: &str) -> Option<Value> {
    if !line.starts_with("data: ") {
        return None;
    }
    let data = &line[6..];
    if data == "[DONE]" {
        return None;
    }
    serde_json::from_str(data).ok()
}

pub fn stream_ai_chat(
    state: Arc<AppState>,
    config: AiConfig,
    messages: Vec<ChatMessage>,
) -> impl Stream<Item = Result<Event, Infallible>> {
    let stream = async_stream::stream! {
        let client = match Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .build()
        {
            Ok(c) => c,
            Err(e) => {
                yield make_event(&SseEvent {
                    event_type: "error".into(),
                    content: Some(format!("创建 HTTP 客户端失败: {}", e)),
                    raw_json: None,
                });
                return;
            }
        };

        let mut base_url = config.base_url.trim_end_matches('/').to_string();
        if !base_url.ends_with("/chat/completions") {
            base_url.push_str("/chat/completions");
        }

        let tools = ai_tools::get_tool_definitions();
        let system_msg = json!({
            "role": "system",
            "content": format!(
                "## 角色\n你是一个智能复习助手\n\n## 行为规范\n1. 使用中文回答用户的问题\n2. 调用add_note时禁止通过markdown引用图片\n\n## 可用格式\n- Markdown 语法\n- 数学公式：$行内$ 或 $$块级$$\n- 图片引用：<img src=\"/uploads/images/<图片名>\" />\n\n## 特殊说明\n- 如果用户想删除笔记，先向用户确认再执行删除\n- 今天的毫秒级时间戳是：{}",
                chrono::Utc::now().timestamp_millis()
            )
        });
        let mut current_messages: Vec<Value> = vec![system_msg];
        current_messages.extend(prepare_messages(&messages, &state.paths.uploads_folder));

        loop {
            let body = build_openai_body(&config, &current_messages, &tools);

            let response = match client
                .post(&base_url)
                .header("Authorization", format!("Bearer {}", config.api_key))
                .json(&body)
                .send()
                .await
            {
                Ok(r) => r,
                Err(e) => {
                    yield make_event(&SseEvent {
                        event_type: "error".into(),
                        content: Some(format!("请求失败: {}", e)),
                        raw_json: None,
                    });
                    return;
                }
            };

            if !response.status().is_success() {
                let status = response.status();
                let text = response.text().await.unwrap_or_default();
                yield make_event(&SseEvent {
                    event_type: "error".into(),
                    content: Some(format!("API 错误 ({}): {}", status, text)),
                    raw_json: None,
                });
                return;
            }

            let mut tool_calls: std::collections::HashMap<u32, Value> = std::collections::HashMap::new();

            let mut byte_stream = response.bytes_stream();
            let mut buffer = String::new();

            while let Some(chunk_result) = byte_stream.next().await {
                let chunk = match chunk_result {
                    Ok(c) => c,
                    Err(_) => break,
                };
                let text = String::from_utf8_lossy(&chunk);
                buffer.push_str(&text);

                while let Some(pos) = buffer.find('\n') {
                    let line = buffer[..pos].trim().to_string();
                    buffer = buffer[pos + 1..].to_string();
                    if line.is_empty() { continue; }

                    if let Some(data) = parse_sse_line(&line) {
                        let choices = match data["choices"].as_array() {
                            Some(c) if !c.is_empty() => c,
                            _ => continue,
                        };
                        let delta = &choices[0]["delta"];

                        if let Some(content) = delta["content"].as_str() {
                            yield make_event(&SseEvent {
                                event_type: "content".into(),
                                content: Some(content.to_string()),
                                raw_json: None,
                            });
                        }

                        if let Some(tcs) = delta["tool_calls"].as_array() {
                            for tc in tcs {
                                let idx = tc["index"].as_u64().unwrap_or(0) as u32;
                                let entry = tool_calls.entry(idx).or_insert_with(|| {
                                    json!({"id": "", "type": "function", "function": {"name": "", "arguments": ""}})
                                });
                                if let Some(id) = tc["id"].as_str() {
                                    if !id.is_empty() { entry["id"] = json!(id); }
                                }
                                if let Some(func) = tc["function"].as_object() {
                                    if let Some(name) = func.get("name").and_then(|v| v.as_str()) {
                                        let cur = entry["function"]["name"].as_str().unwrap_or("");
                                        entry["function"]["name"] = json!(format!("{}{}", cur, name));
                                    }
                                    if let Some(args) = func.get("arguments").and_then(|v| v.as_str()) {
                                        let cur = entry["function"]["arguments"].as_str().unwrap_or("");
                                        entry["function"]["arguments"] = json!(format!("{}{}", cur, args));
                                    }
                                }
                            }
                        }

                        if let Some(finish) = choices[0]["finish_reason"].as_str() {
                            if finish != "tool_calls" {
                                if tool_calls.is_empty() {
                                    yield make_event(&SseEvent {
                                        event_type: "done".into(), content: None, raw_json: None,
                                    });
                                }
                                return;
                            }
                        }
                    }
                }
            }

            if tool_calls.is_empty() {
                yield make_event(&SseEvent {
                    event_type: "done".into(), content: None, raw_json: None,
                });
                return;
            }

            let assistant_tc: Vec<Value> = tool_calls.values().map(|tc| json!({
                "id": tc["id"],
                "type": tc["type"],
                "function": {
                    "name": tc["function"]["name"],
                    "arguments": tc["function"]["arguments"]
                }
            })).collect();

            current_messages.push(json!({
                "role": "assistant",
                "content": null,
                "tool_calls": assistant_tc
            }));

            for tc in tool_calls.values() {
                let func_name = tc["function"]["name"].as_str().unwrap_or("");
                let args_str = tc["function"]["arguments"].as_str().unwrap_or("{}");
                let args: Value = serde_json::from_str(args_str).unwrap_or(json!({}));
                let result = ai_tools::execute_tool(&state, func_name, &args).await;
                current_messages.push(json!({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": serde_json::to_string(&result).unwrap_or_default()
                }));
            }
        }
    };

    stream
}
