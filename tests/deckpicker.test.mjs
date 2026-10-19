/* The arcade's "Choose your words": coursebook → unit → lesson section → word, and how a pick is described. */
import test from "node:test";
import assert from "node:assert/strict";
import { listBooks, unitSections, unitInfo, filterWords, describePick, pickBreakdown, searchWords, randomPick, typeGroup, rowById, wordLevel, lengthBand, parsePages, wordsOnPages, pagesSummary, logPlayed, recentWords, saveDeck, deleteDeck, reviewPick } from "../desktop/renderer/arcade/deck-source.js";

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

test("deck source: by page — Student's Book and Workbook pages, across units and sections", () => {
  assert.deepEqual(parsePages("pp. 34–41, 50"), [[34, 41], [50, 50]]);
  assert.deepEqual(parsePages("p 12"), [[12, 12]]);
  assert.deepEqual(parsePages("none"), []);
  const sb = wordsOnPages("CPP1", "34-41");
  assert.ok(sb.length > 10);
  assert.ok(sb.every((w) => w.bookId === "CPP1" && w.source !== "wb" && w.sbPage >= 34 && w.sbPage <= 41));
  assert.ok(new Set(sb.map((w) => w.section)).size >= 2, "a page range spans the unit's sections");
  // A range across a unit boundary picks words from both units.
  const across = wordsOnPages("CPP1", "45-55");
  assert.ok(new Set(across.map((w) => w.unit)).size >= 2, `units ${[...new Set(across.map((w) => w.unit))]}`);
  assert.match(pagesSummary(across), /^Units \d–\d · pp\. \d+–\d+$/);
  const wb = wordsOnPages("CPP1", "13-20", { sb: false, wb: true });
  assert.ok(wb.length > 0 && wb.every((w) => w.source === "wb" && w.wbPage >= 13 && w.wbPage <= 20));
  assert.equal(wordsOnPages("CPP1", "13-20", { sb: true, wb: true }).length, wb.length + wordsOnPages("CPP1", "13-20").length);
});

test("deck source: level, length, phrases, recordings and recently played words filter the list", () => {
  assert.equal(wordLevel({ english: "cat" }), 1);
  assert.equal(wordLevel({ english: "neighborhood" }), 3);
  assert.equal(lengthBand({ english: "cat" }), "short");
  assert.equal(lengthBand({ english: "teacher" }), "medium");
  assert.equal(lengthBand({ english: "firefighter" }), "long");
  const rows = unitSections("CPP1", 2).flatMap((s) => s.words);
  const easy = filterWords(rows, { levels: new Set([1]) });
  assert.ok(easy.length > 0 && easy.length < rows.length && easy.every((w) => wordLevel(w) === 1));
  const long = filterWords(rows, { lengths: new Set(["long"]) });
  assert.ok(long.every((w) => w.english.replace(/[^a-z]/gi, "").length >= 9));
  const single = filterWords(rows, { phrases: "none" });
  assert.ok(single.every((w) => !/\s/.test(w.english.trim())));
  assert.equal(filterWords(rows, { voiceOnly: true }, () => true, () => false).length, 0);
  const played = new Set([rows[0].english.toLowerCase()]);
  assert.ok(!filterWords(rows, { exclude: played }).some((w) => w.english.toLowerCase() === rows[0].english.toLowerCase()));
});

test("deck source: the played-words log keeps the newest words and knows this week's", () => {
  const day = 24 * 3600 * 1000;
  const now = 100 * day;
  let log = logPlayed({}, [{ english: "Apple" }, "bread"], now - 10 * day);
  log = logPlayed(log, [{ english: "cheese" }], now - day);
  assert.deepEqual([...recentWords(log, { days: 7, now })], ["cheese"]);
  assert.equal(recentWords(log, { days: 30, now }).size, 3);
  const capped = logPlayed({}, ["a", "b", "c", "d"].map((x, i) => x), now, 2);
  assert.equal(Object.keys(capped).length, 2);
});

test("deck source: saved decks by name (same name replaces), quick review picks", () => {
  const ids = unitSections("CPP1", 3).find((s) => s.key === "A").words.map((w) => w.id);
  let list = saveDeck([], "Monday review", ids, 1000);
  list = saveDeck(list, "  ", ids.slice(0, 4), 2000);
  assert.equal(list.length, 2);
  assert.equal(list[0].name, describePick(ids.slice(0, 4)), "an empty name falls back to the pick's description");
  list = saveDeck(list, "monday REVIEW", ids.slice(0, 3), 3000);
  assert.equal(list.length, 2);
  assert.deepEqual(list[0].ids, ids.slice(0, 3));
  assert.equal(deleteDeck(list, list[0].id).length, 1);
  const review = reviewPick("CPP2", 4, 12, () => 0.42);
  assert.equal(review.length, 12);
  assert.equal(new Set(review.map((w) => w.id)).size, 12);
  assert.ok(review.every((w) => w.bookId === "CPP2" && w.unit >= 1 && w.unit <= 4));
});
