//! `Vocab Master.exe --smoke`: a fresh temporary data folder (never the teacher's), the real pages driven end to
//! end (shim/smoke.js), then the saved pack's files checked by their first bytes. Prints SMOKE_RESULTS {…} and
//! exits 0 when everything passed, 1 otherwise (also after 4 minutes without a report).
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Manager};

const SCRIPT: &str = include_str!("../shim/smoke.js");
const FIXTURE: &str = include_str!("../../smoke-fixture.json");
static STARTED: AtomicBool = AtomicBool::new(false);

/// Print to the console that started us (the release exe has no console of its own).
pub fn attach_console() {
    #[cfg(windows)]
    unsafe {
        use windows::Win32::System::Console::{AttachConsole, ATTACH_PARENT_PROCESS};
        let _ = AttachConsole(ATTACH_PARENT_PROCESS);
    }
}

pub fn run(app: &AppHandle) {
    if STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    let voices = std::env::args().any(|a| a == "--voices");
    let js = SCRIPT.replace("__FIXTURE__", FIXTURE.trim()).replace("__VOICES__", if voices { "true" } else { "false" });
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        // Let the pages settle (as Electron's did-finish-load did).
        tokio::time::sleep(Duration::from_millis(300)).await;
        if let Some(w) = app2.get_webview_window("main") {
            if let Err(e) = w.eval(js) {
                finish(&app2, json!({ "error": format!("eval failed: {e}") }), false);
            }
        }
        tokio::time::sleep(Duration::from_secs(if voices { 300 } else { 240 })).await;
        finish(&app2, json!({ "error": "timed out" }), false);
    });
}

fn finish(app: &AppHandle, results: Value, ok: bool) {
    let line = format!("SMOKE_RESULTS {results}");
    println!("{line}");
    let _ = std::fs::write(std::env::temp_dir().join("vocab-master-smoke.json"), results.to_string());
    app.exit(if ok { 0 } else { 1 });
}

fn magic_ok(path: &std::path::Path) -> bool {
    let head = std::fs::read(path).map(|b| b.into_iter().take(4).collect::<Vec<u8>>()).unwrap_or_default();
    let want: &[u8] = match path.extension().and_then(|e| e.to_str()).unwrap_or("") {
        "docx" => b"PK",
        "pdf" => b"%PDF",
        "wav" => b"RIFF",
        _ => b"?",
    };
    head.starts_with(want)
}

#[tauri::command]
pub fn smoke_report(app: AppHandle, results: Value) {
    let mut results = results;
    let mut pack_ok = false;
    if results.pointer("/pack/ok") == Some(&json!(true)) {
        let folder = std::path::PathBuf::from(results.pointer("/pack/folder").and_then(|f| f.as_str()).unwrap_or(""));
        let files: Vec<String> = results.pointer("/pack/files").and_then(|f| f.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect()).unwrap_or_default();
        let checked: Vec<bool> = files.iter().map(|f| magic_ok(&folder.join(f))).collect();
        // A printed paper embeds its fonts (≈180 KB); an error page printed instead is ≈10 KB.
        let pdf_size = files.iter().filter(|f| f.ends_with(".pdf")).map(|f| std::fs::metadata(folder.join(f)).map(|m| m.len()).unwrap_or(0)).min().unwrap_or(0);
        results["pack"]["pdfBytes"] = json!(pdf_size);
        pack_ok = files.len() == 4 && checked.iter().all(|c| *c) && pdf_size > 50_000;
        results["pack"]["checked"] = json!(checked);
    }
    results["packOk"] = json!(pack_ok);
    // The release script passes the version it built: an exe that reports another one would update forever.
    let version_ok = match std::env::var("VM_EXPECT_VERSION") {
        Ok(want) => results.pointer("/info/version").and_then(|v| v.as_str()) == Some(want.as_str()),
        Err(_) => true,
    };
    results["versionOk"] = json!(version_ok);
    let ok = ["protocolOk", "engineOk", "editorOk", "voicesOk"].iter().all(|k| results.get(*k) == Some(&json!(true))) && pack_ok && version_ok;
    finish(&app, results, ok);
}
