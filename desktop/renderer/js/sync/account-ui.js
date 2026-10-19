/* Sync — the "Account & sync" section of Settings, and the first-sign-in merge question.
   Mounted by js/dialogs.js; everything here acts at once (it doesn't wait for the dialog's Save). */
import { esc, icon, openDialog, toast, timeAgo, confirmDialog } from "../ui.js";
import { passphraseHint, MIN_PASSPHRASE } from "./crypto.js";
import { LOCAL } from "./profiles.js";
import {
  syncStatus, signIn, signOut, switchProfile, removeProfile, sendPasswordReset, syncNow,
  enableKeySync, resetKeySync, disableKeySync, downloadBackup, parseBackup, importBackup,
} from "./index.js";
import { cancelGoogle } from "./google.js";

const GOOGLE_G = `<svg class="i i-sm" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.2-13.5-10l-7.8 6C6.6 42.6 14.6 48 24 48z"/></svg>`;

const PHASES = {
  synced: ["success", "Synced"],
  syncing: ["info", "Syncing…"],
  offline: ["warning", "Offline"],
  error: ["danger", "Sync problem"],
  "signed-out": ["warning", "Signed out"],
  local: ["", "Not signed in"],
};

export function accountSectionHtml() {
  return `<section class="settings-section" id="syncSection">
    <h4>Account &amp; sync</h4>
    <div id="syncBody" class="acct"></div>
  </section>`;
}

const initial = (p) => esc((p.name || p.email || "?").trim().charAt(0).toUpperCase());
const who = (p) => esc(p.name || p.email || "Teacher");

function statusLine(s) {
  const bits = [];
  if (s.phase === "offline") bits.push("Changes are saved here and upload when you're back online.");
  if (s.phase === "error" && s.error) bits.push(s.error);
  if (s.pending) bits.push(`${s.pending} change${s.pending === 1 ? "" : "s"} waiting to upload.`);
  if (s.lastSync && s.phase !== "error") bits.push(`Last synced ${timeAgo(new Date(s.lastSync))}.`);
  return bits.join(" ");
}

function signInForm({ email = "", again = false } = {}) {
  return `<div class="acct-signin">
    <button type="button" class="btn btn-secondary btn-block acct-google" data-ac="google">${GOOGLE_G}Continue with Google</button>
    <div class="acct-or"><span>or with email</span></div>
    <div class="acct-fields">
      <input class="input" id="acEmail" type="email" autocomplete="username" placeholder="Email" value="${esc(email)}" ${again ? "readonly" : ""} />
      <input class="input" id="acPass" type="password" autocomplete="current-password" placeholder="Password" />
    </div>
    <div class="acct-actions">
      <button type="button" class="btn btn-primary btn-sm" data-ac="signin">Sign in</button>
      ${again ? "" : `<button type="button" class="btn btn-secondary btn-sm" data-ac="create">Create account</button>`}
      <span class="spacer"></span>
      <button type="button" class="btn btn-ghost btn-sm" data-ac="forgot">Forgot password?</button>
    </div>
  </div>`;
}

function otherProfiles(s) {
  const others = (s.profiles || []).filter((p) => p.uid !== s.active);
  const rows = others.map((p) => `<div class="acct-row">
      <span class="acct-avatar sm">${initial(p)}</span>
      <span class="acct-who"><strong>${who(p)}</strong><small>${esc(p.email || "")}</small></span>
      <button type="button" class="btn btn-secondary btn-sm" data-ac="switch" data-uid="${esc(p.uid)}">Switch</button>
      <button type="button" class="icon-btn sm" data-ac="remove" data-uid="${esc(p.uid)}" aria-label="Remove ${who(p)} from this computer" title="Remove from this computer">${icon("trash", "i-sm")}</button>
    </div>`);
  if (s.active !== LOCAL) {
    rows.push(`<div class="acct-row">
      <span class="acct-avatar sm local">${icon("monitor", "i-sm")}</span>
      <span class="acct-who"><strong>This computer</strong><small>Use without an account</small></span>
      <button type="button" class="btn btn-secondary btn-sm" data-ac="switch" data-uid="${LOCAL}">Switch</button>
    </div>`);
  }
  if (!rows.length) return "";
  return `<div class="acct-sub"><h5>Other teachers on this computer</h5>${rows.join("")}</div>`;
}

