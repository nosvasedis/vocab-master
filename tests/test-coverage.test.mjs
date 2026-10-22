/* The Test Maker's word check: which chosen words the test asks about, and where (studio/test-coverage.js). */
import test from "node:test";
import assert from "node:assert/strict";
import { testCoverage, coverageWhere } from "../desktop/renderer/studio/test-coverage.js";

const doc = {
  focusWords: [{ english: "volcano", greek: "ηφαίστειο" }, { english: "city" }, { english: "erupt" }, { english: "lava" }, { english: "ash", own: true }, { english: "Volcano" }],
  sections: [
    { skill: "vocabulary", task: "V-MC", items: [
      { n: 1, prompt: "Hot ____ comes out of the mountain.", options: ["lava", "snow", "rain"], answerIndex: 0, answer: "lava" },
      { n: 3, prompt: "Choose the right word.", options: ["ash", "rock"], answerIndex: 1, answer: "rock" },
      { n: 2, prompt: "There are many cities in Greece.", answer: "true" },
    ] },
    { skill: "reading", task: "R-TF", passage: "The volcano started to erupt at night.", items: [
      { n: 1, prompt: "The volcanoes were quiet.", answer: "false" },
    ] },
    { skill: "grammar", task: "G-GAP", items: [{ n: 1, prompt: "It ____ (erupt) yesterday.", answer: "erupted" }] },
  ],
};

test("a word is tested by an answer, or by any line of a vocabulary part; forms count", () => {
  const c = testCoverage(doc);
  const by = Object.fromEntries(c.words.map((w) => [w.english, w]));
  assert.equal(c.total, 5, "repeated words count once");
  assert.equal(by.lava.status, "tested");
  assert.deepEqual(by.lava.tested, [{ part: 0, items: [1] }]);
  assert.equal(by.city.status, "tested", "cities in a vocabulary question");
  assert.equal(by.erupt.status, "tested", "erupted is an answer in the grammar part");
  assert.deepEqual(by.erupt.seen, [1], "it also appears in the reading text");
  assert.equal(by.volcano.status, "seen", "only in the reading text and a true/false sentence");
  assert.equal(by.ash.status, "seen", "a wrong option is not tested");
  assert.deepEqual(by.ash.seen, [0]);
  assert.equal(by.ash.own, true);
  assert.deepEqual([c.tested, c.seen, c.missing], [3, 2, 0]);
  assert.deepEqual(c.parts.map((p) => p.words), [["city", "lava"], [], ["erupt"]]);
});

test("the tip says where", () => {
  const by = Object.fromEntries(testCoverage(doc).words.map((w) => [w.english, w]));
  assert.equal(coverageWhere(by.lava), "Tested in Part 1 (question 1)");
  assert.equal(coverageWhere(by.erupt), "Tested in Part 3 (question 1) · also appears in Part 2");
  assert.match(coverageWhere(by.volcano), /^Only appears in Part 2/);
  assert.equal(coverageWhere({ tested: [], seen: [] }), "Not on the test");
});

test("no words, no sections", () => {
  assert.deepEqual(testCoverage({}), { words: [], parts: [], tested: 0, seen: 0, missing: 0, total: 0 });
});

test("where a word can go: vocabulary first, a text that lacks the word only by a rewrite, writing only by a rewrite", async () => {
  const { placementOptions, itemUses } = await import("../desktop/renderer/studio/test-coverage.js");
  const { TASKS } = await import("../desktop/renderer/studio/tasks.js");
  const d = { ...doc, sections: [...doc.sections, { skill: "writing", task: "W-GUIDED", items: [{ n: 1, prompt: "Write about a volcano.", answer: "" }] }] };
  const byPart = placementOptions(d, ["volcano"], { tasks: TASKS, maxItems: 3 });
  assert.equal(byPart.length, 4);
  assert.equal(byPart[0].fit, "best");
  assert.equal(byPart[0].canAdd, false, "Part 1 is full (3 of 3)");
  assert.equal(byPart[0].canReplace, true);
  assert.equal(byPart[1].fit, "ok", "the reading text uses volcano");
  assert.equal(byPart[3].fit, "rewrite", "writing has no questions");
  assert.equal(byPart[3].canAdd, false);
  assert.equal(placementOptions(d, ["ash"], { tasks: TASKS })[1].fit, "rewrite", "the text doesn't use ash");
  // The question on lava and the one on cities are each the only test of their word; the one on rock tests none.
  assert.deepEqual(byPart[0].items.map((it) => it.only), [["lava"], [], ["city"]]);
  assert.equal(itemUses(doc.sections[0].items[0], "lava"), true);
  assert.equal(itemUses(doc.sections[0].items[2], "city"), true, "cities");
});

