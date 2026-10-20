/* Writes renderer/live-base.json before each build: the commit the exe is built from and the Git fingerprint of
   every page file in it. The installed app compares these with GitHub's main branch to fetch only what changed
   (live-update.js). Runs automatically as "predist". Uncommitted page changes are fine for testing but are listed,
   because the live updater can't know about them. */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const desktop = path.join(__dirname, "..");
const git = (...args) => execFileSync("git", args, { cwd: desktop, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();

let commit;
try { commit = git("rev-parse", "HEAD"); } catch {
  console.warn("live-base: not a Git checkout — the built app won't look for live updates.");
  fs.rmSync(path.join(desktop, "renderer", "live-base.json"), { force: true });
  process.exit(0);
}
const date = git("log", "-1", "--format=%cI");
const files = {};
for (const line of git("ls-files", "-s", "--", "renderer").split("\n")) {
  const m = line.match(/^\d+ ([0-9a-f]{40}) \d+\trenderer\/(.+)$/);
  if (m) files[m[2]] = m[1];
}
const dirty = git("status", "--porcelain", "--", "renderer").split("\n").filter(Boolean);
if (dirty.length) console.warn(`live-base: ${dirty.length} page file(s) differ from the commit (fine for testing; commit before a release):\n  ${dirty.slice(0, 10).join("\n  ")}`);
fs.writeFileSync(path.join(desktop, "renderer", "live-base.json"), JSON.stringify({ commit, date, files }));
console.log(`live-base: ${Object.keys(files).length} page files at ${commit.slice(0, 7)} (${date})`);
