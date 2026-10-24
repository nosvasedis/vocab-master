/* The worksheet quality check tells the truth: whole-word matching, one chip per word family,
 * long sentences as fixable lines, copied lines as fixable lines, and an honest note when the Dictation
 * has no room for the words it misses. */
import test from "node:test";
import assert from "node:assert/strict";
import { lineTestsTerm, wordCoverage, dictationRoom, friendlyReason, sentenceLimit } from "../desktop/renderer/studio/quality-check.js";
import { validateWorksheet, buildValidationReport } from "../desktop/renderer/app.js";

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

test("room: spare lines and free places, and an honest shortfall", () => {
  const words = [["kitchen"], ["garden"], ["bedroom"], ["movie"]];
  const data = sheet(words, [
    { number: 1, typeId: "D04", wordBank: [], items: [
      line(1, "We cook in the ________.", "kitchen"),
      line(2, "Mum is in the ________ now.", "kitchen"),
      line(3, "The flowers are in the ________.", "garden"),
    ] },
  ]);
  const cov = wordCoverage(data);
  assert.deepEqual(cov.missing, ["bedroom", "movie"]);
  const room = dictationRoom(data, cov, 4);
  assert.equal(room.spare.length, 1, "one of the two kitchen lines can go");
  assert.equal(room.room, 2, "1 spare line + 1 free place");
  assert.equal(room.short, 0);
  assert.equal(dictationRoom(data, cov, 3).short, 1, "a full exercise leaves one word out");
});

test("a too-long dictation sentence is a line to fix, with its place", () => {
  const long = "My big brother and my little sister like to watch a funny movie on Saturday night.";
  const data = sheet([["movie"]], [{ number: 1, typeId: "D04", wordBank: [], items: [line(1, long.replace("movie", "________"), "movie")] }]);
  const val = validateWorksheet(data);
  const issue = val.issues.find((i) => /sentence is \d+ words/.test(i));
  assert.match(issue, /^Dictation ex 1 \(D04\) item 1: sentence is 16 words — keep it to about 7/);
  const report = buildValidationReport(val, data);
  const item = report.categories.items.find((i) => i.minor);
  assert.equal(item.where, "Dictation 1 · line 1");
  assert.match(item.friendly, /too long to dictate \(16 words/);
  assert.equal(report.categories.manual.length, 0, "never 'may need a full rewrite'");
  assert.match(report.intro, /^Ready to print/);
  assert.equal(sentenceLimit(7), 9);
  const choices = sheet([["glue"]], [{ number: 1, typeId: "D03", wordBank: [], items: [line(1, "We (fold / glue / meet) the stars on the card.", "glue")] }]);
  assert.equal(validateWorksheet(choices).issues.some((i) => /sentence is/.test(i)), false, "bracket choices are one word, wherever they are");
});

test("a Lingo line copied from the Dictation is a line to fix", () => {
  const s = "We cook dinner in the ________.";
  const data = sheet([["kitchen"]],
    [{ number: 1, typeId: "D04", wordBank: [], items: [line(1, s, "kitchen")] }],
    [{ number: 1, typeId: "L01", wordList: [], items: [line(1, s, "kitchen")] }]);
  const report = buildValidationReport(validateWorksheet(data), data);
  const item = report.categories.items.find((i) => /same sentence/.test(i.friendly));
  assert.ok(item, JSON.stringify(report.categories));
  assert.equal(item.target.sheet, "lingo");
  assert.equal(report.categories.manual.length, 0);
});

test("the report says when the missing words can't fit", () => {
  const data = sheet([["kitchen"], ["garden"], ["bedroom"]], [
    { number: 1, typeId: "D04", wordBank: [], items: [
      line(1, "We cook in the ________.", "kitchen"), line(2, "Flowers grow in the ________.", "garden"),
      line(3, "Dad is in the ________.", "kitchen"), line(4, "Mum is in the ________.", "garden"),
      line(5, "Look at the ________.", "kitchen"), line(6, "I play in the ________.", "garden"),
    ] },
  ]);
  const val = validateWorksheet(data);
  const report = buildValidationReport(val, data);
  assert.deepEqual(report.coverageWords, ["bedroom"]);
  assert.ok(report.coverageFixable >= 1, "repeated lines can take it");
  assert.match(report.roomNote, /room/);
  assert.equal(report.coverageChips[0].inLingo, false);
});

test("teacher wording for the common reasons", () => {
  assert.equal(friendlyReason('prompt reveals answer "garden"'), "the answer “garden” is already printed in the line");
  assert.match(friendlyReason('rewrite this statement so the answer is "False" — the key needs a mix of True and False'), /mix of True and False/);
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
  const report = buildValidationReport(nine, sheet(words, []));
  assert.equal(report.mustFix ?? 0, 0, "a note is never a thing to fix");
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
