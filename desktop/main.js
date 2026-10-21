/* Vocab Master — Electron main process.
 * Replaces the old proxy.js (static server + CORS proxy + DOCX endpoint)
 * with a native desktop shell:
 *   - custom `app://` protocol serves the renderer (no CORS, ES modules OK)
 *   - IPC "deepseek:chat" proxies to api.deepseek.com (no localhost proxy)
 *   - IPC "docx:export" builds .docx using the shared engine (app.js)
 *   - IPC "pdf:export" renders the worksheet to PDF via printToPDF
 *   - file-based storage: settings/saves/history in userData JSON files
 *   - keychain: DeepSeek API key encrypted with safeStorage when available
 */
import { app, BrowserWindow, ipcMain, dialog, shell, session, protocol, Menu, safeStorage, screen, nativeTheme } from "electron";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createChatGPT, CHATGPT_USAGE_URL, chatgptError } from "./chatgpt.js";
import { createGoogleLoopback } from "./google-signin.js";
import { createLiveUpdater, SHELL_API, REPO, BRANCH } from "./live-update.js";
import { createExeUpdater } from "./exe-update.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RENDERER_DIR = path.join(__dirname, "renderer");
const APP_SCHEME = "app";
const DEEPSEEK_HOST = "api.deepseek.com";
const GEMINI_HOST = "generativelanguage.googleapis.com";
const MAX_REQUEST_MS = 240_000;

const APP_NAME = "Vocab Master";
app.setName(APP_NAME);
if (process.platform === "win32") app.setAppUserModelId("com.vocabmaster.desktop");

// Reuse the old data folder after the rebrand so saved worksheets and the encrypted key remain available.
const currentUserDataPath = app.getPath("userData");
function hasPersistedUserData(directory) {
  return ["store.json", "keychain.bin"].some((name) => fs.existsSync(path.join(directory, name)));
}
if (!hasPersistedUserData(currentUserDataPath)) {
  const legacyDataPath = ["Lingo Launcher", "lingo-launcher-desktop"]
    .map((name) => path.join(app.getPath("appData"), name))
    .find(hasPersistedUserData);
  if (legacyDataPath) app.setPath("userData", legacyDataPath);
}

// Must be called before app is ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

// Testing (also the installed app): run against a separate data folder (e.g. to try live updates without touching real data).
if (process.env.VM_USER_DATA) app.setPath("userData", process.env.VM_USER_DATA);

// The smoke test must never touch the teacher's real History / settings / API key.
if (process.argv.includes("--smoke")) {
  const smokeDir = path.join(app.getPath("temp"), "lingo-launcher-smoke");
  fs.rmSync(smokeDir, { recursive: true, force: true });
  app.setPath("userData", smokeDir);
}

let mainWindow = null;
let enginePromise = null;
let chatgpt = null;

/* ── Updates: live pages from GitHub (live-update.js) and the exe itself (exe-update.js) ── */
const SMOKE = process.argv.includes("--smoke");
/** HTTPS GET with redirects; GitHub's API wants a User-Agent. */
function httpsGet(url, { json = false, redirects = 4, timeout = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "VocabMaster-Updater", ...(json ? { Accept: "application/vnd.github+json" } : {}) }, timeout }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
        res.resume();
        resolve(httpsGet(new URL(res.headers.location, url).href, { json, redirects: redirects - 1, timeout }));
        return;
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        if (res.statusCode !== 200) { reject(new Error(res.statusCode === 403 || res.statusCode === 429 ? "GitHub is busy — the app will try again later." : `HTTP ${res.statusCode}`)); return; }
        try { resolve(json ? JSON.parse(buf.toString("utf8")) : buf); } catch (e) { reject(e); }
      });
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("the request timed out")));
    req.on("error", reject);
  });
}
const updateIo = { fetchJson: (url) => httpsGet(url, { json: true }), fetchBuffer: (url) => httpsGet(url) };
// The installed app updates itself; a development copy only when asked (VM_LIVE=1, e.g. to test with VM_LIVE_BRANCH).
const live = createLiveUpdater({
  rendererDir: RENDERER_DIR,
  liveRoot: path.join(app.getPath("userData"), "live"),
  io: updateIo,
  log: (...a) => console.log(...a),
  repo: process.env.VM_LIVE_REPO || REPO,
  branch: process.env.VM_LIVE_BRANCH || BRANCH,
  enabled: !SMOKE && (app.isPackaged || process.env.VM_LIVE === "1"),
});
const exe = createExeUpdater({ app, io: updateIo, log: (...a) => console.log(...a) });
const updatesInfo = () => ({ version: app.getVersion(), shell: SHELL_API, ...live.info(), exe: exe.status });
function sendUpdates() { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("updates:changed", updatesInfo()); }
live.onChange(sendUpdates);
exe.onChange(sendUpdates);
let updateTimer = null;
function scheduleUpdateChecks() {
  if (SMOKE || updateTimer) return;
  const run = () => { live.check().catch(() => {}); exe.check().catch(() => {}); };
  setTimeout(run, 20_000);
  updateTimer = setInterval(run, 3 * 60 * 60 * 1000);
}
/**
 * Start the app again. The portable exe runs from a temporary copy that is deleted when it quits, so it is
 * started from the portable file itself; "--relaunch" lets the new copy wait for this one to let go of the
 * single-instance lock instead of quitting.
 */
function relaunchApp() {
  const portable = process.env.PORTABLE_EXECUTABLE_FILE;
  const args = [...process.argv.slice(1).filter((a) => a !== "--relaunch" && !a.startsWith("--smoke")), "--relaunch"];
  app.relaunch(portable ? { execPath: portable, args: ["--relaunch"] } : { args });
  app.exit(0);
}

/** Reload the window onto the pages now in use (after an update is applied, or a broken one set aside). */
function reloadPages() {
  enginePromise = null; // the Word engine follows the pages
  clearTimeout(aliveTimer);
  aliveTimer = null;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reloadIgnoringCache();
}

