/* Regression tests: the current word list is the single source of truth (no leaks from an earlier list),
 * and two-answer keys (T/F, Yes/No, A/B) and bracket choices are always mixed. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  configureAi, enforceTeacherVocabulary, regenerateDictationOnly, regenerateLingoPracticeOnly, generateWorksheets,
  buildUserPrompt, validateWorksheet, validateAnswerKeys, normalizeWorksheetExercises, worksheetMatchesForm, applyQuickWorksheetFixes,
} from "../desktop/renderer/app.js";
import { findOutsideAnswers, answerInScope, allowedTerms, containsForm } from "../desktop/renderer/studio/word-scope.js";
import {
  balancedPattern, binaryBalance, repairABItems, choicesPredictable, rebalanceChoiceItems, choicePosition, balancedPositions,
} from "../desktop/renderer/studio/answer-balance.js";

const row = (english, extra = {}) => ({
  english, type: "n.", greek: "x", emojis: "", collocation: "", derivatives: "", synonyms: "", antonyms: "",
  fieldToggles: { type: true, greek: true, emojis: true, collocation: true, derivatives: false, synonyms: false, antonyms: false }, ...extra,
});
const formFor = (words, extra = {}) => ({
  bookTitle: "Cambridge Primary Paths 2", unit: "4", pageRange: "", classProfile: "B_SENIOR", inputMode: "structured",
  vocabRows: words.map((w) => row(w)), freeform: "", teacherHints: [], ...extra,
});
const vocabOf = (words) => words.map((english, i) => ({ number: i + 1, english, type: "n.", greek: "x", emojis: "", collocation: "", derivatives: [], synonyms: [], antonyms: [] }));

/** A worksheet that covers every word once: a D04 per word in dictation, one L01 in Lingo. */
function sheetFor(words, { d15 = null } = {}) {
  const items = words.map((w, i) => ({ number: i + 1, prompt: `I can see the ________ here.`, answer: w, testsWords: [w] }));
  const exercises = [{ number: 1, typeId: "D04", instruction: "", wordBank: [], items: items.slice(0, 5) }];
  if (items.length > 5) exercises.push({ number: 2, typeId: "D04", instruction: "", wordBank: [], items: items.slice(5).map((it, i) => ({ ...it, number: i + 1 })) });
  if (d15) exercises.push({ number: exercises.length + 1, typeId: "D15", instruction: "", wordBank: [], items: d15 });
  return {
    meta: { classProfile: "B_SENIOR", bookTitle: "Cambridge Primary Paths 2", unit: 4 },
    lingoLauncher: {
      vocabulary: vocabOf(words),
      practice: [{ number: 1, typeId: "L01", instruction: "", wordList: [words[1], words[0]], items: [
        { number: 1, prompt: "We walk to the ________ every day.", answer: words[0] },
        { number: 2, prompt: "My friend has a big ________ at home.", answer: words[1] },
      ] }],
    },
    dictation: { exercises },
  };
}

function mockAi(t, reply) {
  const calls = [];
  configureAi({ provider: "chatgpt", chatgpt: async (req) => { calls.push(req); return JSON.parse(JSON.stringify(reply(req, calls.length))); } });
  t.after(() => configureAi({ provider: "deepseek" }));
  return calls;
}

/* ── A1: no leaks from an earlier word list ─────────────────────── */

test("the vocabulary table is rebuilt from the teacher's rows: stray and missing words never survive", () => {
  const form = formFor(["volcano", "lava", "crust"]);
  // The AI kept a word from an earlier list ("uncle") and dropped "crust".
  const data = { meta: {}, lingoLauncher: { vocabulary: vocabOf(["uncle", "lava", "volcano"]), practice: [] }, dictation: { exercises: [] } };
  enforceTeacherVocabulary(data, form);
  assert.deepEqual(data.lingoLauncher.vocabulary.map((v) => v.english), ["volcano", "lava", "crust"]);
  assert.deepEqual(data.lingoLauncher.vocabulary.map((v) => v.number), [1, 2, 3]);
  assert.ok(data.meta.wordsKey.includes("crust") && !data.meta.wordsKey.includes("uncle"));
});

test("worksheetMatchesForm compares word lists, ignoring order and case", () => {
  const data = sheetFor(["volcano", "lava", "crust"]);
  assert.equal(worksheetMatchesForm(data, formFor(["Crust", "volcano", "lava"])), true);
  assert.equal(worksheetMatchesForm(data, formFor(["family", "uncle", "aunt"])), false);
  assert.equal(worksheetMatchesForm(data, formFor(["volcano", "lava"])), false);
});

