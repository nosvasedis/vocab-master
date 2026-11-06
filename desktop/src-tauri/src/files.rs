//! Saving files: Word, PDF, packs (one folder chosen once), anchor downloads (backups, results, tracks).
//! Native Save / folder windows start where the teacher saved last time. Only files saved in this session may be
//! opened or shown from the pages.
use crate::AppState;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_dialog::{DialogExt, FilePath};

/// The same cleaning the pages and the Electron app used for file and folder names.
pub fn clean(s: &str) -> String {
    let mut out = String::new();
    let mut last_bad = false;
    for c in s.chars() {
        if matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|') {
            if !last_bad {
                out.push('-');
            }
            last_bad = true;
        } else {
            out.push(c);
            last_bad = false;
        }
    }
    let collapsed = out.split_whitespace().collect::<Vec<_>>().join(" ");
    let trimmed = collapsed.trim_end_matches(['.', ' ']);
    trimmed.chars().take(150).collect()
}

pub fn friendly_fs_error(e: &std::io::Error) -> String {
    // ERROR_SHARING_VIOLATION (32), ERROR_LOCK_VIOLATION (33), access denied (5): open in Word.
    if matches!(e.raw_os_error(), Some(32) | Some(33) | Some(5)) || e.kind() == std::io::ErrorKind::PermissionDenied {
        return "The file is open in another program (e.g. Word). Close it and try again.".into();
    }
    e.to_string()
}

#[derive(Default)]
pub struct Saved(pub Mutex<std::collections::HashSet<String>>);

struct Pack {
    folder: PathBuf,
    written: Vec<String>,
}

#[derive(Default)]
pub struct Packs(Mutex<HashMap<String, Pack>>);

fn header(req: &Request<'_>, name: &str) -> String {
    req.headers()
        .get(format!("x-vm-{name}"))
        .and_then(|v| v.to_str().ok())
        .map(|v| percent_encoding::percent_decode_str(v).decode_utf8_lossy().into_owned())
        .unwrap_or_default()
}

fn body(req: &Request<'_>) -> Result<Vec<u8>, String> {
    match req.body() {
        InvokeBody::Raw(b) => Ok(b.clone()),
        _ => Err("No file data.".into()),
    }
}

fn to_path(p: FilePath) -> Option<PathBuf> {
    p.into_path().ok()
}

fn main_window<R: Runtime>(app: &AppHandle<R>) -> Option<tauri::WebviewWindow<R>> {
    app.get_webview_window("main")
}

/// Native Save As starting in the last folder; remembers the folder chosen.
fn ask_save_path(app: &AppHandle, state: &AppState, filename: &str, title: &str, filter: (&str, &[&str]), start: Option<PathBuf>, all_files: bool) -> Option<PathBuf> {
    let dir = start.unwrap_or_else(|| state.store.last_save_dir());
    let mut d = app.dialog().file().set_title(title).set_directory(&dir).set_file_name(filename).add_filter(filter.0, filter.1);
    if all_files && filter.1 != ["*"] {
        d = d.add_filter("All files", &["*"]);
    }
    if let Some(w) = main_window(app) {
        d = d.set_parent(&w);
    }
    let path = to_path(d.blocking_save_file()?)?;
    Some(path)
}

fn ask_folder(app: &AppHandle, state: &AppState, title: &str) -> Option<PathBuf> {
    let mut d = app.dialog().file().set_title(title).set_directory(state.store.last_save_dir());
    if let Some(w) = main_window(app) {
        d = d.set_parent(&w);
    }
    to_path(d.blocking_pick_folder()?)
}

fn write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    std::fs::write(path, bytes).map_err(|e| friendly_fs_error(&e))
}