/** The live pages must say "I started" soon after loading; otherwise they are set aside and the window reloads. */
let aliveTimer = null;
function relaunchWithoutLive(reason) {
  if (!live.active) return;
  live.revert(reason);
  reloadPages();
}

function chatgptRuntime() {
  if (chatgpt) return chatgpt;
  const file = dataFile("chatgpt-accounts.bin");
  const requireEncryption = () => {
    if (!safeStorage.isEncryptionAvailable() || (safeStorage.getSelectedStorageBackend?.() === "basic_text")) throw new Error("Secure credential storage is unavailable. ChatGPT sign-in needs Windows credential encryption.");
  };
  chatgpt = createChatGPT({
    readState() {
      if (!fs.existsSync(file)) return null;
      requireEncryption();
      return JSON.parse(safeStorage.decryptString(fs.readFileSync(file)));
    },
    writeState(value) {
      requireEncryption();
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, safeStorage.encryptString(JSON.stringify(value)), { mode: 0o600 });
      fs.renameSync(tmp, file);
    },
  });
  return chatgpt;
}

/* ── Storage (userData JSON files — replaces localStorage) ────────────────── */

function dataFile(name) {
  return path.join(app.getPath("userData"), name);
}

function readJsonFile(name, fallback) {
  const file = dataFile(name);
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    // Unreadable (corrupted) — keep a copy so saved worksheets are never silently overwritten.
    try { fs.copyFileSync(file, `${file}.corrupt-${Date.now()}`); } catch { /* ignore */ }
    console.error("storage read failed", name, err);
    return fallback;
  }
}

function writeJsonFile(name, value) {
  try {
    // Write-then-rename so a crash mid-write can never leave a truncated file behind.
    const target = dataFile(name);
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
    fs.renameSync(tmp, target);
  } catch (err) {
    console.error("storage write failed", name, err);
  }
}

const STORE = {
  getAll() {
    return readJsonFile("store.json", {});
  },
  set(key, value) {
    const all = this.getAll();
    all[key] = value;
    writeJsonFile("store.json", all);
  },
  remove(key) {
    const all = this.getAll();
    delete all[key];
    writeJsonFile("store.json", all);
  },
};

// One encrypted file per AI provider (DeepSeek keeps the original file name).
const KEYCHAIN_FILES = { deepseek: "keychain.bin", gemini: "keychain-gemini.bin" };
// Per-profile slots ("p-<uid>-deepseek") hold another teacher's keys while they're switched out (js/sync/profiles.js).
const PROFILE_KEYCHAIN = /^p-[A-Za-z0-9]{1,128}-(deepseek|gemini)$/;
const KEYCHAIN_FILE = (name = "deepseek") => dataFile(PROFILE_KEYCHAIN.test(String(name)) ? `keychain-${name}.bin` : KEYCHAIN_FILES[name] || KEYCHAIN_FILES.deepseek);

function keychainGet(name) {
  try {
    if (!fs.existsSync(KEYCHAIN_FILE(name))) return null;
    const buf = fs.readFileSync(KEYCHAIN_FILE(name));
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(buf);
    }
    return buf.toString("utf8");
  } catch (err) {
    console.error("keychain get failed", err);
    return null;
  }
}

function keychainSet(value, name) {
  try {
    if (!value) {
      if (fs.existsSync(KEYCHAIN_FILE(name))) fs.unlinkSync(KEYCHAIN_FILE(name));
      return;
    }
    const data = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(value)
      : Buffer.from(value, "utf8");
    fs.writeFileSync(KEYCHAIN_FILE(name), data);
  } catch (err) {
    console.error("keychain set failed", err);
  }
}

/* ── Shared engine (app.js — reused unchanged for DOCX building) ──────────── */

function loadEngine() {
  if (!enginePromise) {
    // The same pages the window uses: the live copy when there is one.
    const liveApp = live.active ? path.join(live.active.dir, "app.js") : "";
    // Node reads app.js as an ES module only under a package.json with "type": "module" (renderer/package.json);
    // a live copy made before that file existed gets one, or every Word export fails with "Cannot use import statement".
    if (liveApp && fs.existsSync(liveApp)) {
      const pkg = path.join(live.active.dir, "package.json");
      if (!fs.existsSync(pkg)) try { fs.writeFileSync(pkg, '{ "type": "module" }\n'); } catch { /* the import below reports it */ }
    }
    const engineUrl = pathToFileURL(liveApp && fs.existsSync(liveApp) ? liveApp : path.join(RENDERER_DIR, "app.js")).href;
    enginePromise = import(engineUrl).catch((err) => {
      enginePromise = null;
      throw err;
    });
  }
  return enginePromise;
}

/* ── DeepSeek proxy (replaces proxyDeepSeek in proxy.js) ──────────────────── */

function proxyDeepSeek(body, authHeader) {
  return deepSeekRequest("POST", "/chat/completions", authHeader, body || "{}", MAX_REQUEST_MS);
}

function deepSeekRequest(method, apiPath, authHeader, body, timeoutMs) {
  return apiRequest(DEEPSEEK_HOST, method, apiPath, authHeader ? { Authorization: authHeader } : {}, body, timeoutMs);
}

/** Google Gemini — only the model list, generateContent and interactions (studio voices) are reachable through this bridge. */
function geminiRequest(method, apiPath, apiKey, body) {
  if (!/^\/v1beta\/(models(\/[\w.-]+:generateContent)?|interactions)$/.test(apiPath)) {
    return Promise.resolve({ status: 400, body: JSON.stringify({ error: { message: "Unsupported Gemini path" } }) });
  }
  return apiRequest(GEMINI_HOST, method, apiPath, { "x-goog-api-key": String(apiKey || "").trim() }, body, MAX_REQUEST_MS);
}

