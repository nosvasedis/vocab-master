/* Account sync: key registry, merge rules, the engine between two "laptops", the key vault, the Google loopback. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SYNCED, SECRET, LOCAL_ONLY } from "../desktop/renderer/js/sync/registry.js";
import { explode, implode, hash, localChanges, beats, encodeSeg, decodeSeg, TOMBSTONE_TTL } from "../desktop/renderer/js/sync/merge.js";
import { createEngine } from "../desktop/renderer/js/sync/engine.js";
import { seal, open, unlockKey, encryptWithPassphrase, decryptWithPassphrase, passphraseHint } from "../desktop/renderer/js/sync/crypto.js";
import { createGoogleLoopback } from "../desktop/google-signin.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const RENDERER = path.join(ROOT, "desktop", "renderer");

/* ── helpers: a fake localStorage, a shared fake account, a controllable clock ─────────── */
function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => m.set(k, String(v)), remove: (k) => m.delete(k), map: m };
}
function memoryAccount() {
  const items = new Map(); // "key\u0001id" → rec
  let vault = null;
  const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
  return {
    items,
    async getIndex() {
      const out = {};
      for (const [k, rec] of items) { const [key, id] = k.split("\u0001"); (out[key] ||= {})[id] = rec.t; }
      return out;
    },
    async getItems(list) { return list.filter(({ key, id }) => items.has(`${key}\u0001${id}`)).map(({ key, id }) => ({ key, id, rec: clone(items.get(`${key}\u0001${id}`)) })); },
    async putItems(list) { for (const { key, id, rec } of list) items.set(`${key}\u0001${id}`, clone(rec)); },
    async getVault() { return clone(vault); },
    async putVault(v) { vault = clone(v); },
    get vault() { return vault; },
  };
}
const clock = (start = 1_000_000) => { let t = start; const f = () => t; f.tick = (ms = 1000) => { t += ms; }; return f; };
function laptop(account, now, init = {}) {
  const storage = memoryStorage(init);
  const engine = createEngine({ storage, now });
  engine.attach(account, "uid-1");
  return { storage, engine, json: (k) => JSON.parse(storage.get(k) || "null") };
}
const ws = (id, savedAt, label = id) => ({ id, savedAt, label, data: { words: [label] } });

/* ── registry ─────────────────────────────────────────────────────── */
test("registry: every vm_* / lingo_* key the renderer uses is classified (synced, secret or local-only)", () => {
  const found = new Set();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!["vendor", "assets", "lessons"].includes(e.name)) walk(p); continue; }
      if (!/\.(js|mjs)$/.test(e.name)) continue;
      for (const m of fs.readFileSync(p, "utf8").matchAll(/["'`]((?:vm|lingo)_[a-z0-9_]+)["'`]/g)) found.add(m[1]);
    }
  };
  walk(RENDERER);
  const known = new Set([...Object.keys(SYNCED), ...Object.keys(SECRET), ...Object.keys(LOCAL_ONLY)]);
  const missing = [...found].filter((k) => !known.has(k));
  assert.deepEqual(missing, [], `classify these keys in desktop/renderer/js/sync/registry.js: ${missing.join(", ")}`);
  for (const k of Object.keys(SECRET)) assert.ok(!SYNCED[k], `${k} must never sync as a plain item`);
});

/* ── merge rules ──────────────────────────────────────────────────── */
test("explode/implode: lists by id, objects by field, values whole; id-less records are kept, never synced", () => {
  const list = SYNCED.vm_classes;
  const raw = JSON.stringify([{ id: "a", n: 1 }, { n: "no id" }, { id: "b", n: 2 }]);
  const items = explode(list, raw);
  assert.deepEqual([...items.keys()], ["a", "b"]);
  items.set("c", JSON.stringify({ id: "c", n: 3 }));
  items.delete("a");
  assert.deepEqual(JSON.parse(implode(list, items, raw)), [{ n: "no id" }, { id: "b", n: 2 }, { id: "c", n: 3 }]);

  const prefs = SYNCED.vm_prefs_v2;
  const p = explode(prefs, JSON.stringify({ theme: "dark", volume: 80 }));
  p.set("volume", "40");
  assert.deepEqual(JSON.parse(implode(prefs, p, '{"theme":"dark","volume":80}')), { theme: "dark", volume: 40 });

  const v = SYNCED.vm_quiz_timer;
  assert.equal(implode(v, explode(v, "on"), "on"), "on");
  assert.equal(implode(v, new Map(), "on"), null);
  assert.equal(explode(list, "not json").size, 0);
});

