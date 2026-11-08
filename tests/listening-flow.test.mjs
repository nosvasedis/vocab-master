// Numbered / continuous listening, the studio voice request, finish-the-sentences words, and the order task's example.
import test from "node:test";
import assert from "node:assert/strict";
import { dialogueRequests, speakerRuns } from "../desktop/renderer/studio/gemini-voice.js";
import { numberedScript, unnumberScript, cutGistRecording } from "../desktop/renderer/studio/listening-sync.js";
import { pauseAfter, NUMBER_GAP } from "../desktop/renderer/studio/audio-track.js";
import { orderList, showsExample, starterPieces, answerKeyRows, playedScript } from "../desktop/renderer/studio/doc-model.js";
import { partOpts } from "../desktop/renderer/studio/tasks.js";

const numbered = [
  { speaker: "Narrator", text: "Example." }, { speaker: "Mia", text: "I like cats." },
  { speaker: "Narrator", text: "Number 1." }, { speaker: "Tom", text: "I have a dog." }, { speaker: "Mia", text: "Nice!" },
  { speaker: "Narrator", text: "Number 2." }, { speaker: "Tom", text: "We go on Friday." },
];

test("the studio request has no 'mode' (Google rejects it) and a narrator's number is a run of its own", () => {
  const reqs = dialogueRequests(numbered, { Narrator: { voice: "Kore" }, Mia: { voice: "Puck" }, Tom: { voice: "Charon" } });
  for (const r of reqs) assert.equal(r.body.generation_config.speech_config.mode, undefined);
  const runs = speakerRuns(numbered);
  assert.deepEqual(runs.filter((r) => r.speakers[0] === "Narrator").map((r) => r.lines.length), [1, 1, 1]);
});

test("numbered scripts: found, taken out, cut, and timed with time to answer", () => {
  assert.equal(numberedScript(numbered), true);
  assert.equal(numberedScript(unnumberScript(numbered)), false);
  assert.equal(unnumberScript(numbered).length, 4);
  assert.deepEqual(cutGistRecording(numbered, 1).map((l) => l.text), ["Example.", "I like cats.", "Number 1.", "We go on Friday."]);
  assert.equal(pauseAfter({ speaker: "Mia", text: "Nice!" }, { speaker: "Narrator", text: "Number 2." }), NUMBER_GAP);
  assert.ok(pauseAfter({ speaker: "Narrator", text: "Number 2." }, { speaker: "Tom", text: "Hi." }) < 1);
  // The example's bit is not played while the example is hidden.
  const sec = { task: "L-MC", script: numbered, example: { prompt: "x" } };
  assert.equal(playedScript(sec, { examples: false })[0].text, "Number 1.");
});

test("recording flow: numbered for A–B Senior, continuous from C Senior; the teacher's choice wins", () => {
  assert.equal(partOpts({ task: "L-MC" }, "A_SENIOR").flow, "numbered");
  assert.equal(partOpts({ task: "L-MC" }, "D_SENIOR").flow, "continuous");
  assert.equal(partOpts({ task: "L-MC", opts: { flow: "continuous" } }, "A_SENIOR").flow, "continuous");
  assert.equal(partOpts({ task: "L-GIST" }, "A_SENIOR").flow, undefined, "the main idea is always numbered");
});

test("finish the sentences: the unit words in bold inside the starters", () => {
  const p = starterPieces("My favourite hobby is ____ because I like painting.", ["hobby", "paint"]);
  assert.deepEqual(p.filter((x) => x.bold).map((x) => x.text), ["hobby", "painting"]);
  assert.equal(p.map((x) => x.text).join(""), "My favourite hobby is ________ because I like painting.");
});

test("put in order: the hidden example is one more lettered event, never first, and the key agrees", () => {
  const sec = { task: "R-ORDER", example: { prompt: "Lily puts on her pajamas.", answer: "1" }, items: ["Max sleeps.", "Grandma comes.", "Lily asks."].map((prompt, i) => ({ prompt, answer: String(i + 2), letter: "abc"[i], n: i + 1 })) };
  assert.equal(showsExample(sec, { examples: false }), false);
  const list = orderList(sec, { examples: false });
  assert.equal(list.length, 4);
  const at = list.findIndex((x) => x.first);
  assert.ok(at > 0);
  assert.deepEqual(list.map((x) => x.letter), ["a", "b", "c", "d"]);
  assert.equal(answerKeyRows(sec, { examples: false })[at].text, "1 — Lily puts on her pajamas.");
  assert.equal(orderList(sec, {}).length, 3, "shown, it stays solved above the list");
});
