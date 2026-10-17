#!/usr/bin/env node
/* Build the voice library with Gemini 3.8 TTS (developer-guide style: verbatim text + per-line style).
   Routing: lines that need a style direction or a designed voice (voice_…) → Interactions API (standard price);
            plain lines with studio/library voices → Batch API via generateContent (half price, async).
   Output: desktop/renderer/assets/audio/<xx>/<hash>.ogg (gitignored) + manifest.json (committed).
   Usage:
     node scripts/audio/build-audio.mjs --dry-run [--only lessons|words|examples|greek] [--lessons CPP1-U1-A,CPP1-U1-B]
     node scripts/audio/build-audio.mjs [same filters]        # run standard jobs now, submit batch jobs
     node scripts/audio/build-audio.mjs --collect             # fetch finished batches
     node scripts/audio/build-audio.mjs --retake <key>        # re-voice one clip (new seed)
   Resumable: state in work/state/audio.json. Spend capped by the ledger. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { ROOT, requireEnv } from "../lib/env.mjs";
import { synthesize, synthesizeOpenRouter, OPENROUTER_TTS_VOICES, wavSeconds, ledger } from "../lib/gemini-tts.mjs";
import { geminiCost, BudgetError, PRICING } from "../lib/ledger.mjs";
import { lessonLines, normText } from "../../desktop/renderer/lesson/schema.js";
import { allLessonFiles, CPP_WORDBANK } from "../lessons/lib/catalog.mjs";

const AUDIO_DIR = path.join(ROOT, "desktop", "renderer", "assets", "audio");
const MANIFEST = path.join(AUDIO_DIR, "manifest.json");
const STATE_FILE = path.join(ROOT, "work", "state", "audio.json");
const TMP = path.join(ROOT, "work", "tmp");
const VOICES = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "voices.json"), "utf8"));
// --narrator <voice> overrides the narrator/word/example voice (handy for dry-run comparisons).
if (process.argv.includes("--narrator")) { const v = process.argv[process.argv.indexOf("--narrator") + 1]; for (const r of ["narrator", "words", "examples"]) VOICES.cast[r].voice = v; }
const PRON = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "content", "pronunciations.json"), "utf8")); } catch { return {}; } })();
const BASE = "https://generativelanguage.googleapis.com/v1beta";

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = `${f}.tmp`; fs.writeFileSync(t, JSON.stringify(v, null, 1)); fs.renameSync(t, f); };
const state = readJson(STATE_FILE, { clips: {}, batches: {} });
const manifest = readJson(MANIFEST, { v: 1, entries: {}, text: {} });
const saveState = () => writeJson(STATE_FILE, state);
const saveManifest = () => writeJson(MANIFEST, manifest);

/* ── Casting ─────────────────────────────────────────────────────── */
function roleFor(line, lesson) {
  if (line.kind !== "dialogue") return "narrator";
  const p = `${lesson.cast?.[line.who]?.persona || ""} ${lesson.cast?.[line.who]?.name || ""}`.toLowerCase();
  if (/grand|granny|grandpa|elderly|old (man|woman|lady)/.test(p)) return "grandparent";
  if (/\bgirl\b|daughter|sister/.test(p)) return "childGirl";
  if (/\bboy\b|son\b|brother|child|kid|[5-9]-year|1[0-3]-year/.test(p)) return "childBoy";
  if (/\b(woman|mum|mom|mother|aunt|lady|teacher|she)\b/.test(p)) return "adultWoman";
  return "adultMan";
}

