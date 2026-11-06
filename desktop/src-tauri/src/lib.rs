//! Vocab Master — the Tauri app shell (replaces the Electron main process, desktop/main.js).
//!   - the `app` scheme serves the pages (protocol.rs; the live copy when there is one, live.rs)
//!   - window.desktop for the pages (shim/desktop.js) → the commands below
//!   - AI requests (DeepSeek, Gemini, ChatGPT) go out from here: no CORS, keys and tokens stay here
//!   - files: store.json & co. in the same data folder as before; keys encrypted the same way (keychain.rs)
//!   - Word files are built by the pages themselves; PDFs printed by WebView2's Chromium (pdf.rs)
//!   - updates: live pages (live.rs) and the exe (exe.rs)
pub mod assets;
pub mod chatgpt;
pub mod exe;
pub mod files;
pub mod google;
pub mod keychain;
pub mod live;
pub mod loopback;
pub mod net;
pub mod paths;
pub mod pdf;
pub mod protocol;
pub mod smoke;
pub mod store;

use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Manager, RunEvent, State, WebviewUrl, WebviewWindowBuilder};

const SHIM: &str = include_str!("../shim/desktop.js");

pub struct AppState {
    pub store: store::Store,
    pub keychain: Arc<keychain::Keychain>,
    pub live: Arc<live::LiveUpdater>,
    pub exe: Arc<exe::ExeUpdater>,
    pub saved: files::Saved,
    pub google: Arc<google::Google>,
    pub chatgpt: Mutex<Option<Arc<chatgpt::ChatGPT>>>,
    pub smoke: bool,
    pub alive_timer: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
    pub alive_seen: std::sync::atomic::AtomicBool,
}

fn state(app: &AppHandle) -> State<'_, AppState> {
    app.state::<AppState>()
}

/* ── Events to the pages ─────────────────────────────────────────────── */

/// window.__vmShell.emit(name, payload) in the main window (shim/desktop.js).
pub fn emit_to_page(app: &AppHandle, name: &str, payload: &Value) {
    if let Some(w) = app.get_webview_window("main") {
        let js = format!("window.__vmShell && window.__vmShell.emit({}, {})", json!(name), payload);
        let _ = w.eval(js);
    }
}

pub fn updates_info(app: &AppHandle) -> Value {
    let st = state(app);
    let mut info = st.live.info();
    info["version"] = json!(app.package_info().version.to_string());
    info["shell"] = json!(live::SHELL_API);
    info["exe"] = st.exe.status();
    info
}

fn send_updates(app: &AppHandle) {
    let info = updates_info(app);
    emit_to_page(app, "updates:changed", &info);
}

/* ── Pages: reload, the "I started" watchdog, relaunch ────────────────── */

fn reload_pages(app: &AppHandle) {
    let st = state(app);
    if let Some(t) = st.alive_timer.lock().unwrap().take() {
        t.abort();
    }
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.navigate(protocol::app_url("index.html"));
    }
}

/// The live pages must say "I started" soon after loading; otherwise they are set aside and the window reloads.
fn watch_alive(app: &AppHandle) {
    let st = state(app);
    if let Some(t) = st.alive_timer.lock().unwrap().take() {
        t.abort();
    }
    st.alive_seen.store(false, std::sync::atomic::Ordering::SeqCst);
    if !st.live.is_active() {
        return;
    }
    let app2 = app.clone();
    let handle = tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(45)).await;
        let st = state(&app2);
        if !st.alive_seen.load(std::sync::atomic::Ordering::SeqCst) && st.live.is_active() {
            st.live.revert("the pages did not start");
            reload_pages(&app2);
        }
    });
    *st.alive_timer.lock().unwrap() = Some(handle);
}

/// Start the app again (the new copy waits for this one to close: --relaunch=<pid>).
fn relaunch(app: &AppHandle) {
    if let Ok(exe) = std::env::current_exe() {
        let args: Vec<String> = std::env::args().skip(1).filter(|a| !a.starts_with("--relaunch") && !a.starts_with("--smoke")).collect();
        let _ = std::process::Command::new(exe).args(args).arg(format!("--relaunch={}", std::process::id())).spawn();
    }
    app.exit(0);
}

/// A relaunched copy waits (up to 8 s) for the old one to exit, so the single-instance check lets it start.
fn wait_for_previous() {
    let Some(pid) = std::env::args().find_map(|a| a.strip_prefix("--relaunch=").and_then(|p| p.parse::<u32>().ok())) else { return };
    #[cfg(windows)]
    unsafe {
        use windows::Win32::Foundation::CloseHandle;
        use windows::Win32::System::Threading::{OpenProcess, WaitForSingleObject, PROCESS_SYNCHRONIZE};
        if let Ok(h) = OpenProcess(PROCESS_SYNCHRONIZE, false, pid) {
            let _ = WaitForSingleObject(h, 8000);
            let _ = CloseHandle(h);
        }
    }
    #[cfg(not(windows))]
    let _ = pid;
}

