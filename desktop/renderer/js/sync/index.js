/* Sync — the service the app talks to: profiles, sign-in, live sync, backups.
   Hooked in by js/main.js (initSync after hydrateStorage) and js/dialogs.js (the Account section).
   It watches localStorage writes itself, so no other module has to call it. */
import { SYNCED, SECRET, isSynced, isSecret } from "./registry.js";
import { createEngine } from "./engine.js";
import { encryptWithPassphrase, decryptWithPassphrase } from "./crypto.js";
import {
  profileApp, dropProfileApp, restoredUser, accountBackend, emailSignIn, emailSignUp, resetPassword, googleSignIn, signOutProfile, friendlyAuthError, useEmulator,
} from "./backend-firebase.js";
import { googleIdToken } from "./google.js";
import { LOCAL, loadProfiles, saveProfiles, newSlot, stashCurrent, restoreStash, deleteStash, clearCurrent, hasStash } from "./profiles.js";

const BACKUP_FORMAT = "vocab-master-backup";
const BACKUP_AAD = "vocab-master-backup";

let engine = null;
let profiles = loadProfiles();
let handle = null;      // { app, auth, db, slot } of the active profile
let user = null;
let backend = null;
let stopWatch = null;
let connected = false;
let suspended = 0;
let ui = { askMerge: async () => "merge" };
const timers = new Map();
let pushTimer = null;

const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withSuspended = (fn) => { suspended++; try { return fn(); } finally { suspended--; } };

const storage = {
  get: (k) => localStorage.getItem(k),
  set: (k, v) => withSuspended(() => localStorage.setItem(k, v)),
  remove: (k) => withSuspended(() => localStorage.removeItem(k)),
};

/* ── watching localStorage ───────────────────────────────────────── */
function installCapture() {
  const proto = Storage.prototype;
  if (proto.__vmSync) return;
  const prevSet = proto.setItem;
  const prevRemove = proto.removeItem;
  const touched = (store, key) => {
    if (suspended || store !== window.localStorage || !(isSynced(key) || isSecret(key))) return;
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => { timers.delete(key); if (engine?.captureKey(key)) schedulePush(); }, 250));
  };
  proto.setItem = function (key, value) { prevSet.call(this, key, value); touched(this, key); };
  proto.removeItem = function (key) { prevRemove.call(this, key); touched(this, key); };
  Object.defineProperty(proto, "__vmSync", { value: true });
}

function schedulePush(ms = 1500) {
  if (!backend) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { if (connected) engine.push().catch(() => {}); }, ms);
}

/** Capture every pending edit now (timers would fire too late at page unload or a profile switch). */
function flushCaptures() {
  for (const [key, t] of timers) { clearTimeout(t); engine?.captureKey(key); }
  timers.clear();
}

/* ── status ─────────────────────────────────────────────────────── */
let lastStatus = {};
function publish(s = engine?.status || {}) {
  const p = activeProfile();
  lastStatus = {
    ...s,
    phase: !p ? "local" : !user ? "signed-out" : !connected && s.phase !== "error" ? "offline" : s.phase,
    profile: p, profiles: profiles.list, active: profiles.active, emulator: useEmulator(),
  };
  emit("vm-sync-status", lastStatus);
}
export const syncStatus = () => lastStatus;
export const activeProfile = () => profiles.list.find((p) => p.uid === profiles.active) || null;

/* ── boot ───────────────────────────────────────────────────────── */
/**
 * Start sync. Awaits at most ~2.5 s for the account's latest changes, so offline starts stay fast.
 * @param {{ askMerge?: (info) => Promise<"merge"|"replace"|"cancel"> }} hooks UI callbacks (account-ui.js)
 */
export async function initSync(hooks = {}) {
  ui = { ...ui, ...hooks };
  engine = createEngine({
    storage,
    onChange: (keys) => emit("vm-sync-changed", { keys }),
    onStatus: (s) => publish(s),
  });
  installCapture();
  engine.captureAll();
  window.addEventListener("beforeunload", () => flushCaptures());
  const p = activeProfile();
  if (!p) { publish(); return; }
  handle = profileApp(p.slot);
  const u = await Promise.race([restoredUser(handle), sleep(4000).then(() => undefined)]);
  if (u && u.uid === p.uid) await Promise.race([connect(u), sleep(2500)]);
  else publish();
}

