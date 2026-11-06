//! Google sign-in for account sync (loopback hand-off), as desktop/google-signin.js did:
//!   1. listen once on 127.0.0.1:<random port>,
//!   2. open the system browser at the hosted sign-in page (firebase/public/signin.html) with that port and a
//!      random state value,
//!   3. accept exactly one POST /callback whose state matches, and hand the Google ID token to the page, which
//!      signs in with signInWithCredential. Then the listener closes.
//! The token never touches disk or logs.
use crate::loopback::{parse_form, random_token, read_request, respond, same};
use serde_json::{json, Value};
use std::sync::Mutex;
use std::time::Duration;
use tokio::sync::oneshot;

pub const SIGNIN_URL: &str = "https://vocab-master-live.web.app/signin.html";

fn page(title: &str, text: &str) -> String {
    format!(
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>{title}</title>\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"></head>\n<body style=\"font-family:system-ui,'Segoe UI',sans-serif;background:#160a45;color:#fff;display:grid;place-items:center;min-height:90vh;text-align:center\">\n<div><div style=\"font-size:64px\">🦉</div><h1 style=\"margin:8px 0\">{title}</h1><p style=\"font-size:18px;opacity:.8\">{text}</p></div></body></html>"
    )
}

fn err(code: &str, error: String) -> Value {
    json!({ "ok": false, "code": code, "error": error })
}

#[derive(Default)]
pub struct Google {
    current: Mutex<Option<oneshot::Sender<Value>>>,
}

impl Google {
    /// Finish the sign-in that is open (if any) with this result.
    fn finish(&self, result: Value) {
        if let Some(tx) = self.current.lock().unwrap().take() {
            let _ = tx.send(result);
        }
    }

    pub fn cancel(&self) {
        self.finish(err("google/cancelled", "Google sign-in was cancelled.".into()));
    }

    /// Resolves with { ok, idToken } or { ok:false, code, error }. `open` opens the system browser.
    pub async fn start(&self, open: impl Fn(&str) -> Result<(), String>, timeout: Duration) -> Value {
        self.finish(err("google/replaced", "A newer sign-in started.".into()));
        let (tx, mut rx) = oneshot::channel::<Value>();
        *self.current.lock().unwrap() = Some(tx);
        let listener = match tokio::net::TcpListener::bind(("127.0.0.1", 0)).await {
            Ok(l) => l,
            Err(e) => {
                let r = err("google/listen", format!("Couldn't start sign-in ({e})."));
                self.current.lock().unwrap().take();
                return r;
            }
        };
        let port = listener.local_addr().map(|a| a.port()).unwrap_or(0);
        let state = random_token(24);
        if let Err(e) = open(&format!("{SIGNIN_URL}?mode=loopback&port={port}&state={state}")) {
            self.current.lock().unwrap().take();
            return err("google/browser", format!("Couldn't open the browser ({e})."));
        }
        let deadline = tokio::time::sleep(timeout);
        tokio::pin!(deadline);
        loop {
            tokio::select! {
                r = &mut rx => return r.unwrap_or_else(|_| err("google/cancelled", "Google sign-in was cancelled.".into())),
                _ = &mut deadline => {
                    self.current.lock().unwrap().take();
                    return err("google/timeout", "Google sign-in timed out. Try again.".into());
                }
                acc = listener.accept() => {
                    let Ok((mut stream, _)) = acc else { continue };
                    let Some(req) = read_request(&mut stream).await else { continue };
                    if req.method != "POST" || req.target != "/callback" {
                        respond(&mut stream, 404, "text/plain", &[], "Not found").await;
                        continue;
                    }
                    if req.too_big { continue; }
                    let form = parse_form(&req.body);
                    let get = |k: &str| form.iter().find(|(n, _)| n == k).map(|(_, v)| v.clone()).unwrap_or_default();
                    let id_token = get("id_token");
                    if !same(&get("state"), &state) || id_token.is_empty() {
                        respond(&mut stream, 400, "text/html; charset=utf-8", &[], &page("That didn't work", "Start again from Vocab Master: Settings → Account.")).await;
                        continue;
                    }
                    respond(&mut stream, 200, "text/html; charset=utf-8", &[("Cache-Control", "no-store")], &page("You're signed in", "You can close this tab and go back to Vocab Master.")).await;
                    self.current.lock().unwrap().take();
                    return json!({ "ok": true, "idToken": id_token });
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    async fn post(port: u16, body: &str) -> String {
        let mut s = tokio::net::TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        let req = format!("POST /callback HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: {}\r\n\r\n{body}", body.len());
        s.write_all(req.as_bytes()).await.unwrap();
        let mut out = String::new();
        s.read_to_string(&mut out).await.unwrap();
        out
    }

    #[tokio::test]
    async fn loopback_checks_state_then_hands_back_the_token() {
        let g = std::sync::Arc::new(Google::default());
        let (url_tx, url_rx) = std::sync::mpsc::channel::<String>();
        let g2 = g.clone();
        let task = tokio::spawn(async move { g2.start(move |u| { url_tx.send(u.to_string()).unwrap(); Ok(()) }, Duration::from_secs(10)).await });
        let url = tokio::task::spawn_blocking(move || url_rx.recv().unwrap()).await.unwrap();
        let u = url::Url::parse(&url).unwrap();
        let q: std::collections::HashMap<_, _> = u.query_pairs().into_owned().collect();
        assert_eq!(q["mode"], "loopback");
        let port: u16 = q["port"].parse().unwrap();
        let bad = post(port, "state=wrong&id_token=abc").await;
        assert!(bad.starts_with("HTTP/1.1 400"));
        let mut s = tokio::net::TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        let get = ["GET /other HTTP/1.1", &format!("Host: 127.0.0.1:{port}"), "", ""].join("\r\n");
        s.write_all(get.as_bytes()).await.unwrap();
        let mut other = String::new();
        s.read_to_string(&mut other).await.unwrap();
        assert!(other.starts_with("HTTP/1.1 404"));
        let ok = post(port, &format!("state={}&id_token=tok123", q["state"])).await;
        assert!(ok.starts_with("HTTP/1.1 200"));
        let r = task.await.unwrap();
        assert_eq!(r["ok"], true);
        assert_eq!(r["idToken"], "tok123");
        // Once only: the listener is gone.
        assert!(tokio::net::TcpStream::connect(("127.0.0.1", port)).await.is_err());
    }

    #[tokio::test]
    async fn times_out() {
        let g = Google::default();
        let r = g.start(|_| Ok(()), Duration::from_millis(50)).await;
        assert_eq!(r["code"], "google/timeout");
    }

    #[tokio::test]
    async fn cancel_ends_the_wait() {
        let g = std::sync::Arc::new(Google::default());
        let g2 = g.clone();
        let task = tokio::spawn(async move { g2.start(|_| Ok(()), Duration::from_secs(10)).await });
        tokio::time::sleep(Duration::from_millis(100)).await;
        g.cancel();
        let r = task.await.unwrap();
        assert_eq!(r["code"], "google/cancelled");
    }
}
