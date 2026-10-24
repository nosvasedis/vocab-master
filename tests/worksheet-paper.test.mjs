/* Worksheet lines drawn the Test Maker's way (studio/ws-paper.js + studio/paper-parts.js): letter boxes, options to
 * circle, answer boxes, steps, word chips, a table of groups — on paper, in Word and in the key — with letter help
 * for the whole exercise (Step 3 or the paper) and for one line. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  renderDictation, renderLingoLauncher, renderAnswerKey, normalizeWorksheetExercises, buildDictationDocx, buildLingoDocx, getStudentExerciseInstruction,
} from "../desktop/renderer/app.js";
import { wsItemView, wsItemHtml, itemHint, helpMode, helpModes, defaultHelp, choiceSplit, splitSteps, joinSteps, splitAB, joinAB, WS_HELP } from "../desktop/renderer/studio/ws-paper.js";
import { PAPER_PARTS_CSS } from "../desktop/renderer/studio/paper-parts.js";
import { STUDIO_PRINT_CSS } from "../desktop/renderer/studio/doc-render.js";
import { withEntries, cleanSettings } from "../desktop/renderer/studio/worksheet-tasks.js";

const I = (prompt, answer, more = {}) => ({ prompt, answer, ...more });
const ex = (typeId, items, more = {}) => ({ number: 1, typeId, instruction: "", items: items.map((it, i) => ({ number: i + 1, ...it })), ...more });
const sheet = (dict, lingo = [], meta = {}) => normalizeWorksheetExercises({
  meta: { classProfile: "B_SENIOR", layout: { dictation: { greekHelp: false } }, ...meta },
  lingoLauncher: { vocabulary: [{ english: "track" }, { english: "medal" }], practice: lingo.map((e, i) => ({ ...e, number: i + 1 })) },
  dictation: { exercises: dict.map((e, i) => ({ ...e, number: i + 1 })) },
});
const cells = (html) => (html.match(/class="st-cell( given)?"/g) || []).length;

test("the paper parts are shared: one CSS for worksheets and tests", () => {
  for (const rule of [".st-cell {", ".st-options {", ".st-opt b {", ".st-tf-box {", ".st-order-box {", ".st-line {"]) {
    assert.ok(PAPER_PARTS_CSS.includes(rule), rule);
    assert.ok(!STUDIO_PRINT_CSS.includes(`\n${rule}`), `${rule} is not duplicated in the test CSS`);
  }
});

test("options in brackets become a–c to circle: at the gap, mid-sentence, or under a word", () => {
  const d03 = wsItemView(ex("D03", []), I("Athletes stay in ________. (track / shape / limb)", "shape"));
  assert.deepEqual([d03.kind, d03.options, d03.answerIndex, d03.gap, d03.target], ["choice", ["track", "shape", "limb"], 1, true, false]);
  const l02 = wsItemView(ex("L02", []), I("My teacher is a great (inspiration / track) to us.", "inspiration"));
  assert.ok(l02.mid && l02.gap);
  const html = wsItemHtml(l02, {});
  assert.match(html, /a great <span class="st-line inline"><\/span> to us\./);
  assert.match(html, /<span class="st-opt"><b>a<\/b><span>inspiration<\/span><\/span><span class="st-opt"><b>b<\/b>/);
  assert.ok(!html.includes(" / "), "no slash list on the paper");
  const d05 = wsItemView(ex("D05", []), I("ancient (modern / wooden / noisy)", "modern"));
  assert.ok(d05.target && !d05.gap);
  assert.match(wsItemHtml(d05, {}), /<span class="ws-target">ancient<\/span>/);
  assert.equal(wsItemView(ex("D11", []), I("track, stadium, court, pizza", "pizza")).answerIndex, 3);
  const l13 = wsItemView(ex("L13", []), I("A. They ran.  B. They runned.", "A"));
  assert.ok(l13.upper && l13.stack && l13.options[1] === "They runned.");
  assert.deepEqual(wsItemView(ex("L06", []), I("compete", "verb")).options, ["noun", "verb", "adjective"]);
  assert.deepEqual(choiceSplit("x (a / b)").options, ["a", "b"]);
});

test("yes/no, matching, steps, word order, own sentences and groups get their boxes and lines", () => {
  const tf = wsItemView(ex("D15", []), I("( ) A medal is food.", "F"));
  assert.equal(tf.text, "A medal is food.");
  assert.match(wsItemHtml(tf, {}), /st-tf-box/);
  assert.match(wsItemHtml(wsItemView(ex("D13", []), I("medal __________", "A")), {}), /<b>medal<\/b><span class="st-order-box"><\/span>/);
  const steps = wsItemView(ex("D21", []), I("a) Then run. / b) First, warm up. / c) Finally, rest.", "b, a, c"));
  assert.deepEqual(steps.steps, ["Then run.", "First, warm up.", "Finally, rest."]);
  assert.equal((wsItemHtml(steps, {}).match(/st-order-box/g) || []).length, 3);
  assert.equal(joinSteps(splitSteps("a) x / b) y")), "a) x / b) y");
  assert.deepEqual(splitAB(joinAB(["p", "q"])), ["p", "q"]);
  assert.match(wsItemHtml(wsItemView(ex("L08", []), I("ran / they", "They ran.")), {}), /ws-chips.*<span>ran<\/span><span>they<\/span>.*st-line full/);
  assert.match(wsItemHtml(wsItemView(ex("D29", []), I("TRACK — your school", "x")), {}), /<b>TRACK — your school<\/b><span class="st-line full"><\/span>/);
  const g = wsItemView(ex("D16", []), I("Sports: ________, ________", "track, stadium"));
  assert.deepEqual([g.kind, g.group, g.slots], ["group", "Sports", 2]);
  const d = sheet([ex("D16", [I("Sports: ________, ________", "track, stadium"), I("Body: ________", "arm")], { wordBank: ["arm", "track", "stadium"] })]);
  assert.match(renderDictation(d, {}), /ws-sort-grid/);
});

test("letter help: the class default, the exercise's own mode, one line's own letters", () => {
  assert.equal(defaultHelp("D25", "A_SENIOR"), "first");
  assert.equal(defaultHelp("D25", "C_SENIOR"), "count");
  assert.equal(defaultHelp("D02", "B_SENIOR"), "root");
  assert.equal(defaultHelp("D04", "A_SENIOR"), "none", "phrase completion is recall without help unless the teacher adds it");
  assert.ok(!helpModes("D27").some(([v]) => v === "none" || v === "count"), "missing letters always shows letters");
  const d04 = ex("D04", [I("Run around the ________.", "track")]);
  assert.equal(itemHint(d04, d04.items[0], "B_SENIOR"), "");
  d04.letterHelp = "first";
  assert.equal(helpMode(d04, "B_SENIOR"), "first");
  assert.equal(itemHint(d04, d04.items[0], "B_SENIOR"), "t _ _ _ _");
  assert.equal(itemHint(d04, { ...d04.items[0], reveal: [0, 4] }, "B_SENIOR"), "t _ _ _ k", "the line's own letters win");
  assert.equal(itemHint(d04, { ...d04.items[0], reveal: "none" }, "B_SENIOR"), "");
  const html = wsItemHtml(wsItemView(d04, d04.items[0], "B_SENIOR"), d04.items[0]);
  assert.match(html, /around the <span class="st-cells">/, "the boxes sit in the gap");
  assert.equal(cells(html), 5);
  const d02 = ex("D02", [I("Did you win the ________?", "competition", { stem: "COMPETE" })]);
  assert.equal(itemHint(d02, d02.items[0], "B_SENIOR"), "c o m p e t _ _ _ _ _", "the word in capitals inside the answer");
  for (const id of Object.keys(WS_HELP)) assert.ok(helpModes(id).length >= 3, id);
});

test("missing letters (D27): the boxes follow the exercise's letter help, and the prompt keeps the pattern", () => {
  const d = sheet([ex("D27", [I("t _ a _ k (a path for races)", "track")], { letterHelp: "first" })]);
  assert.equal(d.dictation.exercises[0].items[0].prompt, "t _ _ _ _ (a path for races)");
  const html = renderDictation(d, {});
  assert.match(html, /<span class="ws-clue">a path for races<\/span>/);
  assert.equal((html.match(/class="st-cell given"/g) || []).length, 1);
  d.dictation.exercises[0].items[0].reveal = [0, 2];
  assert.equal(normalizeWorksheetExercises(d).dictation.exercises[0].items[0].prompt, "t _ a _ _ (a path for races)");
});

test("Step 3's letter help reaches the written sheet once; the paper's choice stays", () => {
  assert.deepEqual(cleanSettings({ hint: "first2" }), { hint: "first2" });
  assert.deepEqual(cleanSettings({ hint: "bogus" }), {});
  const plan = withEntries({}, "dictation", [{ type: "D22", hint: "first" }]);
  const d = sheet([ex("D22", [I("A path for races (5 letters)", "track")])], [], {});
  d.generationPlan = plan;
  delete d.dictation.exercises[0].letterHelp;
  const n = normalizeWorksheetExercises(d);
  assert.equal(n.dictation.exercises[0].letterHelp, "first");
  n.dictation.exercises[0].letterHelp = "count";
  assert.equal(normalizeWorksheetExercises(n).dictation.exercises[0].letterHelp, "count");
  const html = renderDictation(n, {});
  assert.ok(!html.includes("(5 letters)"), "the boxes say how many letters");
  assert.equal(cells(html), 5);
});

test("task lines name the options the paper prints; the teacher's own line wins", () => {
  const two = ex("D24", [I("A great ________ to us. (inspiration / respiration)", "inspiration")]);
  assert.equal(getStudentExerciseInstruction(two), "Choose the right word: a or b.");
  const three = ex("D03", [I("Stay in ________. (track / shape / limb)", "shape")]);
  assert.equal(getStudentExerciseInstruction(three), "Read and choose the right word: a, b or c.");
  assert.equal(getStudentExerciseInstruction({ ...three, instruction: "Circle the word" }), "Read and choose the right word: a, b or c.", "an AI line is not used");
  assert.equal(getStudentExerciseInstruction({ ...three, instruction: "Circle the word", ownInstruction: true }), "Circle the word");
});

test("the answer key gives a choice line's letter; Word files build for every kind", async () => {
  const d = sheet([
    ex("D03", [I("Stay in ________. (track / shape / limb)", "shape")]),
    ex("D21", [I("a) Then run. / b) First, warm up.", "b, a")]),
    ex("D16", [I("Sports: ________", "track")], { wordBank: ["track"] }),
    ex("D27", [I("t _ a _ k (a path)", "track")]),
    ex("D15", [I("( ) Medals are food.", "F")]),
  ], [ex("L13", [I("A. One.  B. Two.", "B")]), ex("L08", [I("ran / they", "They ran.")]), ex("L11", [I("Is it?", "Yes")])]);
  assert.match(renderAnswerKey(d, {}), /<strong>b · shape<\/strong>/);
  assert.match(renderLingoLauncher(d, {}), /<b>B<\/b><span>Two\.<\/span>/);
  assert.ok((await buildDictationDocx(d)).size > 2000);
  assert.ok((await buildLingoDocx(d)).size > 2000);
});
