#!/usr/bin/env node
/* Contact sheet for reviewing pictures: tiles a batch or a phase (in job order) on a soft lilac background.
   Usage: node scripts/art/picture-sheet.mjs --batch phase-1-lesson-words-and-characters-001.md
          node scripts/art/picture-sheet.mjs --phase 0
   Output: art-brief/pictures/review/<name>.png (also prints the order, so you can match tiles to files). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { ROOT } from "../lib/env.mjs";

const DIR = path.join(ROOT, "art-brief", "pictures");
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const { jobs } = JSON.parse(fs.readFileSync(path.join(DIR, "jobs.json"), "utf8"));

let files = [];
let name = "";
if (opt("batch")) {
  name = path.basename(opt("batch"), ".md");
  const text = fs.readFileSync(path.join(DIR, "batches", path.basename(opt("batch"))), "utf8");
  files = [...text.matchAll(/\*\*([a-z0-9-]+\.png)\*\*/g)].map((m) => m[1]);
} else if (opt("phase") != null) {
  name = `phase-${opt("phase")}`;
  files = jobs.filter((j) => String(j.phase) === String(opt("phase"))).map((j) => j.file);
} else {
  console.log("Usage: --batch <batch file> | --phase <n>");
  process.exit(1);
}
const find = (f) => [path.join(DIR, "incoming", f), path.join(DIR, "done", f)].find((p) => fs.existsSync(p));
const hasAlpha = (file) => { const b = fs.readFileSync(file); return b[25] === 6 || b[25] === 4 || b.includes(Buffer.from("tRNS")); };
const present = files.map((f) => ({ f, p: find(f) })).filter((x) => x.p).map((x) => ({ ...x, alpha: hasAlpha(x.p) }));
if (!present.length) { console.log("No pictures yet for this selection."); process.exit(0); }

const TILE = 220;
const cols = Math.min(8, present.length);
const rowsN = Math.ceil(present.length / cols);
fs.mkdirSync(path.join(DIR, "review"), { recursive: true });
const out = path.join(DIR, "review", `${name}.png`);
// Each picture: magenta keyed out (if any), scaled, placed on a lilac canvas tile, then the tiles are stacked.
const inputs = present.flatMap((x) => ["-i", x.p]);
const parts = present.map((x, i) => `[${i}:v]format=rgba,${x.alpha ? "" : "colorkey=0xFF00FF:0.3:0.1,"}scale=${TILE - 20}:${TILE - 20}:force_original_aspect_ratio=decrease[s${i}];color=c=0xF3EFFF:s=${TILE}x${TILE}:d=1[g${i}];[g${i}][s${i}]overlay=(W-w)/2:(H-h)/2:shortest=1,format=rgb24[t${i}]`);
const blanks = cols * rowsN - present.length;
const fill = Array.from({ length: blanks }, (_, k) => `color=c=0xF3EFFF:s=${TILE}x${TILE}:d=1,format=rgb24[b${k}]`);
const cells = [...present.map((_, i) => `[t${i}]`), ...Array.from({ length: blanks }, (_, k) => `[b${k}]`)];
const layout = cells.map((_, i) => `${(i % cols) * TILE}_${Math.floor(i / cols) * TILE}`).join("|");
const graph = [...parts, ...fill, `${cells.join("")}xstack=inputs=${cells.length}:layout=${layout}:fill=0xF3EFFF[out]`].join(";");
execFileSync(ffmpegPath, ["-y", "-loglevel", "error", ...inputs, "-filter_complex", graph, "-map", "[out]", "-frames:v", "1", out]);
console.log(`Sheet: ${path.relative(ROOT, out)} (${present.length}/${files.length} pictures, ${cols} per row)`);
present.forEach((x, i) => console.log(`  ${String(i + 1).padStart(2)}. ${x.f}`));
