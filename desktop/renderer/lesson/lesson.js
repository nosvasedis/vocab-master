/* Lessons — loads the catalog and lesson JSON, joins focus words with the word bank, opens the player. */
import { CPP_WORDBANK, CPP_BOOKS } from "../coursebook-data.js";
import { buildArcadeDeck, firstEmoji } from "../arcade/deck.js";
import { openPlayer, isPlayerOpen, closePlayer } from "./player.js";
import { onePicture } from "./wordmatch.js";

const byId = new Map(CPP_WORDBANK.map((w) => [w.id, w]));
// Most word-bank emojis are generic fillers (✨ sits on 200+ words); trust one only when ≤2 words share it.
const bankShare = new Map();
for (const w of CPP_WORDBANK) if (w.emojis) bankShare.set(w.emojis, (bankShare.get(w.emojis) || 0) + 1);
const trustedEmoji = (w) => ((bankShare.get(w.emojis) || 0) <= 2 ? firstEmoji(w.emojis) : "");
let catalogPromise = null;
let artPromise = null;

/** AI illustrations (assets/art/manifest.json) — empty until scripts/art/build-art.mjs has run. */
export function loadArt() {
  if (!artPromise) artPromise = fetch("./assets/art/manifest.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  return artPromise;
}

export const getWord = (id) => byId.get(id);

/** lessons/index.json → { schema, lessons: [...] } (cached). */
export function loadCatalog({ refresh = false } = {}) {
  if (!catalogPromise || refresh) {
    catalogPromise = fetch("./lessons/index.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : { lessons: [] }))
      .catch(() => ({ lessons: [] }));
  }
  return catalogPromise;
}

export async function loadLesson(entryOrId) {
  const cat = await loadCatalog();
  const entry = typeof entryOrId === "string" ? cat.lessons.find((l) => l.id === entryOrId) : entryOrId;
  if (!entry) throw new Error(`Lesson ${entryOrId} not found`);
  const res = await fetch(`./lessons/${entry.path}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Couldn't load ${entry.path}`);
  return res.json();
}

/** Focus words joined with their word-bank rows (lesson overrides win). */
export function lessonWords(lesson) {
  const map = new Map();
  for (const fw of lesson.focusWords || []) {
    const row = byId.get(fw.wordId);
    if (!row) continue;
    map.set(fw.wordId, {
      id: fw.wordId,
      english: row.english,
      type: row.type,
      greek: row.greek,
      example: row.example,
      emoji: onePicture(fw.emoji || firstEmoji(row.emojis)),
      emojis: fw.emoji || row.emojis,
      kidDefinition: fw.kidDefinition || "",
      examples: fw.examples || [],
      greekHint: fw.greekHint || "",
    });
  }
  return map;
}

/** An arcade deck from a lesson's focus words. */
export function lessonDeck(words) {
  return buildArcadeDeck([...words.values()].map((w) => ({
    english: w.english, type: w.type, greek: w.greek, emojis: w.emoji, example: w.examples[0] || w.example,
  })));
}

export function bookLabel(lesson) {
  const b = CPP_BOOKS[lesson.bookId];
  return `${b ? b.title.replace("Cambridge Primary Paths", "Primary Path") : lesson.bookId} · Unit ${lesson.unit}`;
}

/**
 * Open a lesson in the full-screen player.
 * @param {string|object} entryOrId catalog entry or lesson id
 * @param {{ picture: Function, prefs: object, onPrefs?: Function, onPlayGames?: (deck, title) => void, calm?: boolean }} opts
 */
export async function openLesson(entryOrId, opts) {
  if (isPlayerOpen()) return;
  const lesson = await loadLesson(entryOrId);
  const words = lessonWords(lesson);
  const deck = lessonDeck(words);
  const label = bookLabel(lesson);
  const art = await loadArt();
  openPlayer({
    artUrl: (key) => (art.backdrops?.[key] ? `./assets/art/${art.backdrops[key]}` : null),
    lesson,
    words,
    // Non-focus words (quiz distractors): the lesson's own picture, else a trusted bank emoji.
    wordById: (id) => { const w = byId.get(id); return w ? { ...w, emoji: lesson.pictures?.[id] || trustedEmoji(w) } : null; },
    deck,
    picture: opts.picture,
    bookLabel: label,
    prefs: opts.prefs,
    onPrefs: opts.onPrefs,
    calm: opts.calm,
    onPlayGames: opts.onPlayGames ? () => opts.onPlayGames(deck, `${label} · ${lesson.title}`) : null,
  });
}

export { isPlayerOpen as isLessonOpen, closePlayer as closeLesson };
