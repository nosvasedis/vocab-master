//! JSON files in the data folder: store.json (everything the pages keep in localStorage), prefs.json,
//! window.json. Same formats as the Electron app. Writes go to a .tmp file first, then rename, so a crash
//! mid-write never leaves a truncated file; an unreadable file is copied aside before it is replaced.
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub struct Store {
    dir: PathBuf,
    lock: Mutex<()>,
}

pub fn now_ms() -> u128 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
}

/// Write bytes atomically (tmp + rename).
pub fn write_atomic(target: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let tmp = PathBuf::from(format!("{}.tmp", target.display()));
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, target)
}

impl Store {
    pub fn new(dir: PathBuf) -> Self {
        Store { dir, lock: Mutex::new(()) }
    }
    pub fn dir(&self) -> &Path {
        &self.dir
    }
    pub fn file(&self, name: &str) -> PathBuf {
        self.dir.join(name)
    }

    pub fn read_json(&self, name: &str) -> Option<Value> {
        let file = self.file(name);
        let text = std::fs::read(&file).ok()?;
        match serde_json::from_slice::<Value>(&text) {
            Ok(v) => Some(v),
            Err(err) => {
                // Unreadable (corrupted): keep a copy so saved worksheets are never silently overwritten.
                let _ = std::fs::copy(&file, format!("{}.corrupt-{}", file.display(), now_ms()));
                eprintln!("storage read failed {name}: {err}");
                None
            }
        }
    }

    pub fn write_json(&self, name: &str, value: &Value) {
        let target = self.file(name);
        match serde_json::to_vec_pretty(value) {
            Ok(bytes) => {
                if let Err(err) = write_atomic(&target, &bytes) {
                    eprintln!("storage write failed {name}: {err}");
                }
            }
            Err(err) => eprintln!("storage write failed {name}: {err}"),
        }
    }

    fn all(&self) -> Map<String, Value> {
        match self.read_json("store.json") {
            Some(Value::Object(m)) => m,
            _ => Map::new(),
        }
    }

    pub fn get_all(&self) -> Value {
        let _g = self.lock.lock().unwrap();
        Value::Object(self.all())
    }

    pub fn set(&self, key: String, value: Value) {
        let _g = self.lock.lock().unwrap();
        let mut all = self.all();
        all.insert(key, value);
        self.write_json("store.json", &Value::Object(all));
    }

    pub fn remove(&self, key: &str) {
        let _g = self.lock.lock().unwrap();
        let mut all = self.all();
        all.remove(key);
        self.write_json("store.json", &Value::Object(all));
    }

    pub fn prefs(&self) -> Map<String, Value> {
        match self.read_json("prefs.json") {
            Some(Value::Object(m)) => m,
            _ => Map::new(),
        }
    }

    /// The folder the teacher saved into last time (if it still exists), else Downloads.
    pub fn last_save_dir(&self) -> PathBuf {
        self.prefs()
            .get("lastSaveDir")
            .and_then(|v| v.as_str())
            .map(PathBuf::from)
            .filter(|p| p.is_dir())
            .unwrap_or_else(|| crate::paths::known_folder("downloads"))
    }

    pub fn remember_save_dir(&self, dir: &Path) {
        let mut p = self.prefs();
        p.insert("lastSaveDir".into(), Value::String(dir.display().to_string()));
        self.write_json("prefs.json", &Value::Object(p));
    }
}
