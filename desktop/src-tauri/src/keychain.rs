//! Encrypted secrets (AI keys, the ChatGPT connection) — the same format Electron's safeStorage wrote, so the
//! files carry over and stay readable:
//!   file = "v10" + 12-byte nonce + AES-256-GCM(ciphertext + tag)
//!   key  = 32 random bytes, protected by Windows (DPAPI, this user), stored base64("DPAPI" + blob) in the data
//!          folder's "Local State" JSON at os_crypt.encrypted_key (as Chromium does).
//! A fresh install makes that key the same way. Files written as plain text (when Electron had no encryption)
//! are still read.
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::Engine;
use rand::RngCore;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const PREFIX: &[u8] = b"v10";

pub struct Keychain {
    dir: PathBuf,
    key: Mutex<Option<[u8; 32]>>,
}

#[cfg(windows)]
mod dpapi {
    use windows::Win32::Foundation::{HLOCAL, LocalFree};
    use windows::Win32::Security::Cryptography::{CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN};

    unsafe fn take(blob: CRYPT_INTEGER_BLOB) -> Vec<u8> {
        let out = std::slice::from_raw_parts(blob.pbData, blob.cbData as usize).to_vec();
        let _ = LocalFree(Some(HLOCAL(blob.pbData as *mut _)));
        out
    }

    pub fn unprotect(data: &[u8]) -> Option<Vec<u8>> {
        unsafe {
            let input = CRYPT_INTEGER_BLOB { cbData: data.len() as u32, pbData: data.as_ptr() as *mut u8 };
            let mut output = CRYPT_INTEGER_BLOB::default();
            CryptUnprotectData(&input, None, None, None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut output).ok()?;
            Some(take(output))
        }
    }

    pub fn protect(data: &[u8]) -> Option<Vec<u8>> {
        unsafe {
            let input = CRYPT_INTEGER_BLOB { cbData: data.len() as u32, pbData: data.as_ptr() as *mut u8 };
            let mut output = CRYPT_INTEGER_BLOB::default();
            CryptProtectData(&input, None, None, None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut output).ok()?;
            Some(take(output))
        }
    }
}

impl Keychain {
    pub fn new(dir: PathBuf) -> Self {
        Keychain { dir, key: Mutex::new(None) }
    }

    fn local_state(&self) -> PathBuf {
        self.dir.join("Local State")
    }

    fn read_local_state(&self) -> Option<Value> {
        serde_json::from_slice(&std::fs::read(self.local_state()).ok()?).ok()
    }

    /// The master key: from Local State, or a new one written there (only when `create`).
    fn master_key(&self, create: bool) -> Option<[u8; 32]> {
        let mut guard = self.key.lock().unwrap();
        if let Some(k) = *guard {
            return Some(k);
        }
        #[cfg(windows)]
        {
            let state = self.read_local_state();
            if let Some(enc) = state.as_ref().and_then(|s| s.pointer("/os_crypt/encrypted_key")).and_then(|v| v.as_str()) {
                let raw = base64::engine::general_purpose::STANDARD.decode(enc).ok()?;
                if raw.len() > 5 && &raw[..5] == b"DPAPI" {
                    let k = dpapi::unprotect(&raw[5..])?;
                    if k.len() == 32 {
                        let mut key = [0u8; 32];
                        key.copy_from_slice(&k);
                        *guard = Some(key);
                        return Some(key);
                    }
                }
                return None; // a key is there but can't be read (another Windows user): never replace it
            }
            if !create {
                return None;
            }
            let mut key = [0u8; 32];
            rand::thread_rng().fill_bytes(&mut key);
            let blob = dpapi::protect(&key)?;
            let mut enc = b"DPAPI".to_vec();
            enc.extend_from_slice(&blob);
            let mut state = state.unwrap_or_else(|| json!({}));
            if !state.is_object() {
                state = json!({});
            }
            let os = state.as_object_mut().unwrap().entry("os_crypt").or_insert_with(|| json!({}));
            if !os.is_object() {
                *os = json!({});
            }
            os.as_object_mut().unwrap().insert("encrypted_key".into(), Value::String(base64::engine::general_purpose::STANDARD.encode(enc)));
            crate::store::write_atomic(&self.local_state(), serde_json::to_string(&state).ok()?.as_bytes()).ok()?;
            *guard = Some(key);
            Some(key)
        }
        #[cfg(not(windows))]
        {
            let _ = create;
            None
        }
    }

    /// Is encryption available (the Windows-protected key can be read or made)?
    pub fn available(&self) -> bool {
        self.master_key(true).is_some()
    }

