#!/usr/bin/env node
/* Builds the complete picture job list for ChatGPT / Codex (art-brief/pictures/):
     jobs.json, jobs.csv          — one row per image to make (id, phase, meaning, contexts, look-alikes …)
     batches/*.md                 — the same jobs as paste-ready batches of 40
     lookalikes.md                — words that currently share an emoji, grouped (must look different)
     characters.md                — every story character, with a fixed look for the recurring ones
   Phases: 0 anchors · 1 characters + lesson words · 2 story props · 3 game avatars · 4 word-bank nouns ·
           5 word-bank verbs/adjectives/phrases. Re-run any time; ids are stable.
   Usage: node scripts/art/picture-jobs.mjs */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../lib/env.mjs";
import { CPP_WORDBANK } from "../../desktop/renderer/coursebook-data.js";
import { allLessonFiles, getWord } from "../lessons/lib/catalog.mjs";
import { stem } from "../../desktop/renderer/lesson/schema.js";
import { matchProps } from "../../desktop/renderer/lesson/wordmatch.js";
const mentions = (text, word) => matchProps(String(text || "").replace(/_{2,}/g, " ").split(/s+/).filter(Boolean), [{ emoji: "x", label: word }]).size > 0;
import { AVATARS } from "../../desktop/renderer/arcade/live/net-config.js";
import { CHARACTER_LOOKS } from "./character-looks.mjs";

const OUT = path.join(ROOT, "art-brief", "pictures");
const BATCH = 40;
fs.mkdirSync(path.join(OUT, "batches"), { recursive: true });
fs.mkdirSync(path.join(OUT, "incoming"), { recursive: true });

