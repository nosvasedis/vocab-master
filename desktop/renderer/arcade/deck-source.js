/* Where an arcade deck comes from: the coursebook's Book → Unit → lesson section → word.
   Pure data helpers (no DOM) so the picker and the tests share them.
   A section is a part of a unit as the book prints it: Big Question, Lesson A, Lesson B, Workbook, Extras.
   Each section can also have key words — the ten words its animated lesson teaches (lessons/index.json). */
import { CPP_BOOKS, CPP_WORDBANK } from "../coursebook-data.js";

export const SECTION_ORDER = ["BQ", "A", "B", "WB", "SM"];
export const SECTION_INFO = {
  BQ: { label: "Big Question", short: "BQ", blurb: "The unit's opening question and its words" },
  A: { label: "Lesson A", short: "A", blurb: "Student Book lesson A" },
  B: { label: "Lesson B", short: "B", blurb: "Student Book lesson B" },
  WB: { label: "Workbook", short: "WB", blurb: "Workbook practice words" },
  SM: { label: "Extras", short: "+", blurb: "Review and extra words" },
};

/** Word groups a teacher thinks in. */
export const TYPE_GROUPS = [
  { id: "noun", label: "Nouns", test: (t) => t === "n." },
  { id: "verb", label: "Verbs", test: (t) => t === "v." || t === "phr. v." },
  { id: "adj", label: "Describing words", test: (t) => t === "adj." || t === "adv." },
  { id: "phrase", label: "Phrases", test: (t) => t === "phr." },
];
export const typeGroup = (type) => TYPE_GROUPS.find((g) => g.test(String(type || "").trim()))?.id || "other";

export const rowById = new Map(CPP_WORDBANK.map((w) => [w.id, w]));
const bySection = new Map(); // "CPP1|1" → { BQ: rows, A: rows, … }
for (const w of CPP_WORDBANK) {
  if (w.type === "title") continue;
  const k = `${w.bookId}|${w.unit}`;
  const sec = SECTION_ORDER.includes(w.section) ? w.section : "SM";
  const u = bySection.get(k) || {};
  (u[sec] = u[sec] || []).push(w);
  bySection.set(k, u);
}

/** The books, in order, with the class level each suits. */
export function listBooks() {
  return Object.values(CPP_BOOKS).map((b) => ({
    id: b.id,
    title: b.title,
    short: b.title.replace("Cambridge Primary Paths", "Primary Path"),
    cefr: b.cefr,
    units: Object.keys(b.units).map(Number).filter((n) => n >= 1).sort((a, c) => a - c),
  }));
}

/** A unit's sections, each with its words (a section with no words is left out). */
export function unitSections(bookId, unit) {
  const u = bySection.get(`${bookId}|${unit}`) || {};
  return SECTION_ORDER.filter((s) => u[s]?.length).map((s) => ({ key: s, ...SECTION_INFO[s], words: u[s] }));
}

export function unitInfo(bookId, unit) {
  const info = CPP_BOOKS[bookId]?.units?.[unit] || {};
  const all = unitSections(bookId, unit).flatMap((s) => s.words);
  return { bookId, unit, title: info.title || `Unit ${unit}`, reading: [info.nonfiction, info.fiction].filter(Boolean), count: all.length };
}

/** Keep the words that pass the teacher's filters (word groups; only words that have a picture). */
export function filterWords(rows, { groups = null, pictureOnly = false } = {}, hasPicture = () => true) {
  return rows.filter((w) => (!groups?.size || groups.has(typeGroup(w.type))) && (!pictureOnly || hasPicture(w)));
}

/** Short readable name for a pick: "Primary Path 1 · Unit 3 (A, B)" or "Primary Path 1 · Units 1, 2 and 3". */
export function describePick(ids) {
  const rows = [...ids].map((id) => rowById.get(id)).filter(Boolean);
  if (!rows.length) return "No words picked";
  const books = [...new Set(rows.map((r) => r.bookId))];
  const bookLabel = (b) => CPP_BOOKS[b].title.replace("Cambridge Primary Paths", "Primary Path");
  if (books.length > 1) return `${books.map(bookLabel).join(" + ")} · ${rows.length} words`;
  const units = [...new Set(rows.map((r) => r.unit))].sort((a, b) => a - b);
  if (units.length === 1) {
    const secs = SECTION_ORDER.filter((s) => rows.some((r) => (SECTION_ORDER.includes(r.section) ? r.section : "SM") === s));
    const whole = secs.length === unitSections(books[0], units[0]).length && secs.length > 1;
    return `${bookLabel(books[0])} · Unit ${units[0]}${whole ? "" : ` (${secs.map((s) => SECTION_INFO[s].short).join(", ")})`}`;
  }
  const list = units.length <= 3 ? units.slice(0, -1).join(", ") + " and " + units[units.length - 1] : `${units[0]}–${units[units.length - 1]}`;
  return `${bookLabel(books[0])} · Units ${list}`;
}

/** Group a pick for display: [{ bookId, unit, key, label, count }] in book order. */
export function pickBreakdown(ids) {
  const rows = [...ids].map((id) => rowById.get(id)).filter(Boolean);
  const out = new Map();
  for (const r of rows) {
    const key = SECTION_ORDER.includes(r.section) ? r.section : "SM";
    const k = `${r.bookId}|${r.unit}|${key}`;
    const e = out.get(k) || { bookId: r.bookId, unit: r.unit, key, label: `Unit ${r.unit} · ${SECTION_INFO[key].label}`, count: 0, ids: [] };
    e.count++;
    e.ids.push(r.id);
    out.set(k, e);
  }
  return [...out.values()].sort((a, b) => a.bookId.localeCompare(b.bookId) || a.unit - b.unit || SECTION_ORDER.indexOf(a.key) - SECTION_ORDER.indexOf(b.key));
}

/** Words whose English matches the search text (start of a word first), across all books. */
export function searchWords(text, limit = 40) {
  const q = String(text || "").toLowerCase().trim();
  if (q.length < 2) return [];
  const hits = [];
  const seen = new Set();
  for (const w of CPP_WORDBANK) {
    if (w.type === "title") continue;
    const e = w.english.toLowerCase();
    const at = e.indexOf(q);
    if (at < 0) continue;
    const key = `${w.bookId}|${e}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ w, score: at === 0 ? 0 : e.split(/\s+/).some((p) => p.startsWith(q)) ? 1 : 2 });
  }
  return hits.sort((a, b) => a.score - b.score || a.w.english.length - b.w.english.length).slice(0, limit).map((h) => h.w);
}

/** Pick `n` words at random from a list (for "surprise me"). */
export function randomPick(rows, n, rnd = Math.random) {
  const a = [...rows];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}
