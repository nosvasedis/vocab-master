#!/usr/bin/env node
/* Which Top Answers answers still have no illustrated picture? (The game shows each one's emoji icon meanwhile.)
   Writes art-brief/pictures/top-answers-needed.json + .md: one row per missing picture with a stable id (w-<slug>,
   the same naming as the rest of the picture set), the emoji used for now, and the boards it appears on — ready to
   paste into the picture generator. Re-run after adding boards or pictures.
   Usage: node scripts/lessons/list-feud-pictures.mjs */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../lib/env.mjs";
import { CPP_WORDBANK } from "../../desktop/renderer/coursebook-data.js";
import { stem } from "../../desktop/renderer/lesson/schema.js";

const boards = JSON.parse(fs.readFileSync(path.join(ROOT, "desktop/renderer/lessons/feud.json"), "utf8")).boards;
const M = JSON.parse(fs.readFileSync(path.join(ROOT, "desktop/renderer/assets/pics/manifest.json"), "utf8"));
const byId = new Map(CPP_WORDBANK.map((w) => [w.id, w]));
const have = new Set(Object.keys(M.words).map((k) => k.split("|")[0]));
const haveStem = new Set([...have].filter((e) => !/\s/.test(e)).map(stem));
const hasPic = (text) => have.has(text) || (!/\s/.test(text) && haveStem.has(stem(text))) || Boolean(M.nouns[stem(text)]);
const slug = (s) => String(s).toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";

const need = new Map();
let total = 0;
for (const [unit, list] of Object.entries(boards)) {
  for (const b of list) {
    for (const a of b.answers) {
      total++;
      const english = (a.wordId && byId.get(a.wordId)?.english?.toLowerCase().trim()) || a.text;
      if (hasPic(english) || hasPic(a.text)) continue;
      const row = need.get(a.text) || { id: `w-${slug(a.text)}`, text: a.text, type: "noun", emoji: a.icon || "", boards: [], prompts: [] };
      row.boards.push(b.id);
      if (row.prompts.length < 2) row.prompts.push(b.prompt);
      if (!row.emoji && a.icon) row.emoji = a.icon;
      need.set(a.text, row);
    }
  }
}
const rows = [...need.values()].sort((x, y) => y.boards.length - x.boards.length || x.text.localeCompare(y.text));
const dir = path.join(ROOT, "art-brief", "pictures");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "top-answers-needed.json"), JSON.stringify(rows, null, 1) + "\n");
const md = [
  "# Top Answers — pictures still to make",
  "",
  `${rows.length} answers (of ${total} on all boards) have no illustrated picture yet; the game shows their emoji icon until you add one.`,
  "Make each in the same style as the rest of the set (see `../PROMPT.md`), save it as `<id>.webp`, then import it like any other picture.",
  "",
  "| id | answer | icon now | boards | example prompt |",
  "|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.id} | ${r.text} | ${r.emoji} | ${r.boards.length} | ${r.prompts[0]} |`),
  "",
].join("\n");
fs.writeFileSync(path.join(dir, "top-answers-needed.md"), md);
console.log(`${rows.length} of ${total} answers need a picture → art-brief/pictures/top-answers-needed.md`);