function apiRequest(hostname, method, apiPath, authHeaders, body, timeoutMs) {
  return new Promise((resolve) => {
    const payload = body ? Buffer.from(body, "utf8") : null;
    const req = https.request(
      {
        hostname,
        path: apiPath,
        method,
        headers: {
          Accept: "application/json",
          ...(payload ? { "Content-Type": "application/json", "Content-Length": payload.length } : {}),
          ...authHeaders,
        },
        timeout: timeoutMs,
      },
      (res) => {
        // Collect raw bytes: decoding chunk-by-chunk would corrupt Greek characters
        // whose UTF-8 bytes happen to straddle two chunks.
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") });
        });
        res.on("error", (err) => resolve({ status: 502, body: JSON.stringify({ error: err.message }) }));
      }
    );
    req.on("timeout", () => req.destroy(new Error("the request timed out")));
    req.on("error", (err) => {
      resolve({ status: 502, body: JSON.stringify({ error: err.message }) });
    });
    if (payload) req.write(payload);
    req.end();
  });
}

/* ── Custom protocol: serve the renderer over app:// (no CORS, ES modules) ── */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".wasm": "application/wasm",
  ".zip": "application/zip",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function registerAppProtocol() {
  protocol.handle(APP_SCHEME, async (request) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    if (pathname === "/" || pathname === "") pathname = "/index.html";
    const rel = pathname.replace(/^[/\\]+/, "");
    const bundled = path.resolve(RENDERER_DIR, rel);
    if (!bundled.startsWith(RENDERER_DIR + path.sep)) {
      return new Response("Forbidden", { status: 403 });
    }
    // The live copy of a page when there is one (live-update.js), else the installed one.
    const filePath = live.resolve(path.relative(RENDERER_DIR, bundled));
    if (!filePath) return new Response("Not found", { status: 404 });
    try {
      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile()) return new Response("Not found", { status: 404 });
      const data = await fs.promises.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      return new Response(data, {
        headers: {
          "content-type": MIME[ext] || "application/octet-stream",
          // Cross-origin isolation lets the natural-voice engine (Kokoro, WebAssembly) use several threads.
          // "credentialless" still loads pictures and clips from R2 (without cookies); the app opens no popups.
          "cross-origin-opener-policy": "same-origin",
          "cross-origin-embedder-policy": "credentialless",
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

/* ── Window ───────────────────────────────────────────────────────────────── */

/** Saved bounds, or null if they'd put the window off every connected screen. */
function loadSavedBounds() {
  const b = readJsonFile("window.json", null);
  if (!b || !Number.isFinite(b.width) || !Number.isFinite(b.height)) return null;
  if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) return { width: b.width, height: b.height, maximized: !!b.maximized };
  const visible = screen.getAllDisplays().some(({ workArea: a }) =>
    b.x + 80 < a.x + a.width && b.x + b.width - 80 > a.x && b.y >= a.y - 10 && b.y + 40 < a.y + a.height);
  return visible ? b : { width: b.width, height: b.height, maximized: !!b.maximized };
}

let saveBoundsTimer = null;
function saveBounds() {
  clearTimeout(saveBoundsTimer);
  saveBoundsTimer = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return;
    const maximized = mainWindow.isMaximized();
    // Keep the normal (restored) size so un-maximizing next launch still looks right.
    const bounds = maximized ? mainWindow.getNormalBounds() : mainWindow.getBounds();
    writeJsonFile("window.json", { ...bounds, maximized });
  }, 400);
}

function createWindow() {
  const saved = loadSavedBounds();
  mainWindow = new BrowserWindow({
    width: saved?.width || 1280,
    height: saved?.height || 860,
    ...(Number.isFinite(saved?.x) ? { x: saved.x, y: saved.y } : {}),
    minWidth: 980,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0a0b12" : "#f4f5fa",
    title: "Vocab Master",
    icon: path.join(RENDERER_DIR, "assets", "vocab-master-mark.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.loadURL(`${APP_SCHEME}://bundle/index.html`);

  mainWindow.once("ready-to-show", () => {
    if (saved?.maximized) mainWindow.maximize();
    mainWindow.show();
    scheduleUpdateChecks();
  });
  // Live pages are watched every time they load (also after an in-place update): no "I started" in 45 s,
  // a failed load or a crash sets them aside and the window reloads onto the last good pages.
  mainWindow.webContents.on("did-finish-load", () => {
    clearTimeout(aliveTimer);
    aliveTimer = live.active ? setTimeout(() => relaunchWithoutLive("the pages did not start"), 45_000) : null;
  });
  mainWindow.webContents.on("did-fail-load", (_e, code, _desc, url, isMainFrame) => { if (isMainFrame && code !== -3 && live.active) relaunchWithoutLive(`load failed ${code} ${url}`); });
  mainWindow.webContents.on("render-process-gone", (_e, d) => { if (d?.reason !== "clean-exit" && live.active) { relaunchWithoutLive(`renderer ${d?.reason}`); } });

  mainWindow.on("resize", saveBounds);
  mainWindow.on("move", saveBounds);
  mainWindow.on("maximize", saveBounds);
  mainWindow.on("unmaximize", saveBounds);

  // The app never navigates away from its own page (e.g. a dropped file or stray link).
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`${APP_SCHEME}://`)) event.preventDefault();
  });
  mainWindow.on("closed", () => { mainWindow = null; });
  mainWindow.on("unresponsive", () => { /* keep app alive during long AI calls */ });

  // Open external links in the system browser, never inside the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.argv.includes("--smoke")) {
    mainWindow.webContents.once("did-finish-load", () => runSmokeTest());
  }
  // Development self-test of live updates: report what this window runs, look for an update, exit.
  if (!app.isPackaged && process.env.VM_LIVE_SELFTEST) {
    mainWindow.webContents.once("did-finish-load", async () => {
      await new Promise((r) => setTimeout(r, 6000));
      const page = await mainWindow.webContents.executeJavaScript("({ title: document.title, booted: !!window.__VM__, updatesApi: !!window.desktop?.updates })");
      const before = updatesInfo();
      const after = await live.check({ manual: true });
      console.log("LIVE_SELFTEST " + JSON.stringify({ page, aliveTimer: !!aliveTimer, before: { live: before.live, build: before.build, state: before.state }, after: { state: after.state, pending: after.pending, message: after.message } }));
      app.exit(0);
    });
  }
}

