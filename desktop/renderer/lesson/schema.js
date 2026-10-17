/* ══════════════════════════════════════════════════════════════════
   Lesson schema v1 — pure, DOM-free. Shared by the lesson player (draft badge),
   the Node pipelines (drafting, audio) and the tests.
   A lesson is a list of scenes; every spoken/displayed line is { id, text, who?, style? }
   with a stable id, so audio keys survive edits: l:<lessonId>:<sceneId>:<lineId>.
   ══════════════════════════════════════════════════════════════════ */
import { maskWordInText } from "../arcade/deck.js";

export const SCHEMA_VERSION = 1;
export const SECTIONS = ["BQ", "A", "B"];
export const SCENE_TYPES = ["hook", "reveal", "story", "check", "practice", "speak", "recap"];
export const CHECK_KINDS = ["pickPicture", "listen", "gap", "trueFalse", "oddOneOut"];
export const PRACTICE_GAMES = { flashcards: 3, memory: 6, spelling: 3, quiz: 4, taboo: 4 };
export const BACKDROPS = ["home", "school", "classroom", "park", "city", "street", "beach", "forest", "farm", "kitchen", "shop", "space", "stage", "village", "garden", "playground", "cave", "snow", "zoo", "river", "museum", "mountain", "jungle", "underwater", "bedroom", "library", "station", "volcano", "savanna", "camp", "castle", "market"];
export const STATUSES = ["draft", "reviewed", "approved"];
/** Focus-word count range per section (BQ lessons are short hooks). */
export const FOCUS_RANGE = { BQ: [4, 14], A: [6, 14], B: [6, 14] };
/** Max words in one spoken/displayed sentence, per class profile (story & examples). */
export const MAX_SENTENCE_WORDS = { A_SENIOR: 12, B_SENIOR: 14, C_SENIOR: 17, D_SENIOR: 20, E_SENIOR: 24 };

export const lessonId = (bookId, unit, section) => `${bookId}-U${unit}-${section}`;
export const lessonPath = (bookId, unit, section) => `${bookId}/U${unit}-${section}.json`;
export const audioKey = (lessonIdValue, sceneId, lineId) => `l:${lessonIdValue}:${sceneId}:${lineId}`;

/** Normalise text for audio lookup (same rule everywhere: lowercase, collapse spaces, strip edge punctuation). */
export function normText(text) {
  return String(text || "")
    .replace(/_{2,}/g, " blank ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^[\s"'.,!?;:]+|[\s"'.,!?;:]+$/g, "");
}

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const isLine = (v) => isObj(v) && typeof v.id === "string" && v.id && typeof v.text === "string" && v.text.trim();
const wordCount = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;

/**
 * Every voiced line of a lesson, in play order: { key, sceneId, lineId, text, who, style, kind }.
 * kind: narration | dialogue | example | prompt | ui
 */
export function lessonLines(lesson) {
  const out = [];
  const push = (scene, line, kind, extra = {}) => {
    if (!isLine(line)) return;
    out.push({ key: audioKey(lesson.id, scene.id, line.id), sceneId: scene.id, lineId: line.id, text: line.text, who: line.who || (kind === "dialogue" ? "" : "lingo"), style: line.style || "", kind, ...extra });
  };
  for (const scene of lesson.scenes || []) {
    if (scene.type === "hook") {
      (scene.lines || []).forEach((l) => push(scene, l, "narration"));
      push(scene, scene.question, "prompt");
    } else if (scene.type === "story") {
      for (const p of scene.panels || []) {
        push(scene, p.caption, "narration");
        (p.speech || []).forEach((l) => push(scene, l, l.who && l.who !== "lingo" ? "dialogue" : "narration"));
      }
    } else if (scene.type === "check") {
      for (const it of scene.items || []) { push(scene, it.prompt, "prompt"); push(scene, it.explain, "narration"); }
    } else if (scene.type === "speak") {
      push(scene, scene.prompt, "prompt");
      push(scene, scene.model, "example");
    } else if (scene.type === "recap") {
      (scene.lines || []).forEach((l) => push(scene, l, "narration"));
      (scene.exitTicket || []).forEach((l) => push(scene, l, "prompt"));
    } else if (scene.type === "reveal" || scene.type === "practice") {
      (scene.lines || []).forEach((l) => push(scene, l, "narration"));
    }
  }
  for (const fw of lesson.focusWords || []) {
    if (typeof fw.kidDefinition === "string" && fw.kidDefinition.trim()) {
      out.push({ key: `d:${lesson.id}:${fw.wordId}`, sceneId: "words", lineId: `${fw.wordId}:def`, text: fw.kidDefinition, who: "lingo", style: "", kind: "narration" });
    }
    (fw.examples || []).forEach((text, i) => {
      if (typeof text === "string" && text.trim()) out.push({ key: `lx:${lesson.id}:${fw.wordId}:${i}`, sceneId: "words", lineId: `${fw.wordId}:${i}`, text, who: "lingo", style: "", kind: "example" });
    });
  }
  return out;
}

