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
import { app, BrowserWindow, ipcMain, dialog, shell, session, protocol, Menu, safeStorage, screen } from "electron";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RENDERER_DIR = path.join(__dirname, "renderer");
const APP_SCHEME = "app";
const DEEPSEEK_HOST = "api.deepseek.com";
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

// The smoke test must never touch the teacher's real History / settings / API key.
if (process.argv.includes("--smoke")) {
  const smokeDir = path.join(app.getPath("temp"), "lingo-launcher-smoke");
  fs.rmSync(smokeDir, { recursive: true, force: true });
  app.setPath("userData", smokeDir);
}

let mainWindow = null;
let enginePromise = null;

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

const KEYCHAIN_FILE = () => dataFile("keychain.bin");

function keychainGet() {
  try {
    if (!fs.existsSync(KEYCHAIN_FILE())) return null;
    const buf = fs.readFileSync(KEYCHAIN_FILE());
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(buf);
    }
    return buf.toString("utf8");
  } catch (err) {
    console.error("keychain get failed", err);
    return null;
  }
}

function keychainSet(value) {
  try {
    if (!value) {
      if (fs.existsSync(KEYCHAIN_FILE())) fs.unlinkSync(KEYCHAIN_FILE());
      return;
    }
    const data = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(value)
      : Buffer.from(value, "utf8");
    fs.writeFileSync(KEYCHAIN_FILE(), data);
  } catch (err) {
    console.error("keychain set failed", err);
  }
}

/* ── Shared engine (app.js — reused unchanged for DOCX building) ──────────── */

