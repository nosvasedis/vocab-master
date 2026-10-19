/* Sync — the engine: notices local edits, keeps an outbox, and merges remote records into localStorage.
   It knows nothing about Firebase or the DOM: `storage` is { get, set, remove } and the backend is
   { getIndex, getItems, putItems, getVault, putVault } (backend-firebase.js, or a fake in the tests).
   localStorage stays the source of truth; the app keeps reading and writing it exactly as before. */
import { SYNCED, SECRET } from "./registry.js";
import { explode, implode, hash, localChanges, beats, stamp, expiredTombstones } from "./merge.js";
import { unlockKey, seal, open } from "./crypto.js";

export const STATE_KEY = "vm_sync_state";
const CHUNK_BYTES = 4 * 1024 * 1024;

const randomId = (prefix) => `${prefix}${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
const freshState = () => ({ v: 1, device: randomId("d"), items: {}, dirty: {}, vault: { on: false }, lastSync: 0 });

function validRec(spec, rec) {
  if (!rec || typeof rec.t !== "number" || !Number.isFinite(rec.t)) return false;
  if (rec.del) return true;
  if (typeof rec.v !== "string") return false;
  if (spec.kind === "value") return true;
  try { JSON.parse(rec.v); return true; } catch { return false; }
}

/**
 * @param {{ storage: { get(k): string|null, set(k, v): void, remove(k): void }, now?: () => number, onChange?: (keys: string[]) => void, onStatus?: (s: object) => void }} opts
 */
export function createEngine({ storage, now = Date.now, onChange = () => {}, onStatus = () => {} }) {
  let st = load();
  let backend = null;
  let uid = "";
  let offset = 0;
  let vaultHandle = null;
  let pushing = null;
  let pulling = null;
  let status = { phase: "local", error: "", vault: st.vault.on ? "on" : "off" };

  function load() {
    try {
      const s = JSON.parse(storage.get(STATE_KEY) || "null");
      if (s && s.v === 1 && s.items && s.dirty && s.device) return { vault: { on: false }, lastSync: 0, ...s };
    } catch { /* corrupt: start over (local data is untouched) */ }
    return freshState();
  }
  const save = () => storage.set(STATE_KEY, JSON.stringify(st));
  const time = () => now() + offset;
  const metaOf = (key) => (st.items[key] ||= {});
  const markDirty = (key, id) => { (st.dirty[key] ||= {})[id] = 1; };
  const clearDirty = (key, id) => { if (st.dirty[key]) { delete st.dirty[key][id]; if (!Object.keys(st.dirty[key]).length) delete st.dirty[key]; } };
  const pendingCount = () => Object.values(st.dirty).reduce((n, d) => n + Object.keys(d).length, 0) + (st.vault.on && st.vault.dirty ? 1 : 0);
  const setStatus = (patch) => { status = { ...status, ...patch, pending: pendingCount(), lastSync: st.lastSync, vault: vaultState() }; onStatus(status); };
  const vaultState = () => (!st.vault.on ? "off" : st.vault.waiting || (st.vault.dirty && !vaultHandle) ? "locked" : "on");

  /* ── local edits ─────────────────────────────────────────────── */
  function secretsNow() {
    const out = {};
    for (const [k, name] of Object.entries(SECRET)) out[name] = storage.get(k) || "";
    return out;
  }

  /** Each provider's key is its own item inside the vault: { t, h, by } per provider in st.vault.keys. */
  function captureSecrets() {
    if (!st.vault.on) return false;
    const keys = (st.vault.keys ||= {});
    let changed = false;
    for (const [name, v] of Object.entries(secretsNow())) {
      const h = hash(v);
      if (keys[name]?.h === h) continue;
      keys[name] = { t: stamp(time(), keys[name]), h, by: st.device };
      changed = true;
    }
    if (changed) st.vault.dirty = true;
    return changed;
  }

  /** Record what changed in one key since sync last looked. Returns the number of items stamped. */
  function captureKey(key, { persist = true } = {}) {
    if (SECRET[key]) { const c = captureSecrets(); if (c && persist) { save(); setStatus({}); } return c ? 1 : 0; }
    const spec = SYNCED[key];
    if (!spec) return 0;
    const items = explode(spec, storage.get(key));
    const meta = metaOf(key);
    const { changed, removed } = localChanges(items, meta);
    for (const id of changed) { meta[id] = { t: stamp(time(), meta[id]), h: hash(items.get(id)), by: st.device }; markDirty(key, id); }
    for (const id of removed) { meta[id] = { t: stamp(time(), meta[id]), by: st.device, del: true }; markDirty(key, id); }
    const n = changed.length + removed.length;
    if (n && persist) { save(); setStatus({}); }
    return n;
  }

  function captureAll() {
    let n = 0;
    for (const key of Object.keys(SYNCED)) n += captureKey(key, { persist: false });
    if (captureSecrets()) n++;
    const t = time();
    for (const key of Object.keys(st.items)) {
      for (const id of expiredTombstones(st.items[key], t)) if (!st.dirty[key]?.[id]) delete st.items[key][id];
    }
    save();
    setStatus({});
    return n;
  }

  /* ── records from elsewhere (the account, or a backup file) ─────── */
  /**
   * Merge records into localStorage. Remote records clear the outbox for what they replace;
   * imported ones (fromRemote: false) are new local changes and go into the outbox.
   * @param {{ key: string, id: string, rec: { t: number, by?: string, v?: string, del?: boolean } }[]} list
   * @returns {string[]} keys whose stored value changed
   */
  function applyRecords(list, { fromRemote = true } = {}) {
    const byKey = new Map();
    for (const r of list) if (SYNCED[r.key]) (byKey.get(r.key) || byKey.set(r.key, []).get(r.key)).push(r);
    const changedKeys = [];
    for (const [key, recs] of byKey) {
      const spec = SYNCED[key];
      captureKey(key, { persist: false }); // never overwrite an edit sync hasn't recorded yet
      const current = storage.get(key);
      const items = explode(spec, current);
      const meta = metaOf(key);
      let changed = false;
      for (const { id, rec } of recs) {
        if (!validRec(spec, rec)) continue;
        const incoming = { t: rec.t, by: rec.by || "", del: !!rec.del };
        if (!beats(incoming, meta[id])) {
          if (fromRemote && beats(meta[id], incoming)) markDirty(key, id); // ours is newer: make sure it uploads
          continue;
        }
        if (incoming.del) {
          if (items.has(id)) changed = true;
          items.delete(id);
          meta[id] = { t: incoming.t, by: incoming.by, del: true };
        } else {
          if (items.get(id) !== rec.v) changed = true;
          items.set(id, rec.v);
          meta[id] = { t: incoming.t, by: incoming.by, h: hash(rec.v) };
        }
        if (fromRemote) clearDirty(key, id);
        else markDirty(key, id);
      }
      if (changed) {
        const raw = implode(spec, items, current);
        if (raw == null) storage.remove(key);
        else storage.set(key, raw);
        changedKeys.push(key);
      }
    }
    save();
    setStatus({});
    if (changedKeys.length) onChange(changedKeys);
    return changedKeys;
  }

  /** Everything this computer holds, as records (for backups). */
  function snapshot() {
    captureAll();
    const out = [];
    for (const key of Object.keys(SYNCED)) {
      const items = explode(SYNCED[key], storage.get(key));
      for (const [id, m] of Object.entries(st.items[key] || {})) {
        if (m.del) out.push({ key, id, rec: { t: m.t, by: m.by, del: true } });
        else if (items.has(id)) out.push({ key, id, rec: { t: m.t, by: m.by, v: items.get(id) } });
      }
    }
    return out;
  }

  /* ── talking to the account ───────────────────────────────────── */
  function attach(nextBackend, nextUid) {
    backend = nextBackend;
    uid = nextUid;
    setStatus({ phase: "syncing", error: "" });
  }
  function detach() {
    backend = null;
    uid = "";
    vaultHandle = null;
    setStatus({ phase: "local", error: "" });
  }
  const setClockOffset = (ms) => { offset = Number(ms) || 0; };

  /** Compare the account's index with ours: fetch what's newer there, queue what's newer here. */
  async function reconcile(index) {
    const need = [];
    for (const key of Object.keys(SYNCED)) {
      const remote = index[key] || {};
      const meta = metaOf(key);
      for (const [id, t] of Object.entries(remote)) {
        if (!meta[id] || t > meta[id].t) need.push({ key, id });
      }
      for (const [id, m] of Object.entries(meta)) {
        if (!(id in remote) || m.t > remote[id]) markDirty(key, id);
      }
    }
    if (need.length) applyRecords(await backend.getItems(need));
    else { save(); setStatus({}); }
  }

  async function pull() {
    if (!backend) return;
    if (pulling) return pulling;
    pulling = (async () => {
      try {
        captureAll();
        setStatus({ phase: "syncing" });
        await reconcile(await backend.getIndex());
        await pullVault();
        await push();
      } finally {
        pulling = null;
      }
    })();
    return pulling;
  }

  async function onRemoteIndex(index) {
    if (!backend) return;
    try {
      await reconcile(index);
      if (pendingCount()) await push();
      else { st.lastSync = time(); save(); setStatus({ phase: "synced", error: "" }); }
    } catch (err) {
      setStatus({ phase: "error", error: err?.message || String(err) });
    }
  }

  async function push() {
    if (!backend) return;
    if (pushing) return pushing;
    pushing = (async () => {
      try {
        captureAll();
        const batch = [];
        for (const [key, ids] of Object.entries(st.dirty)) {
          if (!SYNCED[key]) { delete st.dirty[key]; continue; }
          const items = explode(SYNCED[key], storage.get(key));
          for (const id of Object.keys(ids)) {
            const m = st.items[key]?.[id];
            if (!m) { clearDirty(key, id); continue; }
            const rec = m.del ? { t: m.t, by: m.by, del: true } : items.has(id) ? { t: m.t, by: m.by, v: items.get(id) } : null;
            if (rec) batch.push({ key, id, rec });
            else clearDirty(key, id);
          }
        }
        let chunk = [];
        let bytes = 0;
        const flush = async () => {
          if (!chunk.length) return;
          const sent = chunk;
          chunk = [];
          bytes = 0;
          await backend.putItems(sent);
          for (const { key, id, rec } of sent) if (st.items[key]?.[id]?.t === rec.t) clearDirty(key, id);
          save();
          setStatus({});
        };
        for (const entry of batch) {
          const size = (entry.rec.v?.length || 0) + 200;
          if (bytes + size > CHUNK_BYTES) await flush();
          chunk.push(entry);
          bytes += size;
        }
        await flush();
        await pushVault();
        st.lastSync = time();
        save();
        setStatus({ phase: "synced", error: "" });
      } catch (err) {
        setStatus({ phase: "error", error: err?.message || String(err) });
        throw err;
      } finally {
        pushing = null;
      }
    })();
    return pushing;
  }

  /* ── the AI-key vault ─────────────────────────────────────────── */
  // Decrypted vault: { deepseek: { v, t, by }, gemini: { v, t, by } }; each key merges on its own (later wins).
  const NAMES = Object.values(SECRET);
  const keyName = (name) => Object.keys(SECRET).find((k) => SECRET[k] === name);

  function setSecret(name, v) {
    const k = keyName(name);
    if (v) storage.set(k, v);
    else storage.remove(k);
  }

  /** Merge a decrypted vault into this computer. Returns true if this computer still has something newer. */
  function mergeVault(remoteKeys) {
    captureSecrets();
    const keys = (st.vault.keys ||= {});
    let applied = false;
    let ahead = false;
    for (const name of NAMES) {
      const r = remoteKeys?.[name];
      const rec = r && typeof r.t === "number" ? { t: r.t, by: r.by || "" } : null;
      if (beats(rec, keys[name])) {
        const v = typeof r.v === "string" ? r.v.trim() : "";
        setSecret(name, v);
        keys[name] = { ...rec, h: hash(v) };
        applied = true;
      } else if (beats(keys[name], rec)) {
        ahead = true;
      }
    }
    if (applied) onChange(Object.keys(SECRET));
    return ahead;
  }

  async function pullVault() {
    if (!st.vault.on || !backend) return;
    const remote = await backend.getVault();
    if (!remote) { if (st.vault.seen) { st.vault.dirty = true; save(); } return; }
    if (remote.t === st.vault.seen && !st.vault.waiting) return;
    if (!vaultHandle || vaultHandle.salt !== remote.salt) { st.vault.waiting = true; save(); setStatus({}); return; }
    const ahead = mergeVault(await open(vaultHandle, remote, uid));
    st.vault = { ...st.vault, seen: remote.t, salt: remote.salt, waiting: false, dirty: st.vault.dirty || ahead };
    save();
    setStatus({});
  }

  async function pushVault() {
    if (!st.vault.on || !st.vault.dirty || !vaultHandle || !backend) return;
    captureSecrets();
    const now = secretsNow();
    const payload = {};
    for (const name of NAMES) payload[name] = { v: now[name], ...(st.vault.keys?.[name] ? { t: st.vault.keys[name].t, by: st.vault.keys[name].by } : { t: 0, by: "" }) };
    const sealed = await seal(vaultHandle, payload, uid);
    const t = stamp(time(), st.vault.seen ? { t: st.vault.seen } : null);
    const marks = JSON.stringify(st.vault.keys);
    await backend.putVault({ ...sealed, t, by: st.device });
    st.vault = { ...st.vault, seen: t, salt: sealed.salt, dirty: JSON.stringify(st.vault.keys) !== marks };
    save();
  }

  /**
   * Turn key sync on, or unlock it on this computer. With a vault already in the account, the passphrase
   * must open it; the account's keys win, and a key only this computer has is kept and uploaded.
   */
  async function unlockVault(passphrase) {
    if (!backend) throw new Error("Sign in first.");
    const remote = await backend.getVault();
    const local = secretsNow();
    if (remote) {
      const handle = await unlockKey(passphrase, remote);
      const remoteKeys = await open(handle, remote, uid);
      vaultHandle = handle;
      if (!st.vault.on) {
        // First time on this computer: its keys only count where the account has none.
        const keys = {};
        for (const name of NAMES) keys[name] = local[name] && !remoteKeys?.[name]?.v ? { t: stamp(time(), remoteKeys?.[name]), h: hash(local[name]), by: st.device } : { t: 0, h: hash(local[name]), by: "" };
        st.vault = { on: true, keys };
      }
      const ahead = mergeVault(remoteKeys);
      st.vault = { ...st.vault, on: true, seen: remote.t, salt: remote.salt, waiting: false, dirty: !!st.vault.dirty || ahead };
    } else {
      vaultHandle = await unlockKey(passphrase);
      st.vault = { on: true, keys: {}, salt: vaultHandle.salt, dirty: true, seen: st.vault.seen || 0 };
      captureSecrets();
    }
    save();
    await pushVault();
    setStatus({});
  }

  /** Forgot the passphrase: replace the account's vault with this computer's keys under a new one. */
  async function resetVault(passphrase) {
    if (!backend) throw new Error("Sign in first.");
    const remote = await backend.getVault();
    vaultHandle = await unlockKey(passphrase);
    const keys = {};
    const local = secretsNow();
    const t = stamp(time(), remote ? { t: remote.t } : null);
    for (const name of NAMES) keys[name] = { t, h: hash(local[name]), by: st.device };
    st.vault = { on: true, keys, salt: vaultHandle.salt, dirty: true, seen: remote?.t || 0 };
    save();
    await pushVault();
    setStatus({});
  }

  async function disableVault() {
    vaultHandle = null;
    st.vault = { on: false };
    save();
    if (backend) await backend.putVault(null);
    setStatus({});
  }

  /** Forget everything sync knows (the data itself stays): used when a profile's data is replaced. */
  function reset() {
    st = { ...freshState(), device: st.device };
    save();
    setStatus({});
  }

  return {
    captureKey, captureAll, applyRecords, snapshot, attach, detach, setClockOffset,
    pull, push, onRemoteIndex, pullVault, unlockVault, resetVault, disableVault, reset,
    get status() { return { ...status, pending: pendingCount(), lastSync: st.lastSync, vault: vaultState() }; },
    get device() { return st.device; },
    get vaultOn() { return !!st.vault.on; },
    get vaultUnlocked() { return !!vaultHandle; },
    /** Worksheets or classes on this computer (settings alone don't count). */
    hasLocalData: () => Object.keys(SYNCED).some((k) => SYNCED[k].kind === "list" && explode(SYNCED[k], storage.get(k)).size > 0),
    setStatus,
  };
}