/* ── "Show what you say" ─────────────────────────────────────────────
   Props are pictures of the things a line talks about: { emoji, label } where label is the word as
   it appears in the text. The player shows them and lights each one up when its word is spoken. */
const isProp = (p) => isObj(p) && typeof p.emoji === "string" && p.emoji.trim() && typeof p.label === "string" && p.label.trim();
/** Singular stem for matching nouns to prop labels: babies→baby, boxes→box, houses→house, bus/class stay. */
export const stem = (w) => {
  const s = String(w).toLowerCase().replace(/[’]/g, "'").replace(/[^a-z' -]/g, "").replace(/'s?$/, "");
  if (/(cook|mov|p|t|brown|zomb|selfie|hood|goal)ies$/.test(s) && !/(stud|famil|bab|part|cit|countr|stor|lad|bod|hobb|lorr|ponies)ies$/.test(s)) return s.slice(0, -1);
  if (/ies$/.test(s)) return `${s.slice(0, -3)}y`;
  const IRREGULAR = { buses: "bus", potatoes: "potato", tomatoes: "tomato", heroes: "hero", mangoes: "mango" };
  if (IRREGULAR[s]) return IRREGULAR[s];
  if (/(ss|x|z|ch|sh)es$/.test(s)) return s.slice(0, -2);
  if (/[^sui]s$/.test(s)) return s.slice(0, -1);
  return s;
};

/** Concrete nouns (from `nouns`, a Set) mentioned in `text`. */
export function mentionedNouns(text, nouns) {
  const out = new Set();
  for (const raw of String(text || "").toLowerCase().match(/[a-z][a-z'-]*/g) || []) {
    const w = raw.replace(/'s$/, "");
    if (nouns.has(w)) out.add(w);
    else if (w.endsWith("ies") && nouns.has(`${w.slice(0, -3)}y`)) out.add(`${w.slice(0, -3)}y`);
    else if (w.endsWith("es") && nouns.has(w.slice(0, -2))) out.add(w.slice(0, -2));
    else if (w.endsWith("s") && nouns.has(w.slice(0, -1))) out.add(w.slice(0, -1));
  }
  return [...out];
}

function covers(noun, props, castWords) {
  const n = stem(noun);
  if (castWords.some((c) => stem(c) === n)) return true;
  return (props || []).some((p) => {
    const label = String(p.label).toLowerCase();
    // Whole label ("yo-yo", "T-shirt") or any word of it ("toy car" covers "car").
    return stem(label) === n || label.split(/[\s/,]+/).some((t) => stem(t) === n) || label.split(/[\s/,-]+/).some((t) => stem(t) === n);
  });
}

/* Words the illustrated backdrop already shows. */
export const BACKDROP_WORDS = {
  home: "home house room living sofa lamp window plant", school: "school building playground flag", classroom: "classroom class desk whiteboard board bookshelf",
  park: "park tree trees pond duck ducks flower flowers path grass", city: "city street building buildings bus stop road town", street: "street road shop shops house houses bicycle bike",
  beach: "beach sand sea wave waves shell shells palm", forest: "forest wood woods tree trees mushroom fern", farm: "farm barn field fields tractor cow cows chicken chickens",
  kitchen: "kitchen table pot pots window", shop: "shop store fruit shelf shelves", space: "space planet planets star stars rocket moon",
  stage: "stage theatre theater curtain curtains spotlight", village: "village house houses tree trees hill hills", garden: "garden sunflower sunflowers butterfly butterflies fence flower flowers",
  playground: "playground slide swing swings sandpit",
  cave: "cave rock rocks",
  snow: "snow snowman ice winter",
  zoo: "zoo cage animals",
  river: "river bridge water stone stones lake",
  museum: "museum skeleton display",
  mountain: "mountain mountains hill trail",
  jungle: "jungle rainforest vine vines leaves waterfall",
  underwater: "sea ocean fish coral underwater",
  bedroom: "bedroom bed room toys",
  library: "library books bookshelf shelf",
  station: "station train platform",
  volcano: "volcano smoke",
  savanna: "savanna grass waterhole",
  camp: "camp tent tents campfire",
  castle: "castle tower towers",
  market: "market stall stalls fruit vegetables",
};
export const backdropWords = (key) => (BACKDROP_WORDS[key] || "").split(" ");

/** Everything a line mentions that the screen doesn't show: [{ where, noun, text }]. */
export function visibilityIssues(lesson, nouns) {
  const issues = [];
  const castWordsFor = (whoList) => whoList.flatMap((who) => {
    const c = lesson.cast?.[who];
    return c ? `${c.name || ""} ${c.persona || ""} ${who}`.toLowerCase().match(/[a-z]+/g) || [] : [];
  });
  for (const scene of lesson.scenes || []) {
    if (scene.type === "story") {
      for (const p of scene.panels || []) {
        const present = (p.characters || []).map((c) => c.who);
        const cw = [...castWordsFor(present), ...backdropWords(p.backdrop || lesson.setting)];
        for (const line of [p.caption, ...(p.speech || [])].filter(Boolean)) {
          for (const noun of mentionedNouns(line.text, nouns)) if (!covers(noun, p.props, cw)) issues.push({ where: `${scene.id}/${p.id}`, noun, text: line.text });
        }
      }
    }
    if (scene.type === "hook") {
      for (const line of scene.lines || []) {
        for (const noun of mentionedNouns(line.text, nouns)) if (!covers(noun, [...(line.props || []), ...(scene.props || [])], [...backdropWords(scene.backdrop || lesson.setting), "owl", "lingo", "teacher"])) issues.push({ where: `${scene.id}/${line.id}`, noun, text: line.text });
      }
    }
    if (scene.type === "check") {
      for (const it of scene.items || []) {
        if (!["gap", "trueFalse"].includes(it.kind)) continue;
        const text = (it.prompt?.text || "").replace(/_{2,}/g, " ");
        for (const noun of mentionedNouns(text, nouns)) if (!covers(noun, it.props, [])) issues.push({ where: `${scene.id}/${it.id}`, noun, text });
      }
    }
  }
  return issues;
}

function checkProps(list, where, err) {
  if (list == null) return;
  if (!Array.isArray(list)) return err(`${where}: props must be an array`);
  if (list.length > 8) err(`${where}: at most 8 props`);
  for (const p of list) if (!isProp(p)) err(`${where}: each prop needs { emoji, label }`);
}

/**
 * Validate a lesson. `getWord(id)` returns the word-bank row or undefined.
 * Options: { hasClip?(key) } — when given, approved lessons must have every clip.
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateLesson(lesson, getWord, { hasClip, nouns, strictVisibility = false } = {}) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);
  if (!isObj(lesson)) return { errors: ["Lesson is not an object"], warnings };

  if (lesson.schema !== SCHEMA_VERSION) err(`schema must be ${SCHEMA_VERSION}`);
  for (const k of ["id", "bookId", "section", "title", "profile"]) if (typeof lesson[k] !== "string" || !lesson[k]) err(`missing ${k}`);
  if (!Number.isInteger(lesson.unit) || lesson.unit < 1) err("unit must be a positive integer");
  if (!SECTIONS.includes(lesson.section)) err(`section must be one of ${SECTIONS.join("/")}`);
  if (lesson.id && lesson.bookId && lesson.id !== lessonId(lesson.bookId, lesson.unit, lesson.section)) err(`id should be ${lessonId(lesson.bookId, lesson.unit, lesson.section)}`);
  if (!STATUSES.includes(lesson.status)) err(`status must be one of ${STATUSES.join("/")}`);
  if (lesson.setting && !BACKDROPS.includes(lesson.setting)) warn(`unknown setting "${lesson.setting}"`);
  const maxWords = MAX_SENTENCE_WORDS[lesson.profile] || 16;

  // Cast
  const cast = isObj(lesson.cast) ? lesson.cast : {};
  if (!cast.lingo) err("cast.lingo (the narrator) is required");
  const castIds = new Set(Object.keys(cast));
  if (castIds.size > 4) warn("more than 3 characters besides Lingo — keep stories simple");

  // Focus words
  const focus = Array.isArray(lesson.focusWords) ? lesson.focusWords : [];
  const focusIds = new Set();
  const [minF, maxF] = FOCUS_RANGE[lesson.section] || [4, 14];
  if (focus.length < minF || focus.length > maxF) err(`focusWords: ${focus.length} words (expected ${minF}–${maxF})`);
  for (const fw of focus) {
    const w = getWord(fw?.wordId);
    if (!w) { err(`focus word ${fw?.wordId} is not in the word bank`); continue; }
    if (focusIds.has(fw.wordId)) err(`focus word ${fw.wordId} listed twice`);
    focusIds.add(fw.wordId);
    if (w.bookId !== lesson.bookId || w.unit !== lesson.unit) err(`${fw.wordId} (${w.english}) belongs to ${w.bookId} unit ${w.unit}`);
    if (w.section !== lesson.section && w.section !== "WB" && w.section !== "SM") warn(`${fw.wordId} (${w.english}) is from section ${w.section}, not ${lesson.section}`);
    if (!fw.kidDefinition || typeof fw.kidDefinition !== "string") err(`${w.english}: kidDefinition missing`);
    if (!Array.isArray(fw.examples) || !fw.examples.length) err(`${w.english}: at least one example needed`);
    for (const ex of fw.examples || []) {
      if (!maskWordInText(ex, w.english)) warn(`${w.english}: example doesn't contain the word: "${ex}"`);
      if (wordCount(ex) > maxWords) warn(`${w.english}: example longer than ${maxWords} words: "${ex}"`);
    }
    const d = fw.distractors || [];
    if (d.length < 3) err(`${w.english}: needs 3 distractors`);
    if (d.some((x) => String(x).toLowerCase() === w.english.toLowerCase())) err(`${w.english}: a distractor equals the answer`);
    if (new Set(d.map((x) => String(x).toLowerCase())).size !== d.length) err(`${w.english}: duplicate distractors`);
  }
  for (const id of lesson.extensionWords || []) if (!getWord(id)) err(`extension word ${id} is not in the word bank`);
  // Pictures must tell words apart (picture questions depend on it).
  const pictureOf = new Map();
  for (const fw of focus) {
    const pic = String(fw.emoji || "").replace(/\s+/g, "");
    if (!pic) { err(`${fw.wordId}: emoji picture missing`); continue; }
    if (pictureOf.has(pic)) err(`${getWord(fw.wordId)?.english} and ${pictureOf.get(pic)} use the same picture ${pic}`);
    pictureOf.set(pic, getWord(fw.wordId)?.english);
  }

  // Scenes
  const scenes = Array.isArray(lesson.scenes) ? lesson.scenes : [];
  if (!scenes.length) err("no scenes");
  const sceneIds = new Set();
  const seenInStory = new Set();
  const seenInCheck = new Set();
  const lineIds = new Set();
  const checkLine = (scene, line, label) => {
    if (!isLine(line)) { err(`${scene.id}: ${label} must be { id, text }`); return; }
    const k = `${scene.id}:${line.id}`;
    if (lineIds.has(k)) err(`${scene.id}: duplicate line id ${line.id}`);
    lineIds.add(k);
    if (line.who && !castIds.has(line.who)) err(`${scene.id}/${line.id}: speaker "${line.who}" is not in the cast`);
    if (wordCount(line.text) > maxWords + 6) warn(`${scene.id}/${line.id}: long line (${wordCount(line.text)} words)`);
  };
  const markWords = (text, set) => {
    for (const id of focusIds) { const w = getWord(id); if (w && maskWordInText(text, w.english)) set.add(id); }
  };

  for (const scene of scenes) {
    if (!isObj(scene) || !scene.id) { err("scene without id"); continue; }
    if (sceneIds.has(scene.id)) err(`duplicate scene id ${scene.id}`);
    sceneIds.add(scene.id);
    if (!SCENE_TYPES.includes(scene.type)) { err(`${scene.id}: unknown type ${scene.type}`); continue; }
    if (scene.backdrop && !BACKDROPS.includes(scene.backdrop)) warn(`${scene.id}: unknown backdrop "${scene.backdrop}"`);

    if (scene.type === "hook") {
      if (!(scene.lines || []).length) err(`${scene.id}: hook needs lines`);
      (scene.lines || []).forEach((l) => { checkLine(scene, l, "line"); checkProps(l.props, `${scene.id}/${l.id}`, err); });
      checkProps(scene.props, scene.id, err);
      if (scene.question) checkLine(scene, scene.question, "question");
    }
    if (scene.type === "reveal") {
      const ids = scene.words || [];
      if (!ids.length) err(`${scene.id}: reveal needs words`);
      for (const id of ids) if (!focusIds.has(id)) err(`${scene.id}: ${id} is not a focus word`);
      if (scene.greek && !["tap", "after", "never"].includes(scene.greek)) err(`${scene.id}: greek must be tap/after/never`);
      (scene.lines || []).forEach((l) => checkLine(scene, l, "line"));
    }
    if (scene.type === "story") {
      const panels = scene.panels || [];
      if (panels.length < 2) err(`${scene.id}: story needs at least 2 panels`);
      const panelIds = new Set();
      for (const p of panels) {
        if (!p.id || panelIds.has(p.id)) err(`${scene.id}: panel id missing or duplicate`);
        panelIds.add(p.id);
        if (p.backdrop && !BACKDROPS.includes(p.backdrop)) warn(`${scene.id}/${p.id}: unknown backdrop "${p.backdrop}"`);
        checkProps(p.props, `${scene.id}/${p.id}`, err);
        if (p.caption) { checkLine(scene, p.caption, "caption"); markWords(p.caption.text, seenInStory); }
        if (!(p.speech || []).length && !p.caption) err(`${scene.id}/${p.id}: panel has no text`);
        for (const l of p.speech || []) { checkLine(scene, l, "speech"); markWords(l.text, seenInStory); }
        for (const c of p.characters || []) if (!castIds.has(c.who)) err(`${scene.id}/${p.id}: character "${c.who}" not in cast`);
        for (const id of p.highlight || []) if (!focusIds.has(id)) warn(`${scene.id}/${p.id}: highlight ${id} is not a focus word`);
      }
    }
    if (scene.type === "check") {
      const items = scene.items || [];
      if (!items.length) err(`${scene.id}: check needs items`);
      for (const it of items) {
        const where = `${scene.id}/${it.id || "?"}`;
        if (!it.id) err(`${where}: item id missing`);
        if (!CHECK_KINDS.includes(it.kind)) { err(`${where}: unknown kind ${it.kind}`); continue; }
        checkLine(scene, it.prompt, "prompt");
        checkProps(it.props, where, err);
        if (it.explain) checkLine(scene, it.explain, "explain");
        const opts = it.options || [];
        if (it.kind === "trueFalse") {
          if (opts.length !== 2) err(`${where}: trueFalse needs exactly 2 options`);
        } else if (opts.length < 3 || opts.length > 4) err(`${where}: needs 3–4 options`);
        if (new Set(opts.map((o) => String(o).toLowerCase())).size !== opts.length) err(`${where}: duplicate options`);
        if (!Number.isInteger(it.answer) || it.answer < 0 || it.answer >= opts.length) err(`${where}: answer index out of range`);
        if (it.wordId) {
          if (!focusIds.has(it.wordId)) err(`${where}: wordId ${it.wordId} is not a focus word`);
          else seenInCheck.add(it.wordId);
          const w = getWord(it.wordId);
          if (w?.greek && it.prompt?.text?.includes(w.greek)) err(`${where}: the Greek answer leaks into the prompt`);
          if (it.kind === "gap" && w && it.prompt?.text) {
            const prompt = it.prompt.text.replace(/_{2,}/g, " ");
            // Multi-word answers ("wind instrument") may share a word with the prompt; only the whole phrase leaks.
            const leaks = /\s/.test(w.english.trim()) ? prompt.toLowerCase().includes(w.english.trim().toLowerCase()) : !!maskWordInText(prompt, w.english);
            if (leaks) err(`${where}: gap prompt still contains the answer word`);
          }
        }
        if (["pickPicture", "listen"].includes(it.kind)) for (const o of opts) if (!focusIds.has(o) && !getWord(o)) err(`${where}: ${it.kind} options must be word ids (${o})`);
        if (it.kind === "gap" && !/_{2,}/.test(it.prompt?.text || "")) err(`${where}: gap prompt needs "____"`);
      }
    }
    if (scene.type === "practice") {
      const min = PRACTICE_GAMES[scene.game];
      if (!min) err(`${scene.id}: unknown game ${scene.game}`);
      const count = (scene.words && scene.words.length) || focus.length;
      if (min && count < min) err(`${scene.id}: ${scene.game} needs at least ${min} words`);
      (scene.lines || []).forEach((l) => checkLine(scene, l, "line"));
    }
    if (scene.type === "speak") {
      checkLine(scene, scene.prompt, "prompt");
      if (scene.model) checkLine(scene, scene.model, "model");
      if (!Array.isArray(scene.frames) || !scene.frames.length) warn(`${scene.id}: no sentence frames`);
      if (scene.timerSec != null && !(scene.timerSec >= 10 && scene.timerSec <= 300)) err(`${scene.id}: timerSec should be 10–300`);
    }
    if (scene.type === "recap") {
      (scene.lines || []).forEach((l) => checkLine(scene, l, "line"));
      (scene.exitTicket || []).forEach((l) => checkLine(scene, l, "exit ticket"));
      if (!scene.badge?.emoji || !scene.badge?.name) warn(`${scene.id}: badge missing`);
    }
  }

  const types = scenes.map((s) => s.type);
  for (const must of ["reveal", "check", "recap"]) if (!types.includes(must)) err(`lesson needs a ${must} scene`);
  if (lesson.section !== "BQ" && !types.includes("story")) warn("A/B lessons should include a story");

  for (const id of focusIds) {
    const w = getWord(id);
    const name = w?.english || id;
    const inExamples = (lesson.focusWords.find((f) => f.wordId === id)?.examples || []).length > 0;
    if (types.includes("story") && !seenInStory.has(id) && !inExamples) warn(`${name} never appears in the story or an example`);
    if (!seenInCheck.has(id)) warn(`${name} has no check item`);
  }

  if (nouns) {
    for (const v of visibilityIssues(lesson, nouns)) (strictVisibility ? err : warn)(`${v.where}: "${v.noun}" is mentioned but not shown — add a prop { emoji, label: "${v.noun}" } (${v.text})`);
  }

  if (lesson.status === "approved" && hasClip) {
    // Only clips the player can play: it shows a word's first example, so later examples are never voiced (see build-audio).
    const played = (l) => !(l.kind === "example" && !l.key.endsWith(":0"));
    const missing = lessonLines(lesson).filter((l) => played(l) && !hasClip(l.key));
    if (missing.length) err(`${missing.length} line(s) have no audio clip (first: ${missing[0].key})`);
  }
  return { errors, warnings };
}
