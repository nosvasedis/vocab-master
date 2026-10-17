/* Vocab Master — platform bridge.
 * In the Electron app, window.desktop (preload) provides file storage, the encrypted
 * key-chain, DeepSeek proxying and native exports. In the browser (node proxy.js)
 * everything falls back to localStorage + same-origin HTTP endpoints.
 * The engine (app.js) only knows fetch() and localStorage, so both are patched here.
 */
import { STORAGE_KEY } from "../app.js";

export const API_KEY_KEY = STORAGE_KEY;
export const desktop = () => (typeof window.desktop !== "undefined" ? window.desktop : null);
export const realFetch = window.fetch.bind(window);

/* fetch → IPC for the DeepSeek proxy and the DOCX builder */
window.fetch = async (url, options = {}) => {
  const u = String(url);
  const d = desktop();
  if (d && u.endsWith("/chat/completions")) {
    const res = await d.chat({
      body: typeof options.body === "string" ? options.body : JSON.stringify(options.body || {}),
      auth: (options.headers || {}).Authorization || "",
    });
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      json: async () => JSON.parse(res.body),
      text: async () => res.body,
    };
  }
  if (d && u.endsWith("/export/docx")) {
    const { type, data } = JSON.parse(options.body || "{}");
    const res = await d.exportDocx({ type, data });
    if (!res.ok) return { ok: false, status: 500, text: async () => res.error || "Export failed" };
    const bin = atob(res.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    return { ok: true, status: 200, blob: async () => blob, text: async () => "" };
  }
  return realFetch(url, options);
};

/* localStorage → userData JSON files + encrypted key-chain (desktop only) */
let hydrating = false;
let apiKeyInMemory = null;
(function patchStorage() {
  const d = desktop();
  if (!d) return;
  const origGet = Storage.prototype.getItem;
  const origSet = Storage.prototype.setItem;
  const origRemove = Storage.prototype.removeItem;
  try { origRemove.call(localStorage, API_KEY_KEY); } catch { /* ignore */ }
  Storage.prototype.getItem = function (key) {
    if (key === API_KEY_KEY) return apiKeyInMemory;
    return origGet.call(this, key);
  };
  Storage.prototype.setItem = function (key, value) {
    if (key === API_KEY_KEY) {
      apiKeyInMemory = String(value) || null;
      if (!hydrating) d.keychain.set(String(value));
      return;
    }
    origSet.call(this, key, value);
    if (!hydrating) d.storage.set(key, String(value));
  };
  Storage.prototype.removeItem = function (key) {
    if (key === API_KEY_KEY) {
      apiKeyInMemory = null;
      if (!hydrating) d.keychain.set("");
      return;
    }
    origRemove.call(this, key);
    if (!hydrating) d.storage.remove(key);
  };
})();

export async function hydrateStorage() {
  const d = desktop();
  if (!d) return;
  hydrating = true;
  try {
    const all = await d.storage.getAll();
    for (const [k, v] of Object.entries(all || {})) {
      if (k === API_KEY_KEY) continue;
      try { localStorage.setItem(k, v); } catch { /* ignore */ }
    }
    const key = await d.keychain.get();
    if (key) apiKeyInMemory = key;
  } catch (err) {
    console.error("hydrate failed", err);
  } finally {
    hydrating = false;
  }
}

export function getApiKey() {
  try { return (localStorage.getItem(API_KEY_KEY) || "").trim(); } catch { return ""; }
}

export function setApiKey(value) {
  const v = String(value || "").trim();
  try {
    if (v) localStorage.setItem(API_KEY_KEY, v);
    else localStorage.removeItem(API_KEY_KEY);
  } catch { /* ignore */ }
}

export function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

/** Check a DeepSeek key. Returns { status, body }. */
export async function checkApiKey(key) {
  const d = desktop();
  if (d?.balance) return d.balance(key);
  const r = await realFetch("/user/balance", { headers: { Authorization: `Bearer ${key}` } });
  return { status: r.status, body: await r.text() };
}
