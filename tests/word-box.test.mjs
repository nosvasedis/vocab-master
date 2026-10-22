/* Word boxes (worksheets D01 / L01 / L05, tests V-BANK / R-GAP): one word per gap unless the teacher asks for
 * extra words — then exactly that many, and the instruction says so. Plus two columns for long exercises with
 * one-letter or one-word answers. */
import test from "node:test";
import assert from "node:assert/strict";
import { sameWord, fitWordBox, countExtraWords, repeatedAnswers, withExtraWords, extraWordsLine, inAnswerOrder } from "../desktop/renderer/studio/word-box.js";
import { useTwoColumns, isShortAnswer, testPartColumns } from "../desktop/renderer/studio/item-columns.js";
import { TASKS, KNOBS, partOpts } from "../desktop/renderer/studio/tasks.js";
import { testDefaults, makePart, buildTestDoc, reviseSection, testPrompt, fixItemsPrompt, planNotes } from "../desktop/renderer/studio/test-builder.js";
import { sectionRubric, relabelDoc, makeVersionB } from "../desktop/renderer/studio/doc-model.js";
import { renderStudentPaper } from "../desktop/renderer/studio/doc-render.js";
import { normalizeWorksheetExercises, renderDictation, renderLingoLauncher, validateWorksheet, buildSystemPrompt, pickGenerationPlan, buildStudioDocx, exerciseExtraWords } from "../desktop/renderer/app.js";

/* ── The box itself ─────────────────────────────────────────────── */

test("the same word in another form is the same word; a word inside another is not", () => {
  assert.ok(sameWord("city", "cities"));
  assert.ok(sameWord("run", "ran"));
  assert.ok(sameWord("take off", "took off"));
  assert.ok(sameWord("Lava", "lava"));
  assert.equal(sameWord("art", "party"), false);
  assert.equal(sameWord("plant", "planet"), false);
  assert.equal(sameWord("eruption", "volcanic eruption"), false);
});

test("no extra words: the box is exactly the answers, each once, never in gap order", () => {
  const answers = ["lava", "erupted", "cities", "crater"];
  for (let i = 0; i < 20; i++) {
    const box = fitWordBox({ bank: ["lava", "erupt", "city", "crater", "ash", "smoke", "volcano"], answers });
    assert.deepEqual([...box.words].sort(), [...answers].sort(), "answers only, in the form the gaps need");
    assert.deepEqual(box.extraWords, []);
    assert.equal(inAnswerOrder(box.words, answers), false);
  }
  // A missing answer comes in; a word the AI repeated goes.
  assert.deepEqual(fitWordBox({ bank: ["lava", "lava"], answers: ["lava", "ash"] }).words.sort(), ["ash", "lava"]);
});

test("N extra words: exactly N words that fit no gap — the old ones first, then the AI's, then spare words", () => {
  const answers = ["lava", "ash", "crater"];
  const box = fitWordBox({ bank: ["lava", "ash", "crater", "magma", "rock", "smoke"], answers, extras: 2 });
  assert.equal(box.words.length, 5);
  assert.deepEqual(box.extraWords, ["smoke", "rock"], "the AI lists its extras last");
  assert.deepEqual(fitWordBox({ bank: ["lava", "ash", "crater", "magma", "rock", "smoke"], answers, extras: 2, keep: ["magma"] }).extraWords, ["magma", "smoke"]);
  const short = fitWordBox({ bank: ["lava", "ash"], answers, extras: 2, spare: ["lava", "ashes", "volcano", "island"] });
  assert.deepEqual(short.extraWords, ["volcano", "island"], "a spare word that is an answer (in any form) is never an extra");
  assert.equal(short.short, 0);
  assert.equal(fitWordBox({ bank: [], answers, extras: 3 }).short, 3);
  // A form of an answer is never an extra word.
  assert.deepEqual(fitWordBox({ bank: ["lava", "ash", "crater", "craters"], answers, extras: 1 }).extraWords, []);
  // The example's word is neither an answer nor an extra.
  assert.deepEqual(fitWordBox({ bank: ["lava", "ash", "crater", "volcano", "rock"], answers, extras: 2, exclude: ["volcano"] }).extraWords, ["rock"]);
});

