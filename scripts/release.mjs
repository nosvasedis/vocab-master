#!/usr/bin/env node
/* One command for a new version of the app (the exe) — needed only when the app shell changes (desktop/main.js,
   preload.cjs, Electron, voice clips) or SHELL_API goes up; everyday page changes reach teachers by themselves
   (live updates, desktop/live-update.js) as soon as they are pushed to main.

     1. bump "version" in package.json and desktop/package.json (and the README file names), commit, push
     2. npm run release [-- --notes notes.md]

   Checks: on main, nothing uncommitted, pushed, the tag is new. Then: tests, build (writes renderer/live-base.json),
   package check, the packaged app's smoke test, and a GitHub release with the Setup and Portable exes plus
   latest.yml and the blockmap, so installed copies update themselves (electron-updater). */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
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

const notesArg = process.argv.indexOf("--notes");
let notesFile = notesArg > 0 ? path.resolve(process.argv[notesArg + 1]) : "";
if (!notesFile) {
  // Notes from the commits since the last release.
  const last = out("git", ["describe", "--tags", "--abbrev=0"]).trim();
  const lines = out("git", ["log", `${last}..HEAD`, "--no-merges", "--format=- %s"]).split("\n").filter((l) => /^- (feat|fix)/.test(l)).map((l) => l.replace(/^- (feat|fix)(\([^)]*\))?:\s*/, "- "));
  notesFile = path.join(ROOT, "desktop", "release", `notes-${version}.md`);
  fs.mkdirSync(path.dirname(notesFile), { recursive: true });
  fs.writeFileSync(notesFile, `### Vocab Master ${version}\n\n**Install:** Vocab-Master-Setup-${version}.exe (recommended — it keeps itself up to date) or Vocab-Master-Portable-${version}.exe.\n\n#### What's new\n${lines.join("\n") || "- Improvements and fixes."}\n`);
}

run("npm", ["test"]);
run("npm", ["run", "dist"]);
const rel = path.join(ROOT, "desktop", "release");
const setup = path.join(rel, `Vocab-Master-Setup-${version}.exe`);
const portable = path.join(rel, `Vocab-Master-Portable-${version}.exe`);
const files = [setup, portable, path.join(rel, "latest.yml"), `${setup}.blockmap`];
for (const f of files) if (!fs.existsSync(f)) fail(`Missing ${path.basename(f)} after the build.`);
const yml = fs.readFileSync(path.join(rel, "latest.yml"), "utf8");
if (!yml.includes(`version: ${version}`)) fail("latest.yml is for another version.");
run(path.join(rel, "win-unpacked", "Vocab Master.exe"), ["--smoke"], { shell: false });
run("gh", ["release", "create", tag, ...files, "--target", "main", "--title", `Vocab Master ${version}`, "--notes-file", notesFile, "--latest"], { shell: false });
console.log(`\n✓ ${tag} is published. Installed copies (Setup) download it in the background and install it on their next restart.`);
