#!/usr/bin/env node
/* Draft curated lessons with AI, validate them, and write desktop/renderer/lessons/<BOOK>/U<n>-<S>.json.
   Usage:
     node scripts/lessons/draft-lessons.mjs --book CPP1 --unit 1 [--section A] [--force] [--dry-run] [--model <id>]
     node scripts/lessons/draft-lessons.mjs --all            # every book/unit/section not yet drafted
   Never overwrites a lesson whose status isn't "draft" (unless --force), and keeps fields listed in "locked".
   Resumable: progress in work/state/lessons.json. Spend is capped via the ledger (OpenRouter cap). */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../lib/env.mjs";
import { chatJson, openRouterKeyInfo, ledger } from "../lib/ai.mjs";
import { BudgetError } from "../lib/ledger.mjs";
import { CLASS_PROFILES } from "../../desktop/renderer/app.js";
import { SECTIONS, SCHEMA_VERSION, lessonId, validateLesson } from "../../desktop/renderer/lesson/schema.js";
import { CPP_BOOKS, getWord, sectionWords, readLesson, writeLesson, writeCatalog } from "./lib/catalog.mjs";
import { buildSystemPrompt, buildUserPrompt, buildFixPrompt } from "./lib/prompt.mjs";

const MODELS = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "models.json"), "utf8")).lessonDraft;
const STATE_FILE = path.join(ROOT, "work", "state", "lessons.json");

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };

function readState() { try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return {}; } }
function saveState(s) { fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }

function targets() {
  const books = opt("book") ? [opt("book")] : flag("all") ? Object.keys(CPP_BOOKS) : [];
  if (!books.length) { console.error("Pass --book CPP1 [--unit 1] [--section A], or --all"); process.exit(1); }
  const out = [];
  for (const bookId of books) {
    const book = CPP_BOOKS[bookId];
    if (!book) throw new Error(`Unknown book ${bookId}`);
    const units = opt("unit") ? [Number(opt("unit"))] : Object.keys(book.units).map(Number).filter((u) => u >= 1);
    for (const unit of units) for (const section of opt("section") ? [opt("section")] : SECTIONS) out.push({ bookId, unit, section });
  }
  return out;
}

