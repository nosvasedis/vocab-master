#!/usr/bin/env node
/* Sheet mode through the Gemini Batch API (50% of the standard price), model gemini-nano-banana-2.1, 2K.
   Each request is one 3x2 sheet from art-brief/pictures/sheets.json; results are written to a trial folder
   for review (nothing goes into the pipeline until it has been checked).
   Usage:
     node scripts/art/gemini-batch-sheets.mjs submit --sheets id1,id2,...   (or --trial 20)
     node scripts/art/gemini-batch-sheets.mjs status <batches/ID>
     node scripts/art/gemini-batch-sheets.mjs collect <batches/ID> --out <folder> */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { createLedger, BudgetError, PRICING } from "../lib/ledger.mjs";

const require = createRequire(import.meta.url);
const ffmpegPath = require("C:/Users/nvase/Downloads/Vocab Master/node_modules/ffmpeg-static");

const MAIN = "C:/Users/nvase/Downloads/Vocab Master";
const PICS = path.join(MAIN, "art-brief", "pictures");
const MODEL = "gemini-nano-banana-2.1";
const BATCH_USD_2K = 0.0252; // batch price per 2K image, from the official pricing page
const CAP = "gemini-images";
const CAP_USD = 25;
const SCRATCH = process.env.SCRATCH_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "batch-work");

import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };

function loadKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const m = fs.readFileSync(path.join(MAIN, ".env.local"), "utf8").match(/^\s*GEMINI_API_KEY\s*=\s*(.*?)\s*$/m);
  if (!m) throw new Error("GEMINI_API_KEY missing from .env.local");
  return m[1].replace(/^["']|["']$/g, "");
}

const readJson = (f) => JSON.parse(fs.readFileSync(path.join(PICS, f), "utf8"));
const jobsRaw = readJson("jobs.json");
const jobs = Array.isArray(jobsRaw) ? jobsRaw : (jobsRaw.jobs || Object.values(jobsRaw));
const jobById = new Map(jobs.map((j) => [j.id, j]));
const sheetsCfg = readJson("sheets.json");

const STYLE = "Warm, joyful children's picture-book illustration in soft flat vector shapes with gentle gradients and a very subtle paper grain. Rounded, friendly forms; bold simple silhouette; minimal detail; no thin lines. Bright but soft palette (sky blue, mint, sunny yellow, coral, lavender, leaf green, warm skin tones), slightly more saturated than a pastel background so the subject pops. Soft daylight from the upper left, a slightly darker edge tone instead of black outlines. Friendly faces with simple dot eyes and small smiles. Single subject, centred. Absolutely no text, letters, numbers, labels, logos, signs or writing anywhere. Not a photo, not 3D render, not emoji style.";

const SHEET_RULES = [
  "BACKGROUND: the whole image background is one pure #FF00FF magenta (no lighter pink, no tiles, no squares, no panels, no grid lines drawn on the image).",
  "EACH CELL HOLDS ONE OBJECT OR ONE CHARACTER DRAWN ALONE, directly on the magenta background. No white shape, no circle, no rounded panel and no scene behind any picture.",
  "NO WORDS ANYWHERE: no letters, no labels, no speech bubbles with text, no signs. A speech bubble may contain only a picture.",
  "Keep every picture entirely inside its own cell. Do not put two different items in one cell.",
];

function jobDescription(job) {
  const look = job.look ? ` Look: ${job.look}.` : "";
  const persona = job.personas?.[0] ? ` Personality: ${job.personas[0]}.` : "";
  if (job.kind === "character") return `SUBJECT: story character ${job.name} (${job.role}).${look}${persona} FRAME: character, ${job.direction}`;
  const greek = job.greek ? ` (sense from the Greek "${job.greek}")` : "";
  const example = job.examples?.[0] ? ` Used in: "${job.examples[0]}".` : "";
  const differ = [...(job.lookalikes || []), ...(job.sameLesson || [])].join(", ");
  return `"${job.word}" (${job.type}). Meaning: ${job.meaning}${greek}.${example} FRAME: ${job.frame}, ${job.direction} MAKE IT DIFFERENT FROM: ${differ || "nothing listed"}.`;
}

function sheetPrompt(sheet) {
  const cells = sheet.cells.map((c) => `CELL ${c.cell}: ${jobDescription(jobById.get(c.id))}`).join("\n");
  return [
    `STYLE: ${STYLE}`,
    "LAYOUT: one 1536x1024 image, an invisible 3x2 grid of 512x512 cells numbered 1 2 3 (top row) and 4 5 6 (bottom row). Draw exactly one separate picture in the centre of each listed cell, inside the inner 80% of the cell, with at least 60 px of empty space between pictures. Leave unlisted cells empty. No grid lines, frames, numbers, labels, text or background scene.",
    ...SHEET_RULES,
    cells,
  ].join("\n");
}

/* Style references, shrunk to 512 px JPEG so a batch of sheets stays well under the 20 MB inline limit. */
function refParts() {
  fs.mkdirSync(SCRATCH, { recursive: true });
  const parts = [];
  for (const [name, src] of [["style", path.join(PICS, "..", "style-reference.png")], ["anchor", path.join(PICS, "anchor-sheet.png")]]) {
    if (!fs.existsSync(src)) continue;
    const dst = path.join(SCRATCH, `ref-${name}.jpg`);
    execFileSync(ffmpegPath, ["-v", "error", "-y", "-i", src, "-vf", "scale=512:-1", "-q:v", "4", dst]);
    parts.push({ inline_data: { mime_type: "image/jpeg", data: fs.readFileSync(dst).toString("base64") } });
  }
  return parts;
}

function buildRequest(sheet, refs) {
  return {
    request: {
      contents: [{ parts: [{ text: sheetPrompt(sheet) }, ...refs] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "3:2", imageSize: "2K" } },
    },
    metadata: { key: sheet.id },
  };
}

async function api(method, url, body, key) {
  const res = await fetch(url, { method, headers: { "x-goog-api-key": key, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${method} ${url.split("?")[0]}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

async function submit() {
  let ids;
  if (opt("sheets")) ids = opt("sheets").split(",");
  else {
    const n = Number(opt("trial") || 0);
    if (!n) throw new Error("Give --sheets <ids> or --trial <n>");
    const done = new Set(fs.readdirSync(path.join(PICS, "sheets-done")).map((f) => f.replace(/\.png$/, "")));
    ids = sheetsCfg.sheets.map((s) => s.id).filter((id) => !done.has(id)).slice(0, n);
    if (!ids.includes("s1-CPP1-U4-A-1")) ids = ["s1-CPP1-U4-A-1", ...ids.slice(0, n - 1)];
  }
  const sheets = ids.map((id) => sheetsCfg.sheets.find((s) => s.id === id) || (() => { throw new Error(`No sheet ${id}`); })());
  const usd = sheets.length * BATCH_USD_2K;
  const ledger = createLedger({
    caps: { ...PRICING.caps, [CAP]: CAP_USD },
    file: path.join(MAIN, "work", "state", "ledger.json"),
    budgetDoc: path.join(MAIN, "docs", "roadmap", "BUDGET.md"),
  });
  ledger.assertCanSpend(CAP, usd, `batch of ${sheets.length} sheets`);

  const key = loadKey();
  const refs = refParts();
  const body = {
    batch: {
      display_name: `sheets-trial-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`,
      input_config: { requests: { requests: sheets.map((s) => buildRequest(s, refs)) } },
    },
  };
  const payload = JSON.stringify(body);
  if (payload.length > 19 * 1024 * 1024) throw new Error(`Batch payload ${Math.round(payload.length / 1e6)} MB is over the 20 MB inline limit; use a file batch.`);
  const op = await api("POST", `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchGenerateContent`, body, key);
  const name = op.name || op.metadata?.name;
  ledger.record({ provider: CAP, model: MODEL, mode: "batch", usd, job: `batch ${name} (${sheets.length} sheets, estimate)` });
  fs.mkdirSync(SCRATCH, { recursive: true });
  fs.writeFileSync(path.join(SCRATCH, "last-batch.json"), JSON.stringify({ name, ids, usd, submitted: new Date().toISOString() }, null, 1));
  console.log(`submitted ${name}: ${sheets.length} sheets, estimate $${usd.toFixed(4)} (batch, 2K)`);
}

async function status(name) {
  const key = loadKey();
  const op = await api("GET", `https://generativelanguage.googleapis.com/v1beta/${name}`, null, key);
  console.log(JSON.stringify({ name: op.name, done: op.done ?? null, state: op.metadata?.state ?? op.state ?? null, stats: op.metadata?.batchStats ?? null }, null, 1));
}

async function collect(name, outDir) {
  const key = loadKey();
  const op = await api("GET", `https://generativelanguage.googleapis.com/v1beta/${name}`, null, key);
  // Results live under metadata.output.inlinedResponses.inlinedResponses (checked on the trial batch).
  const results = op.metadata?.output?.inlinedResponses?.inlinedResponses || op.response?.inlinedResponses || op.dest?.inlinedResponses || [];
  if (!results.length) { console.log("no inline results yet; state:", op.metadata?.state ?? op.state ?? "unknown"); return; }
  fs.mkdirSync(outDir, { recursive: true });
  let ok = 0, failed = [];
  for (const r of results) {
    const key2 = r.metadata?.key || r.key;
    if (r.error) { failed.push(`${key2}: ${JSON.stringify(r.error).slice(0, 200)}`); continue; }
    const part = (r.response?.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData || p.inline_data);
    if (!part) { failed.push(`${key2}: no image`); continue; }
    const raw = path.join(SCRATCH, `raw-${key2}.bin`);
    fs.writeFileSync(raw, Buffer.from((part.inlineData || part.inline_data).data, "base64"));
    execFileSync(ffmpegPath, ["-v", "error", "-y", "-i", raw, "-vf", "scale=1536:1024:flags=lanczos", path.join(outDir, `${key2}.png`)]);
    ok++;
  }
  console.log(`collected ${ok} sheet(s) into ${outDir}; failed ${failed.length}`);
  for (const f of failed) console.log("  FAILED", f);
}

(async () => {
  if (cmd === "submit") await submit();
  else if (cmd === "status") await status(args[1]);
  else if (cmd === "collect") await collect(args[1], opt("out"));
  else throw new Error("Usage: submit | status <name> | collect <name> --out <folder>");
})().catch((e) => {
  if (e instanceof BudgetError) console.error(`STOPPED by budget: ${e.message}`);
  else console.error(`ERROR: ${e.message}`);
  process.exit(1);
});
