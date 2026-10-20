// Which of a unit's words to use: "all the words", "15 words", "a mix", "only…", "except…", parts of the unit —
// read from the teacher's request and turned into the words themselves.
import test from "node:test";
import assert from "node:assert/strict";
import { findWordChoice, chooseUnitWords, normalizeChoice, describeChoice, cutList } from "../desktop/renderer/studio/word-choice.js";
import { parseRequest, completePlan, planSummary, mergeAiPlan } from "../desktop/renderer/studio/assistant.js";
import { unitWords } from "../desktop/renderer/studio/unit-context.js";

const choice = (t) => findWordChoice(t).choice;

test("the assistant reads how many of the unit's words, in English and Greek", () => {
  assert.deepEqual(choice("a test for unit 4 with all the words"), { mode: "all" });
  assert.deepEqual(choice("όλες τις λέξεις της ενότητας 4"), { mode: "all" });
  assert.deepEqual(choice("test on unit 4, only the key words"), { mode: "key" });
  assert.deepEqual(choice("dictation for unit 3 with 10 words"), { mode: "some", count: 10 });
  assert.deepEqual(choice("a few words from the big question"), { mode: "some", count: 8, sections: ["BQ"] });
  assert.equal(choice("a mix of key words and other words").mode, "mix");
  assert.equal(choice("guided writing of about 40 words"), null, "a writing length is not a word count");
  assert.equal(choice("a test without greek"), null);
  assert.equal(choice("make a quiz with pictures"), null);
});

test("parts of the unit: named parts are in, 'except / without / not' takes them out", () => {
  assert.deepEqual(choice("15 words from lesson A and the workbook"), { mode: "some", count: 15, sections: ["A", "WB"] });
  assert.deepEqual(choice("test on the whole unit and the workbook"), { mode: "all", sections: ["BQ", "A", "B", "WB"] });
  assert.deepEqual(choice("the workbook words of unit 3"), { sections: ["WB"], mode: "all" }, "a part alone means all of its words");
  assert.deepEqual(choice("unit 5 without the workbook"), { sections: ["BQ", "A", "B"] });
  assert.deepEqual(choice("all the words except the big question words"), { mode: "all", sections: ["A", "B"] });
  assert.deepEqual(choice("key words but not from lesson B"), { mode: "key", sections: ["BQ", "A"] });
});

test("word lists: only these, all except these — and the list stops where the request goes on", () => {
  assert.deepEqual(choice("test unit 4 only the words volcano, lava and ash"), { mode: "pick", only: ["volcano", "lava", "ash"] });
  assert.deepEqual(choice("μόνο τις λέξεις volcano, lava"), { mode: "pick", only: ["volcano", "lava"] });
  const r = findWordChoice("unit 4 test, all the words except crater and lava, without pictures, called \"Volcano test\"");
  assert.deepEqual(r.choice, { except: ["crater", "lava"], mode: "all" });
  assert.match(r.rest, /without pictures, called "Volcano test"/, "the rest of the request is left to read");
  assert.equal(cutList("crater and lava, for my D class"), "crater and lava");
  assert.equal(cutList("crater, lava plus the words ash"), "crater, lava");
});

test("a choice becomes the words: key words first, never more than asked", () => {
  const pool = unitWords("CPP2", 3, ["BQ", "A", "B"]);
  const keys = pool.filter((_, i) => i % 3 === 0).map((w) => w.english);
  // Regression (2026-10-20): when the key words alone filled the number, the "rest" asked for 0 words and got all of them.
  for (const n of [5, 10, keys.length, keys.length + 4]) {
    const out = chooseUnitWords(pool, keys, { mode: "some", count: n }).words;
    assert.equal(out.length, Math.min(n, pool.length), `some ${n}`);
    const keyed = out.filter((w) => keys.includes(w.english)).length;
    assert.equal(keyed, Math.min(n, keys.length), "key words come first");
  }
  const mix = chooseUnitWords(pool, keys, { mode: "mix", count: 10 }).words;
  assert.equal(mix.length, 10);
  assert.equal(mix.filter((w) => keys.includes(w.english)).length, 5, "half key words");
  assert.equal(chooseUnitWords(pool, keys, { mode: "all" }).words.length, pool.length);
  assert.equal(chooseUnitWords(pool, keys, { mode: "key" }).words.length, keys.length);
  assert.equal(chooseUnitWords(pool, [], { mode: "key" }).words.length, 15, "no lessons: a spread of 15");
  const ex = chooseUnitWords(pool, keys, { mode: "all", except: [pool[0].english, pool[1].english.toUpperCase()] });
  assert.equal(ex.words.length, pool.length - 2);
  const pick = chooseUnitWords(pool, keys, { mode: "pick", only: [pool[4].english, "skateboard"] });
  assert.deepEqual(pick.words.map((w) => w.english), [pool[4].english]);
  assert.deepEqual(pick.missing, ["skateboard"], "words not in the unit come back to be added as own words");
  for (const n of [3, 8, 12, 20]) assert.ok(chooseUnitWords(pool, keys, { mode: "some", count: n }).words.length <= n);
});

