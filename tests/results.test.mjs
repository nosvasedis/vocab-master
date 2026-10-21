/* Game results (CSV records) and a lesson's check items as Lingo Live questions. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { resultsCsv, resultsFileName, csvCell, missedWords, keepResults, listResults, newRecord } from "../desktop/renderer/arcade/results.js";
import { fromLessonChecks } from "../desktop/renderer/arcade/live/questions.js";
import { allLessonFiles, getWord } from "../scripts/lessons/lib/catalog.mjs";

const rec = newRecord({
  game: "Lingo Live",
  date: "2026-10-21T08:30:00.000Z",
  className: "B Senior",
  title: "Primary Path 1 · Unit 1 · My family",
  mode: "Phones · 3 players in 2 teams",
  questions: [
    { n: 1, kind: "Fill the gap", prompt: "My _____ is kind.", answer: "aunt", word: "aunt", right: 1, answered: 3, of: 3 },
    { n: 2, kind: "Listen!", prompt: "(listen) uncle", answer: "uncle", word: "uncle", right: 3, answered: 3, of: 3 },
    { n: 3, kind: "What's this?", prompt: "What's this?", answer: "aunt", word: "aunt", right: 2, answered: 2, of: 3 },
  ],
  players: [
    { name: "=HYPERLINK(\"x\")", team: "Tigers", points: 900, right: 2, answered: 3 },
    { name: "Μαρία", team: "Rockets", points: 2400, right: 3, answered: 3 },
  ],
  teams: [{ name: "Tigers", points: 900, right: 2 }, { name: "Rockets", points: 2400, right: 3 }],
});

test("missed words: most missed first, counted per answer", () => {
  assert.deepEqual(missedWords(rec), [{ word: "aunt", missed: 3, asked: 6 }]);
  assert.deepEqual(missedWords({ missed: ["cat", "cat", "dog"] }).map((m) => [m.word, m.missed]), [["cat", 2], ["dog", 1]]);
});

test("CSV cells: quotes, commas and formulas are safe", () => {
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell("a, b"), '"a, b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell("=1+1"), "'=1+1");
  assert.equal(csvCell("-5"), "'-5");
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(0), "0");
});

test("results CSV: heading, questions, players by points, teams, words to review", () => {
  const csv = resultsCsv(rec);
  assert.ok(csv.startsWith("﻿Lingo Live results\r\n"), "BOM for Excel, then the title");
  assert.match(csv, /\r\nClass,B Senior\r\n/);
  assert.match(csv, /\r\nRight overall,67%\r\n/);
  assert.match(csv, /\r\n1,Fill the gap,My _____ is kind\.,aunt,aunt,1,3,3,33%\r\n/);
  const lines = csv.split("\r\n");
  const head = lines.indexOf("Rank,Player,Team,Points,Right,Answered,Out of");
  assert.ok(head > 0);
  assert.equal(lines[head + 1], "1,Μαρία,Rockets,2400,3,3,3", "the best player first");
  assert.ok(lines[head + 2].startsWith(`2,"'=HYPERLINK(""x"")"`), "a nickname is never a formula");
  assert.ok(lines.includes("1,Rockets,2400,3"));
  assert.ok(lines.includes("aunt,3,6"));
  const none = resultsCsv({ ...rec, questions: rec.questions.map((q) => ({ ...q, right: q.of })) });
  assert.match(none, /every word was answered right/);
});

test("file name: game, class, date and time", () => {
  const name = resultsFileName(rec);
  assert.match(name, /^Lingo Live, B Senior, 2026-10-21 \d\d-30\.csv$/);
});

test("records are kept newest first, at most 40, and replace themselves", () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  for (let i = 0; i < 45; i++) keepResults({ id: `r${i}`, game: "Quiz Show", date: "2026-10-21" }, storage);
  const list = listResults(storage);
  assert.equal(list.length, 40);
  assert.equal(list[0].id, "r44");
  keepResults({ id: "r44", game: "Quiz Show", date: "2026-10-21", title: "again" }, storage);
  assert.equal(listResults(storage).filter((r) => r.id === "r44").length, 1);
  assert.deepEqual(listResults({ getItem: () => "not json" }), []);
});

test("every lesson's check items become Lingo Live questions (phones or answer cards)", () => {
  let items = 0;
  for (const file of allLessonFiles()) {
    const lesson = JSON.parse(fs.readFileSync(file, "utf8"));
    const checks = (lesson.scenes || []).filter((s) => s.type === "check").flatMap((s) => s.items || []);
    const wordOf = (id) => { const w = getWord(id); return w ? { english: w.english, greek: w.greek, emoji: (w.emojis || "").split(/\s+/)[0], example: w.example } : null; };
    const qs = fromLessonChecks(checks, wordOf);
    items += checks.length;
    assert.equal(qs.length, checks.length, `${path.basename(file)}: every check item converts`);
    qs.forEach((q, k) => {
      const it = checks[k];
      assert.ok(q.answer >= 0 && q.answer < q.options.length, `${lesson.id}/${it.id}: answer in range`);
      assert.ok(q.options.length >= 2 && q.options.length <= 4, `${lesson.id}/${it.id}: 2–4 options for the phone shapes`);
      assert.ok(q.kindLabel && q.answerText, `${lesson.id}/${it.id}: label and answer text`);
      if (q.kind === "listen") assert.ok(q.sayPrompt && !q.prompt.includes(q.answerText), `${lesson.id}/${it.id}: the listen word is spoken, not shown`);
      if (q.kind === "gap") assert.match(q.prompt, /_____/, `${lesson.id}/${it.id}: the gap shows`);
      for (const o of q.options) assert.ok(o.text || o.pic, `${lesson.id}/${it.id}: every option shows something`);
    });
  }
  assert.ok(items > 300, "the lessons have their check items");
});

test("lesson checks: broken items are left out, not shown wrong", () => {
  const qs = fromLessonChecks([
    { id: "a", kind: "gap", prompt: { text: "A ____ b" }, options: ["x", "y", "z"], answer: 7 },
    { id: "b", kind: "listen", options: ["nope1", "nope2", "nope3"], answer: 0 },
    { id: "c", kind: "mystery", options: ["x", "y"], answer: 0 },
    { id: "d", kind: "trueFalse", prompt: { text: "Cats bark." }, props: [{ emoji: "🐱" }], options: ["True", "False"], answer: 1, explain: { text: "Dogs bark." } },
  ], () => null);
  assert.equal(qs.length, 1);
  assert.equal(qs[0].kind, "truefalse");
  assert.equal(qs[0].picture, "🐱");
  assert.equal(qs[0].answerText, "False");
  assert.equal(qs[0].explain, "Dogs bark.");
});
