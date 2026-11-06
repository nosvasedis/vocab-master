//! HTTPS from the app shell: the AI services (DeepSeek, Gemini) — the pages can't call them directly (CORS) —
//! and GitHub for updates. Bodies are read as whole bytes, then decoded: Greek letters split across chunks
//! stay intact.
use serde::Serialize;
use std::sync::OnceLock;
use std::time::Duration;

pub const DEEPSEEK_HOST: &str = "api.deepseek.com";
pub const GEMINI_HOST: &str = "generativelanguage.googleapis.com";
pub const MAX_REQUEST: Duration = Duration::from_secs(240);

pub fn client() -> &'static reqwest::Client {
    static C: OnceLock<reqwest::Client> = OnceLock::new();
    C.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent("VocabMaster")
            .connect_timeout(Duration::from_secs(30))
            .build()
            .expect("http client")
    })
}

#[derive(Serialize, Clone, Debug)]
pub struct ApiResponse {
    pub status: u16,
    pub body: String,
}

fn bad_gateway(msg: String) -> ApiResponse {
    ApiResponse { status: 502, body: serde_json::json!({ "error": msg }).to_string() }
}

/// One request to `https://{host}{path}`; network errors come back as status 502 with { error }.
pub async fn api_request(host: &str, method: &str, path: &str, headers: &[(&str, String)], body: Option<String>, timeout: Duration) -> ApiResponse {
    let url = format!("https://{host}{path}");
    let m = reqwest::Method::from_bytes(method.to_ascii_uppercase().as_bytes()).unwrap_or(reqwest::Method::GET);
    let mut req = client().request(m, &url).timeout(timeout).header("Accept", "application/json");
    for (k, v) in headers {
        req = req.header(*k, v);
    }
    if let Some(b) = body {
        req = req.header("Content-Type", "application/json").body(b);
    }
    match req.send().await {
        Ok(res) => {
            let status = res.status().as_u16();
            match res.bytes().await {
                Ok(bytes) => ApiResponse { status, body: String::from_utf8_lossy(&bytes).into_owned() },
                Err(e) => bad_gateway(e.to_string()),
            }
        }
        Err(e) => bad_gateway(if e.is_timeout() { "the request timed out".into() } else { e.to_string() }),
    }
}

pub async fn deepseek(method: &str, path: &str, auth: &str, body: Option<String>, timeout: Duration) -> ApiResponse {
    let headers: Vec<(&str, String)> = if auth.is_empty() { vec![] } else { vec![("Authorization", auth.to_string())] };
    api_request(DEEPSEEK_HOST, method, path, &headers, body, timeout).await
}

/// Only the model list, generateContent and interactions (studio voices) are reachable through this bridge.
pub fn gemini_path_ok(path: &str) -> bool {
    let Some(rest) = path.strip_prefix("/v1beta/") else { return false };
    if rest == "models" || rest == "interactions" {
        return true;
    }
    let Some(model) = rest.strip_prefix("models/").and_then(|r| r.strip_suffix(":generateContent")) else { return false };
    !model.is_empty() && model.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.' || c == '-')
}

pub async fn gemini(method: &str, path: &str, api_key: &str, body: Option<String>) -> ApiResponse {
    if !gemini_path_ok(path) {
        return ApiResponse { status: 400, body: serde_json::json!({ "error": { "message": "Unsupported Gemini path" } }).to_string() };
    }
    api_request(GEMINI_HOST, method, path, &[("x-goog-api-key", api_key.trim().to_string())], body, MAX_REQUEST).await
}

/// GET for the updaters (GitHub's API wants a User-Agent; redirects followed).
pub async fn https_get(url: &str, json: bool) -> Result<Vec<u8>, String> {
    let mut req = client().get(url).timeout(Duration::from_secs(30)).header("User-Agent", "VocabMaster-Updater");
    if json {
        req = req.header("Accept", "application/vnd.github+json");
    }
    let res = req.send().await.map_err(|e| if e.is_timeout() { "the request timed out".to_string() } else if e.is_connect() { "No internet connection (ECONN)".to_string() } else { e.to_string() })?;
    let status = res.status().as_u16();
    if status != 200 {
        return Err(if status == 403 || status == 429 { "GitHub is busy — the app will try again later.".into() } else { format!("HTTP {status}") });
    }
    res.bytes().await.map(|b| b.to_vec()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn gemini_paths() {
        assert!(gemini_path_ok("/v1beta/models"));
        assert!(gemini_path_ok("/v1beta/interactions"));
        assert!(gemini_path_ok("/v1beta/models/gemini-2.5-flash:generateContent"));
        assert!(!gemini_path_ok("/v1beta/models/x:streamGenerateContent"));
        assert!(!gemini_path_ok("/v1beta/files"));
        assert!(!gemini_path_ok("/v1beta/models/../files:generateContent"));
        assert!(!gemini_path_ok("/v1/models"));
    }
}
