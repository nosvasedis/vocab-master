/* Class memory, fixing single questions, part difficulty, distractor rules, speaking cards (all pure parts). */
import test from "node:test";
import assert from "node:assert/strict";
import { buildClassMemory, reviewWords, reviewGap, memoryBrief } from "../desktop/renderer/studio/class-memory.js";
import { testDefaults, makePart, testPrompt, buildTestDoc, PART_LEVELS, partLevel, DISTRACTOR_RULE, problemTargets, fixItemsPrompt, applyItemFixes } from "../desktop/renderer/studio/test-builder.js";
import { normalizeSection } from "../desktop/renderer/studio/doc-model.js";
import { renderStudentPaper, renderTeacherPack } from "../desktop/renderer/studio/doc-render.js";
import { parseRequest, mergeAiPlan, planSummary, REVIEW } from "../desktop/renderer/studio/assistant.js";
import { reviseSection } from "../desktop/renderer/studio/test-builder.js";
import { unitWords } from "../desktop/renderer/studio/unit-context.js";
import { completePlan as completeAssistantPlan } from "../desktop/renderer/studio/assistant.js";
import { unitContextPrompt, buildUnitContext } from "../desktop/renderer/studio/unit-context.js";

const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 20);
const ago = (d) => new Date(NOW - d * DAY).toISOString();

/* ── Class memory ─────────────────────────────────────────────────── */
const units = [
  { profileId: "B_SENIOR", savedAt: ago(30), label: "Unit 2 · Animals", data: { lingoLauncher: { vocabulary: [{ english: "giraffe", greek: "καμηλοπάρδαλη" }, { english: "zebra" }, { english: "lion" }] } } },
  { profileId: "B_SENIOR", savedAt: ago(3), label: "Unit 3 · Food", data: { lingoLauncher: { vocabulary: [{ english: "bread" }, { english: "cheese" }] } } },
  { profileId: "C_SENIOR", savedAt: ago(40), label: "Unit 1 · Space", data: { lingoLauncher: { vocabulary: [{ english: "planet" }] } } },
];
const docs = [
  { kind: "test", savedAt: ago(20), meta: { classProfile: "B_SENIOR", title: "Unit 2 Test" }, focusWords: [{ english: "zebra" }, { english: "Lion" }] },
  { kind: "dictation", savedAt: ago(25), meta: { classProfile: "B_SENIOR" }, focusWords: [{ english: "lion" }] },
];

test("class memory counts each class's encounters with a word, and when it was tested", () => {
  const mem = buildClassMemory({ units, docs, levelId: "B_SENIOR" });
  assert.equal(mem.items, 4);
  assert.equal(mem.words.has("planet"), false, "another class's words stay out");
  const lion = mem.words.get("lion");
  assert.equal(lion.met, 3);
  assert.equal(lion.testedAt, NOW - 20 * DAY);
  assert.equal(mem.words.get("giraffe").greek, "καμηλοπάρδαλη");
  assert.equal(mem.words.get("giraffe").testedAt, 0);
});

test("review words follow spaced repetition: due words, never-tested first, current words left out", () => {
  assert.deepEqual([1, 2, 3, 4, 9].map(reviewGap), [7, 14, 28, 56, 56]);
  const mem = buildClassMemory({ units, docs, levelId: "B_SENIOR" });
  const r = reviewWords(mem, { now: NOW });
  const names = r.map((w) => w.english);
  assert.ok(!names.includes("bread"), "met 3 days ago: not due");
  assert.ok(!names.includes("lion"), "met 3 times, last 20 days ago: next review in 28 days");
  assert.equal(names[0], "giraffe", "met once a month ago and never tested");
  assert.ok(names.includes("zebra"));
  assert.match(r[0].why, /once.*4 weeks ago.*not tested yet/);
  assert.deepEqual(reviewWords(mem, { now: NOW, exclude: [{ english: "Giraffe" }] }).map((w) => w.english), ["zebra"]);
  assert.deepEqual(reviewWords(buildClassMemory({ levelId: "E_SENIOR", units, docs }), { now: NOW }), []);
});

