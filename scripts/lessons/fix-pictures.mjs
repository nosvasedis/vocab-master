#!/usr/bin/env node
/* Hand-reviewed corrections (2026-10-17 audit of all 810 focus-word pictures and examples). Idempotent. */
import fs from "node:fs";
import { allLessonFiles, getWord, writeLesson } from "./lib/catalog.mjs";
import { validateLesson } from "../../desktop/renderer/lesson/schema.js";

const PICTURES = {
  "CPP1-U1-BQ": { brother: "👦", sister: "👧" },
  "CPP1-U1-A": { live: "👨‍👩‍👧🏠" },
  "CPP1-U5-A": { "on (your) own": "👧☝️" },
  "CPP1-U6-A": { bottle: "🧴", "retirement home": "👵👴🏡" },
  "CPP1-U9-B": { keep: "🤲🧸", shine: "☀️✨" },
  "CPP3-U5-A": { persuade: "🗣️➡️🙂" },
  "CPP3-U9-A": { hollow: "🪵🕳️" },
};
/* Props that picked up the word bank's generic filler emoji (✨/🤝/🎵… shared by hundreds of words).
   Keyed by label; "lesson id|label" overrides words whose meaning depends on the story. */
const PROPS = {
  breath: "🌬️", caption: "🏷️", cardboard: "📦", cart: "🛒", clay: "🏺", cloth: "🧵", dirt: "🟫", glue: "🧴",
  hieroglyphics: "📜", homework: "📝", lightning: "⚡", lock: "🔒", material: "🧵", message: "💬", metal: "🔩",
  net: "🥅", object: "📦", oven: "🔥", sandcastle: "🏰", shape: "🔷", spring: "🌷", symbol: "🔣", trick: "🎩",
  tongue: "👅", vase: "🏺", writing: "✍️", friend: "🧑‍🤝‍🧑",
  "CPP2-U7-A|model": "🔺", "CPP3-U4-B|model": "💃",
};
/* Pictures for quiz options that are not focus words (lesson.pictures, read by the player's wordById). */
const OPTION_PICTURES = {
  "CPP1-U3-BQ": { "CPP1-U3-SB-287": "🖼️", "CPP1-U3-SB-288": "🧩" },
};
const EXAMPLES = {
  "CPP3-U3-B": { mud: ["After the flood, the streets were full of mud."] },
};

for (const file of allLessonFiles()) {
  const lesson = JSON.parse(fs.readFileSync(file, "utf8"));
  const pics = PICTURES[lesson.id] || {};
  const exs = EXAMPLES[lesson.id] || {};
  let changed = false;
  for (const fw of lesson.focusWords) {
    const en = getWord(fw.wordId)?.english;
    if (pics[en] && fw.emoji !== pics[en]) { fw.emoji = pics[en]; changed = true; }
    if (exs[en] && JSON.stringify(fw.examples) !== JSON.stringify(exs[en])) { fw.examples = exs[en]; changed = true; }
  }
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== "object") return;
    if (o.emoji && o.label) {
      const l = o.label.toLowerCase();
      const want = PROPS[`${lesson.id}|${l}`] || PROPS[l];
      if (want && o.emoji !== want) { o.emoji = want; changed = true; }
    }
    Object.values(o).forEach(walk);
  };
  walk(lesson.scenes);
  const opt = OPTION_PICTURES[lesson.id];
  if (opt && JSON.stringify(lesson.pictures) !== JSON.stringify(opt)) { lesson.pictures = opt; changed = true; }
  if (!changed) continue;
  const { errors } = validateLesson(lesson, getWord, {});
  if (errors.length) { console.log(`✗ ${lesson.id}: ${errors[0]}`); continue; }
  writeLesson(lesson);
  console.log(`✓ ${lesson.id}`);
}
