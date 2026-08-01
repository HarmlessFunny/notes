use std::convert::Infallible;
use std::sync::Arc;
use axum::response::sse::Event;
use futures::stream::Stream;
use reqwest::Client;
use serde_json::{json, Value};

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
        match re.as_str() {
            "disabled" => {
                body["thinking"] = json!({"type": "disabled"});
            }
            "low" => {
                body["thinking"] = json!({"type": "enabled"});
                body["reasoning_effort"] = json!("low");
            }
            "medium" => {
                body["thinking"] = json!({"type": "enabled"});
                body["reasoning_effort"] = json!("medium");
            }
            "high" => {
                body["thinking"] = json!({"type": "enabled"});
                body["reasoning_effort"] = json!("high");
            }
            "xhigh" => {
                body["thinking"] = json!({"type": "enabled"});
                body["reasoning_effort"] = json!("xhigh");
            }
            "max" => {
                body["thinking"] = json!({"type": "enabled"});
                body["reasoning_effort"] = json!("max");
            }
            _ => {
                body["thinking"] = json!({"type": "enabled"});
            }
        }
    }
    body
}

fn build_tool_summary(result: &Value) -> String {
    if result["status"].as_str() != Some("success") {
        return result["message"].as_str().unwrap_or("工具执行失败").to_string();
    }
    if let Some(m) = result["message"].as_str() {
        return m.to_string();
    }
    if let Some(notes) = result["notes"].as_array() {
        return format!("获取到 {} 篇笔记", notes.len());
    }
    if let Some(title) = result["note"]["title"].as_str() {
        return format!("获取笔记「{}」", title);
    }
    "执行成功".to_string()
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
        let mut current_messages: Vec<Value> = prepare_messages(&messages, &state.paths.uploads_folder);
        let mut round: u32 = 0;
        let mut prev_round_had_content = false;

        loop {
            round += 1;
            let mut round_content = String::new();
            let mut first_content_in_round = true;
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

            use tokio_stream::StreamExt;
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
                            if first_content_in_round && !content.is_empty() {
                                first_content_in_round = false;
                                if prev_round_had_content && !content.starts_with('\n') {
                                    yield make_event(&SseEvent {
                                        event_type: "content".into(),
                                        content: Some("\n".to_string()),
                                        raw_json: None,
                                    });
                                }
                            }
                            round_content.push_str(content);
                            yield make_event(&SseEvent {
                                event_type: "content".into(),
                                content: Some(content.to_string()),
                                raw_json: None,
                            });
                        }

                        if let Some(rc) = delta["reasoning_content"].as_str() {
                            yield make_event(&SseEvent {
                                event_type: "thinking".into(),
                                content: Some(rc.to_string()),
                                raw_json: None,
                            });
                        } else if let Some(t) = delta["thinking"].as_str() {
                            yield make_event(&SseEvent {
                                event_type: "thinking".into(),
                                content: Some(t.to_string()),
                                raw_json: None,
                            });
                        } else if let Some(rs) = delta["reasoning_summary"].as_str() {
                            yield make_event(&SseEvent {
                                event_type: "thinking".into(),
                                content: Some(rs.to_string()),
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

            prev_round_had_content = !round_content.is_empty();
            current_messages.push(json!({
                "role": "assistant",
                "content": if round_content.is_empty() { Value::Null } else { json!(round_content) },
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
                yield make_event(&SseEvent {
                    event_type: "tool".into(),
                    content: Some(json!({
                        "name": func_name,
                        "arguments": args,
                        "success": result["status"].as_str() == Some("success"),
                        "summary": build_tool_summary(&result),
                        "round": round
                    }).to_string()),
                    raw_json: None,
                });
            }
        }
    };

    stream
}
