/* Test Maker Step 2: "How long" offers several templates per length, each preparing a different set of parts. */
import test from "node:test";
import assert from "node:assert/strict";
import { TASKS } from "../desktop/renderer/studio/tasks.js";
import { TEMPLATES, LENGTHS, templateFor, templateParts, presetParts, testDefaults } from "../desktop/renderer/studio/test-builder.js";
import { LEVEL_IDS } from "../desktop/renderer/studio/levels.js";

test("every length has at least three templates, and its classic one keeps the length's id", () => {
  for (const length of Object.keys(LENGTHS)) {
    const list = TEMPLATES.filter((t) => t.length === length);
    assert.ok(list.length >= 3, `${length}: ${list.length} templates`);
    assert.ok(list.some((t) => t.id === length), `${length} has no classic template`);
  }
  assert.equal(new Set(TEMPLATES.map((t) => t.id)).size, TEMPLATES.length, "template ids are unique");
});

test("a template's parts are real tasks of the right skill, never the same task twice, for every class", () => {
  for (const levelId of LEVEL_IDS) for (const pictures of [true, false]) for (const t of TEMPLATES) {
    const parts = templateParts(t.id, levelId, { pictures });
    assert.equal(parts.length, t.parts.length, `${t.id} ${levelId}`);
    parts.forEach((p, i) => {
      assert.ok(TASKS[p.task], `${t.id} ${levelId}: unknown task ${p.task}`);
      assert.equal(TASKS[p.task].skill, t.parts[i][0], `${t.id} ${levelId}: part ${i + 1} is ${p.task}`);
      if (!pictures) assert.ok(!TASKS[p.task].needs?.includes("pictures"), `${t.id} ${levelId}: ${p.task} needs pictures`);
    });
    const ids = parts.map((p) => p.task);
    assert.equal(new Set(ids).size, ids.length, `${t.id} ${levelId} repeats a task: ${ids.join(" ")}`);
  }
});

test("templates of the same length really differ", () => {
  for (const levelId of LEVEL_IDS) for (const length of Object.keys(LENGTHS)) {
    const sets = TEMPLATES.filter((t) => t.length === length).map((t) => templateParts(t.id, levelId).map((p) => p.task).join(" "));
    assert.equal(new Set(sets).size, sets.length, `${length} ${levelId}: ${sets.join(" | ")}`);
  }
});

test("the length presets and the defaults go through the templates", () => {
  assert.deepEqual(presetParts("full", "C_SENIOR").map((p) => p.task), templateParts("full", "C_SENIOR").map((p) => p.task));
  const d = testDefaults("D_SENIOR", "quiz", "quiz-grammar");
  assert.equal(d.template, "quiz-grammar");
  assert.equal(d.length, "quiz");
  assert.deepEqual(d.parts.map((p) => p.task), templateParts("quiz-grammar", "D_SENIOR").map((p) => p.task));
  // Settings saved before templates name only a length: its classic template.
  assert.equal(templateFor(undefined, "full").id, "full");
  assert.equal(templateFor("nonsense", "nothing").id, "standard");
});
