/* Sync — the unlocked AI-key vault key, remembered on this computer so the sync passphrase is typed once per computer
   (not after every start). What's stored is the AES-GCM CryptoKey itself, non-extractable: IndexedDB keeps it as an
   opaque handle, so neither the passphrase nor the key's bytes are ever written anywhere. One entry per account uid.
   Anyone who can use this computer's app data could already read the AI keys themselves, so this adds no exposure. */

const DB_NAME = "vm-sync-keys";
const STORE = "vault";

function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { d.close(); resolve(req?.result); };
    t.onerror = () => { d.close(); reject(t.error); };
    t.onabort = () => { d.close(); reject(t.error); };
  });
}

/** The engine's `vaultKeys` store (engine.js). Handles are { key: CryptoKey, salt, iter }. */
export const vaultKeys = {
  async get(uid) {
    const rec = await tx("readonly", (s) => s.get(uid));
    return rec && rec.key && typeof rec.salt === "string" ? { key: rec.key, salt: rec.salt, iter: rec.iter } : null;
  },
  async set(uid, handle) {
    if (!handle?.key || handle.key.extractable) return; // never store a key whose bytes could be read back
    await tx("readwrite", (s) => s.put({ key: handle.key, salt: handle.salt, iter: handle.iter, at: Date.now() }, uid));
  },
  async clear(uid) {
    await tx("readwrite", (s) => s.delete(uid));
  },
};