test("a box that already fits keeps its order (preview, print and Word stay the same)", () => {
  const answers = ["lava", "ash", "crater"];
  const first = fitWordBox({ bank: ["ash", "rock", "crater", "lava"], answers, extras: 1 });
  assert.deepEqual(first.words, ["ash", "rock", "crater", "lava"]);
  const again = fitWordBox({ bank: first.words, answers, extras: 1, keep: first.extraWords });
  assert.deepEqual(again.words, first.words);
});

test("the teacher's own box keeps all its words (the answers are added)", () => {
  const box = fitWordBox({ bank: ["lava", "dog", "cat", "bird", "fish", "frog"], answers: ["lava", "ash"], extras: 0, asIs: true });
  assert.equal(box.words.length, 7);
  assert.deepEqual(box.extraWords, ["dog", "cat", "bird", "fish", "frog"]);
});

test("the instruction line: English and Greek, singular and plural, and never twice", () => {
  assert.equal(extraWordsLine(0), "");
  assert.equal(extraWordsLine(1), "There is one extra word you do not need.");
  assert.equal(extraWordsLine(3), "There are three extra words you do not need.");
  assert.equal(extraWordsLine(2, "el"), "Υπάρχουν δύο λέξεις που δεν χρειάζεσαι.");
  assert.equal(extraWordsLine(1, "el"), "Υπάρχει μία λέξη που δεν χρειάζεσαι.");
  assert.equal(withExtraWords("Read and complete", 2), "Read and complete. There are two extra words you do not need.");
  // The AI's own (wrong) claim is replaced, and a box without extras says nothing about them.
  assert.equal(withExtraWords("Read and complete. There are two extra words.", 1), "Read and complete. There is one extra word you do not need.");
  assert.equal(withExtraWords("Read and complete. There are 2 extra words you don't need.", 0), "Read and complete.");
  const once = withExtraWords("Use the words.", 3);
  assert.equal(withExtraWords(once, 3), once);
  assert.equal(withExtraWords(withExtraWords("Διάβασε.", 2, "el"), 1, "el"), "Διάβασε. Υπάρχει μία λέξη που δεν χρειάζεσαι.");
  assert.equal(countExtraWords(["lava", "ash", "rock"], ["lava", "ashes"]), 1);
  assert.deepEqual(repeatedAnswers(["lava", "ash", "Lava", "rock", "ashes"]), [{ n: 3, first: 1, answer: "Lava" }, { n: 5, first: 2, answer: "ashes" }]);
});

/* ── Tests (Test Maker) ─────────────────────────────────────────── */

const bankDoc = (task = "V-BANK", extras, raw = {}) => {
  const t = TASKS[task];
  const part = { ...makePart(t.skill, task, "C_SENIOR"), id: "p1", items: 4, ...(extras !== undefined ? { opts: { extras } } : {}) };
  const spec = { ...testDefaults("C_SENIOR"), parts: [part], greek: true };
  const reply = { sections: [{ id: "p1", passage: "(1) ________ (2) ________ (3) ________ (4) ________", bank: ["lava", "erupt", "crack", "ash", "smoke", "rock", "magma"],
    example: { prompt: "A ________ is a mountain.", answer: "volcano" },
    items: [{ prompt: "Hot ________ flows.", answer: "lava" }, { prompt: "It ________ed.", answer: "erupted" }, { prompt: "A ________ in the ground.", answer: "crack" }, { prompt: "Grey ________ fell.", answer: "ash" }], ...raw }] };
  const focusWords = ["lava", "erupt", "crack", "ash", "crater", "island"].map((english) => ({ english }));
  return { spec, doc: buildTestDoc(spec, reply, { levelId: "C_SENIOR", focusWords, meta: {} }), focusWords };
};

test("the Step 3 setting: V-BANK and R-GAP have “Extra words in the box”, none by default", () => {
  for (const task of ["V-BANK", "R-GAP"]) {
    assert.ok(TASKS[task].knobs.includes("extras"), task);
    assert.equal(partOpts(makePart(TASKS[task].skill, task, "D_SENIOR"), "D_SENIOR").extras, 0);
  }
  assert.deepEqual(KNOBS.extras.values.map(([v]) => v), [0, 1, 2, 3]);
  assert.doesNotMatch(TASKS["V-BANK"].ai + TASKS["R-GAP"].ai, /extra unit words/, "the AI isn't told to add extras on its own");
});