test("rewriting only the Dictation after the word list changed writes everything fresh — old words never reach the AI", async (t) => {
  const oldWords = ["nephew", "uncle", "aunt", "cousin", "grandpa", "toddler"];
  const newWords = ["volcano", "lava", "crust", "plate", "earthquake", "melt"];
  const old = sheetFor(oldWords);
  const calls = mockAi(t, () => sheetFor(newWords));
  for (const fn of [regenerateDictationOnly, regenerateLingoPracticeOnly]) {
    calls.length = 0;
    const result = await fn(formFor(newWords), "key", old, {});
    assert.equal(result.fullRegenerate, true);
    for (const c of calls) {
      for (const w of oldWords) assert.ok(!new RegExp(`\\b${w}\\b`, "i").test(c.userPrompt), `${fn.name}: "${w}" leaked into the prompt`);
    }
    assert.deepEqual(result.data.lingoLauncher.vocabulary.map((v) => v.english), newWords);
    assert.ok(!JSON.stringify(result.data.dictation).includes("uncle"));
  }
});

test("rewriting only the Dictation with the same words keeps the partial rewrite", async (t) => {
  const words = ["volcano", "lava", "crust", "plate", "earthquake", "melt"];
  mockAi(t, () => sheetFor(words));
  const result = await regenerateDictationOnly(formFor(words), "key", sheetFor(words), {});
  assert.equal(result.fullRegenerate, undefined);
});

test("the prompt names only the current words as allowed answers, with the inflection rule", () => {
  const form = formFor(["volcano", "lava"]);
  const plan = { dictationExerciseCount: 1, dictationTypes: ["D15"], lingoTypes: ["L11"], lingoPracticeCount: 1, signature: "" };
  const prompt = buildUserPrompt(form, plan, []);
  assert.match(prompt, /WORD SCOPE/);
  assert.match(prompt, /\["volcano","lava"\]/);
  assert.match(prompt, /INFLECTION/);
  assert.match(prompt, /Dictation exercise 1 \(D15\): answers in this order → [TF](, [TF])+/);
  assert.match(prompt, /Lingo exercise 1 \(L11\): answers in this order → (Yes|No)/);
});

