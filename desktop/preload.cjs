/* Vocab Master — preload script (CommonJS: sandboxed preloads can't be ESM).
 * Exposes a minimal, typed `window.desktop` bridge to the sandboxed renderer.
 * No Node.js APIs leak into the page beyond this surface.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  /** POST to api.deepseek.com via main process. Returns { status, body }. */
  chat: (payload) => ipcRenderer.invoke("deepseek:chat", payload),

  /** GET /user/balance with the given key (key check in Settings). Returns { status, body }. */
  balance: (apiKey) => ipcRenderer.invoke("deepseek:balance", { apiKey }),

  /** Build a .docx in the main process. Returns { ok, base64 } | { ok:false, error }. */
  exportDocx: (payload) => ipcRenderer.invoke("docx:export", payload),

  /** Build a .docx and save it via a native Save dialog. Returns { ok, path } | { ok:false, canceled|error }. */
  saveDocx: (payload) => ipcRenderer.invoke("docx:save", payload),

  /** Open a saved file, or reveal it in Explorer. */
  openPath: (filePath) => ipcRenderer.invoke("shell:openPath", filePath),
  showItemInFolder: (filePath) => ipcRenderer.invoke("shell:showItem", filePath),

  /** Render HTML to a PDF file. Returns { ok, path } | { ok:false, canceled|error }. */
  exportPdf: (payload) => ipcRenderer.invoke("pdf:export", payload),

  /** Export full unit pack (3 .docx + 3 .pdf files) into a folder. */
  exportPack: (payload) => ipcRenderer.invoke("pack:export", payload),

  /** JSON file storage (replaces localStorage persistence). */
  storage: {
    getAll: () => ipcRenderer.invoke("storage:getAll"),
    set: (key, value) => ipcRenderer.invoke("storage:set", { key, value }),
    remove: (key) => ipcRenderer.invoke("storage:remove", { key }),
  },

  /** Encrypted API key storage (safeStorage when available). */
  keychain: {
    get: (name) => ipcRenderer.invoke("keychain:get", { name }),
    set: (value, name) => ipcRenderer.invoke("keychain:set", { value, name }),
  },

  /** Google Gemini API (v1beta generateContent / model list). Returns { status, body }. */
  gemini: (payload) => ipcRenderer.invoke("gemini:request", payload),

  /** App metadata + folder helpers. */
  info: () => ipcRenderer.invoke("app:info"),
  openDataFolder: () => ipcRenderer.invoke("shell:openDataFolder"),

  /** Menu events from the main process. */
  onMenu: (callback) => {
    ipcRenderer.on("menu:new", () => callback("new"));
    ipcRenderer.on("menu:print", () => callback("print"));
  },

  /** Native save-dialog result for anchor-triggered downloads. */
  onDownloadDone: (callback) => {
    ipcRenderer.on("download:done", (_e, payload) => callback(payload));
  },
});
