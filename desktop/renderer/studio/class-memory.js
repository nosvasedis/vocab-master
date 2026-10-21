/* Vocab Master — class memory (pure): what a class has already met, from the Library.
 *
 * Every saved worksheet unit (Lingo Launcher), read-aloud dictation and test is an "encounter" with its words.
 * From those, per class: when each word was first and last met, how often, and when it was last tested. The
 * review suggestion is spaced repetition in the Leitner style: after each encounter the gap before the next review
 * doubles (1 week, 2, 4, 8…), so a word met once three weeks ago is "due" and one met four times last week is not.
 *
 * What counts, so the memory matches the children in front of the teacher:
 * - the class is the class the teacher is making for (A Senior, B Senior…) — never the book's usual class, so two
 *   classes on the same book keep separate memories;
 * - this school year only (from 1 September): last year's A Senior were other children;
 * - a unit saved again (re-generated, edited, duplicated) is one encounter, not one per save;
 * - "earlier" means earlier in the course: when the new test is Primary Path 1 Unit 5, words of Units 5–9 of that
 *   book (prepared ahead, or the unit itself) are not offered as review.
 * Words never tested come first, and words the current test already uses are left out.
 *
 * It only reads what the teacher saved; it runs only when the teacher has turned it on. */

import { resolveCoursebookId } from "../coursebook-data.js";

const DAY = 86400000;
const key = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
const when = (d) => { const t = new Date(d || 0).getTime(); return Number.isFinite(t) ? t : 0; };
const firstUnit = (u) => { const m = String(u ?? "").match(/\d+/); return m ? Number(m[0]) : 0; };
const unitList = (u) => (String(u ?? "").match(/\d+/g) || []).map(Number);

/** 1 September of the school year `now` falls in (Greek schools; July–August still belong to the year before). */
export function schoolYearStart(now = Date.now()) {
  const d = new Date(now);
  const y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
  return new Date(y, 8, 1).getTime();
}

/**
 * units: saved worksheet sessions ({ profileId, savedAt, label, form: { bookTitle, unit }, data.lingoLauncher.vocabulary })
 * docs: saved tests and dictations ({ kind, meta: { classProfile, bookTitle, unit, title }, savedAt, focusWords })
 * since: ignore encounters before this time (default: the start of this school year; 0 = everything).
 * Returns { levelId, since, words: Map(key → entry), items, encounters: [...], older }
 *   entry: { english, greek, met, firstAt, lastAt, testedAt, sources: [{ type, title, at }], hits: [{ at, type, bookId, unit }] }
 */
