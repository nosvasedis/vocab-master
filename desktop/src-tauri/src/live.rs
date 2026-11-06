//! Live updates of the app's pages from GitHub (no new exe needed) — the Electron app's live-update.js, in Rust,
//! with the same state file and folders (data folder\live\state.json, live\<commit>\), so they carry over.
//!
//! The installed app carries live-base.json: the Git fingerprints (blob SHA-1) of every page file it was built
//! from. In the background the app asks GitHub for the newest commit on main and its file list, and builds a
//! "live" copy of the pages in live\<commit>\:
//!   - every code file (js, css, html, json…) — copied from the installed app when unchanged, downloaded when not;
//!   - pictures and other assets only when they changed (the rest are served from the installed app);
//!   - voice clips never (they aren't in Git; assets/audio/ always comes from the installed app).
//! Every download is checked against its Git fingerprint. The new copy is used from the next start (or at once
//! when the teacher presses Update now). A copy that fails to start is set aside and never tried again; a newer
//! exe clears old copies; a commit that needs a newer app shell (live-requires.json "shell") waits for a new exe.
use serde::Deserialize;
use serde_json::{json, Map, Value};
use sha1::{Digest, Sha1};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

/// What this shell offers the pages (renderer/live-requires.json "shell" says what they need).
/// 1 = the Electron app's window.desktop; 2 = the Tauri shell: the same window.desktop (desktop.js), nothing more yet.
/// Pages that need something only the Tauri shell has raise live-requires.json to 2; Electron apps (1) then wait.
pub const SHELL_API: u64 = 2;
pub const REPO: &str = "nosvasedis/vocab-master";
pub const BRANCH: &str = "main";
const PREFIX: &str = "desktop/renderer/";
const EXCLUDE: [&str; 2] = ["assets/audio/", "live-base.json"];
/// A live update that would download more than this waits for a new exe instead.
pub const MAX_DOWNLOAD: u64 = 150 * 1024 * 1024;

fn is_bulky(rel: &str) -> bool {
    rel.starts_with("assets/") || rel.starts_with("vendor/")
}
fn excluded(rel: &str) -> bool {
    EXCLUDE.iter().any(|p| rel == *p || rel.starts_with(p))
}

/// Git's blob fingerprint of a file's bytes.
pub fn git_blob_sha(buf: &[u8]) -> String {
    let mut h = Sha1::new();
    h.update(format!("blob {}\0", buf.len()).as_bytes());
    h.update(buf);
    hex::encode(h.finalize())
}

/// "3.10.0" > "3.9.2"; a leading "v" is fine.
pub fn is_newer_version(a: &str, b: &str) -> bool {
    let p = |v: &str| -> Vec<u64> { v.trim_start_matches(['v', 'V']).split(['.', '-']).map(|x| x.parse().unwrap_or(0)).collect() };
    let (x, y) = (p(a), p(b));
    for i in 0..x.len().max(y.len()) {
        let (xi, yi) = (x.get(i).copied().unwrap_or(0), y.get(i).copied().unwrap_or(0));
        if xi != yi {
            return xi > yi;
        }
    }
    false
}

#[derive(Debug, Clone, PartialEq)]
pub enum From {
    Bundle,
    Active,
    Download,
}

#[derive(Debug, Clone)]
pub struct PlanFile {
    pub rel: String,
    pub sha: String,
    pub size: u64,
    pub from: From,
}

#[derive(Debug, Default)]
pub struct Plan {
    pub files: Vec<PlanFile>,
    pub deleted: Vec<String>,
    pub download_bytes: u64,
    pub changed: usize,
}

/// What a live folder for `tree` needs. base/active: rel → sha; tree: rel → (sha, size).
pub fn plan_update(base: &HashMap<String, String>, tree: &BTreeMap<String, (String, u64)>, active: Option<&HashMap<String, String>>) -> Plan {
    let mut plan = Plan::default();
    for (rel, (sha, size)) in tree {
        if excluded(rel) {
            continue;
        }
        let same = base.get(rel) == Some(sha);
        if !same {
            plan.changed += 1;
        }
        if same && is_bulky(rel) {
            continue; // the installed app serves it
        }
        let from = if same {
            From::Bundle
        } else if active.and_then(|a| a.get(rel)) == Some(sha) {
            From::Active
        } else {
            From::Download
        };
        if from == From::Download {
            plan.download_bytes += size;
        }
        plan.files.push(PlanFile { rel: rel.clone(), sha: sha.clone(), size: *size, from });
    }
    let mut deleted: Vec<String> = base.keys().filter(|rel| !tree.contains_key(*rel) && !excluded(rel)).cloned().collect();
    deleted.sort();
    plan.changed += deleted.len();
    plan.deleted = deleted;
    plan
}

