/* ChatGPT plan usage for local apps. OAuth and tokens stay in the host process.
 * Protocol: https://developers.openai.com/siwc/token-sharing-open-source
 * No API key, private ChatGPT endpoints, or access to other apps' credentials.
 */
import http from "node:http";
import { randomBytes, randomUUID, createHash, createPublicKey, verify, timingSafeEqual } from "node:crypto";

const ISSUER = "https://auth.openai.com";
const RESOURCE = "https://api.openai.com/v1";
const PLAN_SCOPE = "chatgpt.tokens.use.direct";
export const CHATGPT_USAGE_URL = "https://chatgpt.com/settings/usage";
const scopes = (s) => String(s || "").split(/\s+/).filter(Boolean);
const same = (a, b) => typeof a === "string" && typeof b === "string" && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const fail = (message, code = "chatgpt_error") => Object.assign(new Error(message), { code });

export function chatgptError(error) {
  const code = error?.code || "chatgpt_error";
  if (/usage_limit|sharing_usage_unavailable/.test(code)) return "ChatGPT usage limit reached. Open Manage usage in Settings to review your plan or this app's limit.";
  if (/sharing.*(disabled|not_enabled)|insufficient_scope|sharing_permission/.test(code)) return "ChatGPT plan usage is not enabled. Reconnect in Settings and allow this app to use your plan.";
  if (/invalid_grant|invalid_token|session_expired|unauthorized/.test(code)) return "Your ChatGPT session has expired. Reconnect in Settings.";
  if (/unsupported_capability|model_not_found|model_not_available/.test(code)) return "This ChatGPT model or feature is unavailable. Refresh the models and choose another in Settings.";
  return error?.message || "Couldn't reach ChatGPT. Check your connection and try again.";
}

function responseError(res, data) {
  const error = data?.error;
  const code = error?.code || data?.code || (typeof error === "string" ? error : res.status === 401 ? "unauthorized" : "chatgpt_error");
  const detail = error?.message || (typeof data?.detail === "string" ? data.detail : "");
  const message = detail || `ChatGPT rejected the request (HTTP ${res.status}). Please try again.`;
  return Object.assign(fail(chatgptError({ code, message }), code), {
    status: res.status, param: error?.param || "", requestId: res.headers.get("x-request-id") || "",
  });
}

/** Parse SSE across arbitrary UTF-8/chunk boundaries; partial output is never success. */
export async function completedText(body) {
  if (!body) throw fail("ChatGPT returned an empty stream.");
  const decoder = new TextDecoder();
  let buffer = "", text = "", completed = false, total = 0;
  function event(frame) {
    const raw = frame.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
    if (!raw || raw === "[DONE]") return;
    let e;
    try { e = JSON.parse(raw); } catch { throw fail("ChatGPT sent an unreadable response. Please try again."); }
    if (e.type === "response.failed" || e.type === "error") {
      const err = e.response?.error || e.error || e;
      throw fail(chatgptError({ code: err.code, message: err.message }), err.code);
    }
    if (e.type === "response.incomplete") throw fail("ChatGPT's reply was incomplete. Try fewer words or exercises.");
    if (e.type === "response.refusal.delta" || e.type === "response.refusal.done") throw fail("ChatGPT could not complete this request. Review your word list and try again.");
    if (e.type === "response.output_text.delta") text += e.delta || "";
    if (e.type === "response.completed") {
      if (e.response?.status && e.response.status !== "completed") throw fail("ChatGPT's reply was incomplete.");
      const final = (e.response?.output || []).flatMap((o) => o.content || []).filter((c) => c.type === "output_text").map((c) => c.text || "").join("");
      if ((e.response?.output || []).some((o) => (o.content || []).some((c) => c.type === "refusal"))) throw fail("ChatGPT could not complete this request.");
      if (final) text = final;
      completed = true;
    }
  }
  for await (const chunk of body) {
    total += chunk.length;
    if (total > 12 * 1024 * 1024) throw fail("ChatGPT's reply was too large. Try fewer exercises.");
    buffer += decoder.decode(chunk, { stream: true });
    buffer = buffer.replace(/\r\n/g, "\n");
    let i;
    while ((i = buffer.indexOf("\n\n")) !== -1) {
      event(buffer.slice(0, i));
      buffer = buffer.slice(i + 2);
      if (completed) break;
    }
    if (completed) break;
  }
  if (!completed) {
    buffer += decoder.decode();
    if (buffer.trim()) event(buffer);
  }
  if (!completed) throw fail("ChatGPT's connection ended before the reply completed. Please try again.");
  if (!text.trim()) throw fail("ChatGPT returned no text. Please try again.");
  return text;
}

