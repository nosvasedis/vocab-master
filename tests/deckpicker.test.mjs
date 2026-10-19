/* The arcade's "Choose your words": coursebook → unit → lesson section → word, and how a pick is described. */
import test from "node:test";
import assert from "node:assert/strict";
import { listBooks, unitSections, unitInfo, filterWords, describePick, pickBreakdown, searchWords, randomPick, typeGroup, rowById } from "../desktop/renderer/arcade/deck-source.js";

test("deck source: three books of nine units, each unit split into its printed sections", () => {
  const books = listBooks();
  assert.deepEqual(books.map((b) => b.id), ["CPP1", "CPP2", "CPP3"]);
  for (const b of books) assert.equal(b.units.length, 9);
  const secs = unitSections("CPP1", 1);
  assert.deepEqual(secs.map((s) => s.key), ["BQ", "A", "B", "WB"]);
  assert.ok(secs.every((s) => s.words.length > 0 && s.words.every((w) => w.bookId === "CPP1" && w.unit === 1)));
  assert.ok(unitInfo("CPP1", 1).title.length > 3);
  assert.equal(unitInfo("CPP1", 1).count, secs.reduce((n, s) => n + s.words.length, 0));
});

test("deck source: filters keep word groups and pictures", () => {
  const rows = unitSections("CPP1", 2).flatMap((s) => s.words);
  const nouns = filterWords(rows, { groups: new Set(["noun"]) });
  assert.ok(nouns.length > 0 && nouns.every((w) => typeGroup(w.type) === "noun"));
  assert.equal(filterWords(rows, {}).length, rows.length);
  assert.equal(filterWords(rows, { pictureOnly: true }, () => false).length, 0);
  assert.equal(typeGroup("phr. v."), "verb");
  assert.equal(typeGroup("adv."), "adj");
});

test("deck source: a pick is described the way a teacher would say it", () => {
  const ids = (b, u, key) => unitSections(b, u).find((s) => s.key === key).words.map((w) => w.id);
  assert.equal(describePick([]), "No words picked");
  assert.equal(describePick(ids("CPP1", 3, "A")), "Primary Path 1 · Unit 3 (A)");
  assert.equal(describePick([...ids("CPP1", 3, "A"), ...ids("CPP1", 3, "B")]), "Primary Path 1 · Unit 3 (A, B)");
  const whole = unitSections("CPP2", 4).flatMap((s) => s.words.map((w) => w.id));
  assert.equal(describePick(whole), "Primary Path 2 · Unit 4");
  assert.equal(describePick([...ids("CPP1", 1, "A"), ...ids("CPP1", 2, "A"), ...ids("CPP1", 3, "A")]), "Primary Path 1 · Units 1, 2 and 3");
  assert.match(describePick([...ids("CPP1", 1, "A"), ...ids("CPP3", 1, "A")]), /Primary Path 1 \+ Primary Path 3 · \d+ words/);
});

test("deck source: the breakdown lists each unit section once, in book order", () => {
  const a = unitSections("CPP1", 2).find((s) => s.key === "B").words.slice(0, 3).map((w) => w.id);
  const b = unitSections("CPP1", 1).find((s) => s.key === "A").words.slice(0, 2).map((w) => w.id);
  const parts = pickBreakdown([...a, ...b]);
  assert.deepEqual(parts.map((p) => [p.unit, p.key, p.count]), [[1, "A", 2], [2, "B", 3]]);
});

test("deck source: search finds words across books, best matches first", () => {
  const hits = searchWords("apple");
  assert.ok(hits.length >= 2);
  assert.ok(hits.every((w) => w.english.toLowerCase().includes("apple")));
  assert.deepEqual(searchWords("a"), []); // too short to be useful
  assert.ok(rowById.get(hits[0].id));
  const picked = randomPick([1, 2, 3, 4, 5, 6], 3, () => 0.4);
  assert.equal(picked.length, 3);
  assert.equal(new Set(picked).size, 3);
});
