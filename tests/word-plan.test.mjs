/* "Put words on the test": the teacher's own plan — move words, size parts, add and remove parts. */
import test from "node:test";
import assert from "node:assert/strict";
import { planFromProposal, moveWords, resizePart, removePart, addPart, setTask, syncPlan, fitTasks, placedWords } from "../desktop/renderer/studio/word-plan.js";

const base = () => planFromProposal([{ task: "V-PIC", words: ["cat", "dog", "hen"] }, { task: "V-BANK", words: ["run", "jump", "swim", "fly"] }]);

test("words move between new parts, in front of a word, and out of the plan", () => {
  let p = base();
  const [a, b] = p.parts.map((x) => x.key);
  p = moveWords(p, ["swim"], a, { at: 1 });
  assert.deepEqual(p.parts[0].words, ["cat", "swim", "dog", "hen"]);
  assert.deepEqual(p.parts[1].words, ["run", "jump", "fly"]);
  p = moveWords(p, ["cat", "fly"], "spare");
  assert.deepEqual(p.spare, ["cat", "fly"]);
  assert.deepEqual(placedWords(p), ["swim", "dog", "hen", "run", "jump"]);
  // Back in from "left out"; nothing is ever in two places.
  p = moveWords(p, ["cat"], b);
  assert.deepEqual(p.spare, ["fly"]);
  assert.equal(placedWords(p).filter((w) => w === "cat").length, 1);
});

test("words go to a new part or to a part already on the test", () => {
  let p = moveWords(base(), ["run", "jump"], "new", { task: "V-MC" });
  assert.equal(p.parts.length, 3);
  assert.deepEqual(p.parts[2], { ...p.parts[2], kind: "new", task: "V-MC", words: ["run", "jump"] });
  p = moveWords(p, ["dog"], { id: "sec-3", part: 2 });
  p = moveWords(p, ["hen"], { id: "sec-3", part: 2 });
  const ex = p.parts.find((x) => x.kind === "existing");
  assert.deepEqual([ex.id, ex.part, ex.words], ["sec-3", 2, ["dog", "hen"]]);
  // An existing-part entry that loses all its words goes away.
  p = moveWords(p, ["dog", "hen"], "spare");
  assert.ok(!p.parts.some((x) => x.kind === "existing"));
});

test("a part gets smaller (word left out) and bigger (left-out words first, then the next part)", () => {
  let p = base();
  const [a, b] = p.parts.map((x) => x.key);
  p = resizePart(p, b, -1);
  assert.deepEqual(p.parts[1].words, ["run", "jump", "swim"]);
  assert.deepEqual(p.spare, ["fly"]);
  p = resizePart(p, a, 1);
  assert.deepEqual(p.parts[0].words, ["cat", "dog", "hen", "fly"]);
  p = resizePart(p, a, 1);
  assert.deepEqual(p.parts[0].words, ["cat", "dog", "hen", "fly", "run"]);
  assert.deepEqual(p.parts[1].words, ["jump", "swim"]);
  // Never past the most a part takes.
  assert.deepEqual(resizePart(p, a, 1, { max: 5 }).parts[0].words.length, 5);
});

test("parts are added, removed (words left out) and change their exercise", () => {
  let p = addPart(base(), "V-DEF");
  assert.deepEqual(p.parts[2].words, []);
  p = removePart(p, p.parts[0].key);
  assert.deepEqual(p.spare, ["cat", "dog", "hen"]);
  p = setTask(p, p.parts[0].key, "V-SPELL");
  assert.equal(p.parts[0].task, "V-SPELL");
});

test("the plan follows the chosen words, and the picture task only keeps words with pictures", () => {
  let p = syncPlan(base(), ["cat", "dog", "run", "jump", "swim", "fly", "owl"]);
  assert.deepEqual(p.parts[0].words, ["cat", "dog"]);
  assert.deepEqual(p.spare, ["owl"]);
  p = moveWords(p, ["run"], p.parts[0].key);
  const { plan, changed } = fitTasks(p, { hasPicture: (w) => ["cat", "dog", "hen"].includes(w), fallback: () => "V-BANK" });
  assert.equal(plan.parts[0].task, "V-BANK");
  assert.deepEqual(changed, [plan.parts[0].key]);
});
