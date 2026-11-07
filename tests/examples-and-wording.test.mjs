/* The example switch is obeyed everywhere a part shows its example (the box of words to sort, the sort table, the
 * "(0)" gap of a text, the main-idea recording), on the paper, in the teacher's pack and in Word; and gapped
 * sentences whose words around the gap don't fit the answer ("My ________ works on a farm." → farmer) are caught
 * in the Test Maker and on worksheets, and the writers are told the rules. */
import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { testDefaults, makePart, buildTestDoc, testPrompt, fixItemsPrompt } from "../desktop/renderer/studio/test-builder.js";
import { renderStudentPaper, renderTeacherPack } from "../desktop/renderer/studio/doc-render.js";
import { sortBank, sortRows, exampleGapFill, playedScript } from "../desktop/renderer/studio/doc-model.js";
import { gapFitProblem, passageGapSentence, vowelSound, GAP_FIT_PROBLEM, SENTENCE_RULES } from "../desktop/renderer/studio/gap-fit.js";
import { lineProblem } from "../desktop/renderer/studio/ws-checks.js";
import { buildStudioDocx } from "../desktop/renderer/app.js";

const docOf = (task, raw, layout = {}, level = "B_SENIOR") => {
  const part = { ...makePart(TASK_SKILL[task], task, level), id: "p1", items: raw.items.length };
  const spec = { ...testDefaults(level), parts: [part] };
  const doc = buildTestDoc(spec, { sections: [{ id: "p1", ...raw }] }, { levelId: level, meta: {} });
  doc.meta.layout = layout;
  return doc;
};
const TASK_SKILL = { "V-SORT": "vocabulary", "R-MCCLOZE": "reading", "R-SENT": "reading", "L-GIST": "listening", "V-MC": "vocabulary", "V-BANK": "vocabulary" };
const docxXml = async (doc, which = "student") => {
  const blob = await buildStudioDocx({ doc, which });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return zip.file("word/document.xml").async("string");
};

const SORT = {
  groups: ["Animals", "Food"],
  example: { prompt: "camel", answer: "Animals" },
  items: [{ prompt: "bee", answer: "Animals" }, { prompt: "bread", answer: "Food" }, { prompt: "goat", answer: "Animals" }, { prompt: "apple", answer: "Food" }],
};

