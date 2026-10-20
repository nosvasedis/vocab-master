/* Test Maker: a part gets exactly the questions the teacher asked for — the prompt asks for a script or text
 * long enough, nothing in a task's brief caps the number, old documents get their letters back, and deleting
 * a question renumbers the part, re-letters it, shrinks the word box and the points. */
import test from "node:test";
import assert from "node:assert/strict";
import { TASKS } from "../desktop/renderer/studio/tasks.js";
import { testDefaults, makePart, testPrompt, buildTestDoc, reviseSection, partTextWords, textWords, scriptLines, planNotes, fixItemsPrompt, applyItemFixes } from "../desktop/renderer/studio/test-builder.js";
import { relabelDoc, docPoints } from "../desktop/renderer/studio/doc-model.js";
import { renderStudentPaper } from "../desktop/renderer/studio/doc-render.js";
import { READING_TEXTS } from "../desktop/renderer/studio/reading-texts.js";

const specWith = (task, items, levelId = "B_SENIOR", opts = {}) => {
  const t = TASKS[task];
  const part = { ...makePart(t.skill, task, levelId), id: "p1", items, opts };
  return { ...testDefaults(levelId), parts: [part], source: { kind: "unit" } };
};

test("no task brief fixes a number of people, turns or questions that could undercut the item count", () => {
  for (const [id, t] of Object.entries(TASKS)) {
    if (t.answer === "open") continue;
    assert.doesNotMatch(t.ai || "", /\(\d+\s*[–-]\s*\d+ turns\)|talk about \d+\s*[–-]\s*\d+ different/i, id);
  }
});

test("a listening part asks for a script long enough for every question", () => {
  for (const task of ["L-PIC", "L-MATCH", "L-MC", "L-YN", "L-GAP", "L-NOTES"]) {
    const spec = specWith(task, 8);
    const { user } = testPrompt(spec, { focusWords: [], pictureWords: ["apple", "pear"] });
    assert.match(user, /Items: exactly 8/, task);
    assert.match(user, new RegExp(`at least ${scriptLines(spec.parts[0])} lines`), task);
    assert.equal(scriptLines(spec.parts[0]), 18);
  }
});

test("a reading part with many questions asks for a longer text", () => {
  const few = specWith("R-MC", 3, "A_SENIOR").parts[0];
  const many = specWith("R-MC", 12, "A_SENIOR").parts[0];
  assert.deepEqual(partTextWords(few, "A_SENIOR"), textWords("A_SENIOR", "medium"));
  assert.ok(partTextWords(many, "A_SENIOR")[0] >= 13 * 12, String(partTextWords(many, "A_SENIOR")));
  const { user } = testPrompt(specWith("R-MC", 12, "A_SENIOR"), { focusWords: [] });
  assert.match(user, /each of the 12 questions/);
});

test("a ready-made text too short for the questions is said before writing", () => {
  const text = READING_TEXTS[0];
  const spec = specWith("R-TF", 12, "A_SENIOR", { text: text.id });
  assert.ok(planNotes(spec).some((n) => n.includes(text.title)), planNotes(spec).join(" | "));
  assert.equal(planNotes(specWith("R-TF", 3, "A_SENIOR", { text: text.id })).length, 0);
});

test("old documents saved with letters only up to h get every letter back", () => {
  const spec = specWith("V-MATCH", 10);
  const items = Array.from({ length: 10 }, (_, i) => ({ prompt: `word${i}`, answer: `meaning ${i}` }));
  const doc = buildTestDoc(spec, { sections: [{ id: "p1", example: { prompt: "sun", answer: "meaning sun" }, items }] }, { levelId: "B_SENIOR", meta: {} });
  const s = doc.sections[0];
  s.bank.forEach((b, i) => { if (i >= 8) b.letter = ""; });
  s.items.forEach((it) => { if (!"abcdefgh".includes(it.letter)) it.letter = ""; });
  relabelDoc(doc);
  assert.ok(s.bank.every((b) => b.letter), "every meaning has a letter");
  assert.ok(s.items.every((it) => it.letter && s.bank.find((b) => b.letter === it.letter).text === it.answer), "each item points at its meaning");
  assert.doesNotThrow(() => renderStudentPaper(doc));
});

