/* Lesson files on disk, the catalog (lessons/index.json) and word-bank access for Node scripts. */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../../lib/env.mjs";
import { CPP_BOOKS, CPP_WORDBANK } from "../../../desktop/renderer/coursebook-data.js";
import { lessonPath, SECTIONS } from "../../../desktop/renderer/lesson/schema.js";

export const LESSONS_DIR = path.join(ROOT, "desktop", "renderer", "lessons");
export { CPP_BOOKS, CPP_WORDBANK };

const byId = new Map(CPP_WORDBANK.map((w) => [w.id, w]));
export const getWord = (id) => byId.get(id);

/** Candidate words for a lesson: the section's Student's Book rows (deduplicated by headword). */
export function sectionWords(bookId, unit, section) {
  const seen = new Set();
  return CPP_WORDBANK.filter((w) => w.bookId === bookId && w.unit === unit && w.section === section && w.source === "sb")
    .filter((w) => { const k = w.english.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

export function readLesson(bookId, unit, section) {
  const file = path.join(LESSONS_DIR, lessonPath(bookId, unit, section));
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

export function writeLesson(lesson) {
  const file = path.join(LESSONS_DIR, lessonPath(lesson.bookId, lesson.unit, lesson.section));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(lesson, null, 2) + "\n");
  return file;
}

export function allLessonFiles() {
  const out = [];
  if (!fs.existsSync(LESSONS_DIR)) return out;
  for (const book of fs.readdirSync(LESSONS_DIR)) {
    const dir = path.join(LESSONS_DIR, book);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) if (f.endsWith(".json")) out.push(path.join(dir, f));
  }
  return out.sort();
}

/** Rebuild lessons/index.json from the files on disk. */
export function writeCatalog() {
  const lessons = allLessonFiles().map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
  const order = (l) => `${l.bookId}-${String(l.unit).padStart(2, "0")}-${SECTIONS.indexOf(l.section)}`;
  lessons.sort((a, b) => order(a).localeCompare(order(b)));
  const index = {
    schema: 1,
    lessons: lessons.map((l) => ({
      id: l.id, bookId: l.bookId, unit: l.unit, section: l.section, title: l.title, status: l.status,
      durationMin: l.durationMin, focusCount: (l.focusWords || []).length, setting: l.setting || "",
      hero: (l.focusWords || [])[0]?.emoji || "", path: lessonPath(l.bookId, l.unit, l.section),
    })),
  };
  fs.mkdirSync(LESSONS_DIR, { recursive: true });
  fs.writeFileSync(path.join(LESSONS_DIR, "index.json"), JSON.stringify(index, null, 2) + "\n");
  return index;
}
