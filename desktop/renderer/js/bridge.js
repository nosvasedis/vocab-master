/* Vocab Master — platform bridge.
 * In the Electron app, window.desktop (preload) provides file storage, the encrypted
 * key-chain, AI proxying (DeepSeek + Google Gemini) and native exports. In the browser
 * (node proxy.js) everything falls back to localStorage + same-origin HTTP endpoints.
 * The engine (app.js) only knows fetch() and localStorage, so both are patched here.
 */
import { STORAGE_KEY, configureAi } from "../app.js";

export const API_KEY_KEY = STORAGE_KEY;
export const GEMINI_KEY_KEY = "vm_gemini_api_key";
const PROVIDER_KEY = "vm_ai_provider";
// localStorage key → desktop key-chain slot. Keys never land in the plain JSON store.
const SECRET_KEYS = { [API_KEY_KEY]: "deepseek", [GEMINI_KEY_KEY]: "gemini" };

export const desktop = () => (typeof window.desktop !== "undefined" ? window.desktop : null);
export const realFetch = window.fetch.bind(window);

let chatgptSession = { profiles: [], accountId: "", connected: false, sharing: false, ready: false, models: [], model: "", pending: false };
export const getChatGPT = () => chatgptSession;
export async function chatgptAction(action, payload) {
  const d = desktop();
  const res = d?.chatgpt ? await d.chatgpt(action, payload) : await realFetch("/chatgpt/action", {
    method: "POST", headers: { "Content-Type": "application/json", "X-Vocab-ChatGPT": "1" }, body: JSON.stringify({ action, payload }),
  }).then((r) => { if (!r.ok) throw new Error("ChatGPT connection is unavailable. Restart Vocab Master and try again."); return r.json(); });
  if (!res.ok) {
    if (action !== "status" && /session_expired|invalid_grant|invalid_token|invalid_identity|unauthorized|sharing.*disabled|sharing_not_enabled/.test(res.code || "")) {
      chatgptSession = { ...chatgptSession, ready: false, sharing: false };
      window.dispatchEvent(new Event("chatgpt-state"));
      // Ask the host what's really left (an expired session is signed out there, not "permission needed").
      void chatgptAction("status").catch(() => {});
    }
    throw Object.assign(new Error(res.error || "ChatGPT request failed."), { code: res.code });
  }
  if (action !== "generate") {
    chatgptSession = res.value;
    window.dispatchEvent(new Event("chatgpt-state"));
  }
  return { ...res, value: res.value };
}
export async function refreshChatGPT({ models = false } = {}) {
  await chatgptAction("status");
  if (models && chatgptSession.sharing) await chatgptAction("models");
  return chatgptSession;
}
/**
 * ChatGPT is ready once the plan is shared and a model is chosen. The host only knows the model list after asking ChatGPT
 * (it forgets it on restart, and asking needs the internet), so an unknown list doesn't count against the saved model:
 * a generation loads the list first and says clearly if the model has gone.
 */
export const chatgptReady = (s = chatgptSession) => !!s.sharing && !!s.model && (!s.models?.length || s.models.some((m) => m.slug === s.model));
export const isAiReady = () => getProvider() === "chatgpt" ? chatgptReady() : !!getApiKey();
export const chatgptUsageLimited = (error) => getProvider() === "chatgpt" && /usage limit|sharing_usage/.test(error?.message || String(error || ""));
export async function manageChatGPTUsage() {
  if (desktop()?.chatgpt) return chatgptAction("usage");
  window.open("https://chatgpt.com/settings/usage", "_blank", "noopener");
}
configureAi({ chatgpt: async (payload) => (await chatgptAction("generate", payload)).value });

const ipcResponse = (res) => ({
  ok: res.status >= 200 && res.status < 300,
  status: res.status,
  json: async () => JSON.parse(res.body),
  text: async () => res.body,
});

