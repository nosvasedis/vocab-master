import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLiveQuestions, gapSentence } from "../desktop/renderer/arcade/live/questions.js";
import { pointsFor, streakBonus, rankTeams } from "../desktop/renderer/arcade/live/scoring.js";
import { buildDetectiveQuestions, typeName } from "../desktop/renderer/arcade/deck.js";

const deck = [
  { english: "cat", type: "n.", greek: "γάτα", emojis: "🐱", example: "The cat sleeps on the sofa." },
  { english: "dog", type: "n.", greek: "σκύλος", emojis: "🐶", example: "My dog likes long walks." },
  { english: "apple", type: "n.", greek: "μήλο", emojis: "🍎", example: "I eat an apple every day." },
  { english: "bike", type: "n.", greek: "ποδήλατο", emojis: "🚲", example: "She rides her bike to school." },
  { english: "happy", type: "adj.", greek: "χαρούμενος", emojis: "", example: "We are happy today." },
];

test("live questions: right count, valid answers, four options (two for true/false)", () => {
  for (let run = 0; run < 30; run++) {
    const qs = buildLiveQuestions(deck, { count: 12, greek: false });
    assert.equal(qs.length, 12);
    for (const q of qs) {
      assert.ok(q.answer >= 0 && q.answer < q.options.length, `${q.kind} answer in range`);
      assert.equal(q.options.length, q.kind === "truefalse" ? 2 : 4);
      assert.notEqual(q.kind, "greek", "no Greek questions while Greek is off");
      if (q.kind === "pic2word" || q.kind === "gap" || q.kind === "listen") assert.equal(q.options[q.answer].text, q.word.english);
      if (q.kind === "word2pic") {
        assert.equal(q.options[q.answer].word, q.word.english);
        assert.equal(new Set(q.options.map((o) => o.pic)).size, 4, "four different pictures");
      }
      if (q.kind === "gap") assert.ok(!q.prompt.toLowerCase().includes(q.word.english), "gap hides the word");
      if (q.kind === "truefalse") assert.equal(q.options[q.answer].text, q.picture === q.word.emojis ? "True" : "False");
    }
    for (let i = 1; i < qs.length; i++) if (qs[i].kind === qs[i - 1].kind) {
      // Neighbours may only share a kind when the word supports nothing else; with this deck that never happens.
      assert.fail(`two "${qs[i].kind}" questions in a row`);
    }
  }
});

test("live questions: Greek questions only when Greek is on", () => {
  const kinds = new Set();
  for (let run = 0; run < 40; run++) buildLiveQuestions(deck, { count: 12, greek: true }).forEach((q) => kinds.add(q.kind));
  assert.ok(kinds.has("greek"));
});

test("live questions: need four words", () => {
  assert.deepEqual(buildLiveQuestions(deck.slice(0, 3), { count: 5 }), []);
});

test("gapSentence masks the word", () => {
  assert.equal(gapSentence(deck[0]), "The _____ sleeps on the sofa.");
});

test("scoring: speed and streaks", () => {
  assert.equal(pointsFor({ correct: false, elapsedMs: 0 }), 0);
  assert.equal(pointsFor({ correct: true, elapsedMs: 0, limitMs: 20000, streak: 1 }), 1000);
  assert.equal(pointsFor({ correct: true, elapsedMs: 20000, limitMs: 20000, streak: 1 }), 500);
  assert.equal(pointsFor({ correct: true, elapsedMs: 10000, limitMs: 20000, streak: 3 }), 750 + 200);
  assert.equal(streakBonus(10), 500);
});

test("ranking: ties share a rank", () => {
  assert.deepEqual(rankTeams([300, 500, 300]).map((r) => [r.index, r.rank]), [[1, 1], [0, 2], [2, 2]]);
});

test("quiz questions keep Greek out of clues and prompts when Greek is off", () => {
  for (let run = 0; run < 20; run++) {
    for (const q of buildDetectiveQuestions(deck, 5, { greek: false })) {
      assert.notEqual(q.kind, "meaning");
      assert.ok(!/[α-ω]/i.test(q.clue || ""), "clue has no Greek");
    }
  }
  assert.equal(typeName("phr. v."), "phrasal verb");
});

import { scorePhoneRound, assignTeams } from "../desktop/renderer/arcade/live/scoring.js";

test("phone round: speed points, team averages, histogram, fastest", () => {
  const r = scorePhoneRound({
    answers: { a: { opt: 2, at: 1000 }, b: { opt: 2, at: 11000 }, c: { opt: 0, at: 2000 } },
    players: ["a", "b", "c", "d"],
    teamOf: { a: 0, b: 1, c: 0, d: 1 },
    answer: 2, startedAt: 1000, limitMs: 20000, streaks: { a: 1 }, teamCount: 2,
  });
  assert.equal(r.perPlayer.a.pts, 1000 + 100); // instant, second right answer in a row
  assert.equal(r.perPlayer.b.pts, 750);
  assert.equal(r.perPlayer.c.pts, 0);
  assert.equal(r.perPlayer.d.opt, null);
  assert.deepEqual(r.teamPts, [550, 375]);
  assert.deepEqual(r.dist, [1, 0, 2, 0]);
  assert.equal(r.fastest, "a");
});

test("team assignment stays balanced and keeps existing members", () => {
  const t = assignTeams(["a", "b", "c", "d", "e"], { a: 1 }, 2);
  assert.equal(t.a, 1);
  const sizes = [0, 0];
  Object.values(t).forEach((x) => sizes[x]++);
  assert.ok(Math.abs(sizes[0] - sizes[1]) <= 1);
});
