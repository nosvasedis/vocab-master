// Word families, opposites and synonyms reach the Test Maker like the Worksheet Makers (CPP1 Unit 7 carries the teacher's).
import test from "node:test";
import assert from "node:assert/strict";
import { unitWords } from "../desktop/renderer/studio/unit-context.js";
import { testDefaults, makePart, testPrompt, buildTestDoc, taughtRelations, planNotes } from "../desktop/renderer/studio/test-builder.js";
import { testCoverage } from "../desktop/renderer/studio/test-coverage.js";
import { ownWordEntry } from "../desktop/renderer/studio/own-words.js";
import { allowedTerms, answerInScope, relatedTerms } from "../desktop/renderer/studio/word-scope.js";
import { TASKS } from "../desktop/renderer/studio/tasks.js";

const u7 = unitWords("CPP1", 7);
const pick = (...names) => names.map((n) => u7.find((w) => w.english === n));

test("a unit's words carry the bank's families, opposites and synonyms", () => {
  const [useful, produce, bug, kid] = pick("useful", "produce", "bug", "kid");
  assert.equal(useful.antonyms, "useless - άχρηστος");
  assert.match(produce.derivatives, /production/);
  assert.equal(bug.synonyms, "insect");
  assert.equal(useful.origin, "teacher");
  assert.equal(kid.derivatives, undefined, "only the fields an entry has");
  assert.deepEqual(relatedTerms("create (v.) - δημιουργώ, creation (n.) - δημιουργία"), ["create", "creation"]);
  assert.equal(ownWordEntry({ english: "useful" }, { bookId: "CPP1", unit: 7 }).antonyms, "useless - άχρηστος");
});

test("the Test Maker's prompt lists what the class learned, and its new parts use it first", () => {
  const focus = pick("useful", "push", "produce", "describe", "bug", "heavy");
  const r = taughtRelations(focus);
  assert.deepEqual(r.antonyms, [["useful", "useless"], ["push", "pull"]]);
  assert.deepEqual(r.derivatives, [["produce", "production"], ["describe", "description"]]);
  const parts = ["V-OPP", "V-OPPW", "V-SYN", "V-FAMMC", "V-FORM"].map((task, i) => ({ ...makePart("vocabulary", task, "A_SENIOR"), id: `p${i}` }));
  const { user } = testPrompt({ ...testDefaults("A_SENIOR"), parts, source: { kind: "unit" } }, { focusWords: focus });
  assert.match(user, /useful ↔ useless \(opposite\)/);
  assert.match(user, /TAUGHT OPPOSITES — use these first: useful ↔ useless, push ↔ pull/);
  assert.match(user, /TAUGHT SYNONYMS — use these first: bug = insect/);
  assert.match(user, /TAUGHT FAMILIES — use these first .*PRODUCE → production, DESCRIBE → description/);
  assert.equal((user.match(/CLASS LADDER —/g) || []).length, 2, "both family parts follow the ladder");
  // Without listed opposites the part still works, and the teacher is told (a note, never a block).
  const notes = planNotes({ ...testDefaults("A_SENIOR"), parts, source: { kind: "unit" } }, { focusWords: pick("kid", "cave") });
  assert.ok(notes.some((n) => /Part 1: none of the chosen words has an opposite/.test(n)));
  assert.ok(notes.some((n) => /Part 3: none of the chosen words has a synonym/.test(n)));
  for (const id of ["V-FAMMC", "V-OPP", "V-OPPW", "V-SYN"]) assert.equal(TASKS[id].skill, "vocabulary");
});

test("answers that are a taught form count: in the scope check, the saved test and the word check", () => {
  const focus = pick("produce", "useful", "creature");
  const terms = allowedTerms(focus);
  assert.ok(answerInScope("production", terms) && answerInScope("useless", terms));
  const spec = { ...testDefaults("B_SENIOR"), parts: [{ ...makePart("vocabulary", "V-FORM", "B_SENIOR"), id: "f", items: 2 }], source: { kind: "unit" } };
  const reply = { sections: [{ id: "f", example: { prompt: "It is a ________ day. (SUN)", answer: "sunny" }, items: [
    { prompt: "Milk ________ is important here.", answer: "production" },
    { prompt: "I made a ________ in art class. (CREATE)", answer: "creation" },
  ] }] };
  const doc = buildTestDoc(spec, reply, { levelId: "B_SENIOR", focusWords: focus });
  assert.equal(doc.focusWords[0].derivatives, "production (n.) - παραγωγή", "the saved test keeps the families");
  const by = Object.fromEntries(testCoverage(doc).words.map((w) => [w.english, w.status]));
  assert.equal(by.produce, "tested", "production tests produce");
  assert.equal(by.creature, "tested", "creation is listed in creature's family");
  assert.equal(by.useful, "missing");
});