test("deleting a question renumbers the part, re-letters a matching list, shrinks the word box and the points", () => {
  const match = specWith("V-MATCH", 6);
  const mdoc = buildTestDoc(match, { sections: [{ id: "p1", example: { prompt: "sun", answer: "hot star" }, items: Array.from({ length: 6 }, (_, i) => ({ prompt: `w${i}`, answer: `m${i}` })) }] }, { levelId: "B_SENIOR", meta: {} });
  assert.ok(reviseSection(mdoc, match, "p1", (raw) => { raw.items.splice(2, 1); }));
  const ms = mdoc.sections[0];
  assert.deepEqual(ms.items.map((it) => it.n), [1, 2, 3, 4, 5]);
  assert.equal(ms.bank.length, 6, "five meanings + the example's");
  assert.ok(!ms.bank.some((b) => b.text === "m2"), "the deleted meaning is gone");
  assert.ok(ms.items.every((it) => ms.bank.find((b) => b.letter === it.letter)?.text === it.answer));
  assert.equal(docPoints(mdoc), 5);
  assert.equal(mdoc.meta.points, 5);

  const bank = specWith("V-BANK", 5);
  const bdoc = buildTestDoc(bank, { sections: [{ id: "p1", items: ["lava", "ash", "rock", "smoke", "steam"].map((w) => ({ prompt: `The ________ (${w}).`, answer: w })), bank: ["lava", "ash", "rock", "smoke", "steam", "cloud"] }] }, { levelId: "B_SENIOR", meta: {} });
  reviseSection(bdoc, bank, "p1", (raw) => { const [gone] = raw.items.splice(0, 1); raw.bank.splice(raw.bank.indexOf(gone.answer), 1); });
  assert.ok(!bdoc.sections[0].bank.includes("lava"));
  assert.equal(bdoc.sections[0].items.length, 4);
  assert.ok(!bdoc.sections[0].problems.some((p) => /of \d+ items/.test(p)), "a deleted question is not a missing one");
});

test("new exercises: Look and tick or cross gets its pictures and is never re-checked against a text; signs print in a box", async () => {
  const { keyCheckPrompt } = await import("../desktop/renderer/studio/test-builder.js");
  const pics = { banana: "@w-banana", apple: "@w-apple", pear: "@w-pear", grapes: "@w-grapes" };
  const picFor = (w) => pics[String(w).toLowerCase()] || null;
  const spec = specWith("V-TICK", 3, "A_SENIOR");
  const reply = { sections: [{ id: "p1", example: { picture: "banana", prompt: "a banana", answer: "yes" }, items: [
    { picture: "apple", prompt: "a pear", answer: "no" }, { picture: "grapes", prompt: "grapes", answer: "yes" }, { picture: "pear", prompt: "a banana", answer: "no" }] }] };
  const doc = buildTestDoc(spec, reply, { levelId: "A_SENIOR", picFor, meta: {} });
  const s = doc.sections[0];
  assert.deepEqual(s.items.map((it) => it.pic), ["@w-apple", "@w-grapes", "@w-pear"]);
  assert.ok(!s.problems.some((p) => /picture/.test(p)), s.problems.join(" | "));
  assert.equal(keyCheckPrompt(doc), null, "no text, nothing to re-check");
  const html = renderStudentPaper(doc);
  assert.match(html, /pic-card/);
  assert.match(html, /st-tf-box/);
  // A remake keeps the picture word.
  assert.ok(reviseSection(doc, spec, "p1", (raw) => { raw.items[0].prompt = "an apple"; raw.items[0].answer = "yes"; }, { picFor }));
  assert.equal(doc.sections[0].items[0].pic, "@w-apple");

  const signs = specWith("R-SIGNS", 3, "C_SENIOR");
  const sdoc = buildTestDoc(signs, { sections: [{ id: "p1", items: Array.from({ length: 3 }, (_, i) => ({ prompt: `POOL CLOSED ON MONDAY ${i}`, options: ["You can't swim on Monday.", "It opens at 9.", "Clean the pool."], answer: "You can't swim on Monday." })) }] }, { levelId: "C_SENIOR", meta: {} });
  assert.match(renderStudentPaper(sdoc), /class="st-notice">POOL CLOSED/);
});

