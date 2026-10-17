#!/usr/bin/env node
/* Imports hand-made illustrations (e.g. from ChatGPT) into the app.
   Drop files named after a backdrop key (cave.png, snow.jpg …) or a unit (CPP1-U1.png) into art-brief/incoming/,
   then run: node scripts/art/import-art.mjs
   Each image is scaled to cover the target size, centre-cropped (keeping a little more of the bottom, where the
   ground is), encoded as WebP, written to desktop/renderer/assets/art/, and added to the art manifest.
   Processed originals move to art-brief/incoming/done/. Re-running replaces an image with the newer file. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { ROOT } from "../lib/env.mjs";

const STYLE = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "art-style.json"), "utf8"));
const ART = path.join(ROOT, "desktop", "renderer", "assets", "art");
const MANIFEST = path.join(ART, "manifest.json");
const IN = path.join(ROOT, "art-brief", "incoming");
const DONE = path.join(IN, "done");
const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : { v: 1, backdrops: {}, units: {} };
manifest.backdrops ||= {};
manifest.units ||= {};

fs.mkdirSync(DONE, { recursive: true });
const files = fs.readdirSync(IN).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
if (!files.length) { console.log(`No images in ${path.relative(ROOT, IN)} — save them there as <key>.png (e.g. cave.png).`); process.exit(0); }

const done = [];
const skipped = [];
for (const f of files) {
  const key = path.basename(f, path.extname(f)).trim().toLowerCase().replace(/\s+/g, "-");
  const unit = key.toUpperCase().match(/^CPP[123]-U[1-9]$/)?.[0];
  const isBackdrop = !!STYLE.backdrops[key];
  if (!unit && !isBackdrop) { skipped.push(`${f} (unknown name — use a backdrop key or CPP1-U1…)`); continue; }
  const { width, height, quality } = unit ? STYLE.unitHero : STYLE.backdrop;
  const rel = unit ? `units/${unit}.webp` : `backdrops/${key}.webp`;
  const out = path.join(ART, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  // Cover-scale, then crop with the window 60% of the way down (ground matters more than sky).
  const vf = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}:(iw-${width})/2:(ih-${height})*0.6`;
  try {
    execFileSync(ffmpegPath, ["-y", "-loglevel", "error", "-i", path.join(IN, f), "-vf", vf, "-c:v", "libwebp", "-quality", String(quality), "-frames:v", "1", out]);
  } catch (e) { skipped.push(`${f} (ffmpeg: ${String(e.message).slice(0, 80)})`); continue; }
  if (unit) manifest.units[unit] = rel; else manifest.backdrops[key] = rel;
  fs.renameSync(path.join(IN, f), path.join(DONE, f));
  done.push(`${key} → ${rel} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
}
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + "\n");
const missing = Object.keys(STYLE.backdrops).filter((k) => !manifest.backdrops[k]);
console.log(`Imported ${done.length}:\n  ${done.join("\n  ") || "—"}`);
if (skipped.length) console.log(`Skipped ${skipped.length}:\n  ${skipped.join("\n  ")}`);
console.log(missing.length ? `Backdrops still without art (${missing.length}): ${missing.join(", ")}` : "Every backdrop has art ✓");
