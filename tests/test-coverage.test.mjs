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
