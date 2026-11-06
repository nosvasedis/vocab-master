//! Updates of the app itself (the exe), for the rare changes live updates can't carry (the shell, voice clips).
//!   - Installed with the Setup exe: the new installer is downloaded from the latest GitHub release in the
//!     background (tauri-plugin-updater, latest.json, signature checked) and installed quietly when the teacher
//!     presses Restart to update (the app reopens) or quits (it doesn't).
//!   - The portable exe can't replace itself: the teacher is told a new version exists, with a download link.
use crate::live::{is_newer_version, REPO};
use serde_json::{json, Value};
use std::sync::Mutex;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

pub struct ExeUpdater {
    portable: bool,
    status: Mutex<Value>,
    ready: Mutex<Option<(tauri_plugin_updater::Update, Vec<u8>)>>,
    busy: Mutex<bool>,
    listeners: Mutex<Vec<Box<dyn Fn() + Send + Sync>>>,
}

/// The NSIS installer leaves uninstall.exe beside the app; the portable exe has none.
pub fn is_portable() -> bool {
    if std::env::var_os("VM_PORTABLE").is_some() {
        return true;
    }
    let Ok(exe) = std::env::current_exe() else { return true };
    !exe.parent().map(|d| d.join("uninstall.exe").exists()).unwrap_or(false)
}

impl ExeUpdater {
    pub fn new() -> Self {
        let portable = is_portable();
        ExeUpdater {
            portable,
            status: Mutex::new(json!({ "kind": if portable { "portable" } else { "installer" }, "state": "idle", "version": "", "url": "", "progress": 0 })),
            ready: Mutex::new(None),
            busy: Mutex::new(false),
            listeners: Mutex::new(Vec::new()),
        }
    }

    pub fn status(&self) -> Value {
        self.status.lock().unwrap().clone()
    }

    pub fn on_change(&self, f: Box<dyn Fn() + Send + Sync>) {
        self.listeners.lock().unwrap().push(f);
    }

    fn set(&self, next: Value) {
        {
            let mut s = self.status.lock().unwrap();
            if let (Some(st), Some(old)) = (next.get("state").and_then(|v| v.as_str()), s.get("state").and_then(|v| v.as_str())) {
                if st != old {
                    eprintln!("exe: {st} {}", next.get("version").and_then(|v| v.as_str()).unwrap_or(""));
                }
            }
            if let (Value::Object(m), Value::Object(n)) = (&mut *s, next) {
                for (k, v) in n {
                    m.insert(k, v);
                }
            }
        }
        for f in self.listeners.lock().unwrap().iter() {
            f();
        }
    }

    pub async fn check(&self, app: &AppHandle) -> Value {
        if cfg!(debug_assertions) && std::env::var_os("VM_EXE_UPDATES").is_none() {
            return self.status();
        }
        if self.status()["state"] == "ready" {
            return self.status();
        }
        {
            let mut b = self.busy.lock().unwrap();
            if *b {
                return self.status();
            }
            *b = true;
        }
        let r = self.check_inner(app).await;
        *self.busy.lock().unwrap() = false;
        if let Err(e) = r {
            eprintln!("exe: check failed {e}");
            self.set(json!({ "state": "error" }));
        }
        self.status()
    }

    async fn check_inner(&self, app: &AppHandle) -> Result<(), String> {
        let current = app.package_info().version.to_string();
        if self.portable {
            let rel: Value = serde_json::from_slice(&crate::net::https_get(&format!("https://api.github.com/repos/{REPO}/releases/latest"), true).await?).map_err(|e| e.to_string())?;
            let tag = rel.get("tag_name").and_then(|t| t.as_str()).unwrap_or("").to_string();
            if !tag.is_empty() && is_newer_version(&tag, &current) {
                let url = rel.get("html_url").and_then(|u| u.as_str()).map(str::to_string).unwrap_or_else(|| format!("https://github.com/{REPO}/releases/latest"));
                self.set(json!({ "state": "available", "version": tag.trim_start_matches(['v', 'V']), "url": url }));
            } else {
                self.set(json!({ "state": "current" }));
            }
            return Ok(());
        }
        // Testing: VM_UPDATE_URL=http://127.0.0.1:<port>/latest.json reads another update manifest (still signed with
        // the app's key, so it can only offer builds signed by the release key).
        let updater = match std::env::var("VM_UPDATE_URL").ok().and_then(|u| url::Url::parse(&u).ok()) {
            Some(u) => app.updater_builder().endpoints(vec![u]).map_err(|e| e.to_string())?.build(),
            None => app.updater(),
        }
        .map_err(|e| e.to_string())?;
        let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
            self.set(json!({ "state": "current" }));
            return Ok(());
        };
        let version = update.version.clone();
        self.set(json!({ "state": "downloading", "version": version, "progress": 0 }));
        let mut got: usize = 0;
        let mut last = 0u64;
        let bytes = update
            .download(
                |chunk, total| {
                    got += chunk;
                    if let Some(t) = total.filter(|t| *t > 0) {
                        let p = ((got as f64 / t as f64) * 100.0).round() as u64;
                        if p >= last + 5 || p == 100 {
                            last = p;
                            self.set(json!({ "progress": p }));
                        }
                    }
                },
                || {},
            )
            .await
            .map_err(|e| e.to_string())?;
        *self.ready.lock().unwrap() = Some((update, bytes));
        self.set(json!({ "state": "ready", "version": version, "progress": 100 }));
        Ok(())
    }

    /// Install the downloaded version (installer only): the installer runs quietly and this app exits.
    /// `reopen`: start the new version afterwards (Restart to update), or not (quitting).
    pub fn install(&self, reopen: bool) -> bool {
        if self.portable || self.status()["state"] != "ready" {
            return false;
        }
        let Some((update, bytes)) = self.ready.lock().unwrap().take() else { return false };
        let update = update.restart_after_install(reopen);
        match update.install(&bytes) {
            Ok(()) => true, // on Windows install() exits the process
            Err(e) => {
                eprintln!("exe: install failed {e}");
                self.set(json!({ "state": "error" }));
                false
            }
        }
    }
}
