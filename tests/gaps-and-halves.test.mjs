/* Gaps the teacher shapes (length, labels, the editors' gap tool), sentences about you with labelled gaps (W-FRAME),
 * a writing line only where a starter is open (W-SENT), and two-column beginnings and endings (V-HALVES). */
import test from "node:test";
import assert from "node:assert/strict";
import { buildStudioDocx } from "../desktop/renderer/app.js";
import { TASKS, KNOBS, PAPER_KNOBS, partOpts } from "../desktop/renderer/studio/tasks.js";
import { gapsHtml, gapsText, gapSize } from "../desktop/renderer/studio/paper-parts.js";
import { normalizeSection, starterHasLine, sectionRubric, answerKeyRows } from "../desktop/renderer/studio/doc-model.js";
import { renderStudentPaper, renderTeacherPack } from "../desktop/renderer/studio/doc-render.js";
import { makePart, testPrompt, testDefaults } from "../desktop/renderer/studio/test-builder.js";
import { gapAt, insertGap, resizeGap, removeGap, labelGap } from "../desktop/renderer/js/gap-tool.js";

const paper = (section) => renderStudentPaper({ meta: { title: "T" }, sections: [section] });

test("a gap prints as long as it was typed, or as long as the part says", () => {
  assert.equal(gapSize(3), "short");
  assert.equal(gapSize(8), "standard");
  assert.equal(gapSize(14), "long");
  assert.equal(gapSize(22), "xlong");
  assert.equal(gapSize(4, "long"), "long", "the part's length wins");
  const html = gapsHtml("I am ____ and ________ and ______________.");
  assert.deepEqual(html.match(/st-line inline[^"]*/g), ["st-line inline gap-short", "st-line inline", "st-line inline gap-long"]);
  assert.equal((gapsHtml("a ____ b ______________", { size: "xlong" }).match(/gap-xlong/g) || []).length, 2);
  // Labels: as written, small under the line, or left out.
  assert.match(gapsHtml("________ (name) is here."), /<\/span> \(name\) is here\./);
  assert.match(gapsHtml("________ (name) is here.", { cues: "under" }), /<span class="st-gap">.*<small class="st-gap-cue">name<\/small><\/span> is here\./);
  assert.equal(gapsHtml("________ (name) is here.", { cues: "off" }).includes("name"), false);
  // Word files: underscores of the printed length, the label after the gap.
  assert.equal(gapsText("I am ________ (number)."), `I am ${"_".repeat(12)} (number).`);
  assert.equal(gapsText("I am ____."), `I am ${"_".repeat(6)}.`);
});

test("the gap tool: put in, resize, label and take out a gap", () => {
  let r = insertGap("is my", 0, 0, "standard");
  assert.equal(r.value, "________ is my");
  r = labelGap(r.value, { end: r.caret });
  assert.equal(r.value, "________ () is my");
  assert.equal(r.caret, 10, "the cursor is inside the brackets");
  assert.deepEqual(gapAt("I am ________ old", 7), { start: 5, end: 13 });
  assert.equal(gapAt("I am old", 3), null);
  assert.equal(resizeGap("I am ________ old", { start: 5, end: 13 }, "long").value, `I am ${"_".repeat(14)} old`);
  assert.equal(removeGap("I am ________ (number) years old.", { start: 5, end: 13 }).value, "I am years old.");
  assert.equal(insertGap("My name is.", 10, 10).value, "My name is ________.");
  // A label that is there is selected, not doubled.
  assert.equal(labelGap("________ (name) is", { end: 8 }).value, "________ (name) is");
});

test("finish the sentences: a writing line after open starters only, or as the part says", () => {
  assert.equal(starterHasLine("My best friend is…"), true);
  assert.equal(starterHasLine("________ (name) is my ________ (family member)."), false);
  assert.equal(starterHasLine("________ (name) is my ________ (family member).", "always"), true);
  assert.equal(starterHasLine("My best friend is…", "never"), false);
  const s = normalizeSection(makePart("writing", "W-SENT", "A_SENIOR"), { frame: ["____ (name) is my ______ (family member).", "After school, I…"] }, { levelId: "A_SENIOR" });
  const html = paper(s);
  const starters = html.match(/<p class="st-starter">.*?<\/p>/g);
  assert.equal((starters[0].match(/st-line grow/g) || []).length, 0, "the frame sentence is written in its gaps");
  assert.equal((starters[1].match(/st-line grow/g) || []).length, 1);
  assert.match(starters[0], /st-gap-cue">name</);
  assert.ok(!html.includes("___"));
  assert.ok(TASKS["W-SENT"].knobs.includes("line") && TASKS["W-SENT"].knobs.includes("gaps"));
});

test("complete the sentences about you: labelled gaps, a model answer, problems for missing gaps or labels", async () => {
  assert.ok(TASKS["W-FRAME"] && TASKS["W-FRAME"].skill === "writing");
  for (const k of TASKS["W-FRAME"].knobs) assert.ok(KNOBS[k], k);
  const plan = makePart("writing", "W-FRAME", "A_SENIOR");
  assert.equal(partOpts(plan, "A_SENIOR").frameGaps, 1);
  const s = normalizeSection(plan, { prompt: "About my family", frame: ["________ (name) is my ________ (family member).", "I am ________ years old.", "My mum is a doctor."], sample: "Eva is my mother.\nI am 8 years old.", bank: ["mother", "father"] }, { levelId: "A_SENIOR" });
  assert.ok(s.problems.some((p) => /sentence 2: every gap needs its label/.test(p)));
  assert.ok(s.problems.some((p) => /sentence 3 has no gap/.test(p)));
  assert.equal(s.problems.some((p) => /sentence 1/.test(p)), false);
  assert.deepEqual(s.bank, ["mother", "father"], "a word box with lots of help (A Senior)");
  const html = paper(s);
  assert.equal((html.match(/st-gap-cue/g) || []).length, 2);
  assert.match(html, /st-frame-sent/);
  assert.equal((html.match(/st-line grow/g) || []).length, 0);
  assert.match(renderTeacherPack({ meta: { title: "T" }, sections: [s] }), /Eva is my mother\./);
  // Labels off: the gaps only.
  const off = normalizeSection({ ...plan, opts: { cues: "off", box: "off" } }, { frame: ["I am ________ years old."], bank: ["x"] }, { levelId: "B_SENIOR" });
  assert.equal(off.problems.length, 0, "no labels needed");
  assert.deepEqual(off.bank, []);
  assert.equal(paper(off).includes("st-gap-cue"), false);
  // The prompt says how many gaps, the labels and the word box.
  const spec = { ...testDefaults("B_SENIOR"), parts: [{ ...makePart("writing", "W-FRAME", "B_SENIOR"), opts: { frameGaps: 2, box: "on" } }] };
  const { user } = testPrompt(spec, { focusWords: [{ english: "mother" }] });
  assert.match(user, /TWO gaps in each sentence/);
  assert.match(user, /Word box: "bank" = 6–8 unit words/);
  assert.match(user, /label in brackets/);
  // Word file.
  for (const which of ["student", "teacher"]) assert.ok((await buildStudioDocx({ doc: { meta: { title: "T" }, sections: [s] }, which })).size > 2000, which);
});

const halves = (opts = {}, extras = ["the cake"]) => normalizeSection({ ...makePart("vocabulary", "V-HALVES", "C_SENIOR"), items: 3, opts }, {
  example: { prompt: "the alarm clock", answer: "rings" },
  items: [{ prompt: "brush", answer: "your teeth" }, { prompt: "the dog", answer: "barks" }, { prompt: "catch", answer: "the bus" }],
  extras,
}, { levelId: "C_SENIOR" });

test("beginnings and endings: two columns, lettered endings with the extra ones, letters or lines", async () => {
  const t = TASKS["V-HALVES"];
  assert.equal(t.answer, "match");
  for (const k of t.knobs) assert.ok(KNOBS[k], k);
  assert.ok(PAPER_KNOBS.includes("link"));
  const s = halves({ ends: 1, link: "letter" });
  assert.deepEqual(s.problems, []);
  assert.equal(s.bank.length, 5, "4 endings (with the example's) + 1 extra");
  const html = paper(s);
  assert.match(html, /class="st-halves by-letter"/);
  assert.equal((html.match(/st-half-text/g) || []).length, 4, "the example and three beginnings");
  assert.equal((html.match(/st-half-end/g) || []).length, 5);
  assert.equal(html.includes("st-half-link"), false, "no line to draw by letter");
  assert.match(sectionRubric(s).en, /Write the letter/);
  // Lines: dots and the example's line; the instruction says so.
  const l = halves({ ends: 1, link: "line" });
  const lh = paper(l);
  assert.match(lh, /by-line/);
  assert.match(lh, /<svg class="st-half-link"/);
  assert.match(sectionRubric(l).en, /Draw lines\./);
  assert.match(sectionRubric(l).el, /Ένωσε με γραμμές/);
  // Missing extras are a problem; the key gives letters.
  assert.ok(halves({ ends: 2 }).problems.some((p) => /needs 2 extra endings/.test(p)));
  const key = answerKeyRows(s);
  assert.equal(key.length, 3);
  assert.ok(key.every((r) => /^[a-e] — /i.test(r.text)), "letter and ending");
  // The prompt asks for the kind of phrase and the extra endings.
  const spec = { ...testDefaults("C_SENIOR"), parts: [{ ...makePart("vocabulary", "V-HALVES", "C_SENIOR"), opts: { pairing: "does", ends: 2 } }] };
  const { user } = testPrompt(spec, { focusWords: [{ english: "alarm clock" }] });
  assert.match(user, /a THING or animal \+ what it does/);
  assert.match(user, /EXACTLY 2 extra endings/);
  for (const which of ["student", "teacher"]) assert.ok((await buildStudioDocx({ doc: { meta: { title: "T" }, sections: [l] }, which })).size > 2000, which);
});
