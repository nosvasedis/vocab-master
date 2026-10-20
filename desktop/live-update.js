/* Vocab Master — live updates of the app's pages from GitHub (no new exe needed).
 *
 * The installed app carries renderer/live-base.json: the Git fingerprints (blob SHA-1) of every file it was built
 * from (scripts/live-base.cjs, run before each build). In the background the app asks GitHub for the newest commit
 * on main and its file list, and builds a "live" copy of the pages in userData/live/<commit>/:
 *   - every code file (js, css, html, json…) — copied from the installed app when unchanged, downloaded when not;
 *   - pictures and other assets only when they changed (the rest are served from the installed app);
 *   - voice clips never (they aren't in Git; assets/audio/ always comes from the installed app).
 * Every download is checked against its Git fingerprint. The new copy is used from the next start (or at once when
 * the teacher presses Restart). A copy that fails to start is set aside and never tried again; a newer exe clears
 * old copies; a commit that needs a newer app shell (renderer/live-requires.json "shell") waits for a new exe.
 *
 * Pure helpers (gitBlobSha, planUpdate, isNewerVersion) are exported for the tests. */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** Raise when main.js / preload.cjs change in a way older pages can't use, and set renderer/live-requires.json to match. */
export const SHELL_API = 1;
export const REPO = "nosvasedis/vocab-master";
export const BRANCH = "main";
const PREFIX = "desktop/renderer/";
/** Never live-updated: voice clips are not in Git; the installed app's copies are always used. */
const EXCLUDE = ["assets/audio/", "live-base.json"];
/** Files the installed app serves itself when unchanged (large); everything else is copied into the live folder. */
const isBulky = (rel) => rel.startsWith("assets/") || rel.startsWith("vendor/");
const excluded = (rel) => EXCLUDE.some((p) => rel === p || rel.startsWith(p));
/** A live update that would download more than this waits for a new exe instead. */
export const MAX_DOWNLOAD = 150 * 1024 * 1024;

/** Git's blob fingerprint of a file's bytes. */
export function gitBlobSha(buf) {
  return crypto.createHash("sha1").update(`blob ${buf.length}\0`).update(buf).digest("hex");
}

