/* Vocab Master — updates of the app itself (the exe), for the rare changes live updates can't carry
 * (main process, Electron, voice clips).
 *   - Installed with the Setup exe: electron-updater downloads the new installer from the latest GitHub release in
 *     the background and installs it when the teacher restarts (or quits) — nothing to click through.
 *   - The portable exe can't replace itself: the teacher is told a new version exists, with a download link. */
import { createRequire } from "node:module";
import { isNewerVersion, REPO } from "./live-update.js";

const require = createRequire(import.meta.url);

export function createExeUpdater({ app, io, log = () => {} }) {
  const portable = !!process.env.PORTABLE_EXECUTABLE_DIR;
  let status = { kind: portable ? "portable" : "installer", state: "idle", version: "", url: "", progress: 0 };
  const listeners = new Set();
  const set = (next) => { status = { ...status, ...next }; listeners.forEach((fn) => fn(status)); };
  let updater = null;

  function autoUpdater() {
    if (updater) return updater;
    const { autoUpdater: u } = require("electron-updater");
    u.autoDownload = true;
    u.autoInstallOnAppQuit = true;
    u.allowPrerelease = false;
    u.logger = { info: () => {}, warn: (m) => log("exe:", m), error: (m) => log("exe:", m), debug: () => {} };
    u.on("update-available", (i) => set({ state: "downloading", version: i?.version || "", progress: 0 }));
    u.on("download-progress", (p) => set({ state: "downloading", progress: Math.round(p?.percent || 0) }));
    u.on("update-downloaded", (i) => set({ state: "ready", version: i?.version || status.version, progress: 100 }));
    u.on("update-not-available", () => set({ state: "current" }));
    u.on("error", (e) => { log("exe: update failed", e?.message); set({ state: "error" }); });
    updater = u;
    return u;
  }

  async function check() {
    if (!app.isPackaged) return status;
    try {
      if (portable) {
        const rel = await io.fetchJson(`https://api.github.com/repos/${REPO}/releases/latest`);
        const tag = String(rel?.tag_name || "");
        if (tag && isNewerVersion(tag, app.getVersion())) set({ state: "available", version: tag.replace(/^v/i, ""), url: rel.html_url || `https://github.com/${REPO}/releases/latest` });
        else set({ state: "current" });
      } else {
        await autoUpdater().checkForUpdates();
      }
    } catch (e) {
      log("exe: check failed", e?.message);
      set({ state: "error" });
    }
    return status;
  }

  /** Restart into the downloaded version (installer only). */
  function install() {
    if (status.state !== "ready" || portable) return false;
    autoUpdater().quitAndInstall(true, true);
    return true;
  }

  return {
    check, install,
    get status() { return status; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
