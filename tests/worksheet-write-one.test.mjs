/* Worksheets: Step 3's "Write this exercise" — Lingo writes just the exercises that changed (or were added) and puts
 * them in their places on the written worksheet; everything else stays exactly as it is. Also: line length is measured
 * per sentence, so a riddle's short clues are not "too long to dictate". */
import test from "node:test";
import assert from "node:assert/strict";
import { configureAi, writeWorksheetExercises, exerciseStatus, validateWorksheet, normalizeWorksheetExercises } from "../desktop/renderer/app.js";

const WORDS = ["volcano", "lava", "crust", "plate", "earthquake", "melt"];
const row = (english) => ({
  english, type: "n.", greek: "x", emojis: "", collocation: "", derivatives: "", synonyms: "", antonyms: "",
  fieldToggles: { type: true, greek: true, emojis: true, collocation: true, derivatives: false, synonyms: false, antonyms: false },
});
const form = (words = WORDS) => ({ bookTitle: "Cambridge Primary Paths 2", unit: "4", pageRange: "", classProfile: "B_SENIOR", inputMode: "structured", vocabRows: words.map(row), freeform: "", teacherHints: [] });
const vocab = WORDS.map((english, i) => ({ number: i + 1, english, type: "n.", greek: "x", emojis: "", collocation: "", derivatives: [], synonyms: [], antonyms: [] }));
const gap = (w, n) => ({ number: n, prompt: `We read about the ________ in class ${n}.`, answer: w, testsWords: [w] });

/** Dictation: D04 on the first five words, D04 on "melt"; Lingo: one L01. */
function sheet() {
  return {
    meta: { classProfile: "B_SENIOR", bookTitle: "Cambridge Primary Paths 2", unit: 4 },
    generationPlan: { dictationTypes: ["D04", "D04"], dictationExerciseCount: 2, lingoTypes: ["L01"], lingoPracticeCount: 1, exerciseMode: "custom" },
    lingoLauncher: { vocabulary: vocab, practice: [{ number: 1, typeId: "L01", instruction: "", wordList: ["lava", "volcano"], items: [
      { number: 1, prompt: "The hot ________ ran down the hill.", answer: "lava" }, { number: 2, prompt: "We climbed the old ________ on holiday.", answer: "volcano" }] }] },
    dictation: { exercises: [
      { number: 1, typeId: "D04", instruction: "", wordBank: [], items: WORDS.slice(0, 5).map((w, i) => gap(w, i + 1)) },
      { number: 2, typeId: "D04", instruction: "", wordBank: [], items: [{ number: 1, prompt: "Ice can ________ in the sun.", answer: "melt", testsWords: ["melt"] }] },
    ] },
  };
}
const plan = (dictationTypes, settings) => ({ dictationTypes, dictationExerciseCount: dictationTypes.length, lingoTypes: ["L01"], lingoPracticeCount: 1, exerciseMode: "custom", ...(settings ? { settings } : {}) });
const tf = (n, start = 0) => Array.from({ length: n }, (_, i) => ({ number: i + 1, prompt: `( ) Fact ${i + 1}: a ${WORDS[(start + i) % 6]} is in the unit.`, answer: (i + start) % 2 ? "F" : "T", testsWords: [WORDS[(start + i) % 6]] }));

function mockAi(t, reply) {
  const calls = [];
  configureAi({ provider: "chatgpt", chatgpt: async (req) => { calls.push(req); return JSON.parse(JSON.stringify(reply(req, calls.length))); } });
  t.after(() => configureAi({ provider: "deepseek" }));
  return calls;
}

test("Step 3 knows which exercises changed since the sheets were written", () => {
  const data = sheet();
  assert.deepEqual(exerciseStatus(data, plan(["D04", "D04"]), "dictation"), ["", ""], "as written");
  assert.deepEqual(exerciseStatus(data, plan(["D04", "D15", "D12"]), "dictation"), ["", "changed", "new"]);
  assert.deepEqual(exerciseStatus(data, plan(["D04", "D04"], { dictation: [{ items: 7 }] }), "dictation"), ["settings", ""], "lines changed");
  assert.deepEqual(exerciseStatus(data, plan(["D04", "D04"], { dictation: [{ note: "about a trip" }, {}] }), "dictation"), ["settings", ""], "a wish");
  assert.deepEqual(exerciseStatus(data, plan(["D04", "D04"], { dictation: [{ hint: "first" }] }), "dictation"), ["", ""], "letter help changes the sheet at once — nothing to write");
  assert.deepEqual(exerciseStatus(null, plan(["D04"]), "dictation"), [""], "nothing written yet");
});

