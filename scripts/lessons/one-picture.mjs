#!/usr/bin/env node
/* One picture per thing. Focus words take their hand-chosen picture from word-pictures.mjs, props keep their
   first emoji ("🐕🐕" → "🐕"), and text-style emoji get U+FE0F so they draw in colour. Multi-emoji pictures
   broke the word pops (🧑🧑🏘 stacked and overflowed) and the unit cards on the Lessons screen.
   Every lesson is re-validated before it is written; the catalog (hero icons) is rebuilt.
   Usage: node scripts/lessons/one-picture.mjs [--dry-run] */
import fs from "node:fs";
import { allLessonFiles, getWord, writeLesson, writeCatalog } from "./lib/catalog.mjs";
import { validateLesson } from "../../desktop/renderer/lesson/schema.js";
import { onePicture } from "../../desktop/renderer/lesson/wordmatch.js";
import { FOCUS_PICTURES } from "./word-pictures.mjs";

const DRY = process.argv.includes("--dry-run");
const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });
const isOne = (e) => [...graphemes.segment(String(e || ""))].length === 1;

const stats = { words: 0, props: 0, lessons: 0 };
const missing = new Set();
const problems = [];

function fixProps(o) {
  if (Array.isArray(o)) { o.forEach(fixProps); return; }
  if (!o || typeof o !== "object") return;
  for (const [k, v] of Object.entries(o)) {
    if (k === "props" && Array.isArray(v)) {
      for (const p of v) {
        const one = onePicture(p.emoji);
        if (one && one !== p.emoji) { p.emoji = one; stats.props++; }
      }
    } else fixProps(v);
  }
}

for (const file of allLessonFiles()) {
  const lesson = JSON.parse(fs.readFileSync(file, "utf8"));
  const before = JSON.stringify(lesson);
  for (const fw of lesson.focusWords || []) {
    const english = getWord(fw.wordId)?.english || "";
    let pic = fw.emoji;
    if (!isOne(pic)) {
      pic = FOCUS_PICTURES[english.toLowerCase()];
      if (!pic) { missing.add(`${english} ${fw.emoji}`); pic = fw.emoji; }
    }
    const one = onePicture(pic);
    if (one !== fw.emoji) { fw.emoji = one; stats.words++; }
  }
  fixProps(lesson.scenes);
  if (JSON.stringify(lesson) === before) continue;
  const { errors } = validateLesson(lesson, getWord, {});
  if (errors.length) { problems.push(`${lesson.id}: ${errors.join("; ")}`); continue; }
  stats.lessons++;
  if (!DRY) writeLesson(lesson);
}

if (!DRY) writeCatalog();
console.log(`${DRY ? "[dry run] " : ""}${stats.words} word pictures, ${stats.props} props, ${stats.lessons} lessons`);
if (missing.size) console.log(`No picture chosen for:\n  ${[...missing].join("\n  ")}`);
if (problems.length) { console.log(`Not written (invalid):\n  ${problems.join("\n  ")}`); process.exitCode = 1; }