function keysBlock(s, open) {
  if (s.vault === "on") {
    return `<div class="acct-sub"><h5>${icon("key", "i-sm")}AI keys</h5>
      <p class="hint">Your AI keys sync, locked with your sync passphrase before they leave this computer. Nobody else can read them, not even the database.</p>
      <div class="acct-actions"><button type="button" class="btn btn-ghost btn-sm" data-ac="keys-off">Stop syncing keys</button></div>
    </div>`;
  }
  if (s.vault === "locked") {
    return `<div class="acct-sub"><h5>${icon("key", "i-sm")}AI keys</h5>
      <div class="key-status warn">${icon("alert", "i-sm")}<span>Type your sync passphrase to get your keys on this computer (and to upload a changed key).</span></div>
      <div class="acct-fields"><input class="input" id="acVaultPass" type="password" autocomplete="off" placeholder="Sync passphrase" /></div>
      <div class="acct-actions"><button type="button" class="btn btn-primary btn-sm" data-ac="keys-unlock">Unlock</button><span class="spacer"></span><button type="button" class="btn btn-ghost btn-sm" data-ac="keys-forgot">Forgot it?</button></div>
    </div>`;
  }
  return `<div class="acct-sub"><h5>${icon("key", "i-sm")}AI keys</h5>
    <label class="switch"><input type="checkbox" id="acKeysOn" ${open ? "checked" : ""} /><span class="track"></span><span class="sw-text">Sync my AI keys<small>Locked with a passphrase only you know. If you forget it, you'll paste your keys again.</small></span></label>
    ${open ? `<div class="acct-fields">
      <input class="input" id="acVaultPass" type="password" autocomplete="new-password" placeholder="Sync passphrase (not your password)" />
      <input class="input" id="acVaultPass2" type="password" autocomplete="new-password" placeholder="Type it again" />
    </div>
    <p class="hint" id="acVaultHint">At least ${MIN_PASSPHRASE} characters. On another computer, type the same passphrase once to get your keys there.</p>
    <div class="acct-actions"><button type="button" class="btn btn-primary btn-sm" data-ac="keys-on">Turn on</button></div>` : ""}
  </div>`;
}

function backupBlock() {
  return `<div class="acct-sub"><h5>${icon("package", "i-sm")}Backup file</h5>
    <p class="hint">Save everything to a file, or bring a file's worksheets, classes and settings into this computer. Works without an account.</p>
    <div class="acct-actions">
      <button type="button" class="btn btn-secondary btn-sm" data-ac="export">${icon("download", "i-sm")}Export backup</button>
      <button type="button" class="btn btn-secondary btn-sm" data-ac="import">${icon("upload", "i-sm")}Import backup</button>
      <input type="file" id="acImportFile" accept=".json,application/json" hidden />
    </div>
  </div>`;
}

function render(body, ui) {
  const s = syncStatus();
  const p = s.profile;
  const [tone, label] = PHASES[s.phase] || PHASES.local;
  let html = "";
  if (s.emulator) html += `<div class="key-status info">${icon("info", "i-sm")}<span>Developer mode: using the local Firebase emulators.</span></div>`;
  if (!p) {
    html += `<p class="hint">Sign in to keep your classes, worksheets and settings on every computer you use. Everything still works offline.</p>`;
    html += signInForm();
  } else {
    html += `<div class="acct-card">
      <span class="acct-avatar">${initial(p)}</span>
      <span class="acct-who"><strong>${who(p)}</strong><small>${esc(p.email || "")}${p.provider === "google" ? " · Google" : ""}</small></span>
      <span class="badge ${tone}"><span class="dot"></span>${label}</span>
    </div>`;
    if (s.phase === "signed-out") {
      html += `<p class="hint">Your sign-in has ended on this computer. Your data is still here; sign in again to keep syncing.</p>`;
      html += signInForm({ email: p.email, again: p.provider !== "google" });
    } else {
      const line = statusLine(s);
      if (line) html += `<p class="hint">${esc(line)}</p>`;
      html += `<div class="acct-actions">
        <button type="button" class="btn btn-secondary btn-sm" data-ac="sync">${icon("refresh", "i-sm")}Sync now</button>
        <button type="button" class="btn btn-secondary btn-sm" data-ac="add">${icon("users", "i-sm")}Add another teacher</button>
        <span class="spacer"></span>
        <button type="button" class="btn btn-ghost btn-sm" data-ac="signout">Sign out</button>
      </div>`;
      if (ui.adding) html += `<div class="acct-sub"><h5>Add another teacher</h5><p class="hint">Their own classes and worksheets; yours are kept aside on this computer until you switch back.</p>${signInForm()}</div>`;
      html += keysBlock(s, ui.keysOpen);
    }
  }
  html += otherProfiles(s);
  html += backupBlock();
  html += `<div id="acMsg" class="hidden"></div>`;
  body.innerHTML = html;
}

