import { test } from "node:test";
import assert from "node:assert/strict";
import { CPP_WORDBANK, getCppUnitStructure } from "../desktop/renderer/coursebook-data.js";
import { readLesson } from "../scripts/lessons/lib/catalog.mjs";
import { sectionCounts, unitWords } from "../desktop/renderer/studio/unit-context.js";

const key = (w) => w.english.trim().toLowerCase();
const sectionOf = (w) => (w.source === "wb" ? "WB" : w.section);

test("one entry per headword in each section of a unit", () => {
  const seen = new Map();
  const dups = [];
  for (const w of CPP_WORDBANK) {
    const k = `${w.bookId} U${w.unit} ${sectionOf(w)} ${key(w)}`;
    if (seen.has(k)) dups.push(`${k} (${seen.get(k)}, ${w.id})`);
    else seen.set(k, w.id);
  }
  assert.deepEqual(dups, []);
});

test("ids are unique and every text field is trimmed, without double spaces", () => {
  assert.equal(new Set(CPP_WORDBANK.map((w) => w.id)).size, CPP_WORDBANK.length);
  const bad = CPP_WORDBANK.filter((w) => ["english", "greek", "example"].some((f) => w[f] !== w[f].trim() || / {2}/.test(w[f])));
  assert.deepEqual(bad.map((w) => w.id), []);
});

test("every word sits on a page of its unit and section", () => {
  const wrong = [];
  for (const w of CPP_WORDBANK) {
    if (w.unit === 0) continue;
    const u = getCppUnitStructure(w.bookId, w.unit);
    if (w.source === "wb") {
      const sub = w.page <= u.wbStart + 4 ? "A" : "B";
      if (w.page < u.wbStart || w.page > u.wbEnd || w.wbSubSection !== sub || w.wbPage !== w.page) wrong.push(w.id);
      continue;
    }
    const span = { BQ: [u.sbStart, u.sbStart + 1], A: [u.sbStart + 2, u.sbStart + 9], B: [u.sbStart + 10, u.sbEnd] }[w.section] || [u.sbStart, u.sbEnd];
    const loc = w.location.match(/^(\d)([AB])$/);
    if (w.page < span[0] || w.page > span[1] || w.sbPage !== w.page || (loc && (Number(loc[1]) !== w.unit || loc[2] !== w.section))) wrong.push(w.id);
  }
  assert.deepEqual(wrong, []);
});

test("each lesson holds its section's words, each once, and no other words", () => {
  for (const bookId of ["CPP1", "CPP2", "CPP3"]) for (let unit = 1; unit <= 9; unit++) for (const section of ["BQ", "A", "B"]) {
    const lesson = readLesson(bookId, unit, section);
    if (!lesson) continue;
    const rows = [...lesson.focusWords.map((f) => f.wordId), ...(lesson.extensionWords || [])].map((id) => CPP_WORDBANK.find((w) => w.id === id));
    const words = rows.map(key);
    assert.equal(new Set(words).size, words.length, `${lesson.id} repeats a word`);
    assert.deepEqual(rows.filter((w) => w.bookId !== bookId || w.unit !== unit || w.section !== section || w.source !== "sb").map((w) => w.id), [], `${lesson.id} has another section's words`);
    const expected = new Set(CPP_WORDBANK.filter((w) => w.bookId === bookId && w.unit === unit && w.section === section && w.source === "sb").map(key));
    assert.deepEqual([...expected].filter((k) => !words.includes(k)), [], `${lesson.id} misses words`);
  }
});

test("a word printed in two sections counts in both", () => {
  // CPP3 Unit 2: "order" is in the Big Question and in Lesson A.
  assert.ok(unitWords("CPP3", 2, ["BQ"]).some((w) => w.english === "order"));
  assert.ok(unitWords("CPP3", 2, ["A"]).some((w) => w.english === "order"));
  const counts = sectionCounts("CPP3", 2);
  assert.equal(counts.A, unitWords("CPP3", 2, ["A"]).length);
});