test("adding a question at any place renumbers the part, re-letters a matching list and adds its points", () => {
  const spec = specWith("V-MATCH", 4);
  const doc = buildTestDoc(spec, { sections: [{ id: "p1", example: { prompt: "sun", answer: "hot star" }, items: Array.from({ length: 4 }, (_, i) => ({ prompt: `w${i}`, answer: `m${i}` })) }] }, { levelId: "B_SENIOR", meta: {} });
  assert.ok(reviseSection(doc, spec, "p1", (raw) => { raw.items.splice(1, 0, { prompt: "lake", answer: "water with land around it" }); }));
  const s = doc.sections[0];
  assert.deepEqual(s.items.map((it) => it.prompt), ["w0", "lake", "w1", "w2", "w3"]);
  assert.deepEqual(s.items.map((it) => it.n), [1, 2, 3, 4, 5]);
  assert.ok(s.items.every((it) => s.bank.find((b) => b.letter === it.letter)?.text === it.answer));
  assert.equal(doc.meta.points, 5);
  // A yes/no part takes the new statement with its answer in the class's words.
  const tf = specWith("R-TF", 3, "A_SENIOR");
  const tdoc = buildTestDoc(tf, { sections: [{ id: "p1", passage: "Tom has a dog.", items: [{ prompt: "Tom has a dog.", answer: "yes" }, { prompt: "Tom has a cat.", answer: "no" }, { prompt: "The dog is Tom's.", answer: "yes" }] }] }, { levelId: "A_SENIOR", meta: {} });
  reviseSection(tdoc, tf, "p1", (raw) => { raw.items.push({ prompt: "Tom has two dogs.", answer: "no" }); });
  assert.equal(tdoc.sections[0].items.at(-1).answer, "no");
  assert.equal(tdoc.meta.points, 4);
});

test("Lingo adding questions: placeholders hold the places, the reply fills exactly them, the part is checked again", () => {
  const spec = specWith("V-MC", 3, "C_SENIOR");
  const doc = buildTestDoc(spec, { sections: [{ id: "p1", items: [0, 1, 2].map((i) => ({ prompt: `The ________ is hot ${i}.`, options: ["lava", "snow", "ice"], answer: "lava" })) }] }, { levelId: "C_SENIOR", meta: {} });
  // Two new questions after question 1 (what addWithLingo does).
  reviseSection(doc, spec, "p1", (raw) => { raw.items.splice(1, 0, ...[0, 1].map(() => ({ prompt: "(a new question)", answer: "", options: ["?", "?"] }))); });
  spec.parts[0].items = 5;
  const { user } = fixItemsPrompt(spec, doc.sections[0], [2, 3], { focusWords: [], instruction: "These are NEW questions added to the part." });
  assert.match(user, /REWRITE ONLY items 2, 3/);
  assert.match(user, /These are NEW questions/);
  const reply = { items: [
    { n: 2, prompt: "A ________ is a mountain that erupts.", options: ["volcano", "island", "cave"], answer: "volcano" },
    { n: 3, prompt: "Hot ________ comes out of it.", options: ["ash", "rain", "snow"], answer: "ash" },
  ] };
  const changed = applyItemFixes(doc, spec, "p1", reply, [2, 3], {});
  assert.deepEqual(changed, [2, 3]);
  const s = doc.sections[0];
  assert.deepEqual(s.items.map((it) => it.n), [1, 2, 3, 4, 5]);
  assert.equal(s.items[1].answer, "volcano");
  assert.equal(s.items[2].answer, "ash");
  assert.ok(!s.items.some((it) => it.prompt === "(a new question)"));
  assert.ok(!s.problems.some((p) => /^item [23]:/.test(p)), s.problems.join(" | "));
  assert.equal(doc.meta.points, 5);
});
