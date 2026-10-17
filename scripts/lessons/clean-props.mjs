#!/usr/bin/env node
/* Props = pictures of the concrete things a line mentions ("show what you say"). This keeps only the props
   that are actually needed and readable:
   1. a prop must cover a picturable noun (content/visual-lexicon.json) that the text mentions and that the
      backdrop or a character on stage doesn't already show — abstract words (brave, amazing, beginning)
      and redundant pictures (museum inside the museum, Nico next to Nico) are dropped;
   2. quiz items only keep props for gap / true-false sentences (elsewhere they can give answers away);
   3. "rebus" pictures (🧠🟰🧠, 🌱➡️🌳, 🟥⬜🟥…) are replaced from PICTURE_FIXES, or reported.
   Every lesson is re-validated (0 unshown mentions) before it is written.
   Usage: node scripts/lessons/clean-props.mjs [--dry-run] */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../lib/env.mjs";
import { allLessonFiles, getWord, writeLesson, writeCatalog } from "./lib/catalog.mjs";
import { validateLesson, visibilityIssues, mentionedNouns, backdropWords, stem } from "../../desktop/renderer/lesson/schema.js";
import { PICTURE_FIXES, PROP_ADDS } from "./prop-pictures.mjs";

const DRY = process.argv.includes("--dry-run");
const NOUNS = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, "content", "visual-lexicon.json"), "utf8")).nouns);
const REBUS = /[➡⬅⬆⬇↔🟰➕➖✖❌⭕🔽🔼▶◀⬛⬜🟥🟧🟨🟩🟦🟪🟫🔴🟠🟡🟢🔵🟣🟤⚫⚪🌀💥]/u;
const words = (s) => String(s).toLowerCase().split(/[\s/,-]+/).filter(Boolean);

/** Nouns a set of lines needs pictured, given words already on stage. */
function needed(texts, onStage) {
  const stage = new Set(onStage.map(stem));
  const out = new Set();
  for (const t of texts) for (const n of mentionedNouns(t, NOUNS)) if (!stage.has(stem(n))) out.add(stem(n));
  return out;
}
const coversAny = (p, need) => need.has(stem(p.label)) || words(p.label).some((w) => need.has(stem(w)));

const stats = { kept: 0, dropped: 0, fixed: 0, lessons: 0 };
const unresolved = new Map(); // "label emoji" → count
const droppedSamples = new Map();

function cleanList(list, need) {
  if (!Array.isArray(list)) return list;
  const out = [];
  for (const p of list) {
    if (!coversAny(p, need) || out.some((q) => stem(q.label) === stem(p.label))) {
      stats.dropped++;
      const k = `${p.label} ${p.emoji}`;
      droppedSamples.set(k, (droppedSamples.get(k) || 0) + 1);
      continue;
    }
    const fix = PICTURE_FIXES[p.label.toLowerCase()];
    if (fix && fix !== p.emoji) { p.emoji = fix; stats.fixed++; }
    else if (!fix && REBUS.test(p.emoji)) { const k = `${p.label.toLowerCase()} ${p.emoji}`; unresolved.set(k, (unresolved.get(k) || 0) + 1); }
    out.push(p);
    stats.kept++;
  }
  return out;
}