test("writing one changed exercise replaces just it; the rest of the worksheet, the other sheet and the table stay", async (t) => {
  // The app's worksheet is always normalized; the new exercise must leave everything else exactly so.
  const data = normalizeWorksheetExercises(sheet());
  const calls = mockAi(t, (req) => (/ONE PART OF A WRITTEN WORKSHEET/.test(req.userPrompt)
    ? { dictation: { exercises: [{ number: 1, typeId: "D15", items: tf(4) }] }, lingoLauncher: { vocabulary: [], practice: [] } }
    : {}));
  const res = await writeWorksheetExercises(form(), "key", data, { plan: plan(["D04", "D15"]), sheet: "dictation", indices: [1] });
  const ex = res.data.dictation.exercises;
  assert.deepEqual(ex.map((e) => [e.number, e.typeId]), [[1, "D04"], [2, "D15"]]);
  assert.deepEqual(ex[0].items, data.dictation.exercises[0].items, "exercise 1 untouched");
  assert.equal(ex[1].items.length, 4);
  assert.deepEqual(res.data.lingoLauncher.practice, data.lingoLauncher.practice, "the Lingo sheet untouched");
  assert.deepEqual(res.data.lingoLauncher.vocabulary.map((v) => v.english), WORDS, "the word table untouched");
  assert.deepEqual(res.data.generationPlan.dictationTypes, ["D04", "D15"]);
  assert.deepEqual(res.numbers, [2]);
  assert.deepEqual(data.dictation.exercises[1].typeId, "D04", "the old worksheet object is not changed (Undo)");
  const p = calls[0].userPrompt;
  assert.match(p, /ONE PART OF A WRITTEN WORKSHEET/);
  assert.match(p, /does NOT test these words yet[^\n]*melt/, "the word only the old exercise tested comes first");
  assert.match(p, /never reuse or reword these old ones[^\n]*Ice can/, "the old lines, to write new ones");
  assert.match(p, /never repeat or copy them[^\n]*The hot ________ ran/, "the other lines on the worksheet");
  assert.doesNotMatch(p, /DICTATION COVERAGE DISTRIBUTION/, "no whole-sheet coverage split for one exercise");
  assert.match(calls[0].systemPrompt, /ONE PART OF A WRITTEN WORKSHEET: write ONLY/);
  assert.deepEqual(exerciseStatus(res.data, plan(["D04", "D15"]), "dictation"), ["", ""], "nothing left to write");
});

test("a new exercise is added at its place; writing a later new one writes the ones before it too, in order", async (t) => {
  const calls = mockAi(t, (req) => {
    if (!/ONE PART/.test(req.userPrompt)) return {};
    const two = /these 2 exercises/.test(req.userPrompt);
    return { dictation: { exercises: two ? [{ typeId: "D15", items: tf(4) }, { typeId: "D15", items: tf(4, 1) }] : [{ typeId: "D15", items: tf(4) }] } };
  });
  const res = await writeWorksheetExercises(form(), "key", sheet(), { plan: plan(["D04", "D04", "D15", "D15"]), sheet: "dictation", indices: [3] });
  assert.deepEqual(res.data.dictation.exercises.map((e) => [e.number, e.typeId]), [[1, "D04"], [2, "D04"], [3, "D15"], [4, "D15"]]);
  assert.deepEqual(res.written, [2, 3]);
  assert.match(calls[0].userPrompt, /these 2 exercises, in this order/);
  assert.match(calls[0].userPrompt, /becomes Dictation exercise 3 on the sheet[\s\S]*becomes Dictation exercise 4/);
});

test("too few exercises back: one more try; the word list changed: no partial rewrite", async (t) => {
  const calls = mockAi(t, (req, n) => (n === 1 ? { dictation: { exercises: [] } } : { dictation: { exercises: [{ typeId: "D15", items: tf(4) }] } }));
  const res = await writeWorksheetExercises(form(), "key", sheet(), { plan: plan(["D04", "D15"]), sheet: "dictation", indices: [1] });
  assert.equal(res.data.dictation.exercises[1].typeId, "D15");
  assert.match(calls[1].userPrompt + (calls[1].retryHint || "") + JSON.stringify(calls[1]), /EXACTLY 1 exercise/);
  await assert.rejects(
    writeWorksheetExercises(form(["family", "uncle", "aunt"]), "key", sheet(), { plan: plan(["D04", "D15"]), sheet: "dictation", indices: [1] }),
    /word list changed/,
  );
});

test("a riddle's short clue sentences are not 'too long to dictate'; one long sentence still is", () => {
  const data = sheet();
  data.meta.classProfile = "A_SENIOR";
  data.dictation.exercises.push({ number: 3, typeId: "D12", instruction: "", wordBank: [], items: [
    { number: 1, prompt: "I am very hot. I come out of a mountain. What am I? (crust / lava / plate)", answer: "lava" },
    { number: 2, prompt: "I am the very hot red rock that comes out of the top of a mountain when it erupts. What am I? (crust / lava / plate)", answer: "lava" },
  ] });
  const long = validateWorksheet(data).issues.filter((i) => /ex 3 \(D12\) item \d+: sentence is/.test(i));
  assert.deepEqual(long.map((i) => i.match(/item (\d+)/)[1]), ["2"]);
});
