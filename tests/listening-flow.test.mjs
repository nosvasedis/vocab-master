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
  // A gap inside keeps the length it was typed with (the teacher shapes gaps; the paper draws it short).
  assert.equal(p.map((x) => x.text).join(""), "My favourite hobby is ____ because I like painting.");
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

test("words in one part: the ones it tests (with their questions, only-here) and the ones it could take", async () => {
  const { partWords } = await import("../desktop/renderer/studio/test-coverage.js");
  const doc = {
    focusWords: ["dog", "cow", "fish", "sheep"].map((english) => ({ english })),
    sections: [
      { skill: "vocabulary", task: "V-MATCH", items: [{ n: 1, prompt: "dog", answer: "a pet that barks" }, { n: 2, prompt: "cow", answer: "it gives milk" }] },
      { skill: "vocabulary", task: "V-MC", items: [{ n: 1, prompt: "My ________ barks.", options: ["dog", "fish"], answerIndex: 0, answer: "dog" }] },
    ],
  };
  const p = partWords(doc, 0);
  assert.deepEqual(p.here.map((w) => [w.english, w.items, w.only]), [["dog", [1], false], ["cow", [2], true]]);
  assert.deepEqual(p.others.map((w) => w.english), ["sheep", "fish"], "untested first: sheep is missing, fish only an option");
  assert.equal(p.total, 4);
});

test("words in one worksheet exercise: its words with their lines, and the ones it could take (this sheet's gaps first)", async () => {
  const { exerciseWords } = await import("../desktop/renderer/studio/quality-check.js");
  const line = (number, answer) => ({ number, prompt: "We saw the ________.", answer });
  const data = {
    lingoLauncher: { vocabulary: ["volcano", "island", "forest", "desert"].map((english) => ({ english })), practice: [{ number: 1, typeId: "L01", items: [line(1, "desert")] }] },
    dictation: { exercises: [{ number: 1, typeId: "D01", items: [line(1, "volcano"), line(2, "island"), line(3, "volcano")] }, { number: 2, typeId: "D02", items: [line(1, "island")] }] },
  };
  const ew = exerciseWords(data, "dictation", 1);
  assert.deepEqual(ew.here.map((w) => [w.english, w.lines, w.only]), [["volcano", [1, 3], true], ["island", [2], false]]);
  assert.deepEqual(ew.others.map((w) => [w.english, w.status]), [["forest", "missing"], ["desert", "other"]]);
});

test("short matching lists go into two columns from 5 questions; long lines and short lists stay in one", async () => {
  const { testPartColumns } = await import("../desktop/renderer/studio/item-columns.js");
  const words = ["dog", "cow", "fish", "horse", "sheep", "bird", "goat", "duck"];
  const s = { answerType: "match", task: "V-MATCH", example: { prompt: "cat" }, items: words.map((prompt) => ({ prompt, answer: "x" })) };
  assert.equal(testPartColumns(s), true, "8 words to match");
  assert.equal(testPartColumns({ ...s, items: s.items.slice(0, 5) }), true, "5 words");
  assert.equal(testPartColumns({ ...s, items: s.items.slice(0, 4) }), false, "4 words: one column");
  assert.equal(testPartColumns({ ...s, items: s.items.map((it) => ({ ...it, prompt: "a much longer line that needs the width" })) }), false, "long lines need the whole width");
  assert.equal(testPartColumns(s, { textSize: "xlarge" }), true, "short words fit even in large print");
});
