/* Sync — pure merge rules (no DOM, no network; tested in tests/sync.test.mjs).
   A stored key is "exploded" into items (id → JSON string), each item carries { t, by, del } metadata,
   and two copies merge item by item: the later write wins; on a tie the larger device id wins, so every
   computer settles on the same answer. A deletion is a tombstone with its own time, so an older edit
   can't bring a deleted record back, but a newer one can. */

export const TOMBSTONE_TTL = 90 * 24 * 3600 * 1000;

const parse = (raw, fallback) => {
  if (raw == null) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
};

/** Stored string → Map(itemId → string). Unparseable or id-less data yields no items (it stays local). */
export function explode(spec, raw) {
  const out = new Map();
  if (raw == null) return out;
  if (spec.kind === "value") {
    out.set("_", String(raw));
    return out;
  }
  const data = parse(raw, null);
  if (spec.kind === "object") {
    if (data && typeof data === "object" && !Array.isArray(data)) {
      for (const [k, v] of Object.entries(data)) if (v !== undefined) out.set(k, JSON.stringify(v));
    }
    return out;
  }
  if (Array.isArray(data)) {
    for (const rec of data) {
      const id = rec && typeof rec === "object" ? rec[spec.id] : null;
      if (typeof id === "string" && id) out.set(id, JSON.stringify(rec));
    }
  }
  return out;
}

/**
 * Map(itemId → string) → stored string (or null to remove the key).
 * Keeps the current local order and anything without an id; new list records go after the known ones,
 * then lists with `newestFirst` are sorted by that field (newest first, stable).
 */
export function implode(spec, items, currentRaw) {
  if (spec.kind === "value") return items.has("_") ? items.get("_") : null;
  if (spec.kind === "object") {
    if (!items.size && currentRaw == null) return null;
    const current = parse(currentRaw, {});
    const order = current && typeof current === "object" && !Array.isArray(current) ? Object.keys(current) : [];
    const out = {};
    for (const k of order) if (items.has(k)) out[k] = JSON.parse(items.get(k));
    for (const [k, s] of items) if (!(k in out)) out[k] = JSON.parse(s);
    return JSON.stringify(out);
  }
  if (!items.size && currentRaw == null) return null;
  const current = parse(currentRaw, []);
  const list = [];
  const placed = new Set();
  for (const rec of Array.isArray(current) ? current : []) {
    const id = rec && typeof rec === "object" ? rec[spec.id] : null;
    if (typeof id === "string" && id) {
      if (items.has(id) && !placed.has(id)) { list.push(JSON.parse(items.get(id))); placed.add(id); }
    } else {
      list.push(rec); // no id: never synced, never dropped
    }
  }
  for (const [id, s] of items) if (!placed.has(id)) list.push(JSON.parse(s));
  if (spec.newestFirst) {
    const f = spec.newestFirst;
    list.sort((a, b) => String(b?.[f] ?? "").localeCompare(String(a?.[f] ?? "")));
  }
  return JSON.stringify(list);
}

/** Short content hash (FNV-1a 32 + length), to notice changes made while sync wasn't watching. */
export function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(36)}.${s.length.toString(36)}`;
}

/**
 * Compare the current items of one key with its recorded metadata.
 * @returns {{ changed: string[], removed: string[] }} ids edited/added locally, ids deleted locally
 */
export function localChanges(items, meta = {}) {
  const changed = [];
  const removed = [];
  for (const [id, s] of items) {
    const m = meta[id];
    if (!m || m.del || m.h !== hash(s)) changed.push(id);
  }
  for (const [id, m] of Object.entries(meta)) if (!m.del && !items.has(id)) removed.push(id);
  return { changed, removed };
}

/** Does record `b` beat record `a`? Records are { t, by, del? }; a missing record always loses. */
export function beats(b, a) {
  if (!b) return false;
  if (!a) return true;
  if (b.t !== a.t) return b.t > a.t;
  return String(b.by || "") > String(a.by || "");
}

/** Next timestamp for a local edit: never earlier than the record's previous time. */
export const stamp = (now, prev) => Math.max(Math.floor(now), prev ? prev.t + 1 : 0);

/** Tombstones older than the TTL can be forgotten (every computer has long since seen them). */
export function expiredTombstones(meta = {}, now) {
  return Object.entries(meta).filter(([, m]) => m.del && now - m.t > TOMBSTONE_TTL).map(([id]) => id);
}

/* ── RTDB path segments: keys may not contain . # $ [ ] / (or control characters) ─────────── */
export function encodeSeg(s) {
  if (s === "") return "~e";
  return String(s).replace(/[^A-Za-z0-9_-]/g, (c) => `~${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}
export function decodeSeg(s) {
  if (s === "~e") return "";
  return String(s).replace(/~([0-9a-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