test("the AI brief names the words met recently and the review words", () => {
  const mem = buildClassMemory({ units, docs, levelId: "B_SENIOR" });
  const brief = memoryBrief(mem, reviewWords(mem, { now: NOW }), { now: NOW });
  assert.match(brief, /CLASS MEMORY/);
  assert.match(brief, /last two weeks: bread, cheese/);
  assert.match(brief, /Due for review.*giraffe/);
  assert.equal(memoryBrief(buildClassMemory({ levelId: "E_SENIOR" })), "");
});

test("the assistant reads requests to revise earlier words", () => {
  for (const t of ["make a test on unit 3 and revise the words they studied before", "a revision test for B class", "also review earlier words", "a test on what the class has studied", "τεστ με επανάληψη"]) {
    assert.ok(REVIEW.test(t.toLowerCase()), t);
    assert.equal(parseRequest(t).review, true, t);
  }
  for (const t of ["a test on unit 4", "review the present simple", "a test on unit 5 with all the words"]) assert.equal(!!parseRequest(t).review, false, t);
  assert.equal(mergeAiPlan({}, { review: true }).review, true);
  assert.match(planSummary({ kind: "test", levelId: "B_SENIOR", review: true }), /met before/);
});

/* ── Difficulty and distractors ───────────────────────────────────── */
test("each part has its own difficulty (1–5, 3 = for the class) and the prompt says it", () => {
  assert.equal(partLevel({}), 3);
  assert.equal(partLevel({ level: 9 }), 5);
  assert.equal(partLevel({ level: 0.6 }), 1);
  assert.equal(PART_LEVELS.filter(Boolean).length, 5);
  const spec = { ...testDefaults("B_SENIOR"), parts: [{ ...makePart("reading", "R-MC", "B_SENIOR"), level: 5 }] };
  const { system, user } = testPrompt(spec, { focusWords: [{ english: "lava" }] });
  assert.match(`${system}\n${user}`, /Difficulty of this part: Challenging/);
  assert.ok(`${system}\n${user}`.includes(DISTRACTOR_RULE), "the distractor rule is always part of the brief");
  assert.match(DISTRACTOR_RULE, /never 'some'/);
});

/* ── Fixing only the questions in trouble ─────────────────────────── */
function readingDoc() {
  const plan = { ...makePart("reading", "R-MC", "B_SENIOR"), id: "r1", items: 3 };
  const spec = { ...testDefaults("B_SENIOR"), parts: [plan] };
  const reply = { sections: [{ id: "r1", passage: "Mia has a dog. It is brown. It likes the park.", example: { prompt: "Who has a dog?", options: ["Mia", "Tom", "Ann"], answer: "Mia" }, items: [
    { prompt: "What colour is the dog?", options: ["brown", "black", "white"], answer: "brown" },
    { prompt: "Where does it like to go?", options: ["school", "home"], answer: "the park" },
    { prompt: "What is it?", options: ["a dog", "a cat", "a bird"], answer: "a dog" },
  ] }] };
  return { spec, doc: buildTestDoc(spec, reply, { levelId: "B_SENIOR", meta: {} }) };
}

test("a part's problems name the questions to fix; a missing text means writing the part again", () => {
  const { doc } = readingDoc();
  const s = doc.sections[0];
  assert.ok(s.problems.some((p) => p.startsWith("item 2:")), s.problems.join("; "));
  assert.deepEqual(problemTargets(s), { items: [2], whole: false });
  assert.deepEqual(problemTargets({ items: [{}, {}], problems: ["missing the reading text"] }), { items: [], whole: true });
  assert.deepEqual(problemTargets({ items: [{}, {}, {}, {}], problems: ['the answers need a mix of yes and no (items 2, 4 should be "no")'] }), { items: [2, 4], whole: false });
  assert.deepEqual(problemTargets({ items: [{}], problems: [] }), { items: [], whole: false });
});

test("the fix prompt rewrites only the named questions, with the text and the other questions as context", () => {
  const { spec, doc } = readingDoc();
  const { system, user } = fixItemsPrompt(spec, doc.sections[0], [2], { focusWords: [{ english: "park" }] });
  assert.match(system, /only the items asked for/);
  assert.match(user, /REWRITE ONLY items 2\./);
  assert.match(user, /Mia has a dog/);
  assert.match(user, /THE ITEMS NOW:/);
  assert.ok(user.includes(DISTRACTOR_RULE));
});