/* Route anchor-triggered downloads (DOCX) to a native Save As dialog — once. */
/** The Save dialog's title and file types for what is being saved. */
const SAVE_KINDS = {
  wav: { title: "Save listening track", folder: "music", filter: { name: "Audio (WAV)", extensions: ["wav"] } },
  mp3: { title: "Save listening track", folder: "music", filter: { name: "Audio (MP3)", extensions: ["mp3"] } },
  json: { title: "Save Vocab Master backup", folder: "documents", filter: { name: "Vocab Master backup", extensions: ["json"] } },
  docx: { title: "Save Word document", folder: "documents", filter: { name: "Word document", extensions: ["docx"] } },
  pdf: { title: "Save PDF", folder: "documents", filter: { name: "PDF", extensions: ["pdf"] } },
  png: { title: "Save picture", folder: "pictures", filter: { name: "Picture", extensions: ["png"] } },
  txt: { title: "Save text", folder: "documents", filter: { name: "Text", extensions: ["txt"] } },
};
function saveDialogFor(name) {
  const ext = path.extname(name).slice(1).toLowerCase();
  const k = SAVE_KINDS[ext] || { title: "Save file", folder: "downloads", filter: { name: "All files", extensions: ["*"] } };
  let dir;
  try { dir = app.getPath(k.folder); } catch { dir = app.getPath("downloads"); }
  return { title: k.title, defaultPath: path.join(dir, name), filters: [k.filter, { name: "All files", extensions: ["*"] }] };
}

function registerDownloadHandler() {
  // Electron itself shows the Save window with these options and holds the download until the teacher chooses.
  // (Cancelling the download and opening our own dialog lost the file: a cancelled item can't be resumed.)
  session.defaultSession.on("will-download", (_event, item, contents) => {
    const win = (contents && !contents.isDestroyed() && BrowserWindow.fromWebContents(contents)) || mainWindow;
    const suggested = item.getFilename() || "worksheet.docx";
    item.setSaveDialogOptions(saveDialogFor(suggested));
    item.once("done", (_e, state) => {
      const savePath = item.getSavePath();
      if (state === "completed" && savePath) savedPaths.add(savePath);
      if (win && !win.isDestroyed()) {
        win.webContents.send("download:done", { state, filename: savePath ? path.basename(savePath) : suggested, path: state === "completed" ? savePath : "" });
      }
    });
  });
}

/* ── Smoke test for CI / dev validation ───────────────────────────────────── */

