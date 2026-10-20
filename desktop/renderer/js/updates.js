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
    if (note?.sha) toast(`Vocab Master was updated${note.message ? ` — ${note.message}` : ""}.`, "ok", { ms: 6000 });
  } catch { /* an older app without updates */ }
  u.onChange((info) => { last = info; announce(info); listeners.forEach((fn) => fn(info)); });
  last = await u.status().catch(() => null);
}

/** Toasts for news, each said once. */
function announce(info) {
  if (info.exe?.state === "ready" && toldExe !== `ready${info.exe.version}`) {
    toldExe = `ready${info.exe.version}`;
    toast(`Version ${info.exe.version} of Vocab Master is ready.`, "ok", { ms: 12000, actions: [{ label: "Restart to install", run: restart }] });
  } else if (info.exe?.state === "available" && toldExe !== `avail${info.exe.version}`) {
    toldExe = `avail${info.exe.version}`;
    toast(`Version ${info.exe.version} of Vocab Master is available.`, "info", { ms: 12000, actions: [{ label: "Download", run: () => desktop()?.updates?.download() }] });
  } else if (info.state === "ready" && info.pending && toldReady !== info.pending.sha) {
    toldReady = info.pending.sha;
    toast(`An update is ready${info.pending.message ? `: ${info.pending.message}` : ""}. It’s used from the next start.`, "ok", { ms: 10000, actions: [{ label: "Restart now", run: restart }] });
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
  if (info.state === "ready") return { tone: "ready", head: "An update is ready", sub: info.pending?.message ? `What’s new: ${info.pending.message}` : "It’s used from the next start.", action: "restart", label: "Restart now" };
  if (info.state === "downloading") return { tone: "busy", head: `Getting the update… ${info.progress || 0}%`, sub: info.message || "" };
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
    if (act === "restart") return restart();
    if (act === "download") return desktop().updates.download();
    b.disabled = true;
    render({ ...(last || {}), state: "checking" });
    last = await desktop().updates.check().catch(() => last);
    render(last);
    if (last?.state === "current" && !["ready", "available"].includes(last.exe?.state)) toast("Vocab Master is up to date.", "ok", { ms: 2500 });
  });
  root.querySelector("#updAuto")?.addEventListener("change", async (e) => { last = await desktop().updates.setAuto(e.target.checked); render(last); });
}