test("fixed questions go back into the part, and only those change", () => {
  const { spec, doc } = readingDoc();
  const before = doc.sections[0].items.map((it) => it.prompt);
  const changed = applyItemFixes(doc, spec, "r1", { items: [{ n: 2, prompt: "Where does the dog like to go?", options: ["the park", "the shop", "the school"], answer: "the park" }, { n: 3, prompt: "ignored: not asked for", options: ["x", "y"], answer: "x" }] }, [2]);
  assert.deepEqual(changed, [2]);
  const s = doc.sections[0];
  assert.equal(s.items[1].prompt, "Where does the dog like to go?");
  assert.equal(s.items[0].prompt, before[0]);
  assert.equal(s.items[2].prompt, before[2]);
  assert.ok(!s.problems.some((p) => p.startsWith("item 2:")), s.problems.join("; "));
  assert.deepEqual(applyItemFixes(doc, spec, "r1", { items: [] }, [2]), []);
  assert.deepEqual(applyItemFixes(doc, spec, "nope", { items: [{ n: 1 }] }, [1]), []);
});

/* ── Speaking cards ──────────────────────────────────────────────── */
test("speaking parts have cards for the students and a script for the teacher", () => {
  const card = { title: "My free time", student: "Talk about what you do after school.", keyWords: ["play", "swim", "read"], questions: ["What do you do after school?", "Why do you like it?"], followUps: ["Why?"], model: "I play football with my friends." };
  const s = normalizeSection({ id: "s1", task: "S-QUESTIONS", items: 1 }, { warmup: ["What's your name?"], cards: [card, { ...card, title: "My family" }] }, { levelId: "B_SENIOR" });
  assert.equal(s.cards.length, 2);
  assert.deepEqual(s.cards[0].keyWords, ["play", "swim", "read"]);
  assert.deepEqual(s.warmup, ["What's your name?"]);
  assert.ok(!s.problems.includes("missing the speaking cards"));
  const empty = normalizeSection({ id: "s2", task: "S-QUESTIONS", items: 1 }, {}, { levelId: "B_SENIOR" });
  assert.ok(empty.problems.includes("missing the speaking cards"));
  assert.equal(problemTargets(empty).whole, true);

  const spec = { ...testDefaults("B_SENIOR"), parts: [{ ...makePart("speaking", "S-ROLE", "B_SENIOR"), id: "s1" }] };
  const doc = buildTestDoc(spec, { sections: [{ id: "s1", warmup: ["How are you?"], cards: [card, { ...card, title: "At the shop" }] }] }, { levelId: "B_SENIOR", meta: {} });
  const student = renderStudentPaper(doc);
  assert.match(student, /st-speak-card/);
  assert.match(student, /Student A/);
  assert.match(student, /Student B/);
  assert.ok(!student.includes(card.model), "model answers stay in the teacher's pack");
  const teacher = renderTeacherPack(doc);
  assert.ok(teacher.includes(card.model));
  assert.match(teacher, /Warm-up/);
  assert.match(teacher, /Model dialogue/);
  assert.match(teacher, /Interaction/);
});

/* ── Editing the paper and remaking one question ─────────────────── */

test("the remake rules go first in the prompt, and the answers-only-from-the-list rule only where it belongs", () => {
  const { spec, doc } = readingDoc();
  const user = fixItemsPrompt(spec, doc.sections[0], [3], { instruction: "It is built on the word \"dog\".", focusWords: [{ english: "park" }] }).user;
  assert.ok(user.includes('FOR ITEM 3 (these rules come first):\nIt is built on the word "dog".'));
  assert.ok(!user.includes("Answers come only from these words"), "a reading question may use any word the class knows");
  const clean = { ...doc.sections[0], problems: [] };
  assert.ok(!fixItemsPrompt(spec, clean, [1], {}).user.includes("PROBLEMS:"), "no empty problems list");
  const vocabSpec = { ...testDefaults("B_SENIOR"), parts: [{ ...makePart("vocabulary", "V-BANK", "B_SENIOR"), id: "v1", items: 2 }] };
  const vdoc = buildTestDoc(vocabSpec, { sections: [{ id: "v1", items: [{ prompt: "A ____ roars.", answer: "lion" }, { prompt: "A ____ has stripes.", answer: "zebra" }] }] }, { levelId: "B_SENIOR", meta: {} });
  assert.match(fixItemsPrompt(vocabSpec, vdoc.sections[0], [1], { focusWords: [{ english: "lion" }, { english: "zebra" }] }).user, /Answers come only from these words/);
});