/** Mount into the Settings dialog. Re-renders on every sync status change while the dialog is open. */
export function mountAccount(root) {
  const body = root.querySelector("#syncBody");
  if (!body) return;
  const ui = { keysOpen: false, adding: false, busy: false };
  const draw = () => { if (!ui.busy) render(body, ui); };
  const onStatus = () => { if (!body.isConnected) { window.removeEventListener("vm-sync-status", onStatus); cancelGoogle(); return; } draw(); };
  window.addEventListener("vm-sync-status", onStatus);
  draw();

  const msg = (tone, text) => {
    const m = body.querySelector("#acMsg");
    if (!m) return;
    m.className = `key-status ${tone}`;
    m.innerHTML = `${icon(tone === "ok" ? "check-circle" : tone === "info" ? "info" : "alert", "i-sm")}<span>${esc(text)}</span>`;
  };
  const val = (id) => body.querySelector(id)?.value || "";
  const busy = async (btn, fn) => {
    ui.busy = true;
    btn?.classList.add("is-loading");
    body.querySelectorAll("button").forEach((b) => { b.disabled = true; });
    try { return await fn(); } finally {
      ui.busy = false;
      if (body.isConnected) {
        body.querySelectorAll("button").forEach((b) => { b.disabled = false; });
        btn?.classList.remove("is-loading");
      }
    }
  };
  const after = (res, okText) => {
    if (res?.reload) { msg("info", "Switching… the app reloads in a moment."); return; }
    if (res?.cancelled) return;
    if (!res?.ok) { draw(); msg("error", res?.error || "That didn't work."); return; }
    ui.adding = false;
    draw();
    if (okText) msg("ok", okText);
  };

  body.addEventListener("input", (e) => {
    if (e.target.id === "acVaultPass" && body.querySelector("#acVaultHint")) body.querySelector("#acVaultHint").textContent = passphraseHint(e.target.value).text;
  });
  body.addEventListener("change", async (e) => {
    if (e.target.id === "acKeysOn") { ui.keysOpen = e.target.checked; draw(); body.querySelector("#acVaultPass")?.focus(); }
    if (e.target.id === "acImportFile" && e.target.files?.[0]) {
      const file = e.target.files[0];
      e.target.value = "";
      await doImport(file);
    }
  });

  async function doImport(file) {
    let parsed;
    try { parsed = parseBackup(await file.text()); } catch (err) { msg("error", err.message); return; }
    let passphrase = "";
    if (parsed.keys) passphrase = await askPassphrase({ title: "AI keys in this backup", text: "This backup has your AI keys, locked with a passphrase. Type it to bring the keys in too, or skip.", okLabel: "Bring keys in", skipLabel: "Skip keys" });
    try {
      const res = await importBackup(parsed, { passphrase });
      toast(`Backup merged${res.keys ? ", keys included" : ""}. Reloading…`, "ok");
      setTimeout(() => location.reload(), 900);
    } catch (err) {
      msg("error", err?.code === "bad-passphrase" ? "That passphrase doesn't open the keys in this backup. Nothing else was changed." : err?.message || String(err));
    }
  }

  body.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-ac]");
    if (!btn) return;
    const ac = btn.dataset.ac;
    if (ac === "google") {
      msg("info", window.desktop ? "Finish signing in in your browser, then come back here." : "Finish signing in in the Google window.");
      after(await busy(btn, () => signIn({ method: "google" })), "Signed in.");
    } else if (ac === "signin" || ac === "create") {
      const email = val("#acEmail");
      const password = val("#acPass");
      if (!email || !password) { msg("error", "Type your email and a password."); return; }
      after(await busy(btn, () => signIn({ method: "email", email, password, create: ac === "create" })), ac === "create" ? "Account created. You're signed in." : "Signed in.");
    } else if (ac === "forgot") {
      const email = val("#acEmail");
      if (!email) { msg("error", "Type your email first, then press Forgot password."); return; }
      const res = await busy(btn, () => sendPasswordReset(email));
      if (res.ok) msg("ok", `If there's an account for ${email}, a reset link is on its way.`);
      else msg("error", res.error);
    } else if (ac === "sync") {
      after(await busy(btn, () => syncNow()), "Up to date.");
    } else if (ac === "add") {
      ui.adding = !ui.adding;
      draw();
    } else if (ac === "signout") {
      const keep = await signOutDialog();
      if (keep === null) return;
      const res = await busy(btn, () => signOut({ removeData: !keep }));
      if (res.pending && !keep) toast("Some changes hadn't uploaded yet, so your data stays on this computer.", "warn", { ms: 6000 });
      after(res);
    } else if (ac === "switch") {
      after(await busy(btn, () => switchProfile(btn.dataset.uid)));
    } else if (ac === "remove") {
      const ok = await confirmDialog({ title: "Remove from this computer?", body: "Their data on this computer is deleted. What's in their account stays there, so they can sign in again any time.", okLabel: "Remove" });
      if (ok) { await removeProfile(btn.dataset.uid); draw(); }
    } else if (ac === "keys-on") {
      const a = val("#acVaultPass");
      if (!passphraseHint(a).ok) { msg("error", `Choose a passphrase of at least ${MIN_PASSPHRASE} characters.`); return; }
      if (a !== val("#acVaultPass2")) { msg("error", "The two passphrases don't match."); return; }
      const res = await busy(btn, () => enableKeySync(a));
      ui.keysOpen = false;
      after(res, "Your AI keys now sync, locked with your passphrase.");
    } else if (ac === "keys-unlock") {
      const a = val("#acVaultPass");
      if (!a) { msg("error", "Type your sync passphrase."); return; }
      after(await busy(btn, () => enableKeySync(a)), "Unlocked. Your keys are on this computer.");
    } else if (ac === "keys-forgot") {
      const a = await askPassphrase({ title: "Choose a new sync passphrase", text: "The keys saved in your account can't be opened without the old passphrase. They'll be replaced by the keys on this computer, locked with the new passphrase. On your other computers, type the new one once.", okLabel: "Replace", confirm: true });
      if (a) after(await busy(btn, () => resetKeySync(a)), "Done. Your keys are locked with the new passphrase.");
    } else if (ac === "keys-off") {
      const ok = await confirmDialog({ title: "Stop syncing AI keys?", body: "The locked copy is deleted from your account. The keys stay on this computer.", okLabel: "Stop syncing", tone: "danger", iconName: "key" });
      if (ok) after(await busy(btn, () => disableKeySync()), "Keys no longer sync.");
    } else if (ac === "export") {
      const passphrase = await askPassphrase({ title: "Export backup", text: "Add a passphrase to include your AI keys (locked with it). Leave it empty to leave the keys out.", okLabel: "Export", skipLabel: "Export without keys", optional: true });
      if (passphrase === null) return;
      const res = await busy(btn, () => downloadBackup({ passphrase }));
      msg("ok", `Saved ${res.name} (${res.records} item${res.records === 1 ? "" : "s"}${passphrase ? ", keys included" : ""}).`);
    } else if (ac === "import") {
      body.querySelector("#acImportFile")?.click();
    }
  });
}