test("a test part without extra words: one word per gap, no extra-words line, the example's word left out", () => {
  const { doc } = bankDoc("V-BANK");
  const s = doc.sections[0];
  assert.deepEqual([...s.bank].sort(), ["ash", "crack", "erupted", "lava"]);
  assert.deepEqual(s.extraWords, []);
  assert.doesNotMatch(s.rubric, /extra/i);
  assert.doesNotMatch(s.rubricEl, /χρειάζεσαι/);
});

test("a test part with +2: exactly two extra words, and the instruction says so (English and Greek, paper too)", () => {
  const { doc } = bankDoc("R-GAP", 2, { rubric: "Read the text and complete it. There are three extra words." });
  const s = doc.sections[0];
  assert.equal(s.bank.length, 6);
  assert.equal(s.extraWords.length, 2);
  assert.match(s.rubric, /complete it\. There are two extra words you do not need\.$/);
  assert.match(s.rubricEl, /Υπάρχουν δύο λέξεις που δεν χρειάζεσαι\.$/);
  const html = renderStudentPaper(doc, { layout: { greek: true } });
  assert.equal(html.match(/There are two extra words/g).length, 1);
  assert.match(html, /Υπάρχουν δύο λέξεις/);
  // Version B shuffles the box but keeps the same words.
  assert.deepEqual([...makeVersionB(doc).sections[0].bank].sort(), [...s.bank].sort());
});

test("the prompt asks for one word per gap, or exactly N more; a fix keeps answers different", () => {
  const { spec, doc } = bankDoc("V-BANK");
  assert.match(testPrompt(spec, {}).user, /EXACTLY the 4 answers, each once.*NO extra words/);
  spec.parts[0].opts = { extras: 3 };
  assert.match(testPrompt(spec, {}).user, /plus EXACTLY 3 extra words that fit NO gap .* 7 words in all/);
  assert.match(fixItemsPrompt(spec, doc.sections[0], [2]).user, /Each gap needs a different word/);
});

test("two gaps with the same answer are flagged on the later question (it can be fixed alone)", () => {
  const { doc } = bankDoc("V-BANK", 0, { items: [{ prompt: "a ________", answer: "lava" }, { prompt: "b ________", answer: "ash" }, { prompt: "c ________", answer: "Lava" }, { prompt: "d ________", answer: "crack" }] });
  assert.ok(doc.sections[0].problems.some((p) => /^item 3: same answer as item 1/.test(p)));
});

test("fixing a question keeps the extra words; the old answer leaves the box and the new one comes in", () => {
  const { spec, doc } = bankDoc("V-BANK", 2);
  const before = [...doc.sections[0].extraWords];
  assert.ok(reviseSection(doc, spec, "p1", (raw) => { raw.items[3].answer = "crater"; }, { focusWords: [] }));
  const s = doc.sections[0];
  assert.deepEqual(s.extraWords, before);
  assert.ok(s.bank.includes("crater") && !s.bank.includes("ash"));
  assert.equal(s.bank.length, 6);
  assert.match(s.rubricEl, /δύο λέξεις/);
});

test("changing the setting on a written test refits the box without the AI (spare words from the test)", () => {
  const { spec, doc } = bankDoc("V-BANK", 0);
  spec.parts[0].opts = { extras: 1 };
  reviseSection(doc, spec, "p1", () => {}, { focusWords: doc.focusWords });
  assert.equal(doc.sections[0].extraWords.length, 1);
  assert.match(doc.sections[0].rubric, /There is one extra word you do not need\./);
  spec.parts[0].opts = { extras: 0 };
  reviseSection(doc, spec, "p1", () => {}, { focusWords: doc.focusWords });
  assert.equal(doc.sections[0].bank.length, 4);
  assert.doesNotMatch(doc.sections[0].rubric, /extra/);
});

test("a box the teacher typed keeps its words, and the instruction counts them", () => {
  const { spec, doc } = bankDoc("V-BANK", 0);
  reviseSection(doc, spec, "p1", (raw) => { raw.bank = ["lava", "erupted", "crack", "ash", "dog", "cat", "cow"]; raw.keepBank = true; }, { focusWords: [] });
  assert.equal(doc.sections[0].bank.length, 7);
  assert.match(doc.sections[0].rubric, /There are three extra words/);
});

