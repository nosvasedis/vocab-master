// Live updates of the desktop app's pages from GitHub (desktop/live-update.js), against a fake GitHub.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { gitBlobSha, isNewerVersion, planUpdate, createLiveUpdater, SHELL_API } from "../desktop/live-update.js";

test("files are fingerprinted exactly as Git does", () => {
  assert.equal(gitBlobSha(Buffer.from("")), "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
  assert.equal(gitBlobSha(Buffer.from("hello\n")), "ce013625030ba8dba906f756967f9e9ca394464a");
  // And as this repository's Git does, for a real page file.
  const file = "desktop/renderer/index.html";
  const viaGit = execFileSync("git", ["hash-object", "--no-filters", file], { encoding: "utf8" }).trim();
  assert.equal(gitBlobSha(fs.readFileSync(file)), viaGit);
});

test("versions compare the way releases are numbered", () => {
  assert.equal(isNewerVersion("v3.10.0", "3.9.9"), true);
  assert.equal(isNewerVersion("3.5.0", "3.5.0"), false);
  assert.equal(isNewerVersion("3.4.1", "3.5.0"), false);
});

test("an update plan copies unchanged code, downloads only what changed, and never touches voice clips", () => {
  const base = { files: { "app.js": "a1", "js/x.js": "x1", "assets/p.png": "p1", "assets/q.png": "q1", "old.js": "o1", "assets/audio/c.ogg": "c1" } };
  const tree = {
    "app.js": { sha: "a1", size: 10 }, "js/x.js": { sha: "x2", size: 20 }, "assets/p.png": { sha: "p1", size: 999 },
    "assets/q.png": { sha: "q2", size: 500 }, "js/new.js": { sha: "n1", size: 5 }, "assets/audio/c.ogg": { sha: "c2", size: 70 },
  };
  const plan = planUpdate({ base, tree });
  const by = Object.fromEntries(plan.files.map((f) => [f.rel, f.from]));
  assert.deepEqual(by, { "app.js": "bundle", "js/x.js": "download", "assets/q.png": "download", "js/new.js": "download" });
  assert.equal(plan.downloadBytes, 525);
  assert.deepEqual(plan.deleted, ["old.js"]);
  assert.equal(plan.changed, 4);
  // A file already fetched for the live pages in use is reused.
  assert.equal(planUpdate({ base, tree, active: { files: { "js/x.js": "x2" } } }).files.find((f) => f.rel === "js/x.js").from, "active");
});

/* ── A whole update, start to finish ─────────────────────────────── */
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vm-live-"));
  const rendererDir = path.join(root, "renderer");
  const liveRoot = path.join(root, "userData", "live");
  const write = (rel, text) => { const f = path.join(rendererDir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
  const installed = { "index.html": "<h1>v1</h1>", "app.js": "export const v = 1;", "js/x.js": "x1", "assets/p.png": "PNG", "gone.js": "bye" };
  for (const [rel, text] of Object.entries(installed)) write(rel, text);
  const files = Object.fromEntries(Object.entries(installed).map(([rel, text]) => [rel, gitBlobSha(Buffer.from(text))]));
  write("live-base.json", JSON.stringify({ commit: "1".repeat(40), date: "2026-10-20T10:00:00Z", files }));
  return { root, rendererDir, liveRoot };
}
/** A fake GitHub serving one commit of the pages. */
function fakeGitHub(sha, pages, { message = "New words panel", tamper = "" } = {}) {
  const calls = [];
  return {
    calls,
    io: {
      async fetchJson(url) {
        calls.push(url);
        if (url.endsWith("/commits/main")) return { sha, commit: { message: `${message}\n\nDetails`, committer: { date: "2026-10-21T09:00:00Z" } } };
        if (url.includes(`/git/trees/${sha}`)) return { truncated: false, tree: Object.entries(pages).map(([rel, text]) => ({ type: "blob", path: `desktop/renderer/${rel}`, sha: gitBlobSha(Buffer.from(text)), size: text.length })) };
        throw new Error(`unexpected ${url}`);
      },
      async fetchBuffer(url) {
        calls.push(url);
        const rel = decodeURIComponent(url.split(`${sha}/desktop/renderer/`)[1]);
        return Buffer.from(rel === tamper ? "tampered" : pages[rel]);
      },
    },
  };
}

test("an update is fetched, checked, used from the next start, and the installed pages fill the gaps", async () => {
  const { rendererDir, liveRoot } = setup();
  const sha = "2".repeat(40);
  const pages = { "index.html": "<h1>v2</h1>", "app.js": "export const v = 1;", "js/x.js": "x1", "js/new.js": "new", "assets/p.png": "PNG" };
  const gh = fakeGitHub(sha, pages);
  const first = createLiveUpdater({ rendererDir, liveRoot, io: gh.io });
  assert.equal(first.startup(), null, "nothing live yet");
  const info = await first.check();
  assert.equal(info.state, "ready");
  assert.equal(info.pending.message, "New words panel");
  assert.deepEqual(gh.calls.filter((u) => u.includes("raw.githubusercontent")).map((u) => u.split("/desktop/renderer/")[1]).sort(), ["index.html", "js/new.js"], "only the changed files are downloaded");
  assert.equal(first.resolve("index.html"), path.join(rendererDir, "index.html"), "this run keeps its pages");

  const next = createLiveUpdater({ rendererDir, liveRoot, io: gh.io });
  const active = next.startup();
  assert.equal(active.sha, sha);
  assert.equal(fs.readFileSync(next.resolve("index.html"), "utf8"), "<h1>v2</h1>");
  assert.equal(fs.readFileSync(next.resolve("js/new.js"), "utf8"), "new");
  assert.equal(fs.readFileSync(next.resolve("app.js"), "utf8"), "export const v = 1;", "unchanged code is in the live copy too (for the Word engine)");
  assert.equal(next.resolve("assets/p.png"), path.join(rendererDir, "assets", "p.png"), "unchanged pictures come from the installed app");
  assert.equal(next.resolve("gone.js"), null, "a file deleted on GitHub is gone");
  assert.equal(next.resolve("../../secret.txt"), null, "nothing outside the live folder");
  assert.deepEqual(next.alive(), { sha, message: "New words panel", date: "2026-10-21T09:00:00Z" }, "the 'updated' note, once");
  assert.equal(next.alive(), null);
  assert.equal((await next.check()).state, "current", "nothing newer");
});

test("pages that never start are set aside for good; a new exe clears old pages", async () => {
  const { rendererDir, liveRoot } = setup();
  const sha = "3".repeat(40);
  const gh = fakeGitHub(sha, { "index.html": "<h1>broken</h1>", "app.js": "x" });
  const a = createLiveUpdater({ rendererDir, liveRoot, io: gh.io });
  a.startup();
  await a.check();
  // Two starts without "alive", the third goes back to the installed pages.
  assert.equal(createLiveUpdater({ rendererDir, liveRoot, io: gh.io }).startup()?.sha, sha);
  assert.equal(createLiveUpdater({ rendererDir, liveRoot, io: gh.io }).startup()?.sha, sha);
  const c = createLiveUpdater({ rendererDir, liveRoot, io: gh.io });
  assert.equal(c.startup(), null);
  assert.equal((await c.check()).state, "current", "the broken commit is not fetched again");

  // The watchdog's quick way back: revert() during a run.
  const sha2 = "4".repeat(40);
  const gh2 = fakeGitHub(sha2, { "index.html": "<h1>v4</h1>", "app.js": "x" });
  const d = createLiveUpdater({ rendererDir, liveRoot, io: gh2.io });
  d.startup(); await d.check();
  const e = createLiveUpdater({ rendererDir, liveRoot, io: gh2.io });
  assert.equal(e.startup()?.sha, sha2);
  e.revert("did not start");
  assert.equal(createLiveUpdater({ rendererDir, liveRoot, io: gh2.io }).startup(), null);

  // A newer exe (another base commit) drops the live pages.
  const sha3 = "5".repeat(40);
  const gh3 = fakeGitHub(sha3, { "index.html": "<h1>v5</h1>", "app.js": "x" });
  const f = createLiveUpdater({ rendererDir, liveRoot, io: gh3.io });
  f.startup(); await f.check();
  const baseFile = path.join(rendererDir, "live-base.json");
  fs.writeFileSync(baseFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(baseFile, "utf8")), commit: "9".repeat(40) }));
  assert.equal(createLiveUpdater({ rendererDir, liveRoot, io: gh3.io }).startup(), null);
});

