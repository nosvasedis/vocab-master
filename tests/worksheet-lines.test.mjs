/* Worksheets: every line is the kind of question its task line asks (studio/ws-checks.js) — Opposite match and Synonym
 * select keep only "WORD (a / b / c)" lines with a listed opposite / synonym, other exercises are checked line by line,
 * and the task lines and keys say what the paper shows. */
import test from "node:test";
import assert from "node:assert/strict";
import { repairRelationExercise, readRelationItem, lineProblem, repairLine, relationTargets } from "../desktop/renderer/studio/ws-checks.js";
import { normalizeWorksheetExercises, validateWorksheet, getStudentExerciseInstruction, renderAnswerKey } from "../desktop/renderer/app.js";

const VOCAB = [
  { english: "vacation", type: "n", synonyms: ["holiday"] },
  { english: "worried", type: "adj", synonyms: ["anxious"], antonyms: [{ text: "calm", greek: "ήρεμος" }] },
  { english: "finger", type: "n", synonyms: ["digit"] },
  { english: "slowly", type: "adv", antonyms: [{ text: "quickly", greek: "γρήγορα" }] },
  { english: "soft", type: "adj", antonyms: [{ text: "hard", greek: "σκληρός" }], synonyms: ["fluffy"] },
  { english: "noisy", type: "adj", antonyms: [{ text: "quiet", greek: "ήσυχος" }] },
  { english: "happy", type: "adj", antonyms: [{ text: "sad", greek: "λυπημένος" }], synonyms: ["glad"] },
  { english: "tired", type: "adj" },
  { english: "arm", type: "n" },
];

// The exercise from the teacher's screenshot: half its lines were not opposites at all.
const screenshot = () => ({ number: 4, typeId: "D05", instruction: "", wordBank: [], items: [
  { number: 1, prompt: "Vacation can also mean (holiday / weekend)", answer: "holiday" },
  { number: 2, prompt: "A different word for worried is (happy / anxious)", answer: "anxious" },
  { number: 3, prompt: "A different word for finger is (digit / arm)", answer: "digit" },
  { number: 4, prompt: "She feels worried, but she stays (calm / noisy)", answer: "calm" },
  { number: 5, prompt: "The opposite of slowly is (quietly / quickly)", answer: "quickly" },
  { number: 6, prompt: "The opposite of soft is (hard / fluffy)", answer: "hard" },
] });

/** Every line: a unit word with opposites, alone, three options, exactly one listed opposite, the key that one. */
function assertRealOpposites(ex, vocab = VOCAB, kind = "antonyms") {
  const targets = relationTargets(vocab, kind);
  const seen = new Set();
  for (const item of ex.items) {
    const m = item.prompt.match(/^([a-z ]+) \(([^()]+)\)$/i);
    assert.ok(m, `"${item.prompt}" is "WORD (a / b / c)"`);
    const t = targets.find((x) => x.english === m[1]);
    assert.ok(t, `"${m[1]}" has listed ${kind}`);
    assert.ok(!seen.has(t.english), `"${t.english}" is asked once`);
    seen.add(t.english);
    const options = m[2].split(" / ");
    assert.ok(options.length >= 2 && options.length <= 3, item.prompt);
    const right = options.filter((o) => t.answers.includes(o));
    assert.deepEqual(right, [item.answer], `one right option in "${item.prompt}"`);
    assert.ok(!options.includes(t.english), "the word is never its own option");
  }
}

test("Opposite match: lines of another kind are rewritten or rebuilt — never left under the opposite task line", () => {
  const ex = screenshot();
  repairRelationExercise(ex, VOCAB);
  assertRealOpposites(ex);
  assert.deepEqual(ex.items.map((i) => i.number), ex.items.map((_, k) => k + 1), "numbered again");
  // The sentence lines that did hold a listed opposite keep the AI's options.
  const worried = ex.items.find((i) => i.prompt.startsWith("worried "));
  assert.equal(worried.answer, "calm");
  assert.match(worried.prompt, /noisy/);
  assert.ok(ex.items.some((i) => i.prompt.startsWith("slowly ") && /quietly/.test(i.prompt)));
  // Five words have opposites, so there are five lines, each word once.
  assert.equal(ex.items.length, 5);
});

