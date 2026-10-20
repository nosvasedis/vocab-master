/* Updates, as the teacher sees them (desktop app only).
 * The pages update themselves from GitHub in the background (desktop/live-update.js) and the app itself from
 * GitHub Releases (desktop/exe-update.js). Here: tell the main process the pages started (so a broken update is
 * rolled back), a friendly toast when an update arrived or is ready, and the Updates section in Settings. */
import { desktop } from "./bridge.js";
import { $, esc, icon, toast } from "./ui.js";

let last = null;
let toldReady = "";
let toldExe = "";
const listeners = new Set();

const when = (iso) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) + (Date.now() - d < 86400e3 ? `, ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}` : "");
};
const restart = () => desktop()?.updates?.restart();

/** Start: report that the pages started, greet an update once, and listen for news from the main process. */
export async function initUpdates() {
  const u = desktop()?.updates;
  if (!u) return;
  try {
    const note = await u.alive();
    if (note?.sha) showCard({ kind: "done", title: "Vocab Master is up to date", text: note.message ? `What’s new: ${whatsNew(note.message)}` : "The latest improvements are in." });
  } catch { /* an older app without updates */ }
  u.onChange((info) => { last = info; announce(info); listeners.forEach((fn) => fn(info)); });
  last = await u.status().catch(() => null);
}

/** Toasts for news, each said once. */
/** A commit subject as a teacher reads it: "feat: the assistant understands…" → "The assistant understands…". */
export function whatsNew(message) {
  const t = String(message || "").replace(/^(?:feat|fix|perf|style|refactor|docs|chore|release|checkpoint)(?:\([^)]*\))?!?:\s*/i, "").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "";
}

/* The update card: bottom right, stays until the teacher answers (a toast is too easy to miss). */
function showCard({ kind, title, text, primary, secondary = "Later", onPrimary, onLater }) {
  document.getElementById("updPop")?.remove();
  const pop = document.createElement("div");
  pop.id = "updPop";
  pop.className = `upd-pop ${kind}`;
  pop.setAttribute("role", kind === "done" ? "status" : "alertdialog");
  pop.setAttribute("aria-live", "polite");
  pop.innerHTML = `<span class="upd-pop-ico">${icon(kind === "done" ? "check-circle" : kind === "exe" ? "download" : "sparkles")}</span>
    <div class="upd-pop-text"><b>${esc(title)}</b>${text ? `<small>${esc(text)}</small>` : ""}
      ${primary ? `<div class="upd-pop-acts"><button type="button" class="btn btn-primary btn-sm" data-upd-go>${esc(primary)}</button><button type="button" class="btn btn-ghost btn-sm" data-upd-later>${esc(secondary)}</button></div>` : ""}</div>
    <button type="button" class="icon-btn sm upd-pop-x" data-upd-later aria-label="Close">${icon("x", "i-sm")}</button>`;
  document.body.appendChild(pop);
  const close = () => { pop.classList.add("out"); setTimeout(() => pop.remove(), 260); };
  pop.addEventListener("click", async (e) => {
    if (e.target.closest("[data-upd-later]")) { close(); onLater?.(); return; }
    const go = e.target.closest("[data-upd-go]");
    if (!go) return;
    go.disabled = true;
    go.innerHTML = `${icon("refresh", "i-sm upd-spin")}${kind === "exe" ? "Restarting…" : "Updating…"}`;
    await onPrimary?.();
  });
  if (kind === "done") setTimeout(() => { if (pop.isConnected) close(); }, 7000);
}

/** News from the main process: a card for an update that is ready (once per update), toasts for the rest. */
function announce(info) {
  if (info.exe?.state === "ready" && toldExe !== `ready${info.exe.version}`) {
    toldExe = `ready${info.exe.version}`;
    showCard({ kind: "exe", title: `Vocab Master ${info.exe.version} is ready`, text: "A new version of the app is downloaded. Restart to install it — your work stays.", primary: "Restart to update", onPrimary: restart });
  } else if (info.exe?.state === "available" && toldExe !== `avail${info.exe.version}`) {
    toldExe = `avail${info.exe.version}`;
    showCard({ kind: "exe", title: `Vocab Master ${info.exe.version} is available`, text: "This portable copy can’t update itself: download the new version and run it instead.", primary: "Download", secondary: "Not now", onPrimary: () => desktop()?.updates?.download() });
  } else if (info.state === "ready" && info.pending && toldReady !== info.pending.sha) {
    toldReady = info.pending.sha;
    showCard({ kind: "live", title: "An update for Vocab Master is ready", text: info.pending.message ? `What’s new: ${whatsNew(info.pending.message)}` : "Improvements are ready to use.", primary: "Update now", onPrimary: restart });
  } else if (info.announce) {
    // From Help → Check for updates.
    if (info.state === "current" && !["ready", "available", "downloading"].includes(info.exe?.state)) toast("Vocab Master is up to date.", "ok", { ms: 3000 });
    else if (info.state === "error") toast(info.message || "Couldn’t check for updates.", "warn");
    else if (info.state === "needs-app") toast(info.message, "info");
  }
}

