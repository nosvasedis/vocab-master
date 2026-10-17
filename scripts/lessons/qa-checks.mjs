#!/usr/bin/env node
/* Quiz-quality pass: a reasoning model re-checks every check item (one right answer, topic distractors,
   verifiable true/false, clear odd-one-out) and returns corrected items. Items are merged by id and the
   lesson is re-validated; anything that fails validation keeps the previous version.
   Usage: node scripts/lessons/qa-checks.mjs [--only CPP1-U1-A,...] [--force] [--model id] [--workers 8] */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../lib/env.mjs";
import { chatJson, ledger } from "../lib/ai.mjs";
import { BudgetError } from "../lib/ledger.mjs";
import { validateLesson } from "../../desktop/renderer/lesson/schema.js";
import { allLessonFiles, getWord, writeLesson, sectionWords } from "./lib/catalog.mjs";

const STATE_FILE = path.join(ROOT, "work", "state", "qa-checks.json");
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const flag = (n) => args.includes(`--${n}`);
const state = (() => { try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return {}; } })();
const save = () => { fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1)); };
const MODEL = opt("model") || "deepseek/deepseek-v4.1-flash"; // user choice 2026-10-17 (revision 1017)

const SYSTEM = `You are a strict ESL assessment editor for Greek children aged 9–14. You check quiz items for a projected classroom vocabulary lesson and fix every flaw. Think carefully, item by item. Return ONLY JSON: { "items": [ ...corrected items... ], "notes": ["short note per change"] }`;

const RULES = `For EVERY item:
- Read the prompt with EACH option in turn. Exactly ONE option may be correct. If a distractor could also be correct or sensible (e.g. "Timmy's ____ works on a farm" → both "parent" and "grandparent" fit), rewrite the prompt with a clue that makes only the answer correct, or replace the distractor.
- Distractors must be the same part of speech and come from this lesson's focus words or the unit topic (the candidate list below), so children must think about meaning. Never random unrelated words (no "planet", "bag" or "pencil" in a family quiz).
- gap: the prompt contains "____" exactly once, has a context clue, and never contains the answer word.
- pickPicture / listen: options are focus-word IDS (keep the ID format). The prompt describes the meaning (pickPicture) or names the word to hear (listen). All options are different focus words.
- trueFalse: options are exactly ["True","False"]. The statement must be checkable from the story or the definitions, with no tricky negatives.
- oddOneOut: 4 English words from the topic, with exactly one clear meaning-based odd one. The explain line says why.
- explain: one short, correct, kind sentence.
- Keep each item's "id", "kind", "wordId" and "props". "answer" is the index of the correct option. Language must suit the class level (short sentences, British spelling).
- Keep the prompt/explain line objects as { "id": ..., "text": ... } with the same ids.`;

function payload(lesson) {
  const focus = lesson.focusWords.map((f) => ({ id: f.wordId, english: f.english, type: f.type, meaning: f.kidDefinition }));
  const topic = sectionWords(lesson.bookId, lesson.unit, lesson.section).map((w) => `${w.english} (${w.type})`).slice(0, 60);
  const story = (lesson.scenes.find((s) => s.type === "story")?.panels || []).flatMap((p) => [p.caption?.text, ...(p.speech || []).map((s) => s.text)]).filter(Boolean);
  const check = lesson.scenes.find((s) => s.type === "check");
  return { level: lesson.profile, focus, topicCandidates: topic, story, items: check?.items || [] };
}

async function qaOne(file) {
  const lesson = JSON.parse(fs.readFileSync(file, "utf8"));
  const id = lesson.id;
  if (state[id]?.status === "ok" && !flag("force")) return console.log(`· ${id}: done`);
  const data = payload(lesson);
  let errors = null;
  let spent = 0;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const user = `${RULES}\n${errors ? `\nYOUR PREVIOUS ANSWER FAILED VALIDATION:\n- ${errors.join("\n- ")}\n` : ""}\nDATA:\n${JSON.stringify(data)}`;
    const res = await chatJson({ model: MODEL, system: SYSTEM, user, temperature: 0.2, maxTokens: 24000, job: `qa ${id} #${attempt}`, extra: { reasoning: { effort: opt("effort") || "medium" } } });
    spent += res.usd;
    const fixed = new Map((res.json.items || []).map((it) => [it.id, it]));
    const next = structuredClone(lesson);
    const check = next.scenes.find((s) => s.type === "check");
    check.items = check.items.map((it) => {
      const f = fixed.get(it.id);
      if (!f || f.kind !== it.kind) return it;
      return { ...it, prompt: f.prompt?.text ? { id: it.prompt.id, text: f.prompt.text } : it.prompt, options: f.options, answer: f.answer, explain: f.explain?.text ? { id: it.explain?.id || `${it.id}e`, text: f.explain.text } : it.explain };
    });
    errors = validateLesson(next, getWord, {}).errors;
    if (!errors.length) {
      next.qaBy = { model: MODEL, date: new Date().toISOString().slice(0, 10) };
      writeLesson(next);
      state[id] = { status: "ok", usd: Number(spent.toFixed(5)), notes: (res.json.notes || []).slice(0, 12) };
      save();
      return console.log(`✓ ${id} (${(res.json.notes || []).length} changes, $${spent.toFixed(4)})`);
    }
  }
  state[id] = { status: "failed", errors: errors.slice(0, 8), usd: spent };
  save();
  console.log(`✗ ${id}: ${errors[0]}`);
}

async function main() {
  const only = opt("only") ? new Set(opt("only").split(",")) : null;
  const files = allLessonFiles().filter((f) => !only || only.has(JSON.parse(fs.readFileSync(f, "utf8")).id));
  console.log(`QA ${files.length} lesson(s) with ${MODEL} · OpenRouter cap left $${ledger.remaining("openrouter").toFixed(3)}`);
  let i = 0;
  const worker = async () => {
    while (i < files.length) {
      const f = files[i++];
      try { await qaOne(f); } catch (e) {
        if (e instanceof BudgetError) { console.error(`Budget stop: ${e.message}`); i = files.length; return; }
        console.error(`✗ ${path.basename(f)}: ${e.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Number(opt("workers") || 8) }, worker));
  console.log(`OpenRouter spent so far: $${ledger.spent("openrouter").toFixed(4)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
