#!/usr/bin/env node
/* Pedagogical revision pass over existing lessons ("show what you say" + strict teaching rubric).
   For each lesson: send the JSON + its visibility problems + the rubric, get the full revised lesson back,
   validate with strict visibility (every mentioned concrete noun must be on screen), retry with errors.
   Usage: node scripts/lessons/revise-lessons.mjs [--only CPP1-U1-BQ,...] [--force] [--model id]
   Resumable via work/state/revise.json. Spend is capped by the ledger (OpenRouter). */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../lib/env.mjs";
import { chatJson, ledger } from "../lib/ai.mjs";
import { BudgetError } from "../lib/ledger.mjs";
import { validateLesson, visibilityIssues, BACKDROPS } from "../../desktop/renderer/lesson/schema.js";
import { allLessonFiles, getWord, writeLesson, writeCatalog } from "./lib/catalog.mjs";

const MODELS = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "models.json"), "utf8")).lessonDraft;
const NOUNS = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, "content", "visual-lexicon.json"), "utf8")).nouns);
const STATE_FILE = path.join(ROOT, "work", "state", "revise.json");
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const flag = (n) => args.includes(`--${n}`);
const state = (() => { try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return {}; } })();
const save = () => { fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1)); };

const SYSTEM = `You are a meticulous ESL lesson editor and children's picture-book art director. You revise vocabulary lessons for Greek children aged 9–14 (Cambridge Primary Path). The lessons are shown on a classroom projector: scenes have an illustrated backdrop, emoji characters, speech bubbles and emoji PROPS. Children cannot read minds: everything a line talks about must be SEEN. Return ONLY the complete revised lesson as one JSON object.`;

const RUBRIC = `REVISION RUBRIC — apply every rule:

1. SHOW WHAT YOU SAY (most important).
   - Story panels: every concrete thing or person mentioned in the caption or speech must be visible, either as a character in "characters" or as a prop in the panel's "props": [{ "emoji": "🎩", "label": "hat" }]. The label must be the exact word used in the text (singular is fine). Use 1–3 emoji per prop (two hats → "🎩🎩"). A panel can have up to 6 props. If a panel needs more, split it into two panels (max 6 panels) or simplify the text.
   - Captions describe what we SEE in that panel. Never mention a photo, object or person that isn't in the panel's characters or props.
   - People who are mentioned but don't speak (e.g. "this is my mother") become props: { "emoji": "👩", "label": "mother" }.
   - Hook: give the hook scene "props" (shown during all lines) and/or per-line "props" for the things each line mentions.
   - Check items of kind "gap" and "trueFalse": add "props" for the concrete things in the prompt. They are picture support, so they may show the answer's meaning but must never show the answer's English word.
   - Use only these backdrop keys: ${BACKDROPS.join(", ")}. The backdrop already shows its setting (park trees, kitchen table…).
2. FOCUS WORD PICTURES: each focusWords[].emoji must show the MEANING unmistakably to a 9-year-old. For abstract words use a small emoji composition, e.g. "the same" → "🎩🟰🎩", "different" → "🍎↔️🍌", "in common" → "🧒⚽🤝⚽👧". Never a generic or misleading emoji.
3. ONE RIGHT ANSWER, REAL THINKING: every check item must have exactly one correct option. Distractors come from the lesson's other focus words or the same topic, so children must think about meaning (in a family quiz use "brother", "neighbour", "grandmother", never "pencil" or "bicycle"). They are the same part of speech, wrong in context and never synonyms. Odd-one-out stays inside the topic, with one clear meaning-based reason (e.g. mother, father, sister, neighbour → neighbour is not family). Gap sentences need a context clue. True/False statements must be checkable from the story, a prop or a definition shown in the lesson. "explain" must be correct, kind and short.
4. STORY LOGIC: a coherent, warm mini-story. Speakers must be in that panel's characters. Names stay consistent. Each panel's backdrop fits the action. No contradictions between panels.
5. LANGUAGE LEVEL: short, natural sentences for the class level, British spelling, mostly present simple, no idioms above the level. Every line is read aloud by a voice actor, so no emojis or symbols inside "text".
6. TEACHING FLOW: the hook builds curiosity without teaching words yet. The reveal order goes from concrete to abstract. Speak frames fit the prompt, and the model answer uses the frames. Exit-ticket questions can be answered with today's words.
7. KEEP: all ids (scene ids, line ids, item ids, panel ids), the focusWords wordIds, the field names, and "status". Only add "props" fields and edit text/emoji/options/answers/backdrops. No Greek anywhere except greekHint.`;