for (const file of allLessonFiles()) {
  const lesson = JSON.parse(fs.readFileSync(file, "utf8"));
  const before = JSON.stringify(lesson);
  const castWords = (who) => { const c = lesson.cast?.[who]; return c ? `${c.name || ""} ${c.persona || ""} ${who}`.toLowerCase().match(/[a-z]+/g) || [] : []; };
  for (const scene of lesson.scenes) {
    if (scene.type === "story") {
      for (const p of scene.panels || []) {
        const onStage = [...(p.characters || []).flatMap((c) => castWords(c.who)), ...backdropWords(p.backdrop || lesson.setting)];
        const texts = [p.caption, ...(p.speech || [])].filter(Boolean).map((l) => l.text);
        p.props = cleanList(p.props, needed(texts, onStage));
        if (!p.props?.length) delete p.props;
        for (const line of [p.caption, ...(p.speech || [])].filter(Boolean)) {
          if (!line.props) continue;
          line.props = cleanList(line.props, needed([line.text], onStage));
          if (!line.props.length) delete line.props;
        }
      }
    } else if (scene.type === "hook") {
      const onStage = [...backdropWords(scene.backdrop || lesson.setting), "owl", "lingo", "teacher"];
      for (const line of [...(scene.lines || []), scene.question].filter(Boolean)) {
        if (!line.props) continue;
        line.props = cleanList(line.props, needed([line.text], onStage));
        if (!line.props.length) delete line.props;
      }
      if (scene.props) {
        const lineCovered = new Set((scene.lines || []).flatMap((l) => (l.props || []).flatMap((p) => [stem(p.label), ...words(p.label).map(stem)])));
        const need = needed((scene.lines || []).map((l) => l.text), onStage);
        for (const c of lineCovered) need.delete(c);
        scene.props = cleanList(scene.props, need);
        if (!scene.props.length) delete scene.props;
      }
    } else if (scene.type !== "check") {
      // Other scenes (reveal, practice, speak, recap): lines spoken by Lingo — same rule, backdrop on stage.
      const onStage = [...backdropWords(scene.backdrop || lesson.setting), "owl", "lingo", "teacher"];
      for (const line of [...(scene.lines || []), ...(scene.exitTicket || []), scene.prompt, scene.model].filter(Boolean)) {
        if (!line.props) continue;
        line.props = cleanList(line.props, needed([line.text], onStage));
        if (!line.props.length) delete line.props;
      }
      if (scene.props) { scene.props = cleanList(scene.props, needed((scene.lines || []).map((l) => l.text), onStage)); if (!scene.props.length) delete scene.props; }
    }
    if (scene.type === "check") {
      for (const it of scene.items || []) {
        if (!it.props) continue;
        const need = ["gap", "trueFalse"].includes(it.kind) ? needed([(it.prompt?.text || "").replace(/_{2,}/g, " ")], []) : new Set();
        it.props = cleanList(it.props, need);
        if (!it.props.length) delete it.props;
      }
    }
  }
  for (const [k, adds] of Object.entries(PROP_ADDS)) {
    const [id, where] = k.split("|");
    if (id !== lesson.id) continue;
    const [sid, pid] = where.split("/");
    const sc = lesson.scenes.find((s) => s.id === sid);
    const target = sc?.type === "story" ? sc.panels.find((p) => p.id === pid) : sc?.items?.find((i) => i.id === pid);
    if (!target) continue;
    target.props = target.props || [];
    for (const a of adds) if (!target.props.some((p) => stem(p.label) === stem(a.label))) target.props.push({ ...a });
  }
  if (JSON.stringify(lesson) === before) continue;
  const issues = visibilityIssues(lesson, NOUNS);
  const { errors } = validateLesson(lesson, getWord, {});
  if (issues.length || errors.length) { console.log(`✗ ${lesson.id}: ${issues[0] ? `${issues[0].where} "${issues[0].noun}"` : errors[0]}`); continue; }
  stats.lessons++;
  if (!DRY) writeLesson(lesson);
}
if (!DRY) writeCatalog();
console.log(`${stats.lessons} lessons · kept ${stats.kept} props · dropped ${stats.dropped} · pictures fixed ${stats.fixed}${DRY ? " (dry run)" : ""}`);
if (unresolved.size) console.log(`Rebus pictures still to fix (${unresolved.size}):\n  ${[...unresolved.keys()].join("\n  ")}`);
if (process.argv.includes("--show-dropped")) console.log([...droppedSamples.entries()].sort((a, b) => b[1] - a[1]).slice(0, 400).map(([k, n]) => `${k}×${n}`).join(" | "));
