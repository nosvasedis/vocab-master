# ChatGPT connection

Settings → ChatGPT → Continue with ChatGPT opens the system browser. Sign in with
an eligible Plus or Pro account and allow ChatGPT plan usage. Select a model and
Save to use ChatGPT for vocabulary, worksheets, and AI fixes. The model catalog is
loaded from the selected account; Luna is preferred only for an initial choice.
Model/account changes apply immediately. Refresh models if access changes.

Use Add account for a different account/workspace. Saved connections remain
separate, even when their email addresses match. Sign out clears local tokens
and attempts to revoke the renewable session. Manage usage opens
https://chatgpt.com/settings/usage, including when a request reaches a usage limit.

## Runtime

- `desktop/chatgpt.js`: shared OAuth, verified identity, registration/profile
  management, serialized token refresh, account-specific model catalogs, and SSE
  inference. Uses only Node built-ins and public OpenAI endpoints.
- `desktop/main.js`: narrow, top-frame-only IPC and atomic safeStorage-encrypted
  `chatgpt-accounts.bin` in Electron userData. Refuses plaintext credential storage.
- `proxy.js`: local browser transport with Host/Origin/custom-header checks.
  Binds to loopback. Tokens stay in server memory; only host/client registration
  metadata and model preference persist under the user's local application data.
  A single-use, short-lived local redirect keeps OAuth URLs out of the renderer.
- `desktop/renderer/js/bridge.js`: only display state and generated JSON cross
  the host boundary. Readiness is independent of API-key presence.
- `desktop/renderer/js/chatgpt-settings.js`: connections, models, cancellation,
  first-use explanation, and usage controls.

The callback listens only on `127.0.0.1` on an available port. Each attempt uses
fresh state, nonce and PKCE. Identity verification checks the signature against
OpenAI JWKS, issuer, audience, expiry, nonce, and the returning account's subject.
An issued registration is retained if token exchange fails. Sign-out preserves
the host/client mapping; reauthorization reuses it. Access, ID and refresh tokens
are never returned in public session state.

Inference uses `https://api.openai.com/v1/responses`, `store:false`, `stream:true`,
an instructions string, and the request context in `input`. Unsupported preview
parameters such as temperature/max_output_tokens are omitted. JSON is accepted
in JSON-object mode, and is still parsed and validated by the app. Every input
message includes an explicit JSON output instruction: mentioning JSON only in
the separate `instructions` field does not satisfy the route's JSON-mode check.
HTTP failures retain OpenAI's message (or direct-admission `detail`) instead of
being mislabeled as connection failures. Model discovery
runs in the background so offline access to saved units is not delayed. Output is accepted
only after `response.completed`; incomplete streams, refusals, late usage-limit
errors and invalid JSON are failures. No fallback to another provider or model.

## Verification

`npm test` includes OAuth success/failure, identity verification, permission checks,
model selection, serialized refresh, session expiry, sign-out/reauthorization,
storage failure, SSE fragmentation, incomplete streams and late usage errors.
OAuth tests use a local listener and mock OpenAI responses with signed test ID
tokens; they do not use a real subscription.

Before claiming live account verification, complete browser authorization with a
real eligible account, load its models, select the intended model, and generate
a small unit. A connected badge and a model list alone do not prove inference.
Automated/UI verification uses mock OpenAI and does not establish availability
or remaining allowance for a particular user's real account. On 2026-10-20, an
isolated Electron diagnostic with the existing connection reproduced an HTTP 400
for a synthetic test-part rewrite whose input did not mention JSON. The corrected
shared runtime completed that synthetic five-question rewrite with GPT-6 Luna.
The diagnostic did not modify the saved connection, settings, or exercises.

## Official protocol references

- https://developers.openai.com/siwc/token-sharing-open-source
- https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions
- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