const seg = new Intl.Segmenter();
const firstEmoji = (e) => [...seg.segment(String(e || ""))][0]?.segment || "";
const slug = (s) => String(s).toLowerCase().replace(/[’']/g, "").replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
const TYPE = { "n.": "noun", "v.": "verb", "adj.": "adjective", "adv.": "adverb", "phr.": "phrase", "phr. v.": "phrasal verb", "prep.": "preposition", "pron.": "pronoun", "conj.": "conjunction", "modal v.": "modal verb", "num.": "number", title: "title" };
const SHORT = { noun: "n", verb: "v", adjective: "adj", adverb: "adv", phrase: "phr", "phrasal verb": "phv", preposition: "prep" };
const SKIP_TYPES = new Set(["pronoun", "conjunction", "modal verb", "number", "title"]);
const typeOf = (t) => TYPE[String(t || "").trim()] || "noun";

/* Frames: how the picture is composed. */
const PLACES = new Set(`beach city farm park school library museum kitchen bedroom bathroom classroom playground forest jungle desert mountain mountains
river lake sea ocean island village town suburb neighbourhood neighborhood street market station airport hospital clinic zoo cave savanna countryside
landscape garden backyard apartment home house cafe restaurant shop supermarket stadium court gym pool theatre theater cinema factory port harbour
harbor field waterfall volcano castle camp campsite space planet world earth rainforest habitat downtown square bakery barbershop pharmacy office`.split(/\s+/));
const SCENEY = new Set(`weather rain rainy snow snowy storm stormy thunderstorm windy sunny cloudy fog foggy rainbow lightning thunder flood earthquake
winter summer spring autumn fall season morning afternoon evening night daylight sunset sunrise midnight noon`.split(/\s+/));
const PEOPLE = new Set(`mother father mum mom dad parent parents grandparent grandparents grandmother grandfather grandma grandpa aunt uncle cousin
brother sister baby family friend friends neighbour neighbor teacher student classmate doctor nurse dentist firefighter police officer chef cook farmer
carpenter builder pilot driver artist painter musician singer dancer scientist inventor archaeologist archeologist astronaut athlete player referee
coach guide tourist tourists visitor visitors king queen princess prince pirate detective thief giant hero superhero composer author writer
librarian vet waiter waitress shopkeeper paramedic security guard explorer`.split(/\s+/));

const jobs = new Map(); // key → job
const keyFor = (english, type) => `${english.trim().toLowerCase()}|${type}`;
const add = (job) => { if (!jobs.has(job.key)) jobs.set(job.key, job); return jobs.get(job.key); };

function frameFor(english, type) {
  const w = english.trim().toLowerCase();
  const head = w.split(/\s+/).pop();
  if (type === "verb" || type === "phrasal verb" || type === "phrase") return /^(a|an|the)\s/.test(w) ? "object" : "action";
  if (type === "adjective" || type === "adverb") return "quality";
  if (type === "preposition") return "relation";
  if (PLACES.has(w) || PLACES.has(head) || SCENEY.has(w)) return "scene";
  if (PEOPLE.has(w) || PEOPLE.has(head)) return "person";
  return "object";
}

/* ── 1. Lesson focus words ────────────────────────────────────────── */
const lessonWords = new Map(); // lesson id → [english]
const emojiGroups = new Map(); // first emoji → Set(key)
for (const file of allLessonFiles()) {
  const L = JSON.parse(fs.readFileSync(file, "utf8"));
  const list = [];
  for (const fw of L.focusWords) {
    const w = getWord(fw.wordId);
    const type = typeOf(w.type);
    const key = keyFor(w.english, type);
    const job = add({ key, kind: "word", phase: 1, word: w.english.trim(), type, greek: w.greek || "", meaning: fw.kidDefinition || "", examples: [], lessons: [], props: [], current: fw.emoji || "", frame: frameFor(w.english, type) });
    if (!job.meaning && fw.kidDefinition) job.meaning = fw.kidDefinition;
    if (fw.examples?.[0] && job.examples.length < 3 && !job.examples.includes(fw.examples[0])) job.examples.push(fw.examples[0]);
    if (!job.lessons.includes(L.id)) job.lessons.push(L.id);
    list.push(key);
    const e = firstEmoji(fw.emoji);
    if (e) emojiGroups.set(e, (emojiGroups.get(e) || new Set()).add(key));
  }
  lessonWords.set(L.id, list);
}

/* ── 2. Story characters ──────────────────────────────────────────── */
function roleOf(persona = "", emoji = "", name = "") {
  const p = persona.toLowerCase();
  const n = name.toLowerCase();
  if (/puppet/.test(p)) return "puppet";
  if (/\bbun\b|\bbread\b/.test(p)) return "bread-bun";
  const animal = p.match(/\b(hare|rabbit|chipmunk|hound|dog|cat|owl|bee|fox|bear|mouse|frog|turtle|tortoise|bird|parrot|lion|tiger|elephant|monkey|squirrel|horse|donkey|duck|hen|rooster|chicken|cow|sheep|pig|dragon|unicorn|dinosaur)\b/);
  if (animal && !/\bteacher\b/.test(p)) return animal[1];
  if (/\bgiant\b/.test(p)) return "giant";
  const job = p.match(/\b(firefighter|doctor|nurse|teacher|carpenter|barber|security guard|chef|farmer|scientist|archaeologist|archeologist|librarian|pilot|police|tour guide|guide|ranger|referee|coach|vet|artist|musician|shopkeeper|dentist|baker|astronaut|explorer|detective)\b/);
  if (job) return job[1].replace(/\s+/g, "-");
  if (emoji.includes("\u{1F692}")) return "firefighter";
  if (emoji.includes("⚕")) return "doctor";
  if (/\bgrand|\bolder\b|\belderly\b|yiayia|\bold (man|woman)\b/.test(p) || /grandma|grandpa|yiayia|papou|granny|grandad/.test(n)) return "elder";
  if (/\b\d+-year-old\b|\b(boy|girl|child|kid)\b/.test(p)) return "child";
  return "adult";
}
const characters = new Map(); // id → job
for (const file of allLessonFiles()) {
  const L = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const [castKey, c] of Object.entries(L.cast || {})) {
    if (castKey === "lingo") continue;
    const name = (c.name || castKey).trim();
    const role = roleOf(c.persona, c.emoji, name);
    const id = `c-${slug(name)}-${role}`;
    const job = characters.get(id) || { id, key: id, kind: "character", phase: 1, name, role, personas: [], current: c.emoji || "", lessons: [], uses: [], frame: "character", look: CHARACTER_LOOKS[id] || "" };
    if (c.persona && !job.personas.includes(c.persona)) job.personas.push(c.persona);
    if (!job.lessons.includes(L.id)) job.lessons.push(L.id);
    job.uses.push({ lesson: L.id, cast: castKey });
    characters.set(id, job);
  }
}

/* ── 3. Story props (pictures of things the stories mention) ─────── */
const nounByStem = new Map();
const indexNoun = (job) => { if (job.kind === "word" && (job.type === "noun" || job.frame !== "action")) nounByStem.set(stem(job.word), job); };
[...jobs.values()].forEach(indexNoun);
for (const file of allLessonFiles()) {
  const L = JSON.parse(fs.readFileSync(file, "utf8"));
  const walk = (o, text) => {
    if (Array.isArray(o)) return o.forEach((x) => walk(x, text));
    if (!o || typeof o !== "object") return;
    const t = o.text || o.caption?.text || text;
    if (Array.isArray(o.props)) for (const p of o.props) {
      const s = stem(p.label);
      let job = nounByStem.get(s);
      if (!job) {
        job = add({ key: keyFor(p.label, "noun"), kind: "word", phase: 2, word: p.label.trim(), type: "noun", greek: "", meaning: "", examples: [], lessons: [], props: [], current: p.emoji, frame: frameFor(p.label, "noun") });
        nounByStem.set(s, job);
      }
      if (!job.props.includes(p.label)) job.props.push(p.label);
      if (t && mentions(t, p.label) && job.examples.length < 3 && !job.examples.includes(t)) job.examples.push(t);
      if (!job.lessons.includes(L.id)) job.lessons.push(L.id);
      if (!job.current) job.current = p.emoji;
    }
    for (const v of Object.values(o)) if (v && typeof v === "object") walk(v, t);
  };
  walk(L.scenes, "");
}

/* ── 4. The rest of the word bank (games, worksheets) ─────────────── */
for (const w of CPP_WORDBANK) {
  const type = typeOf(w.type);
  if (SKIP_TYPES.has(type)) continue;
  const key = keyFor(w.english, type);
  const existing = jobs.get(key) || (type === "noun" ? nounByStem.get(stem(w.english)) : null);
  if (existing) {
    if (!existing.greek && w.greek) existing.greek = w.greek;
    if (w.example && mentions(w.example, w.english) && existing.examples.length < 3 && !existing.examples.includes(w.example)) existing.examples.push(w.example);
    continue;
  }
  const job = add({ key, kind: "word", phase: type === "noun" ? 4 : 5, word: w.english.trim(), type, greek: w.greek || "", meaning: "", examples: w.example ? [w.example] : [], lessons: [], props: [], current: "", frame: frameFor(w.english, type) });
  if (type === "noun") nounByStem.set(stem(w.english), job);
}

/* ── 5. Game avatars (Lingo Live phones) and team mascots ─────────── */
const AVATAR_NAMES = { "🦊": "fox", "🐼": "panda", "🐯": "tiger", "🦁": "lion", "🐸": "frog", "🐵": "monkey", "🐨": "koala", "🐰": "rabbit", "🐻": "bear", "🐧": "penguin", "🦄": "unicorn", "🐙": "octopus", "🐢": "turtle", "🦉": "owl", "🐝": "bee", "🐬": "dolphin" };
const ui = [
  ...AVATARS.map((e) => ({ id: `ui-avatar-${AVATAR_NAMES[e] || slug(e)}`, what: `${AVATAR_NAMES[e]} avatar (head and shoulders, front view, big friendly eyes, for a student's game avatar)`, current: e })),
  { id: "ui-team-rockets", what: "team mascot: a friendly cartoon rocket with a smiling face, purple and white", current: "🚀" },
  { id: "ui-team-tigers", what: "team mascot: a friendly cartoon tiger cub head, orange", current: "🐯" },
  { id: "ui-team-dolphins", what: "team mascot: a friendly cartoon dolphin jumping, cyan", current: "🐬" },
  { id: "ui-team-dragons", what: "team mascot: a friendly baby dragon, green", current: "🐉" },
].map((u) => ({ ...u, key: u.id, kind: "ui", phase: 3, frame: "object", lessons: [] }));

/* ── Ids, look-alikes, siblings ───────────────────────────────────── */
const wordJobs = [...jobs.values()];
const typeCount = new Map();
for (const j of wordJobs) typeCount.set(j.word.toLowerCase(), (typeCount.get(j.word.toLowerCase()) || 0) + 1);
const used = new Set();
for (const j of wordJobs) {
  let id = `w-${slug(j.word)}${typeCount.get(j.word.toLowerCase()) > 1 ? `-${SHORT[j.type] || "x"}` : ""}`;
  while (used.has(id)) id += "-2";
  used.add(id);
  j.id = id;
}
const idByKey = new Map(wordJobs.map((j) => [j.key, j.id]));
const wordOf = new Map(wordJobs.map((j) => [j.key, j.word]));
for (const j of wordJobs) {
  const e = firstEmoji(j.current);
  j.lookalikes = e && emojiGroups.get(e) ? [...emojiGroups.get(e)].filter((k) => k !== j.key).map((k) => wordOf.get(k)) : [];
  const sib = new Set();
  for (const l of j.lessons) for (const k of lessonWords.get(l) || []) if (k !== j.key) sib.add(wordOf.get(k));
  j.sameLesson = [...sib].slice(0, 16);
}

/* Phase 0: a dozen anchors that fix the style before mass production. */
const ANCHORS = ["c-mia-child", "c-leo-child", "c-grandma-eleni-elder", "w-house", "w-carrot", "w-bee", "w-beach", "w-sing-songs", "w-chant", "w-run", "w-enormous", "w-under"];
const all = [...characters.values(), ...wordJobs, ...ui];
for (const id of ANCHORS) { const j = all.find((x) => x.id === id); if (j) j.phase = 0; }
const missingAnchors = ANCHORS.filter((id) => !all.some((x) => x.id === id));

/* Direction text per job. */
const FRAME_RULE = {
  object: "Draw the thing itself, isolated, in its most typical child-recognisable form.",
  scene: "Draw a small round vignette scene (soft-edged circle) that shows this place / weather / time of day.",
  person: "Draw one person (or the group, if plural) who is clearly this, recognisable by clothes and one tool.",
  action: "Show Mia or Leo clearly DOING this, one action only, with the key object; motion shown by pose, never by arrows.",
  quality: "Show one clear example that makes this quality obvious; use contrast inside the picture if needed (big next to small), never symbols.",
  relation: "Show a small yellow ball and a simple blue box (or the example's objects) placed to show the relation exactly.",
  character: "Full-body story character, standing, slight three-quarter turn, friendly expression, consistent outfit.",
};
for (const j of all) {
  j.file = `${j.id}.png`;
  j.direction = FRAME_RULE[j.frame];
}

/* ── Write files ──────────────────────────────────────────────────── */
const order = (a, b) => a.phase - b.phase || (a.kind === "character" ? -1 : 0) - (b.kind === "character" ? -1 : 0) || String(a.id).localeCompare(String(b.id));
const list = all.sort(order).map((j) => {
  const base = { id: j.id, phase: j.phase, kind: j.kind, file: j.file, frame: j.frame, direction: j.direction };
  if (j.kind === "character") return { ...base, name: j.name, role: j.role, look: j.look, personas: j.personas, placeholder: j.current, lessons: j.lessons, uses: j.uses };
  if (j.kind === "ui") return { ...base, what: j.what, placeholder: j.current };
  return { ...base, word: j.word, type: j.type, greek: j.greek, meaning: j.meaning, examples: j.examples, placeholder: j.current, lookalikes: j.lookalikes, sameLesson: j.sameLesson, lessons: j.lessons, props: j.props };
});
fs.writeFileSync(path.join(OUT, "jobs.json"), JSON.stringify({ v: 1, generated: new Date().toISOString().slice(0, 10), count: list.length, jobs: list }, null, 1) + "\n");

const csvCell = (v) => `"${String(Array.isArray(v) ? v.join("; ") : v ?? "").replace(/"/g, '""')}"`;
const cols = ["id", "phase", "kind", "frame", "word", "type", "greek", "meaning", "examples", "lookalikes", "sameLesson", "name", "role", "look", "personas", "what", "placeholder", "file"];
fs.writeFileSync(path.join(OUT, "jobs.csv"), [cols.join(","), ...list.map((j) => cols.map((c) => csvCell(j[c])).join(","))].join("\n") + "\n");

/* Batches: paste-ready, one file per 40 jobs, never mixing phases. */
for (const f of fs.readdirSync(path.join(OUT, "batches"))) fs.rmSync(path.join(OUT, "batches", f));
const PHASE_NAME = { 0: "anchors", 1: "lesson-words-and-characters", 2: "story-props", 3: "game-avatars", 4: "word-bank-nouns", 5: "word-bank-actions-and-qualities" };
const line = (j) => {
  if (j.kind === "character") return `- **${j.file}** — CHARACTER ${j.name} (${j.role}). ${j.look ? `Look: ${j.look}. ` : ""}Personality: ${j.personas[0] || ""}. Appears in ${j.lessons.length} lesson(s).`;
  if (j.kind === "ui") return `- **${j.file}** — ${j.what}.`;
  const parts = [`- **${j.file}** — "${j.word}" (${j.type}, frame: ${j.frame})`];
  if (j.meaning) parts.push(`Meaning: ${j.meaning}`);
  if (j.greek) parts.push(`Greek: ${j.greek}`);
  if (j.examples.length) parts.push(`Example: "${j.examples[0]}"`);
  if (j.lookalikes.length) parts.push(`MUST look different from: ${j.lookalikes.slice(0, 8).join(", ")}`);
  else if (j.sameLesson.length) parts.push(`Shown beside: ${j.sameLesson.slice(0, 8).join(", ")}`);
  if (j.placeholder) parts.push(`(old emoji placeholder: ${j.placeholder})`);
  return parts.join(" · ");
};
const batchIndex = [];
for (const phase of [0, 1, 2, 3, 4, 5]) {
  const items = list.filter((j) => j.phase === phase);
  for (let i = 0; i < items.length; i += BATCH) {
    const n = String(i / BATCH + 1).padStart(3, "0");
    const name = `phase-${phase}-${PHASE_NAME[phase]}-${n}.md`;
    const chunk = items.slice(i, i + BATCH);
    fs.writeFileSync(path.join(OUT, "batches", name), `# Phase ${phase} · ${PHASE_NAME[phase]} · batch ${n} (${chunk.length} images)\n\nFollow art-brief/pictures/PROMPT.md exactly. Save each image as art-brief/pictures/incoming/<file>.\n\n${chunk.map(line).join("\n")}\n`);
    batchIndex.push({ phase, name, count: chunk.length });
  }
}

/* Look-alike groups (current shared emoji) — the main source of confusion. */
const groups = [...emojiGroups.entries()].filter(([, s]) => s.size > 1).sort((a, b) => b[1].size - a[1].size);
fs.writeFileSync(path.join(OUT, "lookalikes.md"), `# Look-alike groups\n\nThese lesson words currently share the same emoji, so children cannot tell them apart. Every picture in a group must be instantly distinguishable from the others (different subject, action, setting or colour story). See PROMPT.md § "Telling look-alikes apart".\n\n${groups.map(([e, s]) => `- ${e} → ${[...s].map((k) => `${wordOf.get(k)} (${idByKey.get(k)}.png)`).join(" · ")}`).join("\n")}\n`);

/* Characters sheet. */
const chars = list.filter((j) => j.kind === "character");
fs.writeFileSync(path.join(OUT, "characters.md"), `# Story characters (${chars.length})\n\nEach character is ONE consistent design used in every lesson it appears in. Fixed looks are given for the recurring ones; for the others, design a look that matches the role and personality, and add one line to the "Looks chosen" list at the bottom so later images stay consistent.\n\n| file | name | role | look | personality | lessons |\n|---|---|---|---|---|---|\n${chars.map((c) => `| ${c.file} | ${c.name} | ${c.role} | ${c.look || "_design it_"} | ${c.personas[0] || ""} | ${c.lessons.length} |`).join("\n")}\n\n## Looks chosen (append here)\n\n`);

const counts = Object.fromEntries([0, 1, 2, 3, 4, 5].map((p) => [p, list.filter((j) => j.phase === p).length]));
fs.writeFileSync(path.join(OUT, "batches", "INDEX.md"), `# Batches\n\n| phase | batch | images |\n|---|---|---|\n${batchIndex.map((b) => `| ${b.phase} | ${b.name} | ${b.count} |`).join("\n")}\n\nTotal: ${list.length} images. Per phase: ${Object.entries(counts).map(([p, n]) => `${p}: ${n}`).join(" · ")}\n`);
console.log(`${list.length} jobs → art-brief/pictures (per phase ${JSON.stringify(counts)}); ${batchIndex.length} batches; ${groups.length} look-alike groups; ${chars.length} characters`);
if (missingAnchors.length) console.log(`! anchors not found: ${missingAnchors.join(", ")}`);
