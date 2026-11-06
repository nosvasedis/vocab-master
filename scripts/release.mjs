#!/usr/bin/env node
/* One command for a new version of the app (the exe) — needed only when the app shell changes (desktop/src-tauri),
   voice clips change, or SHELL_API goes up; everyday page changes reach teachers by themselves (live updates,
   desktop/src-tauri/src/live.rs) as soon as they are pushed to main.

     1. bump "version" in package.json and desktop/package.json (and the README file names), commit, push
     2. npm run release [-- --notes notes.md]

   Checks: on main, nothing uncommitted, pushed, the tag is new, the update signing key is there. Then: tests (pages
   and shell), the build (desktop/scripts/dist.mjs: writes renderer/live-base.json, embeds the pages, checks they
   didn't change), the built app's smoke test, and a GitHub release with the Setup and Portable exes plus
   latest.json (signed), so installed copies update themselves (tauri-plugin-updater). */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT } from "./lib/env.mjs";

const run = (cmd, args, opts = {}) => {
  console.log(`\n▶ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32", ...opts });
  if (r.status !== 0) { console.error(`✗ ${cmd} ${args.join(" ")} failed`); process.exit(1); }
};
const out = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8" }).trim();
const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

const version = JSON.parse(fs.readFileSync(path.join(ROOT, "desktop", "package.json"), "utf8")).version;
const rootVersion = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
const tag = `v${version}`;
if (rootVersion !== version) fail(`package.json says ${rootVersion} but desktop/package.json says ${version}.`);
if (out("git", ["rev-parse", "--abbrev-ref", "HEAD"]) !== "main") fail("Release from main.");
if (out("git", ["status", "--porcelain"])) fail("Commit (or stash) your changes first — the app checks its pages against the commit it's built from.");
out("git", ["fetch", "-q", "origin", "main", "--tags"]);
if (out("git", ["rev-parse", "HEAD"]) !== out("git", ["rev-parse", "origin/main"])) fail("Push main first.");
if (out("git", ["tag", "-l", tag])) fail(`${tag} already exists — bump the version in package.json and desktop/package.json.`);
if (!process.env.TAURI_SIGNING_PRIVATE_KEY && !fs.existsSync(path.join(os.homedir(), ".tauri", "vocab-master-updater.key"))) {
  fail("The update signing key is missing (~/.tauri/vocab-master-updater.key or TAURI_SIGNING_PRIVATE_KEY) — installed apps only take signed updates.");
}

const notesArg = process.argv.indexOf("--notes");
let notesFile = notesArg > 0 ? path.resolve(process.argv[notesArg + 1]) : "";
if (!notesFile) {
  // Notes from the commits since the last release.
  const last = out("git", ["describe", "--tags", "--abbrev=0"]).trim();
  const lines = out("git", ["log", `${last}..HEAD`, "--no-merges", "--format=- %s"]).split("\n").filter((l) => /^- (feat|fix)/.test(l)).map((l) => l.replace(/^- (feat|fix)(\([^)]*\))?:\s*/, "- "));
  notesFile = path.join(os.tmpdir(), `vocab-master-notes-${version}.md`);
  fs.writeFileSync(notesFile, `### Vocab Master ${version}\n\n**Install:** Vocab-Master-Setup-${version}.exe (recommended — it keeps itself up to date) or Vocab-Master-Portable-${version}.exe.\n\n#### What's new\n${lines.join("\n") || "- Improvements and fixes."}\n`);
}

run("npm", ["test"]);
run("npm", ["run", "test:shell"]);
run("npm", ["run", "dist"]);
const rel = path.join(ROOT, "desktop", "release");
const setup = path.join(rel, `Vocab-Master-Setup-${version}.exe`);
const portable = path.join(rel, `Vocab-Master-Portable-${version}.exe`);
const latest = path.join(rel, "latest.json");
const files = [setup, `${setup}.sig`, portable, latest];
for (const f of files) if (!fs.existsSync(f)) fail(`Missing ${path.basename(f)} after the build.`);
const manifest = JSON.parse(fs.readFileSync(latest, "utf8"));
if (manifest.version !== version || !manifest.platforms?.["windows-x86_64"]?.signature) fail("latest.json is for another version or unsigned.");
// The built app, with its pages inside, drives itself end to end.
run(process.execPath, [path.join(ROOT, "desktop", "scripts", "smoke.mjs"), portable], { shell: false });
run("gh", ["release", "create", tag, ...files, "--target", "main", "--title", `Vocab Master ${version}`, "--notes-file", notesFile, "--latest"], { shell: false });
console.log(`\n✓ ${tag} is published. Installed copies (Setup) download it in the background and install it when they restart or close.`);
