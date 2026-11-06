//! ChatGPT plan usage for local apps (desktop/chatgpt.js, in Rust). OAuth and tokens stay in the app shell:
//! the pages only ever see account display data and generated JSON.
//! Protocol: https://developers.openai.com/siwc/token-sharing-open-source
//! No API key, private ChatGPT endpoints, or access to other apps' credentials.
use crate::loopback::{random_token, read_request, respond, same};
use base64::Engine;
use futures_util::future::BoxFuture;
use futures_util::stream::BoxStream;
use futures_util::StreamExt;
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub const ISSUER: &str = "https://auth.openai.com";
pub const RESOURCE: &str = "https://api.openai.com/v1";
const PLAN_SCOPE: &str = "chatgpt.tokens.use.direct";
pub const USAGE_URL: &str = "https://chatgpt.com/settings/usage";

/* ── Errors ─────────────────────────────────────────────────────────────── */

#[derive(Debug, Clone)]
pub struct CgError {
    pub code: String,
    pub message: String,
    pub status: u16,
    pub param: String,
}

fn fail(message: impl Into<String>, code: &str) -> CgError {
    CgError { code: code.into(), message: message.into(), status: 0, param: String::new() }
}
fn failc(message: impl Into<String>) -> CgError {
    fail(message, "chatgpt_error")
}

/// "sharing" followed later by "disabled" / "not_enabled" (the JS /sharing.*(disabled|not_enabled)/).
fn sharing_off(code: &str) -> bool {
    code.find("sharing").map(|i| {
        let rest = &code[i..];
        rest.contains("disabled") || rest.contains("not_enabled")
    }).unwrap_or(false)
}

/// The message a teacher sees for an error code (chatgptError in chatgpt.js).
pub fn friendly(code: &str, message: &str) -> String {
    if code.contains("usage_limit") || code.contains("sharing_usage_unavailable") {
        return "ChatGPT usage limit reached. Open Manage usage in Settings to review your plan or this app's limit.".into();
    }
    if sharing_off(code) || code.contains("insufficient_scope") || code.contains("sharing_permission") {
        return "ChatGPT plan usage is not enabled. Reconnect in Settings and allow this app to use your plan.".into();
    }
    if ["invalid_grant", "invalid_token", "session_expired", "unauthorized"].iter().any(|c| code.contains(c)) {
        return "Your ChatGPT session has expired. Reconnect in Settings.".into();
    }
    if ["unsupported_capability", "model_not_found", "model_not_available"].iter().any(|c| code.contains(c)) {
        return "This ChatGPT model or feature is unavailable. Refresh the models and choose another in Settings.".into();
    }
    if message.is_empty() { "Couldn't reach ChatGPT. Check your connection and try again.".into() } else { message.into() }
}

fn response_error(status: u16, request_id: &str, data: &Value) -> CgError {
    let error = data.get("error").filter(|e| !e.is_null());
    let code = error
        .and_then(|e| e.get("code")).and_then(|c| c.as_str()).filter(|c| !c.is_empty()).map(str::to_string)
        .or_else(|| data.get("code").and_then(|c| c.as_str()).filter(|c| !c.is_empty()).map(str::to_string))
        .or_else(|| error.and_then(|e| e.as_str()).map(str::to_string))
        .unwrap_or_else(|| if status == 401 { "unauthorized".into() } else { "chatgpt_error".into() });
    let detail = error.and_then(|e| e.get("message")).and_then(|m| m.as_str()).filter(|m| !m.is_empty()).map(str::to_string)
        .or_else(|| data.get("detail").and_then(|d| d.as_str()).map(str::to_string))
        .unwrap_or_default();
    let message = if detail.is_empty() { format!("ChatGPT rejected the request (HTTP {status}). Please try again.") } else { detail };
    let _ = request_id;
    CgError { message: friendly(&code, &message), code, status, param: error.and_then(|e| e.get("param")).and_then(|p| p.as_str()).unwrap_or("").into() }
}

/* ── Transport (reqwest in the app, a fake in the tests) ─────────────────── */

pub struct HttpReq {
    pub method: &'static str,
    pub url: String,
    pub headers: Vec<(&'static str, String)>,
    pub body: Option<String>,
    pub timeout: Duration,
}
pub struct HttpResp {
    pub status: u16,
    pub request_id: String,
    pub body: BoxStream<'static, Result<Vec<u8>, String>>,
}
impl HttpResp {
    async fn bytes(mut self) -> Result<Vec<u8>, String> {
        let mut out = Vec::new();
        while let Some(c) = self.body.next().await {
            out.extend_from_slice(&c?);
        }
        Ok(out)
    }
}
pub type Transport = Arc<dyn Fn(HttpReq) -> BoxFuture<'static, Result<HttpResp, String>> + Send + Sync>;

/// The real transport: no redirects (a redirect is an error, as fetch's redirect: "error").
pub fn reqwest_transport() -> Transport {
    let client = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).user_agent("VocabMaster").build().expect("client");
    Arc::new(move |req: HttpReq| {
        let client = client.clone();
        Box::pin(async move {
            let mut r = client.request(reqwest::Method::from_bytes(req.method.as_bytes()).unwrap(), &req.url).timeout(req.timeout);
            for (k, v) in req.headers {
                r = r.header(k, v);
            }
            if let Some(b) = req.body {
                r = r.body(b);
            }
            let res = r.send().await.map_err(|e| if e.is_timeout() { "timeout".to_string() } else { e.to_string() })?;
            if res.status().is_redirection() {
                return Err("redirect".into());
            }
            let status = res.status().as_u16();
            let request_id = res.headers().get("x-request-id").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
            let body = res.bytes_stream().map(|c| c.map(|b| b.to_vec()).map_err(|e| e.to_string())).boxed();
            Ok(HttpResp { status, request_id, body })
        })
    })
}