test("Opposite match with fewer words than lines gets fewer lines, and validation says why as a note", () => {
  const vocab = VOCAB.filter((v) => ["worried", "slowly", "vacation", "finger", "arm", "tired"].includes(v.english));
  const data = { meta: { classProfile: "C_SENIOR" }, generationPlan: { dictationTypes: ["D05"], dictationExerciseCount: 1, lingoTypes: [], lingoPracticeCount: 0 },
    lingoLauncher: { vocabulary: vocab, practice: [] }, dictation: { exercises: [screenshot()] } };
  normalizeWorksheetExercises(data);
  const ex = data.dictation.exercises[0];
  assert.equal(ex.items.length, 2);
  assertRealOpposites(ex, vocab);
  const v = validateWorksheet(data);
  assert.ok(!v.issues.some((i) => /ex 1 \(D05\)/.test(i)), v.issues.join("\n"));
  assert.ok(v.notes.some((n) => /only 2 words in your list have opposites/.test(n)), v.notes.join("\n"));
});

test("Synonym select keeps only listed synonyms; an opposite is a fair wrong option, a second synonym is not", () => {
  const ex = { number: 1, typeId: "D06", items: [
    { number: 1, prompt: "happy (glad / sad / tired)", answer: "glad" },
    { number: 2, prompt: "The opposite of soft is (hard / fluffy)", answer: "hard" },
    { number: 3, prompt: "finger (digit / arm / hand)", answer: "arm" },
    { number: 4, prompt: "nothing useful", answer: "x" },
  ] };
  repairRelationExercise(ex, VOCAB);
  assertRealOpposites(ex, VOCAB, "synonyms");
  assert.equal(ex.items[0].prompt, "happy (glad / sad / tired)", "a good line is kept exactly");
  assert.equal(ex.items.find((i) => i.prompt.startsWith("finger")).answer, "digit", "a wrong key is never kept");
  assert.equal(readRelationItem({ prompt: "worried (anxious / calm / tired)", answer: "anxious" }, "synonyms", VOCAB).answer, "anxious");
  // calm (worried's opposite) has the synonym relaxed: relaxed is right too, so the line is unfair and is not kept.
  const withCalm = [...VOCAB, { english: "calm", type: "adj", synonyms: ["relaxed"] }];
  assert.equal(readRelationItem({ prompt: "worried (calm / relaxed / tired)", answer: "calm" }, "antonyms", withCalm), null, "two right options");
  assert.equal(readRelationItem({ prompt: "worried (calm / anxious / tired)", answer: "calm" }, "antonyms", withCalm).answer, "calm", "a synonym is a fair wrong option for an opposite");
});

test("a line the teacher wrote is checked, never rebuilt; Lingo's opposites are repaired too", () => {
  const ex = screenshot();
  ex.items[0].byTeacher = true;
  repairRelationExercise(ex, VOCAB);
  assert.equal(ex.items[0].prompt, "Vacation can also mean (holiday / weekend)");
  assert.match(lineProblem("D05", ex.items[0], VOCAB), /one unit word and its options/);
  const l04 = { number: 1, typeId: "L04", wordList: ["calm"], items: [{ number: 1, prompt: "The opposite of noisy is (quiet / loud)", answer: "quiet" }] };
  repairRelationExercise(l04, VOCAB);
  assert.deepEqual(l04.wordList, []);
  assert.match(l04.items[0].prompt, /^noisy \(.*quiet.*\)$/);
});

