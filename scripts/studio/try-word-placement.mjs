/* Try the Test Maker's word placement on a real model, through the spend ledger: a real unit test with many chosen
 * words, then what the word check's "Put words on the test" does — new vocabulary parts for the untested words
 * (with the word-by-word repair), strict new questions in a part, and replacing a question — each judged by the
 * word check itself (studio/test-coverage.js), the same way the app reports it. About $0.02 a run with DeepSeek.
 *   node scripts/studio/try-word-placement.mjs [--provider deepseek|gemini] [--level B_SENIOR] [--book CPP2 --unit 1] [--words 16]
 * Results are written to work/studio/ (gitignored). */
import fs from "node:fs";
import path from "node:path";
import { requireEnv, ROOT } from "../lib/env.mjs";
import { createLedger, geminiCost, deepseekCost } from "../lib/ledger.mjs";
import { getProfilePromptBlock } from "../../desktop/renderer/app.js";
import { buildUnitContext, unitWords } from "../../desktop/renderer/studio/unit-context.js";
import { testDefaults, testPrompt, buildTestDoc, makePart, fixItemsPrompt, applyItemFixes, reviseSection, estimateMinutes } from "../../desktop/renderer/studio/test-builder.js";
import { TASKS, levelIndex } from "../../desktop/renderer/studio/tasks.js";
import { TEST_DEFAULTS } from "../../desktop/renderer/studio/levels.js";
import { testCoverage, wordPriority, planNewParts, placementOptions, itemUses, hasWord } from "../../desktop/renderer/studio/test-coverage.js";
import { remakePlan, remakeProblems, remakeRetryHint } from "../../desktop/renderer/studio/remake.js";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const provider = opt("provider", "deepseek");
const MODEL = provider === "deepseek" ? "deepseek-chat" : "gemini-2.5-flash-lite";
const level = opt("level", "B_SENIOR");
const bookId = opt("book", "CPP2");
const unit = Number(opt("unit", 1));
const howMany = Number(opt("words", 16));
const ledger = createLedger();
const outDir = path.join(ROOT, "work", "studio");
fs.mkdirSync(outDir, { recursive: true });
const ANSWER_TASKS = new Set(["V-PIC", "V-MC", "V-SPELL", "V-BANK", "V-DEF"]);

async function ask(system, user, job, retryHint = "") {
  const u = retryHint ? `${user}\n\n${retryHint}` : user;
  if (provider === "deepseek") {
    ledger.assertCanSpend("deepseek", deepseekCost(MODEL, { inTok: Math.ceil((system.length + u.length) / 3.5), outTok: 8192 }), job);
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${requireEnv("DEEPSEEK_API_KEY")}` },
      body: JSON.stringify({ model: MODEL, messages: [{ role: "system", content: system }, { role: "user", content: u }], response_format: { type: "json_object" }, temperature: 0.35, max_tokens: 8192 }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`DeepSeek HTTP ${res.status}: ${json.error?.message || ""}`);
    const inTok = json.usage?.prompt_tokens || 0;
    const outTok = json.usage?.completion_tokens || 0;
    ledger.record({ provider: "deepseek", model: MODEL, inTok, outTok, usd: deepseekCost(MODEL, { inTok, outTok }), job });
    return JSON.parse(json.choices?.[0]?.message?.content || "{}");
  }
  ledger.assertCanSpend("gemini", geminiCost(MODEL, { inTok: Math.ceil((system.length + u.length) / 3.5), outTok: 8000 }), job);
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": requireEnv("GEMINI_API_KEY") },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: u }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.35, maxOutputTokens: 16000 } }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${json.error?.message || ""}`);
  const m = json.usageMetadata || {};
  ledger.record({ provider: "gemini", model: MODEL, inTok: m.promptTokenCount || 0, outTok: (m.candidatesTokenCount || 0) + (m.thoughtsTokenCount || 0), usd: geminiCost(MODEL, { inTok: m.promptTokenCount || 0, outTok: m.candidatesTokenCount || 0 }), job });
  return JSON.parse((json.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").replace(/^```(?:json)?\s*|\s*```$/g, ""));
}

const loadLesson = async (p) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "desktop", "renderer", "lessons", p), "utf8")); } catch { return null; } };
const unitContext = await buildUnitContext({ bookId, units: [unit], sections: ["BQ", "A", "B"] }, { loadLesson });
// Like the teacher's screenshot: every word of the unit chosen ("All"), far more than one test holds.
const focus = unitWords(bookId, unit, ["BQ", "A", "B", "WB"]);
const profileBlock = getProfilePromptBlock(level);
const ctx = { unitContext, focusWords: focus, pictureWords: [], profileBlock };
const report = (doc, label) => { const c = testCoverage(doc); console.log(`${label}: ${c.tested}/${c.total} tested · ${c.seen} only in a text · ${c.missing} not on the test`); return c; };

