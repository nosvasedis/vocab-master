/**
 * Vocab Master — Local Web Server, DeepSeek CORS Proxy & DOCX Exporter.
 * Run: node proxy.js (or double-click start.bat)
 * Open: http://localhost:8787/
 */
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import os from "node:os";
import { randomBytes } from "node:crypto";
import { createChatGPT, chatgptError } from "./desktop/chatgpt.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8787;
const TARGET = "api.deepseek.com";
// One source of truth: the web version serves the same renderer as the desktop app.
const RENDERER_DIR = path.join(__dirname, "desktop", "renderer");
// desktop/package.json is the single source of the app version (web + desktop).
const APP_VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, "desktop", "package.json"), "utf8")).version;

// Browser edition: credentials live only in server memory. Only registration metadata
// persists, so the host ID/client IDs survive restart without writing plaintext tokens.
const chatgptFile = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), ".local", "share"), "Vocab Master Web", "chatgpt-registrations.json");
let chatgpt;
let chatgptBrowser = null;
function chatgptRuntime() {
  return chatgpt ||= createChatGPT({
    readState: () => fs.existsSync(chatgptFile) ? JSON.parse(fs.readFileSync(chatgptFile, "utf8")) : null,
    writeState(value) {
      const metadata = { hostId: value.hostId, activeId: value.activeId, profiles: value.profiles.map(({ id, clientId, sub, email, model, welcomed }) => ({ id, clientId, sub, email, model, welcomed })) };
      fs.mkdirSync(path.dirname(chatgptFile), { recursive: true });
      fs.writeFileSync(`${chatgptFile}.tmp`, JSON.stringify(metadata), { mode: 0o600 });
      fs.renameSync(`${chatgptFile}.tmp`, chatgptFile);
    },
  });
}

async function handleChatGPT(req, res, urlPath) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  const allowed = [`localhost:${PORT}`, `127.0.0.1:${PORT}`];
  const host = req.headers.host;
  const origin = req.headers.origin;
  if (!allowed.includes(host) || (origin && origin !== `http://${host}`)) { res.writeHead(403); res.end("Untrusted ChatGPT request."); return; }
  if (urlPath.startsWith("/chatgpt/browser/")) {
    const ticket = urlPath.slice("/chatgpt/browser/".length);
    if (req.method !== "GET" || !chatgptBrowser || chatgptBrowser.until < Date.now() || ticket !== chatgptBrowser.ticket) { res.writeHead(404); res.end("This sign-in link has expired. Return to Settings."); return; }
    const url = chatgptBrowser.url;
    chatgptBrowser = null;
    res.writeHead(302, { Location: url }); res.end(); return;
  }
  if (req.method !== "POST" || req.headers["x-vocab-chatgpt"] !== "1") { res.writeHead(403); res.end("Untrusted ChatGPT request."); return; }
  const reply = (value) => { res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(value)); };
  try {
    let body = "";
    for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 2_500_000) throw new Error("ChatGPT request is too large."); }
    const { action, payload } = JSON.parse(body);
    const runtime = chatgptRuntime();
    let value, browserPath;
    if (action === "status") value = runtime.status();
    else if (action === "signIn") {
      const url = await runtime.startSignIn(payload?.accountId || "");
      const ticket = randomBytes(32).toString("hex");
      chatgptBrowser = { url, ticket, until: Date.now() + 60_000 };
      browserPath = `/chatgpt/browser/${ticket}`;
      value = runtime.status();
    } else if (action === "cancel") { runtime.cancelSignIn(); chatgptBrowser = null; value = runtime.status(); }
    else if (action === "models") value = await runtime.listModels();
    else if (action === "model") value = runtime.selectModel(payload?.model);
    else if (action === "account") value = runtime.selectAccount(payload?.accountId);
    else if (action === "signOut") { chatgptBrowser = null; value = await runtime.signOut(); }
    else if (action === "acknowledge") value = runtime.acknowledge();
    else if (action === "generate") value = await runtime.generate(payload || {});
    else throw new Error("Unknown ChatGPT action.");
    reply({ ok: true, value, ...(browserPath ? { browserPath } : {}) });
  } catch (e) { reply({ ok: false, error: chatgptError(e), code: e.code || "chatgpt_error" }); }
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".zip": "application/zip",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/" || urlPath === "") urlPath = "/index.html";
  const rel = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]+/, "");

  const filePath = path.resolve(RENDERER_DIR, rel);
  let found = null;
  try {
    if (filePath.startsWith(RENDERER_DIR + path.sep) && fs.statSync(filePath).isFile()) found = filePath;
  } catch { /* not found */ }

  if (!found) {
    res.writeHead(404);
    return res.end("Not found");
  }

  fs.readFile(found, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("Not found");
    }
    const ext = path.extname(found).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(data);
  });
}

