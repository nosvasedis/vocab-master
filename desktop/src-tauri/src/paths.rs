//! Where the app keeps its files: the same folder the Electron app used, so saved worksheets, settings,
//! encrypted keys and live pages carry over unchanged.
//!   %APPDATA%\Vocab Master — or, when that holds no data yet, the folder from before the rebrand
//!   (%APPDATA%\Lingo Launcher, %APPDATA%\lingo-launcher-desktop).
//!   VM_USER_DATA=<folder> runs against another folder (testing); `--smoke` uses a fresh temporary one.
use std::path::{Path, PathBuf};

pub const APP_NAME: &str = "Vocab Master";

fn has_persisted_data(dir: &Path) -> bool {
    ["store.json", "keychain.bin"].iter().any(|n| dir.join(n).exists())
}

pub fn appdata() -> PathBuf {
    dirs::config_dir().unwrap_or_else(|| std::env::temp_dir())
}

/// The data folder for this run (created if missing).
pub fn resolve_data_dir(smoke: bool) -> PathBuf {
    let dir = if smoke {
        let d = std::env::temp_dir().join("lingo-launcher-smoke");
        let _ = std::fs::remove_dir_all(&d);
        d
    } else if let Some(v) = std::env::var_os("VM_USER_DATA").filter(|v| !v.is_empty()) {
        PathBuf::from(v)
    } else {
        let current = appdata().join(APP_NAME);
        if has_persisted_data(&current) {
            current
        } else {
            ["Lingo Launcher", "lingo-launcher-desktop"]
                .iter()
                .map(|n| appdata().join(n))
                .find(|d| has_persisted_data(d))
                .unwrap_or(current)
        }
    };
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// A standard folder (documents, downloads, music, pictures); downloads when unknown.
pub fn known_folder(kind: &str) -> PathBuf {
    let f = match kind {
        "documents" => dirs::document_dir(),
        "music" => dirs::audio_dir(),
        "pictures" => dirs::picture_dir(),
        _ => None,
    };
    f.or_else(dirs::download_dir).unwrap_or_else(|| dirs::home_dir().unwrap_or_else(std::env::temp_dir))
}
