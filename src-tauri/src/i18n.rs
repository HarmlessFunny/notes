use axum::extract::FromRequestParts;
use axum::http::request::Parts;

/// 按语言返回 zh/en 文案（非英文一律中文）
pub fn text(lang: &str, zh: &str, en: &str) -> String {
    if lang.eq_ignore_ascii_case("en") {
        en.to_string()
    } else {
        zh.to_string()
    }
}

/// 请求级语言提取器（X-Lang 头，默认 zh）
pub struct Lang(pub String);

impl Lang {
    pub fn t(&self, zh: &str, en: &str) -> String {
        text(&self.0, zh, en)
    }
}

impl<S> FromRequestParts<S> for Lang
where
    S: Send + Sync,
{
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let lang = parts
            .headers
            .get("x-lang")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("zh")
            .to_string();
        Ok(Lang(lang))
    }
}
