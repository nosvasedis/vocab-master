#!/usr/bin/env node
/* Validate every lesson on disk and print a readable report. Exit code 1 when any lesson has errors.
   Usage: node scripts/lessons/validate-lessons.mjs [--warnings] [--write-catalog] */
import fs from "node:fs";
import { validateLesson } from "../../desktop/renderer/lesson/schema.js";
import { allLessonFiles, getWord, writeCatalog } from "./lib/catalog.mjs";

const showWarnings = process.argv.includes("--warnings");
let failed = 0;
const files = allLessonFiles();
for (const file of files) {
  const lesson = JSON.parse(fs.readFileSync(file, "utf8"));
  const { errors, warnings } = validateLesson(lesson, getWord);
  const mark = errors.length ? "✗" : "✓";
  console.log(`${mark} ${lesson.id} [${lesson.status}] "${lesson.title}" — ${errors.length} errors, ${warnings.length} warnings`);
  errors.forEach((e) => console.log(`    error: ${e}`));
  if (showWarnings) warnings.forEach((w) => console.log(`    warn:  ${w}`));
  if (errors.length) failed++;
}
if (process.argv.includes("--write-catalog")) writeCatalog();
console.log(`\n${files.length} lesson(s), ${failed} with errors.`);
process.exit(failed ? 1 : 0);
