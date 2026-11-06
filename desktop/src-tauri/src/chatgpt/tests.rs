//! The ChatGPT runtime against a fake OpenAI (ported from tests/chatgpt.test.mjs).
use super::*;
use std::sync::OnceLock;

struct Keys {
    der: Vec<u8>,
    jwk: Value,
}

fn keys(n: usize) -> &'static Keys {
    static A: OnceLock<Keys> = OnceLock::new();
    static B: OnceLock<Keys> = OnceLock::new();
    let make = || {
        use rsa::pkcs1::EncodeRsaPrivateKey;
        use rsa::traits::PublicKeyParts;
        let key = rsa::RsaPrivateKey::new(&mut rand::thread_rng(), 2048).unwrap();
        let der = key.to_pkcs1_der().unwrap().as_bytes().to_vec();
        let jwk = json!({ "kty": "RSA", "n": b64url(&key.n().to_bytes_be()), "e": b64url(&key.e().to_bytes_be()), "kid": "test-key", "use": "sig", "alg": "RS256" });
        Keys { der, jwk }
    };
    if n == 0 { A.get_or_init(make) } else { B.get_or_init(make) }
}

fn jwt(claims: &Value, signer: usize) -> String {
    let mut header = jsonwebtoken::Header::new(jsonwebtoken::Algorithm::RS256);
    header.kid = Some("test-key".into());
    jsonwebtoken::encode(&header, claims, &jsonwebtoken::EncodingKey::from_rsa_der(&keys(signer).der)).unwrap()
}

fn frame(v: Value) -> String {
    format!("data: {v}\r\n\r\n")
}
fn finish(text: &str) -> String {
    frame(json!({ "type": "response.completed", "response": { "status": "completed", "output": [{ "type": "message", "content": [{ "type": "output_text", "text": text }] }] } }))
}

#[derive(Default)]
struct H {
    saved: Option<Value>,
    clock: i64,
    calls: Vec<(String, Option<String>)>,
    token_calls: usize,
    auth_nonce: String,
    models: Vec<Value>,
    scope: String,
    reply: String,
    claim_override: Map<String, Value>,
    token_error: Option<String>,
    token_wait: Option<tokio::sync::watch::Receiver<bool>>,
    revoke_status: u16,
    model_unauthorized: usize,
    response_error: Option<(Value, u16)>,
    signer: usize,
    storage_error: bool,
}

struct Harness {
    h: Arc<Mutex<H>>,
    rt: Arc<ChatGPT>,
    auth: Mutex<Option<url::Url>>,
}

fn resp(status: u16, body: String) -> Result<HttpResp, String> {
    Ok(HttpResp { status, request_id: String::new(), body: futures_util::stream::iter(vec![Ok(body.into_bytes())]).boxed() })
}

