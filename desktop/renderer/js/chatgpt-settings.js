import { desktop, chatgptAction, refreshChatGPT, getChatGPT, chatgptReady } from "./bridge.js";
import { esc, openDialog } from "./ui.js";

const USAGE_URL = "https://chatgpt.com/settings/usage";
export const chatgptSettingsHtml = () => `
  <div id="chatgptSettings" class="chatgpt-settings hidden">
    <p class="hint">Use your eligible ChatGPT Plus or Pro plan. No API key is needed. Requests count towards your plan or available credits.</p>
    <label class="label" for="chatgptAccount">ChatGPT account</label>
    <select class="select" id="chatgptAccount" aria-label="ChatGPT account"></select>
    <div class="chatgpt-buttons">
      <button type="button" class="btn chatgpt-connect" id="chatgptConnect">Continue with ChatGPT</button>
      <button type="button" class="btn btn-secondary btn-sm" id="chatgptAdd">Add account</button>
      <button type="button" class="btn btn-secondary btn-sm hidden" id="chatgptCancel">Cancel sign-in</button>
      <button type="button" class="btn btn-danger-ghost btn-sm" id="chatgptDisconnect">Sign out</button>
    </div>
    <div id="chatgptStatus" class="key-status info" role="status" aria-live="polite">Checking your ChatGPT connection…</div>
    <div class="chatgpt-model-row">
      <div class="field">
        <label class="label" for="chatgptModel">Model</label>
        <select class="select" id="chatgptModel" aria-describedby="chatgptModelHint"></select>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" id="chatgptRefresh">Refresh models</button>
    </div>
    <p class="hint" id="chatgptModelHint">Choose a lighter model, such as Luna, to conserve your plan's usage. Luna is selected first when available; your choice is remembered for each account.</p>
    <p class="hint chatgpt-usage"><span id="chatgptPlanState"></span><a href="${USAGE_URL}" target="_blank" rel="noopener">Manage usage</a></p>
    ${desktop() ? `<p class="hint">Your connection is stored encrypted on this computer. Signing in does not give Vocab Master access to your ChatGPT conversations.</p>` : `<p class="hint">Your connection lasts while the local Vocab Master server is running. Sign in again after restarting it.</p>`}
  </div>`;

