/* Picture set: every lesson word and story character has its picture, and the bundled/R2 split is consistent. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CPP_WORDBANK } from "../desktop/renderer/coursebook-data.js";
import { onePicture } from "../desktop/renderer/lesson/wordmatch.js";
import { picType } from "../desktop/renderer/js/pics.js";

const PICS = "desktop/renderer/assets/pics";
const M = JSON.parse(fs.readFileSync(path.join(PICS, "manifest.json"), "utf8"));
const remote = new Set(M.remote || []);
const byId = new Map(CPP_WORDBANK.map((w) => [w.id, w]));
const catalog = JSON.parse(fs.readFileSync("desktop/renderer/lessons/index.json", "utf8"));
const lessons = catalog.lessons.map((e) => JSON.parse(fs.readFileSync(path.join("desktop/renderer/lessons", e.path), "utf8")));

test("every manifest picture is bundled or listed for R2", () => {
  const files = new Set([...Object.values(M.words), ...Object.values(M.nouns), ...Object.values(M.characters), ...Object.values(M.ui)]);
  const missing = [...files].filter((f) => !remote.has(f) && !fs.existsSync(path.join(PICS, f)));
  assert.deepEqual(missing, []);
});

test("lesson focus words have bundled pictures", () => {
  const missing = [];
  for (const l of lessons) for (const fw of l.focusWords || []) {
    const w = byId.get(fw.wordId);
    if (!w) continue;
    const f = M.words[`${w.english.toLowerCase()}|${picType(w.type)}`];
    if (!f || remote.has(f)) missing.push(`${l.id}: ${w.english}`);
  }
  assert.deepEqual(missing, []);
});

test("story characters have pictures", () => {
  const missing = [];
  for (const l of lessons) for (const key of Object.keys(l.cast || {})) {
    if (key === "lingo") continue;
    if (!M.characters[`${l.id}|${key}`]) missing.push(`${l.id}|${key}`);
  }
  assert.deepEqual(missing, []);
});

test("a picture token counts as one picture", () => {
  assert.equal(onePicture("@w-house"), "@w-house");
  assert.equal(onePicture("@w-house 🏠"), "@w-house");
});