/* ── Window ──────────────────────────────────────────────────────────── */

#[derive(Default, Clone, Copy)]
struct Bounds {
    x: Option<f64>,
    y: Option<f64>,
    w: f64,
    h: f64,
    maximized: bool,
}

/// Saved bounds (window.json, logical pixels), without a position that would be off every screen.
fn load_bounds(app: &AppHandle) -> Option<Bounds> {
    let b = state(app).store.read_json("window.json")?;
    let num = |k: &str| b.get(k).and_then(|v| v.as_f64()).filter(|v| v.is_finite());
    let (w, h) = (num("width")?, num("height")?);
    let maximized = b.get("maximized").and_then(|v| v.as_bool()).unwrap_or(false);
    let (x, y) = (num("x"), num("y"));
    let mut out = Bounds { x: None, y: None, w, h, maximized };
    if let (Some(x), Some(y)) = (x, y) {
        let visible = app.available_monitors().unwrap_or_default().iter().any(|m| {
            let s = m.scale_factor();
            let a = m.work_area();
            let (ax, ay, aw, ah) = (a.position.x as f64 / s, a.position.y as f64 / s, a.size.width as f64 / s, a.size.height as f64 / s);
            x + 80.0 < ax + aw && x + w - 80.0 > ax && y >= ay - 10.0 && y + 40.0 < ay + ah
        });
        if visible {
            out.x = Some(x);
            out.y = Some(y);
        }
    }
    Some(out)
}

fn save_bounds(win: &tauri::WebviewWindow) {
    let app = win.app_handle().clone();
    if win.is_minimized().unwrap_or(false) {
        return;
    }
    let maximized = win.is_maximized().unwrap_or(false);
    let st = state(&app);
    let mut b = st.store.read_json("window.json").unwrap_or_else(|| json!({}));
    if !b.is_object() {
        b = json!({});
    }
    // Keep the normal (restored) size while maximized, so un-maximizing next launch still looks right.
    if !maximized {
        let s = win.scale_factor().unwrap_or(1.0);
        if let (Ok(p), Ok(sz)) = (win.outer_position(), win.inner_size()) {
            b["x"] = json!((p.x as f64 / s).round());
            b["y"] = json!((p.y as f64 / s).round());
            b["width"] = json!((sz.width as f64 / s).round());
            b["height"] = json!((sz.height as f64 / s).round());
        }
    }
    b["maximized"] = json!(maximized);
    st.store.write_json("window.json", &b);
}

pub fn browser_args() -> String {
    // Tauri's defaults plus: sound may start without a click first (as in the Electron app: the games' sounds).
    let mut args = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required".to_string();
    // Development only: VM_DEBUG_PORT=9333 lets a test drive the window over the DevTools protocol.
    if cfg!(debug_assertions) {
        if let Some(port) = std::env::var("VM_DEBUG_PORT").ok().and_then(|p| p.parse::<u16>().ok()) {
            args.push_str(&format!(" --remote-debugging-port={port}"));
        }
    }
    args
}

pub fn webview_data_dir(app: &AppHandle) -> std::path::PathBuf {
    state(app).store.dir().join("WebView2")
}

