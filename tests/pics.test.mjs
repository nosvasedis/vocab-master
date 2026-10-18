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

test("every manifest picture ships with the app (bank/ for the word bank)", () => {
  const files = new Set([...Object.values(M.words), ...Object.values(M.nouns), ...Object.values(M.characters), ...Object.values(M.ui)]);
  const missing = [...files].filter((f) => !fs.existsSync(path.join(PICS, remote.has(f) ? "bank" : "", f)));
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

test("story characters get real-world heights that fit the stage", async () => {
  const { figureOf } = await import("../desktop/renderer/lesson/scenes/story.js");
  const ids = Object.keys(M.figures || {});
  assert.ok(ids.length >= 80, "manifest.figures measured");
  const box = (id) => ({ top: M.figures[id][0], bottom: M.figures[id][1], width: M.figures[id][2] });
  const h = (id) => figureOf(`@${id}`, box(id)).h;
  for (const id of ids) {
    const f = figureOf(`@${id}`, box(id));
    assert.ok(f.h >= 150 && f.h + f.lift <= 800, `${id}: ${f.h}px`); // stage is 1080 px; caption + name tag need room
    assert.ok(Math.abs(f.img * (box(id).bottom - box(id).top) - f.h) < 2, `${id}: picture sized to the figure`);
  }
  assert.ok(h("c-timmy-child") < h("c-mum-adult") && h("c-zip-squirrel") < h("c-timmy-child") && h("c-gus-giant") > h("c-mum-adult"));
});
