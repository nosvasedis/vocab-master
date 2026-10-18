#!/usr/bin/env node
/* Picture generator for the Vocab Master picture set, using Gemini Nano Banana 2.1 (gemini-nano-banana-2.1).
   Follows art-brief/pictures/PROMPT.md: sheet mode (6 pictures per 3x2 sheet) and single-image mode.
   Output: art-brief/pictures/sheets-incoming/<sheet id>.png (then slice-sheet.mjs cuts it), or
           art-brief/pictures/incoming/<file> for singles (1024x1024).
   Paths point at the main checkout, where the key (.env.local), the ledger and the pictures live.
   Usage:
     node scripts/art/gemini-pictures.mjs --sheet <sheet id> [--mode standard|batch]
     node scripts/art/gemini-pictures.mjs --single <file> [--mode standard|batch]
     node scripts/art/gemini-pictures.mjs --dry-run --sheet <sheet id>      (prints the prompt, no call) */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createLedger, BudgetError, PRICING } from "../lib/ledger.mjs";

const require = createRequire(import.meta.url);
const ffmpegPath = require("C:/Users/nvase/Downloads/Vocab Master/node_modules/ffmpeg-static");

const MAIN = "C:/Users/nvase/Downloads/Vocab Master";
const PICS = path.join(MAIN, "art-brief", "pictures");
const MODEL = "gemini-nano-banana-2.1";
const COST_USD = { standard: { "2K": 0.0504, "1K": 0.0336 }, batch: { "2K": 0.0252, "1K": 0.0168 } };
const CAP_NAME = "gemini-images";
const CAP_USD = 25;

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const DRY = args.includes("--dry-run");
const MODE = opt("mode") || "standard";
const SHEET_ID = opt("sheet");
const SINGLE = opt("single");

