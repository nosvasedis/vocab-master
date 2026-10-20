import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { createChatGPT, completedText } from "../desktop/chatgpt.js";
import { configureAi, autofillVocabulary } from "../desktop/renderer/app.js";
import { testDefaults, testPrompt } from "../desktop/renderer/studio/test-builder.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test-key", use: "sig", alg: "RS256" };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const frame = (data) => `data: ${JSON.stringify(data)}\r\n\r\n`;
const finish = (text) => frame({ type: "response.completed", response: { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text }] }] } });
function jwt(claims, signingKey = privateKey) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "test-key" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${header}.${payload}.${sign("sha256", Buffer.from(`${header}.${payload}`), signingKey).toString("base64url")}`;
}
function harness(t) {
  const h = { saved: null, clock: Date.now(), calls: [], tokenCalls: 0, auth: null, models: [{ slug: "gpt-6.1-sol", display_name: "GPT 6.1 Sol", visibility: "list" }, { slug: "gpt-6-luna", display_name: "GPT 6 Luna", visibility: "list" }, { slug: "hidden", display_name: "Hidden", visibility: "hide" }], scope: "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct", reply: finish('{"ok":true}'), claimOverride: {} };
  const fetchImpl = async (url, options = {}) => {
    h.calls.push({ url, ...options });
    if (url.endsWith("openid-configuration")) return json({ issuer: "https://auth.openai.com", jwks_uri: "https://auth.openai.com/.well-known/jwks.json", revocation_endpoint: "https://auth.openai.com/oauth/revoke" });
    if (url.endsWith("jwks.json")) return json({ keys: [jwk] });
    if (url.endsWith("oauth/token")) {
      h.tokenCalls++;
      const form = new URLSearchParams(options.body);
      if (h.tokenError) return json({ error: h.tokenError }, 400);
      await h.tokenWait;
      const initial = form.get("grant_type") === "authorization_code";
      return json({ access_token: `secret-access-${h.tokenCalls}`, refresh_token: `secret-refresh-${h.tokenCalls}`, token_type: "Bearer", expires_in: 3600, scope: h.scope, ...(initial ? { id_token: jwt({ iss: "https://auth.openai.com", aud: "oaiapp_test", sub: "teacher-id", email: "teacher@example.com", nonce: h.auth.searchParams.get("nonce"), exp: Math.floor(h.clock / 1000) + 3600, ...h.claimOverride }, h.signingKey) } : {}) });
    }
    if (url.endsWith("/revoke")) return new Response(null, { status: h.revokeStatus || 200 });
    if (url.endsWith("/models")) {
      if (h.modelUnauthorized) { h.modelUnauthorized--; return json({ error: { code: "invalid_token" } }, 401); }
      return json({ models: h.models });
    }
    if (url.endsWith("/responses")) {
      if (h.responseError) return json(h.responseError, h.responseStatus || 400);
      const body = JSON.parse(options.body);
      if (body.text?.format?.type === "json_object" && !/json/i.test(JSON.stringify(body.input))) {
        return json({ error: { message: "Response input messages must contain the word 'json' in some form to use 'text.format' of type 'json_object'.", type: "invalid_request_error", param: "input", code: null } }, 400);
      }
      return new Response(h.reply, { headers: { "Content-Type": "text/event-stream" } });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  h.runtime = createChatGPT({ readState: () => structuredClone(h.saved), writeState: (s) => { if (h.storageError) throw new Error("Disk full"); h.saved = structuredClone(s); }, fetchImpl, now: () => h.clock, requestTimeoutMs: 3000 });
  t.after(() => h.runtime.close());
  h.start = async (id = "") => { h.auth = new URL(await h.runtime.startSignIn(id)); return h.auth; };
  h.callback = async (overrides = {}) => {
    const cb = new URL(h.auth.searchParams.get("redirect_uri"));
    cb.search = new URLSearchParams({ state: h.auth.searchParams.get("state"), code: "authorization-code", client_id: "oaiapp_test", ...overrides });
    return fetch(cb);
  };
  h.login = async () => { await h.start(); const response = await h.callback(); assert.equal(response.status, 200); return h.runtime.status(); };
  return h;
}

test("OAuth: loopback + PKCE + issued client, verified identity, protected tokens and Luna default", async (t) => {
  const h = harness(t);
  await h.start();
  const params = h.auth.searchParams;
  assert.equal(h.auth.origin, "https://auth.openai.com");
  assert.equal(params.get("client_id"), "dynamic_agent_client");
  assert.equal(params.get("agent_name_hint"), "Vocab Master");
  assert.match(params.get("ext_agent_host_id"), /^urn:uuid:/);
  assert.equal(params.get("code_challenge_method"), "S256");
  assert.equal(new URL(params.get("redirect_uri")).hostname, "127.0.0.1");
  assert.equal((await h.callback({ state: "forged" })).status, 400);
  assert.equal(h.runtime.status().pending, true);
  assert.equal(h.tokenCalls, 0);
  assert.equal((await h.callback()).status, 200);
  const form = new URLSearchParams(h.calls.find((c) => c.url.endsWith("oauth/token")).body);
  assert.equal(form.get("client_id"), "oaiapp_test");
  assert.equal(form.get("redirect_uri"), params.get("redirect_uri"));
  assert.ok(form.get("code_verifier").length >= 43);
  const state = await h.runtime.listModels();
  assert.equal(state.model, "gpt-6-luna");
  assert.equal(state.ready, true);
  assert.equal(state.models.length, 2);
  assert.equal(state.profiles[0].email, "teacher@example.com");
  assert.ok(!JSON.stringify(state).includes("secret-"));
  assert.equal(h.saved.profiles[0].accessToken, "secret-access-1");
  assert.equal(state.welcome, true);
  assert.equal(h.runtime.acknowledge().welcome, false);
});

for (const [name, claims] of [["wrong nonce", { nonce: "forged" }], ["wrong issuer", { iss: "https://example.com" }], ["wrong audience", { aud: "another-client" }], ["expired identity", { exp: 1 }]]) {
  test(`OAuth rejects ${name} without enabling generation`, async (t) => {
    const h = harness(t); h.claimOverride = claims;
    await h.start();
    assert.equal((await h.callback()).status, 400);
    assert.equal(h.runtime.status().connected, false);
    assert.equal(h.saved.profiles[0].clientId, "oaiapp_test", "issued registration survives failed exchange/validation");
  });
}
test("OAuth rejects a forged signature", async (t) => {
  const h = harness(t); h.signingKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  await h.start();
  assert.equal((await h.callback()).status, 400);
  assert.equal(h.runtime.status().connected, false);
});
test("identity-only grant never enables model access or generation", async (t) => {
  const h = harness(t); h.scope = "openid email";
  const s = await h.login();
  assert.equal(s.connected, true); assert.equal(s.sharing, false);
  await assert.rejects(h.runtime.listModels(), /allow ChatGPT plan usage/);
  await assert.rejects(h.runtime.generate({ systemPrompt: "JSON", userPrompt: "Hello" }));
  assert.ok(!h.calls.some((c) => c.url.endsWith("/responses")));
});
test("user model choice is honored; removing it cannot silently switch to another model", async (t) => {
  const h = harness(t); await h.login(); await h.runtime.listModels();
  h.runtime.selectModel("gpt-6.1-sol");
  assert.throws(() => h.runtime.selectModel("made-up-model"));
  assert.deepEqual(await h.runtime.generate({ systemPrompt: "Teacher instructions", userPrompt: "Word list", retryHint: "Fix missing item" }), { ok: true });
  const call = h.calls.find((c) => c.url.endsWith("/responses"));
  const body = JSON.parse(call.body);
  assert.equal(body.model, "gpt-6.1-sol");
  assert.equal(body.store, false); assert.equal(body.stream, true);
  assert.match(body.instructions, /Teacher instructions/);
  assert.match(body.input[0].content, /Fix missing item/);
  assert.deepEqual(body.text, { format: { type: "json_object" } });
  assert.deepEqual(Object.keys(body).sort(), ["model", "instructions", "input", "text", "store", "stream"].sort());
  h.models = [h.models[1]];
  const s = await h.runtime.listModels();
  assert.equal(s.ready, false); assert.equal(s.model, "gpt-6.1-sol");
  await assert.rejects(h.runtime.generate({ systemPrompt: "JSON", userPrompt: "List" }), /available ChatGPT model/);
  assert.equal(h.calls.filter((c) => c.url.endsWith("/responses")).length, 1);
});
test("refresh is serialized, uses issued client/resource, and persists rotated tokens", async (t) => {
  const h = harness(t); await h.login(); h.clock += 3_550_000;
  await Promise.all([h.runtime.listModels(), h.runtime.listModels()]);
  assert.equal(h.tokenCalls, 2);
  const form = new URLSearchParams(h.calls.filter((c) => c.url.endsWith("oauth/token"))[1].body);
  assert.equal(form.get("client_id"), "oaiapp_test");
  assert.equal(form.get("grant_type"), "refresh_token");
  assert.equal(form.get("resource"), "https://api.openai.com/v1");
  assert.equal(form.has("scope"), false);
  assert.equal(h.saved.profiles[0].refreshToken, "secret-refresh-2");
});

test("remaking a test part satisfies JSON mode even when only the system prompt mentions JSON", async (t) => {
  const h = harness(t); await h.login();
  const spec = testDefaults("B_SENIOR");
  const part = spec.parts.find((p) => p.skill === "vocabulary");
  const { system, user } = testPrompt(spec, { focusWords: [{ english: "cat", type: "n." }, { english: "dog", type: "n." }] }, [part.id]);
  assert.match(system, /JSON/);
  assert.doesNotMatch(user, /json/i, "reproduces the actual remake prompt that failed on the live route");
  h.reply = finish(JSON.stringify({ sections: [{ id: part.id, items: [{ prompt: "A pet that barks.", answer: "dog" }] }] }));
  const result = await h.runtime.generate({ systemPrompt: system, userPrompt: user });
  assert.equal(result.sections[0].id, part.id);
  const body = JSON.parse(h.calls.find((c) => c.url.endsWith("/responses")).body);
  assert.equal(body.model, "gpt-6-luna");
  assert.ok(body.input[0].content.includes(user));
  assert.match(body.input[0].content, /JSON/);
  assert.equal(h.calls.filter((c) => c.url.endsWith("/responses")).length, 1);
});

test("HTTP rejections without an error code retain the diagnostic instead of claiming a connection failure", async (t) => {
  const h = harness(t); await h.login();
  h.responseError = { error: { code: null, type: "invalid_request_error", param: "input", message: "Response input messages must contain the word 'json'." } };
  await assert.rejects(h.runtime.generate({ systemPrompt: "Return JSON", userPrompt: "Rewrite this exercise." }), (e) => {
    assert.match(e.message, /input messages must contain/);
    assert.doesNotMatch(e.message, /connection|reach ChatGPT/);
    assert.equal(e.status, 400);
    assert.equal(e.param, "input");
    return true;
  });
  assert.equal(h.runtime.status().connected, true);
  assert.equal(h.tokenCalls, 1);
});

test("direct-admission errors retain their detail and preserve the connection", async (t) => {
  const h = harness(t); await h.login();
  h.responseStatus = 503; h.responseError = { detail: "Direct routing is temporarily unavailable." };
  await assert.rejects(h.runtime.generate({ systemPrompt: "Return JSON", userPrompt: "Rewrite this exercise." }), (e) => {
    assert.match(e.message, /Direct routing is temporarily unavailable/);
    assert.equal(e.status, 503);
    return true;
  });
  assert.equal(h.runtime.status().connected, true);
  assert.equal(h.tokenCalls, 1);
});
test("401 refresh retries once; expired renewable sessions require reconnect", async (t) => {
  const h = harness(t); await h.login(); h.modelUnauthorized = 1;
  assert.equal((await h.runtime.listModels()).ready, true);
  assert.equal(h.tokenCalls, 2);
  h.clock += 4_000_000; h.tokenError = "invalid_grant";
  await assert.rejects(h.runtime.listModels(), /expired/);
  assert.equal(h.runtime.status().connected, false);
  assert.ok(!h.saved.profiles[0].refreshToken);
});
test("a renewed identity-only grant cannot send inference or model requests", async (t) => {
  const h = harness(t); await h.login(); h.clock += 3_550_000; h.scope = "openid email";
  await assert.rejects(h.runtime.listModels(), /allow ChatGPT plan usage/);
  assert.equal(h.runtime.status().sharing, false);
  assert.ok(!h.calls.some((c) => c.url.endsWith("/models") || c.url.endsWith("/responses")));
});
test("reconnecting a saved registration preserves host/model and does not repeat welcome", async (t) => {
  const h = harness(t); await h.login(); await h.runtime.listModels(); h.runtime.acknowledge();
  h.runtime.selectModel("gpt-6.1-sol");
  const id = h.runtime.status().accountId, host = h.saved.hostId;
  await h.runtime.signOut();
  await h.start(id);
  assert.equal(h.auth.searchParams.get("client_id"), "oaiapp_test");
  assert.equal(h.auth.searchParams.get("ext_agent_host_id"), host);
  assert.equal((await h.callback()).status, 200);
  const s = await h.runtime.listModels();
  assert.equal(s.profiles.length, 1); assert.equal(s.accountId, id);
  assert.equal(s.model, "gpt-6.1-sol"); assert.equal(s.welcome, false);
});
test("logout clears credentials, preserves host/client registration, and reports unconfirmed revocation", async (t) => {
  const h = harness(t); await h.login();
  const host = h.saved.hostId, id = h.runtime.status().accountId;
  h.revokeStatus = 503;
  const s = await h.runtime.signOut();
  assert.equal(s.connected, false); assert.match(s.error, /could not be confirmed/);
  assert.ok(!JSON.stringify(h.saved).includes("secret-"));
  await h.start(id);
  assert.equal(h.auth.searchParams.get("client_id"), "oaiapp_test");
  assert.equal(h.auth.searchParams.get("ext_agent_host_id"), host);
  assert.equal(h.auth.searchParams.has("id_token_hint"), false);
});
test("cancel during token exchange cannot resurrect a session", async (t) => {
  const h = harness(t);
  let release; h.tokenWait = new Promise((r) => { release = r; });
  await h.start();
  const callback = h.callback();
  while (!h.tokenCalls) await new Promise((r) => setTimeout(r, 5));
  h.runtime.cancelSignIn(); release();
  assert.equal((await callback).status, 400);
  assert.equal(h.runtime.status().connected, false);
});
test("secure storage failure fails closed", async (t) => {
  const h = harness(t); await h.start(); h.storageError = true;
  assert.equal((await h.callback()).status, 400);
  assert.equal(h.runtime.status().ready, false);
  assert.equal(h.runtime.status().connected, false);
});
test("SSE preserves Greek across tiny UTF-8 chunks and waits for completion", async () => {
  const text = '{"greek":"γάτα"}';
  const bytes = new TextEncoder().encode(frame({ type: "response.output_text.delta", delta: text }) + finish(text));
  const body = { async *[Symbol.asyncIterator]() { for (const b of bytes) yield Uint8Array.of(b); } };
  assert.equal(await completedText(body), text);
});
for (const [name, tail, expected] of [
  ["disconnect after partial JSON", "", /before the reply completed/],
  ["late usage limit", frame({ type: "response.failed", response: { error: { code: "subscription_sharing_usage_limit_exceeded" } } }), /Manage usage/],
  ["incomplete answer", frame({ type: "response.incomplete" }), /incomplete/],
  ["refusal", frame({ type: "response.refusal.done" }), /could not complete/],
]) {
  test(`SSE rejects ${name}`, async () => {
    const res = new Response(frame({ type: "response.output_text.delta", delta: '{"partial":true}' }) + tail);
    await assert.rejects(completedText(res.body), expected);
  });
}
test("all vocabulary calls reach the ChatGPT adapter without an API key", async () => {
  const calls = [];
  configureAi({ provider: "chatgpt", chatgpt: async (payload) => { calls.push(payload); return { items: [{ english: "cat", type: "n.", greek: "γάτα", emojis: "🐈", collocation: "a black cat", derivatives: "", synonyms: "", antonyms: "" }] }; } });
  try {
    const rows = await autofillVocabulary("", "A_SENIOR", [{ english: "cat", fields: { greek: true, type: true, collocation: true } }]);
    assert.ok(calls.length > 0);
    assert.match(calls[0].userPrompt, /cat/);
    assert.ok(Array.isArray(rows));
    assert.equal(rows[0].greek, "γάτα");
  } finally { configureAi({ provider: "deepseek" }); }
});