fn harness() -> Harness {
    let h = Arc::new(Mutex::new(H {
        clock: 1_800_000_000_000,
        models: vec![
            json!({ "slug": "gpt-6.1-sol", "display_name": "GPT 6.1 Sol", "visibility": "list" }),
            json!({ "slug": "gpt-6-luna", "display_name": "GPT 6 Luna", "visibility": "list" }),
            json!({ "slug": "hidden", "display_name": "Hidden", "visibility": "hide" }),
        ],
        scope: "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct".into(),
        reply: finish("{\"ok\":true}"),
        ..Default::default()
    }));
    let hh = h.clone();
    let transport: Transport = Arc::new(move |req: HttpReq| {
        let h = hh.clone();
        Box::pin(async move {
            let url = req.url.clone();
            h.lock().unwrap().calls.push((url.clone(), req.body.clone()));
            if url.ends_with("openid-configuration") {
                return resp(200, json!({ "issuer": "https://auth.openai.com", "jwks_uri": "https://auth.openai.com/.well-known/jwks.json", "revocation_endpoint": "https://auth.openai.com/oauth/revoke" }).to_string());
            }
            if url.ends_with("jwks.json") {
                return resp(200, json!({ "keys": [keys(0).jwk.clone()] }).to_string());
            }
            if url.ends_with("oauth/token") {
                let (n, err, wait) = { let mut g = h.lock().unwrap(); g.token_calls += 1; (g.token_calls, g.token_error.clone(), g.token_wait.clone()) };
                if let Some(e) = err { return resp(400, json!({ "error": e }).to_string()); }
                if let Some(mut w) = wait { while !*w.borrow() { if w.changed().await.is_err() { break; } } }
                let initial = req.body.as_deref().unwrap_or("").contains("grant_type=authorization_code");
                let g = h.lock().unwrap();
                let mut data = json!({ "access_token": format!("secret-access-{n}"), "refresh_token": format!("secret-refresh-{n}"), "token_type": "Bearer", "expires_in": 3600, "scope": g.scope });
                if initial {
                    let mut claims = json!({ "iss": "https://auth.openai.com", "aud": "oaiapp_test", "sub": "teacher-id", "email": "teacher@example.com", "nonce": g.auth_nonce, "exp": g.clock / 1000 + 3600 });
                    for (k, v) in &g.claim_override { claims[k] = v.clone(); }
                    data["id_token"] = json!(jwt(&claims, g.signer));
                }
                return resp(200, data.to_string());
            }
            if url.ends_with("/revoke") {
                let s = h.lock().unwrap().revoke_status;
                return resp(if s == 0 { 200 } else { s }, String::new());
            }
            if url.ends_with("/models") {
                let mut g = h.lock().unwrap();
                if g.model_unauthorized > 0 { g.model_unauthorized -= 1; return resp(401, json!({ "error": { "code": "invalid_token" } }).to_string()); }
                return resp(200, json!({ "models": g.models }).to_string());
            }
            if url.ends_with("/responses") {
                let g = h.lock().unwrap();
                if let Some((e, s)) = &g.response_error { return resp(*s, e.to_string()); }
                let body: Value = serde_json::from_str(req.body.as_deref().unwrap_or("{}")).unwrap();
                if body.pointer("/text/format/type") == Some(&json!("json_object")) && !body["input"].to_string().to_lowercase().contains("json") {
                    return resp(400, json!({ "error": { "message": "Response input messages must contain the word 'json'", "param": "input", "code": null } }).to_string());
                }
                return resp(200, g.reply.clone());
            }
            Err(format!("Unexpected URL: {url}"))
        })
    });
    let (hr, hw, hc) = (h.clone(), h.clone(), h.clone());
    let rt = ChatGPT::new(
        Box::new(move || Ok(hr.lock().unwrap().saved.clone())),
        Box::new(move |s| { let mut g = hw.lock().unwrap(); if g.storage_error { return Err("Disk full".into()); } g.saved = Some(s.clone()); Ok(()) }),
        transport,
        Arc::new(move || hc.lock().unwrap().clock),
        Duration::from_secs(300),
        Duration::from_secs(3),
    ).unwrap();
    Harness { h, rt, auth: Mutex::new(None) }
}

impl Harness {
    async fn start(&self, id: &str) -> url::Url {
        let u = url::Url::parse(&self.rt.start_sign_in(id).await.unwrap()).unwrap();
        self.h.lock().unwrap().auth_nonce = self.param("nonce", &u);
        *self.auth.lock().unwrap() = Some(u.clone());
        u
    }
    fn param(&self, k: &str, u: &url::Url) -> String {
        u.query_pairs().find(|(n, _)| n == k).map(|(_, v)| v.into_owned()).unwrap_or_default()
    }
    async fn callback(&self, overrides: &[(&str, &str)]) -> u16 {
        let auth = self.auth.lock().unwrap().clone().unwrap();
        let mut cb = url::Url::parse(&self.param("redirect_uri", &auth)).unwrap();
        let state = self.param("state", &auth);
        let mut pairs: Vec<(String, String)> = vec![("state".into(), state), ("code".into(), "authorization-code".into()), ("client_id".into(), "oaiapp_test".into())];
        for (k, v) in overrides { if let Some(p) = pairs.iter_mut().find(|(n, _)| n == k) { p.1 = v.to_string(); } else { pairs.push((k.to_string(), v.to_string())); } }
        cb.query_pairs_mut().clear().extend_pairs(pairs);
        reqwest::get(cb).await.unwrap().status().as_u16()
    }
    async fn login(&self) -> Value {
        self.start("").await;
        assert_eq!(self.callback(&[]).await, 200);
        self.rt.status()
    }
    fn calls_to(&self, end: &str) -> Vec<(String, Option<String>)> {
        self.h.lock().unwrap().calls.iter().filter(|(u, _)| u.ends_with(end)).cloned().collect()
    }
}

fn form_of(body: &str) -> HashMap<String, String> {
    url::form_urlencoded::parse(body.as_bytes()).into_owned().collect()
}