/// The Save window for a file kind (by extension), as the Electron app's downloads used.
fn kind_for(name: &str) -> (&'static str, &'static str, (&'static str, &'static [&'static str])) {
    let ext = name.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase()).unwrap_or_default();
    match ext.as_str() {
        "wav" => ("Save listening track", "music", ("Audio (WAV)", &["wav"])),
        "mp3" => ("Save listening track", "music", ("Audio (MP3)", &["mp3"])),
        "json" => ("Save Vocab Master backup", "documents", ("Vocab Master backup", &["json"])),
        "docx" => ("Save Word document", "documents", ("Word document", &["docx"])),
        "pdf" => ("Save PDF", "documents", ("PDF", &["pdf"])),
        "png" => ("Save picture", "pictures", ("Picture", &["png"])),
        "txt" => ("Save text", "documents", ("Text", &["txt"])),
        "csv" => ("Save results", "documents", ("Spreadsheet (CSV)", &["csv"])),
        _ => ("Save file", "downloads", ("All files", &["*"])),
    }
}

/* ── Commands ─────────────────────────────────────────────────────────── */

/// Word (or any) file from the page → Save As. Body: the bytes; headers: name, kind.
#[tauri::command]
pub async fn save_file(app: AppHandle, state: State<'_, AppState>, request: Request<'_>) -> Result<Value, String> {
    let bytes = body(&request)?;
    let name = header(&request, "name");
    let name = if name.is_empty() { "worksheet.docx".to_string() } else { name };
    let Some(path) = ask_save_path(&app, &state, &name, "Save Word document", ("Word document", &["docx"]), None, false) else {
        return Ok(json!({ "ok": false, "canceled": true }));
    };
    if let Some(dir) = path.parent() {
        state.store.remember_save_dir(dir);
    }
    if let Err(e) = write(&path, &bytes) {
        return Ok(json!({ "ok": false, "error": e }));
    }
    state.saved.0.lock().unwrap().insert(path.display().to_string());
    Ok(json!({ "ok": true, "path": path.display().to_string() }))
}

#[tauri::command]
pub async fn export_pdf(app: AppHandle, state: State<'_, AppState>, html: String, filename: String, footer: String) -> Result<Value, String> {
    let pdf = match crate::pdf::html_to_pdf(&app, html, &footer).await {
        Ok(p) => p,
        Err(e) => return Ok(json!({ "ok": false, "error": e })),
    };
    let name = if filename.is_empty() { "worksheet.pdf".to_string() } else { filename };
    let Some(path) = ask_save_path(&app, &state, &name, "Save worksheet PDF", ("PDF", &["pdf"]), None, false) else {
        return Ok(json!({ "ok": false, "canceled": true }));
    };
    if let Some(dir) = path.parent() {
        state.store.remember_save_dir(dir);
    }
    if let Err(e) = write(&path, &pdf) {
        return Ok(json!({ "ok": false, "error": e }));
    }
    state.saved.0.lock().unwrap().insert(path.display().to_string());
    Ok(json!({ "ok": true, "path": path.display().to_string() }))
}

/// Start a pack: the folder window (the smoke test uses its own folder), then the pack's folder inside it.
#[tauri::command]
pub async fn pack_begin(app: AppHandle, state: State<'_, AppState>, packs: State<'_, Packs>, folder_name: String, title: String) -> Result<Value, String> {
    let chosen = if state.smoke {
        Some(state.store.dir().join("pack-check"))
    } else {
        ask_folder(&app, &state, if title.is_empty() { "Choose a folder for the pack" } else { &title })
    };
    let Some(chosen) = chosen else { return Ok(json!({ "ok": false, "canceled": true })) };
    if !state.smoke {
        state.store.remember_save_dir(&chosen);
    }
    let name = clean(&folder_name);
    let folder = chosen.join(if name.is_empty() { "Pack".to_string() } else { name });
    if let Err(e) = std::fs::create_dir_all(&folder) {
        return Ok(json!({ "ok": false, "error": friendly_fs_error(&e) }));
    }
    let token = crate::loopback::random_token(16);
    packs.0.lock().unwrap().insert(token.clone(), Pack { folder: folder.clone(), written: vec![] });
    Ok(json!({ "ok": true, "token": token, "folder": folder.display().to_string() }))
}

fn pack_file(packs: &Packs, token: &str, name: &str) -> Result<Option<PathBuf>, String> {
    let name = clean(name);
    if name.is_empty() {
        return Ok(None);
    }
    let g = packs.0.lock().unwrap();
    let p = g.get(token).ok_or("This pack has already finished.")?;
    Ok(Some(p.folder.join(name)))
}

fn note_written(packs: &Packs, saved: &Saved, token: &str, path: &Path) {
    if let Some(p) = packs.0.lock().unwrap().get_mut(token) {
        p.written.push(path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default());
    }
    saved.0.lock().unwrap().insert(path.display().to_string());
}

/// One file of a pack. Body: the bytes; headers: token, name.
#[tauri::command]
pub async fn pack_write(state: State<'_, AppState>, packs: State<'_, Packs>, request: Request<'_>) -> Result<(), String> {
    let bytes = body(&request)?;
    let token = header(&request, "token");
    let Some(path) = pack_file(&packs, &token, &header(&request, "name"))? else { return Ok(()) };
    write(&path, &bytes)?;
    note_written(&packs, &state.saved, &token, &path);
    Ok(())
}

#[tauri::command]
pub async fn pack_pdf(app: AppHandle, state: State<'_, AppState>, packs: State<'_, Packs>, token: String, name: String, html: String, footer: String) -> Result<(), String> {
    let Some(path) = pack_file(&packs, &token, &name)? else { return Ok(()) };
    let pdf = crate::pdf::html_to_pdf(&app, html, &footer).await?;
    write(&path, &pdf)?;
    note_written(&packs, &state.saved, &token, &path);
    Ok(())
}

#[tauri::command]
pub async fn pack_end(state: State<'_, AppState>, packs: State<'_, Packs>, token: String, cancel: bool) -> Result<Value, String> {
    let Some(p) = packs.0.lock().unwrap().remove(&token) else { return Ok(json!({ "ok": false, "error": "This pack has already finished." })) };
    if cancel {
        return Ok(json!({ "ok": false }));
    }
    state.saved.0.lock().unwrap().insert(p.folder.display().to_string());
    Ok(json!({ "ok": true, "folder": p.folder.display().to_string(), "files": p.written }))
}

/// An anchor download from the page → the Save window for its kind. Returns { state, filename, path }.
#[tauri::command]
pub async fn save_download(app: AppHandle, state: State<'_, AppState>, request: Request<'_>) -> Result<Value, String> {
    let bytes = body(&request)?;
    let suggested = {
        let n = header(&request, "name");
        let n = clean(&n);
        if n.is_empty() { "download".to_string() } else { n }
    };
    let (title, folder, filter) = kind_for(&suggested);
    let start = Some(crate::paths::known_folder(folder));
    let Some(path) = ask_save_path(&app, &state, &suggested, title, filter, start, true) else {
        return Ok(json!({ "state": "cancelled", "filename": suggested, "path": "" }));
    };
    match std::fs::write(&path, &bytes) {
        Ok(()) => {
            state.saved.0.lock().unwrap().insert(path.display().to_string());
            Ok(json!({ "state": "completed", "filename": path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or(suggested), "path": path.display().to_string() }))
        }
        Err(e) => {
            eprintln!("download write failed {e}");
            Ok(json!({ "state": "interrupted", "filename": suggested, "path": "" }))
        }
    }
}

#[tauri::command]
pub fn open_path(app: AppHandle, state: State<'_, AppState>, path: String) -> String {
    if !state.saved.0.lock().unwrap().contains(&path) {
        return "Not allowed".into();
    }
    use tauri_plugin_opener::OpenerExt;
    match app.opener().open_path(&path, None::<&str>) {
        Ok(()) => String::new(),
        Err(e) => e.to_string(),
    }
}

#[tauri::command]
pub fn show_item(app: AppHandle, state: State<'_, AppState>, path: String) {
    if state.saved.0.lock().unwrap().contains(&path) {
        use tauri_plugin_opener::OpenerExt;
        let _ = app.opener().reveal_item_in_dir(&path);
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn clean_matches_the_pages() {
        // JS: s.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").slice(0, 150)
        assert_eq!(super::clean("Test pack, CPP2, Unit 4"), "Test pack, CPP2, Unit 4");
        assert_eq!(super::clean("a/b\\c::d"), "a-b-c-d");
        assert_eq!(super::clean("  x   y.. "), "x y");
        assert_eq!(super::clean("Λέξεις «A»"), "Λέξεις «A»");
        assert_eq!(super::clean(&"z".repeat(200)).len(), 150);
    }
}