/** "3.10.0" > "3.9.2"; a leading "v" is fine. */
export function isNewerVersion(a, b) {
  const p = (v) => String(v || "").replace(/^v/i, "").split(/[.-]/).map((x) => Number(x) || 0);
  const [x, y] = [p(a), p(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}

/**
 * What a live folder for `tree` needs.
 * base: { files: { rel: sha } } — the installed app; tree: { rel: { sha, size } } — the commit;
 * active: { files: { rel: sha } } | null — the live folder in use now (its files can be reused).
 * Returns { files: [{ rel, sha, size, from: "bundle" | "active" | "download" }], deleted: [rel], downloadBytes, changed }.
 */
export function planUpdate({ base, tree, active = null }) {
  const files = [];
  let downloadBytes = 0;
  let changed = 0;
  for (const [rel, t] of Object.entries(tree)) {
    if (excluded(rel)) continue;
    const same = base.files?.[rel] === t.sha;
    if (!same) changed++;
    if (same && isBulky(rel)) continue; // the installed app serves it
    const from = same ? "bundle" : active?.files?.[rel] === t.sha ? "active" : "download";
    if (from === "download") downloadBytes += t.size || 0;
    files.push({ rel, sha: t.sha, size: t.size || 0, from });
  }
  const deleted = Object.keys(base.files || {}).filter((rel) => !tree[rel] && !excluded(rel));
  return { files, deleted, downloadBytes, changed: changed + deleted.length };
}

/**
 * The updater. io: { fetchJson(url), fetchBuffer(url) } (HTTPS GET), log(…).
 * rendererDir: the installed pages; liveRoot: userData/live.
 */
export function createLiveUpdater({ rendererDir, liveRoot, io, log = () => {}, repo = REPO, branch = BRANCH, enabled = true }) {
  const stateFile = path.join(liveRoot, "state.json");
  const read = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } };
  const base = read(path.join(rendererDir, "live-base.json"), null);
  let state = { auto: true, bad: [], ...read(stateFile, {}) };
  let status = { state: "idle", message: "" };
  let busy = false;
  let active = null; // { sha, dir, deleted: Set, message, date } — fixed for this run of the app
  const listeners = new Set();
  const save = () => { try { fs.mkdirSync(liveRoot, { recursive: true }); fs.writeFileSync(`${stateFile}.tmp`, JSON.stringify(state, null, 2)); fs.renameSync(`${stateFile}.tmp`, stateFile); } catch (e) { log("live: state not saved", e.message); } };
  const set = (next) => { if (next.state && next.state !== status.state) log(`live: ${next.state}${next.message ? ` — ${next.message}` : ""}`); status = { ...status, ...next }; listeners.forEach((fn) => fn(info())); };
  const manifestOf = (dir) => read(path.join(dir, "manifest.json"), null);
  const usable = (entry) => entry?.dir && fs.existsSync(path.join(entry.dir, "manifest.json")) && entry.base === base?.commit;

  /** Called once before the window opens: settles which pages this run uses. */
  function startup() {
    if (!enabled || !base?.commit) return null;
    // A newer (or older) exe was installed: live folders made for the old one don't apply.
    if (state.active && state.active.base !== base.commit) { log("live: new exe, clearing live pages"); state = { auto: state.auto, bad: [] }; }
    // The pages in use never reported back twice in a row: set them aside.
    if (state.trial && (state.trial.starts || 0) >= 2) revert("did not start twice");
    // Pages fetched last time are used from this start.
    if (state.pending && usable(state.pending)) {
      state.fallback = state.active || null;
      state.active = state.pending;
      state.justUpdated = { sha: state.pending.sha, message: state.pending.message || "", date: state.pending.date || "" };
      state.trial = { sha: state.active.sha, starts: 0 };
    }
    state.pending = null;
    if (state.active && !usable(state.active)) state.active = null;
    if (state.trial && state.trial.sha === state.active?.sha) state.trial.starts = (state.trial.starts || 0) + 1;
    else state.trial = null;
    save();
    cleanup();
    if (!state.active) return null;
    const m = manifestOf(state.active.dir);
    active = { ...state.active, deleted: new Set(m?.deleted || []) };
    return active;
  }

  /** The live pages fail to start: back to the last good pages (or the installed ones), and never this commit again. */
  function revert(reason = "") {
    const bad = state.active?.sha || state.trial?.sha;
    if (bad && !state.bad.includes(bad)) state.bad = [...state.bad, bad].slice(-20);
    log("live: reverting", bad, reason);
    state.active = state.fallback && usable(state.fallback) && state.fallback.sha !== bad ? state.fallback : null;
    state.fallback = null;
    state.trial = null;
    save();
  }

  /** The pages started fine: keep them. Returns the "just updated" note once (for the "Updated" toast). */
  function alive() {
    if (state.trial) { state.trial = null; }
    const note = state.justUpdated || null;
    state.justUpdated = null;
    save();
    return note;
  }

  /** Remove live folders that are neither in use, waiting, nor the fallback. */
  function cleanup() {
    try {
      const keep = new Set([state.active?.dir, state.pending?.dir, state.fallback?.dir].filter(Boolean).map((d) => path.basename(d)));
      for (const name of fs.readdirSync(liveRoot)) {
        if (name === "state.json" || name.endsWith(".tmp") || keep.has(name)) continue;
        fs.rmSync(path.join(liveRoot, name), { recursive: true, force: true });
      }
    } catch { /* nothing to clean */ }
  }

  async function pool(items, n, fn) {
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
  }

  /** Look for newer pages on GitHub and get them ready for the next start. */
  async function check({ manual = false } = {}) {
    if (!enabled || !base?.commit) { set({ state: "off", message: "Live updates are on in the installed app." }); return info(); }
    if (busy) return info();
    if (!manual && !state.auto) return info();
    busy = true;
    try {
      set({ state: "checking", message: "Looking for updates…" });
      const head = await io.fetchJson(`https://api.github.com/repos/${repo}/commits/${branch}`);
      const sha = head?.sha;
      if (!/^[0-9a-f]{40}$/.test(sha || "")) throw new Error("GitHub didn't answer as expected.");
      state.lastCheck = new Date().toISOString();
      const current = state.pending?.sha || active?.sha || base.commit;
      if (sha === current || state.bad.includes(sha)) { save(); set({ state: state.pending ? "ready" : "current", message: "" }); return info(); }

      const treeRes = await io.fetchJson(`https://api.github.com/repos/${repo}/git/trees/${sha}?recursive=1`);
      if (!Array.isArray(treeRes?.tree) || treeRes.truncated) throw new Error("GitHub's file list was incomplete.");
      const tree = {};
      for (const e of treeRes.tree) if (e.type === "blob" && e.path.startsWith(PREFIX)) tree[e.path.slice(PREFIX.length)] = { sha: e.sha, size: e.size || 0 };
      if (!tree["index.html"] || !tree["app.js"]) throw new Error("That version has no app pages.");
      const raw = (rel) => `https://raw.githubusercontent.com/${repo}/${sha}/${PREFIX}${rel.split("/").map(encodeURIComponent).join("/")}`;

      // Pages that need a newer app shell wait for a new exe.
      if (tree["live-requires.json"]) {
        const req = JSON.parse((await io.fetchBuffer(raw("live-requires.json"))).toString("utf8"));
        if ((Number(req.shell) || 1) > SHELL_API) { save(); set({ state: "needs-app", message: "A new version of the app is needed for the latest update." }); return info(); }
      }
      const activeManifest = active ? manifestOf(active.dir) : null;
      const plan = planUpdate({ base, tree, active: activeManifest });
      if (plan.downloadBytes > MAX_DOWNLOAD) { save(); set({ state: "needs-app", message: "This update is large: it comes with the next version of the app." }); return info(); }

      const dir = path.join(liveRoot, sha.slice(0, 12));
      const tmp = `${dir}.tmp`;
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.mkdirSync(tmp, { recursive: true });
      let done = 0;
      const total = plan.files.length;
      set({ state: "downloading", message: `Getting the update… (${plan.changed} changed files)`, progress: 0 });
      await pool(plan.files, 6, async (f) => {
        const out = path.join(tmp, ...f.rel.split("/"));
        fs.mkdirSync(path.dirname(out), { recursive: true });
        let ok = false;
        if (f.from === "bundle") {
          try { fs.writeFileSync(out, fs.readFileSync(path.join(rendererDir, ...f.rel.split("/")))); ok = true; } catch { /* left out of the exe: download it */ }
        } else if (f.from === "active") {
          try { fs.writeFileSync(out, fs.readFileSync(path.join(active.dir, ...f.rel.split("/")))); ok = true; } catch { /* download it */ }
        }
        if (!ok) {
          const buf = await io.fetchBuffer(raw(f.rel));
          if (gitBlobSha(buf) !== f.sha) throw new Error(`A downloaded file didn't match (${f.rel}).`);
          fs.writeFileSync(out, buf);
        }
        done++;
        if (done % 25 === 0 || done === total) set({ progress: Math.round((done / total) * 100) });
      });
      const message = String(head.commit?.message || "").split("\n")[0].slice(0, 160);
      const date = head.commit?.committer?.date || head.commit?.author?.date || "";
      const files = Object.fromEntries(Object.entries(tree).map(([rel, t]) => [rel, t.sha]));
      fs.writeFileSync(path.join(tmp, "manifest.json"), JSON.stringify({ sha, base: base.commit, files, deleted: plan.deleted, message, date, at: new Date().toISOString() }));
      fs.rmSync(dir, { recursive: true, force: true });
      fs.renameSync(tmp, dir);
      state.pending = { sha, dir, base: base.commit, message, date };
      save();
      cleanup();
      set({ state: "ready", message: "An update is ready.", progress: 100 });
    } catch (e) {
      log("live: check failed", e.message);
      set({ state: "error", message: /ENOTFOUND|EAI_AGAIN|ECONN|ETIMEDOUT|timed out/i.test(e.message) ? "No internet connection — the app will try again later." : e.message });
    } finally { busy = false; }
    return info();
  }

  /** Which file to serve for a request path ("js/main.js"): the live copy, the installed one, or none (deleted). */
  function resolve(rel) {
    if (!active) return path.join(rendererDir, rel);
    const norm = rel.replace(/\\/g, "/");
    if (active.deleted.has(norm)) return null;
    const live = path.resolve(active.dir, rel);
    if (!live.startsWith(path.resolve(active.dir) + path.sep)) return null;
    return fs.existsSync(live) && fs.statSync(live).isFile() ? live : path.join(rendererDir, rel);
  }

  function info() {
    return {
      ...status,
      enabled: !!(enabled && base?.commit),
      auto: state.auto !== false,
      build: base?.commit ? { sha: base.commit.slice(0, 7), date: base.date || "" } : null,
      live: active ? { sha: active.sha.slice(0, 7), message: active.message || "", date: active.date || "" } : null,
      pending: state.pending ? { sha: state.pending.sha.slice(0, 7), message: state.pending.message || "", date: state.pending.date || "" } : null,
      lastCheck: state.lastCheck || "",
    };
  }

  return {
    startup, check, revert, alive, resolve, info,
    get active() { return active; },
    setAuto(on) { state.auto = !!on; save(); set({}); return info(); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
