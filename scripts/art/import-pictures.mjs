#!/usr/bin/env node
/* Imports finished pictures (art-brief/pictures/incoming/*.png) into the app:
   – removes a flat #FF00FF background if the PNG has no transparency,
   – encodes 512×512 WebP with alpha → desktop/renderer/assets/pics/<id>.webp,
   – updates desktop/renderer/assets/pics/manifest.json:
       words: { "<english lowercase>|<type>": file }   (lesson words, props and word-bank words)
       nouns: { "<singular stem>": file }               (lets story props find their picture)
       characters: { "<lesson id>|<cast key>": file }   (story characters, per lesson)
       ui: { "<id>": file }                            (game avatars and team mascots)
   – moves the original to art-brief/pictures/done/,
   – places phase 4–5 pictures in assets/pics/bank/ (served from R2, listed in manifest.remote); phases 0–3 stay bundled.
   Usage: node scripts/art/import-pictures.mjs [--dry-run] */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { ROOT } from "../lib/env.mjs";
import { stem } from "../../desktop/renderer/lesson/schema.js";

const DRY = process.argv.includes("--dry-run");
const DIR = path.join(ROOT, "art-brief", "pictures");
const IN = path.join(DIR, "incoming");
const DONE = path.join(DIR, "done");
const OUT = path.join(ROOT, "desktop", "renderer", "assets", "pics");
const MANIFEST = path.join(OUT, "manifest.json");
const SIZE = 512;
const { jobs } = JSON.parse(fs.readFileSync(path.join(DIR, "jobs.json"), "utf8"));
const byFile = new Map(jobs.map((j) => [j.file, j]));
const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : { v: 1 };
for (const k of ["words", "nouns", "characters", "ui"]) manifest[k] ||= {};

const hasAlpha = (file) => {
  const b = fs.readFileSync(file);
  return b[25] === 6 || b[25] === 4 || b.includes(Buffer.from("tRNS"));
};

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(DONE, { recursive: true });
const files = fs.existsSync(IN) ? fs.readdirSync(IN).filter((f) => f.endsWith(".png")) : [];
let imported = 0;
const skipped = [];
for (const f of files) {
  const job = byFile.get(f);
  if (!job) { skipped.push(`${f} (not a job)`); continue; }
  const src = path.join(IN, f);
  const rel = `${job.id}.webp`;
  const key = hasAlpha(src) ? "" : "colorkey=0xFF00FF:0.3:0.1,";
  const vf = `${key}scale=${SIZE}:${SIZE}:force_original_aspect_ratio=decrease,pad=${SIZE}:${SIZE}:(ow-iw)/2:(oh-ih)/2:color=black@0,format=yuva420p`;
  if (!DRY) {
    try {
      execFileSync(ffmpegPath, ["-y", "-loglevel", "error", "-i", src, "-vf", vf, "-c:v", "libwebp", "-quality", "82", "-frames:v", "1", path.join(OUT, rel)]);
    } catch (e) { skipped.push(`${f} (ffmpeg: ${String(e.message).slice(0, 80)})`); continue; }
  }
  if (job.kind === "word") {
    manifest.words[`${job.word.toLowerCase()}|${job.type}`] = rel;
    if (job.type === "noun" || job.frame !== "action") manifest.nouns[stem(job.word)] ||= rel;
    for (const label of job.props || []) manifest.nouns[stem(label)] ||= rel;
  } else if (job.kind === "character") {
    for (const u of job.uses || []) manifest.characters[`${u.lesson}|${u.cast}`] = rel;
  } else {
    manifest.ui[job.id] = rel;
  }
  if (!DRY) fs.renameSync(src, path.join(DONE, f));
  imported++;
}
// Delivery split: phases 0–3 (lessons, characters, story props, avatars) ship inside the app; phases 4–5 (the rest
// of the word bank) go to bank/ — gitignored, left out of the build, uploaded to R2 by scripts/packs/publish.mjs --pics.
const BANK = path.join(OUT, "bank");
manifest.remote = [];
if (!DRY) fs.mkdirSync(BANK, { recursive: true });
for (const job of jobs) {
  const f = `${job.id}.webp`;
  const remote = job.phase >= 4;
  const [from, to] = remote ? [path.join(OUT, f), path.join(BANK, f)] : [path.join(BANK, f), path.join(OUT, f)];
  if (!DRY && fs.existsSync(from) && !fs.existsSync(to)) fs.renameSync(from, to);
  if (remote) manifest.remote.push(f);
}
if (!DRY) fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + "\n");
const kbIn = (d) => (fs.existsSync(d) ? Math.round(fs.readdirSync(d).filter((f) => f.endsWith(".webp")).reduce((s, f) => s + fs.statSync(path.join(d, f)).size, 0) / 1024) : 0);
console.log(`${DRY ? "Would import" : "Imported"} ${imported} picture(s) → desktop/renderer/assets/pics (${kbIn(OUT)} KB bundled · ${kbIn(BANK)} KB in bank/ for R2, ${manifest.remote.length} files)`);
if (skipped.length) console.log(`Skipped:\n  ${skipped.join("\n  ")}`);