/** Stable voice for a story character: same name → same voice in every lesson; pools keep casts varied. */
function characterVoice(role, name) {
  const pool = VOICES.pools?.[role] || [];
  if (!pool.length) return VOICES.cast.narrator.voice;
  let h = 0;
  for (const ch of `${role}:${String(name).toLowerCase()}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return pool[h % pool.length];
}

const STYLE = {
  word: VOICES.cast.words?.style || "",
  hook: "warm, playful and welcoming storyteller",
  explain: "encouraging and proud of the class, warm vocal smile",
  question: "curious and inviting",
};

/** Pronunciation fixes: { "oracy": "/ˈɔːrəsi/" } replaces the word with IPA in the spoken text only. */
function spoken(text) {
  // Gap-fill prompts: say "blank" like a teacher, otherwise the voice model guesses and speaks the answer.
  let t = text.replace(/_{2,}/g, "blank");
  for (const [w, ipa] of Object.entries(PRON)) t = t.replace(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), ipa);
  return t;
}

/* ── Job collection ──────────────────────────────────────────────── */
function collectJobs() {
  const only = opt("only");
  const lessonFilter = opt("lessons") ? new Set(opt("lessons").split(",")) : null;
  const jobs = [];
  const add = (j) => jobs.push(j);
  if (!only || only === "lessons") {
    for (const f of allLessonFiles()) {
      const lesson = JSON.parse(fs.readFileSync(f, "utf8"));
      if (lessonFilter && !lessonFilter.has(lesson.id)) continue;
      for (const line of lessonLines(lesson)) {
        if (line.key.startsWith("lx:") && !line.key.endsWith(":0")) continue; // only the example the player uses
        const role = roleFor(line, lesson);
        const cast = role === "narrator"
          ? VOICES.cast.narrator
          : { voice: characterVoice(role, lesson.cast?.[line.who]?.name || line.who), model: VOICES.cast.dialogueModel || "gemini-3.8-flash-tts" };
        let style = line.style || "";
        if (line.kind === "dialogue") style = style || lesson.cast?.[line.who]?.persona || "";
        else if (VOICES.styleNarration && line.sceneId === "hook") style = style || STYLE.hook;
        else if (VOICES.styleNarration && line.lineId.endsWith("e") && line.sceneId === "check") style = style || STYLE.explain;
        add({ key: line.key, text: line.text, voice: cast.voice, model: cast.model || (line.kind === "dialogue" ? "gemini-3.8-flash-tts" : "gemini-3.8-flash-lite-tts"), style, kind: line.kind, lesson: lesson.id });
      }
    }
  }
  const seen = new Map();
  for (const w of CPP_WORDBANK) {
    const k = w.english.toLowerCase();
    if (!seen.has(k)) seen.set(k, []);
    seen.get(k).push(w);
  }
  if (!only || only === "words") {
    const c = VOICES.cast.words;
    for (const [, rows] of seen) for (const w of rows) add({ key: `w:${w.id}`, text: `${w.english}.`, display: w.english, voice: c.voice, model: c.model, style: VOICES.styleWords ? c.style || "" : "", kind: "word" });
  }
  if (only === "examples") {
    const c = VOICES.cast.examples;
    for (const [, rows] of seen) for (const w of rows) if (w.example) add({ key: `x:${w.id}`, text: w.example, voice: c.voice, model: c.model, style: "", kind: "example" });
  }
  if (only === "greek") {
    const c = VOICES.cast.greek;
    for (const [, rows] of seen) for (const w of rows) if (w.greek) add({ key: `g:${w.id}`, text: w.greek, voice: c.voice, model: c.model, style: "", kind: "greek" });
  }
  for (const j of jobs) {
    if (VOICES.forceBatch && !String(j.voice).startsWith("voice_")) j.style = ""; // batch has no style field
    j.spoken = spoken(j.text);
    j.hash = crypto.createHash("sha1").update(`${j.model}|${j.voice}|${j.style}|${j.spoken}`).digest("hex").slice(0, 16);
    j.route = j.style || String(j.voice).startsWith("voice_") ? "standard" : "batch";
    // voices.json "openrouterFor": ["dialogue", …] sends those lines to the same model via OpenRouter (studio voices, no style, no daily cap).
    if ((VOICES.openrouterFor || []).includes(j.kind) && OPENROUTER_TTS_VOICES.includes(j.voice)) j.route = "openrouter";
    j.estSec = Math.max(0.8, j.spoken.length / 13 + (j.kind === "word" ? 0.4 : 0.3));
  }
  return jobs;
}

/* ── Encoding & manifest ─────────────────────────────────────────── */
function encode(wav, hash) {
  fs.mkdirSync(TMP, { recursive: true });
  const rel = `${hash.slice(0, 2)}/${hash}.ogg`;
  const out = path.join(AUDIO_DIR, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const tmp = path.join(TMP, `${hash}.wav`);
  fs.writeFileSync(tmp, wav);
  const trim = "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05";
  execFileSync(ffmpegPath, ["-y", "-loglevel", "error", "-i", tmp, "-af", `${trim},areverse,${trim},areverse,loudnorm=I=-18:TP=-2:LRA=11`, "-ac", "1", "-ar", "24000", "-c:a", "libopus", "-b:a", "20k", "-application", "voip", out], { timeout: 60_000 });
  fs.rmSync(tmp, { force: true });
  return rel;
}

function qa(job, seconds) {
  const chars = job.spoken.replace(/<[^>]+>|\|[^|]*\|/g, "").length;
  if (seconds < chars / 32) return "too short";
  if (seconds > chars / 5 + 3) return "too long";
  return "";
}

function registerClip(job, rel, seconds) {
  state.clips[job.hash] = { status: "done", f: rel, d: Number(seconds.toFixed(2)), model: job.model, voice: job.voice, at: new Date().toISOString(), qa: qa(job, seconds) };
  manifest.entries[job.key] = { f: rel, d: Number(seconds.toFixed(2)) };
  const norm = normText(job.display || job.text);
  if (norm && !manifest.text[norm]) manifest.text[norm] = job.key;
}

/** Point every key at its clip (several keys can share a hash, e.g. duplicate words). */
function linkDone(jobs) {
  let n = 0;
  for (const j of jobs) {
    // A clip encoded before an interrupted run saved its state is still on disk: adopt it.
    const rel = `${j.hash.slice(0, 2)}/${j.hash}.ogg`;
    if (state.clips[j.hash]?.status !== "done" && fs.existsSync(path.join(AUDIO_DIR, rel))) {
      state.clips[j.hash] = { status: "done", f: rel, d: Number(j.estSec.toFixed(2)), model: j.model, voice: j.voice, adopted: true };
    }
    const c = state.clips[j.hash];
    if (c?.status === "done" && fs.existsSync(path.join(AUDIO_DIR, c.f))) {
      if (!manifest.entries[j.key] || manifest.entries[j.key].f !== c.f) { manifest.entries[j.key] = { f: c.f, d: c.d }; n++; }
      const norm = normText(j.display || j.text);
      if (norm && !manifest.text[norm]) manifest.text[norm] = j.key;
    }
  }
  return n;
}

/* ── Standard (Interactions), chunked ────────────────────────────────
   Tier-1 keys allow ~100 TTS requests/day/model, so lines that share a voice + style + model are
   voiced together in one request, separated by <long pause>, and cut apart at the longest silences.
   A chunk whose cut doesn't validate is retried line by line on a later run. */
class QuotaError extends Error {}
const PAUSE = " <long pause> ";

function makeChunks(list, { maxLines = 18, maxChars = 1100 } = {}) {
  const groups = new Map();
  for (const j of list) {
    const k = `${j.model}|${j.voice}|${j.style}|${j.lesson || "-"}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(j);
  }
  const chunks = [];
  for (const jobs of groups.values()) {
    let cur = [];
    let chars = 0;
    for (const j of jobs) {
      const single = state.clips[j.hash]?.single; // previous cut failed → voice alone
      if (single) { chunks.push([j]); continue; }
      if (cur.length && (cur.length >= maxLines || chars + j.spoken.length > maxChars)) { chunks.push(cur); cur = []; chars = 0; }
      cur.push(j);
      chars += j.spoken.length;
    }
    if (cur.length) chunks.push(cur);
  }
  return chunks;
}