/** Storage adapters must throw on write failure and protect every credential. */
export function createChatGPT({ readState, writeState, fetchImpl = globalThis.fetch, now = Date.now, loginTimeoutMs = 300_000, requestTimeoutMs = 240_000 }) {
  let state = readState() || { profiles: [] };
  state.profiles ||= [];
  let pending = null, lastError = "", epoch = 0, jwks = null, discovery = null;
  const requests = new Set(), refreshing = new Map(), catalogs = new Map(), finishes = new WeakMap();
  const active = () => state.profiles.find((p) => p.id === state.activeId);
  const save = () => {
    try { writeState(structuredClone(state)); }
    catch { state = readState() || { profiles: [] }; throw fail("Couldn't save your ChatGPT connection securely. Check available disk space and reconnect."); }
  };
  const sharing = (p) => !!p?.accessToken && p.scopes?.includes(PLAN_SCOPE);
  function status() {
    const p = active(), models = catalogs.get(p?.id) || [];
    return {
      profiles: state.profiles.map((a, i) => ({ id: a.id, label: `Connection ${i + 1}`, email: a.email || "", connected: !!a.accessToken, sharing: sharing(a) })),
      accountId: p?.id || "", connected: !!p?.accessToken, sharing: sharing(p),
      model: p?.model || "", models, ready: sharing(p) && models.some((m) => m.slug === p.model),
      pending: !!pending, error: lastError, welcome: !!p?.welcome,
    };
  }
  async function fetchSafe(url, options = {}) {
    const controller = new AbortController();
    requests.add(controller);
    const timer = setTimeout(() => controller.abort(), url.endsWith("/responses") ? requestTimeoutMs : Math.min(requestTimeoutMs, 20_000));
    const finish = () => { clearTimeout(timer); requests.delete(controller); };
    try {
      const response = await fetchImpl(url, { ...options, redirect: "error", signal: controller.signal });
      finishes.set(response, finish);
      return response;
    } catch (e) { finish(); throw fail(e.name === "AbortError" ? "ChatGPT request canceled or timed out. Please try again." : "Couldn't reach ChatGPT. Check your connection and try again."); }
  }
  async function jsonRequest(url, options) {
    const res = await fetchSafe(url, options);
    let data;
    try { data = await res.json(); } catch { throw fail("ChatGPT sent an unreadable response."); }
    finally { finishes.get(res)?.(); }
    if (!res.ok) throw responseError(res, data);
    return data;
  }
  async function config() {
    if (!discovery) {
      const d = await jsonRequest(`${ISSUER}/.well-known/openid-configuration`);
      if (d.issuer !== ISSUER) throw fail("ChatGPT's sign-in configuration could not be verified.");
      for (const key of ["jwks_uri", "revocation_endpoint"]) {
        if (!d[key] || new URL(d[key]).origin !== ISSUER) throw fail("ChatGPT's sign-in configuration could not be verified.");
      }
      discovery = d;
    }
    return discovery;
  }
  async function identity(token, clientId, nonce) {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) throw new Error();
      const header = JSON.parse(Buffer.from(parts[0], "base64url"));
      const claims = JSON.parse(Buffer.from(parts[1], "base64url"));
      if (!["RS256", "ES256"].includes(header.alg) || !header.kid || header.crit) throw new Error();
      const d = await config();
      if (!jwks || jwks.until < now() || !jwks.keys.some((k) => k.kid === header.kid)) {
        const data = await jsonRequest(d.jwks_uri);
        jwks = { keys: data.keys || [], until: now() + 3_600_000 };
      }
      const key = jwks.keys.find((k) => k.kid === header.kid && (!k.alg || k.alg === header.alg) && (!k.use || k.use === "sig") && (header.alg === "RS256" ? k.kty === "RSA" : k.kty === "EC" && k.crv === "P-256"));
      if (!key) throw new Error();
      const publicKey = createPublicKey({ key, format: "jwk" });
      if (!verify("sha256", Buffer.from(`${parts[0]}.${parts[1]}`), header.alg === "ES256" ? { key: publicKey, dsaEncoding: "ieee-p1363" } : publicKey, Buffer.from(parts[2], "base64url"))) throw new Error();
      const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (claims.iss !== ISSUER || !aud.includes(clientId) || (aud.length > 1 && claims.azp !== clientId) || (claims.azp && claims.azp !== clientId) || typeof claims.sub !== "string" || !claims.sub || !Number.isFinite(claims.exp) || claims.exp <= now() / 1000 || (claims.nbf && claims.nbf > now() / 1000 + 60) || (nonce && !same(claims.nonce, nonce))) throw new Error();
      return claims;
    } catch { throw fail("ChatGPT's sign-in identity could not be verified. Please reconnect.", "invalid_identity"); }
  }
  function tokenFields(data, previous = {}) {
    if (typeof data.access_token !== "string" || !data.access_token || String(data.token_type).toLowerCase() !== "bearer" || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw fail("ChatGPT did not return a valid session. Please reconnect.");
    return {
      accessToken: data.access_token, refreshToken: data.refresh_token || previous.refreshToken || "",
      idToken: data.id_token || previous.idToken || "", expiresAt: now() + data.expires_in * 1000,
      scopes: data.scope === undefined ? previous.scopes || [] : scopes(data.scope),
    };
  }
  function invalidate() {
    epoch++;
    for (const c of requests) c.abort();
    cancelSignIn();
  }
  function cancelSignIn() {
    if (!pending) return;
    clearTimeout(pending.timer);
    pending.server.close();
    pending = null;
  }
  async function startSignIn(profileId = "") {
    if (pending) throw fail("A ChatGPT sign-in is already open. Finish it or cancel it first.");
    lastError = "";
    const existing = profileId ? state.profiles.find((p) => p.id === profileId) : null;
    if (profileId && !existing) throw fail("Choose a saved ChatGPT account or add a new account.");
    if (!state.hostId) { state.hostId = `urn:uuid:${randomUUID()}`; save(); }
    const p = existing || { id: randomUUID(), clientId: "", model: "" };
    const tx = { p, state: randomBytes(32).toString("base64url"), nonce: randomBytes(32).toString("base64url"), verifier: randomBytes(64).toString("base64url"), epoch };
    const server = http.createServer(async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
      res.setHeader("Referrer-Policy", "no-referrer");
      const reply = (code, message) => { res.writeHead(code, { "Content-Type": "text/html; charset=utf-8" }); res.end(`<!doctype html><meta charset="utf-8"><title>Vocab Master · ChatGPT</title><body style="font:18px system-ui;max-width:600px;margin:15vh auto;padding:24px"><h1>Vocab Master</h1><p>${message}</p><p>You can close this tab and return to Vocab Master.</p></body>`); };
      let url;
      try { url = new URL(req.url, tx.redirectUri); }
      catch { reply(400, "This sign-in response is not valid."); return; }
      if (req.method !== "GET" || req.headers.host !== new URL(tx.redirectUri).host || url.pathname !== "/auth/chatgpt/callback") { reply(404, "Page not found."); return; }
      if (url.searchParams.getAll("state").length !== 1 || !same(url.searchParams.get("state"), tx.state)) { reply(400, "This sign-in response is not valid. Return to the original sign-in tab."); return; }
      if (pending !== tx || tx.consumed) { reply(409, "This sign-in has already finished or was canceled."); return; }
      tx.consumed = true;
      try {
        if (url.searchParams.has("error")) throw fail("ChatGPT sign-in was declined or canceled. You can try again in Settings.");
        const code = url.searchParams.get("code");
        const clientId = url.searchParams.get("client_id") || p.clientId;
        if (url.searchParams.getAll("code").length !== 1 || url.searchParams.getAll("client_id").length > 1 || !code || !/^oaiapp_[\w-]+$/.test(clientId || "") || (p.clientId && p.clientId !== clientId)) throw fail("ChatGPT did not return a valid registration. Please try again.");
        // Preserve a new issued registration even if the subsequent exchange fails.
        if (!existing) state.profiles.push(p);
        p.clientId = clientId;
        save();
        const data = await jsonRequest(`${ISSUER}/api/accounts/oauth/token`, {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: tx.verifier, redirect_uri: tx.redirectUri, resource: RESOURCE }).toString(),
        });
        if (!data.id_token) throw fail("ChatGPT did not return a verified identity.");
        const claims = await identity(data.id_token, clientId, tx.nonce);
        if (existing?.sub && existing.sub !== claims.sub) throw fail("This sign-in belongs to another account. Use Add account instead.");
        const tokens = tokenFields(data);
        if (pending !== tx || epoch !== tx.epoch) throw fail("ChatGPT sign-in was canceled.");
        Object.assign(p, tokens, { sub: claims.sub, email: typeof claims.email === "string" ? claims.email : "", welcome: sharing(tokens) && !p.welcomed });
        state.activeId = p.id;
        save();
        reply(200, sharing(p) ? "You're connected to ChatGPT. Choose your model in Vocab Master Settings." : "You're signed in. Allow ChatGPT plan usage in Vocab Master Settings to enable AI requests.");
      } catch (e) { lastError = chatgptError(e); reply(400, "Sign-in could not be completed. See Vocab Master Settings for details."); }
      finally { if (pending === tx) cancelSignIn(); }
    });
    tx.server = server;
    pending = tx;
    try {
      await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
      tx.redirectUri = `http://127.0.0.1:${server.address().port}/auth/chatgpt/callback`;
      tx.timer = setTimeout(() => { if (pending === tx) { lastError = "ChatGPT sign-in timed out. Please try again."; cancelSignIn(); } }, loginTimeoutMs);
      const params = new URLSearchParams({ client_id: p.clientId || "dynamic_agent_client", ext_agent_host_id: state.hostId, response_type: "code", redirect_uri: tx.redirectUri, scope: `openid profile email offline_access resource.invoke ${PLAN_SCOPE}`, resource: RESOURCE, state: tx.state, nonce: tx.nonce, code_challenge_method: "S256", code_challenge: createHash("sha256").update(tx.verifier).digest("base64url") });
      if (!p.clientId) params.set("agent_name_hint", "Vocab Master");
      else if (p.idToken) { params.set("id_token_hint", p.idToken); if (p.email) params.set("login_hint", p.email); }
      return `${ISSUER}/api/accounts/authorize?${params}`;
    } catch (e) { cancelSignIn(); throw fail("Couldn't open the local ChatGPT sign-in listener. Please try again."); }
  }
  async function access(p, force = false) {
    if (!p?.accessToken) throw fail("Connect your ChatGPT account in Settings.", "session_expired");
    if (!force && p.expiresAt > now() + 60_000) return p.accessToken;
    if (!p.refreshToken) throw fail("Reconnect your ChatGPT account in Settings.", "session_expired");
    if (!refreshing.has(p.id)) {
      const version = epoch;
      const task = (async () => {
        try {
          const data = await jsonRequest(`${ISSUER}/api/accounts/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", client_id: p.clientId, refresh_token: p.refreshToken, resource: RESOURCE }).toString() });
          if (data.id_token) { const claims = await identity(data.id_token, p.clientId); if (claims.sub !== p.sub) throw fail("ChatGPT's refreshed identity did not match. Please reconnect.", "invalid_identity"); }
          if (version !== epoch) throw fail("ChatGPT account changed. Please try again.");
          Object.assign(p, tokenFields(data, p));
          save();
          return p.accessToken;
        } catch (e) {
          if (["invalid_grant", "invalid_identity", "invalid_token"].includes(e.code) && version === epoch) { clearTokens(p); save(); }
          throw e;
        }
      })().finally(() => refreshing.delete(p.id));
      refreshing.set(p.id, task);
    }
    return refreshing.get(p.id);
  }
  async function authorized(p, url, options = {}) {
    const version = epoch;
    if (!sharing(p)) throw fail("Reconnect in Settings and allow ChatGPT plan usage.", "sharing_not_enabled");
    let token = await access(p);
    if (version !== epoch || !sharing(p)) throw fail("Reconnect in Settings and allow ChatGPT plan usage.", "sharing_not_enabled");
    let res = await fetchSafe(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` } });
    if (res.status === 401) {
      await res.body?.cancel();
      finishes.get(res)?.();
      token = await access(p, true);
      if (version !== epoch || !sharing(p)) throw fail("Reconnect in Settings and allow ChatGPT plan usage.", "sharing_not_enabled");
      res = await fetchSafe(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` } });
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      finishes.get(res)?.();
      throw responseError(res, data);
    }
    return res;
  }
  async function listModels() {
    const p = active(), version = epoch;
    const res = await authorized(p, `${RESOURCE}/models`);
    let data;
    try { data = await res.json(); } finally { finishes.get(res)?.(); }
    const models = (data.models || []).filter((m) => m.visibility === "list" && typeof m.slug === "string" && typeof m.display_name === "string").map((m) => ({ slug: m.slug, name: m.display_name }));
    if (version !== epoch || p !== active()) throw fail("ChatGPT account changed. Refresh the models again.");
    catalogs.set(p.id, models);
    if (!p.model && models.length) { p.model = (models.find((m) => /luna/i.test(m.slug + " " + m.name)) || models[0]).slug; save(); }
    lastError = "";
    return status();
  }
  function selectModel(slug) {
    const p = active();
    if (!p || !catalogs.get(p.id)?.some((m) => m.slug === slug)) throw fail("Refresh the models and choose an available ChatGPT model.");
    p.model = slug;
    save();
    return status();
  }
  function selectAccount(id) {
    if (!state.profiles.some((p) => p.id === id)) throw fail("ChatGPT account not found.");
    invalidate(); state.activeId = id; lastError = ""; save(); return status();
  }
  function clearTokens(p) { for (const k of ["accessToken", "refreshToken", "idToken", "expiresAt", "scopes", "welcome"]) delete p[k]; catalogs.delete(p.id); }
  async function signOut() {
    const p = active();
    invalidate();
    if (!p) return status();
    const token = p.refreshToken, clientId = p.clientId;
    clearTokens(p); save(); lastError = "";
    if (token) {
      let revoked = false;
      for (let i = 0; i < 2 && !revoked; i++) {
        if (i) await new Promise((resolve) => setTimeout(resolve, 250));
        try {
          const d = await config();
          const res = await fetchSafe(d.revocation_endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token, token_type_hint: "refresh_token", client_id: clientId }).toString() });
          revoked = res.status === 200;
          await res.body?.cancel();
          finishes.get(res)?.();
        } catch { /* Local sign-out succeeds even when offline. */ }
      }
      if (!revoked) lastError = "Signed out on this device. Remote sign-out could not be confirmed; disconnect Vocab Master in ChatGPT Settings → Usage.";
    }
    return status();
  }
  async function generate({ systemPrompt, userPrompt, retryHint = "" }) {
    if (typeof systemPrompt !== "string" || typeof userPrompt !== "string" || typeof retryHint !== "string" || systemPrompt.length + userPrompt.length + retryHint.length > 600_000) throw fail("The ChatGPT request is invalid or too large.");
    const p = active(), version = epoch;
    if (!catalogs.has(p?.id)) await listModels();
    if (!status().ready) throw fail("Choose an available ChatGPT model in Settings. Your previous model may no longer be available.", "model_not_available");
    const res = await authorized(p, `${RESOURCE}/responses`, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      // JSON mode checks input messages; mentioning JSON only in instructions is insufficient.
      body: JSON.stringify({ model: p.model, instructions: `${systemPrompt}\nReturn only the requested valid JSON object. Do not include Markdown fences or commentary.`, input: [{ role: "user", content: userPrompt + (retryHint ? `\n\nFIX:\n${retryHint}` : "") + "\n\nReturn the result as a valid JSON object." }], text: { format: { type: "json_object" } }, store: false, stream: true }),
    });
    // Keep cancellation and timeout active through the completed stream, not just headers.
    const reader = res.body?.getReader();
    if (!reader) { finishes.get(res)?.(); throw fail("ChatGPT returned no response."); }
    const controller = { abort: () => { reader.cancel().catch(() => {}); } };
    requests.add(controller);
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const text = await completedText({ async *[Symbol.asyncIterator]() { while (true) { const { done, value } = await reader.read(); if (done) break; yield value; } } });
      if (version !== epoch || p !== active()) throw fail("ChatGPT account changed. Please try again.");
      try {
        const value = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
        return value;
      }
      catch { throw fail("ChatGPT's reply was not valid JSON. Please try again."); }
    } finally { clearTimeout(timer); requests.delete(controller); await reader.cancel().catch(() => {}); reader.releaseLock(); finishes.get(res)?.(); }
  }
  function acknowledge() { const p = active(); if (p) { p.welcome = false; p.welcomed = true; save(); } return status(); }
  return { status, startSignIn, cancelSignIn, listModels, selectModel, selectAccount, signOut, generate, acknowledge, close: invalidate };
}