/* fetch → IPC for the AI services and the DOCX builder */
window.fetch = async (url, options = {}) => {
  const u = String(url);
  const d = desktop();
  const headers = options.headers || {};
  const body = typeof options.body === "string" ? options.body : options.body ? JSON.stringify(options.body) : null;
  if (d && u.endsWith("/chat/completions")) {
    return ipcResponse(await d.chat({ body: body || "{}", auth: headers.Authorization || "" }));
  }
  if (d && u.includes("/gemini/")) {
    const path = u.slice(u.indexOf("/gemini/") + "/gemini".length).split("?")[0];
    return ipcResponse(await d.gemini({ method: options.method || "GET", path, apiKey: headers["x-goog-api-key"] || "", body }));
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
const secretsInMemory = {};
(function patchStorage() {
  const d = desktop();
  if (!d) return;
  const origGet = Storage.prototype.getItem;
  const origSet = Storage.prototype.setItem;
  const origRemove = Storage.prototype.removeItem;
  for (const k of Object.keys(SECRET_KEYS)) {
    try { origRemove.call(localStorage, k); } catch { /* ignore */ }
  }
  Storage.prototype.getItem = function (key) {
    if (SECRET_KEYS[key]) return secretsInMemory[key] ?? null;
    return origGet.call(this, key);
  };
  Storage.prototype.setItem = function (key, value) {
    if (SECRET_KEYS[key]) {
      secretsInMemory[key] = String(value) || null;
      if (!hydrating) d.keychain.set(String(value), SECRET_KEYS[key]);
      return;
    }
    origSet.call(this, key, value);
    if (!hydrating) d.storage.set(key, String(value));
  };
  Storage.prototype.removeItem = function (key) {
    if (SECRET_KEYS[key]) {
      secretsInMemory[key] = null;
      if (!hydrating) d.keychain.set("", SECRET_KEYS[key]);
      return;
    }
    origRemove.call(this, key);
    if (!hydrating) d.storage.remove(key);
  };
})();

export async function hydrateStorage() {
  const d = desktop();
  if (d) {
    hydrating = true;
    try {
      const all = await d.storage.getAll();
      for (const [k, v] of Object.entries(all || {})) {
        if (SECRET_KEYS[k]) continue;
        try { localStorage.setItem(k, v); } catch { /* ignore */ }
      }
      for (const [k, slot] of Object.entries(SECRET_KEYS)) {
        const value = await d.keychain.get(slot);
        if (value) secretsInMemory[k] = value;
      }
    } catch (err) {
      console.error("hydrate failed", err);
    } finally {
      hydrating = false;
    }
  }
  await applyProvider();
}

/**
 * Tell the engine which AI service is chosen (at start, and when another computer changes it through sync).
 * For ChatGPT the local connection state is read at once (no network); the model list loads in the background,
 * because network discovery must never hold up opening saved units when offline.
 */
export async function applyProvider() {
  configureAi({ provider: getProvider() });
  if (getProvider() !== "chatgpt") return;
  try {
    await Promise.race([chatgptAction("status"), new Promise((r) => setTimeout(r, 2000))]);
  } catch { /* stays "not connected" */ }
  if (chatgptSession.sharing) void chatgptAction("models").catch(() => {});
}

/* ── AI provider & keys ──────────────────────────────────────────── */
export const PROVIDERS = {
  deepseek: { id: "deepseek", name: "DeepSeek", storageKey: API_KEY_KEY, placeholder: "sk-…", keyUrl: "https://platform.deepseek.com/api_keys", keyHost: "platform.deepseek.com" },
  gemini: { id: "gemini", name: "Google Gemini", storageKey: GEMINI_KEY_KEY, placeholder: "AIza…", keyUrl: "https://aistudio.google.com/apikey", keyHost: "aistudio.google.com" },
  chatgpt: { id: "chatgpt", name: "ChatGPT" },
};

export function getProvider() {
  try {
    const p = localStorage.getItem(PROVIDER_KEY);
    return PROVIDERS[p] ? p : "deepseek";
  } catch {
    return "deepseek";
  }
}

export function setProvider(id) {
  if (!PROVIDERS[id]) return;
  try { localStorage.setItem(PROVIDER_KEY, id); } catch { /* ignore */ }
  configureAi({ provider: id });
}

export function getApiKey(provider = getProvider()) {
  if (provider === "chatgpt") return "";
  try { return (localStorage.getItem(PROVIDERS[provider].storageKey) || "").trim(); } catch { return ""; }
}

export function setApiKey(value, provider = getProvider()) {
  if (provider === "chatgpt") return;
  const v = String(value || "").trim();
  const key = PROVIDERS[provider].storageKey;
  try {
    if (v) localStorage.setItem(key, v);
    else localStorage.removeItem(key);
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

/**
 * Check a key with its provider. Returns { ok, tone, message } ready for the Settings dialog.
 * DeepSeek: account balance. Gemini: list models (free, no quota used).
 */
export async function checkApiKey(key, provider = getProvider()) {
  const d = desktop();
  if (provider === "gemini") {
    const res = d?.gemini
      ? await d.gemini({ method: "GET", path: "/v1beta/models", apiKey: key })
      : await realFetch("/gemini/v1beta/models", { headers: { "x-goog-api-key": key } }).then(async (r) => ({ status: r.status, body: await r.text() }));
    if (res.status === 200) return { ok: true, tone: "ok", message: "The key works — Gemini is ready (free tier)." };
    if (res.status === 400 || res.status === 401 || res.status === 403) return { ok: false, tone: "error", message: "Google rejected this key — copy it again from Google AI Studio." };
    if (res.status === 429) return { ok: true, tone: "warn", message: "The key works, but the free quota is used up for now — try again later." };
    if (res.status === 502) return { ok: false, tone: "error", message: "Couldn't reach Google — check your internet connection." };
    return { ok: false, tone: "error", message: `Google answered with an error (${res.status}).` };
  }
  const res = d?.balance
    ? await d.balance(key)
    : await realFetch("/user/balance", { headers: { Authorization: `Bearer ${key}` } }).then(async (r) => ({ status: r.status, body: await r.text() }));
  if (res.status === 200) {
    const body = JSON.parse(res.body || "{}");
    const info = (body.balance_infos || [])[0];
    const bal = info ? ` Balance: ${info.total_balance} ${info.currency}.` : "";
    return body.is_available === false
      ? { ok: true, tone: "warn", message: `The key works, but the balance is empty — top up to generate.${bal}` }
      : { ok: true, tone: "ok", message: `The key works.${bal}` };
  }
  if (res.status === 401) return { ok: false, tone: "error", message: "DeepSeek rejected this key — check you copied all of it." };
  if (res.status === 502) return { ok: false, tone: "error", message: "Couldn't reach DeepSeek — check your internet connection." };
  return { ok: false, tone: "error", message: `DeepSeek answered with an error (${res.status}).` };
}