/** Attach the engine to the signed-in user; resolves after the first sync round (or never, offline). */
function connect(u) {
  user = u;
  backend = accountBackend(handle, u.uid);
  engine.attach(backend, u.uid);
  updateProfile({ uid: u.uid, email: u.email || "", name: u.displayName || "", photo: u.photoURL || "" });
  let first;
  const ready = new Promise((r) => { first = r; });
  stopWatch?.();
  stopWatch = backend.watch({
    onIndex: (index) => engine.onRemoteIndex(index).finally(() => { first(); publish(); }),
    onVault: () => engine.pullVault().catch(() => {}).finally(() => publish()),
    onConnected: (c) => { connected = c; publish(); if (c) schedulePush(200); },
    onOffset: (ms) => engine.setClockOffset(ms),
  });
  publish();
  return ready;
}

function disconnect() {
  stopWatch?.();
  stopWatch = null;
  backend = null;
  user = null;
  connected = false;
  engine.detach();
}

function updateProfile(patch) {
  const i = profiles.list.findIndex((p) => p.uid === patch.uid);
  if (i >= 0) profiles.list[i] = { ...profiles.list[i], ...patch };
  saveProfiles(profiles);
}

/* ── signing in and out ─────────────────────────────────────────── */
/**
 * @param {{ method: "email"|"google", email?: string, password?: string, create?: boolean }} opts
 * @returns {Promise<{ ok: boolean, reload?: boolean, cancelled?: boolean, error?: string }>}
 */
export async function signIn({ method, email = "", password = "", create = false }) {
  const slot = newSlot();
  const h = profileApp(slot);
  let u;
  try {
    if (method === "google") u = await googleSignIn(h, await googleIdToken());
    else u = create ? await emailSignUp(h, email, password) : await emailSignIn(h, email, password);
  } catch (err) {
    await dropProfileApp(slot);
    return { ok: false, error: friendlyAuthError(err), code: err?.code };
  }
  const info = { uid: u.uid, slot, email: u.email || email, name: u.displayName || "", photo: u.photoURL || "", provider: method };
  const existing = profiles.list.find((p) => p.uid === u.uid);

  if (existing) {
    const oldSlot = existing.slot;
    Object.assign(existing, info);
    saveProfiles(profiles);
    if (oldSlot !== slot) await dropProfileApp(oldSlot);
    if (profiles.active === u.uid) {
      // Signing in again after the session ended: same data, just reconnect.
      disconnect();
      handle = h;
      await Promise.race([connect(u), sleep(4000)]);
      return { ok: true };
    }
    await switchProfile(u.uid);
    return { ok: true, reload: true };
  }

  if (profiles.active !== LOCAL) {
    // Another teacher is using this computer: keep their data aside and start this one fresh.
    profiles.list.push(info);
    saveProfiles(profiles);
    await switchProfile(u.uid);
    return { ok: true, reload: true };
  }

  // First sign-in from "this computer": decide what happens to the data already here.
  const remoteIndex = await accountBackend(h, u.uid).getIndex().catch(() => ({}));
  const remoteHas = Object.values(remoteIndex).some((ids) => Object.keys(ids).length);
  let choice = "merge";
  if (remoteHas && engine.hasLocalData()) {
    choice = await ui.askMerge({ email: info.email, counts: localCounts() });
    if (choice === "cancel") {
      await signOutProfile(h).catch(() => {});
      await dropProfileApp(slot);
      return { ok: false, cancelled: true };
    }
  }
  if (choice === "replace") {
    await downloadBackup({ auto: true });
    flushCaptures();
    clearCurrent(withSuspended);
    engine.reset();
  }
  profiles.list.push(info);
  profiles.active = u.uid;
  saveProfiles(profiles);
  if (choice === "replace") return reloadSoon();
  handle = h;
  await Promise.race([connect(u), sleep(4000)]);
  return { ok: true };
}

function reloadSoon() {
  setTimeout(() => location.reload(), 300);
  return { ok: true, reload: true };
}

/** Upload what's waiting, but never hang a switch or sign-out on a dead connection. */
async function pushNow(ms = 4000) {
  flushCaptures();
  if (!backend || !connected) return false;
  try { await Promise.race([engine.push(), sleep(ms).then(() => { throw new Error("timeout"); })]); return true; } catch { return false; }
}

/** Switch this computer to another profile (uid, or LOCAL). Reloads the app. */
export async function switchProfile(pid) {
  await pushNow();
  flushCaptures();
  await stashCurrent(profiles.active, withSuspended);
  await restoreStash(pid, withSuspended);
  profiles.active = pid;
  saveProfiles(profiles);
  return reloadSoon();
}

/**
 * Sign out. The teacher's data stays on this computer (offline use, quick sign-in) unless removeData.
 * Data with changes that haven't uploaded is never removed.
 */
