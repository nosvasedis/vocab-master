/* Vocab Master — the teacher's own words, added to a coursebook unit's (or a topic's) words (pure).
 * Typed or pasted as "lava, island, ash cloud" or one per line, optionally with the Greek:
 * "volcano - ηφαίστειο", "ash = στάχτη", "crater (κρατήρας)". Every own word is looked up in the
 * coursebook word bank (any book) for its type, Greek and example sentence. */
import { lookupCoursebookWord } from "../coursebook-data.js";

const GREEK = /[Ͱ-Ͽἀ-῿]/;
const key = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

/** "volcano - ηφαίστειο" → { english: "volcano", greek: "ηφαίστειο" }; the Greek part is optional. */
function parseOne(raw) {
  let text = String(raw || "").replace(/^\s*(?:\d+[.)]|[-*•·])\s*/, "").trim();
  if (!text) return null;
  let greek = "";
  const paren = text.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if (paren && GREEK.test(paren[2])) { text = paren[1]; greek = paren[2]; }
  else {
    const split = text.match(/^(.*?)\s+(?:[-–—=:]|→)\s+(.+)$/) || text.match(/^(.*?)\s*[=:→]\s*(.+)$/);
    if (split && GREEK.test(split[2])) { text = split[1]; greek = split[2]; }
  }
  // A line that is only Greek is not an English word.
  const english = text.replace(/\s+/g, " ").trim();
  if (!english || GREEK.test(english) || !/[a-z]/i.test(english)) return null;
  return { english, greek: greek.replace(/\s+/g, " ").trim() };
}

/**
 * Typed or pasted text → own words, without repeats. Commas, semicolons and new lines separate words;
 * a phrase ("ash cloud", "go to bed") stays one word.
 */
export function parseOwnWords(text) {
  const out = [];
  const seen = new Set();
  for (const part of String(text || "").split(/[,;\n\r]+/)) {
    const w = parseOne(part);
    if (!w || seen.has(key(w.english))) continue;
    seen.add(key(w.english));
    out.push(w);
  }
  return out;
}

/** Add parsed words to a list of own words (the list's own entries win; new words go at the end). */
export function addOwnWords(list = [], text = "") {
  const seen = new Set(list.map((w) => key(w.english)));
  return [...list, ...parseOwnWords(text).filter((w) => !seen.has(key(w.english)) && seen.add(key(w.english)))];
}

/**
 * An own word ready for a test, a dictation or a game: the coursebook's type, Greek and example when the word is
 * in a book (the teacher's Greek wins), and own: true so the app can tell it apart from the unit's words.
 */
export function ownWordEntry(w, { bookId = "", unit = 0 } = {}) {
  const hit = lookupCoursebookWord(w.english, bookId, unit);
  return {
    english: w.english,
    type: hit?.type && hit.type !== "title" ? hit.type : "",
    greek: w.greek || hit?.greek || "",
    example: hit?.example || "",
    own: true,
    inBook: !!hit,
    // The family, opposites and synonyms the bank lists for it (the Test Maker uses them).
    ...Object.fromEntries(["derivatives", "synonyms", "antonyms"].filter((k) => hit?.[k]).map((k) => [k, hit[k]])),
  };
}

/** The unit's words, then the own words that aren't already among them. */
export function mergeOwnWords(base = [], own = [], ctx = {}) {
  const seen = new Set(base.map((w) => key(w.english)));
  return [...base, ...own.filter((w) => !seen.has(key(w.english)) && seen.add(key(w.english))).map((w) => ownWordEntry(w, ctx))];
}
