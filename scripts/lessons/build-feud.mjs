#!/usr/bin/env node
/* Top Answers boards (the Family-Feud-style arcade game): for every coursebook unit, three prompts such as
   "Name an animal that lives on a farm", each with 6 answers ranked by how likely 8–12-year-old learners are to
   say them, with survey points. Answers lean on the unit's own words; each answer is linked to its word-bank
   entry when there is one (picture + recorded voice in the game). Written to desktop/renderer/lessons/feud.json.
   Paid calls go through scripts/lib/ai.mjs (ledger, OpenRouter cap). Resumable: units already in the file are skipped.
   Usage: node scripts/lessons/build-feud.mjs [--book CPP1] [--unit 3] [--force] [--dry-run] [--model <id>] */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../lib/env.mjs";
import { chatJson } from "../lib/ai.mjs";
import { CPP_BOOKS, CPP_WORDBANK } from "../../desktop/renderer/coursebook-data.js";
import { stem } from "../../desktop/renderer/lesson/schema.js";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const FORCE = args.includes("--force");
const DRY = args.includes("--dry-run");
const MODEL = opt("model") || "deepseek/deepseek-v4.1-flash";
const OUT = path.join(ROOT, "desktop", "renderer", "lessons", "feud.json");
const data = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { v: 1, boards: {} };
const save = () => fs.writeFileSync(OUT, JSON.stringify({ ...data, builtAt: new Date().toISOString().slice(0, 10) }, null, 1) + "\n");

// Word-bank lookup for linking answers: exact English first, then the singular stem.
const byEnglish = new Map();
const byStem = new Map();
for (const w of CPP_WORDBANK) {
  const e = w.english.toLowerCase().trim();
  if (!byEnglish.has(e)) byEnglish.set(e, w);
  if (!/\s/.test(e) && !byStem.has(stem(e))) byStem.set(stem(e), w);
}
const link = (text) => byEnglish.get(text) || (!/\s/.test(text) ? byStem.get(stem(text)) : null) || null;

const SYSTEM = `You write boards for "Top Answers", a Family-Feud-style classroom game for Greek children aged 8-12 learning English (CEFR pre-A1 to A2).
A board is a prompt ("Name something you find in a kitchen") and the 6 answers a class of these children would most likely shout, ranked from most to least likely, with survey points.
Rules:
- Prompts are short, concrete and child-friendly, start with "Name", and fit the unit's topic. No trick questions, nothing scary, no brands or people's names.
- Each answer is 1-2 simple English words, lowercase, singular unless the plural is the natural answer, and something a child could picture.
- Prefer the unit's own words: at least 3 of the 6 answers should come from the unit word list when they fit. Fill the rest with very common words children of this age know.
- Rank by how likely the children are to say each answer first. Points are whole numbers, strictly descending, between 3 and 45, summing to 70-100.
- "alts" lists other ways a child might say the same answer (plural, synonym, British/American spelling), lowercase, up to 3.
- The three boards of a unit use different prompts with different answers.
Reply with JSON only: {"boards":[{"prompt":"...","answers":[{"text":"...","points":N,"alts":["..."]}]}]}`;

function unitInput(book, unit) {
  const info = book.units[unit];
  const words = CPP_WORDBANK.filter((w) => w.bookId === book.id && w.unit === unit && /^(n\.|phr\.|adj\.|v\.)$/.test(w.type))
    .map((w) => w.english.trim()).filter((e, i, a) => e.length <= 22 && a.indexOf(e) === i);
  return `Book: ${book.title} (${book.cefr})
Unit ${unit}: "${info.title}" — texts: "${info.nonfiction || ""}", "${info.fiction || ""}"
Unit word list: ${words.join(", ")}
Write 3 boards for this unit.`;
}

/** Keep a board only if it is well-formed; tidy answers, points and links. */
export function cleanBoard(raw, id) {
  const prompt = String(raw?.prompt || "").replace(/\s+/g, " ").trim().replace(/[.?!]*$/, "");
  if (!/^name\b/i.test(prompt) || prompt.length > 70) return null;
  if (/\b(story|stories|text|book|unit|lesson|poem)\b/i.test(prompt)) return null; // must work from everyday knowledge
  const seen = new Set();
  const answers = [];
  for (const a of raw.answers || []) {
    const text = String(a?.text || "").toLowerCase().replace(/[^a-z' -]/g, "").replace(/\s+/g, " ").trim();
    if (!text || text.split(" ").length > 2 || seen.has(text)) continue;
    seen.add(text);
    const alts = [...new Set((a.alts || []).map((x) => String(x).toLowerCase().replace(/[^a-z' -]/g, "").trim()).filter((x) => x && x !== text && !seen.has(x)))].slice(0, 3);
    const w = link(text);
    answers.push({ text, points: Math.round(Number(a.points) || 0), alts, ...(w ? { wordId: w.id } : {}) });
  }
  if (answers.length < 5) return null;
  const top = answers.slice(0, 6);
  // Points: strictly descending, sensible range (repair small slips rather than drop the board).
  top.sort((x, y) => y.points - x.points);
  for (let i = 0; i < top.length; i++) {
    const max = i === 0 ? 45 : top[i - 1].points - 1;
    top[i].points = Math.max(3 + (top.length - 1 - i), Math.min(max, top[i].points || 3));
  }
  return { id, prompt: `${prompt}…`, answers: top };
}

const books = opt("book") ? [CPP_BOOKS[opt("book")]].filter(Boolean) : Object.values(CPP_BOOKS);
const jobs = [];
for (const book of books) {
  for (const u of Object.keys(book.units).map(Number).filter((n) => n >= 1).sort((a, b) => a - b)) {
    if (opt("unit") && Number(opt("unit")) !== u) continue;
    const key = `${book.id}-U${u}`;
    if (data.boards[key]?.length && !FORCE) continue;
    jobs.push({ book, unit: u, key });
  }
}
console.log(`${jobs.length} unit(s) to build with ${MODEL}${DRY ? " (dry run)" : ""} — about $0.001–0.003 each.`);
if (DRY) { if (jobs[0]) console.log(`\n${SYSTEM}\n\n${unitInput(jobs[0].book, jobs[0].unit)}`); process.exit(0); }

let spent = 0;
for (const { book, unit, key } of jobs) {
  try {
    const { json, usd } = await chatJson({ model: MODEL, system: SYSTEM, user: unitInput(book, unit), temperature: 0.5, maxTokens: 7000, job: `feud ${key}`, estimateUsd: 0.01, extra: { reasoning: { effort: "low" } } }); // short thinking, room for the whole JSON
    spent += usd;
    const boards = (json.boards || []).map((b, i) => cleanBoard(b, `${key}-${i + 1}`)).filter(Boolean);
    if (boards.length < 2) { console.log(`✗ ${key}: only ${boards.length} usable board(s) — run again`); continue; }
    data.boards[key] = boards;
    save();
    console.log(`✓ ${key}: ${boards.map((b) => `${b.prompt} [${b.answers.filter((a) => a.wordId).length}/${b.answers.length} unit words]`).join(" · ")}`);
  } catch (e) {
    console.log(`✗ ${key}: ${e.message}`);
    if (/cap|Budget/i.test(e.message)) break;
  }
}
console.log(`Done — spent $${spent.toFixed(4)}. Boards: ${Object.values(data.boards).flat().length} in ${Object.keys(data.boards).length} units.`);
