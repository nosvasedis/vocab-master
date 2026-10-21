/* Vocab Master — file names for everything the teacher saves (pure, DOM-free).
 * One pattern for every product: "<Product>, <book>, Unit <n>, pp. <pages>"
 *   Dictation, CPP1, Unit 5, pp. 40-41 · Lingo Launcher, CPP1, Unit 5 · Test, CPP2, Unit 4
 * The Cambridge Primary Path books are shortened to CPP1–3; other books keep their own title. */

import { resolveCoursebookId } from "../coursebook-data.js";

/** "Cambridge Primary Path 1" → "CPP1"; another book keeps its title. */
export function bookShortName(bookTitle) {
  const title = String(bookTitle || "").trim();
  if (!title) return "";
  return resolveCoursebookId(title) || title;
}

/** "40-41" → "pp. 40-41", "40" → "p. 40" (a single page is "p."). */
export function pagesLabel(pages) {
  const p = String(pages || "").trim().replace(/^p{1,2}\.?\s*/i, "").replace(/\s*[–—]\s*/g, "-");
  if (!p) return "";
  return /[-,]/.test(p) ? `pp. ${p}` : `p. ${p}`;
}

/**
 * The file name (no extension) for a product of a unit.
 * meta: { bookTitle, unit, pageRange | pages, title } — `title` is used only when there is no book or unit (a topic test).
 */
export function productFileName(product, meta = {}) {
  const book = bookShortName(meta.bookTitle);
  const unit = String(meta.unit ?? "").trim();
  const pages = pagesLabel(meta.pageRange || meta.pages);
  const parts = [product, book, unit ? `Unit ${unit}` : "", pages];
  if (!book && !unit) parts.push(String(meta.title || "").trim());
  return [...new Set(parts.map((s) => String(s || "").trim()).filter(Boolean))].join(", ");
}

/** A name Windows accepts (no \ / : * ? " < > |), kept readable. */
export function safeFileName(name) {
  return String(name).replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
}