test("implode: worksheets stay newest first", () => {
  const spec = SYNCED.lingo_maker_saves;
  const items = new Map([["x", JSON.stringify(ws("x", "2026-01-01"))], ["y", JSON.stringify(ws("y", "2026-03-01"))], ["z", JSON.stringify(ws("z", "2026-02-01"))]]);
  assert.deepEqual(JSON.parse(implode(spec, items, null)).map((s) => s.id), ["y", "z", "x"]);
});

test("localChanges and beats: hashes find edits; later time wins, ties go to the larger device id", () => {
  const items = new Map([["a", "1"], ["b", "2"]]);
  const meta = { a: { t: 1, h: hash("1") }, b: { t: 1, h: hash("old") }, c: { t: 1, h: hash("3") }, d: { t: 1, del: true } };
  assert.deepEqual(localChanges(items, meta), { changed: ["b"], removed: ["c"] });
  assert.ok(beats({ t: 2 }, { t: 1 }));
  assert.ok(!beats({ t: 1 }, { t: 2 }));
  assert.ok(beats({ t: 5, by: "d2" }, { t: 5, by: "d1" }));
  assert.ok(!beats({ t: 5, by: "d1" }, { t: 5, by: "d2" }));
  assert.ok(beats({ t: 0 }, undefined));
});