export function buildClassMemory({ units = [], docs = [], levelId = "", since, now = Date.now() } = {}) {
  const from = since ?? schoolYearStart(now);
  const encounters = [];
  let older = 0;
  const push = (enc) => {
    if (!enc.words.length) return;
    if (enc.at && enc.at < from) { older++; return; }
    encounters.push(enc);
  };
  // Worksheet units: one encounter per book + unit, dated by its first save (when the class met it).
  const byUnit = new Map();
  for (const s of units) {
    if (levelId && s?.profileId !== levelId) continue;
    const list = s?.data?.lingoLauncher?.vocabulary || [];
    if (!list.length) continue;
    const bookTitle = s.form?.bookTitle || s.data?.meta?.bookTitle || "";
    const unit = s.form?.unit ?? s.data?.meta?.unit ?? "";
    const bookId = resolveCoursebookId(bookTitle) || key(bookTitle);
    const at = when(s.createdAt || s.savedAt);
    const id = bookId && unit !== "" ? `${bookId}|${unit}` : `save|${s.id || s.label || at}`;
    const prev = byUnit.get(id);
    if (prev) {
      prev.at = Math.min(prev.at || at, at);
      prev.words.push(...list);
      prev.saves++;
    } else byUnit.set(id, { type: "unit", title: s.label || "Worksheets", at, bookId, unit: firstUnit(unit), units: unitList(unit), words: [...list], saves: 1 });
  }
  byUnit.forEach(push);
  for (const d of docs) {
    if (!d || (d.kind !== "test" && d.kind !== "dictation")) continue;
    if (levelId && d.meta?.classProfile !== levelId) continue;
    const bookTitle = d.meta?.bookTitle || "";
    push({
      type: d.kind, title: d.meta?.title || (d.kind === "test" ? "Test" : "Dictation"), at: when(d.savedAt || d.createdAt),
      bookId: resolveCoursebookId(bookTitle) || key(bookTitle), unit: firstUnit(d.meta?.unit), units: unitList(d.meta?.unit), words: d.focusWords || [],
    });
  }

  const words = new Map();
  for (const enc of encounters) {
    const seen = new Set();
    for (const w of enc.words) {
      const english = String(w?.english || "").trim();
      if (!english || english.length > 40) continue;
      const k = key(english);
      if (seen.has(k)) continue;
      seen.add(k);
      const e = words.get(k) || { english, greek: "", met: 0, firstAt: enc.at, lastAt: 0, testedAt: 0, sources: [], hits: [] };
      e.greek ||= String(w.greek || "").trim();
      e.met += 1;
      e.firstAt = Math.min(e.firstAt || enc.at, enc.at);
      e.lastAt = Math.max(e.lastAt, enc.at);
      if (enc.type === "test") e.testedAt = Math.max(e.testedAt, enc.at);
      if (e.sources.length < 6) e.sources.push({ type: enc.type, title: enc.title, at: enc.at });
      e.hits.push({ at: enc.at, type: enc.type, bookId: enc.bookId, unit: enc.unit });
      words.set(k, e);
    }
  }
  return { levelId, since: from, words, items: encounters.length, encounters, older };
}

/** Days until a word is due again after `met` encounters: 7, 14, 28, 56 (capped at 8 weeks). */
export const reviewGap = (met) => 7 * 2 ** Math.min(3, Math.max(0, met - 1));

/** Is an encounter at or after the unit being made now (same book)? Those words aren't "earlier" yet. */
const ahead = (hit, current) => !!current?.bookId && hit.bookId === current.bookId && hit.unit > 0 && current.unit > 0 && hit.unit >= current.unit;

/** A word as the class knows it before `current`: only its earlier encounters (null when it has none). */
function earlierView(e, current) {
  if (!current?.bookId) return e;
  const hits = e.hits.filter((h) => !ahead(h, current));
  if (!hits.length) return null;
  if (hits.length === e.hits.length) return e;
  const tests = hits.filter((h) => h.type === "test").map((h) => h.at);
  return { ...e, met: hits.length, lastAt: Math.max(...hits.map((h) => h.at)), testedAt: tests.length ? Math.max(...tests) : 0 };
}

const toItem = (e, now) => {
  const days = (now - e.lastAt) / DAY;
  const gap = reviewGap(e.met);
  const due = days / gap;
  // Never tested comes first; then the most overdue; a word tested since it was last met waits a little longer.
  const score = due + (e.testedAt ? 0 : 1.5) - (e.testedAt && e.testedAt >= e.lastAt ? 0.5 : 0);
  return { english: e.english, greek: e.greek, met: e.met, lastAt: e.lastAt, testedAt: e.testedAt, dueAt: e.lastAt + gap * DAY, ratio: due, due: score, why: whyLine(e, days) };
};

/**
 * Everything the review panel needs, for the unit being made now.
 * current: { bookId, unit } (the first unit of the new test / dictation) — words of that unit and later ones in the
 * same book are left out. Returns { due: [...], upcoming: [...], earlier: n (words the class met before), ahead: n }.
 */