/* 1. A real test from the unit, as the app writes it. */
const spec = { ...testDefaults(level, "standard"), source: { kind: "unit", bookId, units: [unit] } };
console.log(`Writing a ${spec.parts.length}-part test for ${level}, ${bookId} Unit ${unit}, ${focus.length} chosen words…`);
const t = testPrompt(spec, ctx);
let doc = buildTestDoc(spec, await ask(t.system, t.user, "word-placement: test"), { levelId: level, focusWords: focus, meta: { unit } });
const cov0 = report(doc, "Written test");

/** The dialog's strict "Add new questions": one per word, at the end of the part, checked; returns the words missed. */
async function strictAdd(partIdx, words) {
  const s = doc.sections[partIdx];
  const answer = ANSWER_TASKS.has(s.task);
  const at = s.items.length;
  reviseSection(doc, spec, s.id, (raw) => { raw.items.splice(at, 0, ...words.map(() => ({ prompt: "(a new question)", answer: "", options: s.answerType === "choice" ? ["?", "?"] : undefined }))); }, { focusWords: focus });
  const ns = words.map((_, k) => at + k + 1);
  const instruction = ["These are NEW questions added to the part. Each one is different from every other question.", ns.map((n, k) => `Question ${n} MUST be built on the word "${words[k]}"${answer ? " and its right answer MUST be that word (a form of it that fits the sentence is fine)" : ""}.`).join(" ")].join(" ");
  let missing = ns;
  for (let attempt = 0; attempt < 2 && missing.length; attempt++) {
    const fx = fixItemsPrompt(spec, doc.sections[partIdx], missing, { profileBlock, focusWords: focus, pictureWords: [], instruction });
    const why = missing.map((n) => `question ${n} must ${answer ? "have the answer" : "use the word"} "${words[ns.indexOf(n)]}"`).join("; ");
    applyItemFixes(doc, spec, s.id, await ask(fx.system, fx.user, "word-placement: add", attempt ? `Write items ${missing.join(", ")}; ${why}.` : ""), missing, { focusWords: focus });
    missing = ns.filter((n, k) => { const it = doc.sections[partIdx].items[n - 1]; return !it || !it.answer || it.prompt === "(a new question)" || (answer ? !hasWord(String(it.answer), words[k], focus.map((w) => w.english)) : !itemUses(it, words[k], focus.map((w) => w.english))); });
  }
  // As in the app: the ones that came out right stay, the others are taken out again.
  if (missing.length) reviseSection(doc, spec, s.id, (raw) => { [...missing].sort((a, b) => b - a).forEach((n) => raw.items.splice(n - 1, 1)); }, { focusWords: focus });
  return missing.map((n) => words[ns.indexOf(n)]);
}