/* Reads GEMINI_API_KEY from the main checkout's .env.local. The value is never printed or logged. */
function loadKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const file = path.join(MAIN, ".env.local");
  const m = fs.readFileSync(file, "utf8").match(/^\s*GEMINI_API_KEY\s*=\s*(.*?)\s*$/m);
  if (!m) throw new Error("GEMINI_API_KEY missing from .env.local");
  return m[1].replace(/^["']|["']$/g, "");
}

const readJson = (f) => JSON.parse(fs.readFileSync(path.join(PICS, f), "utf8"));
const jobsRaw = readJson("jobs.json");
const jobs = Array.isArray(jobsRaw) ? jobsRaw : (jobsRaw.jobs || Object.values(jobsRaw));
const jobById = new Map(jobs.map((j) => [j.id, j]));
const sheetsCfg = readJson("sheets.json");

/* The style bible, verbatim from PROMPT.md section 3. */
const STYLE = "Warm, joyful children's picture-book illustration in soft flat vector shapes with gentle gradients and a very subtle paper grain. Rounded, friendly forms; bold simple silhouette; minimal detail; no thin lines. Bright but soft palette (sky blue, mint, sunny yellow, coral, lavender, leaf green, warm skin tones), slightly more saturated than a pastel background so the subject pops. Soft daylight from the upper left, a slightly darker edge tone instead of black outlines. Friendly faces with simple dot eyes and small smiles. Single subject, centred. Absolutely no text, letters, numbers, labels, logos, signs or writing anywhere. Not a photo, not 3D render, not emoji style.";

const BACKGROUND = "Flat pure #FF00FF magenta background everywhere except the pictures (no scene, no frame, no shadow box). Never use magenta inside a picture.";

function jobDescription(job) {
  const look = job.look ? ` Look: ${job.look}.` : "";
  const persona = job.personas?.[0] ? ` Personality: ${job.personas[0]}.` : "";
  if (job.kind === "character") {
    return `SUBJECT: story character ${job.name} (${job.role}).${look}${persona} FRAME: character, ${job.direction}`;
  }
  const greek = job.greek ? ` (sense from the Greek "${job.greek}")` : "";
  const example = job.examples?.[0] ? ` Used in: "${job.examples[0]}".` : "";
  const differ = [...(job.lookalikes || []), ...(job.sameLesson || [])].join(", ");
  return `"${job.word}" (${job.type}). Meaning: ${job.meaning}${greek}.${example} FRAME: ${job.frame}, ${job.direction} MAKE IT DIFFERENT FROM: ${differ || "nothing listed"}.`;
}

/* Sheet-only rules: the first test put a white vignette behind each picture, a scene instead of an object,
   and the word "no" written in cell 5. These lines block each of those. */
const SHEET_RULES = [
  "EACH CELL HOLDS ONE OBJECT OR ONE CHARACTER DRAWN ALONE, on the magenta background. No white shape, no circle, no panel and no scene behind any picture.",
  "NO WORDS ANYWHERE: no letters, no labels, no speech bubbles with text, no signs. A speech bubble may contain only a picture.",
  "Keep every picture entirely inside its own cell. Do not add a second item in any cell.",
];

function sheetPrompt(sheet) {
  const cells = sheet.cells.map((c) => `CELL ${c.cell}: ${jobDescription(jobById.get(c.id))}`).join("\n");
  return [
    `STYLE: ${STYLE}`,
    `LAYOUT: one 1536x1024 image, an invisible 3x2 grid of 512x512 cells numbered 1 2 3 (top row) and 4 5 6 (bottom row). Draw exactly one separate picture in the centre of each listed cell, inside the inner 80% of the cell, with at least 60 px of empty space between pictures. Leave unlisted cells empty. No grid lines, frames, numbers, labels, text or background scene.`,
    BACKGROUND,
    ...SHEET_RULES,
    cells,
  ].join("\n");
}

/* Redraw notes for singles that failed review: the exact picture to draw instead. */
const REDRAW_NOTES = {
  "w-live.png": "REDRAW NOTE: Leo standing happily at the front door of his own house, the house clearly his home, plant and welcome mat beside him. He is not leaving: no backpack, no walking out.",
  "c-pinocchio-puppet.png": "REDRAW NOTE: Pinocchio as a wooden puppet boy with visible wooden joints, a slightly long nose and a little hat. Drawn in the same soft flat vector style as the other characters, not flat geometric shapes.",
};

const TRANSPARENT = "Transparent background: the area around the subject must be fully transparent (alpha channel), with no colour, no box and no shadow card. Output a PNG with an alpha channel.";

function singlePrompt(job, bg = BACKGROUND) {
  return [
    `STYLE: ${STYLE}`,
    `OUTPUT: one 1024x1024 image, one subject centred with about 6% margin on every side, nothing touching the edge. ${bg}`,
    jobDescription(job),
    REDRAW_NOTES[job.file] || "",
  ].filter(Boolean).join("\n");
}

/* Reference images: the style reference and the anchor sheet, as the PROMPT asks. */
function refParts() {
  const files = [path.join(PICS, "..", "style-reference.png"), path.join(PICS, "anchor-sheet.png")];
  return files.filter((f) => fs.existsSync(f)).map((f) => ({
    inline_data: { mime_type: "image/png", data: fs.readFileSync(f).toString("base64") },
  }));
}

async function callModel({ prompt, aspectRatio, imageSize, key }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const body = {
    contents: [{ parts: [{ text: prompt }, ...refParts()] }],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio, imageSize } },
  };
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const text = await res.text();
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 4000 * (attempt + 1) ** 2));
      continue;
    }
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${text.slice(0, 300)}`);
    const data = JSON.parse(text);
    const part = (data.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData || p.inline_data);
    if (!part) throw new Error(`No image in reply: ${text.slice(0, 300)}`);
    return Buffer.from((part.inlineData || part.inline_data).data, "base64");
  }
  throw new Error("Gemini kept returning 429/5xx");
}

/* Scales the generated PNG to the exact size the slicer and the app expect. */
function resize(input, output, w, h) {
  execFileSync(ffmpegPath, ["-v", "error", "-y", "-i", input, "-vf", `scale=${w}:${h}:flags=lanczos`, output]);
}

async function main() {
  if (!SHEET_ID && !SINGLE) throw new Error("Give --sheet <id> or --single <file>");
  const isSheet = !!SHEET_ID;
  const prompt = isSheet
    ? sheetPrompt(sheetsCfg.sheets.find((s) => s.id === SHEET_ID) || (() => { throw new Error(`No sheet ${SHEET_ID}`); })())
    : singlePrompt(jobs.find((j) => j.file === SINGLE) || (() => { throw new Error(`No job for ${SINGLE}`); })());
  if (DRY) { console.log(prompt); return; }

  const tier = isSheet ? "2K" : "2K";
  const aspectRatio = isSheet ? "3:2" : "1:1";
  const usd = COST_USD[MODE][tier];
  const caps = { ...PRICING.caps, [CAP_NAME]: CAP_USD };
  const ledger = createLedger({
    caps,
    file: path.join(MAIN, "work", "state", "ledger.json"),
    budgetDoc: path.join(MAIN, "docs", "roadmap", "BUDGET.md"),
  });
  const job = isSheet ? `sheet ${SHEET_ID}` : `single ${SINGLE}`;
  ledger.assertCanSpend(CAP_NAME, usd, job);

  const key = loadKey();
  const png = await callModel({ prompt, aspectRatio, imageSize: tier, key });
  const tmp = path.join(PICS, `.raw-${Date.now()}.png`);
  fs.writeFileSync(tmp, png);
  const out = isSheet
    ? path.join(PICS, "sheets-incoming", `${SHEET_ID}.png`)
    : path.join(PICS, "incoming", SINGLE);
  if (isSheet) resize(tmp, out, 1536, 1024);
  else resize(tmp, out, 1024, 1024);
  fs.unlinkSync(tmp);
  ledger.record({ provider: CAP_NAME, model: MODEL, mode: MODE, usd, job });
  console.log(`wrote ${path.relative(MAIN, out)} (list price $${usd.toFixed(4)}, ${MODE}, ${tier})`);
}

main().catch((e) => {
  if (e instanceof BudgetError) console.error(`STOPPED by budget: ${e.message}`);
  else console.error(`ERROR: ${e.message}`);
  process.exit(1);
});