export function reviewPlan(memory, { exclude = [], n = 10, now = Date.now(), current = null } = {}) {
  const skip = new Set(exclude.map((w) => key(w?.english ?? w)));
  const due = [];
  const upcoming = [];
  let earlier = 0;
  let aheadOnly = 0;
  for (const [k, e] of memory?.words || []) {
    const view = earlierView(e, current);
    if (!view) { aheadOnly++; continue; }
    earlier++;
    if (skip.has(k)) continue;
    const item = toItem(view, now);
    (item.ratio >= 1 ? due : upcoming).push(item);
  }
  due.sort((a, b) => b.due - a.due || a.english.localeCompare(b.english));
  upcoming.sort((a, b) => a.dueAt - b.dueAt || a.english.localeCompare(b.english));
  return { due: due.slice(0, n), upcoming: upcoming.slice(0, n), earlier, ahead: aheadOnly };
}

/**
 * Words worth bringing back now, most due first: [{ english, greek, met, lastAt, testedAt, due, why }].
 * exclude: words the new test or dictation already uses. n: how many. current: see reviewPlan.
 */
export function reviewWords(memory, { exclude = [], n = 8, now = Date.now(), current = null } = {}) {
  return reviewPlan(memory, { exclude, n, now, current }).due;
}

/** "Primary Path 1 Units 1–4 · 2 tests · 1 dictation" — what the memory was built from. */
export function memorySummary(memory) {
  const enc = memory?.encounters || [];
  const books = new Map();
  enc.filter((e) => e.type === "unit").forEach((e) => {
    const b = e.bookId || "other";
    if (!books.has(b)) books.set(b, new Set());
    (e.units.length ? e.units : [e.unit]).filter(Boolean).forEach((u) => books.get(b).add(u));
  });
  const parts = [...books].map(([b, set]) => {
    const name = /^CPP\d$/i.test(b) ? `Primary Path ${b.slice(-1)}` : b === "other" ? "own word lists" : b;
    const us = [...set].sort((a, z) => a - z);
    return us.length ? `${name} ${us.length === 1 ? "Unit" : "Units"} ${compactRange(us)}` : name;
  });
  const tests = enc.filter((e) => e.type === "test").length;
  const dict = enc.filter((e) => e.type === "dictation").length;
  if (tests) parts.push(`${tests} test${tests === 1 ? "" : "s"}`);
  if (dict) parts.push(`${dict} dictation${dict === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

/** [1,2,3,5] → "1–3, 5" */
function compactRange(list) {
  const out = [];
  for (let i = 0; i < list.length; i++) {
    let j = i;
    while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++;
    out.push(j > i ? `${list[i]}–${list[j]}` : `${list[i]}`);
    i = j;
  }
  return out.join(", ");
}

const ago = (days) => (days < 1.5 ? "yesterday" : days < 13 ? `${Math.round(days)} days ago` : days < 60 ? `${Math.round(days / 7)} weeks ago` : `${Math.round(days / 30)} months ago`);
function whyLine(e, days) {
  const src = e.sources[e.sources.length - 1];
  return `Met ${e.met === 1 ? "once" : `${e.met} times`}, last ${ago(days)}${src ? ` (${src.title})` : ""}${e.testedAt ? "" : " · not tested yet"}`;
}

/** One short paragraph for an AI prompt: what this class has studied, what is due. Empty when nothing is known. */
export function memoryBrief(memory, review = [], { now = Date.now() } = {}) {
  if (!memory?.words?.size) return "";
  const all = [...memory.words.values()].sort((a, b) => b.lastAt - a.lastAt);
  const recent = all.filter((e) => now - e.lastAt < 14 * DAY).slice(0, 25).map((e) => e.english);
  const since = Math.min(...all.map((e) => e.firstAt).filter(Boolean));
  return [
    `CLASS MEMORY (from the teacher's saved worksheets, dictations and tests${since ? ` since ${new Date(since).toISOString().slice(0, 10)}` : ""}): the class has met ${all.length} words.`,
    recent.length ? `Met in the last two weeks: ${recent.join(", ")}.` : "",
    review.length ? `Due for review (spaced repetition): ${review.map((r) => r.english).join(", ")} — the teacher added them; recycle them naturally in texts and items next to the new words.` : "",
    "Texts and scripts may freely use words the class has met; do not teach them again.",
  ].filter(Boolean).join(" ");
}
