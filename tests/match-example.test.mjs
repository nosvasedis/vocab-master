/* A matching part's list follows the example switch: shown, the example's meaning is one of the list (selected, dark);
 * hidden, the list has no extra line and its letters run on from A over the rest. The teacher's key uses the same
 * letters, on the paper and in Word. */
import test from "node:test";
import assert from "node:assert/strict";
import { testDefaults, makePart, buildTestDoc } from "../desktop/renderer/studio/test-builder.js";
import { renderStudentPaper, renderTeacherPack } from "../desktop/renderer/studio/doc-render.js";
import { matchList, answerKeyRows } from "../desktop/renderer/studio/doc-model.js";
import { buildStudioDocx } from "../desktop/renderer/app.js";

const PAIRS = [["crop", "A plant grown on a farm for food."], ["hoof", "The hard foot of an animal."], ["colony", "A group of animals living together."]];
const EXAMPLE = { prompt: "bee", answer: "A home where bees live." };

const matchDoc = (layout = {}) => {
  const part = { ...makePart("vocabulary", "V-MATCH", "B_SENIOR"), id: "p1", items: PAIRS.length };
  const spec = { ...testDefaults("B_SENIOR"), parts: [part] };
  const doc = buildTestDoc(spec, { sections: [{ id: "p1", passage: "", example: EXAMPLE, items: PAIRS.map(([prompt, answer]) => ({ prompt, answer })) }] }, { levelId: "B_SENIOR", meta: {} });
  doc.meta.layout = layout;
  return doc;
};

/** The meanings as the paper prints them: text → letter. */
const paperLetters = (html) => new Map([...html.matchAll(/<p class="match-def-line[^"]*"><b>([A-Z])<\/b><span>([^<]*)<\/span>/g)].map((m) => [m[2], m[1].toLowerCase()]));

test("the example's meaning is in the list only while the example is printed", () => {
  const hidden = matchDoc({ examples: false });
  const { defs } = matchList(hidden.sections[0], hidden.meta.layout);
  assert.equal(defs.length, PAIRS.length, "one meaning for each word, no extra one");
  assert.deepEqual(defs.map((d) => d.letter), ["a", "b", "c"].slice(0, PAIRS.length));
  const html = renderStudentPaper(hidden);
  assert.equal((html.match(/class="match-def-line/g) || []).length, PAIRS.length);
  assert.doesNotMatch(html, /A home where bees live\./);
  assert.doesNotMatch(html, /st-ex-ans/, "no example letter either");

  const shown = matchDoc({ examples: true });
  const m = matchList(shown.sections[0], shown.meta.layout);
  assert.equal(m.defs.length, PAIRS.length + 1);
  assert.equal(m.selected, EXAMPLE.answer);
  const shownHtml = renderStudentPaper(shown);
  assert.equal((shownHtml.match(/class="match-def-line/g) || []).length, PAIRS.length + 1);
  assert.match(shownHtml, /class="match-def-line picked"><b>[A-Z]<\/b><span>A home where bees live\.<\/span>/, "the example's meaning is selected");
  assert.match(shownHtml, /<span class="st-ex-ans picked">[A-Z]<\/span>/, "and its letter in the example line");
});

test("the letters on the paper, in the key and in the list agree, hidden or shown", () => {
  for (const layout of [{ examples: false }, { examples: true }]) {
    const doc = matchDoc(layout);
    const letters = paperLetters(renderStudentPaper(doc));
    assert.equal(letters.size, (layout.examples ? PAIRS.length + 1 : PAIRS.length), "every meaning on the paper has a letter");
    const key = answerKeyRows(doc.sections[0], doc.meta.layout);
    const teacher = renderTeacherPack(doc);
    PAIRS.forEach(([, answer], i) => {
      const letter = letters.get(answer);
      assert.ok(letter, `${answer} is listed`);
      assert.equal(key[i].text, `${letter} — ${answer}`, "the key's letter is the list's letter");
      assert.ok(teacher.includes(`${letter} — ${answer}`), "the teacher's pack prints the same letter");
    });
    if (layout.examples) assert.ok(letters.get(EXAMPLE.answer), "the example's meaning has a letter too");
    else assert.equal(letters.has(EXAMPLE.answer), false);
  }
});

test("the stored letters are not changed by hiding the example", () => {
  const doc = matchDoc({ examples: true });
  const before = JSON.stringify(doc.sections[0].bank);
  doc.meta.layout = { examples: false };
  renderStudentPaper(doc);
  assert.equal(JSON.stringify(doc.sections[0].bank), before, "the doc keeps its meanings; only the paper changes");
});

test("Word follows the same list, hidden or shown", async () => {
  const hidden = await buildStudioDocx({ doc: matchDoc({ examples: false }), which: "student" });
  const shown = await buildStudioDocx({ doc: matchDoc({ examples: true }), which: "student" });
  assert.ok(hidden.size < shown.size, "the extra meaning (and the example) only in the shown paper");
});