async function handleDocxExport(res, body) {
  try {
    const { type, data } = JSON.parse(body);
    const m = await import(pathToFileURL(path.join(RENDERER_DIR, "app.js")).href);
    let blob;
    if (type === "lingo") blob = await m.buildLingoDocx(data);
    else if (type === "dictation") blob = await m.buildDictationDocx(data);
    else if (type === "answer") blob = await m.buildAnswerKeyDocx(data);
    else if (type === "studio") blob = await m.buildStudioDocx(data);
    else {
      res.writeHead(400, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ error: "Invalid export type" }));
      return;
    }
    const buf = Buffer.from(await blob.arrayBuffer());
    res.writeHead(200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(buf);
  } catch (err) {
    console.error("DOCX export error:", err);
    res.writeHead(500, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ error: err.message || String(err) }));
  }
}

function proxyDeepSeek(req, res, method, apiPath, body) {
  const auth = req.headers.authorization || "";
  proxyApi(res, TARGET, method, apiPath, auth ? { Authorization: auth } : {}, body);
}

/** Google Gemini — only the v1beta model list and generateContent are forwarded. */
const GEMINI_HOST = "generativelanguage.googleapis.com";
function proxyGemini(req, res, method, apiPath, body) {
  if (!/^\/v1beta\/models(\/[\w.-]+:generateContent)?$/.test(apiPath)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: { message: "Unsupported Gemini path" } }));
  }
  const key = String(req.headers["x-goog-api-key"] || "");
  proxyApi(res, GEMINI_HOST, method, apiPath, key ? { "x-goog-api-key": key } : {}, body);
}

function proxyApi(res, hostname, method, apiPath, authHeaders, body) {
  const payload = body ? Buffer.from(body, "utf8") : null;
  const proxyReq = https.request(
    {
      hostname,
      path: apiPath,
      method,
      headers: {
        Accept: "application/json",
        ...(payload ? { "Content-Type": "application/json", "Content-Length": payload.length } : {}),
        ...authHeaders,
      },
    },
    (proxyRes) => {
      const chunks = [];
      proxyRes.on("data", (c) => chunks.push(c));
      proxyRes.on("end", () => {
        res.writeHead(proxyRes.statusCode || 200, {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(Buffer.concat(chunks));
      });
    }
  );
  proxyReq.on("error", (err) => {
    res.writeHead(502, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ error: err.message }));
  });
  if (payload) proxyReq.write(payload);
  proxyReq.end();
}

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split("?")[0];

  // Handle before the legacy wildcard CORS routes: no cross-origin access to accounts.
  if (urlPath.startsWith("/chatgpt/")) return handleChatGPT(req, res, urlPath);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-goog-api-key",
    });
    return res.end();
  }

  if (req.method === "POST" && urlPath === "/export/docx") {
    const body = await readBody(req);
    return handleDocxExport(res, body);
  }

  if (req.method === "POST" && urlPath === "/chat/completions") {
    const body = await readBody(req);
    return proxyDeepSeek(req, res, "POST", "/chat/completions", body);
  }

  if (urlPath.startsWith("/gemini/") && (req.method === "POST" || req.method === "GET")) {
    const body = req.method === "POST" ? await readBody(req) : null;
    return proxyGemini(req, res, req.method, urlPath.slice("/gemini".length), body);
  }

  if (req.method === "GET" && urlPath === "/app-info") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    return res.end(JSON.stringify({ version: APP_VERSION }));
  }

  if (req.method === "GET" && urlPath === "/user/balance") {
    return proxyDeepSeek(req, res, "GET", "/user/balance", null);
  }

  if (req.method === "GET") {
    return serveStatic(req, res);
  }

  res.writeHead(404, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log(`Port ${PORT} is already in use.`);
    console.log("Vocab Master is probably already running — open:");
    console.log(`  http://localhost:${PORT}/`);
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Vocab Master ${APP_VERSION}: http://localhost:${PORT}/`);
  console.log(`DeepSeek proxy:          http://localhost:${PORT}/chat/completions`);
  console.log(`DOCX export:             http://localhost:${PORT}/export/docx`);
  console.log("Press Ctrl+C to stop.");
});