test("tests saved before: the paper's instruction says how many extra words their box has", () => {
  const { doc } = bankDoc("V-BANK", 2);
  const s = doc.sections[0];
  s.rubric = "Read and complete. Use the words in the box.";
  s.rubricEl = "Διάβασε και συμπλήρωσε με τις λέξεις από το κουτί.";
  delete s.extraWords;
  assert.match(sectionRubric(s).en, /Use the words in the box\. There are two extra words you do not need\.$/);
  relabelDoc(doc);
  assert.match(s.rubricEl, /δύο λέξεις/);
});

test("Step 3 note: a word box with more gaps than chosen words", () => {
  const spec = { ...testDefaults("C_SENIOR"), parts: [{ ...makePart("vocabulary", "V-BANK", "C_SENIOR"), items: 8 }], source: { kind: "unit" } };
  const notes = planNotes(spec, { focusWords: ["a", "b", "c"].map((english) => ({ english })) });
  assert.match(notes.join(" "), /a word box needs a different word for each gap/);
});

/* ── Worksheets ─────────────────────────────────────────────────── */

const sheet = (extras, more = {}) => ({
  meta: { classProfile: "B_SENIOR", layout: { greekHelp: true } },
  generationPlan: extras ? { tune: { extras } } : {},
  lingoLauncher: {
    vocabulary: ["planet", "savanna", "nectar", "climate", "plant", "south"].map((english) => ({ english })),
    practice: [{ number: 1, typeId: "L05", instruction: "", wordList: ["planet", "savanna", "nectar", "climate", "plant"], items: [{ number: 1, prompt: "a ________ b", answer: "planet" }, { number: 2, prompt: "c ________", answer: "savanna" }] }],
  },
  dictation: { exercises: [{ number: 1, typeId: "D01", wordBank: ["planet", "savanna", "nectar", "climate", "plant", "school", "family"], items: [{ number: 1, prompt: "sweet juice ________", answer: "nectar" }, { number: 2, prompt: "they grow ________", answer: "plants" }, { number: 3, prompt: "the weather ________", answer: "climate" }] }] },
  ...more,
});

test("worksheets without extra words: D01 and L05 boxes are exactly the answers (the AI had listed every unit word)", () => {
  const d = normalizeWorksheetExercises(sheet(0));
  assert.deepEqual([...d.dictation.exercises[0].wordBank].sort(), ["climate", "nectar", "plants"]);
  assert.deepEqual([...d.lingoLauncher.practice[0].wordList].sort(), ["planet", "savanna"]);
  assert.doesNotMatch(renderDictation(d, {}), /extra word/);
  assert.equal(exerciseExtraWords(d.dictation.exercises[0]), 0);
});

test("worksheets with +2: exactly two more words, the line on the paper (and in Greek), and stable on every render", () => {
  const d = normalizeWorksheetExercises(sheet(2));
  const ex = d.dictation.exercises[0];
  assert.equal(ex.wordBank.length, 5);
  assert.equal(exerciseExtraWords(ex), 2);
  assert.equal(d.lingoLauncher.practice[0].wordList.length, 4, "L05 keeps its extra words (it used to drop them)");
  const html = renderDictation(d, {});
  assert.match(html, /word bank\. There are two extra words you do not need\./);
  assert.match(html, /Υπάρχουν δύο λέξεις που δεν χρειάζεσαι\./);
  assert.match(renderLingoLauncher(d, {}), /There are two extra words you do not need\./);
  const again = normalizeWorksheetExercises(JSON.parse(JSON.stringify(d)));
  assert.deepEqual(again.dictation.exercises[0].wordBank, ex.wordBank);
});

test("worksheets: a box the teacher typed keeps its words from then on; a changed answer swaps in the box", () => {
  const d = normalizeWorksheetExercises(sheet(0));
  const ex = d.dictation.exercises[0];
  ex.wordBank = [...ex.wordBank, "rocket", "moon"];
  ex.boxByTeacher = true;
  normalizeWorksheetExercises(d);
  assert.equal(ex.wordBank.length, 5);
  assert.equal(ex.extraCount, 2);
  ex.items[0].answer = "south";
  normalizeWorksheetExercises(d);
  assert.ok(ex.wordBank.includes("south") && !ex.wordBank.includes("nectar"));
  assert.deepEqual([...ex.extraWords].sort(), ["moon", "rocket"]);
});