test("other exercises: a choice's key is one of its options, steps and jumbled words add up, classes match the list", () => {
  assert.match(lineProblem("D03", { prompt: "She ________ the race. (won / lost)", answer: "came" }, VOCAB), /not one of the options/);
  assert.equal(lineProblem("D03", { prompt: "She ________ the race. (won / lost)", answer: "won" }, VOCAB), "");
  assert.match(lineProblem("D12", { prompt: "I keep you dry. (hat / umbrella / umbrella)", answer: "umbrella" }, VOCAB), /same word/);
  assert.match(lineProblem("D11", { prompt: "run, jump, swim, apple", answer: "pear" }, VOCAB), /not one of the 4 words/);
  assert.equal(lineProblem("D21", { prompt: "a) Eat breakfast. / b) Wake up. / c) Go to school.", answer: "b, a, c" }, VOCAB), "");
  assert.match(lineProblem("D21", { prompt: "a) Eat breakfast. / b) Wake up. / c) Go to school.", answer: "b, a" }, VOCAB), /order of all 3 steps/);
  assert.match(lineProblem("D21", { prompt: "a) Wake up. / b) Eat. / c) Go.", answer: "a, b, c" }, VOCAB), /already in the right order/);
  assert.equal(lineProblem("L08", { prompt: "around / ran / track / the / they", answer: "They ran around the track." }, VOCAB), "");
  assert.match(lineProblem("L08", { prompt: "around / ran / track / they", answer: "They ran around the track." }, VOCAB), /not exactly the words/);
  assert.match(lineProblem("L06", { prompt: "tired", answer: "noun" }, VOCAB), /adjective in the word list/);
  assert.match(lineProblem("L06", { prompt: "under", answer: "preposition" }, VOCAB), /word class in full/);
  assert.match(lineProblem("D17", { prompt: "pour the milk", answer: "milk" }, VOCAB), /gap/);
  assert.match(lineProblem("D04", { prompt: "", answer: "x" }, VOCAB), /empty/);
  assert.match(lineProblem("D19", { prompt: "A place to sleep: ________", answer: "" }, VOCAB), /no answer/);
  const fam = [{ english: "compete", type: "v", derivatives: [{ text: "competition", type: "n" }] }];
  assert.equal(lineProblem("L07", { prompt: "compete (v.) → ________ (n.)", answer: "competitions" }, fam), "");
  assert.match(lineProblem("L07", { prompt: "compete (v.) → ________ (n.)", answer: "competer" }, fam), /not a word or word-family form/);
});

test("a crossword clue counts the answer's letters", () => {
  const item = { prompt: "A path where athletes run races (6 letters)", answer: "track" };
  assert.equal(repairLine("D22", item), true);
  assert.equal(item.prompt, "A path where athletes run races (5 letters)");
  assert.equal(repairLine("D22", { ...item, byTeacher: true, prompt: "x (9 letters)" }), false);
});

test("task lines and keys say what the paper shows", () => {
  const l06 = { typeId: "L06", items: [{ number: 1, prompt: "slowly", answer: "adverb" }, { number: 2, prompt: "soft", answer: "adjective" }] };
  assert.equal(getStudentExerciseInstruction(l06), "Is it a noun, a verb, an adjective or an adverb? Choose a, b, c or d.");
  assert.equal(getStudentExerciseInstruction({ typeId: "L06", items: [{ number: 1, prompt: "soft", answer: "adjective" }] }), "Is it a noun, a verb or an adjective? Choose a, b or c.");
  assert.equal(getStudentExerciseInstruction({ typeId: "D22", items: [] }), "Read each clue and write the word.");
  const data = { meta: { classProfile: "C_SENIOR" }, lingoLauncher: { vocabulary: [], practice: [] },
    dictation: { exercises: [{ number: 1, typeId: "D21", items: [{ number: 1, prompt: "a) Eat breakfast. / b) Wake up. / c) Go to school.", answer: "b, a, c" }] }] } };
  assert.match(renderAnswerKey(data), /a 2 · b 1 · c 3/, "the key gives each step's number, as students write it");
});
