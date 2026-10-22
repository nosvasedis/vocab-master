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

// The families, opposites and synonyms the teacher adds in Step 1 (studio/word-relations.js).
import { parseRelationPair, relationTerms, addRelation, removeRelation, withRelations, relationsFromSaved, relationPairs, cleanRelations } from "../desktop/renderer/studio/word-relations.js";
import { mergeOwnWords } from "../desktop/renderer/studio/own-words.js";
import { docWordList } from "../desktop/renderer/studio/test-builder.js";

test("the teacher types a pair with a sign, or one word at a time in the editor", () => {
  assert.deepEqual(parseRelationPair("describe → description"), { english: "describe", kind: "derivatives", terms: ["description"] });
  assert.deepEqual(parseRelationPair("amaze -> amazing / amazed"), { english: "amaze", kind: "derivatives", terms: ["amazing", "amazed"] });
  assert.deepEqual(parseRelationPair("push ↔ pull"), { english: "push", kind: "antonyms", terms: ["pull"] });
  assert.deepEqual(parseRelationPair("push <-> pull"), { english: "push", kind: "antonyms", terms: ["pull"] });
  assert.deepEqual(parseRelationPair("bug = insect"), { english: "bug", kind: "synonyms", terms: ["insect"] });
  assert.equal(parseRelationPair("ash = στάχτη"), null, "a word with its Greek is not a pair");
  assert.equal(parseRelationPair("volcano"), null);
  assert.deepEqual(relationTerms("description (n.) - περιγραφή, Describe, descriptive", "describe"), ["description", "descriptive"], "no Greek, no headword");

  let map = addRelation({}, "Describe", "derivatives", "description");
  map = addRelation(map, "describe", "derivatives", "description, descriptive");
  assert.deepEqual(map, { describe: { derivatives: ["description", "descriptive"] } }, "no repeats");
  // A word the book already lists is not added again.
  const produce = u7.find((w) => w.english === "produce");
  assert.equal(addRelation(map, "produce", "derivatives", "production", produce), map);
  map = removeRelation(map, "describe", "derivatives", "descriptive");
  assert.deepEqual(map, { describe: { derivatives: ["description"] } });
  assert.deepEqual(removeRelation(map, "describe", "derivatives", "description"), {});
  assert.deepEqual(cleanRelations({ " Push ": { antonyms: ["pull", "τραβώ", ""], other: ["x"] }, kid: {} }), { push: { antonyms: ["pull"] } }, "a saved map is made safe");
});

test("what the teacher adds reaches the prompt, the Step 3 notes, the saved test and the word check", () => {
  // An own word with a family, a unit word (cave, nothing in the book) with an opposite.
  let rel = addRelation({}, "decide", "derivatives", "decision");
  rel = addRelation(rel, "cave", "antonyms", "house");
  rel = addRelation(rel, "kid", "synonyms", "child");
  const focus = withRelations(mergeOwnWords(pick("cave", "kid", "produce"), [{ english: "decide", greek: "" }], { bookId: "CPP1", unit: 7 }), rel);
  const by = Object.fromEntries(focus.map((w) => [w.english, w]));
  assert.match(by.produce.derivatives, /production/, "the book's family stays");
  assert.equal(by.cave.antonyms, "house");
  assert.ok(by.decide.own && by.decide.derivatives === "decision", "an own word gets its family");

  const parts = ["V-OPP", "V-SYN", "V-FORM"].map((task, i) => ({ ...makePart("vocabulary", task, "A_SENIOR"), id: `p${i}` }));
  const spec = { ...testDefaults("A_SENIOR"), parts, source: { kind: "unit" } };
  const { user } = testPrompt(spec, { focusWords: focus });
  assert.match(user, /TAUGHT OPPOSITES — use these first: cave ↔ house/);
  assert.match(user, /TAUGHT SYNONYMS — use these first: kid = child/);
  assert.match(user, /TAUGHT FAMILIES — use these first .*DECIDE → decision/);
  // Step 3's soft note goes away once the teacher has added one.
  const plain = pick("cave", "kid");
  assert.ok(planNotes(spec, { focusWords: plain }).some((n) => /has an opposite/.test(n)));
  const notes = planNotes(spec, { focusWords: withRelations(plain, rel) });
  assert.ok(!notes.some((n) => /has an opposite|has a synonym/.test(n)), notes.join(" | "));

  // The saved test keeps them; the word check counts "decision" as testing "decide".
  const fspec = { ...testDefaults("B_SENIOR"), parts: [{ ...makePart("vocabulary", "V-FORM", "B_SENIOR"), id: "f", items: 1 }], source: { kind: "unit" } };
  const doc = buildTestDoc(fspec, { sections: [{ id: "f", items: [{ prompt: "It was a hard ________. (DECIDE)", answer: "decision" }] }] }, { levelId: "B_SENIOR", focusWords: focus });
  assert.equal(doc.focusWords.find((w) => w.english === "decide").derivatives, "decision");
  assert.equal(testCoverage(doc).words.find((w) => w.english === "decide").status, "tested");

  // Opening the test again: what isn't in the book's lists comes back as the teacher's.
  const bank = new Map(u7.map((w) => [w.english, w]));
  const back = relationsFromSaved(docWordList(focus), (e) => bank.get(e) || {});
  assert.deepEqual(back, { cave: { antonyms: ["house"] }, kid: { synonyms: ["child"] }, decide: { derivatives: ["decision"] } });
  // The editor shows the book's pairs and the teacher's apart.
  const pairs = relationPairs(focus, rel);
  assert.ok(pairs.some((p) => p.english === "produce" && p.term === "production" && !p.mine));
  assert.ok(pairs.some((p) => p.english === "cave" && p.term === "house" && p.mine));
  assert.equal(pairs.filter((p) => p.term === "house").length, 1, "a teacher's pair is listed once");
});

test("Step 3 shows which families / opposites / synonyms a part will use (as many as it has questions)", async () => {
  const { relationPreview } = await import("../desktop/renderer/studio/test-builder.js");
  const focus = [{ english: "describe", derivatives: "description (n.)" }, { english: "amaze", derivatives: "amazing (adj.), amazed (adj.)" }, { english: "push", antonyms: "pull" }, { english: "bug", synonyms: "insect" }];
  assert.deepEqual(relationPreview("V-FORM", focus, 2), { kind: "families", pairs: ["DESCRIBE → description", "AMAZE → amazing"], more: 1, total: 3 });
  assert.deepEqual(relationPreview("V-OPPW", focus, 6).pairs, ["push ↔ pull"]);
  assert.deepEqual(relationPreview("V-SYN", focus, 6).pairs, ["bug = insect"]);
  assert.equal(relationPreview("V-OPP", [{ english: "cat" }], 5).total, 0);
  assert.equal(relationPreview("V-MC", focus, 5), null);
});

test("taught pairs: a family goes from the root, and each pair is listed once", async () => {
  const { taughtRelations } = await import("../desktop/renderer/studio/test-builder.js");
  const r = taughtRelations([{ english: "creature", derivatives: "create (v.)" }, { english: "create", derivatives: "creature (n.), creation (n.)" },
    { english: "bug", synonyms: "insect" }, { english: "insect", synonyms: "bug" }, { english: "push", antonyms: "pull" }, { english: "pull", antonyms: "push" }]);
  assert.deepEqual(r.derivatives, [["create", "creature"], ["create", "creation"]]);
  assert.deepEqual(r.synonyms, [["bug", "insect"]]);
  assert.deepEqual(r.antonyms, [["push", "pull"]]);
});