test("a remade question must have the word as its answer when asked; word forms count", async () => {
  const { remakeProblems } = await import("../desktop/renderer/studio/remake.js");
  const before = { prompt: "I live in a big ____.", options: ["house", "toy", "farm"], answer: "house" };
  assert.deepEqual(remakeProblems(before, { prompt: "There are many ____ in Greece.", options: ["cities", "toys"], answer: "cities" }, { use: "city", answer: "city" }), []);
  const p = remakeProblems(before, { prompt: "The city is big. It has a ____.", options: ["park", "lava"], answer: "park" }, { use: "city", answer: "city" });
  assert.equal(p.length, 1);
  assert.match(p[0], /not the right answer/);
});

test("new parts for many words: class-fit tasks, pictures first, no tiny last part, own words first", async () => {
  const { planNewParts, newPartTasks, wordPriority, testCoverage: cover } = await import("../desktop/renderer/studio/test-coverage.js");
  const { TASKS } = await import("../desktop/renderer/studio/tasks.js");
  // A Senior (0): no V-MC / V-DEF (they start at B); E Senior (4): no spelling or picture writing.
  assert.deepEqual(newPartTasks(0, { tasks: TASKS }), ["V-BANK", "V-MATCH", "V-SPELL", "V-PIC"]);
  assert.deepEqual(newPartTasks(4, { tasks: TASKS }), ["V-BANK", "V-MC", "V-DEF", "V-MATCH"]);
  const words = Array.from({ length: 52 }, (_, i) => ({ english: `word${i}`, type: i < 6 ? "n" : "v" }));
  const plan = planNewParts(words, { levelIdx: 1, tasks: TASKS, perPart: 8, hasPicture: (w) => /^word[0-5]$/.test(w), used: ["V-MC"] });
  assert.equal(plan[0].task, "V-PIC", "the six picture nouns make a Look and write part");
  assert.equal(plan[0].words.length, 6);
  assert.equal(plan.flatMap((p) => p.words).length, 52, "every word is in exactly one part");
  assert.equal(new Set(plan.flatMap((p) => p.words)).size, 52);
  assert.ok(plan.every((p) => p.words.length >= 3 && p.words.length <= 10), plan.map((p) => p.words.length).join(","));
  assert.notEqual(plan[1].task, "V-MC", "a task the test already uses comes later");
  assert.ok(plan.slice(1).every((p) => p.task !== "V-PIC"));
  // 10 words, 8 a part: one part of 10, not 8 + 2.
  assert.deepEqual(planNewParts(words.slice(6, 16), { levelIdx: 1, tasks: TASKS, perPart: 8 }).map((p) => p.words.length), [10]);
  // Priority: own words, then not on the test, then only in a text, each in list order.
  const d = { focusWords: [{ english: "volcano" }, { english: "ash" }, { english: "lava" }, { english: "rock", own: true }], sections: [{ skill: "reading", task: "R-TF", passage: "The volcano.", items: [{ n: 1, prompt: "x", answer: "lava" }] }] };
  assert.deepEqual(wordPriority(cover(d)).map((w) => w.english), ["rock", "ash", "volcano", "lava"]);
});

test("word families: baker doesn't test bake when both are chosen; picture parts need a picture for every word", async () => {
  const { testCoverage: cover, placementOptions, hasWord } = await import("../desktop/renderer/studio/test-coverage.js");
  const { TASKS } = await import("../desktop/renderer/studio/tasks.js");
  const d = { focusWords: [{ english: "bake" }, { english: "baker" }, { english: "paint" }], sections: [{ skill: "vocabulary", task: "V-BANK", items: [{ n: 1, prompt: "The ____ sells bread.", answer: "baker" }, { n: 2, prompt: "I like to ____ pictures.", answer: "paint" }] }] };
  const by = Object.fromEntries(cover(d).words.map((w) => [w.english, w.status]));
  assert.deepEqual(by, { bake: "missing", baker: "tested", paint: "tested" });
  assert.equal(hasWord("She baked a cake for the baker.", "bake", ["bake", "baker"]), true, "baked is bake's own form");
  assert.equal(hasWord("The baker is here.", "bake", ["bake", "baker"]), false);
  assert.equal(hasWord("The baker is here.", "bake", ["bake"]), true, "without baker chosen, the lenient match stays");
  const pic = { focusWords: [{ english: "cat" }, { english: "idea" }], sections: [{ skill: "vocabulary", task: "V-PIC", items: [{ n: 1, prompt: "", answer: "cat" }] }] };
  const [o] = placementOptions(pic, ["idea"], { tasks: TASKS, hasPicture: (w) => w === "cat" });
  assert.equal(o.fit, "nopic");
  assert.equal(o.canAdd, false);
  assert.equal(o.canReplace, false);
  assert.equal(placementOptions(pic, ["cat"], { tasks: TASKS, hasPicture: (w) => w === "cat" })[0].fit, "best");
});
