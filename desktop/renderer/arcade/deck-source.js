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

/** How hard a word is to read, say and spell: 1 easy · 2 medium · 3 tricky (syllables, length, phrases, later books). */
export function wordLevel(w) {
  const e = String(w?.english || "").toLowerCase().trim();
  const words = e.split(/\s+/).filter(Boolean);
  const letters = e.replace(/[^a-z]/g, "").length;
  // Vowel groups ≈ syllables; a final silent "e" doesn't count.
  const syll = words.reduce((n, x) => n + Math.max(1, (x.replace(/e$/, "").match(/[aeiouy]+/g) || []).length), 0);
  const score = syll + (letters >= 7 ? 0.5 : 0) + (letters >= 9 ? 1 : 0) + (words.length > 1 ? 0.5 : 0) + (w?.bookId === "CPP3" ? 0.5 : 0);
  return score <= 2 ? 1 : score <= 3.5 ? 2 : 3;
}
export const LEVELS = [{ id: 1, label: "Easy" }, { id: 2, label: "Medium" }, { id: 3, label: "Tricky" }];

/** Word length bands (letters, spaces left out): short ≤ 5 · medium 6–8 · long 9+. */
export function lengthBand(w) {
  const n = String(w?.english || "").replace(/[^a-z]/gi, "").length;
  return n <= 5 ? "short" : n <= 8 ? "medium" : "long";
}
export const LENGTHS = [{ id: "short", label: "Short (≤5)" }, { id: "medium", label: "Medium (6–8)" }, { id: "long", label: "Long (9+)" }];
const isPhrase = (w) => /\s/.test(String(w?.english || "").trim()) || String(w?.type || "").trim() === "phr.";

/**
 * Keep the words that pass the teacher's filters.
 * @param {object[]} rows
 * @param {{ groups?: Set<string>, pictureOnly?: boolean, voiceOnly?: boolean, phrases?: "any"|"none"|"only",
 *   levels?: Set<number>, lengths?: Set<string>, exclude?: Set<string> }} f  exclude: lower-case English words to leave out
 *   (words played recently)
 */
export function filterWords(rows, f = {}, hasPicture = () => true, hasVoice = () => true) {
  const { groups = null, pictureOnly = false, voiceOnly = false, phrases = "any", levels = null, lengths = null, exclude = null } = f;
  return rows.filter((w) => (!groups?.size || groups.has(typeGroup(w.type)))
    && (!pictureOnly || hasPicture(w))
    && (!voiceOnly || hasVoice(w))
    && (phrases === "any" || (phrases === "none" ? !isPhrase(w) : isPhrase(w)))
    && (!levels?.size || levels.has(wordLevel(w)))
    && (!lengths?.size || lengths.has(lengthBand(w)))
    && (!exclude?.size || !exclude.has(String(w.english).toLowerCase())));
}

/* ── By page ─────────────────────────────────────────────────────── */
/** "34-41", "pp. 34–41, 50", "p 12" → [[34, 41], [50, 50]] (empty when there are no page numbers). */
export function parsePages(text) {
  const out = [];
  for (const part of String(text || "").replace(/[–—−~]/g, "-").split(/[,;&]+/)) {
    const m = part.match(/(\d+)\s*(?:-|to)\s*(\d+)/i);
    if (m) { const a = Number(m[1]); const b = Number(m[2]); out.push([Math.min(a, b), Math.max(a, b)]); continue; }
    const n = part.match(/\d+/);
    if (n) out.push([Number(n[0]), Number(n[0])]);
  }
  return out.filter(([a, b]) => a > 0 && b - a <= 300);
}

/** The words printed on some pages of a book — Student's Book pages, Workbook pages, or both — across units and sections. */
export function wordsOnPages(bookId, text, { sb = true, wb = false } = {}) {
  const spans = parsePages(text);
  if (!spans.length) return [];
  const on = (p) => p != null && spans.some(([a, b]) => p >= a && p <= b);
  return CPP_WORDBANK.filter((w) => w.bookId === bookId && w.type !== "title"
    && ((sb && w.source !== "wb" && on(w.sbPage ?? w.page)) || (wb && w.source === "wb" && on(w.wbPage ?? w.page))));
}