/* ── SSE ────────────────────────────────────────────────────────────────── */

/// Parse SSE across arbitrary UTF-8/chunk boundaries; partial output is never success.
pub async fn completed_text(mut body: BoxStream<'static, Result<Vec<u8>, String>>) -> Result<String, CgError> {
    let mut buffer: Vec<u8> = Vec::new();
    let mut text = String::new();
    let mut completed = false;
    let mut total = 0usize;
    fn event(frame: &[u8], text: &mut String, completed: &mut bool) -> Result<(), CgError> {
        let frame = String::from_utf8_lossy(frame);
        let raw = frame.split('\n').filter(|l| l.starts_with("data:")).map(|l| l[5..].trim_start()).collect::<Vec<_>>().join("\n");
        if raw.is_empty() || raw == "[DONE]" {
            return Ok(());
        }
        let e: Value = serde_json::from_str(&raw).map_err(|_| failc("ChatGPT sent an unreadable response. Please try again."))?;
        let ty = e.get("type").and_then(|t| t.as_str()).unwrap_or("");
        if ty == "response.failed" || ty == "error" {
            let err = e.pointer("/response/error").filter(|v| !v.is_null()).or_else(|| e.get("error").filter(|v| !v.is_null())).unwrap_or(&e);
            let code = err.get("code").and_then(|c| c.as_str()).unwrap_or("");
            let msg = err.get("message").and_then(|c| c.as_str()).unwrap_or("");
            return Err(fail(friendly(code, msg), if code.is_empty() { "chatgpt_error" } else { code }));
        }
        if ty == "response.incomplete" {
            return Err(failc("ChatGPT's reply was incomplete. Try fewer words or exercises."));
        }
        if ty == "response.refusal.delta" || ty == "response.refusal.done" {
            return Err(failc("ChatGPT could not complete this request. Review your word list and try again."));
        }
        if ty == "response.output_text.delta" {
            text.push_str(e.get("delta").and_then(|d| d.as_str()).unwrap_or(""));
        }
        if ty == "response.completed" {
            let status = e.pointer("/response/status").and_then(|s| s.as_str()).unwrap_or("");
            if !status.is_empty() && status != "completed" {
                return Err(failc("ChatGPT's reply was incomplete."));
            }
            let output = e.pointer("/response/output").and_then(|o| o.as_array()).cloned().unwrap_or_default();
            let contents: Vec<Value> = output.iter().flat_map(|o| o.get("content").and_then(|c| c.as_array()).cloned().unwrap_or_default()).collect();
            if contents.iter().any(|c| c.get("type").and_then(|t| t.as_str()) == Some("refusal")) {
                return Err(failc("ChatGPT could not complete this request."));
            }
            let fin: String = contents.iter().filter(|c| c.get("type").and_then(|t| t.as_str()) == Some("output_text")).map(|c| c.get("text").and_then(|t| t.as_str()).unwrap_or("")).collect();
            if !fin.is_empty() {
                *text = fin;
            }
            *completed = true;
        }
        Ok(())
    }
    'outer: while let Some(chunk) = body.next().await {
        let chunk = chunk.map_err(|_| failc("ChatGPT's connection ended before the reply completed. Please try again."))?;
        total += chunk.len();
        if total > 12 * 1024 * 1024 {
            return Err(failc("ChatGPT's reply was too large. Try fewer exercises."));
        }
        // "\r\n" → "\n" (JSON never carries a raw CR).
        buffer.extend(chunk.into_iter().filter(|b| *b != b'\r'));
        while let Some(i) = buffer.windows(2).position(|w| w == b"\n\n") {
            let frame: Vec<u8> = buffer.drain(..i + 2).collect();
            event(&frame[..i], &mut text, &mut completed)?;
            if completed {
                break 'outer;
            }
        }
    }
    if !completed && !String::from_utf8_lossy(&buffer).trim().is_empty() {
        event(&buffer.clone(), &mut text, &mut completed)?;
    }
    if !completed {
        return Err(failc("ChatGPT's connection ended before the reply completed. Please try again."));
    }
    if text.trim().is_empty() {
        return Err(failc("ChatGPT returned no text. Please try again."));
    }
    Ok(text)
}

/* ── The runtime ────────────────────────────────────────────────────────── */

pub type ReadState = Box<dyn Fn() -> Result<Option<Value>, String> + Send + Sync>;
pub type WriteState = Box<dyn Fn(&Value) -> Result<(), String> + Send + Sync>;
pub type Clock = Arc<dyn Fn() -> i64 + Send + Sync>;

struct Pending {
    id: u64,
    profile: Value,
    existing: bool,
    state: String,
    nonce: String,
    verifier: String,
    redirect_uri: String,
    epoch: u64,
    consumed: bool,
    stop: Option<tokio::sync::oneshot::Sender<()>>,
}

pub struct ChatGPT {
    read_state: ReadState,
    write_state: WriteState,
    http: Transport,
    now: Clock,
    login_timeout: Duration,
    request_timeout: Duration,
    state: Mutex<Value>,
    pending: Mutex<Option<Pending>>,
    next_tx: AtomicU64,
    last_error: Mutex<String>,
    epoch: tokio::sync::watch::Sender<u64>,
    jwks: Mutex<Option<(Vec<Value>, i64)>>,
    discovery: Mutex<Option<Value>>,
    catalogs: Mutex<HashMap<String, Vec<Value>>>,
    refresh_lock: tokio::sync::Mutex<()>,
}