export async function signOut({ removeData = false } = {}) {
  const p = activeProfile();
  if (!p) return { ok: true };
  await pushNow();
  const pending = engine.status.pending;
  if (handle) await signOutProfile(handle).catch(() => {});
  await dropProfileApp(p.slot);
  disconnect();
  const remove = removeData && pending === 0;
  if (remove) {
    clearCurrent(withSuspended);
    profiles.list = profiles.list.filter((x) => x.uid !== p.uid);
  } else {
    await stashCurrent(p.uid, withSuspended);
  }
  await restoreStash(LOCAL, withSuspended);
  profiles.active = LOCAL;
  saveProfiles(profiles);
  return { ...reloadSoon(), kept: !remove, pending };
}

/** Forget a signed-out profile's data on this computer. */
export async function removeProfile(uid) {
  if (uid === profiles.active) return;
  const p = profiles.list.find((x) => x.uid === uid);
  await deleteStash(uid);
  if (p) await dropProfileApp(p.slot);
  profiles.list = profiles.list.filter((x) => x.uid !== uid);
  saveProfiles(profiles);
  publish();
}

export const profileHasLocalData = (uid) => hasStash(uid);

export async function sendPasswordReset(email) {
  const slot = newSlot();
  try { await resetPassword(profileApp(slot), email); return { ok: true }; } catch (err) { return { ok: false, error: friendlyAuthError(err) }; } finally { await dropProfileApp(slot); }
}

export async function syncNow() {
  if (!backend) return { ok: false, error: "Not signed in." };
  flushCaptures();
  try { await engine.pull(); return { ok: true }; } catch (err) { return { ok: false, error: err?.message || String(err) }; }
}

/* ── AI keys ─────────────────────────────────────────────────────── */
const vaultCall = async (fn) => {
  try { await fn(); publish(); return { ok: true }; } catch (err) { publish(); return { ok: false, error: err?.code === "bad-passphrase" ? err.message : err?.message || String(err) }; }
};
export const enableKeySync = (passphrase) => vaultCall(() => engine.unlockVault(passphrase));
export const resetKeySync = (passphrase) => vaultCall(() => engine.resetVault(passphrase));
export const disableKeySync = () => vaultCall(() => engine.disableVault());

/* ── backup files ───────────────────────────────────────────────── */
function localCounts() {
  const n = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || "[]"); return Array.isArray(v) ? v.length : 0; } catch { return 0; } };
  return { worksheets: n("lingo_maker_saves"), classes: n("vm_classes") };
}

/** Build the backup object. With a passphrase, the AI keys are included, encrypted like the vault. */
export async function buildBackup({ passphrase = "" } = {}) {
  flushCaptures();
  const body = { format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(), account: activeProfile()?.email || null, records: engine.snapshot() };
  if (passphrase) {
    const keys = {};
    for (const [k, name] of Object.entries(SECRET)) keys[name] = localStorage.getItem(k) || "";
    body.keys = await encryptWithPassphrase(passphrase, keys, BACKUP_AAD);
  }
  return body;
}

export async function downloadBackup({ passphrase = "", auto = false } = {}) {
  const body = await buildBackup({ passphrase });
  const date = new Date().toISOString().slice(0, 10);
  const name = `vocab-master-backup-${auto ? "before-sign-in-" : ""}${date}.json`;
  const url = URL.createObjectURL(new Blob([JSON.stringify(body)], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return { ok: true, name, records: body.records.length };
}

/** Check a backup file's text. Returns the parsed body or throws a friendly error. */
export function parseBackup(text) {
  let body;
  try { body = JSON.parse(text); } catch { throw new Error("This isn't a Vocab Master backup file."); }
  if (body?.format !== BACKUP_FORMAT || !Array.isArray(body.records)) throw new Error("This isn't a Vocab Master backup file.");
  if (body.version > 1) throw new Error("This backup comes from a newer Vocab Master. Update the app first.");
  return body;
}

/**
 * Merge a backup into this profile (newest version of each record wins) and queue it for upload.
 * @returns {{ ok: true, changed: string[], keys: boolean }}
 */
export async function importBackup(body, { passphrase = "" } = {}) {
  // Open the keys first: a wrong passphrase must leave everything as it was.
  const keyValues = body.keys && passphrase ? await decryptWithPassphrase(passphrase, body.keys, BACKUP_AAD) : null;
  const records = body.records.filter((r) => r && typeof r.key === "string" && typeof r.id === "string" && SYNCED[r.key] && r.rec);
  const changed = engine.applyRecords(records, { fromRemote: false });
  let keys = false;
  for (const [k, name] of Object.entries(SECRET)) if (keyValues?.[name]) { localStorage.setItem(k, keyValues[name]); keys = true; }
  schedulePush(200);
  return { ok: true, changed, keys };
}
