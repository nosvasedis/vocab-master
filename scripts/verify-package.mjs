#!/usr/bin/env node
/* Byte-compares every file packed into desktop/release/win-unpacked/resources/app.asar with its source.
   A file that changes while electron-builder packs (e.g. audio being collected) shifts all later offsets
   and ships a scrambled app — run this after every `npm run dist`. Exit 1 on any mismatch. */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ROOT } from "./lib/env.mjs";

const require = createRequire(path.join(ROOT, "desktop", "package.json"));
const asar = require("@electron/asar");
const archive = path.join(ROOT, "desktop", "release", "win-unpacked", "resources", "app.asar");
const files = asar.listPackage(archive).map((f) => f.replace(/^[\\/]/, "")).filter((f) => f.startsWith(`renderer${path.sep}`) || ["main.js", "preload.cjs", "chatgpt.js"].includes(f));
let checked = 0;
const bad = [];
for (const rel of files) {
  const src = path.join(ROOT, "desktop", rel);
  if (!fs.existsSync(src) || fs.statSync(src).isDirectory()) continue;
  let packed;
  try { packed = asar.extractFile(archive, rel); } catch { continue; } // directories
  checked++;
  if (!packed.equals(fs.readFileSync(src))) bad.push(rel);
}
console.log(`${checked} packed files checked against source`);
if (bad.length) {
  console.log(`✗ ${bad.length} differ (packaging was disturbed — rebuild with nothing writing to desktop/renderer):\n  ${bad.slice(0, 20).join("\n  ")}`);
  process.exit(1);
}
console.log("✓ package matches source");
