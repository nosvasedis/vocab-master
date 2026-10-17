#!/usr/bin/env node
/* Illustrations with Cloudflare Workers AI (free 10k neurons/day). Resumable; stops at the daily budget.
   Output: desktop/renderer/assets/art/{backdrops,units}/*.webp + assets/art/manifest.json
   Usage:
     node scripts/art/build-art.mjs [--only backdrops|units] [--dry-run] [--redo <id>] [--redo-all]
   Priority: backdrops (16) → unit hero scenes (27). Per-lesson panels and word cards come later. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { ROOT, requireEnv } from "../lib/env.mjs";
import { CPP_BOOKS } from "../../desktop/renderer/coursebook-data.js";

const STYLE = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "art-style.json"), "utf8"));
const ART_DIR = path.join(ROOT, "desktop", "renderer", "assets", "art");
const MANIFEST = path.join(ART_DIR, "manifest.json");
const STATE_FILE = path.join(ROOT, "work", "state", "art.json");
const TMP = path.join(ROOT, "work", "tmp");

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 1)); };

const state = readJson(STATE_FILE, { items: {}, days: {} });
const manifest = readJson(MANIFEST, { v: 1, backdrops: {}, units: {} });
const today = new Date().toISOString().slice(0, 10); // Workers AI quota resets at 00:00 UTC
const usedToday = () => state.days[today] || 0;
const neurons = (w, h) => Math.ceil((w / 512) * (h / 512) * STYLE.neuronsPerTile);

function items() {
  const out = [];
  if (!opt("only") || opt("only") === "backdrops") {
    for (const [key, scene] of Object.entries(STYLE.backdrops)) {
      out.push({ id: `backdrop:${key}`, kind: "backdrops", name: key, ...STYLE.backdrop, prompt: `${STYLE.style}. Scene: ${scene}. Wide establishing background for a children's story, ${STYLE.negativeHints}.` });
    }
  }
  if (!opt("only") || opt("only") === "units") {
    for (const book of Object.values(CPP_BOOKS)) {
      for (const [u, info] of Object.entries(book.units)) {
        if (Number(u) < 1) continue;
        const id = `${book.id}-U${u}`;
        out.push({ id: `unit:${id}`, kind: "units", name: id, ...STYLE.unitHero, prompt: `${STYLE.style}. A single inviting picture for 9 to 12 year olds about the theme of ${theme(info.title)}, inspired by ${theme(info.nonfiction)} and the children's story ${theme(info.fiction)}. Objects and places only, never write the theme as words, ${STYLE.negativeHints}.` });
      }
    }
  }
  return out;
}

/** Theme words without quotes or question marks (quoted phrases make the model paint them as text). */
function theme(t) { return String(t || "").replace(/["“”'‘’?!]/g, "").toLowerCase(); }

async function generate(item, seed) {
  const form = new FormData();
  form.append("prompt", item.prompt);
  form.append("width", String(item.width));
  form.append("height", String(item.height));
  form.append("seed", String(seed));
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${requireEnv("CF_ACCOUNT_ID")}/ai/run/${STYLE.model}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${requireEnv("CF_API_TOKEN")}` },
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    const msg = (json.errors || []).map((e) => `${e.code} ${e.message}`).join("; ") || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.quota = /quota|limit|neurons|429/i.test(msg) || res.status === 429;
    throw err;
  }
  return Buffer.from(json.result.image, "base64");
}

function toWebp(buf, rel, quality) {
  fs.mkdirSync(TMP, { recursive: true });
  const src = path.join(TMP, `art-${Date.now()}.img`);
  fs.writeFileSync(src, buf);
  const out = path.join(ART_DIR, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync(ffmpegPath, ["-y", "-loglevel", "error", "-i", src, "-c:v", "libwebp", "-quality", String(quality), "-compression_level", "6", out]);
  fs.rmSync(src, { force: true });
  return fs.statSync(out).size;
}

async function main() {
  const redoAll = flag("redo-all");
  const list = items().filter((it) => redoAll ? true : opt("redo") ? it.id === opt("redo") : state.items[it.id]?.status !== "done");
  const cost = list.reduce((s, it) => s + neurons(it.width, it.height), 0);
  console.log(`${list.length} illustration(s) to make ≈ ${cost} neurons · used today ${usedToday()}/${STYLE.dailyNeuronBudget} (free allowance resets 00:00 UTC)`);
  if (flag("dry-run")) return;
  let made = 0;
  for (const it of list) {
    const n = neurons(it.width, it.height);
    if (usedToday() + n > STYLE.dailyNeuronBudget) { console.log("Daily free budget reached — run again tomorrow; it resumes."); break; }
    const prev = state.items[it.id];
    const seed = opt("redo") || redoAll ? Math.floor(Math.random() * 1e9) : prev?.seed ?? Math.floor(Math.random() * 1e9);
    try {
      const img = await generate(it, seed);
      const rel = `${it.kind}/${it.name}.webp`;
      const size = toWebp(img, rel, it.quality);
      state.items[it.id] = { status: "done", file: rel, seed, neurons: n, bytes: size, at: new Date().toISOString() };
      manifest[it.kind][it.name] = rel;
      made++;
      process.stdout.write(`✓ ${it.id} (${Math.round(size / 1024)} KB)\n`);
    } catch (e) {
      state.items[it.id] = { status: "error", seed, error: e.message.slice(0, 200) };
      process.stdout.write(`✗ ${it.id}: ${e.message}\n`);
      if (e.quota) { console.log("Workers AI quota hit — stopping."); state.days[today] = usedToday() + n; break; }
    }
    state.days[today] = usedToday() + n;
    writeJson(STATE_FILE, state);
    writeJson(MANIFEST, manifest);
  }
  writeJson(STATE_FILE, state);
  writeJson(MANIFEST, manifest);
  console.log(`Made ${made}. Neurons used today ≈ ${usedToday()}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