/** Silences in a WAV file: [{ start, end }] (ffmpeg silencedetect). */
function silences(file) {
  const out = String(spawnSync(ffmpegPath, ["-hide_banner", "-i", file, "-af", "silencedetect=noise=-38dB:d=0.3", "-f", "null", "-"], { encoding: "utf8" }).stderr || "");
  const res = [];
  let start = null;
  for (const line of out.split(/\r?\n/)) {
    const s = line.match(/silence_start: ([\d.]+)/);
    const e = line.match(/silence_end: ([\d.]+)/);
    if (s) start = Number(s[1]);
    if (e && start != null) { res.push({ start, end: Number(e[1]) }); start = null; }
  }
  return res;
}

/** Cut points for n lines: the n-1 longest silences, in time order; null if the cut looks wrong. */
function cutPoints(sil, n, total, jobs) {
  if (n === 1) return [[0, total]];
  const inner = sil.filter((s) => s.start > 0.15 && s.end < total - 0.15);
  if (inner.length < n - 1) return null;
  const longest = [...inner].sort((a, b) => (b.end - b.start) - (a.end - a.start)).slice(0, n - 1).sort((a, b) => a.start - b.start);
  const bounds = [0, ...longest.map((s) => (s.start + s.end) / 2), total];
  const segs = bounds.slice(0, -1).map((b, i) => [b, bounds[i + 1]]);
  const chars = jobs.map((j) => j.spoken.length);
  const sum = chars.reduce((a, b) => a + b, 0);
  for (let i = 0; i < n; i++) {
    const exp = (chars[i] / sum) * total;
    const got = segs[i][1] - segs[i][0];
    if (got < 0.35 || got < exp * 0.4 || got > exp * 2.4 + 0.8) return null;
  }
  return segs;
}

