/* Projector mode shows everything the teacher makes (studio/projector-model.js): the sheets of a worksheet unit, a
 * test (versions A and B, the teacher's pack) and a read-aloud dictation (the student sheet, the teacher's copy, the
 * wall strips), drawn by the paper's own renderers, with the answers in pills the teacher reveals. */
import test from "node:test";
import assert from "node:assert/strict";
import { projectorSheets, projectorTitle, projectorCss, firstSheet } from "../desktop/renderer/studio/projector-model.js";
import { testDefaults, makePart, buildTestDoc } from "../desktop/renderer/studio/test-builder.js";
import { makeVersionB } from "../desktop/renderer/studio/doc-model.js";
import { dictationDefaults, bookSentences, buildDictationDoc } from "../desktop/renderer/studio/dictation.js";
import { unitWords } from "../desktop/renderer/studio/unit-context.js";

const unit = {
  meta: { classProfile: "C_SENIOR", bookTitle: "Cambridge Primary Paths 2", unit: "4", pageRange: "40-45" },
  lingoLauncher: { vocabulary: [{ number: 1, english: "volcano", type: "n", greek: "ηφαίστειο" }], practice: [{ number: 1, typeId: "L01", wordList: ["volcano"], items: [{ number: 1, prompt: "The ________ erupted.", answer: "volcano" }] }] },
  dictation: { exercises: [{ number: 1, typeId: "D04", items: [{ number: 1, prompt: "climb the ________", answer: "volcano" }] }] },
};

const pills = (html) => (html.match(/teacher-ans-pill/g) || []).length;

test("a worksheet unit: Lingo Launcher and Dictation with answers to reveal, the answer key as it is", () => {
  const sheets = projectorSheets("unit", unit);
  assert.deepEqual(sheets.map((s) => [s.id, s.reveal]), [["lingo", true], ["dictation", true], ["answer", false]]);
  assert.ok(pills(sheets[0].html()) >= 1, "the Lingo practice has its answers in pills");
  assert.ok(pills(sheets[1].html()) >= 1, "so does the Dictation");
  assert.match(sheets[2].html(), /volcano/);
  assert.equal(firstSheet("unit", unit), "lingo");
  assert.deepEqual(projectorTitle("unit", unit), { title: "Cambridge Primary Paths 2 · Unit 4", sub: "C Senior · p. 40-45" });
  assert.equal(projectorTitle("unit", unit, { label: "My unit" }).title, "My unit");
  assert.ok(!projectorCss("unit").includes("@page"), "no print page rules on the screen");
});

test("a test: version A (and B) with answers to reveal, pictures drawn; the teacher's pack for both versions", () => {
  const plan = [{ ...makePart("vocabulary", "V-PIC", "B_SENIOR"), id: "p1", items: 2 }];
  const spec = { ...testDefaults("B_SENIOR"), parts: plan, pictures: true };
  const picFor = (w) => ({ lion: "@w-lion", zebra: "@w-zebra" })[String(w).toLowerCase()] || null;
  const doc = buildTestDoc(spec, { sections: [{ id: "p1", items: [{ prompt: "It can roar.", answer: "lion" }, { prompt: "Black and white.", answer: "zebra" }] }] }, { levelId: "B_SENIOR", picFor, meta: { title: "Animals test", classProfile: "B_SENIOR" } });
  let sheets = projectorSheets("test", doc);
  assert.deepEqual(sheets.map((s) => s.label), ["Test paper", "Teacher’s pack"]);
  const paper = sheets[0].html();
  assert.equal(pills(paper), 2, "one answer per question");
  assert.match(paper, /<img[^>]+w-lion/, "the pictures are on the paper");
  doc.meta.title = "Animals test";
  doc.versionB = makeVersionB(doc);
  sheets = projectorSheets("test", doc);
  assert.deepEqual(sheets.map((s) => s.id), ["A", "B", "teacher"]);
  assert.equal(sheets[0].label, "Version A");
  assert.equal((sheets[2].html().match(/class="worksheet/g) || []).length, 2, "both teacher's packs");
  assert.equal(projectorTitle("test", doc).title, "Animals test");
  assert.match(projectorCss("test"), /st-sec|st-item/, "the Test Maker's paper parts are styled");
});

test("a read-aloud dictation: the student sheet to check, the teacher copy, and a running dictation's wall strips first", () => {
  const words = unitWords("CPP2", 4, ["A"]);
  const make = (style) => {
    const spec = { ...dictationDefaults("C_SENIOR"), style };
    const sentences = bookSentences(spec, words);
    return buildDictationDoc(spec, { sentences, text: sentences.map((x) => x.text).join(" ") }, words, { meta: { bookTitle: "Cambridge Primary Paths 2", unit: 4 }, picFor: (w) => `@w-${w}` });
  };
  const classic = make("classic");
  const sheets = projectorSheets("dictation", classic);
  assert.deepEqual(sheets.map((s) => [s.id, s.reveal]), [["student", true], ["teacher", false]]);
  assert.equal(pills(sheets[0].html()), classic.sections[0].sentences.length, "each sentence is revealed to check");
  assert.equal(firstSheet("dictation", classic), "student");
  assert.equal(projectorTitle("dictation", classic).title, "Classic dictation");
  const running = make("running");
  assert.deepEqual(projectorSheets("dictation", running).map((s) => s.id), ["student", "teacher", "strips"]);
  assert.equal(firstSheet("dictation", running), "strips");
  assert.match(projectorSheets("dictation", running)[2].html(), /st-strip/);
});

test("nothing to show gives no sheets", () => {
  assert.deepEqual(projectorSheets("test", null), []);
  assert.deepEqual(projectorSheets("other", {}), []);
});
