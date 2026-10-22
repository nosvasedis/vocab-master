/* Vocab Master — two columns for long exercises with short answers (pure, DOM-free).
 * An exercise with 10 or more lines whose answers are one letter or one word (a, T, the word) and whose lines are
 * short sits in two columns: the first half on the left, the rest beside them on the right — half the height.
 * Used by the worksheets (Lingo Launcher, Dictation) and by tests, on paper and in Word. */
import { textZoom } from "./text-size.js";

/** From this many lines (the example not counted) an exercise may go into two columns. */
export const COLUMN_MIN_ITEMS = 10;
/** About this many characters fit one line of a half-width column at the standard text size (A4, 11 pt). */
const HALF_LINE = 40;
const GAP = /_{3,}/g;

/** One word or one letter (a, T, Yes, rainforest, well-known) — never a phrase or a sentence. */
export function isShortAnswer(answer) {
  const a = String(answer ?? "").trim();
  return !!a && a.length <= 18 && !/\s/.test(a);
}

/** About how many characters a line takes on paper: a gap counts like a short word, choices sit on their own row. */
export function printedLength({ prompt = "", hint = "", options = [], extra = 0 } = {}) {
  const text = String(prompt ?? "").replace(GAP, "x".repeat(10)).replace(/\s+/g, " ").trim().length;
  const own = text + (hint ? String(hint).length + 2 : 0) + extra;
  const opts = (options || []).reduce((n, o) => n + String(o ?? "").length + 5, 0);
  return Math.max(own, opts);
}

/**
 * rows: [{ short, length }] — one per line (the example may be one of them; `count` is the number of real lines).
 * Two columns only when there are enough lines, every answer is short and every line fits half the width
 * (so the lines don't wrap and the columns really save space). Larger text needs shorter lines.
 */
export function useTwoColumns(rows, { count = rows?.length || 0, textSize = "standard", minItems = COLUMN_MIN_ITEMS } = {}) {
  if (!Array.isArray(rows) || count < minItems || !rows.length) return false;
  const limit = Math.floor(HALF_LINE / textZoom(textSize));
  return rows.every((r) => r && r.short && r.length <= limit);
}

/** The lines of each column: the first half (rounded up) on the left, the rest on the right. */
export function splitColumns(list) {
  const a = Array.isArray(list) ? list : [];
  const half = Math.ceil(a.length / 2);
  return [a.slice(0, half), a.slice(half)];
}

/** The row of a test question for useTwoColumns (pictures, ordering and open tasks never go into columns). */
export function testItemRow(section, it) {
  const t = section?.answerType;
  if (!it || section?.task === "R-ORDER" || section?.task === "R-SIGNS" || it.optionPics?.length || it.pic) return { short: false, length: Infinity };
  if (t === "choice") return { short: true, length: printedLength({ prompt: it.prompt, options: it.options }) };
  if (t === "tf") return { short: true, length: printedLength({ prompt: it.prompt, extra: 8 }) };
  if (t === "match") return { short: true, length: printedLength({ prompt: it.prompt, extra: 10 }) };
  if (t === "word") {
    GAP.lastIndex = 0;
    const gap = GAP.test(String(it.prompt || ""));
    GAP.lastIndex = 0;
    return { short: isShortAnswer(it.answer), length: printedLength({ prompt: it.prompt, hint: it.hint, extra: gap ? 0 : 12 }) };
  }
  return { short: false, length: Infinity };
}

/** Should this test part's questions sit in two columns? */
export function testPartColumns(section, { textSize, withExample = true } = {}) {
  const items = section?.items || [];
  if (!["choice", "tf", "match", "word"].includes(section?.answerType) || ["V-PIC", "V-TICK"].includes(section?.task)) return false;
  const rows = [...(withExample && section.example ? [section.example] : []), ...items].map((it) => testItemRow(section, it));
  return useTwoColumns(rows, { count: items.length, textSize });
}
