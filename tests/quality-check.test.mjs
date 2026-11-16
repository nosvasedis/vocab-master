/* Worksheet word coverage tells the truth (whole-word matching, one chip per word family), and the worksheet
 * check behind generation: a long sentence is never a problem (nothing on the sheets is dictated), a copied
 * line is a line to fix, class guidelines are notes. */
import test from "node:test";
import assert from "node:assert/strict";
import { lineTestsTerm, wordCoverage } from "../desktop/renderer/studio/quality-check.js";
import { validateWorksheet } from "../desktop/renderer/app.js";

const vocab = (rows) => rows.map(([english, derivatives = []], i) => ({
  number: i + 1, english, type: "n.", greek: "x", emojis: "🙂", collocation: "",
  derivatives: derivatives.map((text) => ({ text, type: "n.", greek: "x" })), synonyms: [], antonyms: [],
}));
const line = (number, prompt, answer, extra = {}) => ({ number, prompt, answer, ...extra });
const sheet = (words, dictation, practice = []) => ({
  meta: { classProfile: "A_SENIOR", bookTitle: "Cambridge Primary Path 1", unit: 3 },
  lingoLauncher: { vocabulary: vocab(words), practice },
  dictation: { exercises: dictation },
});

test("whole words only: room is not bedroom, time is not spend time", () => {
  assert.equal(lineTestsTerm(line(1, "This is my ________.", "room"), "bedroom"), false);
  assert.equal(lineTestsTerm(line(1, "I have no ________ today.", "time"), "spend time"), false);
  assert.equal(lineTestsTerm(line(1, "I ________ time with my dog.", "spend"), "spend time"), true, "the phrase with its verb in the gap");
  assert.equal(lineTestsTerm(line(1, "She ________ her new friend.", "introduced"), "introduce"), true, "an inflected answer");
  assert.equal(lineTestsTerm(line(1, "I sleep in my ________.", "bedroom"), "bedroom"), true);
});

test("testsWords count only for words the line shows", () => {
  assert.equal(lineTestsTerm(line(1, "We eat in the ________.", "kitchen", { testsWords: ["kitchen", "garden"] }), "garden"), false, "garden is claimed but not on the line");
  assert.equal(lineTestsTerm(line(1, "garden ________", "C", { testsWords: ["garden"] }), "garden"), true, "matching: the word is printed");
});

test("one chip per family: a missing word is not listed again as its derivative", () => {
  const data = sheet([["challenge", ["challenging"]], ["introduce", ["introduction"]], ["kitchen"]], [
    { number: 1, typeId: "D04", wordBank: [], items: [line(1, "We cook in the ________.", "kitchen")] },
  ]);
  const cov = wordCoverage(data);
  assert.deepEqual(cov.missing, ["challenge", "introduce"]);
  const val = validateWorksheet(data);
  const coverageIssue = val.issues.find((i) => /not tested at least once/.test(i));
  assert.ok(coverageIssue && !/derivative/.test(coverageIssue), coverageIssue);
});

test("a derivative as the answer counts for its word", () => {
  const data = sheet([["introduce", ["introduction"]]], [
    { number: 1, typeId: "D04", wordBank: [], items: [line(1, "Read the ________ first.", "introduction")] },
  ]);
  const cov = wordCoverage(data);
  assert.deepEqual(cov.missing, []);
  assert.equal(cov.words[0].dictation[0].via, "introduction");
});

test("a long sentence is never a problem: nothing on the worksheets is dictated", () => {
  const long = "My big brother and my little sister like to watch a funny movie on Saturday night.";
  const data = sheet([["movie"]], [{ number: 1, typeId: "D04", wordBank: [], items: [line(1, long.replace("movie", "________"), "movie")] }]);
  const val = validateWorksheet(data);
  assert.equal(val.issues.some((i) => /sentence is \d+ words|dictate/.test(i)), false, val.issues.join(" | "));
  assert.equal(val.notes.some((n) => /dictate|words long/.test(n)), false);
  assert.equal(val.valid, true);
});

test("a Lingo line copied from the Dictation is a line to fix", () => {
  const s = "We cook dinner in the ________.";
  const data = sheet([["kitchen"]],
    [{ number: 1, typeId: "D04", wordBank: [], items: [line(1, s, "kitchen")] }],
    [{ number: 1, typeId: "L01", wordList: [], items: [line(1, s, "kitchen")] }]);
  const issues = validateWorksheet(data).issues;
  assert.ok(issues.some((i) => /^Lingo ex 1 \(L01\) item 1: same sentence as Dictation 1 line 1/.test(i)), issues.join(" | "));
});

test("lines per exercise is a guideline: 7 lines for A Senior is fine, a big overshoot is only a note", () => {
  const words = ["kitchen", "garden", "bedroom", "movie", "glue", "print", "meet", "invite", "fold"].map((w) => [w]);
  const gaps = (n) => words.slice(0, n).map(([w], i) => line(i + 1, `I can see the ________ now.`, w));
  const at = (n) => validateWorksheet(sheet(words, [{ number: 1, typeId: "D04", wordBank: [], items: gaps(n) }]));
  const seven = at(7);
  assert.equal(seven.issues.some((i) => /items|lines/.test(i)), false, "never a problem");
  assert.equal(seven.notes.filter((n) => /lines/.test(n)).length, 0, "7 lines (setting ~5) isn't even worth a note");
  const nine = at(9);
  assert.ok(nine.notes.some((n) => /Dictation 1 has 9 lines/.test(n)));
  assert.equal(nine.issues.some((i) => /lines/.test(i)), false, "a note is never a thing to fix");
});

test("exercise counts and class types are notes on the sheet, but a dropped exercise still retries generation", () => {
  const data = sheet([["kitchen"]], [{ number: 1, typeId: "D20", wordBank: [], items: [line(1, "We cook in the kichen.", "kitchen")] }]);
  data.generationPlan = { dictationExerciseCount: 2, lingoPracticeCount: 0, dictationTypes: ["D04", "D20"], lingoTypes: [] };
  const v = validateWorksheet(data);
  assert.equal(v.issues.some((i) => /expected|not allowed/.test(i)), false);
  assert.ok(v.notes.some((n) => /1 exercise; 2 were planned/.test(n)));
  assert.ok(v.notes.some((n) => /usually for D–E Senior — a stretch for A Senior/.test(n)));
  assert.equal(v.planMismatch, true);
});