test("answers must be this unit's words, in any inflected form", () => {
  const terms = allowedTerms([{ english: "uncle" }, { english: "compete", derivatives: [{ text: "competition" }] }, { english: "run" }, { english: "flow down" }, { english: "family" }]);
  for (const ok of ["uncles", "uncle", "competed", "competition", "ran", "running", "flows down", "families", "an uncle"]) {
    assert.ok(answerInScope(ok, terms), `${ok} should be in scope`);
  }
  for (const bad of ["aunt", "volcano", "grandma"]) assert.ok(!answerInScope(bad, terms), `${bad} should be out of scope`);
  assert.ok(containsForm("They picked it up", "pick up"));
  const data = sheetFor(["volcano", "lava", "crust"]);
  data.dictation.exercises[0].items[1].answer = "uncle"; // left over from Unit 1
  const out = findOutsideAnswers(data);
  assert.equal(out.length, 1);
  assert.equal(out[0].answer, "uncle");
  assert.ok(validateAnswerKeys(data).some((i) => /answer "uncle" is not a word from this unit's list/.test(i)));
});

/* ── A2: balanced answer keys ───────────────────────────────────── */

test("balanced patterns are never all one answer and never three in a row", () => {
  for (let n = 3; n <= 10; n++) {
    for (let k = 0; k < 50; k++) {
      const p = balancedPattern(["T", "F"], n);
      assert.equal(p.length, n);
      assert.ok(Math.abs(p.filter((x) => x === "T").length - p.filter((x) => x === "F").length) <= 1);
      assert.ok(!/(T,T,T|F,F,F)/.test(p.join(",")), p.join(","));
    }
  }
  const pos = balancedPositions(6, 3);
  for (const k of [1, 2, 3]) assert.equal(pos.filter((p) => p === k).length, 2);
});

test("an all-True T/F exercise is flagged item by item, so the line fixer can make some False", () => {
  const allTrue = [1, 2, 3, 4, 5].map((n) => ({ number: n, prompt: `( ) Lava is very hot ${n}.`, answer: "T", testsWords: ["lava"] }));
  const report = binaryBalance("D15", allTrue);
  assert.equal(report.ok, false);
  assert.equal(report.flip.length, 2);
  assert.equal(report.flipTo, "F");
  const issues = validateWorksheet(sheetFor(["volcano", "lava", "crust"], { d15: allTrue })).issues;
  const balance = issues.filter((i) => /the key needs a mix of T and F/.test(i));
  assert.equal(balance.length, 2);
  assert.match(balance[0], /^Dictation ex 2 \(D15\) item \d: rewrite this statement so the answer is "F"/);
  // A good mix passes.
  const mixed = allTrue.map((it, i) => ({ ...it, answer: i % 2 ? "F" : "T" }));
  assert.equal(binaryBalance("D15", mixed).ok, true);
  assert.equal(validateAnswerKeys(sheetFor(["volcano", "lava", "crust"], { d15: mixed })).length, 0);
});

test("all-Yes Yes/No questions are flagged too", () => {
  const items = [1, 2, 3, 4].map((n) => ({ number: n, prompt: "Is lava hot?", answer: "Yes" }));
  const data = sheetFor(["volcano", "lava"]);
  data.lingoLauncher.practice.push({ number: 2, typeId: "L11", wordList: [], items });
  assert.ok(validateAnswerKeys(data).some((i) => /^Lingo ex 2 \(L11\) item \d: rewrite this question so the answer is "No"/.test(i)));
});

test("A/B items are mixed locally by swapping the two sentences (no AI needed)", () => {
  const items = [1, 2, 3, 4, 5].map((n) => ({ number: n, prompt: `A. Right sentence ${n}.  B. Wrong sentence ${n}.`, answer: "A" }));
  const data = sheetFor(["volcano", "lava"]);
  data.lingoLauncher.practice.push({ number: 2, typeId: "L13", wordList: [], items });
  normalizeWorksheetExercises(data);
  const fixed = data.lingoLauncher.practice[1].items;
  assert.equal(binaryBalance("L13", fixed).ok, true);
  for (const it of fixed) {
    const right = it.answer === "A" ? it.prompt.match(/A\. (.*?)\s+B\./)[1] : it.prompt.match(/B\. (.*)$/)[1];
    assert.match(right, /^Right sentence/);
  }
  assert.equal(repairABItems(fixed), 0, "already balanced: nothing changes");
});

test("bracket choices never keep the answer in one place — and never 'always second' after a fix", () => {
  const mk = () => [1, 2, 3, 4, 5, 6].map((n) => ({ number: n, prompt: `The ________ is hot. (lava / snow / ice)`, answer: "lava" }));
  const items = mk();
  assert.equal(choicesPredictable(items), true);
  rebalanceChoiceItems(items);
  const pos = items.map((it) => choicePosition(it.prompt, it.answer).pos);
  assert.equal(choicesPredictable(items), false);
  assert.equal(new Set(pos).size, 3, `positions ${pos}`);
  for (const it of items) assert.match(it.prompt, /\((lava|snow|ice) \/ (lava|snow|ice) \/ (lava|snow|ice)\)/);
  const before = items.map((i) => i.prompt).join("|");
  rebalanceChoiceItems(items);
  assert.equal(items.map((i) => i.prompt).join("|"), before, "idempotent");

  // Two-option choices (L02) used to be shuffled so the answer was never first, i.e. always second.
  const data = sheetFor(["volcano", "lava"]);
  data.lingoLauncher.practice.push({ number: 2, typeId: "L02", wordList: [], items: [1, 2, 3, 4].map((n) => ({ number: n, prompt: `It is (lava / snow) ${n}.`, answer: "lava" })) });
  const quick = applyQuickWorksheetFixes(data);
  const p2 = quick.lingoLauncher.practice[1].items.map((it) => choicePosition(it.prompt, it.answer).pos);
  assert.deepEqual([...new Set(p2)].sort(), [0, 1], `positions ${p2}`);
});

test("generation repairs a lopsided T/F key with one small line fix, not a whole new worksheet", async (t) => {
  const words = ["volcano", "lava", "crust"];
  const allTrue = [1, 2, 3, 4, 5].map((n) => ({ number: n, prompt: `( ) Statement ${n} about lava.`, answer: "T", testsWords: ["lava"] }));
  let fixerCalls = 0;
  const calls = mockAi(t, (req) => {
    if (/ESL worksheet editor/.test(req.systemPrompt)) {
      fixerCalls++;
      const asked = JSON.parse(req.userPrompt.split("Items to fix:\n")[1]);
      return { fixes: asked.map((a) => ({ sheet: a.sheet, exercise: a.exercise, item: a.item, prompt: "( ) Lava is cold.", answer: "F" })) };
    }
    return sheetFor(words, { d15: allTrue });
  });
  const plan = { dictationExerciseCount: 2, dictationTypes: ["D04", "D15"], lingoTypes: ["L01"], lingoPracticeCount: 1, signature: "x", exerciseMode: "custom" };
  const { data } = await generateWorksheets(formFor(words), "key", { plan });
  const d15 = data.dictation.exercises.find((ex) => ex.typeId === "D15");
  assert.equal(binaryBalance("D15", d15.items).ok, true);
  assert.equal(fixerCalls, 1);
  assert.equal(calls.filter((c) => !/ESL worksheet editor/.test(c.systemPrompt)).length, 1, "no second full generation");
});