fn sv(v: &Value, k: &str) -> String {
    v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string()
}
fn scopes_of(s: &str) -> Vec<Value> {
    s.split_whitespace().map(|x| json!(x)).collect()
}
fn sharing(p: &Value) -> bool {
    !sv(p, "accessToken").is_empty() && p.get("scopes").and_then(|s| s.as_array()).map(|a| a.iter().any(|x| x.as_str() == Some(PLAN_SCOPE))).unwrap_or(false)
}
fn b64url(data: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(data)
}
fn form(pairs: &[(&str, &str)]) -> String {
    let mut s = url::form_urlencoded::Serializer::new(String::new());
    for (k, v) in pairs {
        s.append_pair(k, v);
    }
    s.finish()
}

impl ChatGPT {
    pub fn new(read_state: ReadState, write_state: WriteState, http: Transport, now: Clock, login_timeout: Duration, request_timeout: Duration) -> Result<Arc<Self>, CgError> {
        let mut state = read_state().map_err(|e| failc(e))?.unwrap_or_else(|| json!({ "profiles": [] }));
        if !state.get("profiles").map(|p| p.is_array()).unwrap_or(false) {
            state["profiles"] = json!([]);
        }
        Ok(Arc::new(ChatGPT {
            read_state,
            write_state,
            http,
            now,
            login_timeout,
            request_timeout,
            state: Mutex::new(state),
            pending: Mutex::new(None),
            next_tx: AtomicU64::new(1),
            last_error: Mutex::new(String::new()),
            epoch: tokio::sync::watch::channel(0).0,
            jwks: Mutex::new(None),
            discovery: Mutex::new(None),
            catalogs: Mutex::new(HashMap::new()),
            refresh_lock: tokio::sync::Mutex::new(()),
        }))
    }

    fn epoch(&self) -> u64 {
        *self.epoch.borrow()
    }

    fn active_id(&self) -> String {
        sv(&self.state.lock().unwrap(), "activeId")
    }

    fn profile(&self, id: &str) -> Option<Value> {
        self.state.lock().unwrap()["profiles"].as_array()?.iter().find(|p| sv(p, "id") == id).cloned()
    }
    fn active(&self) -> Option<Value> {
        self.profile(&self.active_id())
    }
    /// Change a stored profile in place.
    fn edit(&self, id: &str, f: impl FnOnce(&mut Map<String, Value>)) {
        let mut st = self.state.lock().unwrap();
        if let Some(arr) = st["profiles"].as_array_mut() {
            if let Some(Value::Object(p)) = arr.iter_mut().find(|p| sv(p, "id") == id) {
                f(p);
            }
        }
    }

    fn save(&self) -> Result<(), CgError> {
        let snapshot = self.state.lock().unwrap().clone();
        if (self.write_state)(&snapshot).is_err() {
            let fresh = (self.read_state)().ok().flatten().unwrap_or_else(|| json!({ "profiles": [] }));
            *self.state.lock().unwrap() = fresh;
            return Err(failc("Couldn't save your ChatGPT connection securely. Check available disk space and reconnect."));
        }
        Ok(())
    }

    pub fn status(&self) -> Value {
        let st = self.state.lock().unwrap().clone();
        let p = self.active();
        let models = p.as_ref().and_then(|p| self.catalogs.lock().unwrap().get(&sv(p, "id")).cloned()).unwrap_or_default();
        let profiles: Vec<Value> = st["profiles"].as_array().cloned().unwrap_or_default().iter().enumerate().map(|(i, a)| json!({
            "id": sv(a, "id"), "label": format!("Connection {}", i + 1), "email": sv(a, "email"),
            "connected": !sv(a, "accessToken").is_empty(), "sharing": sharing(a),
        })).collect();
        let pr = p.clone().unwrap_or(Value::Null);
        let model = sv(&pr, "model");
        json!({
            "profiles": profiles,
            "accountId": sv(&pr, "id"), "connected": !sv(&pr, "accessToken").is_empty(), "sharing": sharing(&pr),
            "model": model, "models": models.clone(),
            "ready": sharing(&pr) && models.iter().any(|m| sv(m, "slug") == model),
            "pending": self.pending.lock().unwrap().is_some(), "error": self.last_error.lock().unwrap().clone(),
            "welcome": pr.get("welcome").and_then(|w| w.as_bool()).unwrap_or(false),
        })
    }

    /// A request that the next invalidate() (account switch, sign-out, quit) cancels.
    async fn send(&self, req: HttpReq) -> Result<HttpResp, CgError> {
        let mut rx = self.epoch.subscribe();
        let start = *rx.borrow();
        let fut = (self.http)(req);
        tokio::select! {
            r = fut => r.map_err(|e| failc(if e == "timeout" { "ChatGPT request canceled or timed out. Please try again." } else { "Couldn't reach ChatGPT. Check your connection and try again." })),
            _ = async { loop { if rx.changed().await.is_err() || *rx.borrow() != start { break; } } } => Err(failc("ChatGPT request canceled or timed out. Please try again.")),
        }
    }