async function runSmokeTest() {
  const results = {};
  try {
    results.protocolOk = await mainWindow.webContents.executeJavaScript(
      "document.readyState === 'complete' && typeof window.desktop !== 'undefined'"
    );
    // bootApp() is async (hydrates storage) — wait up to 10s for the engine flag.
    results.engineOk = await mainWindow.webContents.executeJavaScript(`
      (async () => {
        for (let i = 0; i < 100; i++) {
          if (window.__LINGO_ENGINE__ && typeof window.__LINGO_ENGINE__.validateWorksheet === 'function') return true;
          await new Promise((r) => setTimeout(r, 100));
        }
        return false;
      })()
    `);
    results.title = await mainWindow.webContents.executeJavaScript("document.title");
    // Drive the real UI end-to-end: a fixture unit, live editors, projector, coursebook auto-pick, arcade games.
    const fixture = fs.readFileSync(path.join(__dirname, "smoke-fixture.json"), "utf8");
    const editorFlow = await mainWindow.webContents.executeJavaScript(`
      (async () => {
        const dbg = {};
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const key = (k) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
        for (let i = 0; i < 100 && !window.__VM__; i++) await wait(100);
        const VM = window.__VM__;
        const E = window.__LINGO_ENGINE__;

        // A complete unit opens straight into the preview with editable lines and word boxes.
        const FIXTURE = ${fixture};
        VM.openUnit(FIXTURE);
        await wait(300);
        const paper = document.getElementById("paper").shadowRoot;
        dbg.view = VM.state.view;
        dbg.items = paper.querySelectorAll(".ex-item.editable").length;
        dbg.vocabCells = paper.querySelectorAll("td.editable-vocab").length;
        if (!dbg.items || dbg.vocabCells !== 8) return JSON.stringify({ ...dbg, fail: "preview" });

        // Edit a line in the side-sheet editor and check it is saved to the library.
        paper.querySelector(".ex-item.editable").click();
        await wait(250);
        const prompt = document.getElementById("ie_prompt");
        dbg.editorOpen = !!prompt;
        if (!prompt) return JSON.stringify({ ...dbg, fail: "item-editor" });
        const edited = "The ____ child smiled happily at the smoke test.";
        prompt.value = edited;
        prompt.dispatchEvent(new Event("input", { bubbles: true }));
        await wait(350);
        document.querySelector(".dialog [data-save]").click();
        await wait(400);
        dbg.saved = (E.getAllSavedSessions() || []).some((s) => JSON.stringify(s.data).includes(edited));
        dbg.dialogsAfter = document.querySelectorAll(".dialog-backdrop:not(.closing)").length;

        // Word box editor opens and closes.
        paper.querySelector("td.editable-vocab").click();
        await wait(250);
        dbg.vocabEditor = !!document.getElementById("ve_english");
        document.querySelector(".dialog [data-close]")?.click();
        await wait(300);

        // Projector mode opens and Esc closes it.
        VM.openProjector();
        await wait(250);
        dbg.projector = !!document.querySelector(".projector");
        key("Escape");
        await wait(300);
        dbg.projectorClosed = !document.querySelector(".projector");

        // Engine checks: bulk parser, DOCX via IPC, coursebook word bank.
        dbg.bulk = E.parseBulkVocabularyText("1. explore (v.) - εξερευνώ | explore a cave > explorer (n.) ≈ discover\\n2. brave (adj.) - γενναίος").length;
        const docx = await window.desktop.exportDocx({ type: "lingo", data: FIXTURE.data });
        dbg.docxOk = !!(docx && docx.ok && docx.base64 && docx.base64.length > 1000);
        const cpp1 = E.queryCoursebookWords({ bookId: "CPP1", unit: 1, includeSb: true, includeWb: true });
        const cpp2 = E.queryCoursebookWords({ bookId: "CPP2", unit: 5, includeSb: true, includeWb: false });
        const cpp3 = E.queryCoursebookWords({ bookId: "CPP3", pageRange: "118-120", includeSb: true, includeWb: true, wbScope: "unit" });
        const cbOk = cpp1.counts.total > 50 && cpp1.counts.wb > 5 && cpp2.counts.wb === 0 && cpp3.unit === 6 && cpp3.counts.wb > 10
          && E.CPP_WORDBANK.filter((e) => !e.origin).length === 3554 && !E.CPP_WORDBANK.some((e) => e.source === "enriched" || e.synonyms || e.isBasic);

        // Setup: choose Primary Path 2, type pages 74–76 → unit 4 is inferred and its words load.
        VM.go("setup");
        await wait(200);
        document.querySelector('#sourceSeg [data-value="cpp"]').click();
        await wait(150);
        document.querySelector('[data-book="CPP2"]').click();
        await wait(200);
        const pages = document.getElementById("cppPages");
        pages.value = "74-76";
        pages.dispatchEvent(new Event("input", { bubbles: true }));
        await wait(800);
        dbg.inferredUnit = VM.state.cpp.unit;
        dbg.autoWords = VM.state.words.filter((w) => w.english.trim()).length;
        dbg.poolChips = document.querySelectorAll("#poolChips .word-chip").length;

        // Arcade: every game renders its board.
        VM.openGames();
        await wait(250);
        dbg.gameCards = document.querySelectorAll(".game-card").length;
        // "Choose your words": book → unit → whole unit → play with exactly those words.
        document.querySelector(".hhd-pick").click(); await wait(400);
        dbg.picker = !!document.querySelector(".dp");
        document.querySelector('.dp [data-book="CPP3"]').click(); await wait(150);
        document.querySelector('.dp [data-unit="2"]').click(); await wait(400);
        // By page: pp. 34–41 of Book 3 finds words across the unit's sections.
        const typePages = (v) => { const i = document.getElementById("dpPages"); i.value = v; i.dispatchEvent(new Event("input", { bubbles: true })); };
        typePages("34-41"); await wait(150);
        dbg.pages = /[0-9]+ words/.test(document.querySelector(".dp [data-pages-add]").textContent);
        typePages(""); await wait(100);
        document.querySelector(".dp [data-unit-all]").click(); await wait(150);
        const pickedN = Number(document.getElementById("dpCount").textContent);
        document.querySelector(".dp [data-apply]").click(); await wait(500);
        dbg.pickedDeck = pickedN > 50 && Math.abs(Number(document.querySelector(".hhd-count b").dataset.countup) - pickedN) <= 3 && /Primary Path 3 · Unit 2/.test(document.querySelector(".hhd-info b").textContent);
        // Every game but Lingo Live opens on its title screen; Start mounts the game.
        dbg.titles = 0;
        const play = async (id) => {
          document.querySelector('[data-hub]').click(); await wait(120); document.querySelector('[data-game="' + id + '"]').click(); await wait(250);
          if (id !== "live") { dbg.titles += document.querySelector(".sx-title") ? 1 : 0; document.querySelector("[data-st-go]")?.click(); await wait(550); }
        };
        await play("flashcards"); dbg.fc = !!document.querySelector(".fc-card");
        await play("memory"); dbg.mem = document.querySelectorAll(".mm-tile").length;
        await play("spelling"); dbg.spell = document.querySelectorAll(".sp-tile").length;
        await play("board"); dbg.quiz = document.querySelectorAll(".wb-tile").length;
        await play("feud"); await wait(2400); dbg.feud = document.querySelectorAll(".fd-slot").length; // after the "Round 1" card
        await play("taboo"); document.querySelector("[data-start]")?.click(); await wait(3300); dbg.taboo = document.querySelectorAll(".ts-no").length; // after 3 · 2 · 1
        // Lingo Live: lobby, then 3-2-1 and the first question with its answer tiles.
        await play("live"); dbg.liveLobby = !!document.querySelector(".lv-lobby");
        document.querySelector("[data-start]")?.click(); await wait(5400); dbg.liveOpts = document.querySelectorAll(".lv-opt").length;
        key("Escape"); await wait(100); key("Escape"); await wait(400);
        dbg.arcadeClosed = !document.querySelector(".arcade");

        // Settings → Account & sync renders on app:// (signed out, sign-in and backup buttons present).
        document.getElementById("btnSettings")?.click(); await wait(500);
        dbg.account = !!document.querySelector('#syncSection [data-ac="google"]') && !!document.querySelector('#syncSection [data-ac="export"]');
        key("Escape"); await wait(300);

        // Leave no trace in History.
        (E.getAllSavedSessions() || []).forEach((s) => E.deleteSavedSession(s.id));

        const ok = dbg.view === "preview" && dbg.saved && dbg.dialogsAfter === 0 && dbg.vocabEditor
          && dbg.projector && dbg.projectorClosed && dbg.bulk === 2 && dbg.docxOk && cbOk
          && dbg.inferredUnit === 4 && dbg.autoWords >= 10 && dbg.poolChips >= 10
          && dbg.gameCards === 7 && dbg.picker && dbg.pages && dbg.titles === 6 && dbg.pickedDeck && dbg.liveLobby && dbg.liveOpts >= 2 && dbg.fc && dbg.mem >= 12 && dbg.spell >= 2 && dbg.quiz >= 9 && dbg.feud >= 5 && dbg.taboo >= 1 && dbg.arcadeClosed;
        return JSON.stringify({ ...dbg, cbOk, fail: !ok ? "ui-flow" : !dbg.account ? "account" : "" });
      })()
    `);
    results.editorFlow = JSON.parse(editorFlow || "{}");
    results.editorOk = results.editorFlow?.fail === "";
    // Natural voices: the page is cross-origin isolated (threads), the voice worker starts and the WebAssembly
    // engine compiles under the CSP. No model download here: the smoke test must work offline.
    results.voices = JSON.parse(await mainWindow.webContents.executeJavaScript(`
      (async () => {
        const out = { isolated: self.crossOriginIsolated === true, wasm: false, worker: false };
        try { await WebAssembly.compileStreaming(fetch("vendor/kokoro/ort-wasm-simd-threaded.jsep.wasm")); out.wasm = true; } catch (e) { out.wasmError = String(e.message || e); }
        try {
          out.worker = await new Promise((resolve) => {
            const w = new Worker("js/voices/kokoro-worker.js", { type: "module" });
            const t = setTimeout(() => { w.terminate(); resolve(true); }, 2500); // loaded with no error
            w.onerror = (e) => { clearTimeout(t); out.workerError = String(e.message || "worker error"); resolve(false); };
          });
        } catch (e) { out.workerError = String(e.message || e); }
        return JSON.stringify(out);
      })()
    `));
    results.voicesOk = results.voices.isolated && results.voices.wasm && results.voices.worker;
    // Opt-in (`--smoke --voices`, needs the internet once): download the natural voices and speak one sentence.
    if (process.argv.includes("--voices")) {
      results.voicesFull = JSON.parse(await mainWindow.webContents.executeJavaScript(`
        (async () => {
          const t0 = performance.now();
          const w = new Worker("js/voices/kokoro-worker.js", { type: "module" });
          const out = await new Promise((resolve) => {
            const r = { threads: 0 };
            w.onmessage = ({ data }) => {
              if (data.type === "ready") { r.threads = data.threads; r.loadMs = Math.round(performance.now() - t0); w.postMessage({ type: "speak", id: 1, text: "Hi, Tom! Did you see the volcano film in class today?", voice: "af_heart", speed: 0.9 }); r.t1 = performance.now(); }
              if (data.type === "audio") { r.seconds = +(data.samples.length / data.rate).toFixed(2); r.speakMs = Math.round(performance.now() - r.t1); delete r.t1; resolve(r); }
              if (data.type === "error") resolve({ ...r, error: data.message });
            };
            w.postMessage({ type: "load" });
            setTimeout(() => resolve({ ...r, error: "timeout" }), 240000);
          });
          w.terminate();
          return JSON.stringify(out);
        })()
      `));
      results.voicesOk = results.voicesOk && !results.voicesFull.error && results.voicesFull.seconds > 1;
    }
    console.log("SMOKE_RESULTS " + JSON.stringify(results));
    app.exit(results.protocolOk && results.engineOk && results.editorOk && results.voicesOk ? 0 : 1);
  } catch (err) {
    console.error("SMOKE_ERROR", err);
    app.exit(1);
  }
}