#[tokio::test]
async fn oauth_loopback_pkce_identity_protected_tokens_and_luna_default() {
    let t = harness();
    let auth = t.start("").await;
    assert_eq!(auth.origin().ascii_serialization(), "https://auth.openai.com");
    assert_eq!(t.param("client_id", &auth), "dynamic_agent_client");
    assert_eq!(t.param("agent_name_hint", &auth), "Vocab Master");
    assert!(t.param("ext_agent_host_id", &auth).starts_with("urn:uuid:"));
    assert_eq!(t.param("code_challenge_method", &auth), "S256");
    assert_eq!(url::Url::parse(&t.param("redirect_uri", &auth)).unwrap().host_str(), Some("127.0.0.1"));
    assert_eq!(t.callback(&[("state", "forged")]).await, 400);
    assert_eq!(t.rt.status()["pending"], true);
    assert_eq!(t.h.lock().unwrap().token_calls, 0);
    assert_eq!(t.callback(&[]).await, 200);
    let f = form_of(t.calls_to("oauth/token")[0].1.as_deref().unwrap());
    assert_eq!(f["client_id"], "oaiapp_test");
    assert_eq!(f["redirect_uri"], t.param("redirect_uri", &auth));
    assert!(f["code_verifier"].len() >= 43);
    let s = t.rt.list_models().await.unwrap();
    assert_eq!(s["model"], "gpt-6-luna");
    assert_eq!(s["ready"], true);
    assert_eq!(s["models"].as_array().unwrap().len(), 2);
    assert_eq!(s["profiles"][0]["email"], "teacher@example.com");
    assert!(!s.to_string().contains("secret-"));
    assert_eq!(t.h.lock().unwrap().saved.as_ref().unwrap()["profiles"][0]["accessToken"], "secret-access-1");
    assert_eq!(s["welcome"], true);
    assert_eq!(t.rt.acknowledge()["welcome"], false);
}

async fn rejects(claims: Value) {
    let t = harness();
    t.h.lock().unwrap().claim_override = claims.as_object().unwrap().clone();
    t.start("").await;
    assert_eq!(t.callback(&[]).await, 400);
    assert_eq!(t.rt.status()["connected"], false);
    assert_eq!(t.h.lock().unwrap().saved.as_ref().unwrap()["profiles"][0]["clientId"], "oaiapp_test", "issued registration survives");
}
#[tokio::test]
async fn rejects_wrong_nonce() { rejects(json!({ "nonce": "forged" })).await }
#[tokio::test]
async fn rejects_wrong_issuer() { rejects(json!({ "iss": "https://example.com" })).await }
#[tokio::test]
async fn rejects_wrong_audience() { rejects(json!({ "aud": "another-client" })).await }
#[tokio::test]
async fn rejects_expired_identity() { rejects(json!({ "exp": 1 })).await }

#[tokio::test]
async fn rejects_a_forged_signature() {
    let t = harness();
    t.h.lock().unwrap().signer = 1;
    t.start("").await;
    assert_eq!(t.callback(&[]).await, 400);
    assert_eq!(t.rt.status()["connected"], false);
}

#[tokio::test]
async fn identity_only_grant_never_enables_models_or_generation() {
    let t = harness();
    t.h.lock().unwrap().scope = "openid email".into();
    let s = t.login().await;
    assert_eq!(s["connected"], true);
    assert_eq!(s["sharing"], false);
    let e = t.rt.list_models().await.unwrap_err();
    assert!(friendly(&e.code, &e.message).contains("allow ChatGPT plan usage") || e.message.contains("allow ChatGPT plan usage"), "{e:?}");
    assert!(t.rt.generate(&json!({ "systemPrompt": "JSON", "userPrompt": "Hello" })).await.is_err());
    assert!(t.calls_to("/responses").is_empty());
}

#[tokio::test]
async fn user_model_choice_is_honored() {
    let t = harness();
    t.login().await;
    t.rt.list_models().await.unwrap();
    t.rt.select_model("gpt-6.1-sol").unwrap();
    assert!(t.rt.select_model("made-up-model").is_err());
    assert_eq!(t.rt.generate(&json!({ "systemPrompt": "Teacher instructions", "userPrompt": "Word list", "retryHint": "Fix missing item" })).await.unwrap(), json!({ "ok": true }));
    let body: Value = serde_json::from_str(t.calls_to("/responses")[0].1.as_deref().unwrap()).unwrap();
    assert_eq!(body["model"], "gpt-6.1-sol");
    assert_eq!(body["store"], false);
    assert_eq!(body["stream"], true);
    assert!(body["instructions"].as_str().unwrap().contains("Teacher instructions"));
    assert!(body["input"][0]["content"].as_str().unwrap().contains("Fix missing item"));
    assert_eq!(body["text"], json!({ "format": { "type": "json_object" } }));
    let mut keys: Vec<_> = body.as_object().unwrap().keys().cloned().collect();
    keys.sort();
    assert_eq!(keys, vec!["input", "instructions", "model", "store", "stream", "text"]);
    { let mut g = t.h.lock().unwrap(); let luna = g.models[1].clone(); g.models = vec![luna]; }
    let s = t.rt.list_models().await.unwrap();
    assert_eq!(s["ready"], false);
    assert_eq!(s["model"], "gpt-6.1-sol");
    let e = t.rt.generate(&json!({ "systemPrompt": "JSON", "userPrompt": "List" })).await.unwrap_err();
    assert!(e.message.contains("available ChatGPT model"));
    assert_eq!(t.calls_to("/responses").len(), 1);
}