    fn req(&self, method: &'static str, url: &str, headers: Vec<(&'static str, String)>, body: Option<String>) -> HttpReq {
        let timeout = if url.ends_with("/responses") { self.request_timeout } else { self.request_timeout.min(Duration::from_secs(20)) };
        HttpReq { method, url: url.into(), headers, body, timeout }
    }

    async fn json_request(&self, req: HttpReq) -> Result<Value, CgError> {
        let res = self.send(req).await?;
        let (status, rid) = (res.status, res.request_id.clone());
        let bytes = res.bytes().await.map_err(|_| failc("ChatGPT sent an unreadable response."))?;
        let data: Value = serde_json::from_slice(&bytes).map_err(|_| failc("ChatGPT sent an unreadable response."))?;
        if !(200..300).contains(&status) {
            return Err(response_error(status, &rid, &data));
        }
        Ok(data)
    }

    async fn config(&self) -> Result<Value, CgError> {
        if let Some(d) = self.discovery.lock().unwrap().clone() {
            return Ok(d);
        }
        let d = self.json_request(self.req("GET", &format!("{ISSUER}/.well-known/openid-configuration"), vec![], None)).await?;
        let bad = || failc("ChatGPT's sign-in configuration could not be verified.");
        if sv(&d, "issuer") != ISSUER {
            return Err(bad());
        }
        for key in ["jwks_uri", "revocation_endpoint"] {
            let u = url::Url::parse(&sv(&d, key)).map_err(|_| bad())?;
            if u.origin().ascii_serialization() != ISSUER {
                return Err(bad());
            }
        }
        *self.discovery.lock().unwrap() = Some(d.clone());
        Ok(d)
    }

    /// Verify an ID token (RS256 / ES256 from the issuer's JWKS) and its claims.
    async fn identity(&self, token: &str, client_id: &str, nonce: Option<&str>) -> Result<Value, CgError> {
        self.identity_inner(token, client_id, nonce).await.map_err(|_| fail("ChatGPT's sign-in identity could not be verified. Please reconnect.", "invalid_identity"))
    }

    async fn identity_inner(&self, token: &str, client_id: &str, nonce: Option<&str>) -> Result<Value, ()> {
        let parts: Vec<&str> = token.split('.').collect();
        if parts.len() != 3 {
            return Err(());
        }
        let dec = |s: &str| base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(s.trim_end_matches('=')).map_err(|_| ());
        let header: Value = serde_json::from_slice(&dec(parts[0])?).map_err(|_| ())?;
        let claims: Value = serde_json::from_slice(&dec(parts[1])?).map_err(|_| ())?;
        let alg = sv(&header, "alg");
        let kid = sv(&header, "kid");
        if !(alg == "RS256" || alg == "ES256") || kid.is_empty() || header.get("crit").is_some() {
            return Err(());
        }
        let d = self.config().await.map_err(|_| ())?;
        let now = (self.now)();
        let cached = self.jwks.lock().unwrap().clone();
        let keys = match cached {
            Some((keys, until)) if until >= now && keys.iter().any(|k| sv(k, "kid") == kid) => keys,
            _ => {
                let data = self.json_request(self.req("GET", &sv(&d, "jwks_uri"), vec![], None)).await.map_err(|_| ())?;
                let keys = data.get("keys").and_then(|k| k.as_array()).cloned().unwrap_or_default();
                *self.jwks.lock().unwrap() = Some((keys.clone(), now + 3_600_000));
                keys
            }
        };
        let key = keys.iter().find(|k| {
            sv(k, "kid") == kid && (sv(k, "alg").is_empty() || sv(k, "alg") == alg) && (sv(k, "use").is_empty() || sv(k, "use") == "sig")
                && if alg == "RS256" { sv(k, "kty") == "RSA" } else { sv(k, "kty") == "EC" && sv(k, "crv") == "P-256" }
        }).ok_or(())?;
        let jwk: jsonwebtoken::jwk::Jwk = serde_json::from_value(key.clone()).map_err(|_| ())?;
        let dkey = jsonwebtoken::DecodingKey::from_jwk(&jwk).map_err(|_| ())?;
        let algorithm = if alg == "RS256" { jsonwebtoken::Algorithm::RS256 } else { jsonwebtoken::Algorithm::ES256 };
        let message = format!("{}.{}", parts[0], parts[1]);
        let sig_ok = jsonwebtoken::crypto::verify(parts[2], message.as_bytes(), &dkey, algorithm).map_err(|_| ())?;
        if !sig_ok {
            return Err(());
        }
        let aud: Vec<String> = match claims.get("aud") {
            Some(Value::Array(a)) => a.iter().map(|x| x.as_str().unwrap_or("").to_string()).collect(),
            Some(Value::String(s)) => vec![s.clone()],
            _ => vec![],
        };
        let azp = claims.get("azp").and_then(|a| a.as_str());
        let exp = claims.get("exp").and_then(|e| e.as_f64());
        let nbf = claims.get("nbf").and_then(|e| e.as_f64()).filter(|n| *n != 0.0);
        let now_s = now as f64 / 1000.0;
        let sub_ok = claims.get("sub").and_then(|s| s.as_str()).map(|s| !s.is_empty()).unwrap_or(false);
        if sv(&claims, "iss") != ISSUER
            || !aud.iter().any(|a| a == client_id)
            || (aud.len() > 1 && azp != Some(client_id))
            || azp.map(|a| !a.is_empty() && a != client_id).unwrap_or(false)
            || !sub_ok
            || exp.map(|e| !e.is_finite() || e <= now_s).unwrap_or(true)
            || nbf.map(|n| n > now_s + 60.0).unwrap_or(false)
            || nonce.map(|n| !claims.get("nonce").and_then(|c| c.as_str()).map(|c| same(c, n)).unwrap_or(false)).unwrap_or(false)
        {
            return Err(());
        }
        Ok(claims)
    }

    fn token_fields(&self, data: &Value, previous: &Value) -> Result<Map<String, Value>, CgError> {
        let access = sv(data, "access_token");
        let token_type = data.get("token_type").map(|t| t.as_str().map(str::to_string).unwrap_or_else(|| t.to_string())).unwrap_or_default();
        let expires_in = data.get("expires_in").and_then(|e| e.as_f64()).filter(|e| e.is_finite() && *e > 0.0);
        if access.is_empty() || token_type.to_lowercase() != "bearer" || expires_in.is_none() {
            return Err(failc("ChatGPT did not return a valid session. Please reconnect."));
        }
        let pick = |k: &str, prev: &str| { let v = sv(data, k); if v.is_empty() { sv(previous, prev) } else { v } };
        let mut m = Map::new();
        m.insert("accessToken".into(), json!(access));
        m.insert("refreshToken".into(), json!(pick("refresh_token", "refreshToken")));
        m.insert("idToken".into(), json!(pick("id_token", "idToken")));
        m.insert("expiresAt".into(), json!((self.now)() + (expires_in.unwrap() * 1000.0) as i64));
        m.insert("scopes".into(), match data.get("scope") {
            None => previous.get("scopes").cloned().unwrap_or(json!([])),
            Some(s) => Value::Array(scopes_of(s.as_str().unwrap_or(""))),
        });
        Ok(m)
    }

    /// Stop everything in flight (account switch, sign-out, quit).
    pub fn invalidate(&self) {
        self.epoch.send_modify(|e| *e += 1);
        self.cancel_sign_in();
    }

    pub fn cancel_sign_in(&self) {
        if let Some(mut p) = self.pending.lock().unwrap().take() {
            if let Some(stop) = p.stop.take() {
                let _ = stop.send(());
            }
        }
    }

    pub async fn start_sign_in(self: &Arc<Self>, profile_id: &str) -> Result<String, CgError> {
        if self.pending.lock().unwrap().is_some() {
            return Err(failc("A ChatGPT sign-in is already open. Finish it or cancel it first."));
        }
        *self.last_error.lock().unwrap() = String::new();
        let existing = if profile_id.is_empty() { None } else { self.profile(profile_id) };
        if !profile_id.is_empty() && existing.is_none() {
            return Err(failc("Choose a saved ChatGPT account or add a new account."));
        }
        if sv(&self.state.lock().unwrap(), "hostId").is_empty() {
            self.state.lock().unwrap()["hostId"] = json!(format!("urn:uuid:{}", uuid::Uuid::new_v4()));
            self.save()?;
        }
        let p = existing.clone().unwrap_or_else(|| json!({ "id": uuid::Uuid::new_v4().to_string(), "clientId": "", "model": "" }));
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0)).await.map_err(|_| failc("Couldn't open the local ChatGPT sign-in listener. Please try again."))?;
        let port = listener.local_addr().map_err(|_| failc("Couldn't open the local ChatGPT sign-in listener. Please try again."))?.port();
        let redirect_uri = format!("http://127.0.0.1:{port}/auth/chatgpt/callback");
        let (stop_tx, stop_rx) = tokio::sync::oneshot::channel();
        let id = self.next_tx.fetch_add(1, Ordering::SeqCst);
        let tx = Pending {
            id, profile: p.clone(), existing: existing.is_some(), state: random_token(32), nonce: random_token(32), verifier: random_token(64),
            redirect_uri: redirect_uri.clone(), epoch: self.epoch(), consumed: false, stop: Some(stop_tx),
        };
        let challenge = b64url(&Sha256::digest(tx.verifier.as_bytes()));
        let host_id = sv(&self.state.lock().unwrap(), "hostId");
        let client_id = sv(&p, "clientId");
        let scope = format!("openid profile email offline_access resource.invoke {PLAN_SCOPE}");
        let mut params: Vec<(&str, String)> = vec![
            ("client_id", if client_id.is_empty() { "dynamic_agent_client".into() } else { client_id.clone() }),
            ("ext_agent_host_id", host_id), ("response_type", "code".into()), ("redirect_uri", redirect_uri.clone()), ("scope", scope),
            ("resource", RESOURCE.into()), ("state", tx.state.clone()), ("nonce", tx.nonce.clone()),
            ("code_challenge_method", "S256".into()), ("code_challenge", challenge),
        ];
        if client_id.is_empty() {
            params.push(("agent_name_hint", "Vocab Master".into()));
        } else if !sv(&p, "idToken").is_empty() {
            params.push(("id_token_hint", sv(&p, "idToken")));
            if !sv(&p, "email").is_empty() {
                params.push(("login_hint", sv(&p, "email")));
            }
        }
        *self.pending.lock().unwrap() = Some(tx);
        let me = self.clone();
        tokio::spawn(async move { me.serve(listener, id, port, stop_rx).await });
        let refs: Vec<(&str, &str)> = params.iter().map(|(k, v)| (*k, v.as_str())).collect();
        Ok(format!("{ISSUER}/api/accounts/authorize?{}", form(&refs)))
    }

    fn pending_is(&self, id: u64) -> bool {
        self.pending.lock().unwrap().as_ref().map(|p| p.id == id).unwrap_or(false)
    }

    async fn serve(self: Arc<Self>, listener: tokio::net::TcpListener, id: u64, port: u16, mut stop: tokio::sync::oneshot::Receiver<()>) {
        let deadline = tokio::time::sleep(self.login_timeout);
        tokio::pin!(deadline);
        let headers: [(&str, &str); 3] = [("Cache-Control", "no-store"), ("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"), ("Referrer-Policy", "no-referrer")];
        let page = |m: &str| format!("<!doctype html><meta charset=\"utf-8\"><title>Vocab Master · ChatGPT</title><body style=\"font:18px system-ui;max-width:600px;margin:15vh auto;padding:24px\"><h1>Vocab Master</h1><p>{m}</p><p>You can close this tab and return to Vocab Master.</p></body>");
        loop {
            let mut stream = tokio::select! {
                _ = &mut stop => return,
                _ = &mut deadline => {
                    if self.pending_is(id) {
                        *self.last_error.lock().unwrap() = "ChatGPT sign-in timed out. Please try again.".into();
                        self.cancel_sign_in();
                    }
                    return;
                }
                acc = listener.accept() => match acc { Ok((s, _)) => s, Err(_) => continue },
            };
            let Some(req) = read_request(&mut stream).await else { continue };
            let reply = |code: u16, m: &str| (code, page(m));
            let host_ok = req.headers.get("host").map(|h| h == &format!("127.0.0.1:{port}")).unwrap_or(false);
            let url = url::Url::parse(&format!("http://127.0.0.1:{port}{}", req.target));
            let (code, body, done) = match url {
                Err(_) => { let (c, b) = reply(400, "This sign-in response is not valid."); (c, b, false) }
                Ok(url) => {
                    let q: Vec<(String, String)> = url.query_pairs().into_owned().collect();
                    let all = |k: &str| q.iter().filter(|(n, _)| n == k).map(|(_, v)| v.clone()).collect::<Vec<_>>();
                    let want_state = self.pending.lock().unwrap().as_ref().filter(|p| p.id == id).map(|p| p.state.clone());
                    if req.method != "GET" || !host_ok || url.path() != "/auth/chatgpt/callback" {
                        let (c, b) = reply(404, "Page not found."); (c, b, false)
                    } else if all("state").len() != 1 || !want_state.as_ref().map(|w| same(&all("state")[0], w)).unwrap_or(false) {
                        if want_state.is_none() { let (c, b) = reply(409, "This sign-in has already finished or was canceled."); (c, b, false) }
                        else { let (c, b) = reply(400, "This sign-in response is not valid. Return to the original sign-in tab."); (c, b, false) }
                    } else {
                        let consumed = {
                            let mut g = self.pending.lock().unwrap();
                            match g.as_mut().filter(|p| p.id == id) { Some(p) if !p.consumed => { p.consumed = true; false } _ => true }
                        };
                        if consumed {
                            let (c, b) = reply(409, "This sign-in has already finished or was canceled."); (c, b, false)
                        } else {
                            match self.finish_sign_in(id, &q).await {
                                Ok(sharing_on) => {
                                    let (c, b) = reply(200, if sharing_on { "You're connected to ChatGPT. Choose your model in Vocab Master Settings." } else { "You're signed in. Allow ChatGPT plan usage in Vocab Master Settings to enable AI requests." });
                                    (c, b, true)
                                }
                                Err(e) => {
                                    *self.last_error.lock().unwrap() = friendly(&e.code, &e.message);
                                    let (c, b) = reply(400, "Sign-in could not be completed. See Vocab Master Settings for details."); (c, b, true)
                                }
                            }
                        }
                    }
                }
            };
            respond(&mut stream, code, "text/html; charset=utf-8", &headers, &body).await;
            if done {
                if self.pending_is(id) {
                    self.cancel_sign_in();
                }
                return;
            }
        }
    }

    async fn finish_sign_in(&self, id: u64, q: &[(String, String)]) -> Result<bool, CgError> {
        let all = |k: &str| q.iter().filter(|(n, _)| n == k).map(|(_, v)| v.clone()).collect::<Vec<_>>();
        let (p, existing, verifier, redirect_uri, nonce, epoch) = {
            let g = self.pending.lock().unwrap();
            let t = g.as_ref().filter(|t| t.id == id).ok_or_else(|| failc("ChatGPT sign-in was canceled."))?;
            (t.profile.clone(), t.existing, t.verifier.clone(), t.redirect_uri.clone(), t.nonce.clone(), t.epoch)
        };
        if !all("error").is_empty() {
            return Err(failc("ChatGPT sign-in was declined or canceled. You can try again in Settings."));
        }
        let codes = all("code");
        let ids = all("client_id");
        let code = codes.first().cloned().unwrap_or_default();
        let client_id = ids.first().cloned().filter(|c| !c.is_empty()).unwrap_or_else(|| sv(&p, "clientId"));
        let id_ok = client_id.strip_prefix("oaiapp_").map(|r| !r.is_empty() && r.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')).unwrap_or(false);
        if codes.len() != 1 || ids.len() > 1 || code.is_empty() || !id_ok || (!sv(&p, "clientId").is_empty() && sv(&p, "clientId") != client_id) {
            return Err(failc("ChatGPT did not return a valid registration. Please try again."));
        }
        let pid = sv(&p, "id");
        // Preserve a new issued registration even if the subsequent exchange fails.
        if !existing {
            self.state.lock().unwrap()["profiles"].as_array_mut().unwrap().push(p.clone());
        }
        self.edit(&pid, |m| { m.insert("clientId".into(), json!(client_id)); });
        self.save()?;
        let body = form(&[("grant_type", "authorization_code"), ("client_id", &client_id), ("code", &code), ("code_verifier", &verifier), ("redirect_uri", &redirect_uri), ("resource", RESOURCE)]);
        let data = self.json_request(self.req("POST", &format!("{ISSUER}/api/accounts/oauth/token"), vec![("Content-Type", "application/x-www-form-urlencoded".into())], Some(body))).await?;
        if sv(&data, "id_token").is_empty() {
            return Err(failc("ChatGPT did not return a verified identity."));
        }
        let claims = self.identity(&sv(&data, "id_token"), &client_id, Some(&nonce)).await?;
        if existing && !sv(&p, "sub").is_empty() && sv(&p, "sub") != sv(&claims, "sub") {
            return Err(failc("This sign-in belongs to another account. Use Add account instead."));
        }
        let tokens = self.token_fields(&data, &json!({}))?;
        if !self.pending_is(id) || self.epoch() != epoch {
            return Err(failc("ChatGPT sign-in was canceled."));
        }
        let sharing_on = sharing(&Value::Object(tokens.clone()));
        let welcomed = p.get("welcomed").and_then(|w| w.as_bool()).unwrap_or(false);
        self.edit(&pid, |m| {
            for (k, v) in tokens { m.insert(k, v); }
            m.insert("sub".into(), json!(sv(&claims, "sub")));
            m.insert("email".into(), json!(claims.get("email").and_then(|e| e.as_str()).unwrap_or("")));
            m.insert("welcome".into(), json!(sharing_on && !welcomed));
        });
        self.state.lock().unwrap()["activeId"] = json!(pid);
        self.save()?;
        Ok(sharing_on)
    }

    fn clear_tokens(&self, id: &str) {
        self.edit(id, |m| { for k in ["accessToken", "refreshToken", "idToken", "expiresAt", "scopes", "welcome"] { m.remove(k); } });
        self.catalogs.lock().unwrap().remove(id);
    }

    async fn access(&self, id: &str, force: bool) -> Result<String, CgError> {
        let p = self.profile(id).unwrap_or(Value::Null);
        let token = sv(&p, "accessToken");
        if token.is_empty() {
            return Err(fail("Connect your ChatGPT account in Settings.", "session_expired"));
        }
        let fresh = |p: &Value| p.get("expiresAt").and_then(|e| e.as_i64()).unwrap_or(0) > (self.now)() + 60_000;
        if !force && fresh(&p) {
            return Ok(token);
        }
        if sv(&p, "refreshToken").is_empty() {
            return Err(fail("Reconnect your ChatGPT account in Settings.", "session_expired"));
        }
        // One refresh at a time: a caller that waited gets the token the first one fetched.
        let _g = self.refresh_lock.lock().await;
        let p = self.profile(id).unwrap_or(Value::Null);
        if sv(&p, "accessToken") != token && !sv(&p, "accessToken").is_empty() {
            return Ok(sv(&p, "accessToken"));
        }
        if sv(&p, "accessToken").is_empty() {
            return Err(fail("Connect your ChatGPT account in Settings.", "session_expired"));
        }
        let version = self.epoch();
        let result: Result<String, CgError> = async {
            let body = form(&[("grant_type", "refresh_token"), ("client_id", &sv(&p, "clientId")), ("refresh_token", &sv(&p, "refreshToken")), ("resource", RESOURCE)]);
            let data = self.json_request(self.req("POST", &format!("{ISSUER}/api/accounts/oauth/token"), vec![("Content-Type", "application/x-www-form-urlencoded".into())], Some(body))).await?;
            if !sv(&data, "id_token").is_empty() {
                let claims = self.identity(&sv(&data, "id_token"), &sv(&p, "clientId"), None).await?;
                if sv(&claims, "sub") != sv(&p, "sub") {
                    return Err(fail("ChatGPT's refreshed identity did not match. Please reconnect.", "invalid_identity"));
                }
            }
            if version != self.epoch() {
                return Err(failc("ChatGPT account changed. Please try again."));
            }
            let fields = self.token_fields(&data, &p)?;
            let at = sv(&Value::Object(fields.clone()), "accessToken");
            self.edit(id, |m| { for (k, v) in fields { m.insert(k, v); } });
            self.save()?;
            Ok(at)
        }.await;
        if let Err(e) = &result {
            if ["invalid_grant", "invalid_identity", "invalid_token"].contains(&e.code.as_str()) && version == self.epoch() {
                self.clear_tokens(id);
                let _ = self.save();
            }
        }
        result
    }

    async fn authorized(&self, id: &str, method: &'static str, url: &str, headers: Vec<(&'static str, String)>, body: Option<String>) -> Result<HttpResp, CgError> {
        let version = self.epoch();
        let not_sharing = || fail("Reconnect in Settings and allow ChatGPT plan usage.", "sharing_not_enabled");
        let ok = |s: &Self| version == s.epoch() && s.profile(id).map(|p| sharing(&p)).unwrap_or(false);
        if !ok(self) {
            return Err(not_sharing());
        }
        let mut token = self.access(id, false).await?;
        if !ok(self) {
            return Err(not_sharing());
        }
        let build = |t: &str| { let mut h = headers.clone(); h.push(("Authorization", format!("Bearer {t}"))); self.req(method, url, h, body.clone()) };
        let mut res = self.send(build(&token)).await?;
        if res.status == 401 {
            drop(res);
            token = self.access(id, true).await?;
            if !ok(self) {
                return Err(not_sharing());
            }
            res = self.send(build(&token)).await?;
        }
        if !(200..300).contains(&res.status) {
            let (status, rid) = (res.status, res.request_id.clone());
            let data = res.bytes().await.ok().and_then(|b| serde_json::from_slice::<Value>(&b).ok()).unwrap_or(json!({}));
            return Err(response_error(status, &rid, &data));
        }
        Ok(res)
    }

    pub async fn list_models(&self) -> Result<Value, CgError> {
        let id = self.active_id();
        let version = self.epoch();
        let res = self.authorized(&id, "GET", &format!("{RESOURCE}/models"), vec![], None).await?;
        let data: Value = serde_json::from_slice(&res.bytes().await.map_err(|_| failc("ChatGPT sent an unreadable response."))?).map_err(|_| failc("ChatGPT sent an unreadable response."))?;
        let models: Vec<Value> = data.get("models").and_then(|m| m.as_array()).cloned().unwrap_or_default().into_iter()
            .filter(|m| sv(m, "visibility") == "list" && m.get("slug").map(|s| s.is_string()).unwrap_or(false) && m.get("display_name").map(|s| s.is_string()).unwrap_or(false))
            .map(|m| json!({ "slug": sv(&m, "slug"), "name": sv(&m, "display_name") }))
            .collect();
        if version != self.epoch() || id != self.active_id() {
            return Err(failc("ChatGPT account changed. Refresh the models again."));
        }
        self.catalogs.lock().unwrap().insert(id.clone(), models.clone());
        let p = self.profile(&id).unwrap_or(Value::Null);
        if sv(&p, "model").is_empty() && !models.is_empty() {
            let pick = models.iter().find(|m| format!("{} {}", sv(m, "slug"), sv(m, "name")).to_lowercase().contains("luna")).unwrap_or(&models[0]);
            let slug = sv(pick, "slug");
            self.edit(&id, |m| { m.insert("model".into(), json!(slug)); });
            self.save()?;
        }
        *self.last_error.lock().unwrap() = String::new();
        Ok(self.status())
    }

    pub fn select_model(&self, slug: &str) -> Result<Value, CgError> {
        let id = self.active_id();
        let known = self.profile(&id).is_some() && self.catalogs.lock().unwrap().get(&id).map(|c| c.iter().any(|m| sv(m, "slug") == slug)).unwrap_or(false);
        if !known {
            return Err(failc("Refresh the models and choose an available ChatGPT model."));
        }
        self.edit(&id, |m| { m.insert("model".into(), json!(slug)); });
        self.save()?;
        Ok(self.status())
    }

    pub fn select_account(&self, id: &str) -> Result<Value, CgError> {
        if self.profile(id).is_none() {
            return Err(failc("ChatGPT account not found."));
        }
        self.invalidate();
        self.state.lock().unwrap()["activeId"] = json!(id);
        *self.last_error.lock().unwrap() = String::new();
        self.save()?;
        Ok(self.status())
    }

    pub async fn sign_out(&self) -> Result<Value, CgError> {
        let p = self.active();
        self.invalidate();
        let Some(p) = p else { return Ok(self.status()) };
        let (token, client_id, id) = (sv(&p, "refreshToken"), sv(&p, "clientId"), sv(&p, "id"));
        self.clear_tokens(&id);
        self.save()?;
        *self.last_error.lock().unwrap() = String::new();
        if !token.is_empty() {
            let mut revoked = false;
            for i in 0..2 {
                if revoked { break; }
                if i > 0 { tokio::time::sleep(Duration::from_millis(250)).await; }
                if let Ok(d) = self.config().await {
                    let body = form(&[("token", &token), ("token_type_hint", "refresh_token"), ("client_id", &client_id)]);
                    if let Ok(res) = self.send(self.req("POST", &sv(&d, "revocation_endpoint"), vec![("Content-Type", "application/x-www-form-urlencoded".into())], Some(body))).await {
                        revoked = res.status == 200;
                    }
                }
            }
            if !revoked {
                *self.last_error.lock().unwrap() = "Signed out on this device. Remote sign-out could not be confirmed; disconnect Vocab Master in ChatGPT Settings → Usage.".into();
            }
        }
        Ok(self.status())
    }

    pub async fn generate(&self, payload: &Value) -> Result<Value, CgError> {
        let (sys, user, hint) = (payload.get("systemPrompt"), payload.get("userPrompt"), payload.get("retryHint").cloned().unwrap_or(json!("")));
        let (Some(Value::String(sys)), Some(Value::String(user)), Value::String(hint)) = (sys, user, hint) else {
            return Err(failc("The ChatGPT request is invalid or too large."));
        };
        if sys.encode_utf16().count() + user.encode_utf16().count() + hint.encode_utf16().count() > 600_000 {
            return Err(failc("The ChatGPT request is invalid or too large."));
        }
        let id = self.active_id();
        let version = self.epoch();
        if !self.catalogs.lock().unwrap().contains_key(&id) {
            self.list_models().await?;
        }
        if self.status()["ready"] != json!(true) {
            return Err(fail("Choose an available ChatGPT model in Settings. Your previous model may no longer be available.", "model_not_available"));
        }
        let model = sv(&self.profile(&id).unwrap_or(Value::Null), "model");
        // JSON mode checks input messages; mentioning JSON only in instructions is insufficient.
        let body = json!({
            "model": model,
            "instructions": format!("{sys}\nReturn only the requested valid JSON object. Do not include Markdown fences or commentary."),
            "input": [{ "role": "user", "content": format!("{user}{}\n\nReturn the result as a valid JSON object.", if hint.is_empty() { String::new() } else { format!("\n\nFIX:\n{hint}") }) }],
            "text": { "format": { "type": "json_object" } }, "store": false, "stream": true,
        });
        let res = self.authorized(&id, "POST", &format!("{RESOURCE}/responses"), vec![("Content-Type", "application/json".into()), ("Accept", "text/event-stream".into())], Some(body.to_string())).await?;
        // Keep cancellation and timeout active through the completed stream, not just headers.
        let mut rx = self.epoch.subscribe();
        let start = *rx.borrow();
        let text = tokio::select! {
            r = tokio::time::timeout(self.request_timeout, completed_text(res.body)) => r.map_err(|_| failc("ChatGPT's connection ended before the reply completed. Please try again."))??,
            _ = async { loop { if rx.changed().await.is_err() || *rx.borrow() != start { break; } } } => return Err(failc("ChatGPT request canceled or timed out. Please try again.")),
        };
        if version != self.epoch() || id != self.active_id() {
            return Err(failc("ChatGPT account changed. Please try again."));
        }
        let t = text.trim();
        let t = t.strip_prefix("```json").or_else(|| t.strip_prefix("```")).map(|s| s.trim_start()).unwrap_or(t);
        let t = t.strip_suffix("```").map(|s| s.trim_end()).unwrap_or(t);
        match serde_json::from_str::<Value>(t) {
            Ok(v @ Value::Object(_)) => Ok(v),
            _ => Err(failc("ChatGPT's reply was not valid JSON. Please try again.")),
        }
    }

    pub fn acknowledge(&self) -> Value {
        let id = self.active_id();
        if self.profile(&id).is_some() {
            self.edit(&id, |m| { m.insert("welcome".into(), json!(false)); m.insert("welcomed".into(), json!(true)); });
            let _ = self.save();
        }
        self.status()
    }
}

#[cfg(test)]
mod tests;