fn create_window(app: &AppHandle) -> tauri::Result<()> {
    let saved = load_bounds(app);
    let nav_app = app.clone();
    let win_app = app.clone();
    let load_app = app.clone();
    let mut b = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(protocol::app_url("index.html")))
        .title("Vocab Master")
        .inner_size(saved.map(|b| b.w).unwrap_or(1280.0), saved.map(|b| b.h).unwrap_or(860.0))
        .min_inner_size(980.0, 680.0)
        .visible(false)
        .use_https_scheme(true)
        .data_directory(webview_data_dir(app))
        .additional_browser_args(&browser_args())
        .initialization_script(SHIM)
        .disable_drag_drop_handler()
        .zoom_hotkeys_enabled(true)
        // The app never navigates away from its own page (a dropped file or stray link): web links open in the browser.
        .on_navigation(move |url| {
            if protocol::is_app_url(url) {
                return true;
            }
            if url.scheme() == "https" || url.scheme() == "http" {
                use tauri_plugin_opener::OpenerExt;
                let _ = nav_app.opener().open_url(url.as_str(), None::<&str>);
            }
            false
        })
        .on_new_window(move |url, _features| {
            if url.scheme() == "https" || url.scheme() == "http" {
                use tauri_plugin_opener::OpenerExt;
                let _ = win_app.opener().open_url(url.as_str(), None::<&str>);
            }
            tauri::webview::NewWindowResponse::Deny
        })
        .on_page_load(move |w, payload| {
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                let _ = w.show();
                watch_alive(&load_app);
                if state(&load_app).smoke {
                    smoke::run(&load_app);
                }
            }
        });
    if let Some(s) = saved {
        if let (Some(x), Some(y)) = (s.x, s.y) {
            b = b.position(x, y);
        }
    }
    let win = b.build()?;
    if saved.map(|s| s.maximized).unwrap_or(false) {
        let _ = win.maximize();
    }
    let _ = win.set_background_color(Some(match win.theme().unwrap_or(tauri::Theme::Light) {
        tauri::Theme::Dark => tauri::window::Color(0x0a, 0x0b, 0x12, 255),
        _ => tauri::window::Color(0xf4, 0xf5, 0xfa, 255),
    }));
    // Show even if the first load is slow, so the app never seems not to start.
    let w2 = win.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(4)).await;
        let _ = w2.show();
    });
    let timer: Arc<Mutex<Option<tauri::async_runtime::JoinHandle<()>>>> = Arc::new(Mutex::new(None));
    let w3 = win.clone();
    win.on_window_event(move |e| {
        if matches!(e, tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_)) {
            let w = w3.clone();
            let mut t = timer.lock().unwrap();
            if let Some(old) = t.take() {
                old.abort();
            }
            *t = Some(tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_millis(400)).await;
                save_bounds(&w);
            }));
        }
    });
    watch_renderer(app, &win);
    Ok(())
}

/// The page process crashed: reload (and set live pages aside if they never started).
#[cfg(windows)]
fn watch_renderer(app: &AppHandle, win: &tauri::WebviewWindow) {
    let app = app.clone();
    let _ = win.with_webview(move |pw| unsafe {
        use webview2_com::ProcessFailedEventHandler;
        let Ok(core) = pw.controller().CoreWebView2() else { return };
        let handler = ProcessFailedEventHandler::create(Box::new(move |_, _| {
            let st = state(&app);
            if st.live.is_active() && !st.alive_seen.load(std::sync::atomic::Ordering::SeqCst) {
                st.live.revert("the page process stopped");
            }
            let a = app.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_millis(500)).await;
                reload_pages(&a);
            });
            Ok(())
        }));
        let mut token = Default::default();
        let _ = core.add_ProcessFailed(&handler, &mut token);
    });
}
#[cfg(not(windows))]
fn watch_renderer(_: &AppHandle, _: &tauri::WebviewWindow) {}

fn open_external(app: &AppHandle, url: &str) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

fn focus_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/* ── Commands: storage, keys, AI ─────────────────────────────────────── */

#[tauri::command]
fn storage_get_all(state: State<'_, AppState>) -> Value {
    state.store.get_all()
}
#[tauri::command]
fn storage_set(state: State<'_, AppState>, key: String, value: Value) -> bool {
    state.store.set(key, value);
    true
}
#[tauri::command]
fn storage_remove(state: State<'_, AppState>, key: String) -> bool {
    state.store.remove(&key);
    true
}
#[tauri::command]
fn keychain_get(state: State<'_, AppState>, name: String) -> Option<String> {
    state.keychain.get(&name)
}
#[tauri::command]
fn keychain_set(state: State<'_, AppState>, value: String, name: String) -> bool {
    state.keychain.set(&value, &name);
    true
}

#[tauri::command]
async fn deepseek_chat(body: String, auth: String) -> net::ApiResponse {
    net::deepseek("POST", "/chat/completions", &auth, Some(if body.is_empty() { "{}".into() } else { body }), net::MAX_REQUEST).await
}
#[tauri::command]
async fn deepseek_balance(api_key: String) -> net::ApiResponse {
    net::deepseek("GET", "/user/balance", &format!("Bearer {}", api_key.trim()), None, Duration::from_secs(20)).await
}
#[tauri::command]
async fn gemini_request(method: String, path: String, api_key: String, body: Option<String>) -> net::ApiResponse {
    net::gemini(&method, &path, &api_key, body).await
}

/* ── ChatGPT ─────────────────────────────────────────────────────────── */

