/* The picture exercise uses the app's word-bank illustrations (never emoji), and task lines can carry a Greek help line. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  renderDictation, renderLingoLauncher, buildDictationDocx, pickGenerationPlan, normalizeWorksheetExercises,
} from "../desktop/renderer/app.js";

const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function sheet(classProfile = "B_SENIOR") {
  return {
    meta: { classProfile, bookTitle: "Cambridge Primary Paths 2", unit: 4 },
    lingoLauncher: {
      vocabulary: [{ number: 1, english: "volcano", type: "n.", greek: "ηφαίστειο", emojis: "🌋", pic: "@w-volcano" }],
      practice: [{ number: 1, typeId: "L01", wordList: ["lava", "volcano"], items: [{ number: 1, prompt: "The ________ is hot.", answer: "lava" }] }],
    },
    dictation: {
      exercises: [{
        number: 1, typeId: "D25", wordBank: [], items: [
          { number: 1, prompt: "🌋 (a mountain with fire inside) ________", answer: "volcano", pic: "@w-volcano" },
          { number: 2, prompt: "(very hot liquid rock)", answer: "lava", pic: "@w-lava" },
        ],
      }],
    },
  };
}

test("D25 prints word-bank pictures with a clue and a writing line — no emoji", () => {
  const html = renderDictation(sheet(), {});
  assert.match(html, /class="pic-grid"/);
  assert.match(html, /<img class="ws-pic" src="\.\/assets\/pics\/(bank\/)?w-volcano\.webp"/);
  assert.match(html, /a mountain with fire inside/);
  assert.ok(!html.includes("🌋"), "emoji must not appear in the picture exercise");
  assert.equal((html.match(/class="ex-item pic-card"/g) || []).length, 2, "each item stays editable as .ex-item");
});

test("the picture style 'Word-bank pictures' shows the illustration in the word table", () => {
  const html = renderLingoLauncher(sheet(), { layout: { pictureStyle: "pictures" } });
  assert.match(html, /<img class="v-pic"[^>]*w-volcano\.webp/);
  const emoji = renderLingoLauncher(sheet(), { layout: { pictureStyle: "emoji" } });
  assert.ok(emoji.includes("🌋") && !emoji.includes("v-pic"));
});

test("Greek help lines: on by default for B Senior, off for E Senior, switchable", () => {
  assert.match(renderDictation(sheet("B_SENIOR"), {}), /class="ex-help-el" lang="el">Κοίτα τις εικόνες/);
  assert.ok(!renderDictation(sheet("E_SENIOR"), {}).includes("ex-help-el"));
  assert.ok(!renderDictation(sheet("B_SENIOR"), { layout: { dictation: { greekHelp: false } } }).includes("ex-help-el"));
  assert.match(renderDictation(sheet("E_SENIOR"), { layout: { dictation: { greekHelp: true } } }), /ex-help-el/);
});

test("Word export embeds the PNG copies of the pictures", async () => {
  const data = sheet();
  data.meta.picPng = { "w-volcano": PNG_1PX, "w-lava": PNG_1PX };
  const blob = await buildDictationDocx(data);
  const buf = Buffer.from(await blob.arrayBuffer());
  assert.ok(buf.length > 1000);
  assert.ok(buf.includes(Buffer.from("word/media/")), "docx has embedded media");
});

test("saved pictures survive normalising (e.g. when Word files are built without the manifest)", () => {
  const data = normalizeWorksheetExercises(sheet());
  assert.equal(data.dictation.exercises[0].items[0].pic, "@w-volcano");
  assert.equal(data.lingoLauncher.vocabulary[0].pic, "@w-volcano");
});

test("random plans skip the picture exercise when fewer than 3 words have pictures", () => {
  for (let i = 0; i < 30; i++) {
    const plan = pickGenerationPlan("E_SENIOR", { forceRandom: true, dictationCount: 5, vocabFeatures: { pictureWords: ["volcano"], hasPictures: false } });
    assert.ok(!plan.dictationTypes.includes("D25"));
  }
});

test("every Greek help line exists for every exercise type the levels allow", () => {
  const src = readFileSync(new URL("../desktop/renderer/app.js", import.meta.url), "utf8");
  const block = src.slice(src.indexOf("const EXERCISE_STUDENT_INSTRUCTIONS_EL"), src.indexOf("function getStudentExerciseInstruction"));
  for (let i = 1; i <= 28; i++) assert.match(block, new RegExp(`D${String(i).padStart(2, "0")}: "`));
  for (let i = 1; i <= 13; i++) assert.match(block, new RegExp(`L${String(i).padStart(2, "0")}: "`));
});