test("path segments: anything round-trips and nothing RTDB forbids survives", () => {
  for (const s of ["ws_123_abc", "a.b#c$d[e]f/g", "", "Ελληνικά ✨", "~e", "~0041"]) {
    const e = encodeSeg(s);
    assert.ok(!/[.#$[\]/]/.test(e), e);
    assert.equal(decodeSeg(e), s);
  }
});

/* ── engine: two laptops, one account ─────────────────────────────── */
test("engine: a worksheet saved on one laptop arrives on the other", async () => {
  const acct = memoryAccount();
  const now = clock();
  const A = laptop(acct, now, { lingo_maker_saves: JSON.stringify([ws("w1", "2026-10-01")]) });
  const B = laptop(acct, now);
  await A.engine.pull();
  await B.engine.pull();
  assert.deepEqual(B.json("lingo_maker_saves").map((s) => s.id), ["w1"]);
  assert.equal(A.engine.status.pending, 0);
  assert.equal(B.engine.status.phase, "synced");
});

test("engine: different worksheets and classes added on both laptops are all kept", async () => {
  const acct = memoryAccount();
  const now = clock();
  const A = laptop(acct, now, { lingo_maker_saves: JSON.stringify([ws("a1", "2026-10-02")]), vm_classes: JSON.stringify([{ id: "c1", name: "A Senior", players: [] }]) });
  const B = laptop(acct, now, { lingo_maker_saves: JSON.stringify([ws("b1", "2026-10-03")]), vm_classes: JSON.stringify([{ id: "c2", name: "B Senior", players: [] }]) });
  await A.engine.pull();
  await B.engine.pull();
  await A.engine.pull();
  for (const L of [A, B]) {
    assert.deepEqual(L.json("lingo_maker_saves").map((s) => s.id), ["b1", "a1"]);
    assert.deepEqual(L.json("vm_classes").map((c) => c.id).sort(), ["c1", "c2"]);
  }
});

test("engine: settings merge field by field", async () => {
  const acct = memoryAccount();
  const now = clock();
  const A = laptop(acct, now, { vm_prefs_v2: JSON.stringify({ theme: "light", volume: 80 }) });
  await A.engine.pull();
  const B = laptop(acct, now);
  await B.engine.pull();
  now.tick();
  A.storage.set("vm_prefs_v2", JSON.stringify({ theme: "dark", volume: 80 }));
  B.storage.set("vm_prefs_v2", JSON.stringify({ theme: "light", volume: 30 }));
  await A.engine.push();
  await B.engine.pull();
  await A.engine.pull();
  assert.deepEqual(A.json("vm_prefs_v2"), { theme: "dark", volume: 30 });
  assert.deepEqual(B.json("vm_prefs_v2"), { theme: "dark", volume: 30 });
});

test("engine: an edit made after a delete brings the record back; a delete after an edit removes it", async () => {
  const acct = memoryAccount();
  const now = clock();
  const cls = (name) => JSON.stringify([{ id: "c1", name, players: [] }]);
  const A = laptop(acct, now, { vm_classes: cls("4A") });
  await A.engine.pull();
  const B = laptop(acct, now);
  await B.engine.pull();

  now.tick();
  A.storage.set("vm_classes", "[]");          // A deletes …
  A.engine.captureAll();
  now.tick();
  B.storage.set("vm_classes", cls("4A gold")); // … then B renames (later)
  await A.engine.push();
  await B.engine.pull();
  await A.engine.pull();
  assert.equal(A.json("vm_classes")[0].name, "4A gold");
  assert.equal(B.json("vm_classes")[0].name, "4A gold");

  now.tick();
  B.storage.set("vm_classes", cls("4A blue")); // B edits …
  B.engine.captureAll();
  now.tick();
  A.storage.set("vm_classes", "[]");          // … then A deletes (later)
  await B.engine.push();
  await A.engine.pull();
  await B.engine.pull();
  assert.deepEqual(A.json("vm_classes"), []);
  assert.deepEqual(B.json("vm_classes"), []);
});

test("engine: edits made offline wait in the outbox and upload later", async () => {
  const acct = memoryAccount();
  const now = clock();
  const storage = memoryStorage({ vm_quiz_timer: "on" });
  const engine = createEngine({ storage, now });
  engine.captureAll();
  storage.set("vm_quiz_timer", "off");
  engine.captureKey("vm_quiz_timer");
  assert.equal(engine.status.pending, 1);
  // the outbox survives a restart
  const again = createEngine({ storage, now });
  assert.equal(again.status.pending, 1);
  again.attach(acct, "uid-1");
  await again.pull();
  assert.equal(again.status.pending, 0);
  assert.equal(acct.items.get("vm_quiz_timer\u0001_").v, "off");
});

test("engine: a local edit sync hasn't recorded yet is never overwritten by an older remote copy", async () => {
  const acct = memoryAccount();
  const now = clock();
  const A = laptop(acct, now, { vm_board_timer: "on" });
  await A.engine.pull();
  const B = laptop(acct, now);
  await B.engine.pull();
  now.tick();
  B.storage.set("vm_board_timer", "off"); // not captured yet
  await B.engine.onRemoteIndex(await acct.getIndex());
  assert.equal(B.storage.get("vm_board_timer"), "off");
  await B.engine.push();
  await A.engine.pull();
  assert.equal(A.storage.get("vm_board_timer"), "off");
});

test("engine: importing a backup merges newest-wins and queues the result for upload", () => {
  const now = clock();
  const storage = memoryStorage({ lingo_maker_saves: JSON.stringify([ws("w1", "2026-10-01", "mine")]) });
  const engine = createEngine({ storage, now });
  engine.captureAll();
  const changed = engine.applyRecords([
    { key: "lingo_maker_saves", id: "w1", rec: { t: 5, by: "old", v: JSON.stringify(ws("w1", "2026-10-01", "older backup")) } },
    { key: "lingo_maker_saves", id: "w2", rec: { t: 5, by: "old", v: JSON.stringify(ws("w2", "2026-09-01", "from backup")) } },
    { key: "vm_unknown", id: "_", rec: { t: 5, v: "x" } },
    { key: "vm_classes", id: "bad", rec: { t: 5, v: "{not json" } },
  ], { fromRemote: false });
  assert.deepEqual(changed, ["lingo_maker_saves"]);
  assert.deepEqual(JSON.parse(storage.get("lingo_maker_saves")).map((s) => s.label), ["mine", "from backup"]);
  assert.equal(engine.status.pending, 2);
  assert.equal(storage.get("vm_unknown"), null);
});

test("engine: tombstones are forgotten after the TTL", () => {
  const now = clock();
  const storage = memoryStorage({ vm_classes: JSON.stringify([{ id: "c1", players: [] }]) });
  const engine = createEngine({ storage, now });
  engine.captureAll();
  storage.set("vm_classes", "[]");
  engine.captureAll();
  engine.attach(memoryAccount(), "u");
  return engine.push().then(() => {
    now.tick(TOMBSTONE_TTL + 1000);
    engine.captureAll();
    assert.equal(JSON.parse(storage.get("vm_sync_state")).items.vm_classes.c1, undefined);
  });
});

/* ── the key vault ─────────────────────────────────────────────────── */
test("crypto: seal/open round trip; a wrong passphrase or another owner can't open it", async () => {
  const h = await unlockKey("correct horse battery staple");
  const v1 = await seal(h, { deepseek: "sk-test-123", gemini: "" }, "uid-1");
  const v2 = await seal(h, { deepseek: "sk-test-123", gemini: "" }, "uid-1");
  assert.notEqual(v1.iv, v2.iv);
  assert.ok(!v1.ct.includes("sk-test"));
  assert.deepEqual(await open(await unlockKey("correct horse battery staple", v1), v1, "uid-1"), { deepseek: "sk-test-123", gemini: "" });
  await assert.rejects(open(await unlockKey("wrong passphrase!!", v1), v1, "uid-1"), { code: "bad-passphrase" });
  await assert.rejects(open(h, v1, "uid-2"), { code: "bad-passphrase" });
  const b = await encryptWithPassphrase("backup passphrase", { gemini: "AIza-test" }, "vocab-master-backup");
  assert.deepEqual(await decryptWithPassphrase("backup passphrase", b, "vocab-master-backup"), { gemini: "AIza-test" });
  assert.equal(passphraseHint("short").ok, false);
  assert.equal(passphraseHint("four little words here").ok, true);
});

test("engine vault: keys travel only encrypted, and need the passphrase on the other laptop", async () => {
  const acct = memoryAccount();
  const now = clock();
  const A = laptop(acct, now, { lingo_maker_api_key: "sk-test-aaa" });
  await A.engine.pull();
  await A.engine.unlockVault("our class passphrase");
  assert.ok(acct.vault && !JSON.stringify(acct.vault).includes("sk-test"));
  assert.equal([...acct.items.keys()].some((k) => k.startsWith("lingo_maker_api_key")), false);

  const B = laptop(acct, now, { vm_gemini_api_key: "AIza-test-bbb" });
  await B.engine.pull();
  await assert.rejects(B.engine.unlockVault("not the passphrase"), { code: "bad-passphrase" });
  await B.engine.unlockVault("our class passphrase");
  assert.equal(B.storage.get("lingo_maker_api_key"), "sk-test-aaa");
  assert.equal(B.storage.get("vm_gemini_api_key"), "AIza-test-bbb"); // a key only B had is kept and uploaded

  now.tick();
  A.storage.set("lingo_maker_api_key", "sk-test-new");
  await A.engine.pullVault(); // A also picks up B's Gemini key
  await A.engine.push();
  await B.engine.pull();
  assert.equal(B.storage.get("lingo_maker_api_key"), "sk-test-new");
  assert.equal(A.storage.get("vm_gemini_api_key"), "AIza-test-bbb");

  await B.engine.disableVault();
  assert.equal(acct.vault, null);
});

/* ── security rules ───────────────────────────────────────────────── */
test("rules: only the signed-in, non-anonymous owner can read or write users/{uid}", () => {
  const rules = JSON.parse(fs.readFileSync(path.join(ROOT, "firebase", "database.rules.json"), "utf8")).rules;
  assert.equal(rules[".read"], false);
  const u = rules.users.$uid;
  for (const k of [".read", ".write"]) {
    assert.match(u[k], /auth\.uid === \$uid/);
    assert.match(u[k], /sign_in_provider !== 'anonymous'/);
  }
  assert.ok(rules.rooms, "Lingo Live rules stay");
  assert.equal(u.$other[".validate"], false);
});

/* ── Google loopback (desktop) ────────────────────────────────────── */
test("google loopback: accepts only the matching state, once, then closes", async () => {
  let opened = "";
  const lb = createGoogleLoopback({ openExternal: (u) => { opened = u; }, signinUrl: "https://example.test/signin.html", timeoutMs: 5000 });
  const done = lb.start();
  while (!opened) await new Promise((r) => setTimeout(r, 10));
  const url = new URL(opened);
  assert.equal(url.searchParams.get("mode"), "loopback");
  const port = url.searchParams.get("port");
  const state = url.searchParams.get("state");
  const post = (body) => fetch(`http://127.0.0.1:${port}/callback`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
  assert.equal((await post({ state: "wrong", id_token: "x" })).status, 400);
  assert.equal((await fetch(`http://127.0.0.1:${port}/other`)).status, 404);
  assert.equal((await post({ state, id_token: "google-id-token" })).status, 200);
  assert.deepEqual(await done, { ok: true, idToken: "google-id-token" });
  await assert.rejects(post({ state, id_token: "again" }));
});

test("google loopback: cancel and timeout resolve with an error", async () => {
  const lb = createGoogleLoopback({ openExternal: () => {}, timeoutMs: 50 });
  assert.equal((await lb.start()).code, "google/timeout");
  const p = lb.start();
  lb.cancel();
  assert.equal((await p).code, "google/cancelled");
});