test("choices are cleaned and described the way a teacher would say them", () => {
  assert.deepEqual(normalizeChoice({ mode: "nonsense", sections: ["XX"] }), { mode: "key", count: 0, sections: ["BQ", "A", "B"], only: [], except: [] });
  assert.equal(normalizeChoice({ mode: "smart" }, { classCount: 18 }).count, 18);
  assert.equal(normalizeChoice({ mode: "some", count: 500 }).count, 60);
  assert.equal(describeChoice({ mode: "all", sections: ["A", "WB"] }), "all the words of Lesson A and the Workbook");
  assert.equal(describeChoice({ mode: "some", count: 12 }), "12 words (key words first)");
  assert.equal(describeChoice({ mode: "key", except: ["ash"] }), "the key words, except ash");
});

test("the assistant plans with the word choice, skills left out, items, pictures, title and the writer", () => {
  const ctx = { bookId: "CPP2", unit: 4, level: "B_SENIOR" };
  const plan = (t) => completePlan(parseRequest(t, ctx), ctx);
  const a = plan("test on PP2 unit 4, 15 words from lesson A and the workbook, no listening, 5 questions each, plus the words skateboard");
  assert.deepEqual(a.vocab, { mode: "some", count: 15, sections: ["A", "WB"], only: [], except: [] });
  assert.deepEqual(a.skills, ["reading", "vocabulary", "grammar", "writing"]);
  assert.equal(a.items, 5);
  assert.deepEqual(a.words.map((w) => w.english), ["skateboard"]);
  assert.match(planSummary(a), /15 words of Lesson A and the Workbook \(key words first\); 5 questions a part; also your words: skateboard/);

  const b = plan("unit 4 test, all the words except crater and lava, without pictures, called \"Volcano test\"");
  assert.deepEqual([b.vocab.mode, b.vocab.except, b.pictures, b.title], ["all", ["crater", "lava"], false, "Volcano test"]);
  const c = plan("a dictation for unit 3 with 10 words from the book sentences");
  assert.deepEqual([c.kind, c.writer, c.vocab.mode, c.vocab.count], ["dictation", "book", "some", 10]);
  assert.deepEqual(plan("κάνε ένα τεστ για την ενότητα 4 με όλες τις λέξεις χωρίς ακρόαση").skills, ["reading", "vocabulary", "grammar", "writing"]);
  assert.equal(plan("a 30 minute test on unit 2 without speaking or writing").skills.includes("writing"), false);
  assert.deepEqual(plan("worksheets for unit 6 for my C class").vocab, { mode: "smart", count: 18, sections: ["BQ", "A", "B"], only: [], except: [] });
  assert.equal(plan("a test for unit 4").vocab.mode, "key", "tests start from the key words, as the makers do");

  // The AI's reading of a fuzzy request carries the same fields.
  const m = mergeAiPlan({}, { vocab: { mode: "all", sections: ["A", "ZZ"], except: ["ash"] }, addWords: ["crater"], items: 6, writer: "book", pictures: false, title: "Revision" });
  assert.deepEqual(m.vocab, { mode: "all", sections: ["A"], except: ["ash"] });
  assert.deepEqual([m.words.map((w) => w.english), m.items, m.writer, m.pictures, m.title], [["crater"], 6, "book", false, "Revision"]);
});