#[tokio::test]
async fn refresh_is_serialized_and_persists_rotated_tokens() {
    let t = harness();
    t.login().await;
    t.h.lock().unwrap().clock += 3_550_000;
    let (a, b) = tokio::join!(t.rt.list_models(), t.rt.list_models());
    a.unwrap();
    b.unwrap();
    assert_eq!(t.h.lock().unwrap().token_calls, 2);
    let f = form_of(t.calls_to("oauth/token")[1].1.as_deref().unwrap());
    assert_eq!(f["client_id"], "oaiapp_test");
    assert_eq!(f["grant_type"], "refresh_token");
    assert_eq!(f["resource"], "https://api.openai.com/v1");
    assert!(!f.contains_key("scope"));
    assert_eq!(t.h.lock().unwrap().saved.as_ref().unwrap()["profiles"][0]["refreshToken"], "secret-refresh-2");
}

#[tokio::test]
async fn json_mode_is_satisfied_when_only_the_system_prompt_says_json() {
    let t = harness();
    t.login().await;
    t.h.lock().unwrap().reply = finish("{\"sections\":[{\"id\":\"p1\"}]}");
    let r = t.rt.generate(&json!({ "systemPrompt": "Return JSON", "userPrompt": "Remake part 1" })).await.unwrap();
    assert_eq!(r["sections"][0]["id"], "p1");
    let body: Value = serde_json::from_str(t.calls_to("/responses")[0].1.as_deref().unwrap()).unwrap();
    assert!(body["input"][0]["content"].as_str().unwrap().contains("JSON"));
}

#[tokio::test]
async fn http_rejections_keep_their_diagnostic() {
    let t = harness();
    t.login().await;
    t.h.lock().unwrap().response_error = Some((json!({ "error": { "code": null, "type": "invalid_request_error", "param": "input", "message": "Response input messages must contain the word 'json'." } }), 400));
    let e = t.rt.generate(&json!({ "systemPrompt": "Return JSON", "userPrompt": "Rewrite this exercise." })).await.unwrap_err();
    assert!(e.message.contains("input messages must contain"), "{e:?}");
    assert!(!e.message.contains("reach ChatGPT"));
    assert_eq!(e.status, 400);
    assert_eq!(e.param, "input");
    assert_eq!(t.rt.status()["connected"], true);
    assert_eq!(t.h.lock().unwrap().token_calls, 1);
}

#[tokio::test]
async fn direct_admission_errors_keep_detail() {
    let t = harness();
    t.login().await;
    t.h.lock().unwrap().response_error = Some((json!({ "detail": "Direct routing is temporarily unavailable." }), 503));
    let e = t.rt.generate(&json!({ "systemPrompt": "Return JSON", "userPrompt": "Rewrite this exercise." })).await.unwrap_err();
    assert!(e.message.contains("Direct routing is temporarily unavailable"));
    assert_eq!(e.status, 503);
    assert_eq!(t.rt.status()["connected"], true);
}

#[tokio::test]
async fn retry_after_401_then_expired_sessions_need_reconnect() {
    let t = harness();
    t.login().await;
    t.h.lock().unwrap().model_unauthorized = 1;
    assert_eq!(t.rt.list_models().await.unwrap()["ready"], true);
    assert_eq!(t.h.lock().unwrap().token_calls, 2);
    { let mut g = t.h.lock().unwrap(); g.clock += 4_000_000; g.token_error = Some("invalid_grant".into()); }
    let e = t.rt.list_models().await.unwrap_err();
    assert!(friendly(&e.code, &e.message).contains("expired"), "{e:?}");
    assert_eq!(t.rt.status()["connected"], false);
    assert!(t.h.lock().unwrap().saved.as_ref().unwrap()["profiles"][0].get("refreshToken").is_none());
}

#[tokio::test]
async fn renewed_identity_only_grant_cannot_send_requests() {
    let t = harness();
    t.login().await;
    { let mut g = t.h.lock().unwrap(); g.clock += 3_550_000; g.scope = "openid email".into(); }
    let e = t.rt.list_models().await.unwrap_err();
    assert!(e.message.contains("allow ChatGPT plan usage"));
    assert_eq!(t.rt.status()["sharing"], false);
    assert!(t.calls_to("/models").is_empty() && t.calls_to("/responses").is_empty());
}