test("put the words in groups: the example's word is crossed out only while the example is printed", () => {
  const shown = docOf("V-SORT", SORT, { examples: true });
  const s = shown.sections[0];
  assert.ok(s.bank.includes("camel"), "the doc keeps the example's word");
  assert.deepEqual(sortBank(s, shown.meta.layout).filter((b) => b.done).map((b) => b.word), ["camel"]);
  const html = renderStudentPaper(shown);
  assert.match(html, /<s>camel<\/s>/);
  assert.match(html, /st-ex-ans">camel</, "written in the table");
  assert.equal(sortRows(s, shown.meta.layout), 3, "Animals: camel + bee + goat");

  const hidden = docOf("V-SORT", SORT, { examples: false });
  const h = hidden.sections[0];
  assert.equal(sortBank(h, hidden.meta.layout).some((b) => b.word === "camel"), false, "hidden: not in the box at all");
  const hhtml = renderStudentPaper(hidden);
  assert.doesNotMatch(hhtml, /camel/, "no crossed-out word, no example in the table");
  assert.doesNotMatch(hhtml, /<s>/);
  assert.equal(sortRows(h, hidden.meta.layout), 2, "the table is as tall as the biggest group of questions");
  for (const w of ["bee", "bread", "goat", "apple"]) assert.match(hhtml, new RegExp(`<span>${w}</span>`));

  // The part's own switch wins over the test's.
  const own = docOf("V-SORT", SORT, { examples: true });
  own.sections[0].showExample = false;
  assert.doesNotMatch(renderStudentPaper(own), /camel/);
});

test("put the words in groups in Word: crossed out while shown, left out while hidden", async () => {
  const shown = await docxXml(docOf("V-SORT", SORT, { examples: true }));
  assert.match(shown, /<w:strike\/>/, "the example's word crossed out");
  assert.ok((shown.match(/camel/g) || []).length >= 2, "in the box and in the table");
  const hidden = await docxXml(docOf("V-SORT", SORT, { examples: false }));
  assert.doesNotMatch(hidden, /camel/);
  assert.doesNotMatch(hidden, /<w:strike\/>/);
});

const CLOZE = {
  passage: "Tom lives (0) ________ a farm. He gets up (1) ________ six. He feeds (2) ________ animals.",
  example: { prompt: "(0)", options: ["at", "on", "in"], answer: "on" },
  items: [{ prompt: "(1)", options: ["at", "on", "in"], answer: "at" }, { prompt: "(2)", options: ["the", "a", "an"], answer: "the" }],
};

test("a text's (0) gap: written in while the example is shown, a complete sentence while it is hidden", async () => {
  const shown = docOf("R-MCCLOZE", CLOZE, { examples: true });
  assert.deepEqual(exampleGapFill(shown.sections[0], shown.meta.layout), { shown: true, text: "on" });
  const html = renderStudentPaper(shown);
  assert.match(html, /<b>\(0\)<\/b> <span class="st-ex-ans">on<\/span>/);
  assert.match(html, /<b>\(1\)<\/b>/);

  const hidden = docOf("R-MCCLOZE", CLOZE, { examples: false });
  const hhtml = renderStudentPaper(hidden);
  assert.match(hhtml, /Tom lives on a farm\./);
  assert.doesNotMatch(hhtml, /\(0\)/);
  const xml = await docxXml(hidden);
  assert.match(xml, />on</);
  assert.doesNotMatch(xml, /\(0\)/);
  assert.match(await docxXml(shown), /\(0\) /);
});

test("missing sentences: the example's sentence fills its gap while hidden, its letter while shown", () => {
  const raw = {
    passage: "Anna loves the sea. (0) ________ Every summer she swims there. (1) ________ Then she goes home. (2) ________",
    example: { prompt: "(0)", answer: "She lives near a beach." },
    items: [{ prompt: "(1)", answer: "She stays in the water for hours." }, { prompt: "(2)", answer: "She is always tired but happy." }],
    extras: ["He plays football."],
  };
  const shown = docOf("R-SENT", raw, { examples: true }, "D_SENIOR");
  const fill = exampleGapFill(shown.sections[0], shown.meta.layout);
  assert.equal(fill.shown, true);
  assert.match(fill.text, /^[A-Z]$/);
  const hidden = docOf("R-SENT", raw, { examples: false }, "D_SENIOR");
  assert.match(renderStudentPaper(hidden), /Anna loves the sea\. She lives near a beach\. Every summer/);
});

test("listen for the main idea: the example's own recording is left out while the example is hidden", () => {
  const script = [
    { speaker: "Narrator", text: "Example." }, { speaker: "Mum", text: "Can you buy bread?" }, { speaker: "Tom", text: "Yes, Mum." },
    { speaker: "Narrator", text: "Number 1." }, { speaker: "Anna", text: "I'm so tired today." },
    { speaker: "Narrator", text: "Number 2." }, { speaker: "Leo", text: "Let's go to the park." },
  ];
  const raw = {
    script,
    example: { prompt: "Why does Mum call?", options: ["to ask for bread", "to say hello", "to go out"], answer: "to ask for bread" },
    items: [{ prompt: "How does Anna feel?", options: ["tired", "happy", "angry"], answer: "tired" }, { prompt: "What does Leo want?", options: ["to go to the park", "to sleep", "to eat"], answer: "to go to the park" }],
  };
  const shown = docOf("L-GIST", raw, { examples: true }, "C_SENIOR");
  assert.equal(playedScript(shown.sections[0], shown.meta.layout).length, script.length);
  const hidden = docOf("L-GIST", raw, { examples: false }, "C_SENIOR");
  const played = playedScript(hidden.sections[0], hidden.meta.layout);
  assert.deepEqual(played.map((l) => l.text), ["Number 1.", "I'm so tired today.", "Number 2.", "Let's go to the park."]);
  assert.doesNotMatch(renderTeacherPack(hidden), /Can you buy bread/, "the printed script is the one played");
  assert.match(renderTeacherPack(shown), /Can you buy bread/);
});

test("gapFitProblem: the words around the gap must fit the answer", () => {
  const vocab = [{ english: "farmer", type: "noun" }, { english: "apple", type: "n" }, { english: "elephant", type: "noun" }, { english: "station", type: "noun" }, { english: "teacher", type: "noun" }];
  const bad = [
    ["My ________ works on a farm.", "farmer", /My ________" sounds wrong with "farmer"/],
    ["Our ________ landed the plane safely.", "pilot", /people don't have their own pilot/],
    ["She ate a ________ after lunch.", "apple", /it is "an apple"/],
    ["He wears an ________ to school.", "uniform", /it is "a uniform"/],
    ["I saw two ________ at the zoo.", "elephant", /needs a plural/],
    ["She has a ________ in her bag.", "apples", /is for one thing/],
    ["Meet me at the ________.", "the station", /already has "the" before the gap/],
    ["I have ________ orange.", "a", /it needs "an"/],
  ];
  for (const [text, answer, why] of bad) {
    const p = gapFitProblem(text, answer, { vocab });
    assert.match(p, why, `${text} → ${answer}`);
    assert.match(p, GAP_FIT_PROBLEM, "the fixers recognise it");
  }
  const good = [
    ["The ________ works on a farm.", "farmer"], ["My ________ is very kind.", "teacher"], ["She ate an ________.", "apple"],
    ["I saw two ________.", "elephants"], ["I have ________ orange.", "an"], ["It is a ________ day.", "sunny"],
    ["We waited for an ________.", "hour"], ["She has a ________ dog.", "big"], ["passion __________", "C"],
  ];
  for (const [text, answer] of good) assert.equal(gapFitProblem(text, answer, { vocab }), "", `${text} → ${answer}`);
  // The article before the gap must not rule an option out.
  assert.match(gapFitProblem("I ate an ________.", "apple", { options: ["apple", "banana", "orange"] }), /"banana" can't follow "an"/);
  assert.deepEqual(["unusual", "university", "hour", "umbrella", "one", "European", "egg"].map(vowelSound), [true, false, true, true, false, false, true]);
  assert.equal(passageGapSentence("Hi Tom! We went to (1) ________ zoo. I saw (2) ________ elephant there. It was fun.", 2), "I saw ________ elephant there.");
});

test("worksheets: a gap line whose words don't fit its answer is a line problem (the line fixer rewrites it)", () => {
  assert.match(lineProblem("L01", { prompt: "My ________ works on a farm.", answer: "farmer" }, []), /sounds wrong with "farmer"/);
  assert.match(lineProblem("D04", { prompt: "She ate a ________ for lunch.", answer: "apple" }, []), /an apple/);
  assert.match(lineProblem("D03", { prompt: "I eat an ________ every day. (apple / banana / orange)", answer: "apple" }, []), /gives the answer away/);
  assert.equal(lineProblem("L01", { prompt: "The ________ works on a farm.", answer: "farmer" }, []), "");
  // Exercises whose mistakes are the point are not checked this way.
  assert.equal(lineProblem("D09", { prompt: "My ________ works on a farm.", answer: "farmer" }, []), "");
});

test("Test Maker: gap questions that don't fit are named, so Fix (and the automatic pass) rewrites just them", () => {
  const doc = docOf("V-MC", {
    example: { prompt: "The ________ is hot.", options: ["sun", "snow", "ice"], answer: "sun" },
    items: [
      { prompt: "My ________ grows vegetables.", options: ["farmer", "pilot", "singer"], answer: "farmer" },
      { prompt: "The ________ flies the plane.", options: ["pilot", "farmer", "chef"], answer: "pilot" },
      { prompt: "I eat an ________ every day.", options: ["apple", "pear", "egg"], answer: "apple" },
    ],
  }, {}, "C_SENIOR");
  const probs = doc.sections[0].problems.filter((p) => GAP_FIT_PROBLEM.test(p));
  assert.deepEqual(probs.map((p) => p.match(/^item (\d+)/)[1]), ["1", "3"]);
});

test("the writers and fixers are told the sentence rules", () => {
  const part = { ...makePart("vocabulary", "V-BANK", "B_SENIOR"), id: "p1" };
  const spec = { ...testDefaults("B_SENIOR"), parts: [part] };
  const { user } = testPrompt(spec, { focusWords: [{ english: "farmer" }] });
  assert.ok(user.includes(SENTENCE_RULES[2]), "the test writer");
  const doc = buildTestDoc(spec, { sections: [{ id: "p1", items: [{ prompt: "My ________ works on a farm.", answer: "farmer" }] }] }, { levelId: "B_SENIOR", meta: {} });
  const { system } = fixItemsPrompt(spec, doc.sections[0], [1], {});
  assert.match(system, /never with a job or a role nobody owns/, "the fixer");
});

test("odd one out: a meaning group (four nouns) is fine; two words that stand out are not", async () => {
  const { validateOddOneOutGroup } = await import("../desktop/renderer/app.js");
  const vocab = [{ english: "cat", type: "noun" }, { english: "dog", type: "noun" }, { english: "horse", type: "noun" }, { english: "bread", type: "noun" }, { english: "run", type: "verb" }];
  assert.equal(validateOddOneOutGroup(["cat", "dog", "horse", "bread"], "bread", vocab).ok, true, "by meaning, as A–C Senior are asked to write");
  assert.equal(validateOddOneOutGroup(["cat", "dog", "horse", "run"], "run", vocab).ok, true);
  const two = validateOddOneOutGroup(["cat", "dog", "run", "bread"], "bread", vocab);
  assert.equal(two.ok, false);
  assert.match(two.message, /two words stand out/);
});
