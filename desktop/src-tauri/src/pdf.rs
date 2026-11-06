//! HTML → PDF with WebView2's own Chromium (DevTools "Page.printToPDF" — what Electron's printToPDF used), so
//! the worksheets print exactly as before: A4, the page's own @page margins, backgrounds, and an optional
//! footer "text · Page X of Y" on every page.
//! The HTML is served once from memory at app://…/__print/<id> into a hidden window with scripts off.
use base64::Engine;
use serde_json::json;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

static NEXT: AtomicU64 = AtomicU64::new(1);

/// Documents waiting to be printed: id → html.
#[derive(Default)]
pub struct PrintJobs(pub Mutex<HashMap<String, String>>);

fn esc(t: &str) -> String {
    t.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// Page.printToPDF parameters; a non-empty footer adds "footer · Page X of Y" to every page.
pub fn print_params(footer: &str) -> serde_json::Value {
    let mut p = json!({
        // A4 in inches, as Electron's pageSize: "A4".
        "paperWidth": 8.27, "paperHeight": 11.7,
        "printBackground": true,
        // The worksheet's own @page rules set the margins, so PDF, print and preview match.
        "preferCSSPageSize": true,
        "marginTop": 0, "marginBottom": 0, "marginLeft": 0, "marginRight": 0,
        "displayHeaderFooter": false,
    });
    if !footer.trim().is_empty() {
        p["displayHeaderFooter"] = json!(true);
        p["headerTemplate"] = json!("<span></span>");
        p["footerTemplate"] = json!(format!(
            "<div style=\"width:100%;margin:0 14mm 5mm;padding-top:1.6mm;border-top:0.5pt solid #c9c9c9;display:flex;justify-content:space-between;font:7.5pt Segoe UI,Arial,sans-serif;color:#6f6f6f\"><span>{}</span><span>Page <span class=\"pageNumber\"></span> of <span class=\"totalPages\"></span></span></div>",
            esc(footer)
        ));
    }
    p
}

/// Print one HTML document to PDF bytes.
pub async fn html_to_pdf(app: &AppHandle, html: String, footer: &str) -> Result<Vec<u8>, String> {
    let id = format!("p{}", NEXT.fetch_add(1, Ordering::SeqCst));
    app.state::<PrintJobs>().0.lock().unwrap().insert(id.clone(), html);
    let result = print_job(app, &id, footer).await;
    app.state::<PrintJobs>().0.lock().unwrap().remove(&id);
    result
}

async fn print_job(app: &AppHandle, id: &str, footer: &str) -> Result<Vec<u8>, String> {
    let (loaded_tx, loaded_rx) = tokio::sync::oneshot::channel::<()>();
    let loaded_tx = Mutex::new(Some(loaded_tx));
    let url = crate::protocol::app_url(&format!("__print/{id}"));
    let label = format!("print-{id}");
    let blank: url::Url = "about:blank".parse().unwrap();
    let win = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(blank))
        .visible(false)
        .focused(false)
        .skip_taskbar(true)
        .inner_size(794.0, 1123.0)
        // Same scheme, profile and browser options as the main window (one WebView2 environment per app).
        .use_https_scheme(true)
        .data_directory(crate::webview_data_dir(app))
        .additional_browser_args(&crate::browser_args())
        .on_page_load(move |_w, payload| {
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) && payload.url().path().starts_with("/__print/") {
                if let Some(tx) = loaded_tx.lock().unwrap().take() {
                    let _ = tx.send(());
                }
            }
        })
        .build()
        .map_err(|e| format!("Couldn't open the PDF printer ({e})."))?;
    // Scripts off, as in the Electron app's PDF window; then load the document.
    disable_scripts(&win);
    win.navigate(url).map_err(|e| e.to_string())?;
    let out = async {
        tokio::time::timeout(Duration::from_secs(60), loaded_rx).await.map_err(|_| "The page took too long to load for the PDF.".to_string())?.ok();
        // Let the embedded fonts finish loading.
        tokio::time::sleep(Duration::from_millis(250)).await;
        let params = print_params(footer).to_string();
        let (tx, rx) = tokio::sync::oneshot::channel::<Result<String, String>>();
        call_devtools(&win, "Page.printToPDF", params, tx)?;
        let json = tokio::time::timeout(Duration::from_secs(120), rx).await.map_err(|_| "Printing the PDF timed out.".to_string())?.map_err(|_| "The PDF printer stopped.".to_string())??;
        let v: serde_json::Value = serde_json::from_str(&json).map_err(|e| e.to_string())?;
        let data = v.get("data").and_then(|d| d.as_str()).ok_or("The PDF printer returned nothing.")?;
        base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| e.to_string())
    }
    .await;
    let _ = win.destroy();
    out
}

#[cfg(windows)]
fn call_devtools(win: &tauri::WebviewWindow, method: &'static str, params: String, tx: tokio::sync::oneshot::Sender<Result<String, String>>) -> Result<(), String> {
    use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
    use windows::core::HSTRING;
    win.with_webview(move |pw| unsafe {
        let tx = Mutex::new(Some(tx));
        let send = move |r: Result<String, String>| {
            if let Some(t) = tx.lock().unwrap().take() {
                let _ = t.send(r);
            }
        };
        let core = match pw.controller().CoreWebView2() {
            Ok(c) => c,
            Err(e) => return send(Err(e.message().to_string())),
        };
        let send = std::sync::Arc::new(send);
        let s2 = send.clone();
        let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move |hr: windows::core::Result<()>, json: String| {
            s2(hr.map(|_| json).map_err(|e| e.message().to_string()));
            Ok(())
        }));
        if let Err(e) = core.CallDevToolsProtocolMethod(&HSTRING::from(method), &HSTRING::from(params), &handler) {
            send(Err(e.message().to_string()));
        }
    })
    .map_err(|e| e.to_string())
}

#[cfg(windows)]
fn disable_scripts(win: &tauri::WebviewWindow) {
    let _ = win.with_webview(|pw| unsafe {
        if let Ok(core) = pw.controller().CoreWebView2() {
            if let Ok(settings) = core.Settings() {
                let _ = settings.SetIsScriptEnabled(false);
            }
        }
    });
}

#[cfg(not(windows))]
fn disable_scripts(_: &tauri::WebviewWindow) {}

#[cfg(not(windows))]
fn call_devtools(_: &tauri::WebviewWindow, _: &'static str, _: String, _: tokio::sync::oneshot::Sender<Result<String, String>>) -> Result<(), String> {
    Err("PDF export needs Windows.".into())
}

#[cfg(test)]
mod tests {
    #[test]
    fn footer_is_escaped() {
        let p = super::print_params("Test <1> & \"2\"");
        let f = p["footerTemplate"].as_str().unwrap();
        assert!(f.contains("Test &lt;1&gt; &amp; &quot;2&quot;"));
        assert!(f.contains("pageNumber") && f.contains("totalPages"));
        assert_eq!(super::print_params("")["displayHeaderFooter"], false);
    }
}
