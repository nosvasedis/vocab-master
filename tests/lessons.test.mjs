import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { validateLesson, lessonLines, normText, lessonPath } from "../desktop/renderer/lesson/schema.js";
import { allLessonFiles, getWord, LESSONS_DIR } from "../scripts/lessons/lib/catalog.mjs";

const files = allLessonFiles();
const index = JSON.parse(fs.readFileSync(path.join(LESSONS_DIR, "index.json"), "utf8"));

test("catalog lists exactly the lesson files on disk", () => {
  const onDisk = files.map((f) => path.relative(LESSONS_DIR, f).split(path.sep).join("/")).sort();
  const listed = index.lessons.map((l) => l.path).sort();
  assert.deepEqual(listed, onDisk);
});

for (const file of files) {
  const lesson = JSON.parse(fs.readFileSync(file, "utf8"));
  test(`${lesson.id} passes the validator`, () => {
    const { errors } = validateLesson(lesson, getWord);
    assert.deepEqual(errors, []);
    assert.equal(lessonPath(lesson.bookId, lesson.unit, lesson.section), path.relative(LESSONS_DIR, file).split(path.sep).join("/"));
  });
  test(`${lesson.id} has unique audio keys`, () => {
    const keys = lessonLines(lesson).map((l) => l.key);
    assert.equal(new Set(keys).size, keys.length);
  });
}

test("validator catches a broken lesson", () => {
  const { errors } = validateLesson({ schema: 1, id: "X", bookId: "CPP1", unit: 1, section: "A", title: "t", profile: "A_SENIOR", status: "draft", cast: {}, focusWords: [{ wordId: "nope" }], scenes: [] }, getWord);
  assert.ok(errors.some((e) => /not in the word bank/.test(e)));
  assert.ok(errors.some((e) => /cast.lingo/.test(e)));
  assert.ok(errors.some((e) => /reveal scene/.test(e)));
});

test("normText is stable", () => {
  assert.equal(normText("  “Hello,  World!” "), "hello, world");
  assert.equal(normText("My ____ is tall."), "my blank is tall");
});
