/* Letter help with blanks ("b _ _ _ _ _") is the writing space itself: never a second line after it. */
import test from "node:test";
import assert from "node:assert/strict";
import { buildStudioDocx } from "../desktop/renderer/app.js";
import { normalizeSection } from "../desktop/renderer/studio/doc-model.js";
import { renderStudentPaper } from "../desktop/renderer/studio/doc-render.js";
import { makePart } from "../desktop/renderer/studio/test-builder.js";

const part = (task, hint, raw) => normalizeSection({ ...makePart("vocabulary", task, "B_SENIOR"), items: raw.items.length, opts: { hint, family: hint } }, raw, { levelId: "B_SENIOR" });
const doc = (s) => ({ meta: { title: "T" }, sections: [s] });
const rows = (html) => html.match(/<div class="ex-item st-item[^"]*">.*?<\/div><\/div>/g) || [];

test("a description with a first-letter box has no line after the box; the example is written in the box", () => {
  const s = part("V-DEF", "first", { example: { prompt: "You carry fruit in this.", answer: "basket" }, items: [{ prompt: "You go here to buy things.", answer: "shop" }, { prompt: "Birds do this before their young hatch.", answer: "lay eggs" }] });
  const html = renderStudentPaper(doc(s));
  const [ex, one] = rows(html);
  assert.ok(one.includes('<span class="st-hint st-hint-write">s _ _ _</span>'));
  assert.ok(!one.includes("st-line"), "no extra writing line");
  assert.ok(ex.includes("st-hint-done") && ex.includes(">basket<") && !ex.includes("b _ _"));
});

test("a letter count box works the same way, and keeps saying how many letters", () => {
  const s = part("V-DEF", "count", { example: { prompt: "You carry fruit in this.", answer: "basket" }, items: [{ prompt: "You go here to buy things.", answer: "shop" }] });
  const [ex, one] = rows(renderStudentPaper(doc(s)));
  assert.ok(!one.includes("st-line") && one.includes("(4 letters)"));
  assert.ok(ex.includes("(6 letters)"));
});

test("a sentence with a gap and letter help: the box sits in the gap (one place to write)", () => {
  const s = part("V-FORM", "root", { items: [{ prompt: "It is a ________ day. (SUN)", answer: "sunny" }] });
  const one = rows(renderStudentPaper(doc(s)))[0];
  assert.ok(one.includes("It is a <span class=\"st-hint st-hint-write\">s u n _ _</span> day."), one);
  assert.ok(!one.includes("st-line"));
});

test("mixed-up letters are not a writing space: the line stays", () => {
  const s = part("V-SPELL", "", { items: [{ prompt: "An animal that barks.", answer: "dog" }] });
  assert.ok(rows(renderStudentPaper(doc(s)))[0].includes("st-line"));
});

test("Word export still builds with letter boxes", async () => {
  const s = part("V-DEF", "first", { example: { prompt: "You carry fruit in this.", answer: "basket" }, items: [{ prompt: "You go here to buy things.", answer: "shop" }] });
  const f = part("V-FORM", "root", { items: [{ prompt: "It is a ________ day. (SUN)", answer: "sunny" }] });
  assert.ok((await buildStudioDocx({ doc: { meta: { title: "T" }, sections: [s, f] }, which: "student" })).size > 1000);
});