#[tokio::test]
async fn reconnecting_keeps_host_and_model_without_a_second_welcome() {
    let t = harness();
    t.login().await;
    t.rt.list_models().await.unwrap();
    t.rt.acknowledge();
    t.rt.select_model("gpt-6.1-sol").unwrap();
    let id = sv(&t.rt.status(), "accountId");
    let host = sv(t.h.lock().unwrap().saved.as_ref().unwrap(), "hostId");
    t.rt.sign_out().await.unwrap();
    let auth = t.start(&id).await;
    assert_eq!(t.param("client_id", &auth), "oaiapp_test");
    assert_eq!(t.param("ext_agent_host_id", &auth), host);
    assert_eq!(t.callback(&[]).await, 200);
    let s = t.rt.list_models().await.unwrap();
    assert_eq!(s["profiles"].as_array().unwrap().len(), 1);
    assert_eq!(s["accountId"], json!(id));
    assert_eq!(s["model"], "gpt-6.1-sol");
    assert_eq!(s["welcome"], false);
}

#[tokio::test]
async fn logout_clears_credentials_and_reports_unconfirmed_revocation() {
    let t = harness();
    t.login().await;
    let host = sv(t.h.lock().unwrap().saved.as_ref().unwrap(), "hostId");
    let id = sv(&t.rt.status(), "accountId");
    t.h.lock().unwrap().revoke_status = 503;
    let s = t.rt.sign_out().await.unwrap();
    assert_eq!(s["connected"], false);
    assert!(s["error"].as_str().unwrap().contains("could not be confirmed"));
    assert!(!t.h.lock().unwrap().saved.as_ref().unwrap().to_string().contains("secret-"));
    let auth = t.start(&id).await;
    assert_eq!(t.param("client_id", &auth), "oaiapp_test");
    assert_eq!(t.param("ext_agent_host_id", &auth), host);
    assert!(t.param("id_token_hint", &auth).is_empty());
}

#[tokio::test]
async fn cancel_during_token_exchange_cannot_resurrect_a_session() {
    let t = Arc::new(harness());
    let (release, wait) = tokio::sync::watch::channel(false);
    t.h.lock().unwrap().token_wait = Some(wait);
    t.start("").await;
    let t2 = t.clone();
    let cb = tokio::spawn(async move { t2.callback(&[]).await });
    while t.h.lock().unwrap().token_calls == 0 { tokio::time::sleep(Duration::from_millis(5)).await; }
    t.rt.cancel_sign_in();
    release.send(true).unwrap();
    assert_eq!(cb.await.unwrap(), 400);
    assert_eq!(t.rt.status()["connected"], false);
}

#[tokio::test]
async fn secure_storage_failure_fails_closed() {
    let t = harness();
    t.start("").await;
    t.h.lock().unwrap().storage_error = true;
    assert_eq!(t.callback(&[]).await, 400);
    assert_eq!(t.rt.status()["ready"], false);
    assert_eq!(t.rt.status()["connected"], false);
}

fn stream_of(chunks: Vec<Vec<u8>>) -> BoxStream<'static, Result<Vec<u8>, String>> {
    futures_util::stream::iter(chunks.into_iter().map(Ok)).boxed()
}

#[tokio::test]
async fn sse_keeps_greek_across_tiny_chunks_and_waits_for_completion() {
    let text = "{\"greek\":\"γάτα\"}";
    let bytes = (frame(json!({ "type": "response.output_text.delta", "delta": text })) + &finish(text)).into_bytes();
    let out = completed_text(stream_of(bytes.into_iter().map(|b| vec![b]).collect())).await.unwrap();
    assert_eq!(out, text);
}

#[tokio::test]
async fn sse_rejects_bad_endings() {
    let partial = frame(json!({ "type": "response.output_text.delta", "delta": "{\"partial\":true}" }));
    for (tail, expected) in [
        (String::new(), "before the reply completed"),
        (frame(json!({ "type": "response.failed", "response": { "error": { "code": "subscription_sharing_usage_limit_exceeded" } } })), "Manage usage"),
        (frame(json!({ "type": "response.incomplete" })), "incomplete"),
        (frame(json!({ "type": "response.refusal.done" })), "could not complete"),
    ] {
        let e = completed_text(stream_of(vec![(partial.clone() + &tail).into_bytes()])).await.unwrap_err();
        assert!(e.message.contains(expected), "{expected}: {e:?}");
    }
}
