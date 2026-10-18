/* Word Board — builds the Jeopardy-style board (pure, DOM-free; tested in Node).
   Columns are question kinds, rows are points (100 … 500). Every tile gets its own word where the deck allows,
   and one hidden tile is a ⭐ double. Higher rows are harder: their wrong answers share the word's part of speech
   and its first letter where possible, and their gaps come without a picture clue. */
import { shuffle, maskWordInText, distractorsFor, firstEmoji, gapOptions } from "./deck.js";

export const CATEGORIES = {
  pic: { label: "Pictures", icon: "🖼️", ask: "What's this?" },
  gap: { label: "Fill the gap", icon: "✏️", ask: "Fill the gap" },
  spell: { label: "Spell it", icon: "🔤", ask: "Spell it!" },
  listen: { label: "Listen", icon: "👂", ask: "Which word do you hear?" },
  greek: { label: "In English", icon: "🇬🇷", ask: "In English, please!" },
};

const gapText = (w) => (maskWordInText(w.example, w.english) ? w.example : maskWordInText(w.collocation, w.english) ? w.collocation : "");
const can = {
  pic: (w) => !!firstEmoji(w.emojis),
  gap: (w) => !!gapText(w),
  spell: (w) => /^[a-z' -]{3,14}$/i.test(w.english) && (!!firstEmoji(w.emojis) || !!w.greek),
  listen: () => true,
  greek: (w) => !!w.greek,
};

/** Harder wrong answers for high rows: same part of speech and, where possible, the same first letter. */
function wrongFor(w, deck, hard) {
  if (!hard) return distractorsFor(w, deck, 3);
  const first = w.english[0]?.toLowerCase();
  const alike = deck.filter((d) => d.english !== w.english && d.english[0]?.toLowerCase() === first);
  const pool = alike.length >= 3 ? alike : deck;
  return distractorsFor(w, pool, 3);
}

/** One tile's question. kind ∈ CATEGORIES; level 0–4 (row). */
export function makeQuestion(kind, w, deck, level = 0) {
  const hard = level >= 3;
  const base = { kind, word: w, say: w.english, ask: CATEGORIES[kind].ask };
  if (kind === "spell") return { ...base, prompt: "", picture: firstEmoji(w.emojis), clue: firstEmoji(w.emojis) ? "" : w.greek, letters: w.english.replace(/[^a-z]/gi, "").length, answerText: w.english, judged: true };
  let options;
  let answer = w.english;
  let prompt = "";
  let picture = "";
  if (kind === "gap") {
    const text = gapText(w);
    const g = gapOptions(w, wrongFor(w, deck, hard), text);
    options = g.options;
    answer = g.answer;
    prompt = maskWordInText(text, w.english, "_____");
    picture = hard ? "" : firstEmoji(w.emojis);
  } else {
    options = [w.english, ...wrongFor(w, deck, hard)];
    if (kind === "pic") picture = firstEmoji(w.emojis);
    if (kind === "greek") prompt = w.greek;
  }
  const opts = shuffle(options);
  return { ...base, prompt, picture, options: opts, answer: opts.indexOf(answer), answerText: answer };
}

/**
 * The board: { cats: [kind…], rows: [100…], tiles: [[question…] per row], double: { r, c } }.
 * Uses up to 5 kinds that enough words support; 3–5 rows depending on the deck.
 */
export function buildBoard(deck, { greek = false, rnd = Math.random } = {}) {
  const words = shuffle(deck);
  const kinds = ["pic", "gap", "spell", "listen", ...(greek ? ["greek"] : [])];
  const support = Object.fromEntries(kinds.map((k) => [k, words.filter(can[k])]));
  const rowsN = Math.max(3, Math.min(5, Math.floor(words.length / 3)));
  const cats = kinds.filter((k) => support[k].length >= Math.min(rowsN, 3)).slice(0, 5);
  const rows = Array.from({ length: rowsN }, (_, i) => (i + 1) * 100);
  const used = new Set();
  const pick = (k) => {
    const fresh = support[k].filter((w) => !used.has(w.english));
    const list = fresh.length ? fresh : support[k];
    const w = list[Math.floor(rnd() * list.length)];
    used.add(w.english);
    return w;
  };
  const tiles = rows.map((_, r) => cats.map((k) => makeQuestion(k, pick(k), deck, r)));
  const double = { r: 1 + Math.floor(rnd() * (rowsN - 1)), c: Math.floor(rnd() * cats.length) };
  return { cats, rows, tiles, double };
}
