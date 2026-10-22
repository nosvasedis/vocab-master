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

/* ── The teacher's choice: more help levels, and letters chosen per question ── */
import { revealFor, revealHint, cleanReveal, letterHint } from "../desktop/renderer/studio/doc-model.js";
import { buildTestDoc, reviseSection, applyItemFixes, testDefaults } from "../desktop/renderer/studio/test-builder.js";

test("help levels: first two, first + last, some letters spread out — always a letter left to write", () => {
  assert.equal(letterHint("basket", "first2"), "b a _ _ _ _");
  assert.equal(letterHint("basket", "firstlast"), "b _ _ _ _ t");
  assert.equal(letterHint("basket", "some"), "b _ _ k _ _");
  assert.equal(letterHint("lay eggs", "firstlast"), "l _ _   _ _ _ s");
  assert.equal(letterHint("ice-cream", "count"), "_ _ _ - _ _ _ _ _ (8 letters)");
  // "some" never shows two letters side by side.
  for (const w of ["production", "description", "insect", "go", "upside down"]) {
    const s = revealFor(w, "some");
    assert.ok(s.every((p, k) => k === 0 || p - s[k - 1] > 1), w);
  }
  // Short words keep one letter to write.
  assert.deepEqual(revealFor("go", "firstlast"), [0]);
  assert.deepEqual(revealFor("go", "first2"), [0]);
});

test("a question's own letters: any letters, kept only while they fit the answer", () => {
  assert.equal(revealHint("creature", [0, 3, 6]), "c _ _ a _ _ r _");
  assert.equal(revealHint("upside down", [0, 7]), "u _ _ _ _ _   d _ _ _");
  assert.deepEqual(cleanReveal([6, 0, 3, 3, 99], "creature"), [0, 3, 6]);
  assert.equal(cleanReveal([0, 1, 2], "cat"), undefined, "all letters shown is not help");
  assert.equal(cleanReveal("none", "cat"), "none");
  assert.equal(cleanReveal(undefined, "cat"), undefined);
});

const helpDoc = () => {
  const spec = { ...testDefaults("B_SENIOR", "standard"), parts: [{ id: "p1", skill: "vocabulary", task: "V-DEF", items: 3, pointsEach: 1, opts: { hint: "first" } }] };
  const reply = { sections: [{ id: "p1", example: { prompt: "You carry fruit in this.", answer: "basket" }, items: [
    { prompt: "You go here to buy things.", answer: "shop" }, { prompt: "A small animal with six legs.", answer: "insect" }, { prompt: "You make something new.", answer: "create" }] }] };
  return { spec, doc: buildTestDoc(spec, reply, { levelId: "B_SENIOR" }) };
};

test("one question's help beats the part's, and survives the part being checked again", () => {
  const { spec, doc } = helpDoc();
  reviseSection(doc, spec, "p1", (raw) => { raw.items[1].reveal = [0, 3]; raw.items[2].reveal = "none"; }, {});
  let s = doc.sections[0];
  assert.equal(s.items[0].hint, "s _ _ _");
  assert.equal(s.items[1].hint, "i _ _ e _ _");
  assert.equal(s.items[2].hint, undefined);
  // The part's setting changes (Step 3): only questions without their own help follow.
  spec.parts[0].opts.hint = "firstlast";
  reviseSection(doc, spec, "p1", () => {}, {});
  s = doc.sections[0];
  assert.deepEqual([s.items[0].hint, s.items[1].hint, s.items[2].hint], ["s _ _ p", "i _ _ e _ _", undefined]);
  // On paper: own letters in boxes, "none" → a plain line.
  const rows = renderStudentPaper(doc).match(/<div class="ex-item st-item[^"]*">.*?<\/div><\/div>/g);
  assert.equal(given(rows[2]), 2);
  assert.ok(rows[3].includes("st-line") && !rows[3].includes("st-cells"));
});

test("Lingo rewriting a question keeps its help only while the answer stays", () => {
  const { spec, doc } = helpDoc();
  reviseSection(doc, spec, "p1", (raw) => { raw.items[0].reveal = [0, 2]; raw.items[1].reveal = [0, 3]; }, {});
  applyItemFixes(doc, spec, "p1", { items: [{ n: 1, prompt: "You buy food here.", answer: "shop" }, { n: 2, prompt: "It buzzes.", answer: "bee" }] }, [1, 2], {});
  const s = doc.sections[0];
  assert.deepEqual(s.items[0].reveal, [0, 2]);
  assert.equal(s.items[1].reveal, undefined);
  assert.equal(s.items[1].hint, "b _ _");
});

/* ── Look and tick or cross: the key comes from the picture and the word ── */
import { sameThing } from "../desktop/renderer/studio/doc-model.js";

test("tick or cross: yes only when the word is the picture's thing, whatever the writer keyed", () => {
  assert.ok(sameThing("dog", "a dog") && sameThing("dog", "dogs") && sameThing("box", "boxes") && sameThing("berry", "berries"));
  assert.ok(!sameThing("beehive", "happen") && !sameThing("cat", "a dog"));
  const pics = { beehive: "@w-beehive", dog: "@w-dog", cat: "@w-cat" };
  const picFor = (w) => pics[String(w).toLowerCase()] || "";
  const s = normalizeSection({ ...makePart("vocabulary", "V-TICK", "A_SENIOR"), items: 3 }, { items: [
    { picture: "beehive", prompt: "happen", answer: "yes" }, // keyed yes, but the word isn't the picture
    { picture: "dog", prompt: "a dog", answer: "no" },        // keyed no, but it is the picture
    { picture: "cat", prompt: "a dog", answer: "no" }] }, { levelId: "A_SENIOR", picFor });
  assert.deepEqual(s.items.map((it) => it.answer.toLowerCase()), ["no", "yes", "no"]);
  // "happen" can't be under a picture: flagged for Lingo to fix.
  assert.ok(s.problems.some((p) => /item 1: .*"happen".*thing/.test(p)), s.problems.join(" | "));
  assert.ok(!s.problems.some((p) => /item 3: .*thing/.test(p)));
});

test("tick or cross: a test saved with a wrong key is put right when it opens", async () => {
  const { relabelDoc } = await import("../desktop/renderer/studio/doc-model.js");
  const doc = { meta: { classProfile: "A_SENIOR" }, sections: [{ task: "V-TICK", answerType: "tf", items: [
    { n: 1, prompt: "happen", picWord: "beehive", tf: 0, answer: "yes" }, { n: 2, prompt: "a dog", picWord: "dog", tf: 1, answer: "no" }] }] };
  relabelDoc(doc);
  assert.deepEqual(doc.sections[0].items.map((it) => [it.tf, it.answer.toLowerCase()]), [[1, "no"], [0, "yes"]]);
});