function loadEngine() {
  if (!enginePromise) {
    const engineUrl = pathToFileURL(path.join(RENDERER_DIR, "app.js")).href;
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
  return new Promise((resolve) => {
    const payload = body ? Buffer.from(body, "utf8") : null;
    const req = https.request(
      {
        hostname: DEEPSEEK_HOST,
        path: apiPath,
        method,
        headers: {
          Accept: "application/json",
          ...(payload ? { "Content-Type": "application/json", "Content-Length": payload.length } : {}),
          ...(authHeader ? { Authorization: authHeader } : {}),
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
    const filePath = path.resolve(RENDERER_DIR, rel);
    if (!filePath.startsWith(RENDERER_DIR + path.sep)) {
      return new Response("Forbidden", { status: 403 });
    }
    try {
      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile()) return new Response("Not found", { status: 404 });
      const data = await fs.promises.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      return new Response(data, {
        headers: { "content-type": MIME[ext] || "application/octet-stream" },
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
    backgroundColor: "#f6f9fb",
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
  });

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
}

/* Route anchor-triggered downloads (DOCX) to a native Save As dialog — once. */
function registerDownloadHandler() {
  session.defaultSession.on("will-download", async (event, item) => {
    event.preventDefault();
    const win = BrowserWindow.fromWebContents(item.getWebContents()) || mainWindow;
    const suggested = item.getFilename() || "worksheet.docx";
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: "Save worksheet",
      defaultPath: path.join(app.getPath("downloads"), suggested),
      filters: [{ name: "Documents", extensions: ["docx", "pdf", "txt"] }],
    });
    if (canceled || !filePath) return;
    item.setSavePath(filePath);
    item.resume();
    item.on("done", (_e, state) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send("download:done", {
          state,
          filename: path.basename(filePath),
        });
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
    // Editor: inject a synthetic worksheet, open a line's editor, edit + save, verify it persists.
    const editorFlow = await mainWindow.webContents.executeJavaScript(`
      (async () => {
        const dbg = {};
        const E = window.__LINGO_ENGINE__;
        const data = {
          meta: { bookTitle: "Smoke", unit: 1, pageRange: "1-2", classProfile: "juniorA" },
          lingoLauncher: {
            vocabulary: [{ english: "happy", greek: "\u03c7\u03b1\u03c1\u03bf\u03cd\u03bc\u03b5\u03bd\u03bf\u03c2" }],
            practice: [{ number: 1, typeId: "L01", items: [{ number: 1, prompt: "The ____ boy smiled.", answer: "happy" }] }],
          },
          dictation: {
            exercises: [{ number: 1, typeId: "D01", wordBank: ["happy"], items: [{ number: 1, prompt: "The ____ boy.", answer: "happy", testsWords: ["happy"] }] }],
          },
        };
        window.__EDITOR_API__.setTestData(data);
        document.getElementById("toStep4").classList.remove("hidden");
        document.getElementById("toStep4").click();
        await new Promise((r) => setTimeout(r, 300));
        const items = document.querySelectorAll("#previewFrame .ex-item.editable");
        dbg.items = items.length;
        if (!items.length) return JSON.stringify({ ...dbg, fail: "no-items" });
        items[0].click();
        await new Promise((r) => setTimeout(r, 100));
        const modal = document.getElementById("itemEditorModal");
        dbg.modalHidden = modal.classList.contains("hidden");
        dbg.promptVal = document.getElementById("itemPrompt").value;
        if (modal.classList.contains("hidden")) return JSON.stringify({ ...dbg, fail: "modal-not-open" });
        const prompt = document.getElementById("itemPrompt");
        const edited = "The ____ child smiled happily.";
        prompt.value = edited;
        prompt.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 400));
        dbg.liveVal = document.getElementById("itemEditorValidation").textContent;
        document.getElementById("saveItemEditor").click();
        await new Promise((r) => setTimeout(r, 400));
        dbg.modalHiddenAfter = modal.classList.contains("hidden");
        const saved = E.getAllSavedSessions() || [];
        dbg.savedCount = saved.length;
        dbg.hit = saved.some((s) => JSON.stringify(s.data).includes(edited));
        // Clean up the synthetic session so smoke runs don't pollute real History.
        saved.filter((s) => JSON.stringify(s.data).includes(edited)).forEach((s) => E.deleteSavedSession(s.id));

        // Test Teacher Studio 2.0 features: Sample Unit, Vocab Cell Editor, Bulk Parser, Classroom Mode, DOCX build
        document.getElementById("btnLoadSample").click();
        await new Promise((r) => setTimeout(r, 200));
        const vocabCells = document.querySelectorAll("#previewFrame .vocab-cell.editable-vocab");
        dbg.sampleVocabCells = vocabCells.length;
        if (vocabCells.length !== 8) return JSON.stringify({ ...dbg, fail: "sample-vocab-count" });

        // Test clicking a vocabulary cell to edit
        vocabCells[0].click();
        await new Promise((r) => setTimeout(r, 100));
        const veModal = document.getElementById("vocabEditorModal");
        if (veModal.classList.contains("hidden")) return JSON.stringify({ ...dbg, fail: "vocab-modal-not-open" });
        document.getElementById("closeVocabEditor").click();

        // Test Classroom Projector Mode
        document.getElementById("btnClassroomMode").click();
        await new Promise((r) => setTimeout(r, 100));
        const crModal = document.getElementById("classroomModal");
        dbg.classroomOpen = !crModal.classList.contains("hidden");
        document.getElementById("closeClassroomMode").click();

        // Test Bulk Parser
        const parsedBulk = E.parseBulkVocabularyText("1. explore (v.) - εξερευνώ | explore a cave\\n2. brave (adj.) - γενναίος");
        dbg.bulkParsedCount = parsedBulk.length;

        // Test DOCX export via main process IPC
        const sample = E.getSampleUnitData();
        const docxRes = await window.desktop.exportDocx({ type: "lingo", data: sample.data });
        dbg.docxOk = !!(docxRes && docxRes.ok && docxRes.base64 && docxRes.base64.length > 1000);

        // Test Cambridge Primary Path 1/2/3 Official + Enriched Wordbank
        const cpp1Q = E.queryCoursebookWords({ bookId: "CPP1", unit: 1, includeSb: true, includeWb: true, includeEnriched: true });
        const cpp2Q = E.queryCoursebookWords({ bookId: "CPP2", unit: 5, includeSb: true, includeWb: false, includeEnriched: true });
        const cpp3PageQ = E.queryCoursebookWords({ bookId: "CPP3", pageRange: "118-120", includeSb: true, includeWb: true, wbScope: "unit", includeEnriched: true });
        dbg.cpp1Total = cpp1Q.counts.total;
        dbg.cpp1Wb = cpp1Q.counts.wb;
        dbg.cpp2WbExcluded = cpp2Q.counts.wb;
        dbg.cpp3InferredUnit = cpp3PageQ.unit;
        dbg.cpp3WbIncludedInPages = cpp3PageQ.counts.wb;
        dbg.cpp3Enriched = cpp3PageQ.counts.enriched;

        // Test UI auto-assignment when selecting book + page range
        document.getElementById("bookTitle").value = "Cambridge Primary Paths 2";
        document.getElementById("unit").value = "";
        document.getElementById("pageRange").value = "74-76";
        document.getElementById("pageRange").dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 150));
        const assignedCards = [...document.querySelectorAll("#vocabRows .vocab-card .vr-english")].filter((el) => el.value.trim().length > 0);
        dbg.uiAutoAssignedUnit = document.getElementById("unit").value;
        dbg.uiAutoAssignedWords = assignedCards.length;
        const cbOk = dbg.cpp1Total > 50 && dbg.cpp1Wb > 5 && dbg.cpp2WbExcluded === 0 && dbg.cpp3InferredUnit === 6 && dbg.cpp3WbIncludedInPages > 10 && dbg.cpp3Enriched >= 4 && dbg.uiAutoAssignedUnit === "4" && dbg.uiAutoAssignedWords >= 10;

        // Test Lingo Arcade (5 Interactive Classroom Games)
        document.getElementById("btnOpenArcadeTop").click();
        await new Promise((r) => setTimeout(r, 120));
        const arcModal = document.getElementById("arcadeModal");
        dbg.arcadeOpen = !arcModal.classList.contains("hidden");
        dbg.fcRendered = !!document.querySelector("#arcadeStage .fc-card-3d");
        document.querySelector('#arcadeGameTabs [data-game="memory"]').click();
        dbg.memTiles = document.querySelectorAll("#arcadeStage .mem-tile").length;
        document.querySelector('#arcadeGameTabs [data-game="spellbee"]').click();
        dbg.sbTiles = document.querySelectorAll("#arcadeStage .sb-tile").length;
        document.querySelector('#arcadeGameTabs [data-game="detective"]').click();
        dbg.detOpts = document.querySelectorAll("#arcadeStage .det-option-btn").length;
        document.querySelector('#arcadeGameTabs [data-game="hotseat"]').click();
        dbg.hsTaboo = document.querySelectorAll("#arcadeStage .hs-taboo-chip").length;
        document.getElementById("closeArcadeModal").click();
        dbg.arcadeClosed = arcModal.classList.contains("hidden");
        const arcadeOk = dbg.arcadeOpen && dbg.fcRendered && dbg.memTiles >= 12 && dbg.sbTiles >= 2 && dbg.detOpts === 4 && dbg.hsTaboo === 3 && dbg.arcadeClosed;

        return JSON.stringify({
          ...dbg,
          fail: (dbg.hit && dbg.modalHiddenAfter && dbg.classroomOpen && dbg.bulkParsedCount === 2 && dbg.docxOk && cbOk && arcadeOk) ? "" : "studio2-fail",
        });
      })()
    `);
    results.editorFlow = JSON.parse(editorFlow || "{}");
    results.editorOk = results.editorFlow?.fail === "";
    console.log("SMOKE_RESULTS " + JSON.stringify(results));
    app.exit(results.protocolOk && results.engineOk && results.editorOk ? 0 : 1);
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
              detail: `AI vocabulary worksheets for Greek ESL teachers (A–E Senior).\n\nVersion ${app.getVersion()} · Electron ${process.versions.electron}\n\nData is stored locally on this computer.`,
            });
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

/* ── IPC handlers ─────────────────────────────────────────────────────────── */

function registerIpc() {
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
      const build = { lingo: engine.buildLingoDocx, dictation: engine.buildDictationDocx, answer: engine.buildAnswerKeyDocx }[type];
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

  ipcMain.handle("pdf:export", async (_event, { html, filename }) => {
    let pdfWin = null;
    try {
      pdfWin = new BrowserWindow({
        show: false,
        webPreferences: { sandbox: true, javascript: false },
      });
      await pdfWin.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
      const pdf = await pdfWin.webContents.printToPDF({
        pageSize: "A4",
        printBackground: true,
        // Let the worksheet's own @page rules control margins (15mm in PRINT_CSS),
        // so the PDF matches the on-screen and printed layout.
        preferCSSPageSize: true,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      });
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

  ipcMain.handle("pack:export", async (_event, { data, baseSlug, htmlPages }) => {
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

      const packFolder = path.join(chosenDir, `${baseSlug || "Unit-Pack"}_Pack`);
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
          const outPath = path.join(packFolder, `${baseSlug}_${t.suffix}`);
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
          await pdfWin.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
          const pdfBuf = await pdfWin.webContents.printToPDF({
            pageSize: "A4",
            printBackground: true,
            preferCSSPageSize: true,
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
          });
          const outPath = path.join(packFolder, `${baseSlug}_${pt.suffix}`);
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

  ipcMain.handle("keychain:get", () => keychainGet());
  ipcMain.handle("keychain:set", (_e, { value }) => { keychainSet(value); return true; });

  ipcMain.handle("app:info", () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    platform: process.platform,
    userData: app.getPath("userData"),
  }));

  ipcMain.handle("shell:openDataFolder", () => shell.openPath(app.getPath("userData")));
}

/* ── App lifecycle ────────────────────────────────────────────────────────── */

const gotLock = app.requestSingleInstanceLock();
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