    pub fn encrypt(&self, plain: &[u8]) -> Option<Vec<u8>> {
        let key = self.master_key(true)?;
        let cipher = Aes256Gcm::new_from_slice(&key).ok()?;
        let mut nonce = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut nonce);
        let ct = cipher.encrypt(Nonce::from_slice(&nonce), plain).ok()?;
        let mut out = PREFIX.to_vec();
        out.extend_from_slice(&nonce);
        out.extend_from_slice(&ct);
        Some(out)
    }

    pub fn decrypt(&self, buf: &[u8]) -> Option<Vec<u8>> {
        if buf.len() > 3 + 12 + 16 && &buf[..3] == PREFIX {
            let key = self.master_key(false)?;
            let cipher = Aes256Gcm::new_from_slice(&key).ok()?;
            return cipher.decrypt(Nonce::from_slice(&buf[3..15]), &buf[15..]).ok();
        }
        None
    }

    /// Electron's file for a key-chain slot: deepseek → keychain.bin, gemini → keychain-gemini.bin,
    /// p-<uid>-deepseek|gemini → keychain-p-<uid>-….bin (another teacher's keys while switched out).
    pub fn slot_file(&self, name: &str) -> PathBuf {
        let profile = name.strip_prefix("p-").and_then(|rest| {
            let (uid, provider) = rest.rsplit_once('-')?;
            let ok_uid = !uid.is_empty() && uid.len() <= 128 && uid.chars().all(|c| c.is_ascii_alphanumeric());
            (ok_uid && (provider == "deepseek" || provider == "gemini")).then_some(())
        });
        let file = if profile.is_some() {
            format!("keychain-{name}.bin")
        } else if name == "gemini" {
            "keychain-gemini.bin".into()
        } else {
            "keychain.bin".into()
        };
        self.dir.join(file)
    }

    pub fn get(&self, name: &str) -> Option<String> {
        let buf = std::fs::read(self.slot_file(name)).ok()?;
        if &buf.get(..3)? == &PREFIX {
            return self.decrypt(&buf).and_then(|p| String::from_utf8(p).ok());
        }
        // Written as plain text when Electron had no encryption.
        String::from_utf8(buf).ok()
    }

    pub fn set(&self, value: &str, name: &str) {
        let file = self.slot_file(name);
        if value.is_empty() {
            let _ = std::fs::remove_file(&file);
            return;
        }
        let data = self.encrypt(value.as_bytes()).unwrap_or_else(|| value.as_bytes().to_vec());
        if let Err(e) = std::fs::write(&file, data) {
            eprintln!("keychain set failed: {e}");
        }
    }

    /// Encrypted JSON file (ChatGPT connection). Errors when encryption is unavailable: never stored in the clear.
    pub fn read_secret_json(&self, file: &Path) -> Result<Option<Value>, String> {
        let Ok(buf) = std::fs::read(file) else { return Ok(None) };
        let plain = self.decrypt(&buf).ok_or("Secure credential storage is unavailable. ChatGPT sign-in needs Windows credential encryption.")?;
        serde_json::from_slice(&plain).map(Some).map_err(|e| e.to_string())
    }

    pub fn write_secret_json(&self, file: &Path, value: &Value) -> Result<(), String> {
        let plain = serde_json::to_vec(value).map_err(|e| e.to_string())?;
        let enc = self.encrypt(&plain).ok_or("Secure credential storage is unavailable. ChatGPT sign-in needs Windows credential encryption.")?;
        crate::store::write_atomic(file, &enc).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slot_files_match_electron() {
        let k = Keychain::new(PathBuf::from("X"));
        assert_eq!(k.slot_file("deepseek"), PathBuf::from("X").join("keychain.bin"));
        assert_eq!(k.slot_file("gemini"), PathBuf::from("X").join("keychain-gemini.bin"));
        assert_eq!(k.slot_file("p-abc123-gemini"), PathBuf::from("X").join("keychain-p-abc123-gemini.bin"));
        assert_eq!(k.slot_file("p-a/b-gemini"), PathBuf::from("X").join("keychain.bin"));
        assert_eq!(k.slot_file("weird"), PathBuf::from("X").join("keychain.bin"));
    }

    #[cfg(windows)]
    #[test]
    fn round_trip_and_new_key() {
        let dir = std::env::temp_dir().join(format!("vm-keychain-test-{}", crate::store::now_ms()));
        std::fs::create_dir_all(&dir).unwrap();
        let k = Keychain::new(dir.clone());
        k.set("sk-test-123", "deepseek");
        assert_eq!(&std::fs::read(dir.join("keychain.bin")).unwrap()[..3], b"v10");
        assert_eq!(Keychain::new(dir.clone()).get("deepseek").as_deref(), Some("sk-test-123"));
        k.set("", "deepseek");
        assert!(!dir.join("keychain.bin").exists());
        let _ = std::fs::remove_dir_all(dir);
    }
}

/// Opt-in: `VM_CHECK_DIR=<copy of a data folder> cargo test real_data -- --ignored --nocapture` decrypts the real
/// files there (read only, no network) and prints only what they hold, never a secret.
#[cfg(all(test, windows))]
mod real_data {
    use super::*;
    #[test]
    #[ignore]
    fn real_data_decrypts() {
        let dir = PathBuf::from(std::env::var("VM_CHECK_DIR").expect("VM_CHECK_DIR"));
        let k = Keychain::new(dir.clone());
        for slot in ["deepseek", "gemini"] {
            println!("{slot}: {}", k.get(slot).map(|v| format!("{} chars", v.len())).unwrap_or("none".into()));
        }
        let state = k.read_secret_json(&dir.join("chatgpt-accounts.bin")).expect("decrypts").expect("present");
        let profiles = state["profiles"].as_array().map(|a| a.len()).unwrap_or(0);
        let tokens = state["profiles"].as_array().map(|a| a.iter().filter(|p| p.get("accessToken").is_some()).count()).unwrap_or(0);
        println!("chatgpt: {profiles} connection(s), {tokens} signed in, host id {}", state.get("hostId").is_some());
        assert!(profiles > 0);
    }
}