/** Asks for a passphrase. Resolves with it, "" for skip, or null for cancel. */
function askPassphrase({ title, text, okLabel = "OK", skipLabel = "", confirm = false, optional = false }) {
  return new Promise((resolve) => {
    let result = null;
    openDialog({
      title, iconName: "key", size: "sm",
      body: `<p class="confirm-body">${esc(text)}</p>
        <div class="acct-fields">
          <input class="input" id="ppA" type="password" autocomplete="off" placeholder="Passphrase" autofocus />
          ${confirm ? `<input class="input" id="ppB" type="password" autocomplete="off" placeholder="Type it again" />` : ""}
        </div>
        <p class="hint" id="ppHint"></p>`,
      foot: `${skipLabel ? `<button type="button" class="btn btn-ghost" data-skip>${esc(skipLabel)}</button>` : ""}<span class="spacer"></span>
        <button type="button" class="btn btn-secondary" data-close>Cancel</button>
        <button type="button" class="btn btn-primary" data-ok>${esc(okLabel)}</button>`,
      onMount(root, close) {
        const a = root.querySelector("#ppA");
        const hint = root.querySelector("#ppHint");
        a.addEventListener("input", () => { hint.textContent = confirm || optional ? passphraseHint(a.value).text : ""; });
        root.querySelector("[data-skip]")?.addEventListener("click", () => { result = ""; close(); });
        root.querySelector("[data-ok]").addEventListener("click", () => {
          const v = a.value;
          if (!v && optional) { result = ""; close(); return; }
          if (!v) { hint.textContent = "Type the passphrase."; return; }
          if ((confirm || optional) && !passphraseHint(v).ok) { hint.textContent = `At least ${MIN_PASSPHRASE} characters.`; return; }
          if (confirm && v !== root.querySelector("#ppB").value) { hint.textContent = "The two don't match."; return; }
          result = v;
          close();
        });
        a.addEventListener("keydown", (e) => { if (e.key === "Enter") root.querySelector("[data-ok]").click(); });
      },
      onClose: () => resolve(result),
    });
  });
}