fn chatgpt_runtime(app: &AppHandle) -> Result<Arc<chatgpt::ChatGPT>, chatgpt::CgError> {
    let st = state(app);
    if let Some(c) = st.chatgpt.lock().unwrap().clone() {
        return Ok(c);
    }
    let file = st.store.file("chatgpt-accounts.bin");
    let (k1, k2) = (st.keychain.clone(), st.keychain.clone());
    let (f1, f2) = (file.clone(), file);
    let rt = chatgpt::ChatGPT::new(
        Box::new(move || k1.read_secret_json(&f1)),
        Box::new(move |v| k2.write_secret_json(&f2, v)),
        chatgpt::reqwest_transport(),
        Arc::new(|| store::now_ms() as i64),
        Duration::from_secs(300),
        Duration::from_secs(240),
    )?;
    *st.chatgpt.lock().unwrap() = Some(rt.clone());
    Ok(rt)
}

#[tauri::command]
async fn chatgpt_action(app: AppHandle, action: String, payload: Option<Value>) -> Value {
    let payload = payload.unwrap_or(Value::Null);
    let result: Result<Value, chatgpt::CgError> = async {
        let rt = chatgpt_runtime(&app)?;
        match action.as_str() {
            "status" => Ok(rt.status()),
            "signIn" => {
                let url = rt.start_sign_in(payload.get("accountId").and_then(|v| v.as_str()).unwrap_or("")).await?;
                if open_external(&app, &url).is_err() {
                    rt.cancel_sign_in();
                    return Err(chatgpt::CgError { code: "chatgpt_error".into(), message: "Couldn't open your browser. Please try again.".into(), status: 0, param: String::new() });
                }
                Ok(rt.status())
            }
            "cancel" => { rt.cancel_sign_in(); Ok(rt.status()) }
            "models" => rt.list_models().await,
            "model" => rt.select_model(payload.get("model").and_then(|v| v.as_str()).unwrap_or("")),
            "account" => rt.select_account(payload.get("accountId").and_then(|v| v.as_str()).unwrap_or("")),
            "signOut" => rt.sign_out().await,
            "acknowledge" => Ok(rt.acknowledge()),
            "usage" => { let _ = open_external(&app, chatgpt::USAGE_URL); Ok(rt.status()) }
            "generate" => rt.generate(&payload).await,
            _ => Err(chatgpt::CgError { code: "chatgpt_error".into(), message: "Unknown ChatGPT action.".into(), status: 0, param: String::new() }),
        }
    }
    .await;
    match result {
        Ok(value) => json!({ "ok": true, "value": value }),
        Err(e) => json!({ "ok": false, "error": chatgpt::friendly(&e.code, &e.message), "code": if e.code.is_empty() { "chatgpt_error".to_string() } else { e.code } }),
    }
}

/* ── Google sign-in ──────────────────────────────────────────────────── */

#[tauri::command]
async fn google_signin(app: AppHandle) -> Value {
    let google = state(&app).google.clone();
    let a = app.clone();
    let r = google.start(move |url| open_external(&a, url), Duration::from_secs(300)).await;
    focus_main(&app);
    r
}
#[tauri::command]
fn google_cancel(state: State<'_, AppState>) -> bool {
    state.google.cancel();
    true
}

/* ── App info, folders, window ───────────────────────────────────────── */

#[tauri::command]
fn app_info(app: AppHandle, state: State<'_, AppState>) -> Value {
    json!({
        "version": app.package_info().version.to_string(),
        "shell": "tauri",
        "tauri": tauri::VERSION,
        "webview": tauri::webview_version().unwrap_or_default(),
        "platform": if cfg!(windows) { "win32" } else { std::env::consts::OS },
        "userData": state.store.dir().display().to_string(),
    })
}

#[tauri::command]
fn open_data_folder(app: AppHandle, state: State<'_, AppState>) {
    use tauri_plugin_opener::OpenerExt;
    let _ = app.opener().open_path(state.store.dir().display().to_string(), None::<&str>);
}

#[tauri::command]
fn toggle_fullscreen(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let on = w.is_fullscreen().unwrap_or(false);
        let _ = w.set_fullscreen(!on);
    }
}

/* ── Updates ─────────────────────────────────────────────────────────── */