/* 2. New vocabulary parts for the first N untested words (the dialog's recommendation), then the word-by-word repair. */
const untested = wordPriority(cov0).filter((w) => w.status !== "tested");
const chosen = untested.slice(0, howMany);
const perPart = Math.max(6, Math.min(10, (TEST_DEFAULTS[level]?.items || 5) + 3));
const plan = planNewParts(chosen, { levelIdx: levelIndex(level), tasks: TASKS, perPart, hasPicture: () => false, used: doc.sections.map((s) => s.task) });
console.log(`\nNew parts for ${chosen.length} of ${untested.length} untested words: ${plan.map((p) => `${p.task} (${p.words.length})`).join(", ")} · test ≈${estimateMinutes(spec)} min before`);
const results = [];
for (const pl of plan) {
  const p = makePart("vocabulary", pl.task, level);
  p.items = pl.words.length;
  p.note = `One question for each of these words, each word used once${TASKS[pl.task]?.answer === "match" ? "" : " as the right answer"}: ${pl.words.join(", ")}.`;
  const lastVocab = spec.parts.map((x) => x.skill).lastIndexOf("vocabulary");
  spec.parts.splice(lastVocab + 1, 0, p);
  const pr = testPrompt(spec, { ...ctx, rewrite: { wish: `A new part built on exactly these ${pl.words.length} words, one question each: ${pl.words.join(", ")}.`, previous: [] } }, [p.id]);
  doc = buildTestDoc(spec, await ask(pr.system, pr.user, `word-placement: new part ${pl.task}`), { levelId: level, focusWords: focus, meta: { unit } }, doc);
  const idx = doc.sections.findIndex((s) => s.id === p.id);
  const got = doc.sections[idx].items.length;
  if (got < pl.words.length) {
    // The app's rewritePart asks once more for a part that came back short, and keeps the longer one.
    const again = buildTestDoc(spec, await ask(pr.system, pr.user, "word-placement: new part (short)", `Your part had only ${got} of the ${pl.words.length} items. Write EXACTLY ${pl.words.length} items plus the example.`), { levelId: level, focusWords: focus, meta: { unit } }, doc);
    if (again.sections[idx].items.length > got) doc = again;
  }
  const inPart = (w) => testCoverage(doc).words.find((x) => x.english === w)?.tested.some((x) => x.part === idx);
  const first = pl.words.filter(inPart);
  // Repair: a missed word goes into a question of the part that tests no chosen word (or repeats one), as the answer.
  const repaired = [];
  const failed = [];
  // A part still short gets the missing questions added first (the app does the same).
  const shortBy = Math.max(0, pl.words.length - doc.sections[idx].items.length);
  if (shortBy) {
    const miss = pl.words.filter((x) => !inPart(x)).slice(0, shortBy);
    const notAdded = await strictAdd(idx, miss);
    repaired.push(...miss.filter((w) => !notAdded.includes(w)));
  }
  for (const w of pl.words.filter((x) => !inPart(x))) {
    const o = placementOptions(doc, pl.words, { tasks: TASKS })[idx];
    const spare = o.items.find((it) => !it.tests.some((x) => pl.words.includes(x)) || (it.tests.length && !it.only.length && it.tests.every((x) => pl.words.includes(x))));
    if (!spare) { failed.push(w); continue; }
    const answer = ANSWER_TASKS.has(pl.task);
    const sec = doc.sections[idx];
    const original = JSON.parse(JSON.stringify(sec.items[spare.n - 1]));
    const rp = remakePlan({ wish: `use the word "${w}"${answer ? " as the right answer" : ""}`, item: original, siblings: sec.items.filter((_, k) => k !== spare.n - 1), candidates: focus });
    if (answer) { rp.instruction += `\nThe right answer MUST be "${w}" (a form of it that fits the sentence is fine): the question tests that word.`; rp.checks.answer = w; }
    let problems = [];
    const before = JSON.stringify(doc.sections);
    for (let attempt = 0; attempt < 3; attempt++) {
      const fx = fixItemsPrompt(spec, doc.sections[idx], [spare.n], { profileBlock, focusWords: focus, pictureWords: [], instruction: rp.instruction });
      applyItemFixes(doc, spec, p.id, await ask(fx.system, fx.user, "word-placement: repair", attempt ? remakeRetryHint(problems) : ""), [spare.n], { focusWords: focus });
      problems = remakeProblems(original, doc.sections[idx].items[spare.n - 1], rp.checks);
      if (!problems.length) break;
      doc.sections = JSON.parse(before);
    }
    (problems.length ? failed : repaired).push(w);
  }
  const final = pl.words.filter(inPart);
  results.push({ task: pl.task, words: pl.words.length, firstTry: first.length, repaired: repaired.length, tested: final.length, failed });
  console.log(`  ${pl.task}: ${doc.sections[idx].items.length} questions · first try ${first.length}/${pl.words.length} · repaired ${repaired.length} · now tested ${final.length}/${pl.words.length}${failed.length ? ` · not placed: ${failed.join(", ")}` : ""}`);
  doc.sections[idx].items.forEach((it) => console.log(`      ${it.n}. ${it.prompt}${it.options?.length ? ` [${it.options.join(" / ")}]` : ""} → ${it.answer}`));
}
console.log(`  test ≈${estimateMinutes(spec)} min after`);

/* 3. Strict new questions in an existing vocabulary part (the dialog's "Add new questions"). */
const left = wordPriority(testCoverage(doc)).filter((w) => w.status !== "tested").slice(0, 3).map((w) => w.english);
// The dialog offers only parts that can take the words: picture parts need a picture for each word (none here).
const vIdx = placementOptions(doc, left, { tasks: TASKS, hasPicture: () => false }).find((o) => o.fit === "best" && o.canAdd && doc.sections[o.part].items.length <= 9)?.part ?? -1;
if (left.length && vIdx >= 0) {
  const before = doc.sections[vIdx].items.length;
  const missed = await strictAdd(vIdx, left);
  console.log(`
Add ${left.length} questions to Part ${vIdx + 1} (${doc.sections[vIdx].task}): ${left.length - missed.length}/${left.length} right${missed.length ? ` · missed: ${missed.join(", ")}` : ""}`);
  doc.sections[vIdx].items.slice(before).forEach((it) => console.log(`      ${it.n}. ${it.prompt}${it.options?.length ? ` [${it.options.join(" / ")}]` : ""} → ${it.answer}`));
}

const end = report(doc, "\nAfter placement");
fs.writeFileSync(path.join(outDir, "word-placement-doc.json"), JSON.stringify({ doc, results }, null, 2));
console.log(`${provider} spend left: $${ledger.remaining(provider).toFixed(3)}`);
void end;