test("a tampered download, or pages needing a newer app, are not used", async () => {
  const { rendererDir, liveRoot } = setup();
  const sha = "6".repeat(40);
  const bad = fakeGitHub(sha, { "index.html": "<h1>v6</h1>", "app.js": "x" }, { tamper: "index.html" });
  const a = createLiveUpdater({ rendererDir, liveRoot, io: bad.io });
  a.startup();
  const info = await a.check();
  assert.equal(info.state, "error");
  assert.match(info.message, /didn't match/);
  assert.equal(createLiveUpdater({ rendererDir, liveRoot, io: bad.io }).startup(), null);

  const sha2 = "7".repeat(40);
  const newer = fakeGitHub(sha2, { "index.html": "<h1>v7</h1>", "app.js": "x", "live-requires.json": JSON.stringify({ shell: SHELL_API + 1 }) });
  const b = createLiveUpdater({ rendererDir, liveRoot, io: newer.io });
  b.startup();
  assert.equal((await b.check()).state, "needs-app");
  assert.equal(createLiveUpdater({ rendererDir, liveRoot, io: newer.io }).startup(), null);

  // Turned off: only a manual check looks.
  const c = createLiveUpdater({ rendererDir, liveRoot, io: newer.io });
  c.setAuto(false);
  assert.equal((await c.check()).state, "idle");
  assert.equal(newer.calls.filter((u) => u.endsWith("/commits/main")).length, 1);
});

test("the repository says which app shell the pages need", () => {
  const req = JSON.parse(fs.readFileSync("desktop/renderer/live-requires.json", "utf8"));
  assert.equal(req.shell, SHELL_API, "desktop/renderer/live-requires.json must match SHELL_API in live-update.js");
});
