/* Vocab Master — everything the app knows about a coursebook unit, for tests and the assistant (pure).
 * Words by printed section (Big Question, Lesson A, Lesson B, Workbook, Extras) from the official
 * wordlists, the Big Question and reading titles, example sentences, and — when the curated lessons
 * are available — each lesson's key words and story lines. Lessons load through an injected loader
 * (fetch in the app, fs in tests), so the module itself stays DOM-free. */
import { CPP_BOOKS, CPP_WORDBANK, getCppUnitStructure } from "../coursebook-data.js";
import { BOOK_LEVEL } from "./levels.js";

export const SECTIONS = ["BQ", "A", "B", "WB", "EXTRA"];
export const SECTION_LABEL = { BQ: "Big Question", A: "Lesson A", B: "Lesson B", WB: "Workbook", EXTRA: "Extras" };

/** Section key of a word-bank entry. */
export function sectionOf(entry) {
  if (entry?.source === "wb") return "WB";
  if (["BQ", "A", "B"].includes(entry?.section)) return entry.section;
  return "EXTRA";
}

/** A unit's words, deduplicated, in book order, optionally limited to some sections. */
export function unitWords(bookId, unit, sections = SECTIONS) {
  const want = new Set(sections);
  const seen = new Set();
  const out = [];
  for (const e of CPP_WORDBANK) {
    if (e.bookId !== bookId || e.unit !== Number(unit)) continue;
    const sec = sectionOf(e);
    if (!want.has(sec)) continue;
    const key = String(e.english || "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ english: e.english, type: e.type || "", greek: e.greek || "", example: e.example || "", section: sec, unit: e.unit, bookId, id: e.id, page: e.page || 0 });
  }
  return out;
}

/** Word counts per section for a unit (for the picker chips). */
export function sectionCounts(bookId, unit) {
  const counts = Object.fromEntries(SECTIONS.map((s) => [s, 0]));
  unitWords(bookId, unit).forEach((w) => { counts[w.section]++; });
  return counts;
}

/** Caption and speech lines of a lesson's story scene ("Enitan: Look, a herd of elephants!"). */
export function storyLines(lesson, max = 10) {
  const cast = lesson?.cast || {};
  const out = [];
  for (const scene of lesson?.scenes || []) {
    if (scene.type !== "story") continue;
    for (const p of scene.panels || []) {
      if (p.caption?.text) out.push(p.caption.text);
      for (const s of p.speech || []) out.push(`${cast[s.who]?.name || s.who}: ${s.text}`);
    }
  }
  return out.slice(0, max);
}

const lessonPath = (bookId, unit, section) => `${bookId}/U${unit}-${section}.json`;

/**
 * Whole-unit context for one or more units of a book.
 * opts.sections limits the words; opts.loadLesson(path) → lesson JSON (or null) adds the curated lessons.
 */
export async function buildUnitContext({ bookId, units = [], sections = SECTIONS }, { loadLesson } = {}) {
  const book = CPP_BOOKS[bookId];
  if (!book) throw new Error(`Unknown book ${bookId}`);
  const list = [...new Set(units.map(Number))].filter((u) => u >= 1 && u <= 9).sort((a, b) => a - b);
  const outUnits = [];
  for (const unit of list) {
    const us = getCppUnitStructure(bookId, unit);
    const words = unitWords(bookId, unit, sections);
    const lessons = [];
    if (loadLesson) {
      for (const sec of ["BQ", "A", "B"]) {
        if (!sections.includes(sec)) continue;
        try {
          const l = await loadLesson(lessonPath(bookId, unit, sec));
          if (l) lessons.push({ section: sec, title: l.title || "", keyWords: (l.focusWords || []).map((f) => f.english).filter(Boolean), story: storyLines(l, 8) });
        } catch { /* lesson missing: words alone are enough */ }
      }
    }
    outUnits.push({
      unit,
      title: us?.unitTitle || `Unit ${unit}`,
      readings: { nonfiction: us?.nonfictionTitle || "", fiction: us?.fictionTitle || "" },
      pages: us ? `SB p. ${us.sbStart}–${us.sbEnd}, WB p. ${us.wbStart}–${us.wbEnd}` : "",
      sections: Object.fromEntries(SECTIONS.map((s) => [s, words.filter((w) => w.section === s).map((w) => w.english)])),
      examples: words.filter((w) => w.example).slice(0, 40).map((w) => w.example),
      lessons,
    });
  }
  const words = list.flatMap((u) => unitWords(bookId, u, sections));
  return {
    bookId,
    bookTitle: book.title,
    level: BOOK_LEVEL[bookId] || "",
    units: outUnits,
    words,
    label: `Primary Path ${bookId.slice(-1)} · ${list.length === 1 ? `Unit ${list[0]}` : `Units ${list.join(", ")}`}`,
  };
}

/** Compact text of a unit context for an AI prompt (keeps prompts small: example sentences and story lines are capped). */
export function unitContextPrompt(ctx, { maxExamples = 10, maxStory = 6 } = {}) {
  if (!ctx) return "";
  const lines = [`BOOK: ${ctx.bookTitle} (any class may use this book — a year early or late; write for the CLASS PROFILE, not for the book's usual class)`];
  for (const u of ctx.units) {
    lines.push(`UNIT ${u.unit} — Big Question: "${u.title}"${u.readings.nonfiction ? ` · Readings: "${u.readings.nonfiction}" (non-fiction), "${u.readings.fiction}" (fiction)` : ""}`);
    for (const s of SECTIONS) if (u.sections[s]?.length) lines.push(`  ${SECTION_LABEL[s]} words: ${u.sections[s].join(", ")}`);
    if (u.examples.length) lines.push(`  Book example sentences (show the unit's grammar and level): ${u.examples.slice(0, maxExamples).map((e) => `"${e}"`).join(" ")}`);
    for (const l of u.lessons) {
      lines.push(`  Lesson ${l.section} "${l.title}" — key words: ${l.keyWords.join(", ")}`);
      if (l.story.length) lines.push(`    Story: ${l.story.slice(0, maxStory).join(" / ")}`);
    }
  }
  return lines.join("\n");
}