/** Deterministic shuffle seeded by a string, so re-validating never changes answers. */
function seededShuffle(arr, seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Models put the right answer first far too often — spread answers across A–D. */
function shuffleCheckOptions(scenes, id) {
  for (const s of scenes || []) {
    if (s.type !== "check") continue;
    for (const it of s.items || []) {
      if (it.kind === "trueFalse" || !Array.isArray(it.options) || !Number.isInteger(it.answer)) continue;
      const right = it.options[it.answer];
      it.options = seededShuffle(it.options, `${id}:${it.id}`);
      it.answer = it.options.indexOf(right);
    }
  }
  return scenes;
}

/** Fill the fields the generator owns, so the model can't get them wrong. */
function finalize(raw, { book, unit, section, profile, words, model, existing }) {
  const focusIds = new Set((raw.focusWords || []).map((f) => f.wordId));
  const lesson = {
    schema: SCHEMA_VERSION,
    id: lessonId(book.id, unit, section),
    bookId: book.id,
    unit,
    section,
    title: raw.title,
    bigQuestion: book.units[unit].title,
    profile: profile.id,
    durationMin: raw.durationMin || (section === "BQ" ? 12 : 22),
    status: "draft",
    locked: existing?.locked || [],
    generatedBy: { provider: "openrouter", model, date: new Date().toISOString().slice(0, 10) },
    setting: raw.setting,
    cast: raw.cast,
    focusWords: (raw.focusWords || []).map((f) => ({ ...f, english: getWord(f.wordId)?.english, type: getWord(f.wordId)?.type })),
    extensionWords: words.map((w) => w.id).filter((id) => !focusIds.has(id)),
    scenes: shuffleCheckOptions(raw.scenes, lessonId(book.id, unit, section)),
  };
  // Locked fields survive regeneration (top-level keys, or "scenes.<sceneId>").
  for (const key of lesson.locked) {
    if (!existing) continue;
    if (key.startsWith("scenes.")) {
      const id = key.slice(7);
      const keep = existing.scenes?.find((s) => s.id === id);
      if (keep) lesson.scenes = lesson.scenes.map((s) => (s.id === id ? keep : s));
    } else if (key in existing) lesson[key] = existing[key];
  }
  return lesson;
}

async function draftOne({ bookId, unit, section }, state, model) {
  const id = lessonId(bookId, unit, section);
  const book = CPP_BOOKS[bookId];
  const existing = readLesson(bookId, unit, section);
  if (existing && existing.status !== "draft" && !flag("force")) { console.log(`· ${id}: ${existing.status} — kept`); return; }
  if (existing && state[id]?.status === "ok" && !flag("force")) { console.log(`· ${id}: already drafted — skip (use --force to redo)`); return; }
  const words = sectionWords(bookId, unit, section);
  if (words.length < 4) { console.log(`· ${id}: only ${words.length} words — skipped`); return; }
  const profile = CLASS_PROFILES[book.recommendedProfile];
  const others = SECTIONS.filter((s) => s !== section).map((s) => readLesson(bookId, unit, s)?.title).filter(Boolean);
  const system = buildSystemPrompt();
  const user = buildUserPrompt({ book, unit, unitInfo: book.units[unit], section, profile, words, prevTitles: others });
  if (flag("dry-run")) { console.log(`· ${id}: ${words.length} candidates, prompt ≈ ${Math.round((system.length + user.length) / 4)} tokens`); return; }

  let raw = null;
  let lesson = null;
  let report = { errors: ["not generated"], warnings: [] };
  let spent = 0;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const prompt = attempt === 1 ? user : `${user}\n\n${buildFixPrompt(raw, report.errors)}`;
    const res = await chatJson({ model, system, user: prompt, temperature: MODELS.temperature, job: `draft ${id} #${attempt}` });
    spent += res.usd;
    raw = res.json;
    lesson = finalize(raw, { book, unit, section, profile, words, model: res.model, existing });
    report = validateLesson(lesson, getWord);
    console.log(`  ${id} attempt ${attempt}: ${report.errors.length} errors, ${report.warnings.length} warnings ($${res.usd.toFixed(4)})`);
    if (!report.errors.length) break;
  }
  state[id] = { status: report.errors.length ? "failed" : "ok", usd: Number(spent.toFixed(5)), errors: report.errors.slice(0, 20), warnings: report.warnings.length, at: new Date().toISOString() };
  saveState(state);
  if (report.errors.length) {
    console.log(`✗ ${id}: still invalid — not written. First errors:\n   ${report.errors.slice(0, 6).join("\n   ")}`);
    return;
  }
  writeLesson(lesson);
  console.log(`✓ ${id}: "${lesson.title}" (${lesson.focusWords.length} focus words)`);
}

async function main() {
  const list = targets();
  const model = opt("model") || MODELS.model;
  if (!flag("dry-run")) {
    try {
      const info = await openRouterKeyInfo();
      console.log(`OpenRouter credit remaining: ${info.limitRemaining == null ? "no limit set" : `$${Number(info.limitRemaining).toFixed(2)}`}; ledger cap left: $${ledger.remaining("openrouter").toFixed(3)}`);
    } catch (e) { console.log(`(Could not read OpenRouter credit: ${e.message})`); }
  }
  console.log(`Drafting ${list.length} lesson(s) with ${model}${flag("dry-run") ? " (dry run)" : ""}`);
  const state = readState();
  for (const t of list) {
    try { await draftOne(t, state, model); } catch (e) {
      if (e instanceof BudgetError) { console.error(`Budget stop: ${e.message}`); break; }
      console.error(`✗ ${lessonId(t.bookId, t.unit, t.section)}: ${e.message}`);
      state[lessonId(t.bookId, t.unit, t.section)] = { status: "error", error: e.message, at: new Date().toISOString() };
      saveState(state);
    }
  }
  if (!flag("dry-run")) writeCatalog();
  console.log(`Spent so far on OpenRouter: $${ledger.spent("openrouter").toFixed(4)} (cap $${ledger.caps.openrouter})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
