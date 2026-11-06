/* Sync — several teachers on one computer.
   The active profile's data lives in localStorage as always. Switching tucks it into a per-profile stash
   (IndexedDB; on desktop the AI keys go to per-profile encrypted key-chain files instead) and restores the
   other teacher's stash, then the app reloads. "local" is the profile of whoever uses the app signed out. */
import { PROFILE_KEYS, SECRET } from "./registry.js";

const PROFILES_KEY = "vm_sync_profiles";
const DB_NAME = "vm-sync";
const STORE = "stash";

export const LOCAL = "local";

export function loadProfiles() {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILES_KEY) || "null");
    if (p && Array.isArray(p.list)) return { active: p.active || LOCAL, list: p.list.filter((x) => x && x.uid && x.slot) };
  } catch { /* fall through */ }
  return { active: LOCAL, list: [] };
}
export function saveProfiles(p) {
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}
export const newSlot = () => `s${Math.random().toString(36).slice(2, 10)}`;

/* ── IndexedDB stash ─────────────────────────────────────────────── */
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
  });
}
const idbGet = (id) => tx("readonly", (s) => s.get(id));
const idbPut = async (id, v) => { await tx("readwrite", (s) => s.put(v, id)); await mirrorStash(); };
const idbDel = async (id) => { await tx("readwrite", (s) => s.delete(id)); await mirrorStash(); };
async function idbAll() {
  const [ids, recs] = await Promise.all([tx("readonly", (s) => s.getAllKeys()), tx("readonly", (s) => s.getAll())]);
  return Object.fromEntries((ids || []).map((id, i) => [id, recs[i]]));
}

/* ── A copy of the stash in the app's data file (desktop) ──────────
   IndexedDB belongs to the app's browser engine, and the Tauri app (WebView2) can't read what the Electron app
   kept there. So the desktop app also keeps the stash in its data file (store.json, STASH_MIRROR, never in
   localStorage); on start a stash that is in the copy but not in IndexedDB is taken back (moving to the Tauri app),
   then the copy is brought up to date. */
export const STASH_MIRROR = "__vm_shell_stash";
let mirrorWanted = false;
async function mirrorStash() {
  const d = desktop();
  if (!d?.storage) return;
  try {
    const all = await idbAll();
    if (!mirrorWanted && !Object.keys(all).length) return;
    mirrorWanted = true;
    await d.storage.set(STASH_MIRROR, all);
  } catch (err) { console.warn("stash copy not saved", err?.name || err); }
}
export async function syncStashMirror(mirror) {
  if (!desktop()?.storage) return;
  try {
    if (mirror && typeof mirror === "object") {
      mirrorWanted = true;
      for (const [id, rec] of Object.entries(mirror)) {
        if (rec && typeof rec === "object" && !(await idbGet(id))) await tx("readwrite", (s) => s.put(rec, id));
      }
    }
    await mirrorStash();
  } catch (err) { console.warn("stash copy not read", err?.name || err); }
}

const keychainName = (pid, name) => `p-${pid}-${name}`;
const desktop = () => (typeof window.desktop !== "undefined" ? window.desktop : null);

/** Move the active profile's data out of localStorage into its stash. */
export async function stashCurrent(pid, withSuspended) {
  const keys = {};
  for (const k of PROFILE_KEYS) {
    if (SECRET[k] && desktop()) continue;
    const v = localStorage.getItem(k);
    if (v != null) keys[k] = v;
  }
  const d = desktop();
  if (d) {
    for (const [k, name] of Object.entries(SECRET)) await d.keychain.set(localStorage.getItem(k) || "", keychainName(pid, name));
  }
  await idbPut(pid, { keys, at: Date.now() });
  withSuspended(() => { for (const k of PROFILE_KEYS) localStorage.removeItem(k); });
}

/** Put a profile's stash back into localStorage (nothing to restore = a fresh, empty profile). */
export async function restoreStash(pid, withSuspended) {
  const rec = await idbGet(pid).catch(() => null);
  const d = desktop();
  const secrets = {};
  if (d) {
    for (const [k, name] of Object.entries(SECRET)) {
      const v = await d.keychain.get(keychainName(pid, name));
      if (v) secrets[k] = v;
      await d.keychain.set("", keychainName(pid, name));
    }
  }
  withSuspended(() => {
    for (const [k, v] of Object.entries({ ...(rec?.keys || {}), ...secrets })) {
      try { localStorage.setItem(k, v); } catch (err) { console.error("restore failed", k, err?.name); }
    }
  });
  await idbDel(pid).catch(() => {});
}

export async function hasStash(pid) {
  return !!(await idbGet(pid).catch(() => null));
}

export async function deleteStash(pid) {
  await idbDel(pid).catch(() => {});
  const d = desktop();
  if (d) for (const name of Object.values(SECRET)) await d.keychain.set("", keychainName(pid, name));
}

/** Remove the active profile's data from localStorage (after a backup, when using the account's data only). */
export function clearCurrent(withSuspended) {
  withSuspended(() => { for (const k of PROFILE_KEYS) localStorage.removeItem(k); });
}
