/* A change on the paper reaches the teacher's pack at once, and only that change: the questions it didn't touch keep
 * their options and letters (so a paper already printed still fits a pack printed later), the teacher's own option
 * order stays, and version B keeps its order for everything the edit left alone. */
import test from "node:test";
import assert from "node:assert/strict";
import { testDefaults, makePart, buildTestDoc, reviseSection } from "../desktop/renderer/studio/test-builder.js";
import { makeVersionB, answerKeyRows, LETTERS } from "../desktop/renderer/studio/doc-model.js";
import { renderTeacherPack } from "../desktop/renderer/studio/doc-render.js";
import { TASKS } from "../desktop/renderer/studio/tasks.js";

const level = "B_SENIOR";
const make = (task, raw) => {
  const part = { ...makePart(TASKS[task].skill, task, level), id: "p1", items: raw.items.length };
  const spec = { ...testDefaults(level), parts: [part], versions: 2 };
  return { spec, doc: buildTestDoc(spec, { sections: [{ id: "p1", ...raw }] }, { levelId: level, meta: {} }) };
};
const choice = () => make("V-MC", { items: Array.from({ length: 8 }, (_, i) => ({ prompt: `Sentence ${i} has a ________.`, options: [`a${i}`, `b${i}`, `c${i}`], answer: `a${i}` })) });
const shape = (s) => s.items.map((it) => `${it.prompt}|${it.options.join("/")}|${it.answerIndex}`);
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("editing one question leaves the other questions' options where they were", () => {
  const { spec, doc } = choice();
  const before = shape(doc.sections[0]);
  for (let r = 0; r < 5; r++) reviseSection(doc, spec, "p1", () => {}, {});
  assert.deepEqual(shape(doc.sections[0]), before, "a re-check moves nothing");
  reviseSection(doc, spec, "p1", (raw) => { raw.items[2] = { prompt: "A new ________.", options: ["x", "y", "z"], answer: "z", ownOrder: true }; }, {});
  const after = shape(doc.sections[0]);
  before.forEach((b, i) => { if (i !== 2) assert.equal(after[i], b, `question ${i + 1} unchanged`); });
  assert.equal(after[2], "A new ________.|x/y/z|2", "the teacher's own order stays");
  assert.match(text(renderTeacherPack(doc)), /3 c\) z/, "the pack has the new answer at once");
});

test("the pack's letter is the paper's letter for every question after edits", () => {
  const { spec, doc } = choice();
  reviseSection(doc, spec, "p1", (raw) => { raw.items[0].answer = raw.items[0].options[1]; }, {});
  reviseSection(doc, spec, "p1", (raw) => { raw.items.push({ prompt: "One more ________.", options: ["p", "q", "r"], answer: "q" }); }, {});
  const s = doc.sections[0];
  answerKeyRows(s).forEach((r, i) => assert.equal(r.text, `${LETTERS[s.items[i].answerIndex]}) ${s.items[i].options[s.items[i].answerIndex]}`));
  assert.equal(s.items[0].answer, s.items[0].options[s.items[0].answerIndex]);
});

test("a matching part keeps its letters when one pair changes", () => {
  const { spec, doc } = make("V-MATCH", { items: ["dog", "cat", "bird", "fish", "cow"].map((w) => ({ prompt: w, answer: `the meaning of ${w}` })) });
  const s = doc.sections[0];
  const letters = Object.fromEntries(s.items.map((it) => [it.prompt, it.letter]));
  reviseSection(doc, spec, "p1", (raw) => { raw.items[1] = { prompt: "cat", answer: "a pet that says meow" }; }, {});
  s.items.forEach((it) => { if (it.prompt !== "cat") assert.equal(it.letter, letters[it.prompt], `${it.prompt} keeps its letter`); });
  const cat = s.items.find((it) => it.prompt === "cat");
  assert.equal(s.bank.find((b) => b.letter === cat.letter)?.text, "a pet that says meow");
  assert.match(text(renderTeacherPack(doc)), new RegExp(`${cat.letter} — a pet that says meow`));
});

test("version B follows an edit and keeps the rest of its order", () => {
  const { spec, doc } = choice();
  const b1 = makeVersionB(doc);
  reviseSection(doc, spec, "p1", (raw) => { raw.items[4] = { prompt: "Changed ________.", options: ["m", "n", "o"], answer: "n", ownOrder: true }; }, {});
  const b2 = makeVersionB(doc, Math.random, b1);
  const was = new Map(b1.sections[0].items.map((it, i) => [it.prompt, { i, opts: it.options.join("/") }]));
  const moved = b2.sections[0].items.filter((it) => was.has(it.prompt));
  assert.equal(moved.length, 7);
  moved.forEach((it) => assert.equal(it.options.join("/"), was.get(it.prompt).opts, `${it.prompt} keeps its options in B`));
  const order = moved.map((it) => was.get(it.prompt).i);
  assert.deepEqual(order, [...order].sort((x, y) => x - y), "the untouched questions keep their order in B");
  const changed = b2.sections[0].items.find((it) => it.prompt === "Changed ________.");
  assert.equal(changed.options[changed.answerIndex], "n");
  assert.match(text(renderTeacherPack(b2)), new RegExp(`${changed.n} ${LETTERS[changed.answerIndex]}\\) n`), "B's pack has the edit");
});

test("version B of picture questions without prompts is still mixed", () => {
  const { doc } = make("V-MC", { items: Array.from({ length: 6 }, (_, i) => ({ prompt: "", options: [`a${i}`, `b${i}`, `c${i}`], answer: `a${i}` })) });
  const b = makeVersionB(doc, Math.random, makeVersionB(doc));
  assert.equal(b.sections[0].items.length, 6);
});

test("in version B a question whose answer changed keeps its place, and B's pack has the new answer", () => {
  const { spec, doc } = choice();
  const b1 = makeVersionB(doc);
  const at = b1.sections[0].items.findIndex((it) => it.prompt === "Sentence 3 has a ________.");
  reviseSection(doc, spec, "p1", (raw) => { raw.items[3] = { prompt: "Sentence 3 has a ________.", options: ["lion", "a3", "b3"], answer: "lion", ownOrder: true }; }, {});
  const b2 = makeVersionB(doc, Math.random, b1);
  assert.deepEqual(b2.sections[0].items.map((it) => it.prompt), b1.sections[0].items.map((it) => it.prompt), "B's order is the same");
  const it = b2.sections[0].items[at];
  assert.equal(it.options[it.answerIndex], "lion");
  assert.match(text(renderTeacherPack(b2)), new RegExp(`${at + 1} ${LETTERS[it.answerIndex]}\\) lion`));
});