function encodeSegment(srcFile, [a, b], hash) {
  const rel = `${hash.slice(0, 2)}/${hash}.ogg`;
  const out = path.join(AUDIO_DIR, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const trim = "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05";
  execFileSync(ffmpegPath, ["-y", "-loglevel", "error", "-ss", a.toFixed(3), "-to", b.toFixed(3), "-i", srcFile, "-af", `${trim},areverse,${trim},areverse,loudnorm=I=-18:TP=-2:LRA=11`, "-ac", "1", "-ar", "24000", "-c:a", "libopus", "-b:a", "20k", "-application", "voip", out], { timeout: 60_000 });
  return rel;
}

async function voiceChunk(jobs) {
  const text = jobs.map((j) => j.spoken).join(PAUSE);
  const est = jobs.reduce((s, j) => s + j.estSec, 0) + (jobs.length - 1) * 1.2;
  let r;
  try {
    r = await synthesize({ model: jobs[0].model, voice: jobs[0].voice, text, style: jobs[0].style, job: `audio ×${jobs.length} ${jobs[0].key}`, estimateSeconds: est });
  } catch (e) {
    if (/requests per day|per day/i.test(e.message)) throw new QuotaError(e.message.match(/retry in [^.]+/i)?.[0] || "daily quota reached");
    throw e;
  }
  fs.mkdirSync(TMP, { recursive: true });
  const src = path.join(TMP, `chunk-${jobs[0].hash}.wav`);
  fs.writeFileSync(src, r.wav);
  const segs = cutPoints(silences(src), jobs.length, r.seconds, jobs);
  if (!segs) {
    for (const j of jobs) state.clips[j.hash] = { status: "error", single: true, error: "chunk cut failed — will voice alone", key: j.key };
    fs.rmSync(src, { force: true });
    return 0;
  }
  jobs.forEach((j, i) => registerClip(j, encodeSegment(src, segs[i], j.hash), segs[i][1] - segs[i][0]));
  fs.rmSync(src, { force: true });
  return jobs.length;
}

async function runStandard(list) {
  const chunks = makeChunks(list);
  const perModel = {};
  for (const c of chunks) perModel[c[0].model] = (perModel[c[0].model] || 0) + 1;
  console.log(`  ${list.length} lines in ${chunks.length} requests (${Object.entries(perModel).map(([m, n]) => `${m.replace("gemini-3.8-", "")}: ${n}`).join(", ")}) — Tier 1 allows ~100 requests/day per model`);
  if (flag("dry-run")) return;
  let i = 0;
  let budgetStop = null;
  const exhausted = new Map(); // model → retry message
  const worker = async () => {
    while (i < chunks.length && !budgetStop) {
      const chunk = chunks[i++];
      if (exhausted.has(chunk[0].model)) continue;
      try {
        const n = await voiceChunk(chunk);
        process.stdout.write(n ? "." : "~");
        saveState(); saveManifest();
      } catch (e) {
        if (e instanceof BudgetError) { budgetStop = e; break; }
        if (e instanceof QuotaError) { exhausted.set(chunk[0].model, e.message); continue; }
        for (const j of chunk) state.clips[j.hash] = { status: "error", error: e.message.slice(0, 200), key: j.key };
        process.stdout.write("x");
      }
    }
  };
  try { await Promise.all([worker(), worker()]); } finally { saveState(); saveManifest(); }
  for (const [m, msg] of exhausted) console.log(`
Daily quota reached for ${m} (${msg}). Run the same command again after the reset; it resumes.`);
  if (budgetStop) throw budgetStop;
}

/* ── OpenRouter (same model, studio voices, line by line) ───────────── */
async function runOpenRouter(list) {
  let i = 0;
  const worker = async () => {
    while (i < list.length) {
      const job = list[i++];
      try {
        const r = await synthesizeOpenRouter({ voice: job.voice, text: job.spoken, job: `audio ${job.key}`, estimateSeconds: job.estSec });
        registerClip(job, encode(r.wav, job.hash), r.seconds);
        if (i % 10 === 0) { saveState(); saveManifest(); }
        process.stdout.write(".");
      } catch (e) {
        if (e instanceof BudgetError) throw e;
        state.clips[job.hash] = { status: "error", error: e.message.slice(0, 200), key: job.key };
        process.stdout.write("x");
      }
    }
  };
  try { await Promise.all([worker(), worker(), worker()]); } finally { saveState(); saveManifest(); }
}

/* ── Batch (generateContent) ─────────────────────────────────────── */
async function api(method, url, body) {
  // Batch results can be ~100 MB of inline audio; a stalled download must not hang the run forever.
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { method, headers: { "x-goog-api-key": requireEnv("GEMINI_API_KEY"), "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(300_000) });
      const text = await res.text();
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`), { fatal: res.status < 500 && res.status !== 429 });
      return JSON.parse(text);
    } catch (e) {
      if (e.fatal || attempt >= 3) throw e;
      console.log(`    retry ${attempt} (${e.name === "TimeoutError" ? "timed out" : e.message.slice(0, 80)})`);
    }
  }
}

async function submitBatches(list) {
  const byModel = {};
  for (const j of list) (byModel[j.model] ||= []).push(j);
  for (const [model, jobs] of Object.entries(byModel)) {
    for (let k = 0; k < jobs.length; k += 400) {
      const chunk = jobs.slice(k, k + 400);
      const est = chunk.reduce((s, j) => s + geminiCost(model, { inTok: 20, outTok: j.estSec * PRICING.audioTokensPerSecond, mode: "batch" }), 0) * 1.15;
      ledger.assertCanSpend("gemini", est + pendingBatchEstimate(), `batch ${model} ×${chunk.length}`);
      const body = { batch: { display_name: `vm-audio-${Date.now()}`, input_config: { requests: { requests: chunk.map((j) => ({
        request: { contents: [{ parts: [{ text: j.spoken }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: j.voice } } } } },
        metadata: { key: j.hash },
      })) } } } };
      const res = await api("POST", `${BASE}/models/${model}:batchGenerateContent`, body);
      const name = res.name || res.metadata?.name;
      state.batches[name] = { model, count: chunk.length, est: Number(est.toFixed(4)), submitted: new Date().toISOString(), status: "pending" };
      for (const j of chunk) state.clips[j.hash] = { status: "batch", batch: name, key: j.key };
      saveState();
      console.log(`  submitted ${name} (${chunk.length} clips, ~$${est.toFixed(3)})`);
    }
  }
}

function pendingBatchEstimate() {
  return Object.values(state.batches).filter((b) => b.status === "pending").reduce((s, b) => s + (b.est || 0), 0);
}

async function collectBatches(jobsByHash) {
  for (const [name, b] of Object.entries(state.batches)) {
    if (b.status !== "pending") continue;
    const res = await api("GET", `${BASE}/${name}`);
    const st = res.metadata?.state || res.state || "";
    console.log(`  ${name}: ${st}`);
    if (!/SUCCEEDED/.test(st)) { if (/FAILED|CANCELLED|EXPIRED/.test(st)) { b.status = "failed"; for (const c of Object.values(state.clips)) if (c.batch === name) c.status = "error"; } continue; }
    const items = res.response?.inlinedResponses?.inlinedResponses || res.response?.inlinedResponses || res.metadata?.output?.inlinedResponses?.inlinedResponses || [];
    let inTok = 0; let outTok = 0; let ok = 0;
    for (const it of items) {
      const hash = it.metadata?.key;
      const part = it.response?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      if (!hash || !part) { if (hash) state.clips[hash] = { status: "error", error: JSON.stringify(it.error || "no audio").slice(0, 200) }; continue; }
      const wav = Buffer.from(part.inlineData.data, "base64");
      const seconds = wavSeconds(wav);
      inTok += it.response.usageMetadata?.promptTokenCount || 0;
      outTok += it.response.usageMetadata?.candidatesTokenCount || Math.ceil(seconds * PRICING.audioTokensPerSecond);
      const job = jobsByHash.get(hash) || { hash, key: state.clips[hash]?.key, text: "", spoken: "" };
      let rel;
      try { rel = encode(wav, hash); } catch (e) {
        state.clips[hash] = { status: "error", key: job.key, error: `encode: ${e.code || e.message}`.slice(0, 200) };
        console.log(`    ✗ ${job.key || hash}: encode failed (${e.code || "error"}) — retake later`);
        continue;
      }
      if (job.key) registerClip(job, rel, seconds); else state.clips[hash] = { status: "done", f: rel, d: seconds };
      ok++;
    }
    const usd = geminiCost(b.model, { inTok, outTok, mode: "batch" });
    ledger.record({ provider: "gemini", model: b.model, mode: "batch", inTok, outTok, usd, job: `batch ${name} (${ok}/${b.count})` });
    b.status = "done";
    b.usd = usd;
    saveState();
    saveManifest();
    console.log(`    ${ok}/${b.count} clips, $${usd.toFixed(4)}`);
  }
}

/* ── Main ────────────────────────────────────────────────────────── */
async function main() {
  const jobs = collectJobs();
  const jobsByHash = new Map(jobs.map((j) => [j.hash, j]));
  if (flag("collect")) { await collectBatches(jobsByHash); linkDone(jobs); saveManifest(); return report(jobs); }

  if (opt("retake")) {
    const job = jobs.find((j) => j.key === opt("retake"));
    if (!job) throw new Error(`No job with key ${opt("retake")}`);
    const r = await synthesize({ model: job.model, voice: job.voice, text: job.spoken, style: job.style, job: `retake ${job.key}` });
    registerClip(job, encode(r.wav, job.hash), r.seconds);
    saveState(); saveManifest();
    return console.log(`Retook ${job.key} (${r.seconds.toFixed(1)}s, $${r.usd.toFixed(4)})`);
  }

  linkDone(jobs);
  const unique = [...new Map(jobs.filter((j) => !["done", "batch"].includes(state.clips[j.hash]?.status)).map((j) => [j.hash, j])).values()];
  const std = unique.filter((j) => j.route === "standard");
  const orl = unique.filter((j) => j.route === "openrouter");
  const bat = unique.filter((j) => j.route === "batch");
  const cost = (list, mode) => list.reduce((s, j) => s + geminiCost(j.model, { inTok: 20 + j.spoken.length / 4 + j.style.length / 4, outTok: j.estSec * PRICING.audioTokensPerSecond, mode }), 0);
  const estStd = cost(std, "standard");
  const estBat = cost(bat, "batch");
  const secs = unique.reduce((s, j) => s + j.estSec, 0);
  console.log(`${jobs.length} keys → ${unique.length} new clips (${std.length} standard, ${bat.length} batch, ${orl.length} openrouter) ≈ ${(secs / 60).toFixed(1)} min audio ≈ ${((secs * 20000) / 8 / 1e6).toFixed(1)} MB`);
  console.log(`Estimated cost: standard $${estStd.toFixed(3)} + batch $${estBat.toFixed(3)} = $${(estStd + estBat).toFixed(3)} · Gemini cap left $${ledger.remaining("gemini").toFixed(3)} (pending batches ~$${pendingBatchEstimate().toFixed(3)})`);
  if (flag("dry-run")) { if (std.length) await runStandard(std); return; }
  ledger.assertCanSpend("gemini", estStd + estBat + pendingBatchEstimate(), "audio build");
  if (bat.length) await submitBatches(bat);
  if (orl.length) { console.log(`Voicing ${orl.length} clips via OpenRouter (≈ ${(orl.reduce((s, j) => s + j.estSec, 0) * 0.6 / 3600).toFixed(3)})`); await runOpenRouter(orl); console.log(""); }
  if (std.length) { console.log(`Voicing ${std.length} styled/designed-voice clips now`); await runStandard(std); console.log(""); }
  saveManifest();
  report(jobs);
}

function report(jobs) {
  const done = jobs.filter((j) => state.clips[j.hash]?.status === "done").length;
  const flagged = Object.entries(state.clips).filter(([, c]) => c.qa).map(([, c]) => c);
  console.log(`Voiced keys: ${done}/${jobs.length} · manifest entries: ${Object.keys(manifest.entries).length} · QA flags: ${flagged.length} · Gemini spent $${ledger.spent("gemini").toFixed(4)} of $${ledger.caps.gemini}`);
  if (Object.values(state.batches).some((b) => b.status === "pending")) console.log("Batches pending — run again later with --collect");
}

main().catch((e) => { console.error(e instanceof BudgetError ? `Budget stop: ${e.message}` : e); process.exit(1); });
