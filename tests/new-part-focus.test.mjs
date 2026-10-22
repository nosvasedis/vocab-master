/* A part added to a written test is built on the words the test doesn't test yet; the "Put words" plan carries Step 3's settings. */
import test from "node:test";
import assert from "node:assert/strict";
import { newPartFocus } from "../desktop/renderer/studio/test-coverage.js";
import { buildTestDoc, testDefaults } from "../desktop/renderer/studio/test-builder.js";
import { TASKS } from "../desktop/renderer/studio/tasks.js";
import { planFromProposal, setTask, setOpt, fitTasks, moveWords } from "../desktop/renderer/studio/word-plan.js";

const words = ["cat", "dog", "hen", "cow", "goat", "duck", "horse"].map((english) => ({ english, type: "n." }));
const writtenDoc = () => {
  const spec = { ...testDefaults("B_SENIOR", "standard"), parts: [{ id: "p1", skill: "vocabulary", task: "V-BANK", items: 3, pointsEach: 1, opts: {} }] };
  const reply = { sections: [{ id: "p1", example: { prompt: "A ________ says moo.", answer: "cow" }, items: [
    { prompt: "The ________ says meow.", answer: "cat" }, { prompt: "The ________ barks.", answer: "dog" }, { prompt: "The ________ lays eggs.", answer: "hen" }] }] };
  return buildTestDoc(spec, reply, { levelId: "B_SENIOR", focusWords: words });
};

test("a new word part takes the untested words, in the word check's order, one per question as the answer", () => {
  const doc = writtenDoc();
  // "cow" is only in the example, which tests nothing.
  const f = newPartFocus(doc, { task: "V-MC", skill: "vocabulary", items: 3 }, { tasks: TASKS });
  assert.deepEqual(f.words, ["cow", "goat", "duck"]);
  assert.match(f.instruction, /NEW part/);
  assert.match(f.instruction, /right answer/);
  assert.match(f.instruction, /"cow", "goat", "duck"/);
});

test("two new parts get different words; a picture part only words with pictures; open parts use the words", () => {
  const doc = writtenDoc();
  const second = newPartFocus(doc, { task: "V-DEF", skill: "vocabulary", items: 3 }, { tasks: TASKS, skip: ["cow", "goat", "duck"] });
  assert.deepEqual(second.words, ["horse"]);
  const pics = newPartFocus(doc, { task: "V-PIC", skill: "vocabulary", items: 5 }, { tasks: TASKS, hasPicture: (w) => w !== "duck" });
  assert.ok(!pics.words.includes("duck"));
  const writing = newPartFocus(doc, { task: "W-GUIDED", skill: "writing", items: 1 }, { tasks: TASKS });
  assert.deepEqual(writing.words, ["cow", "goat", "duck", "horse"]);
  assert.match(writing.instruction, /task, the help points/);
});

test("when every chosen word is tested, a new part gets no word list", () => {
  const doc = writtenDoc();
  doc.focusWords = doc.focusWords.filter((w) => ["cat", "dog", "hen"].includes(w.english));
  const f = newPartFocus(doc, { task: "V-MC", skill: "vocabulary", items: 4 }, { tasks: TASKS });
  assert.deepEqual(f, { words: [], instruction: "" });
});

test("the Put-words plan: each new part keeps Step 3's settings; a new exercise starts from its defaults", () => {
  let p = planFromProposal([{ task: "V-DEF", words: ["goat", "duck", "horse"] }]);
  const key = p.parts[0].key;
  p = setOpt(p, key, "hint", "firstlast");
  assert.deepEqual(p.parts[0].opts, { hint: "firstlast" });
  p = moveWords(p, ["goat"], "spare");
  assert.deepEqual(p.parts[0].opts, { hint: "firstlast" }, "settings survive moving words");
  p = setTask(p, key, "V-MC");
  assert.deepEqual(p.parts[0].opts, {});
  // A picture exercise goes back when a word without a picture comes in (any picture exercise, not only V-PIC).
  p = setTask(p, key, "V-TICK");
  const { plan } = fitTasks(p, { hasPicture: (w) => w !== "horse", fallback: () => "V-MC", needsPictures: (t) => !!TASKS[t]?.needs?.includes("pictures") });
  assert.equal(plan.parts[0].task, "V-MC");
});
