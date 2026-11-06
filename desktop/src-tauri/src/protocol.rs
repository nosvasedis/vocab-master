//! The app's pages over the `app` scheme (https://app.localhost/ in WebView2): the live copy of a file when
//! there is one (live.rs), else the one inside the exe. Every answer is cross-origin isolated (COOP + COEP
//! "credentialless") so the natural-voice engine (Kokoro, WebAssembly) can use several threads while pictures
//! and clips still load from R2 without cookies. Print jobs (pdf.rs) are served once from memory.
use crate::live::Source;
use std::borrow::Cow;
use tauri::http::{Request, Response};
use tauri::{AppHandle, Manager};

pub const SCHEME: &str = "app";

/// https://app.localhost/<path> — what the `app` scheme is called inside WebView2 (use_https_scheme).
pub fn app_url(path: &str) -> url::Url {
    url::Url::parse(&format!("https://{SCHEME}.localhost/{}", path.trim_start_matches('/'))).unwrap()
}

/// Is this one of the app's own page addresses?
pub fn is_app_url(u: &url::Url) -> bool {
    (u.scheme() == "https" || u.scheme() == "http") && u.host_str() == Some("app.localhost") || u.scheme() == SCHEME
}

pub fn mime(path: &str) -> &'static str {
    let ext = path.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase()).unwrap_or_default();
    match ext.as_str() {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "webmanifest" => "application/manifest+json; charset=utf-8",
        "png" => "image/png",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "ogg" | "opus" => "audio/ogg",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "wasm" => "application/wasm",
        "zip" => "application/zip",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "txt" => "text/plain; charset=utf-8",
        "onnx" | "bin" => "application/octet-stream",
        _ => "application/octet-stream",
    }
}

fn text(status: u16, body: &'static str) -> Response<Cow<'static, [u8]>> {
    Response::builder().status(status).header("content-type", "text/plain; charset=utf-8").body(Cow::Borrowed(body.as_bytes())).unwrap()
}

/// Request path → page-relative path ("js/main.js"), or None when it tries to leave the pages.
pub fn rel_path(raw: &str) -> Option<String> {
    let decoded = percent_encoding::percent_decode_str(raw).decode_utf8().ok()?;
    let mut rel = decoded.trim_start_matches(['/', '\\']).replace('\\', "/");
    if rel.is_empty() {
        rel = "index.html".into();
    }
    if rel.split('/').any(|seg| seg == ".." || seg == "." || seg.contains(':')) {
        return None;
    }
    Some(rel)
}

pub fn handle(app: &AppHandle, request: &Request<Vec<u8>>) -> Response<Cow<'static, [u8]>> {
    let Some(rel) = rel_path(request.uri().path()) else { return text(403, "Forbidden") };
    let (data, ty): (Cow<'static, [u8]>, &str) = if let Some(id) = rel.strip_prefix("__print/") {
        match app.state::<crate::pdf::PrintJobs>().0.lock().unwrap().get(id) {
            Some(html) => (Cow::Owned(html.clone().into_bytes()), "text/html; charset=utf-8"),
            None => return text(404, "Not found"),
        }
    } else {
        let live = &app.state::<crate::AppState>().live;
        let data = match live.resolve(&rel) {
            Source::Disk(p) => std::fs::read(&p).ok().map(Cow::Owned),
            Source::Bundle(r) => crate::assets::get(&r),
            Source::Missing => None,
        };
        match data {
            Some(d) => (d, mime(&rel)),
            None => return text(404, "Not found"),
        }
    };
    Response::builder()
        .status(200)
        .header("content-type", ty)
        .header("cross-origin-opener-policy", "same-origin")
        .header("cross-origin-embedder-policy", "credentialless")
        .header("cache-control", "no-cache")
        .body(data)
        .unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn paths() {
        assert_eq!(rel_path("/").as_deref(), Some("index.html"));
        assert_eq!(rel_path("/js/main.js").as_deref(), Some("js/main.js"));
        assert_eq!(rel_path("/assets/a%20b.png").as_deref(), Some("assets/a b.png"));
        assert_eq!(rel_path("/../secret"), None);
        assert_eq!(rel_path("/js/%2e%2e/x"), None);
        assert_eq!(rel_path("/C:/Windows"), None);
        assert_eq!(mime("vendor/x.wasm"), "application/wasm");
    }
    #[test]
    fn urls() {
        assert_eq!(app_url("index.html").as_str(), "https://app.localhost/index.html");
        assert!(is_app_url(&app_url("x")));
        assert!(!is_app_url(&url::Url::parse("https://example.com/").unwrap()));
    }
}
