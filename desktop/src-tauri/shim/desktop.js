/* Vocab Master — the Tauri shell's bridge for the pages (injected before the pages' own scripts, main frame only).
 * `window.desktop`: the same bridge the Electron app (≤ 3.5) gave the pages, so they ran unchanged when it was replaced. Calls go to the Rust side (desktop/src-tauri/src/lib.rs); Word files are built right here with the
 * pages' own engine (app.js) instead of in a Node process; file saving, PDF printing, AI requests, sign-ins and
 * updates stay in the shell. OAuth tokens never come back to the page. */
(() => {
  if (window.top !== window || window.desktop) return;
  const core = window.__TAURI_INTERNALS__;
  if (!core?.invoke) return;
  const invoke = (cmd, args, options) => core.invoke(cmd, args, options);

  /* Events from the shell: Rust calls window.__vmShell.emit(name, payload). */
  const listeners = {};
  const on = (name, fn) => { (listeners[name] ||= []).push(fn); };
  Object.defineProperty(window, "__vmShell", {
    value: Object.freeze({
      emit(name, payload) {
        for (const fn of listeners[name] || []) { try { fn(payload); } catch (e) { console.error(e); } }
      },
    }),
  });

  /* The same file-name cleaning as the shell (and the Electron app). */
  const clean = (s) => String(s || "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").slice(0, 150);
  const errText = (e) => String(e?.message || e || "Something went wrong.");

  /* Word files: the pages' own engine builds them (docx from vendor/docx, no Node). */
  async function buildDocx(type, data) {
    const E = await import("/app.js");
    const build = { lingo: E.buildLingoDocx, dictation: E.buildDictationDocx, answer: E.buildAnswerKeyDocx, studio: E.buildStudioDocx }[type];
    if (typeof build !== "function") throw new Error("Invalid export type");
    return new Uint8Array(await (await build(data)).arrayBuffer());
  }
  function toBase64(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  const asBytes = (b) => (b instanceof Uint8Array ? b : b instanceof ArrayBuffer ? new Uint8Array(b) : ArrayBuffer.isView(b) ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : new Uint8Array(b));
  /** Bytes to the shell as the raw request body; small text facts go in headers (URI-encoded). */
  const sendBytes = (cmd, bytes, facts) => invoke(cmd, asBytes(bytes), { headers: Object.fromEntries(Object.entries(facts).map(([k, v]) => [`x-vm-${k}`, encodeURIComponent(String(v ?? ""))])) });

  /* Packs: one folder chosen once, then each file. */
  async function writePack({ folderName, title, files }) {
    const begin = await invoke("pack_begin", { folderName, title });
    if (!begin?.ok) return begin;
    const token = begin.token;
    try {
      for (const f of files) {
        if (!clean(f?.name)) continue;
        if (f.docx) await sendBytes("pack_write", await buildDocx(f.docx.type, f.docx.data), { token, name: f.name });
        else if (f.pdf?.html) await invoke("pack_pdf", { token, name: f.name, html: f.pdf.html, footer: f.pdf.footer || "" });
        else if (f.bytes) await sendBytes("pack_write", f.bytes, { token, name: f.name });
      }
      return await invoke("pack_end", { token, cancel: false });
    } catch (e) {
      await invoke("pack_end", { token, cancel: true }).catch(() => {});
      return { ok: false, error: errText(e) };
    }
  }

  const desktop = {
    /** ChatGPT operations return account display data or generated JSON, never OAuth tokens. */
    chatgpt: (action, payload) => invoke("chatgpt_action", { action: String(action || ""), payload: payload ?? null }),
    /** POST to api.deepseek.com via the shell. Returns { status, body }. */
    chat: ({ body, auth } = {}) => invoke("deepseek_chat", { body: body || "{}", auth: auth || "" }),
    /** GET /user/balance with the given key (key check in Settings). Returns { status, body }. */
    balance: (apiKey) => invoke("deepseek_balance", { apiKey: String(apiKey || "") }),

    /** Build a .docx. Returns { ok, base64 } | { ok:false, error }. */
    exportDocx: async ({ type, data } = {}) => {
      try { return { ok: true, base64: toBase64(await buildDocx(type, data)) }; } catch (e) { console.error("DOCX export error:", e); return { ok: false, error: errText(e) }; }
    },
    /** Build a .docx and save it via a native Save window. Returns { ok, path } | { ok:false, canceled|error }. */
    saveDocx: async ({ type, data, filename } = {}) => {
      try { return await sendBytes("save_file", await buildDocx(type, data), { name: filename || "worksheet.docx", kind: "docx" }); } catch (e) { console.error("DOCX save error:", e); return { ok: false, error: errText(e) }; }
    },

    /** Open a saved file, or show it in Explorer (only files saved in this session). */
    openPath: (filePath) => invoke("open_path", { path: String(filePath || "") }),
    showItemInFolder: (filePath) => invoke("show_item", { path: String(filePath || "") }),

    /** Render HTML to a PDF file. Returns { ok, path } | { ok:false, canceled|error }. */
    exportPdf: ({ html, filename, footer } = {}) => invoke("export_pdf", { html: String(html || ""), filename: filename || "worksheet.pdf", footer: footer || "" }).catch((e) => ({ ok: false, error: errText(e) })),

    /** Full unit pack (3 .docx + 3 .pdf files) into a folder. */
    exportPack: async ({ data, baseSlug, htmlPages, footers = {}, names = {}, folderName = "" } = {}) => {
      // The pages name the files ("Dictation, CPP1, Unit 5, pp. 40-41"); older pages send only baseSlug.
      const ext = (s) => s.slice(s.lastIndexOf("."));
      const fileFor = (key, suffix) => (clean(names[key]) ? `${clean(names[key])}${ext(suffix)}` : `${baseSlug}_${suffix}`);
      const files = [
        { name: fileFor("lingo", "Lingo-Launcher.docx"), docx: { type: "lingo", data } },
        { name: fileFor("dictation", "Dictation.docx"), docx: { type: "dictation", data } },
        { name: fileFor("answer", "Answer-Key.docx"), docx: { type: "answer", data } },
      ];
      if (htmlPages && typeof htmlPages === "object") {
        for (const [key, suffix] of [["lingo", "Lingo-Launcher.pdf"], ["dictation", "Dictation.pdf"], ["answer", "Answer-Key.pdf"]]) {
          if (htmlPages[key]) files.push({ name: fileFor(key, suffix), pdf: { html: htmlPages[key], footer: footers[key] || "" } });
        }
      }
      return writePack({ folderName: clean(folderName) || `${baseSlug || "Unit-Pack"}_Pack`, title: "Choose folder to export Full Unit Pack", files });
    },
    /** Any pack into one folder: { folderName, title, files: [{ name, docx | pdf | bytes }] } → { ok, folder, files }. */
    savePack: async ({ folderName = "", title = "Choose a folder for the pack", files = [] } = {}) => {
      if (!Array.isArray(files) || !files.length) return { ok: false, error: "Nothing to save." };
      return writePack({ folderName, title, files });
    },

    /** JSON file storage (store.json in the data folder). */
    storage: {
      getAll: () => invoke("storage_get_all"),
      set: (key, value) => invoke("storage_set", { key: String(key), value }),
      remove: (key) => invoke("storage_remove", { key: String(key) }),
    },
    /** Encrypted API key storage (Windows-protected, the same files as before). */
    keychain: {
      get: (name) => invoke("keychain_get", { name: name || "deepseek" }),
      set: (value, name) => invoke("keychain_set", { value: String(value ?? ""), name: name || "deepseek" }),
    },

    /** Google Gemini API (v1beta generateContent / model list / interactions). Returns { status, body }. */
    gemini: ({ method = "POST", path = "", apiKey = "", body = null } = {}) => invoke("gemini_request", { method, path, apiKey, body }),

    /** Google sign-in for account sync (system browser + loopback). Returns { ok, idToken } | { ok:false, code, error }. */
    googleSignIn: () => invoke("google_signin"),
    googleCancel: () => invoke("google_cancel"),

    /** App metadata + folder helpers. */
    info: () => invoke("app_info"),
    openDataFolder: () => invoke("open_data_folder"),

    /** Updates: live pages from GitHub and new versions of the app. */
    updates: {
      /** The pages started: keep them. Returns { sha, message, date } once after an update, else null. */
      alive: () => invoke("updates_alive"),
      status: () => invoke("updates_status"),
      check: () => invoke("updates_check"),
      setAuto: (on) => invoke("updates_set_auto", { on: !!on }),
      restart: () => invoke("updates_restart"),
      download: () => invoke("updates_download"),
      onChange: (callback) => on("updates:changed", callback),
    },

    /** Menu commands (Ctrl+N, Ctrl+P). */
    onMenu: (callback) => on("menu", callback),
    /** The native Save window's result for anchor downloads. */
    onDownloadDone: (callback) => on("download:done", callback),
  };
  Object.defineProperty(window, "desktop", { value: Object.freeze(desktop), enumerable: true });

  /* Anchor downloads (<a download href="blob:…">: backups, results, listening tracks): the native Save window,
   * as Electron showed, then "download:done" for the page's "Saved …" toast. */
  async function saveDownload(href, name) {
    try {
      const bytes = new Uint8Array(await (await fetch(href)).arrayBuffer());
      const res = await sendBytes("save_download", bytes, { name: name || "download" });
      window.__vmShell.emit("download:done", res);
    } catch (e) {
      console.error("download failed", e);
      window.__vmShell.emit("download:done", { state: "interrupted", filename: name || "download", path: "" });
    }
  }
  const isLocalDownload = (a) => a instanceof HTMLAnchorElement && a.hasAttribute("download") && /^(blob|data):/i.test(a.href);
  const nameOf = (a) => a.getAttribute("download") || decodeURIComponent((a.href.split("/").pop() || "").split(/[?#]/)[0]) || "download";
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (isLocalDownload(this)) { void saveDownload(this.href, nameOf(this)); return; }
    return click.call(this);
  };
  document.addEventListener("click", (e) => {
    const a = e.target?.closest?.("a");
    if (a && isLocalDownload(a)) { e.preventDefault(); void saveDownload(a.href, nameOf(a)); }
  }, true);

  /* Menu shortcuts (the Electron app's File menu): New worksheet, Print; F11 full screen. */
  window.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && !e.shiftKey && !e.altKey && k === "n") { e.preventDefault(); window.__vmShell.emit("menu", "new"); }
    else if (mod && !e.shiftKey && !e.altKey && k === "p") { e.preventDefault(); window.__vmShell.emit("menu", "print"); }
    else if (e.key === "F11" && !mod && !e.altKey) { e.preventDefault(); void invoke("toggle_fullscreen"); }
  }, true);
})();