/* ── Menu ─────────────────────────────────────────────────────────────────── */

function buildMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        { label: "New worksheet", accelerator: "CmdOrCtrl+N", click: () => mainWindow?.webContents.send("menu:new") },
        { type: "separator" },
        { label: "Print…", accelerator: "CmdOrCtrl+P", click: () => mainWindow?.webContents.send("menu:print") },
        { type: "separator" },
        { role: "quit", label: "Exit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" }, { role: "redo" }, { type: "separator" },
        { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" }, { role: "forceReload" }, { role: "toggleDevTools" },
        { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
        { type: "separator" }, { role: "togglefullscreen" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About Vocab Master",
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: "info",
              title: "About",
              message: "Vocab Master",
              detail: `AI vocabulary worksheets for Greek ESL teachers (A–E Senior).\n\nVersion ${app.getVersion()}${live.info().live ? ` · pages updated (${live.info().live.sha})` : live.info().build ? ` · pages ${live.info().build.sha}` : ""} · Electron ${process.versions.electron}\n\nData is stored locally on this computer.`,
            });
          },
        },
        {
          label: "Check for updates",
          click: async () => {
            const info = await Promise.all([live.check({ manual: true }), exe.check()]).then(() => updatesInfo());
            mainWindow?.webContents.send("updates:changed", { ...info, announce: true });
          },
        },
        {
          label: "Open data folder",
          click: () => shell.openPath(app.getPath("userData")),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ── Save helpers ─────────────────────────────────────────────────────────── */

const savedPaths = new Set();

/** Native Save As, starting in the folder the teacher used last time. */
async function askSavePath(filename, title, filter) {
  const prefs = readJsonFile("prefs.json", {});
  const dir = prefs.lastSaveDir && fs.existsSync(prefs.lastSaveDir) ? prefs.lastSaveDir : app.getPath("downloads");
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title,
    defaultPath: path.join(dir, filename),
    filters: [filter],
  });
  if (canceled || !filePath) return null;
  writeJsonFile("prefs.json", { ...prefs, lastSaveDir: path.dirname(filePath) });
  return filePath;
}

function friendlyFsError(err) {
  if (err?.code === "EBUSY" || err?.code === "EPERM") {
    return "The file is open in another program (e.g. Word). Close it and try again.";
  }
  return err?.message || String(err);
}

/**
 * Load a standalone HTML document from a temp file. (Large data: URLs — worksheets with
 * embedded fonts — can fail to load, so they are never used.)
 */
async function loadHtmlDocument(win, html) {
  const file = path.join(app.getPath("temp"), `vocab-master-${process.pid}-${Date.now()}.html`);
  fs.writeFileSync(file, html, "utf8");
  try {
    await win.loadFile(file);
    await new Promise((r) => setTimeout(r, 250)); // let the embedded fonts finish loading
  } finally {
    fs.rm(file, { force: true }, () => {});
  }
}