test("editing a part on the paper checks it again and keeps what the teacher wrote", () => {
  const { spec, doc } = readingDoc();
  const s = doc.sections[0];
  s.rubricEl = "Διάβασε προσεκτικά.";
  assert.equal(reviseSection(doc, spec, "r1", (raw) => { raw.items[1] = { prompt: "Where does it like to go?", options: ["the park", "the zoo", "school"], answer: "the park" }; }), true);
  assert.ok(!s.problems.some((p) => p.startsWith("item 2:")));
  assert.equal(s.rubricEl, "Διάβασε προσεκτικά.");
  assert.equal(reviseSection(doc, spec, "r1", () => false), false, "an editor can cancel");
  reviseSection(doc, spec, "r1", (raw) => { raw.passage = ""; });
  assert.ok(s.problems.includes("missing the reading text"));
});

test("pictures stay when a picture part is edited without the word bank's pictures", () => {
  const plan = { ...makePart("vocabulary", "V-PIC", "B_SENIOR"), id: "p1", items: 2 };
  const spec = { ...testDefaults("B_SENIOR"), parts: [plan], pictures: true };
  const picFor = (w) => ({ lion: "@w-lion", zebra: "@w-zebra" })[String(w).toLowerCase()] || null;
  const doc = buildTestDoc(spec, { sections: [{ id: "p1", items: [{ prompt: "It can roar.", answer: "lion" }, { prompt: "Black and white.", answer: "zebra" }] }] }, { levelId: "B_SENIOR", picFor, meta: {} });
  assert.equal(doc.sections[0].items[0].pic, "@w-lion");
  reviseSection(doc, spec, "p1", (raw) => { raw.items[0].prompt = "The king of animals."; });
  assert.equal(doc.sections[0].items[0].prompt, "The king of animals.");
  assert.equal(doc.sections[0].items[0].pic, "@w-lion");
  assert.ok(!doc.sections[0].problems.some((p) => /no picture/.test(p)));
});

test("unit words carry their coursebook page (for the small page tag on word chips)", () => {
  const words = unitWords("CPP2", 4, ["A"]);
  assert.ok(words.length > 0);
  assert.ok(words.every((w) => Number(w.page) > 0), "every word has a page");
});

/* ── Any class can use any book ──────────────────────────────────── */

test("a book the teacher names is never replaced by the AI's guess from the class", () => {
  const ctx = { bookId: "CPP2", unit: 1, level: "B_SENIOR" };
  const local = parseRequest("a test for B senior on Primary Paths 1 unit 3", ctx);
  assert.equal(local.source.bookId, "CPP1");
  const merged = mergeAiPlan(local, { source: { kind: "unit", bookId: "CPP2", units: [3] }, levelId: "B_SENIOR" });
  assert.equal(merged.source.bookId, "CPP1");
  assert.deepEqual(merged.source.units, [3]);
  assert.equal(completeAssistantPlan(merged, ctx).levelId, "B_SENIOR");
  // No book named: the AI may fill it in.
  assert.equal(mergeAiPlan({}, { source: { kind: "unit", bookId: "CPP3", units: [2] } }).source.bookId, "CPP3");
  // No class named: the class open in the app, not the book's usual class.
  assert.equal(completeAssistantPlan(parseRequest("a test on Primary Path 1 unit 2", ctx), ctx).levelId, "B_SENIOR");
  assert.equal(completeAssistantPlan(parseRequest("a test on Primary Path 1 unit 2", {}), {}).levelId, "A_SENIOR");
});

test("the unit context tells the AI to write for the class, not for the book's usual class", async () => {
  const ctx = await buildUnitContext({ bookId: "CPP1", units: [3] }, { loadLesson: async () => null });
  assert.match(unitContextPrompt(ctx), /^BOOK: Cambridge Primary Paths 1 \(any class may use this book/);
});
