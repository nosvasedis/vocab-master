/* Test Maker writing parts: sentence starters print one line each, picture tasks always carry their pictures. */
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSection, starterText } from "../desktop/renderer/studio/doc-model.js";
import { renderStudentPaper } from "../desktop/renderer/studio/doc-render.js";
import { makePart, testPrompt, testDefaults } from "../desktop/renderer/studio/test-builder.js";

const PICS = { firefighter: "@w-firefighter", hospital: "@w-hospital", "fire station": "@w-fire-station", truck: "@w-truck", park: "@w-park" };
const picFor = (w) => PICS[String(w || "").toLowerCase()] || "";
const paper = (section) => renderStudentPaper({ meta: { title: "T" }, sections: [section] });

test("a starter that ends in a gap prints one writing line, not two", () => {
  assert.equal(starterText("I like ________ about my town."), "I like ________ about my town.");
  assert.equal(starterText("What I like about ________."), "What I like about");
  assert.equal(starterText("My name is ____ ."), "My name is");
  assert.equal(starterText("After school, I usually..."), "After school, I usually…");
  const s = normalizeSection(makePart("writing", "W-SENT", "B_SENIOR"), { prompt: "About you", frame: ["What I like about ________.", "My best friend is…"] }, { levelId: "B_SENIOR" });
  const html = paper(s);
  assert.ok(!html.includes("___"), "no raw underscores on the paper");
  const first = html.match(/<p class="st-starter">.*?<\/p>/)[0];
  assert.equal((first.match(/st-line/g) || []).length, 1, "one line for the first starter");
});

test("gaps inside a starter or a help point are drawn as gaps", () => {
  const s = normalizeSection(makePart("writing", "W-SENT", "B_SENIOR"), { frame: ["I like ____ because…"] }, { levelId: "B_SENIOR" });
  const html = paper(s);
  assert.ok(html.includes("st-line inline") && html.includes("st-line grow") && !html.includes("___"));
  const g = normalizeSection(makePart("writing", "W-GUIDED", "C_SENIOR"), { prompt: "Write.", frame: ["My town is ______."] }, { levelId: "C_SENIOR" });
  assert.ok(!paper(g).includes("___"));
});

test("picture writing: the AI's pictures are read leniently", () => {
  const plan = makePart("writing", "W-PICTURES", "B_SENIOR");
  const s = normalizeSection(plan, { prompt: "Write a story.", pictures: ["Firefighters", "the hospital", { word: "fire station" }] }, { levelId: "B_SENIOR", picFor });
  assert.deepEqual(s.pictures.map((p) => p.pic), ["@w-firefighter", "@w-hospital", "@w-fire-station"]);
  assert.ok(paper(s).includes("st-story-pics"));
});

test("picture writing with no pictures from the AI is topped up from its word box and story", () => {
  const plan = makePart("writing", "W-PICTURES", "B_SENIOR");
  const s = normalizeSection(plan, { prompt: "Write a story.", pictures: [], bank: ["help", "truck", "brave", "firefighter"], sample: "The firefighter drove to the park." },
    { levelId: "B_SENIOR", picFor, spareWords: ["park", "hospital"] });
  assert.equal(s.pictures.length, 3);
  // Words the story mentions come first.
  assert.deepEqual(s.pictures.map((p) => p.word).slice(0, 2), ["firefighter", "park"]);
  const none = normalizeSection(plan, { prompt: "Write.", pictures: [] }, { levelId: "B_SENIOR", picFor: () => "" });
  assert.ok(none.problems.some((p) => /needs 3 pictures/.test(p)));
});

test("Finish the sentences keeps starters at every support level; the prompts forbid gaps in starters", () => {
  const spec = { ...testDefaults("B_SENIOR", "standard"), parts: [{ ...makePart("writing", "W-SENT", "B_SENIOR"), opts: { support: "none" } }, { ...makePart("writing", "W-PICTURES", "B_SENIOR"), opts: { support: "some" } }] };
  const { user } = testPrompt(spec, { pictureWords: ["firefighter", "hospital", "park"] });
  assert.ok(/SHORT sentence starters/.test(user) && !/no sentence starters/.test(user));
  assert.ok(/never underscores, gaps or blanks/.test(user));
  assert.ok(/EXACTLY 3 words copied exactly from the picture words list/.test(user));
});

test("Continue the story: an instruction instead of the story's first lines is flagged; a beginning sent as the text is used", () => {
  const plan = makePart("writing", "W-STORY", "C_SENIOR");
  const bad = normalizeSection(plan, { prompt: "Continue the story. Write what happens next.", frame: ["What happened next?"] }, { levelId: "C_SENIOR" });
  assert.ok(bad.problems.includes("missing the beginning of the story"));
  const moved = normalizeSection(plan, { prompt: "Continue the story.", passage: "When Nikos opened the old box, he couldn't believe his eyes…" }, { levelId: "C_SENIOR" });
  assert.equal(moved.task_prompt, "When Nikos opened the old box, he couldn't believe his eyes…");
  assert.ok(!moved.problems.length);
  const good = normalizeSection(plan, { prompt: "Mia found a map under her bed." }, { levelId: "C_SENIOR" });
  assert.ok(!good.problems.length);
});