/** printToPDF options; a non-empty `footer` adds "footer text · Page X of Y" to every page. */
function pdfOptions(footer) {
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
  return {
    pageSize: "A4",
    printBackground: true,
    // The worksheet's own @page rules set the margins, so PDF, print and preview match.
    preferCSSPageSize: true,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    ...(footer ? {
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="width:100%;margin:0 14mm 5mm;padding-top:1.6mm;border-top:0.5pt solid #c9c9c9;display:flex;justify-content:space-between;font:7.5pt Segoe UI,Arial,sans-serif;color:#6f6f6f"><span>${esc(footer)}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
    } : {}),
  };
}

/* ── IPC handlers ─────────────────────────────────────────────────────────── */

function registerIpc() {
  // Only the app's top-level renderer can invoke ChatGPT operations. Tokens never cross IPC.
  ipcMain.handle("chatgpt:action", async (event, { action, payload } = {}) => {
    if (event.sender !== mainWindow?.webContents || event.senderFrame !== event.sender.mainFrame || !event.senderFrame.url.startsWith("app://")) return { ok: false, error: "Untrusted ChatGPT request." };
    try {
      const runtime = chatgptRuntime();
      let value;
      if (action === "status") value = runtime.status();
      else if (action === "signIn") {
        const url = await runtime.startSignIn(payload?.accountId || "");
        try { await shell.openExternal(url); } catch { runtime.cancelSignIn(); throw new Error("Couldn't open your browser. Please try again."); }
        value = runtime.status();
      } else if (action === "cancel") { runtime.cancelSignIn(); value = runtime.status(); }
      else if (action === "models") value = await runtime.listModels();
      else if (action === "model") value = runtime.selectModel(payload?.model);
      else if (action === "account") value = runtime.selectAccount(payload?.accountId);
      else if (action === "signOut") value = await runtime.signOut();
      else if (action === "acknowledge") value = runtime.acknowledge();
      else if (action === "usage") { await shell.openExternal(CHATGPT_USAGE_URL); value = runtime.status(); }
      else if (action === "generate") value = await runtime.generate(payload || {});
      else throw new Error("Unknown ChatGPT action.");
      return { ok: true, value };
    } catch (e) { return { ok: false, error: chatgptError(e), code: e.code || "chatgpt_error" }; }
  });
  ipcMain.handle("deepseek:chat", async (_event, { body, auth }) => proxyDeepSeek(body, auth));
  ipcMain.handle("deepseek:balance", async (_event, { apiKey }) =>
    deepSeekRequest("GET", "/user/balance", `Bearer ${String(apiKey || "").trim()}`, null, 20_000));

  ipcMain.handle("docx:export", async (_event, { type, data }) => {
    try {
      const engine = await loadEngine();
      let blob;
      if (type === "lingo") blob = await engine.buildLingoDocx(data);
      else if (type === "dictation") blob = await engine.buildDictationDocx(data);
      else if (type === "answer") blob = await engine.buildAnswerKeyDocx(data);
      else if (type === "studio") blob = await engine.buildStudioDocx(data);
      else throw new Error("Invalid export type");
      const buf = Buffer.from(await blob.arrayBuffer());
      return { ok: true, base64: buf.toString("base64") };
    } catch (err) {
      console.error("DOCX export error:", err);
      return { ok: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("docx:save", async (_event, { type, data, filename }) => {
    try {
      const engine = await loadEngine();
      const build = { lingo: engine.buildLingoDocx, dictation: engine.buildDictationDocx, answer: engine.buildAnswerKeyDocx, studio: engine.buildStudioDocx }[type];
      if (!build) throw new Error("Invalid export type");
      const buf = Buffer.from(await (await build(data)).arrayBuffer());
      const filePath = await askSavePath(filename || "worksheet.docx", "Save Word document", { name: "Word document", extensions: ["docx"] });
      if (!filePath) return { ok: false, canceled: true };
      fs.writeFileSync(filePath, buf);
      savedPaths.add(filePath);
      return { ok: true, path: filePath };
    } catch (err) {
      console.error("DOCX save error:", err);
      return { ok: false, error: friendlyFsError(err) };
    }
  });

  ipcMain.handle("pdf:export", async (_event, { html, filename, footer }) => {
    let pdfWin = null;
    try {
      pdfWin = new BrowserWindow({
        show: false,
        webPreferences: { sandbox: true, javascript: false },
      });
      await loadHtmlDocument(pdfWin, html);
      const pdf = await pdfWin.webContents.printToPDF(pdfOptions(footer));
      const filePath = await askSavePath(filename || "worksheet.pdf", "Save worksheet PDF", { name: "PDF", extensions: ["pdf"] });
      if (!filePath) return { ok: false, canceled: true };
      fs.writeFileSync(filePath, pdf);
      savedPaths.add(filePath);
      return { ok: true, path: filePath };
    } catch (err) {
      console.error("PDF export error:", err);
      return { ok: false, error: friendlyFsError(err) };
    } finally {
      if (pdfWin && !pdfWin.isDestroyed()) pdfWin.destroy();
    }
  });

  ipcMain.handle("pack:export", async (_event, { data, baseSlug, htmlPages, footers = {}, names = {}, folderName = "" }) => {
    // The pages name the files ("Dictation, CPP1, Unit 5, pp. 40-41"); older pages send only baseSlug.
    const clean = (s) => String(s || "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").slice(0, 150);
    const fileFor = (key, suffix) => (clean(names[key]) ? `${clean(names[key])}${path.extname(suffix)}` : `${baseSlug}_${suffix}`);
    let pdfWin = null;
    try {
      const prefs = readJsonFile("prefs.json", {});
      const startDir = prefs.lastSaveDir && fs.existsSync(prefs.lastSaveDir) ? prefs.lastSaveDir : app.getPath("downloads");
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: "Choose folder to export Full Unit Pack",
        defaultPath: startDir,
        properties: ["openDirectory", "createDirectory"],
      });
      if (canceled || !filePaths || !filePaths[0]) return { ok: false, canceled: true };
      const chosenDir = filePaths[0];
      writeJsonFile("prefs.json", { ...prefs, lastSaveDir: chosenDir });

      const packFolder = path.join(chosenDir, clean(folderName) || `${baseSlug || "Unit-Pack"}_Pack`);
      fs.mkdirSync(packFolder, { recursive: true });

      const engine = await loadEngine();
      const writtenFiles = [];

      const docxTargets = [
        { key: "lingo", suffix: "Lingo-Launcher.docx", fn: engine.buildLingoDocx },
        { key: "dictation", suffix: "Dictation.docx", fn: engine.buildDictationDocx },
        { key: "answer", suffix: "Answer-Key.docx", fn: engine.buildAnswerKeyDocx },
      ];

      for (const t of docxTargets) {
        if (typeof t.fn === "function") {
          const blob = await t.fn(data);
          const buf = Buffer.from(await blob.arrayBuffer());
          const outPath = path.join(packFolder, fileFor(t.key, t.suffix));
          fs.writeFileSync(outPath, buf);
          savedPaths.add(outPath);
          writtenFiles.push(path.basename(outPath));
        }
      }

      if (htmlPages && typeof htmlPages === "object") {
        pdfWin = new BrowserWindow({
          show: false,
          webPreferences: { sandbox: true, javascript: false },
        });
        const pdfTargets = [
          { key: "lingo", suffix: "Lingo-Launcher.pdf" },
          { key: "dictation", suffix: "Dictation.pdf" },
          { key: "answer", suffix: "Answer-Key.pdf" },
        ];
        for (const pt of pdfTargets) {
          const html = htmlPages[pt.key];
          if (!html) continue;
          await loadHtmlDocument(pdfWin, html);
          const pdfBuf = await pdfWin.webContents.printToPDF(pdfOptions(footers[pt.key]));
          const outPath = path.join(packFolder, fileFor(pt.key, pt.suffix));
          fs.writeFileSync(outPath, pdfBuf);
          savedPaths.add(outPath);
          writtenFiles.push(path.basename(outPath));
        }
      }

      savedPaths.add(packFolder);
      return { ok: true, folder: packFolder, files: writtenFiles };
    } catch (err) {
      console.error("Pack export error:", err);
      return { ok: false, error: friendlyFsError(err) };
    } finally {
      if (pdfWin && !pdfWin.isDestroyed()) pdfWin.destroy();
    }
  });

  // Only files this session saved may be opened — the renderer can't open arbitrary paths.
  ipcMain.handle("shell:openPath", (_e, p) => (savedPaths.has(p) ? shell.openPath(p) : "Not allowed"));
  ipcMain.handle("shell:showItem", (_e, p) => { if (savedPaths.has(p)) shell.showItemInFolder(p); });

  ipcMain.handle("storage:getAll", () => STORE.getAll());
  ipcMain.handle("storage:set", (_e, { key, value }) => { STORE.set(key, value); return true; });
  ipcMain.handle("storage:remove", (_e, { key }) => { STORE.remove(key); return true; });

  ipcMain.handle("keychain:get", (_e, { name } = {}) => keychainGet(name));
  ipcMain.handle("keychain:set", (_e, { value, name }) => { keychainSet(value, name); return true; });
  ipcMain.handle("gemini:request", (_e, { method = "POST", path: apiPath, apiKey, body }) => geminiRequest(method, apiPath, apiKey, body));

  ipcMain.handle("app:info", () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    platform: process.platform,
    userData: app.getPath("userData"),
  }));

  ipcMain.handle("shell:openDataFolder", () => shell.openPath(app.getPath("userData")));
  // Updates (live pages + the exe). "alive" = the pages started: keep them; returns "just updated" once.
  ipcMain.handle("updates:alive", () => { clearTimeout(aliveTimer); aliveTimer = null; return live.alive(); });
  ipcMain.handle("updates:status", () => updatesInfo());
  ipcMain.handle("updates:check", async () => { await Promise.all([live.check({ manual: true }), exe.check()]); return updatesInfo(); });
  ipcMain.handle("updates:setAuto", (_e, on) => { live.setAuto(!!on); return updatesInfo(); });
  // "Update now": a new exe installs and reopens; new pages are swapped in and the window reloads (no restart).
  ipcMain.handle("updates:restart", () => {
    if (exe.install()) return "installing";
    if (live.applyPending()) { setTimeout(reloadPages, 150); return "reloading"; }
    setTimeout(relaunchApp, 150);
    return "restarting";
  });
  ipcMain.handle("updates:download", () => {
    const url = exe.status.url || `https://github.com/${REPO}/releases/latest`;
    if (/^https:\/\/github\.com\//.test(url)) shell.openExternal(url);
    return true;
  });
  // Google sign-in for account sync: system browser → one-time 127.0.0.1 callback (google-signin.js).
  const google = createGoogleLoopback({
    openExternal: (url) => shell.openExternal(url),
    onDone: () => { if (mainWindow && !mainWindow.isDestroyed()) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } },
  });
  ipcMain.handle("google:signin", () => google.start());
  ipcMain.handle("google:cancel", () => { google.cancel(); return true; });
}

/* ── App lifecycle ────────────────────────────────────────────────────────── */

// A relaunched copy may start while the old one is still closing: it waits a little for the lock.
let gotLock = app.requestSingleInstanceLock();
if (!gotLock && process.argv.includes("--relaunch")) {
  const until = Date.now() + 8000;
  while (!gotLock && Date.now() < until) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    gotLock = app.requestSingleInstanceLock();
  }
}
app.on("before-quit", () => chatgpt?.close());
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    try { live.startup(); } catch (e) { console.error("live: startup failed", e); }
    registerAppProtocol();
    registerIpc();
    registerDownloadHandler();
    buildMenu();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
