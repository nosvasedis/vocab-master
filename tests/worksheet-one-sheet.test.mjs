/* Worksheets: a unit can be only a Lingo Launcher, only a Dictation, or both. Lingo's mix can leave a sheet out, the
 * AI is told which sheet to write, the Dictation's coverage rule only applies when there is a Dictation, and the
 * papers (switch, answer key, projector) are the sheets the unit has. */
import test from "node:test";
import assert from "node:assert/strict";
import { configureAi, generateWorksheets, pickGenerationPlan, validateWorksheet, renderAnswerKey } from "../desktop/renderer/app.js";
import { withEntries, wsSheetsOf, planSheets } from "../desktop/renderer/studio/worksheet-tasks.js";
import { projectorSheets } from "../desktop/renderer/studio/projector-model.js";

const WORDS = ["volcano", "lava", "crust", "plate"];
const row = (english) => ({
  english, type: "n.", greek: "x", emojis: "", collocation: "", derivatives: "", synonyms: "", antonyms: "",
  fieldToggles: { type: true, greek: true, emojis: true, collocation: true, derivatives: false, synonyms: false, antonyms: false },
});
const form = { bookTitle: "Cambridge Primary Paths 2", unit: "4", pageRange: "", classProfile: "B_SENIOR", inputMode: "structured", vocabRows: WORDS.map(row), freeform: "", teacherHints: [] };
const vocab = WORDS.map((english, i) => ({ number: i + 1, english, type: "n.", greek: "x", emojis: "", collocation: "", derivatives: [], synonyms: [], antonyms: [] }));
const gaps = (words) => words.map((w, i) => ({ number: i + 1, prompt: `We saw the ________ on our trip number ${i + 1}.`, answer: w, testsWords: [w] }));

function mockAi(t, reply) {
  const calls = [];
  configureAi({ provider: "chatgpt", chatgpt: async (req) => { calls.push(req); return JSON.parse(JSON.stringify(reply(req))); } });
  t.after(() => configureAi({ provider: "deepseek" }));
  return calls;
}

test("Lingo's mix can leave out the Dictation or the Lingo practice", () => {
  const noDict = pickGenerationPlan("B_SENIOR", { dictationCount: 0, lingoCount: 2 });
  assert.deepEqual(noDict.dictationTypes, []);
  assert.equal(noDict.dictationExerciseCount, 0);
  assert.equal(noDict.lingoTypes.length, 2);
  assert.deepEqual(planSheets(noDict), ["lingo"]);

  const noLingo = pickGenerationPlan("B_SENIOR", { dictationCount: 3, lingoCount: 0 });
  assert.equal(noLingo.dictationTypes.length, 3);
  assert.deepEqual(noLingo.lingoTypes, []);
  assert.deepEqual(planSheets(noLingo), ["dictation"]);

  const usual = pickGenerationPlan("B_SENIOR", {});
  assert.ok(usual.dictationTypes.length >= 3, "no count still means Lingo picks 3–5");
});

test("only a Lingo Launcher: the AI is told there is no Dictation, and no word has to be on one", async (t) => {
  const plan = withEntries(withEntries({}, "dictation", []), "lingo", [{ type: "L01" }]);
  const calls = mockAi(t, () => ({
    lingoLauncher: { vocabulary: vocab, practice: [{ number: 1, typeId: "L01", instruction: "", wordList: ["lava", "volcano"], items: [
      { number: 1, prompt: "The hot ________ ran down the hill.", answer: "lava" },
      { number: 2, prompt: "We climbed the old ________ on holiday.", answer: "volcano" }] }] },
    dictation: { exercises: [] },
  }));
  const { data, validation } = await generateWorksheets(form, "key", { plan });
  assert.equal(calls.length, 1, "one call: an empty Dictation is not a reason to write it again");
  assert.match(calls[0].systemPrompt, /Dictation exercises: NONE/);
  assert.doesNotMatch(calls[0].userPrompt, /DICTATION COVERAGE DISTRIBUTION/);
  assert.match(calls[0].userPrompt, /ONLY the Lingo Launcher/);
  assert.ok(!validation.issues.some((i) => /Dictation — not tested/.test(i)), validation.issues.join("\n"));
  assert.equal(validation.planMismatch, false);
  assert.deepEqual(wsSheetsOf(data), ["lingo"]);
  assert.equal(data.lingoLauncher.vocabulary.length, WORDS.length, "the word table is still there");
});

test("only a Dictation: the AI is told there is no Lingo practice; the Dictation still covers every word", async (t) => {
  const plan = withEntries(withEntries({}, "dictation", [{ type: "D04" }]), "lingo", []);
  const calls = mockAi(t, () => ({
    lingoLauncher: { vocabulary: vocab, practice: [] },
    dictation: { exercises: [{ number: 1, typeId: "D04", instruction: "", wordBank: [], items: gaps(WORDS) }] },
  }));
  const { data, validation } = await generateWorksheets(form, "key", { plan });
  assert.match(calls[0].systemPrompt, /Lingo practice: NONE/);
  assert.match(calls[0].userPrompt, /ONLY the Dictation sheet/);
  assert.doesNotMatch(calls[0].userPrompt, /WORKSHEET UNIQUENESS/, "nothing to keep apart from");
  assert.equal(validation.planMismatch, false);
  assert.deepEqual(wsSheetsOf(data), ["dictation"]);

  // A Dictation that misses words is still told so.
  const short = JSON.parse(JSON.stringify(data));
  short.dictation.exercises[0].items = gaps(WORDS.slice(0, 2));
  assert.ok(validateWorksheet(short).issues.some((i) => /Dictation — not tested at least once: crust, plate/.test(i)));
});

test("the answer key and the projector show only the unit's sheets", () => {
  const lingoOnly = {
    meta: { classProfile: "B_SENIOR" },
    lingoLauncher: { vocabulary: vocab, practice: [{ number: 1, typeId: "L01", wordList: ["lava"], items: [{ number: 1, prompt: "Hot ________.", answer: "lava" }] }] },
    dictation: { exercises: [] },
  };
  const dictOnly = {
    meta: { classProfile: "B_SENIOR" },
    lingoLauncher: { vocabulary: vocab, practice: [] },
    dictation: { exercises: [{ number: 1, typeId: "D04", wordBank: [], items: gaps(WORDS) }] },
  };
  assert.doesNotMatch(renderAnswerKey(lingoOnly), /Dictation · Exercise/);
  assert.match(renderAnswerKey(lingoOnly), /Lingo · Exercise 1/);
  assert.doesNotMatch(renderAnswerKey(dictOnly), /Lingo · Exercise/);
  assert.deepEqual(projectorSheets("unit", lingoOnly).map((s) => s.id), ["lingo", "answer"]);
  assert.deepEqual(projectorSheets("unit", dictOnly).map((s) => s.id), ["dictation", "answer"]);
  assert.deepEqual(wsSheetsOf({ ...dictOnly, lingoLauncher: lingoOnly.lingoLauncher }), ["lingo", "dictation"], "older units have both");
});