export function mountChatGPTSettings(root, onState) {
  const q = (s) => root.querySelector(s);
  let closed = false, busy = false, polling = false, welcomed = false, popup = null;
  let message = "", tone = "info";
  const render = () => {
    if (closed) return;
    const s = getChatGPT();
    const account = q("#chatgptAccount");
    account.innerHTML = s.profiles.length ? s.profiles.map((p) => `<option value="${esc(p.id)}">${esc(p.email ? `${p.email} · ${p.label}` : p.label)}${p.connected ? "" : " · signed out"}</option>`).join("") : `<option value="">No connected account</option>`;
    account.value = s.accountId || "";
    account.disabled = busy || s.pending || !s.profiles.length;
    q("#chatgptConnect").disabled = busy || s.pending;
    // Connected already: the same button signs in again (e.g. to allow plan usage), so say so.
    q("#chatgptConnect").textContent = s.connected ? "Reconnect" : "Continue with ChatGPT";
    q("#chatgptAdd").classList.toggle("hidden", !s.profiles.length);
    q("#chatgptAdd").disabled = busy || s.pending;
    q("#chatgptCancel").classList.toggle("hidden", !s.pending);
    q("#chatgptDisconnect").disabled = busy || !s.connected;
    q("#chatgptRefresh").disabled = busy || s.pending || !s.sharing;
    const model = q("#chatgptModel");
    // Only a loaded list can say the saved model is gone (the list is forgotten on restart and needs the internet).
    const missing = s.model && s.models.length && !s.models.some((m) => m.slug === s.model);
    const unlisted = s.sharing && s.model && !s.models.length;
    model.innerHTML = (missing ? `<option value="" disabled selected>Previous model unavailable — choose a model</option>` : unlisted ? `<option value="${esc(s.model)}">${esc(s.model)}</option>` : !s.models.length ? `<option value="">${s.sharing ? "Refresh to load available models" : "Connect ChatGPT to choose a model"}</option>` : "") + s.models.map((m) => `<option value="${esc(m.slug)}">${esc(m.name)}</option>`).join("");
    model.value = missing ? "" : s.model;
    model.disabled = busy || s.pending || !s.sharing || !s.models.length;
    q("#chatgptPlanState").textContent = s.sharing ? "Using ChatGPT plan · " : "ChatGPT plan usage · ";
    const status = q("#chatgptStatus");
    let text = message || s.error;
    let cls = message ? tone : s.error ? "error" : "info";
    if (!text) {
      if (s.pending) text = "Finish signing in and allow plan usage in your browser. This window updates automatically.";
      else if (s.connected && !s.sharing) { text = "Signed in, but ChatGPT plan usage is not enabled. Reconnect and allow plan usage to generate."; cls = "warn"; }
      else if (s.ready) { text = "Connected. Your selected model will use your ChatGPT plan."; cls = "ok"; }
      else if (unlisted && chatgptReady(s)) { text = "Connected. Your saved model is used; press Refresh models to see the others."; cls = "ok"; }
      else if (s.sharing) { text = missing ? "Your previous model is unavailable. Choose an available model to continue." : "Connected. Refresh the models to choose one."; cls = "warn"; }
      else text = "Connect your ChatGPT account to get started.";
    }
    status.className = `key-status ${cls}`;
    status.textContent = text;
    onState?.(s);
    if (s.welcome && !welcomed && !s.pending) {
      welcomed = true;
      openDialog({ title: "You're using your ChatGPT plan", body: `<p>Eligible AI requests in Vocab Master use your ChatGPT plan or available credits. You can review usage and adjust limits in ChatGPT settings.</p><p><a href="${USAGE_URL}" target="_blank" rel="noopener">Manage usage</a></p>`, foot: `<button type="button" class="btn btn-primary" data-close>Got it</button>`, onClose: () => { chatgptAction("acknowledge").catch(() => {}); } });
    }
  };
  async function run(fn, { clear = true } = {}) {
    if (busy) return;
    busy = true;
    if (clear) message = "";
    render();
    try { await fn(); }
    catch (e) { message = e.message; tone = "error"; }
    finally { busy = false; render(); }
  }
  async function signIn(newAccount) {
    // Open immediately from the click to avoid browser popup blocking. OAuth URLs
    // (which can contain an ID-token hint) stay in the local host process.
    if (!desktop()) {
      popup = window.open("about:blank", "_blank");
      if (!popup) { message = "Allow the sign-in popup for Vocab Master, then try again."; tone = "error"; render(); return; }
      popup.opener = null;
    }
    await run(async () => {
      try {
        // A sign-in left open in another browser tab would block this one ("already open"): start over instead.
        if (getChatGPT().pending) await chatgptAction("cancel");
        const result = await chatgptAction("signIn", { accountId: newAccount ? "" : getChatGPT().accountId });
        if (closed) { await chatgptAction("cancel"); popup?.close(); return; }
        if (popup && result.browserPath) popup.location.replace(new URL(result.browserPath, window.location.origin).href);
      } catch (e) { popup?.close(); throw e; }
    });
  }
  q("#chatgptConnect").addEventListener("click", () => signIn(false));
  q("#chatgptAdd").addEventListener("click", () => signIn(true));
  q("#chatgptCancel").addEventListener("click", () => run(async () => { await chatgptAction("cancel"); popup?.close(); }));
  q("#chatgptDisconnect").addEventListener("click", () => run(() => chatgptAction("signOut")));
  q("#chatgptRefresh").addEventListener("click", () => run(() => refreshChatGPT({ models: true })));
  q("#chatgptModel").addEventListener("change", (e) => { const model = e.target.value; run(() => chatgptAction("model", { model })); });
  q("#chatgptAccount").addEventListener("change", (e) => { const accountId = e.target.value; run(async () => { await chatgptAction("account", { accountId }); await refreshChatGPT({ models: true }); }); });
  const load = () => run(() => refreshChatGPT({ models: true }));
  const interval = setInterval(async () => {
    if (closed || busy || polling || !getChatGPT().pending) return;
    polling = true;
    try {
      await chatgptAction("status");
      if (!getChatGPT().pending && getChatGPT().sharing) await chatgptAction("models");
      render();
    } catch (e) { message = e.message; tone = "error"; render(); }
    finally { polling = false; }
  }, 900);
  return {
    load,
    close() { closed = true; clearInterval(interval); if (getChatGPT().pending) chatgptAction("cancel").catch(() => {}); },
  };
}
