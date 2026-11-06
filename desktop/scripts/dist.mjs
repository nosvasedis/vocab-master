#!/usr/bin/env node
/* Build the Windows app (Tauri) into desktop/release/:
 *   Vocab-Master-Setup-<v>.exe      the installer (per user, no admin; it keeps itself up to date)
 *   Vocab-Master-Setup-<v>.exe.sig  its update signature
 *   Vocab-Master-Portable-<v>.exe   one exe with the pages inside, nothing to install
 *   latest.json                     what installed apps read to update themselves (tauri-plugin-updater)
 * Steps: renderer/live-base.json (live-base.cjs) → fingerprint the pages → `tauri build` (the pages are embedded in
 * the exe) → the pages must be unchanged afterwards (a file written mid-build would ship a different app) → collect.
 * Update signing key: TAURI_SIGNING_PRIVATE_KEY (a path or the key), else ~/.tauri/vocab-master-updater.key.
 * Never commit that key; without it installed apps can't take new versions. */
import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DESKTOP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RENDERER = path.join(DESKTOP, "renderer");
const OUT = path.join(DESKTOP, "release");
const REPO = "nosvasedis/vocab-master";
const version = JSON.parse(fs.readFileSync(path.join(DESKTOP, "package.json"), "utf8")).version;
const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

function fingerprint(dir) {
  const h = crypto.createHash("sha256");
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else h.update(path.relative(dir, p)).update("\0").update(fs.readFileSync(p));
    }
  };
  walk(dir);
  return h.digest("hex");
}

execFileSync(process.execPath, [path.join(DESKTOP, "scripts", "live-base.cjs")], { stdio: "inherit" });
const before = fingerprint(RENDERER);

const keyFile = path.join(os.homedir(), ".tauri", "vocab-master-updater.key");
const env = { ...process.env };
if (!env.TAURI_SIGNING_PRIVATE_KEY) {
  if (!fs.existsSync(keyFile)) fail(`No update signing key: set TAURI_SIGNING_PRIVATE_KEY or restore ${keyFile}.`);
  env.TAURI_SIGNING_PRIVATE_KEY = fs.readFileSync(keyFile, "utf8").trim();
}
env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??= "";
env.PATH = `${path.join(os.homedir(), ".cargo", "bin")}${path.delimiter}${env.PATH}`;
console.log(`\n▶ tauri build (Vocab Master ${version})`);
const r = spawnSync("npx", ["tauri", "build"], { cwd: DESKTOP, stdio: "inherit", env, shell: process.platform === "win32" });
if (r.status !== 0) fail("tauri build failed");
if (fingerprint(RENDERER) !== before) fail("desktop/renderer changed during the build — rebuild with nothing writing to it.");
console.log("✓ the pages were unchanged during the build");

const target = path.join(DESKTOP, "src-tauri", "target", "release");
const setupSrc = path.join(target, "bundle", "nsis", `Vocab Master_${version}_x64-setup.exe`);
const exeSrc = path.join(target, "Vocab Master.exe");
for (const f of [setupSrc, `${setupSrc}.sig`, exeSrc]) if (!fs.existsSync(f)) fail(`Missing ${f} after the build.`);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const setup = `Vocab-Master-Setup-${version}.exe`;
const portable = `Vocab-Master-Portable-${version}.exe`;
fs.copyFileSync(setupSrc, path.join(OUT, setup));
fs.copyFileSync(`${setupSrc}.sig`, path.join(OUT, `${setup}.sig`));
fs.copyFileSync(exeSrc, path.join(OUT, portable));
const latest = {
  version,
  notes: `Vocab Master ${version}`,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature: fs.readFileSync(`${setupSrc}.sig`, "utf8").trim(),
      url: `https://github.com/${REPO}/releases/download/v${version}/${setup}`,
    },
  },
};
fs.writeFileSync(path.join(OUT, "latest.json"), JSON.stringify(latest, null, 2));
const mb = (f) => `${(fs.statSync(path.join(OUT, f)).size / 1048576).toFixed(1)} MB`;
console.log(`\n✓ desktop/release:\n  ${setup} (${mb(setup)})\n  ${portable} (${mb(portable)})\n  ${setup}.sig, latest.json`);