test("worksheets: the same answer twice in one box exercise is an issue on the later line", () => {
  const data = sheet(0);
  data.dictation.exercises[0].items[2].answer = "nectar";
  const d = normalizeWorksheetExercises(data);
  assert.ok(validateWorksheet(d).issues.some((i) => /^Dictation ex 1 \(D01\) item 3: same answer as item 1/.test(i)));
});

test("the worksheet prompt: one word per gap by default, exactly N more with the tune", () => {
  const plan = pickGenerationPlan("B_SENIOR", { exerciseMode: "custom", customDictationTypes: ["D01", "D03"], customLingoTypes: ["L01"] });
  const sys = buildSystemPrompt("B_SENIOR", plan);
  assert.match(sys, /WORD BOXES \(D01, L01\)/);
  assert.match(sys, /EXACTLY that exercise's answers, each once.*NO extra words/);
  assert.doesNotMatch(sys, /may include all unit words/);
  const tuned = pickGenerationPlan("B_SENIOR", { exerciseMode: "custom", customDictationTypes: ["D01"], customLingoTypes: ["L01"], tune: { extras: 2 } });
  assert.match(buildSystemPrompt("B_SENIOR", tuned), /PLUS EXACTLY 2 extra words/);
});

/* ── Two columns ────────────────────────────────────────────────── */

test("two columns: 10+ lines, one-letter / one-word answers, lines short enough for half the page", () => {
  const rows = (n, length = 30, short = true) => Array.from({ length: n }, () => ({ short, length }));
  assert.equal(useTwoColumns(rows(10)), true);
  assert.equal(useTwoColumns(rows(9)), false);
  assert.equal(useTwoColumns(rows(10, 60)), false, "long lines would wrap");
  assert.equal(useTwoColumns(rows(10, 30, false)), false, "phrase answers");
  assert.equal(useTwoColumns(rows(10, 38), { textSize: "xlarge" }), false, "bigger text, shorter limit");
  assert.ok(isShortAnswer("b") && isShortAnswer("rainforest") && !isShortAnswer("on the savanna"));
});

const longPart = (task, n, item) => {
  const t = TASKS[task];
  const spec = { ...testDefaults("C_SENIOR"), parts: [{ ...makePart(t.skill, task, "C_SENIOR"), id: "p1", items: n }] };
  return buildTestDoc(spec, { sections: [{ id: "p1", example: item(0), items: Array.from({ length: n }, (_, i) => item(i + 1)) }] }, { levelId: "C_SENIOR", meta: {} });
};

test("a test part with 12 short questions sits in two columns, on paper and in Word; long ones don't", async () => {
  const short = longPart("V-BANK", 12, (i) => ({ prompt: `The ________ is hot ${i}.`, answer: `word${String.fromCharCode(97 + i)}` }));
  assert.equal(testPartColumns(short.sections[0]), true);
  assert.match(renderStudentPaper(short), /<div class="st-cols">/);
  const long = longPart("V-DEF", 12, (i) => ({ prompt: `This is a very long description of a thing number ${i} that wraps.`, answer: "word" }));
  assert.doesNotMatch(renderStudentPaper(long), /st-cols/);
  const few = longPart("V-DEF", 8, (i) => ({ prompt: `Hot thing ${i}.`, answer: "word" }));
  assert.doesNotMatch(renderStudentPaper(few), /st-cols/);
  const phrases = longPart("R-QA", 12, (i) => ({ prompt: `Where ${i}?`, answer: "on the savanna" }));
  assert.equal(testPartColumns(phrases.sections[0]), false);
  const a = await buildStudioDocx({ doc: short, which: "student" });
  const b = await buildStudioDocx({ doc: long, which: "student" });
  assert.ok(a.size > 0 && b.size > 0);
});

test("a worksheet exercise with 10 short lines sits in two columns; 9 lines don't", () => {
  const lines = (n) => Array.from({ length: n }, (_, i) => ({ number: i + 1, prompt: `( ) Bees make honey ${i}.`, answer: i % 2 ? "T" : "F" }));
  const data = (n) => normalizeWorksheetExercises({ ...sheet(0), dictation: { exercises: [{ number: 1, typeId: "D15", wordBank: [], items: lines(n) }] } });
  assert.match(renderDictation(data(10), {}), /<div class="ex-cols">/);
  assert.doesNotMatch(renderDictation(data(9), {}), /ex-cols/);
});