function userPrompt(lesson, issues, errors) {
  const vis = issues.length ? `\nTHINGS MENTIONED BUT NOT SHOWN (fix every one — add props or change the text):\n${issues.map((v) => `- ${v.where}: "${v.noun}" in "${v.text}"`).join("\n")}` : "";
  const errs = errors?.length ? `\nVALIDATION ERRORS FROM YOUR PREVIOUS ANSWER (fix all):\n- ${errors.join("\n- ")}` : "";
  return `${RUBRIC}\n${vis}${errs}\n\nLESSON (focus word english/type are for reference only):\n${JSON.stringify(lesson)}`;
}

function merge(original, revised) {
  // Fields the editor may not change.
  const keep = ["schema", "id", "bookId", "unit", "section", "bigQuestion", "profile", "status", "locked", "generatedBy", "extensionWords"];
  const out = { ...revised };
  for (const k of keep) out[k] = original[k];
  out.focusWords = (revised.focusWords || []).filter((f) => getWord(f.wordId)).map((f) => ({ ...f, english: getWord(f.wordId).english, type: getWord(f.wordId).type }));
  out.revisedBy = { model: MODELS.model, date: new Date().toISOString().slice(0, 10), rubric: "show-what-you-say v1" };
  return out;
}

async function reviseOne(file, model) {
  const original = JSON.parse(fs.readFileSync(file, "utf8"));
  const id = original.id;
  if (state[id]?.status === "ok" && !flag("force")) { console.log(`· ${id}: already revised`); return; }
  let errors = null;
  let candidate = original;
  let spent = 0;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const issues = visibilityIssues(candidate, NOUNS);
    const res = await chatJson({ model, system: SYSTEM, user: userPrompt(candidate, issues, errors), temperature: 0.3, maxTokens: 20000, job: `revise ${id} #${attempt}` });
    spent += res.usd;
    candidate = merge(original, res.json);
    const report = validateLesson(candidate, getWord, { nouns: NOUNS, strictVisibility: true });
    errors = report.errors;
    console.log(`  ${id} attempt ${attempt}: ${errors.length} errors ($${res.usd.toFixed(4)})`);
    if (!errors.length) break;
  }
  // Accept if structurally valid; leftover visibility misses are kept as warnings for the audit.
  const structural = validateLesson(candidate, getWord, {}).errors;
  if (structural.length) {
    state[id] = { status: "failed", errors: structural.slice(0, 10), usd: spent };
    save();
    console.log(`✗ ${id}: kept the original (${structural[0]})`);
    return;
  }
  writeLesson(candidate);
  const left = visibilityIssues(candidate, NOUNS).length;
  state[id] = { status: "ok", visibilityLeft: left, usd: Number(spent.toFixed(5)), at: new Date().toISOString() };
  save();
  console.log(`✓ ${id}${left ? ` (${left} visibility notes left)` : ""}`);
}

async function main() {
  const only = opt("only") ? new Set(opt("only").split(",")) : null;
  const files = allLessonFiles().filter((f) => !only || only.has(JSON.parse(fs.readFileSync(f, "utf8")).id));
  const model = opt("model") || MODELS.model;
  console.log(`Revising ${files.length} lesson(s) with ${model} · OpenRouter cap left $${ledger.remaining("openrouter").toFixed(3)}`);
  let i = 0;
  const worker = async () => {
    while (i < files.length) {
      const f = files[i++];
      try { await reviseOne(f, model); } catch (e) {
        if (e instanceof BudgetError) { console.error(`Budget stop: ${e.message}`); i = files.length; return; }
        console.error(`✗ ${path.basename(f)}: ${e.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Number(opt("workers") || 8) }, worker));
  writeCatalog();
  console.log(`OpenRouter spent so far: $${ledger.spent("openrouter").toFixed(4)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
