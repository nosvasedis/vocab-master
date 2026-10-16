/* electron-builder afterPack hook (Windows only).
 * Because `signAndEditExecutable: false` skips resource editing on this
 * machine (winCodeSign cache can't extract macOS symlinks), we embed the
 * icon + version metadata ourselves using the rcedit-x64.exe that IS
 * already present in electron-builder's winCodeSign cache.
 * This runs after win-unpacked is assembled, so the icon ends up both in
 * the unpacked folder and inside the portable archive.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;

  const exe = path.join(context.appOutDir, "Vocab Master.exe");
  if (!fs.existsSync(exe)) return;

  // Locate rcedit-x64.exe inside the winCodeSign builder cache.
  const cacheRoot = path.join(
    process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
    "electron-builder", "Cache", "winCodeSign"
  );
  let rcedit = null;
  try {
    for (const dir of fs.readdirSync(cacheRoot)) {
      const cand = path.join(cacheRoot, dir, "rcedit-x64.exe");
      if (fs.existsSync(cand)) { rcedit = cand; break; }
    }
  } catch { /* ignore */ }
  if (!rcedit) {
    console.warn("afterPack: rcedit not found, skipping icon embed");
    return;
  }

  const icon = path.join(__dirname, "..", "build", "icon.ico");
  const args = [exe, "--set-icon", icon];
  const ver = context.packager.appInfo.version || "1.0.0";
  for (const [k, v] of Object.entries({
    ProductName: "Vocab Master",
    FileDescription: "Vocab Master — vocabulary and dictation worksheets",
    CompanyName: "Vocab Master",
    LegalCopyright: "© Vocab Master",
  })) {
    args.push("--set-version-string", k, v);
  }
  args.push("--set-product-version", ver, "--set-file-version", ver);

  try {
    execFileSync(rcedit, args, { stdio: "pipe" });
    console.log("afterPack: icon + version embedded into", path.basename(exe));
  } catch (err) {
    console.error("afterPack: rcedit failed:", err.message);
  }
};
