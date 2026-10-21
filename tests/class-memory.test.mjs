/* Class memory follows the real class: its own saved work only (two classes on one book stay apart), this school
 * year only, a unit saved again counts once, and "earlier" means earlier in the course. */
import test from "node:test";
import assert from "node:assert/strict";
import { buildClassMemory, reviewPlan, memorySummary, schoolYearStart } from "../desktop/renderer/studio/class-memory.js";

const DAY = 86400000;
const NOW = new Date(2026, 9, 21).getTime(); // 21 Oct 2026
const ago = (d) => new Date(NOW - d * DAY).toISOString();
const ws = (profileId, unit, days, words, book = "Cambridge Primary Path 1") =>
  ({ profileId, savedAt: ago(days), label: `Unit ${unit} · ${book}`, form: { bookTitle: book, unit: String(unit) }, data: { lingoLauncher: { vocabulary: words.map((english) => ({ english })) } } });

test("two classes on the same book keep separate memories", () => {
  const units = [ws("A_SENIOR", 1, 30, ["cat", "dog"]), ws("B_SENIOR", 1, 30, ["bed", "sofa"])];
  const a = buildClassMemory({ units, levelId: "A_SENIOR", now: NOW });
  const b = buildClassMemory({ units, levelId: "B_SENIOR", now: NOW });
  assert.deepEqual([...a.words.keys()], ["cat", "dog"]);
  assert.deepEqual([...b.words.keys()], ["bed", "sofa"]);
});

test("only this school year counts", () => {
  assert.equal(new Date(schoolYearStart(NOW)).getMonth(), 8);
  assert.equal(new Date(schoolYearStart(new Date(2027, 6, 1).getTime())).getFullYear(), 2026, "July still belongs to the year that began last September");
  const mem = buildClassMemory({ units: [ws("A_SENIOR", 1, 200, ["cat"]), ws("A_SENIOR", 2, 20, ["kite"])], levelId: "A_SENIOR", now: NOW });
  assert.deepEqual([...mem.words.keys()], ["kite"]);
  assert.equal(mem.older, 1);
});

test("a unit saved again is one encounter, dated by its first save", () => {
  const mem = buildClassMemory({ units: [ws("A_SENIOR", 1, 30, ["cat"]), ws("A_SENIOR", 1, 2, ["cat"]), ws("A_SENIOR", 1, 1, ["cat"])], levelId: "A_SENIOR", now: NOW });
  const cat = mem.words.get("cat");
  assert.equal(cat.met, 1);
  assert.equal(cat.lastAt, NOW - 30 * DAY);
  assert.equal(mem.items, 1);
  const plan = reviewPlan(mem, { now: NOW });
  assert.deepEqual(plan.due.map((w) => w.english), ["cat"], "met once 30 days ago: due (re-saving didn't reset it)");
});

test("earlier means earlier in the course: this unit and units prepared ahead are left out", () => {
  const units = [ws("A_SENIOR", 1, 30, ["cat"]), ws("A_SENIOR", 5, 30, ["kitchen"]), ws("A_SENIOR", 6, 30, ["planet"]), ws("A_SENIOR", 2, 30, ["rain"], "Cambridge Primary Path 2")];
  const mem = buildClassMemory({ units, levelId: "A_SENIOR", now: NOW });
  const plan = reviewPlan(mem, { now: NOW, current: { bookId: "CPP1", unit: 5 } });
  assert.deepEqual(plan.due.map((w) => w.english).sort(), ["cat", "rain"]);
  assert.equal(plan.ahead, 2);
  assert.deepEqual(reviewPlan(mem, { now: NOW }).due.length, 4, "a topic test may use them all");
});

test("nothing due: the next words and their dates are offered", () => {
  const mem = buildClassMemory({ units: [ws("A_SENIOR", 1, 3, ["cat", "dog"])], levelId: "A_SENIOR", now: NOW });
  const plan = reviewPlan(mem, { now: NOW, current: { bookId: "CPP1", unit: 2 } });
  assert.equal(plan.due.length, 0);
  assert.deepEqual(plan.upcoming.map((w) => w.english), ["cat", "dog"]);
  assert.equal(plan.upcoming[0].dueAt, NOW - 3 * DAY + 7 * DAY);
});

test("the summary says what the memory is built from", () => {
  const units = [ws("A_SENIOR", 1, 30, ["cat"]), ws("A_SENIOR", 2, 20, ["kite"]), ws("A_SENIOR", 3, 10, ["sun"])];
  const docs = [{ kind: "test", savedAt: ago(5), meta: { classProfile: "A_SENIOR", bookTitle: "Cambridge Primary Path 1", unit: 3 }, focusWords: [{ english: "sun" }] }];
  assert.equal(memorySummary(buildClassMemory({ units, docs, levelId: "A_SENIOR", now: NOW })), "Primary Path 1 Units 1–3 · 1 test");
});
