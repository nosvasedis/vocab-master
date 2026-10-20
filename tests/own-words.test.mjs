// The teacher's own words, mixed in with a unit's (or a topic's) words: tests, dictations, the arcade, the assistant.
import test from "node:test";
import assert from "node:assert/strict";
import { parseOwnWords, addOwnWords, ownWordEntry, mergeOwnWords } from "../desktop/renderer/studio/own-words.js";
import { testDefaults, testPrompt, planProblems, buildTestDoc } from "../desktop/renderer/studio/test-builder.js";
import { bookSentences } from "../desktop/renderer/studio/dictation.js";
import { describeDeck, ownNotPicked, saveDeck, unitSections } from "../desktop/renderer/arcade/deck-source.js";
import { findOwnWords, parseRequest, planSummary } from "../desktop/renderer/studio/assistant.js";

test("own words are typed or pasted, with the Greek if the teacher likes", () => {
  assert.deepEqual(parseOwnWords("crater, ash cloud;lava\n  volcano - ηφαίστειο\n2. ash = στάχτη\n• crater (κρατήρας)\nκρατήρας\n\n"), [
    { english: "crater", greek: "" },
    { english: "ash cloud", greek: "" },
    { english: "lava", greek: "" },
    { english: "volcano", greek: "ηφαίστειο" },
    { english: "ash", greek: "στάχτη" },
  ]);
  // A dash between English words is part of the word, not a translation.
  assert.deepEqual(parseOwnWords("well-known, T-shirt"), [{ english: "well-known", greek: "" }, { english: "T-shirt", greek: "" }]);
  const list = addOwnWords([{ english: "Lava", greek: "λάβα" }], "lava, crater");
  assert.deepEqual(list.map((w) => w.english), ["Lava", "crater"], "no repeats, the teacher's first entry wins");
});

test("an own word takes the coursebook's details when a book has it; the teacher's Greek wins", () => {
  const hit = ownWordEntry({ english: "volcano", greek: "" });
  assert.equal(hit.own, true);
  assert.equal(hit.inBook, true);
  assert.ok(hit.example && hit.type && hit.greek, "type, Greek and example from the word bank");
  assert.equal(ownWordEntry({ english: "volcano", greek: "ΗΦΑΙΣΤΕΙΟ" }).greek, "ΗΦΑΙΣΤΕΙΟ");
  const none = ownWordEntry({ english: "skateboard ramp", greek: "" });
  assert.deepEqual([none.inBook, none.example, none.type], [false, "", ""]);
  const merged = mergeOwnWords([{ english: "lava", type: "n." }], [{ english: "LAVA" }, { english: "crater" }]);
  assert.deepEqual(merged.map((w) => [w.english, !!w.own]), [["lava", false], ["crater", true]], "an own word already in the unit's list isn't added twice");
});

test("unit tests tell the AI about own words, and topic tests can be built around words", () => {
  const unitSpec = { ...testDefaults("B_SENIOR", "quiz"), source: { kind: "unit" } };
  const focus = [{ english: "lava", type: "n." }, { english: "crater", own: true }];
  const { user } = testPrompt(unitSpec, { focusWords: focus });
  assert.match(user, /TEST THESE WORDS[^\n]*lava[^\n]*crater/);
  assert.match(user, /The teacher added some words of their own \(not from the unit\): crater/);

  const topicSpec = { ...testDefaults("B_SENIOR", "quiz"), source: { kind: "topic" }, topic: "", grammar: [] };
  assert.equal(planProblems(topicSpec, { focusWords: focus, pictureWords: ["lava", "crater", "volcano"] }).length, 0, "words alone are enough for a topic test");
  assert.match(planProblems(topicSpec, { focusWords: focus }).join(" "), /needs 3\+ words with pictures \(add them under the topic\)/);
  const t = testPrompt(topicSpec, { focusWords: focus }).user;
  assert.match(t, /the words below are what this test is about/);
  assert.match(t, /TEST THESE WORDS in the vocabulary parts[^\n]*lava \(n\.\), crater/);

  const doc = buildTestDoc(unitSpec, { sections: [] }, { levelId: "B_SENIOR", focusWords: focus, meta: { unit: 4 } });
  assert.deepEqual(doc.focusWords.map((w) => !!w.own), [false, true], "a saved test remembers which words were the teacher's own");
});

test("coursebook-sentence dictations put the teacher's own words first", () => {
  const spec = { levelId: "C_SENIOR", length: "level", difficulty: "level", count: 2 };
  const words = [
    { english: "apple", example: "I eat an apple every day after school." },
    { english: "river", example: "We swim in the river in the summer." },
    { english: "bridge", example: "The old bridge goes over the wide river.", own: true },
  ];
  for (let i = 0; i < 5; i++) {
    const out = bookSentences(spec, words);
    assert.equal(out[0].targets[0], "bridge");
    assert.equal(out.length, 2);
  }
});

test("arcade decks mix picked book words with the teacher's own words", () => {
  const ids = unitSections("CPP2", 4)[0].words.slice(0, 4).map((w) => w.id);
  const first = unitSections("CPP2", 4)[0].words[0].english;
  const own = [{ english: first }, { english: "crater", greek: "κρατήρας" }, { english: "ash cloud" }];
  assert.deepEqual(ownNotPicked(ids, own).map((w) => w.english), ["crater", "ash cloud"], "a word already picked isn't counted twice");
  assert.match(describeDeck(ids, own), /^Primary Path 2 · Unit 4.* \+ 2 own words$/);
  assert.equal(describeDeck([], own.slice(1)), "Your own words · 2 words");
  const list = saveDeck([], "Volcano day", ids, 1000, own.slice(1));
  assert.deepEqual(list[0].own, [{ english: "crater", greek: "κρατήρας" }, { english: "ash cloud", greek: "" }]);
  assert.equal(saveDeck([], "Plain", ids, 2000)[0].own, undefined, "a deck without own words stays as before");
});

test("the assistant reads the words a teacher names", () => {
  const ctx = { bookId: "CPP2", unit: 4 };
  const a = parseRequest("a test for unit 4 of PP2, plus the words crater, lava and ash cloud", ctx);
  assert.deepEqual(a.words.map((w) => w.english), ["crater", "lava", "ash cloud"]);
  assert.equal(a.source.kind, "unit");
  assert.deepEqual(parseRequest("dictation for unit 3 also test: island, coast", ctx).words.map((w) => w.english), ["island", "coast"]);
  assert.deepEqual(parseRequest("κάνε μου ένα τεστ για την ενότητα 3 και τις λέξεις volcano, lava", ctx).words.map((w) => w.english), ["volcano", "lava"]);
  assert.deepEqual(parseRequest("a test for unit 2, extra words: penguin - πιγκουίνος, seal", ctx).words, [{ english: "penguin", greek: "πιγκουίνος" }, { english: "seal", greek: "" }]);
  // The named words don't turn into the topic, and "the words of unit 4" isn't a list.
  const g = parseRequest("B class test on Present Simple with the words breakfast, lunch", ctx);
  assert.equal(g.source.topic, "Present Simple");
  assert.equal(findOwnWords("a test with the words of unit 4").words.length, 0);
  assert.equal(findOwnWords("make a quiz for my D class with pictures").words.length, 0);
  assert.match(planSummary({ kind: "test", levelId: "B_SENIOR", source: { kind: "unit", bookId: "CPP2", units: [4] }, words: a.words }), /also your words: crater, lava, ash cloud/);
});