/** The headline, the detail line and the main button for the Updates section. */
function describe(info) {
  if (!info) return { tone: "idle", head: "Checking the app…", sub: "" };
  const exe = info.exe || {};
  if (exe.state === "ready") return { tone: "ready", head: `Version ${exe.version} is ready to install`, sub: "Restart and the new version opens — your work stays.", action: "restart", label: "Restart to install" };
  if (exe.state === "available") return { tone: "ready", head: `Version ${exe.version} is available`, sub: "This portable copy can’t update itself: download the new version from the release page.", action: "download", label: "Download" };
  if (info.state === "ready") return { tone: "ready", head: "An update is ready", sub: info.pending?.message ? `What’s new: ${whatsNew(info.pending.message)}` : "It takes a second — your work stays.", action: "restart", label: "Update now" };
  if (info.state === "downloading") {
    const files = (info.message || "").match(/\((\d+ changed files?)\)/)?.[1];
    return { tone: "busy", head: `Getting the update… ${info.progress || 0}%`, sub: `${files ? `${files} · ` : ""}used from the next start` };
  }
  if (exe.state === "downloading") return { tone: "busy", head: `Downloading version ${exe.version}… ${exe.progress || 0}%`, sub: "It installs when you restart." };
  if (info.state === "checking") return { tone: "busy", head: "Looking for updates…", sub: "" };
  if (info.state === "needs-app") return { tone: "warn", head: "A new version of the app is needed", sub: info.message || "" };
  if (info.state === "error") return { tone: "warn", head: "Couldn’t check for updates", sub: info.message || "The app will try again later." };
  if (!info.enabled) return { tone: "idle", head: "Updates are off in this copy", sub: "The installed app updates itself." };
  return { tone: "ok", head: "Vocab Master is up to date", sub: info.lastCheck ? `Checked ${when(info.lastCheck)}` : "" };
}

/** Settings → Updates (desktop only). */
export function updatesSectionHtml() {
  if (!desktop()?.updates) return "";
  return `<section class="settings-section">
      <h4>Updates</h4>
      <div class="upd-card" id="updCard"></div>
      <label class="switch"><input type="checkbox" id="updAuto" ${last?.auto === false ? "" : "checked"} /><span class="track"></span><span class="sw-text">Update automatically<small>New pages arrive quietly in the background and are used from the next start. Nothing you made is touched.</small></span></label>
      <p class="hint" id="updVersion"></p>
    </section>`;
}

export function wireUpdatesSection(root) {
  const card = root.querySelector("#updCard");
  if (!card) return;
  const render = (info) => {
    const d = describe(info);
    card.className = `upd-card ${d.tone}`;
    card.innerHTML = `<span class="upd-ico">${icon(d.tone === "ok" ? "check-circle" : d.tone === "warn" ? "alert" : d.tone === "ready" ? "download" : "refresh", "i-sm")}</span>
      <div class="upd-text"><b>${esc(d.head)}</b>${d.sub ? `<small>${esc(d.sub)}</small>` : ""}
        ${d.tone === "busy" && /\d+%/.test(d.head) ? `<span class="upd-bar"><i style="width:${Number(d.head.match(/(\d+)%/)[1])}%"></i></span>` : ""}</div>
      ${d.action ? `<button type="button" class="btn btn-primary btn-sm" data-upd="${d.action}">${esc(d.label)}</button>` : `<button type="button" class="btn btn-secondary btn-sm" data-upd="check" ${d.tone === "busy" || !info?.enabled ? "disabled" : ""}>${icon("refresh", "i-sm")}Check now</button>`}`;
    const v = root.querySelector("#updVersion");
    if (v && info) {
      v.textContent = `Version ${info.version}${info.live ? ` · pages updated ${when(info.live.date)} (${info.live.sha})` : info.build ? ` · pages from ${when(info.build.date)} (${info.build.sha})` : ""}`;
    }
    const auto = root.querySelector("#updAuto");
    if (auto && info) auto.checked = info.auto !== false;
  };
  render(last);
  desktop().updates.status().then((info) => { last = info; render(info); }).catch(() => {});
  const onInfo = (info) => { if (card.isConnected) render(info); else listeners.delete(onInfo); };
  listeners.add(onInfo);
  card.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-upd]");
    if (!b) return;
    const act = b.dataset.upd;
    if (act === "restart") { b.disabled = true; b.textContent = "Updating…"; return restart(); }
    if (act === "download") return desktop().updates.download();
    b.disabled = true;
    render({ ...(last || {}), state: "checking" });
    last = await desktop().updates.check().catch(() => last);
    render(last);
    if (last?.state === "current" && !["ready", "available"].includes(last.exe?.state)) toast("Vocab Master is up to date.", "ok", { ms: 2500 });
  });
  root.querySelector("#updAuto")?.addEventListener("change", async (e) => { last = await desktop().updates.setAuto(e.target.checked); render(last); });
}
