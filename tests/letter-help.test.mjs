/* Letter help ("b _ _ _ _ _", "s u n _ _") is the writing space itself, drawn as letter boxes: never a second line. */
import test from "node:test";
import assert from "node:assert/strict";
import { buildStudioDocx } from "../desktop/renderer/app.js";
import { normalizeSection, familyHint } from "../desktop/renderer/studio/doc-model.js";
import { renderStudentPaper } from "../desktop/renderer/studio/doc-render.js";
import { makePart } from "../desktop/renderer/studio/test-builder.js";

const part = (task, hint, raw) => normalizeSection({ ...makePart("vocabulary", task, "B_SENIOR"), items: raw.items.length, opts: { hint, family: hint } }, raw, { levelId: "B_SENIOR" });
const doc = (s) => ({ meta: { title: "T" }, sections: [s] });
const rows = (html) => html.match(/<div class="ex-item st-item[^"]*">.*?<\/div><\/div>/g) || [];
const empty = (html) => (html.match(/class="st-cell"/g) || []).length;
const given = (html) => (html.match(/class="st-cell given"/g) || []).length;

test("a description with first-letter help: letter boxes, no line after them; the example fills its boxes", () => {
  const s = part("V-DEF", "first", { example: { prompt: "You carry fruit in this.", answer: "basket" }, items: [{ prompt: "You go here to buy things.", answer: "shop" }, { prompt: "Birds do this before their young hatch.", answer: "lay eggs" }] });
  const html = renderStudentPaper(doc(s));
  const [ex, one, two] = rows(html);
  assert.ok(one.includes('<span class="st-cells"><span class="st-cword"><span class="st-cell given">s</span><span class="st-cell"></span><span class="st-cell"></span><span class="st-cell"></span></span></span>'), one);
  assert.ok(!one.includes("st-line") && !one.includes("_"), "no extra line, no underscores");
  assert.ok(ex.includes("st-cells done") && ex.includes(">k<") && given(ex) + empty(ex) === 6);
  // Two words: two groups of boxes.
  assert.equal((two.match(/st-cword/g) || []).length, 2);
});

test("a letter count gives one empty box per letter (the boxes say how many)", () => {
  const s = part("V-DEF", "count", { example: { prompt: "You carry fruit in this.", answer: "basket" }, items: [{ prompt: "You go here to buy things.", answer: "shop" }] });
  const [ex, one] = rows(renderStudentPaper(doc(s)));
  assert.ok(!one.includes("st-line") && empty(one) === 4 && !one.includes("letters"));
  assert.equal(empty(ex), 6);
});

test("a sentence with a gap and letter help: the boxes sit in the gap (one place to write)", () => {
  const s = part("V-FORM", "root", { items: [{ prompt: "It is a ________ day. (SUN)", answer: "sunny" }] });
  const one = rows(renderStudentPaper(doc(s)))[0];
  assert.ok(/It is a <span class="st-cells">.*?<\/span> day\./.test(one), one);
  assert.equal(given(one), 3);
  assert.ok(!one.includes("st-line"));
});

test("mixed-up letters are not a writing space: the line stays", () => {
  const s = part("V-SPELL", "", { items: [{ prompt: "An animal that barks.", answer: "dog" }] });
  assert.ok(rows(renderStudentPaper(doc(s)))[0].includes("st-line"));
});

test("word families: the root shows the same way for every form, also when the spelling changes", () => {
  const h = (base, answer) => familyHint(`A ________ day. (${base})`, answer, "root");
  assert.equal(h("AMAZE", "amazing"), "a m a z _ _ _");
  assert.equal(h("AMAZE", "amazed"), "a m a z e _");
  assert.equal(h("PRODUCE", "production"), "p r o d u c _ _ _ _");
  assert.equal(h("DESCRIBE", "description"), "d e s c r i _ _ _ _ _");
  assert.equal(h("CREATE", "creature"), "c r e a t _ _ _");
  assert.equal(h("HAPPY", "unhappy"), "_ _ h a p p y");
  assert.equal(h("DIRT", "dirty"), "d i r t _");
  // The root is not inside the answer, or would give all of it away: the first letter only.
  assert.equal(h("BREATHE", "breath"), "b _ _ _ _ _");
  assert.equal(h("CREATURE", "create"), "c _ _ _ _ _");
});

test("an answer that is just the word in capitals is flagged", () => {
  const s = part("V-FORM", "root", { items: [{ prompt: "We need ________ for the trip. (WATER)", answer: "water" }] });
  assert.ok(s.problems.some((p) => /the word in capitals itself/.test(p)));
});

test("Word export still builds with letter help", async () => {
  const s = part("V-DEF", "first", { example: { prompt: "You carry fruit in this.", answer: "basket" }, items: [{ prompt: "You go here to buy things.", answer: "shop" }] });
  const f = part("V-FORM", "root", { items: [{ prompt: "It is a ________ day. (SUN)", answer: "sunny" }] });
  assert.ok((await buildStudioDocx({ doc: { meta: { title: "T" }, sections: [s, f] }, which: "student" })).size > 1000);
});