#[derive(Deserialize, Default, Clone)]
struct Base {
    #[serde(default)]
    commit: String,
    #[serde(default)]
    date: String,
    #[serde(default)]
    files: HashMap<String, String>,
}

#[derive(Clone)]
pub struct Active {
    pub sha: String,
    pub dir: PathBuf,
    pub deleted: HashSet<String>,
    pub message: String,
    pub date: String,
}

/// Where a page request is answered from.
pub enum Source {
    Disk(PathBuf),
    Bundle(String),
    Missing,
}

struct Inner {
    state: Map<String, Value>,
    status: Map<String, Value>,
    busy: bool,
    active: Option<Active>,
}

pub struct LiveUpdater {
    live_root: PathBuf,
    state_file: PathBuf,
    base: Option<Base>,
    enabled: bool,
    repo: String,
    branch: String,
    inner: Mutex<Inner>,
    listeners: Mutex<Vec<Box<dyn Fn(Value) + Send + Sync>>>,
}

fn read_json(file: &Path) -> Option<Value> {
    serde_json::from_slice(&std::fs::read(file).ok()?).ok()
}

fn s(v: &Value, key: &str) -> String {
    v.get(key).and_then(|x| x.as_str()).unwrap_or("").to_string()
}

fn short(sha: &str) -> String {
    sha.chars().take(7).collect()
}

impl LiveUpdater {
    pub fn new(live_root: PathBuf, enabled: bool, repo: String, branch: String) -> Arc<Self> {
        let base: Option<Base> = crate::assets::get("live-base.json").and_then(|b| serde_json::from_slice(&b).ok());
        let state_file = live_root.join("state.json");
        let mut state = Map::new();
        state.insert("auto".into(), json!(true));
        state.insert("bad".into(), json!([]));
        if let Some(Value::Object(saved)) = read_json(&state_file) {
            for (k, v) in saved {
                state.insert(k, v);
            }
        }
        let mut status = Map::new();
        status.insert("state".into(), json!("idle"));
        status.insert("message".into(), json!(""));
        Arc::new(LiveUpdater {
            live_root,
            state_file,
            base,
            enabled,
            repo,
            branch,
            inner: Mutex::new(Inner { state, status, busy: false, active: None }),
            listeners: Mutex::new(Vec::new()),
        })
    }

    fn base_commit(&self) -> String {
        self.base.as_ref().map(|b| b.commit.clone()).unwrap_or_default()
    }

    pub fn on_change(&self, f: Box<dyn Fn(Value) + Send + Sync>) {
        self.listeners.lock().unwrap().push(f);
    }

    fn save(&self, inner: &Inner) {
        let _ = std::fs::create_dir_all(&self.live_root);
        if let Ok(bytes) = serde_json::to_vec_pretty(&Value::Object(inner.state.clone())) {
            if let Err(e) = crate::store::write_atomic(&self.state_file, &bytes) {
                eprintln!("live: state not saved {e}");
            }
        }
    }

    fn set(&self, next: Value) {
        let info = {
            let mut inner = self.inner.lock().unwrap();
            if let Value::Object(m) = next {
                if let Some(st) = m.get("state").and_then(|v| v.as_str()) {
                    if inner.status.get("state").and_then(|v| v.as_str()) != Some(st) {
                        eprintln!("live: {st} {}", m.get("message").and_then(|v| v.as_str()).unwrap_or(""));
                    }
                }
                for (k, v) in m {
                    inner.status.insert(k, v);
                }
            }
            self.info_locked(&inner)
        };
        for f in self.listeners.lock().unwrap().iter() {
            f(info.clone());
        }
    }