#[tauri::command]
fn updates_alive(state: State<'_, AppState>) -> Value {
    state.alive_seen.store(true, std::sync::atomic::Ordering::SeqCst);
    if let Some(t) = state.alive_timer.lock().unwrap().take() {
        t.abort();
    }
    state.live.alive()
}
#[tauri::command]
fn updates_status(app: AppHandle) -> Value {
    updates_info(&app)
}
#[tauri::command]
async fn updates_check(app: AppHandle) -> Value {
    let (live, exe) = { let st = state(&app); (st.live.clone(), st.exe.clone()) };
    let _ = tokio::join!(live.check(true), exe.check(&app));
    updates_info(&app)
}
#[tauri::command]
fn updates_set_auto(app: AppHandle, on: bool) -> Value {
    state(&app).live.set_auto(on);
    updates_info(&app)
}
/// "Update now": a new exe installs and reopens; new pages are swapped in and the window reloads (no restart).
#[tauri::command]
fn updates_restart(app: AppHandle) -> &'static str {
    let st = state(&app);
    if st.exe.status()["state"] == "ready" {
        let exe = st.exe.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(150)).await;
            exe.install(true);
        });
        return "installing";
    }
    if st.live.apply_pending() {
        let a = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(150)).await;
            reload_pages(&a);
        });
        return "reloading";
    }
    let a = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(150)).await;
        relaunch(&a);
    });
    "restarting"
}
#[tauri::command]
fn updates_download(app: AppHandle) -> bool {
    let url = state(&app).exe.status()["url"].as_str().filter(|u| !u.is_empty()).map(str::to_string).unwrap_or_else(|| format!("https://github.com/{}/releases/latest", live::REPO));
    if url.starts_with("https://github.com/") {
        let _ = open_external(&app, &url);
    }
    true
}

fn schedule_update_checks(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(20)).await;
        loop {
            let (live, exe) = { let st = state(&app); (st.live.clone(), st.exe.clone()) };
            let _ = tokio::join!(live.check(false), exe.check(&app));
            tokio::time::sleep(Duration::from_secs(3 * 60 * 60)).await;
        }
    });
}

/* ── Start ───────────────────────────────────────────────────────────── */

pub fn run() {
    let smoke = std::env::args().any(|a| a == "--smoke");
    if smoke {
        smoke::attach_console();
    }
    wait_for_previous();
    let data_dir = paths::resolve_data_dir(smoke);
    let packaged = !cfg!(debug_assertions);
    let live_enabled = !smoke && (packaged || std::env::var("VM_LIVE").as_deref() == Ok("1"));
    let live = live::LiveUpdater::new(
        data_dir.join("live"),
        live_enabled,
        std::env::var("VM_LIVE_REPO").unwrap_or_else(|_| live::REPO.into()),
        std::env::var("VM_LIVE_BRANCH").unwrap_or_else(|_| live::BRANCH.into()),
    );
    if let Err(e) = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| live.startup())) {
        eprintln!("live: startup failed {e:?}");
    }
    let app_state = AppState {
        store: store::Store::new(data_dir.clone()),
        keychain: Arc::new(keychain::Keychain::new(data_dir.clone())),
        live: live.clone(),
        exe: Arc::new(exe::ExeUpdater::new()),
        saved: Default::default(),
        google: Arc::new(google::Google::default()),
        chatgpt: Mutex::new(None),
        smoke,
        alive_timer: Mutex::new(None),
        alive_seen: Default::default(),
    };

    let mut builder = tauri::Builder::default();
    if !smoke {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| focus_main(app)));
    }
    let app = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(app_state)
        .manage(pdf::PrintJobs::default())
        .manage(files::Packs::default())
        .register_asynchronous_uri_scheme_protocol(protocol::SCHEME, |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            std::thread::spawn(move || responder.respond(protocol::handle(&app, &request)));
        })
        .invoke_handler(tauri::generate_handler![
            storage_get_all, storage_set, storage_remove, keychain_get, keychain_set,
            deepseek_chat, deepseek_balance, gemini_request, chatgpt_action, google_signin, google_cancel,
            app_info, open_data_folder, toggle_fullscreen,
            updates_alive, updates_status, updates_check, updates_set_auto, updates_restart, updates_download,
            files::save_file, files::export_pdf, files::pack_begin, files::pack_write, files::pack_pdf, files::pack_end,
            files::save_download, files::open_path, files::show_item,
            smoke::smoke_report,
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            let h1 = handle.clone();
            live.on_change(Box::new(move |_| send_updates(&h1)));
            let h2 = handle.clone();
            state(&handle).exe.on_change(Box::new(move || send_updates(&h2)));
            create_window(&handle)?;
            if !smoke {
                schedule_update_checks(&handle);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while starting Vocab Master");

    app.run(|app, event| {
        if let RunEvent::ExitRequested { .. } = event {
            let st = state(app);
            if let Some(c) = st.chatgpt.lock().unwrap().as_ref() {
                c.invalidate();
            }
            // A downloaded new version installs as the app closes (it doesn't reopen).
            if !st.smoke && st.exe.status()["state"] == "ready" {
                st.exe.install(false);
            }
        }
    });
}