/** Where some words sit in the book: "Units 2–3 · pp. 34–41". */
export function pagesSummary(rows) {
  if (!rows.length) return "";
  const units = [...new Set(rows.map((r) => r.unit))].sort((a, b) => a - b);
  const pages = rows.map((r) => r.page).filter((p) => p != null);
  const u = units.length === 1 ? `Unit ${units[0]}` : `Units ${units[0]}–${units[units.length - 1]}`;
  return pages.length ? `${u} · pp. ${Math.min(...pages)}–${Math.max(...pages)}` : u;
}

/* ── Words played recently (vm_arcade_played: { english: last played, ms }) ── */
const DAY = 24 * 3600 * 1000;
/** Remember the words of a game that has just started; keeps the newest `cap` words. */
export function logPlayed(log, words, now = Date.now(), cap = 1500) {
  const next = { ...(log && typeof log === "object" ? log : {}) };
  for (const w of words) { const k = String(w?.english ?? w).toLowerCase().trim(); if (k) next[k] = now; }
  const keys = Object.keys(next);
  if (keys.length > cap) keys.sort((a, b) => next[a] - next[b]).slice(0, keys.length - cap).forEach((k) => delete next[k]);
  return next;
}
/** Words played in the last `days` days (lower-case English). */
export function recentWords(log, { days = 7, now = Date.now() } = {}) {
  return new Set(Object.entries(log || {}).filter(([, t]) => now - t < days * DAY).map(([k]) => k));
}

/* ── Saved decks (vm_arcade_decks: [{ id, name, ids, at }]) ─────────── */
export function saveDeck(list, name, ids, now = Date.now(), own = []) {
  const clean = String(name || "").replace(/\s+/g, " ").trim().slice(0, 40) || describeDeck(ids, own);
  const rest = (Array.isArray(list) ? list : []).filter((d) => d.name.toLowerCase() !== clean.toLowerCase());
  const deck = { id: `d${now.toString(36)}`, name: clean, ids: [...ids], at: now };
  if (own.length) deck.own = own.map((w) => ({ english: w.english, greek: w.greek || "" }));
  return [deck, ...rest].slice(0, 30);
}

/** The teacher's own words that aren't already picked from the book (same headword). */
export function ownNotPicked(ids, own = []) {
  const picked = new Set([...ids].map((id) => String(rowById.get(id)?.english || "").trim().toLowerCase()));
  return own.filter((w) => !picked.has(String(w.english || "").trim().toLowerCase()));
}

/** A deck's title: the book pick, plus the teacher's own words ("Primary Path 2 · Unit 4 + 3 own words"). */
export function describeDeck(ids, own = []) {
  const extra = ownNotPicked(ids, own).length;
  if (![...ids].length) return extra ? `Your own words · ${extra} ${extra === 1 ? "word" : "words"}` : "No words picked";
  return `${describePick(ids)}${extra ? ` + ${extra} own ${extra === 1 ? "word" : "words"}` : ""}`;
}
export const deleteDeck = (list, id) => (Array.isArray(list) ? list : []).filter((d) => d.id !== id);

/* ── Quick picks ─────────────────────────────────────────────────── */
/** A review deck: `n` words at random from units 1…unit of a book (the current unit counts double). */
export function reviewPick(bookId, unit, n = 12, rnd = Math.random) {
  const sofar = CPP_WORDBANK.filter((w) => w.bookId === bookId && w.unit >= 1 && w.unit <= unit && w.type !== "title");
  const weighted = [...sofar, ...sofar.filter((w) => w.unit === unit)];
  const seen = new Set();
  return randomPick(weighted, weighted.length, rnd).filter((w) => !seen.has(w.id) && seen.add(w.id)).slice(0, n);
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