/** Keep this teacher's data on this computer when signing out? true = keep, false = remove, null = cancel. */
function signOutDialog() {
  return new Promise((resolve) => {
    let result = null;
    openDialog({
      title: "Sign out?", iconName: "users", size: "sm",
      body: `<p class="confirm-body">Your account keeps everything. On this computer, your data can stay (quick to switch back, works offline) or be removed (best on a shared computer).</p>
        <label class="switch"><input type="checkbox" id="soKeep" checked /><span class="track"></span><span class="sw-text">Keep my data on this computer</span></label>`,
      foot: `<span class="spacer"></span><button type="button" class="btn btn-secondary" data-close>Cancel</button><button type="button" class="btn btn-primary" data-ok>Sign out</button>`,
      onMount(root, close) {
        root.querySelector("[data-ok]").addEventListener("click", () => { result = root.querySelector("#soKeep").checked; close(); });
      },
      onClose: () => resolve(result),
    });
  });
}

/** First sign-in on a computer that already has worksheets or classes, into an account that has some too. */
export function askMerge({ email, counts }) {
  return new Promise((resolve) => {
    let result = "cancel";
    const here = [counts.worksheets && `${counts.worksheets} worksheet${counts.worksheets === 1 ? "" : "s"}`, counts.classes && `${counts.classes} class${counts.classes === 1 ? "" : "es"}`].filter(Boolean).join(" and ") || "data";
    openDialog({
      title: "This computer already has data", iconName: "layers", size: "sm", dismissible: false,
      body: `<p class="confirm-body">This computer has ${esc(here)}, and ${esc(email || "your account")} has data too. What should happen?</p>
        <div class="acct-choice">
          <button type="button" class="provider-opt active" data-choice="merge"><span class="po-top"><strong>Merge both</strong><span class="badge success">Recommended</span></span><span class="po-blurb">Keep everything from both. If the same thing was changed in both places, the newer change wins.</span></button>
          <button type="button" class="provider-opt" data-choice="replace"><span class="po-top"><strong>Use the account's data only</strong></span><span class="po-blurb">This computer's data is saved to a backup file first, then replaced.</span></button>
        </div>`,
      foot: `<span class="spacer"></span><button type="button" class="btn btn-secondary" data-close>Cancel sign-in</button><button type="button" class="btn btn-primary" data-ok>Continue</button>`,
      onMount(root, close) {
        let pick = "merge";
        root.querySelectorAll("[data-choice]").forEach((b) => b.addEventListener("click", () => {
          pick = b.dataset.choice;
          root.querySelectorAll("[data-choice]").forEach((x) => x.classList.toggle("active", x === b));
        }));
        root.querySelector("[data-close]").addEventListener("click", () => { result = "cancel"; });
        root.querySelector("[data-ok]").addEventListener("click", () => { result = pick; close(); });
      },
      onClose: () => resolve(result),
    });
  });
}