    fn manifest_of(dir: &Path) -> Option<Value> {
        read_json(&dir.join("manifest.json"))
    }

    fn usable(&self, entry: Option<&Value>) -> bool {
        let Some(e) = entry.filter(|e| e.is_object()) else { return false };
        let dir = s(e, "dir");
        !dir.is_empty() && Path::new(&dir).join("manifest.json").exists() && s(e, "base") == self.base_commit()
    }

    fn make_active(entry: &Value) -> Active {
        let dir = PathBuf::from(s(entry, "dir"));
        let deleted = Self::manifest_of(&dir)
            .and_then(|m| m.get("deleted").cloned())
            .and_then(|d| serde_json::from_value::<Vec<String>>(d).ok())
            .unwrap_or_default()
            .into_iter()
            .collect();
        Active { sha: s(entry, "sha"), dir, deleted, message: s(entry, "message"), date: s(entry, "date") }
    }

    fn get<'a>(inner: &'a Inner, k: &str) -> Option<&'a Value> {
        inner.state.get(k).filter(|v| !v.is_null())
    }

    /// Called once before the window opens: settles which pages this run uses.
    pub fn startup(&self) {
        if !self.enabled || self.base_commit().is_empty() {
            return;
        }
        let mut inner = self.inner.lock().unwrap();
        // A newer (or older) exe was installed: live folders made for the old one don't apply.
        if let Some(a) = Self::get(&inner, "active") {
            if s(a, "base") != self.base_commit() {
                eprintln!("live: new exe, clearing live pages");
                let auto = inner.state.get("auto").cloned().unwrap_or(json!(true));
                inner.state = Map::new();
                inner.state.insert("auto".into(), auto);
                inner.state.insert("bad".into(), json!([]));
            }
        }
        // The pages in use never reported back twice in a row: set them aside.
        let starts = Self::get(&inner, "trial").and_then(|t| t.get("starts")).and_then(|v| v.as_u64()).unwrap_or(0);
        if Self::get(&inner, "trial").is_some() && starts >= 2 {
            self.revert_locked(&mut inner, "did not start twice");
        }
        // Pages fetched last time are used from this start.
        let pending = Self::get(&inner, "pending").cloned();
        if self.usable(pending.as_ref()) {
            let p = pending.unwrap();
            let fallback = Self::get(&inner, "active").cloned().unwrap_or(Value::Null);
            inner.state.insert("fallback".into(), fallback);
            inner.state.insert("justUpdated".into(), json!({ "sha": s(&p, "sha"), "message": s(&p, "message"), "date": s(&p, "date") }));
            inner.state.insert("trial".into(), json!({ "sha": s(&p, "sha"), "starts": 0 }));
            inner.state.insert("active".into(), p);
        }
        inner.state.insert("pending".into(), Value::Null);
        let active = Self::get(&inner, "active").cloned();
        if active.is_some() && !self.usable(active.as_ref()) {
            inner.state.insert("active".into(), Value::Null);
        }
        let active_sha = Self::get(&inner, "active").map(|a| s(a, "sha"));
        let trial_sha = Self::get(&inner, "trial").map(|t| s(t, "sha"));
        if trial_sha.is_some() && trial_sha == active_sha {
            let n = Self::get(&inner, "trial").and_then(|t| t.get("starts")).and_then(|v| v.as_u64()).unwrap_or(0) + 1;
            inner.state.get_mut("trial").unwrap()["starts"] = json!(n);
        } else {
            inner.state.insert("trial".into(), Value::Null);
        }
        self.save(&inner);
        self.cleanup(&inner);
        inner.active = Self::get(&inner, "active").map(Self::make_active);
    }

    /// Use the pages fetched in the background now (the window then reloads): no restart needed.
    pub fn apply_pending(&self) -> bool {
        {
            let mut inner = self.inner.lock().unwrap();
            let pending = Self::get(&inner, "pending").cloned();
            if !self.usable(pending.as_ref()) {
                return false;
            }
            let p = pending.unwrap();
            let fallback = Self::get(&inner, "active").cloned().unwrap_or(Value::Null);
            inner.state.insert("fallback".into(), fallback);
            inner.state.insert("pending".into(), Value::Null);
            inner.state.insert("justUpdated".into(), json!({ "sha": s(&p, "sha"), "message": s(&p, "message"), "date": s(&p, "date") }));
            inner.state.insert("trial".into(), json!({ "sha": s(&p, "sha"), "starts": 1 }));
            inner.active = Some(Self::make_active(&p));
            inner.state.insert("active".into(), p);
            self.save(&inner);
            self.cleanup(&inner);
        }
        self.set(json!({ "state": "current", "message": "" }));
        true
    }

    fn revert_locked(&self, inner: &mut Inner, reason: &str) {
        let bad = Self::get(inner, "active").map(|a| s(a, "sha")).or_else(|| Self::get(inner, "trial").map(|t| s(t, "sha"))).unwrap_or_default();
        let mut bads: Vec<Value> = inner.state.get("bad").and_then(|b| b.as_array()).cloned().unwrap_or_default();
        if !bad.is_empty() && !bads.iter().any(|b| b.as_str() == Some(&bad)) {
            bads.push(json!(bad));
            let n = bads.len();
            if n > 20 {
                bads.drain(..n - 20);
            }
        }
        inner.state.insert("bad".into(), Value::Array(bads));
        eprintln!("live: reverting {bad} {reason}");
        let fallback = Self::get(inner, "fallback").cloned();
        let next = match fallback {
            Some(f) if self.usable(Some(&f)) && s(&f, "sha") != bad => f,
            _ => Value::Null,
        };
        inner.active = if next.is_null() { None } else { Some(Self::make_active(&next)) };
        inner.state.insert("active".into(), next);
        inner.state.insert("fallback".into(), Value::Null);
        inner.state.insert("trial".into(), Value::Null);
        self.save(inner);
    }

    /// The live pages fail to start: back to the last good pages (or the installed ones), never this commit again.
    pub fn revert(&self, reason: &str) {
        let mut inner = self.inner.lock().unwrap();
        self.revert_locked(&mut inner, reason);
    }

    /// The pages started fine: keep them. Returns the "just updated" note once (for the "Updated" toast).
    pub fn alive(&self) -> Value {
        let mut inner = self.inner.lock().unwrap();
        inner.state.insert("trial".into(), Value::Null);
        let note = Self::get(&inner, "justUpdated").cloned().unwrap_or(Value::Null);
        inner.state.insert("justUpdated".into(), Value::Null);
        self.save(&inner);
        note
    }

    pub fn is_active(&self) -> bool {
        self.inner.lock().unwrap().active.is_some()
    }

    /// Remove live folders that are neither in use, waiting, nor the fallback.
    fn cleanup(&self, inner: &Inner) {
        let keep: HashSet<String> = ["active", "pending", "fallback"]
            .iter()
            .filter_map(|k| Self::get(inner, k))
            .map(|e| s(e, "dir"))
            .filter(|d| !d.is_empty())
            .filter_map(|d| Path::new(&d).file_name().map(|n| n.to_string_lossy().into_owned()))
            .collect();
        let Ok(rd) = std::fs::read_dir(&self.live_root) else { return };
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if name == "state.json" || name.ends_with(".tmp") || keep.contains(&name) {
                continue;
            }
            let p = e.path();
            let _ = if p.is_dir() { std::fs::remove_dir_all(&p) } else { std::fs::remove_file(&p) };
        }
    }

    /// Which file answers a request path ("js/main.js"): the live copy, the installed one, or none (deleted).
    pub fn resolve(&self, rel: &str) -> Source {
        let active = self.inner.lock().unwrap().active.clone();
        let Some(a) = active else { return Source::Bundle(rel.to_string()) };
        let norm = rel.replace('\\', "/");
        if a.deleted.contains(&norm) {
            return Source::Missing;
        }
        if norm.split('/').any(|seg| seg == ".." || seg.is_empty()) {
            return Source::Missing;
        }
        let live = a.dir.join(norm.replace('/', std::path::MAIN_SEPARATOR_STR));
        if live.is_file() {
            Source::Disk(live)
        } else {
            Source::Bundle(norm)
        }
    }

    fn info_locked(&self, inner: &Inner) -> Value {
        let mut out = inner.status.clone();
        let pending = Self::get(inner, "pending");
        out.insert("enabled".into(), json!(self.enabled && !self.base_commit().is_empty()));
        out.insert("auto".into(), json!(inner.state.get("auto") != Some(&json!(false))));
        out.insert("build".into(), match &self.base {
            Some(b) if !b.commit.is_empty() => json!({ "sha": short(&b.commit), "date": b.date }),
            _ => Value::Null,
        });
        out.insert("live".into(), match &inner.active {
            Some(a) => json!({ "sha": short(&a.sha), "message": a.message, "date": a.date }),
            None => Value::Null,
        });
        out.insert("pending".into(), match pending {
            Some(p) => json!({ "sha": short(&s(p, "sha")), "message": s(p, "message"), "date": s(p, "date") }),
            None => Value::Null,
        });
        out.insert("lastCheck".into(), json!(inner.state.get("lastCheck").and_then(|v| v.as_str()).unwrap_or("")));
        Value::Object(out)
    }

    pub fn info(&self) -> Value {
        let inner = self.inner.lock().unwrap();
        self.info_locked(&inner)
    }

    pub fn set_auto(&self, on: bool) -> Value {
        {
            let mut inner = self.inner.lock().unwrap();
            inner.state.insert("auto".into(), json!(on));
            self.save(&inner);
        }
        self.set(json!({}));
        self.info()
    }

    fn raw_url(&self, sha: &str, rel: &str) -> String {
        let enc: Vec<String> = rel.split('/').map(|p| url::form_urlencoded::byte_serialize(p.as_bytes()).collect::<String>().replace('+', "%20")).collect();
        format!("https://raw.githubusercontent.com/{}/{}/{}{}", self.repo, sha, PREFIX, enc.join("/"))
    }

    /// Look for newer pages on GitHub and get them ready for the next start.
    pub async fn check(self: &Arc<Self>, manual: bool) -> Value {
        if !self.enabled || self.base_commit().is_empty() {
            self.set(json!({ "state": "off", "message": "Live updates are on in the installed app." }));
            return self.info();
        }
        {
            let mut inner = self.inner.lock().unwrap();
            if inner.busy {
                return self.info_locked(&inner);
            }
            if !manual && inner.state.get("auto") == Some(&json!(false)) {
                return self.info_locked(&inner);
            }
            inner.busy = true;
        }
        let result = self.check_inner().await;
        self.inner.lock().unwrap().busy = false;
        if let Err(msg) = result {
            eprintln!("live: check failed {msg}");
            let lower = msg.to_lowercase();
            let offline = ["enotfound", "eai_again", "econn", "etimedout", "timed out", "dns", "connect"].iter().any(|k| lower.contains(k));
            self.set(json!({ "state": "error", "message": if offline { "No internet connection — the app will try again later.".to_string() } else { msg } }));
        }
        self.info()
    }

    async fn check_inner(self: &Arc<Self>) -> Result<(), String> {
        let base = self.base.clone().unwrap_or_default();
        self.set(json!({ "state": "checking", "message": "Looking for updates…" }));
        let head: Value = serde_json::from_slice(&crate::net::https_get(&format!("https://api.github.com/repos/{}/commits/{}", self.repo, self.branch), true).await?).map_err(|e| e.to_string())?;
        let sha = s(&head, "sha");
        if sha.len() != 40 || !sha.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()) {
            return Err("GitHub didn't answer as expected.".into());
        }
        let (current, is_bad, has_pending, active) = {
            let mut inner = self.inner.lock().unwrap();
            inner.state.insert("lastCheck".into(), json!(iso_now()));
            let current = Self::get(&inner, "pending").map(|p| s(p, "sha")).or_else(|| inner.active.as_ref().map(|a| a.sha.clone())).unwrap_or(base.commit.clone());
            let is_bad = inner.state.get("bad").and_then(|b| b.as_array()).map(|b| b.iter().any(|x| x.as_str() == Some(&sha))).unwrap_or(false);
            (current, is_bad, Self::get(&inner, "pending").is_some(), inner.active.clone())
        };
        if sha == current || is_bad {
            self.save(&self.inner.lock().unwrap());
            self.set(json!({ "state": if has_pending { "ready" } else { "current" }, "message": "" }));
            return Ok(());
        }

        let tree_res: Value = serde_json::from_slice(&crate::net::https_get(&format!("https://api.github.com/repos/{}/git/trees/{}?recursive=1", self.repo, sha), true).await?).map_err(|e| e.to_string())?;
        let Some(entries) = tree_res.get("tree").and_then(|t| t.as_array()).filter(|_| tree_res.get("truncated") != Some(&json!(true))) else {
            return Err("GitHub's file list was incomplete.".into());
        };
        let mut tree: BTreeMap<String, (String, u64)> = BTreeMap::new();
        for e in entries {
            let p = s(e, "path");
            if s(e, "type") == "blob" && p.starts_with(PREFIX) {
                tree.insert(p[PREFIX.len()..].to_string(), (s(e, "sha"), e.get("size").and_then(|v| v.as_u64()).unwrap_or(0)));
            }
        }
        if !tree.contains_key("index.html") || !tree.contains_key("app.js") {
            return Err("That version has no app pages.".into());
        }

        // Pages that need a newer app shell wait for a new exe.
        if tree.contains_key("live-requires.json") {
            let req: Value = serde_json::from_slice(&crate::net::https_get(&self.raw_url(&sha, "live-requires.json"), false).await?).map_err(|e| e.to_string())?;
            let need = req.get("shell").and_then(|v| v.as_u64()).unwrap_or(1).max(1);
            if need > SHELL_API {
                self.save(&self.inner.lock().unwrap());
                self.set(json!({ "state": "needs-app", "message": "A new version of the app is needed for the latest update." }));
                return Ok(());
            }
        }
        let active_files: Option<HashMap<String, String>> = active
            .as_ref()
            .and_then(|a| Self::manifest_of(&a.dir))
            .and_then(|m| m.get("files").cloned())
            .and_then(|f| serde_json::from_value(f).ok());
        let plan = plan_update(&base.files, &tree, active_files.as_ref());
        if plan.download_bytes > MAX_DOWNLOAD {
            self.save(&self.inner.lock().unwrap());
            self.set(json!({ "state": "needs-app", "message": "This update is large: it comes with the next version of the app." }));
            return Ok(());
        }

        let dir = self.live_root.join(&sha[..12]);
        let tmp = PathBuf::from(format!("{}.tmp", dir.display()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
        let total = plan.files.len();
        self.set(json!({ "state": "downloading", "message": format!("Getting the update… ({} changed files)", plan.changed), "progress": 0 }));

        // Six at a time, as before.
        let files = Arc::new(Mutex::new(plan.files.clone().into_iter()));
        let done = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let mut workers = Vec::new();
        for _ in 0..6.min(total.max(1)) {
            let files = files.clone();
            let done = done.clone();
            let me = self.clone();
            let tmp = tmp.clone();
            let sha = sha.clone();
            let active_dir = active.as_ref().map(|a| a.dir.clone());
            workers.push(tokio::spawn(async move {
                loop {
                    let next = files.lock().unwrap().next();
                    let Some(f) = next else { break };
                    let out = tmp.join(f.rel.replace('/', std::path::MAIN_SEPARATOR_STR));
                    if let Some(parent) = out.parent() {
                        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                    }
                    let mut ok = false;
                    if f.from == From::Bundle {
                        if let Some(b) = crate::assets::get(&f.rel) {
                            ok = std::fs::write(&out, &b).is_ok();
                        }
                    } else if f.from == From::Active {
                        if let Some(d) = &active_dir {
                            if let Ok(b) = std::fs::read(d.join(f.rel.replace('/', std::path::MAIN_SEPARATOR_STR))) {
                                ok = std::fs::write(&out, &b).is_ok();
                            }
                        }
                    }
                    if !ok {
                        let buf = crate::net::https_get(&me.raw_url(&sha, &f.rel), false).await?;
                        if git_blob_sha(&buf) != f.sha {
                            return Err(format!("A downloaded file didn't match ({}).", f.rel));
                        }
                        std::fs::write(&out, &buf).map_err(|e| e.to_string())?;
                    }
                    let n = done.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
                    if n % 25 == 0 || n == total {
                        me.set(json!({ "progress": ((n as f64 / total as f64) * 100.0).round() as u64 }));
                    }
                }
                Ok::<(), String>(())
            }));
        }
        for w in workers {
            w.await.map_err(|e| e.to_string())??;
        }
        let commit = head.get("commit").cloned().unwrap_or(Value::Null);
        let message: String = s(&commit, "message").lines().next().unwrap_or("").chars().take(160).collect();
        let date = commit.pointer("/committer/date").and_then(|v| v.as_str()).or_else(|| commit.pointer("/author/date").and_then(|v| v.as_str())).unwrap_or("").to_string();
        let files: Map<String, Value> = tree.iter().map(|(rel, (sha, _))| (rel.clone(), json!(sha))).collect();
        let manifest = json!({ "sha": sha, "base": base.commit, "files": files, "deleted": plan.deleted, "message": message, "date": date, "at": iso_now() });
        std::fs::write(tmp.join("manifest.json"), serde_json::to_vec(&manifest).unwrap()).map_err(|e| e.to_string())?;
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::rename(&tmp, &dir).map_err(|e| e.to_string())?;
        {
            let mut inner = self.inner.lock().unwrap();
            inner.state.insert("pending".into(), json!({ "sha": sha, "dir": dir.display().to_string(), "base": base.commit, "message": message, "date": date }));
            self.save(&inner);
            self.cleanup(&inner);
        }
        self.set(json!({ "state": "ready", "message": "An update is ready.", "progress": 100 }));
        Ok(())
    }
}

