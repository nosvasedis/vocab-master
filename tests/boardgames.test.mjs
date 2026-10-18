/* Word Board (Jeopardy-style) and Top Answers (Family-Feud-style): board building, answer matching, the boards file. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildBoard, makeQuestion } from "../desktop/renderer/arcade/board-questions.js";
import { CPP_WORDBANK } from "../desktop/renderer/coursebook-data.js";

const deck = CPP_WORDBANK.filter((w) => w.bookId === "CPP1" && w.unit === 1 && w.section === "A").slice(0, 16)
  .map((w) => ({ english: w.english, type: w.type, greek: w.greek, example: w.example, emojis: w.emojis }));

test("Word Board: categories × rows, every tile answerable, one double", () => {
  const b = buildBoard(deck, { greek: true, rnd: () => 0.3 });
  assert.ok(b.cats.length >= 3 && b.cats.length <= 5, `cats ${b.cats}`);
  assert.ok(b.rows.length >= 3 && b.rows.length <= 5);
  assert.deepEqual(b.rows, b.rows.map((_, i) => (i + 1) * 100));
  for (const row of b.tiles) for (const q of row) {
    if (q.judged) { assert.ok(q.answerText && q.letters > 0); continue; }
    assert.equal(q.options.length, 4);
    assert.ok(q.answer >= 0 && q.options[q.answer] === q.answerText, `${q.kind}: ${q.answerText}`);
    assert.equal(new Set(q.options).size, 4, `${q.kind} options unique`);
  }
  assert.ok(b.double.r >= 1 && b.double.r < b.rows.length && b.double.c < b.cats.length);
});

test("Word Board: tiles use different words where the deck allows", () => {
  const b = buildBoard(deck, {});
  const words = b.tiles.flat().map((q) => q.word.english);
  assert.ok(new Set(words).size >= Math.min(words.length, deck.length) - 2);
});

test("Word Board: gap tiles keep the sentence's word form; hard gaps lose the picture clue", () => {
  const w = { english: "uncle", type: "n.", example: "I have two uncles.", emojis: "👨" };
  const others = ["aunt", "cousin", "baby", "sister"].map((e) => ({ english: e, type: "n." }));
  const easy = makeQuestion("gap", w, [w, ...others], 0);
  const hard = makeQuestion("gap", w, [w, ...others], 4);
  assert.equal(easy.answerText, "uncles");
  assert.ok(easy.picture && !hard.picture);
});

test("Top Answers: matching accepts plurals, alternatives and other forms, never a revealed answer", async () => {
  const { matchAnswer } = await import("../desktop/renderer/arcade/games/feud.js");
  const answers = [{ text: "mother", alts: ["mom", "mum"] }, { text: "living room", alts: [] }, { text: "sheep", alts: [] }, { text: "duck", alts: [] }];
  assert.equal(matchAnswer("Mum!", answers), 0);
  assert.equal(matchAnswer("living rooms", answers), 1);
  assert.equal(matchAnswer("ducks", answers), 3);
  assert.equal(matchAnswer("cat", answers), -1);
  assert.equal(matchAnswer("duck", answers, new Set([3])), -1);
});

test("Top Answers: the boards file is well-formed and picks the deck's unit", async () => {
  const data = JSON.parse(fs.readFileSync("desktop/renderer/lessons/feud.json", "utf8"));
  const all = Object.values(data.boards).flat();
  assert.ok(all.length >= 3);
  for (const b of all) {
    assert.match(b.prompt, /^Name\b.*…$/);
    assert.ok(b.answers.length >= 5 && b.answers.length <= 6, b.id);
    for (let i = 1; i < b.answers.length; i++) assert.ok(b.answers[i].points < b.answers[i - 1].points, `${b.id} points descend`);
    assert.equal(new Set(b.answers.map((a) => a.text)).size, b.answers.length, `${b.id} unique answers`);
  }
  const { boardsForDeck } = await import("../desktop/renderer/arcade/games/feud.js");
  assert.equal(boardsForDeck(deck, data)[0].id.startsWith("CPP1-U1"), true);
});
