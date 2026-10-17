#!/usr/bin/env node
/* Marks every lesson "approved" (the teacher accepted all 81 on 2026-10-17) — but only lessons that pass the
   validator with every voice clip present. Usage: node scripts/lessons/approve-all.mjs */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../lib/env.mjs";
import { allLessonFiles, getWord, writeLesson, writeCatalog } from "./lib/catalog.mjs";
import { validateLesson } from "../../desktop/renderer/lesson/schema.js";

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "desktop", "renderer", "assets", "audio", "manifest.json"), "utf8"));
const hasClip = (key) => !!manifest.entries?.[key];
let approved = 0;
const blocked = [];
for (const file of allLessonFiles()) {
  const lesson = JSON.parse(fs.readFileSync(file, "utf8"));
  const next = { ...lesson, status: "approved" };
  const { errors } = validateLesson(next, getWord, { hasClip });
  if (errors.length) { blocked.push(`${lesson.id}: ${errors[0]}`); continue; }
  if (lesson.status !== "approved") { writeLesson(next); approved++; }
}
writeCatalog();
console.log(`${approved} lesson(s) approved${blocked.length ? ` · ${blocked.length} blocked:\n  ${blocked.join("\n  ")}` : ""}`);