/// UTC now as ISO 8601 ("2026-11-07T10:00:00.000Z"), without a date crate.
pub fn iso_now() -> String {
    let ms = crate::store::now_ms() as i64;
    let (secs, millis) = (ms.div_euclid(1000), ms.rem_euclid(1000));
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    // Civil from days (Howard Hinnant).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z", y, m, d, rem / 3600, (rem % 3600) / 60, rem % 60, millis)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blob_sha_matches_git() {
        // `printf 'hello\n' | git hash-object --stdin`
        assert_eq!(git_blob_sha(b"hello\n"), "ce013625030ba8dba906f756967f9e9ca394464a");
        assert_eq!(git_blob_sha(b""), "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
    }

    #[test]
    fn versions() {
        assert!(is_newer_version("3.10.0", "3.9.2"));
        assert!(is_newer_version("v4.0.0", "3.5.6"));
        assert!(!is_newer_version("3.5.6", "3.5.6"));
        assert!(!is_newer_version("3.5.5", "v3.5.6"));
    }

    #[test]
    fn plan() {
        let base: HashMap<String, String> = [("app.js", "a1"), ("index.html", "i1"), ("assets/x.png", "p1"), ("assets/audio/c.ogg", "o1"), ("old.js", "z1")]
            .iter().map(|(a, b)| (a.to_string(), b.to_string())).collect();
        let tree: BTreeMap<String, (String, u64)> = [("app.js", "a2", 10u64), ("index.html", "i1", 5), ("assets/x.png", "p1", 99), ("assets/y.png", "y1", 7), ("live-base.json", "l", 1)]
            .iter().map(|(a, b, n)| (a.to_string(), (b.to_string(), *n))).collect();
        let active: HashMap<String, String> = [("app.js".to_string(), "a2".to_string())].into_iter().collect();
        let p = plan_update(&base, &tree, Some(&active));
        let by: HashMap<_, _> = p.files.iter().map(|f| (f.rel.as_str(), f.from.clone())).collect();
        assert_eq!(by.get("app.js"), Some(&From::Active));
        assert_eq!(by.get("index.html"), Some(&From::Bundle));
        assert_eq!(by.get("assets/y.png"), Some(&From::Download));
        assert!(!by.contains_key("assets/x.png")); // bulky + unchanged: served from the exe
        assert!(!by.contains_key("live-base.json"));
        assert_eq!(p.deleted, vec!["old.js".to_string()]);
        assert_eq!(p.download_bytes, 7);
        assert_eq!(p.changed, 3); // app.js, assets/y.png, old.js
    }

    #[test]
    fn iso() {
        let t = iso_now();
        assert_eq!(t.len(), 24);
        assert!(t.ends_with('Z') && t.starts_with("20"));
    }
}
