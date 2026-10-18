/* ══════════════════════════════════════════════════════════════════
   Vocab Master — Arcade deck helpers (pure, DOM-free)
   Shared by the engine (app.js) and the Lingo Arcade games.
   ══════════════════════════════════════════════════════════════════ */
import { picForWord, isPicToken } from "../js/pics.js";

export function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Vocabulary fields may arrive as strings, string arrays or {text, type, greek} objects. */
function flattenField(value) {
  if (!value) return "";
  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (!v) return "";
        if (typeof v === "string") return v.trim();
        const text = String(v.text || v.english || "").trim();
        if (!text) return "";
        const type = v.type ? ` (${String(v.type).trim()})` : "";
        const greek = v.greek ? ` - ${String(v.greek).trim()}` : "";
        return `${text}${type}${greek}`;
      })
      .filter(Boolean)
      .join(", ");
  }
  if (typeof value === "object") return flattenField([value]);
  return String(value).trim();
}

/** English-only tokens of a field ("competition (n.) - διαγωνισμός, rival" → ["competition", "rival"]). */
export function englishParts(value) {
  return flattenField(value)
    .split(/[,;/|]+/)
    .map((part) => part.replace(/\([^)]*\)/g, "").split(/\s+-\s+/)[0].trim())
    .filter((part) => part && /[a-z]/i.test(part));
}

/**
 * Mask a target word inside a collocation or example sentence with a gap.
 * Returns null when the word cannot be found (so callers never show an un-gapped clue).
 */
export function maskWordInText(text, english, gap = "____") {
  const raw = String(text || "").trim();
  const word = String(english || "").trim();
  if (!raw || !word) return null;
  const exact = new RegExp(`\\b${escapeRegex(word)}\\w*`, "gi");
  if (exact.test(raw)) return raw.replace(exact, gap);
  // Multi-word targets: mask each content word.
  const parts = word.split(/\s+/).filter((p) => p.length > 2);
  if (parts.length > 1) {
    let out = raw;
    let hit = false;
    for (const p of parts) {
      const rx = new RegExp(`\\b${escapeRegex(p)}\\w*`, "gi");
      if (rx.test(out)) { out = out.replace(rx, gap); hit = true; }
    }
    if (hit) return out;
  }
  if (word.length > 4) {
    const stem = new RegExp(`\\b${escapeRegex(word.slice(0, Math.max(3, word.length - 2)))}\\w*`, "gi");
    if (stem.test(raw)) return raw.replace(stem, gap);
  }
  return null;
}

/** The word as it is written in the text — "uncles" for "uncle", "families" for "family" — or "" when not found
 *  as a single word (multi-word targets are masked part by part and keep their dictionary form). */
export function surfaceForm(text, english) {
  const raw = String(text || "");
  const word = String(english || "").trim();
  if (!raw || !word || /\s/.test(word)) return "";
  const exact = new RegExp(`\\b${escapeRegex(word)}\\w*`, "i").exec(raw);
  if (exact) return exact[0];
  if (word.length > 4) {
    const stem = new RegExp(`\\b${escapeRegex(word.slice(0, Math.max(3, word.length - 2)))}\\w*`, "i").exec(raw);
    if (stem) return stem[0];
  }
  return "";
}

/** The ending a form adds to its base word: uncle→uncles "s", family→families "s", run→running "ing", make→made "". */
function endingOf(base, form) {
  const b = base.toLowerCase();
  const f = form.toLowerCase();
  if (f === b) return "";
  if (f.startsWith(b)) {
    let e = f.slice(b.length);
    if (e.length > 2 && e[0] === b.at(-1) && ["ing", "ed", "er", "est"].includes(e.slice(1))) e = e.slice(1); // running, stopped
    return ["s", "es", "ed", "d", "ing", "er", "est"].includes(e) ? e : "";
  }
  if (b.endsWith("y") && f.startsWith(`${b.slice(0, -1)}i`)) return { ies: "s", ied: "ed", ier: "er", iest: "est" }[f.slice(b.length - 1)] || "";
  if (b.endsWith("e") && f === `${b.slice(0, -1)}ing`) return "ing";
  return "";
}

/** Give `word` the ending that turns `base` into `form` (uncle→uncles makes aunt→aunts). Unknown endings: unchanged. */
export function inflectLike(word, base, form) {
  const w = String(word || "");
  const end = endingOf(String(base || ""), String(form || ""));
  if (!end || /\s/.test(w)) return w;
  const cons = /[^aeiou]y$/i.test(w);
  // Short words double their last consonant: swim → swimming, big → bigger, stop → stopped.
  const dbl = /^[^aeiou]*[aeiou][^aeiouwxy]$/i.test(w) && end !== "s" && end !== "es" ? w.at(-1) : "";
  if (dbl && ["ing", "ed", "er", "est"].includes(end)) return `${w}${dbl}${end}`;
  if (end === "s" || end === "es") return /(s|x|z|ch|sh)$/i.test(w) ? `${w}es` : cons ? `${w.slice(0, -1)}ies` : `${w}s`;
  if (end === "ed" || end === "d") return /e$/i.test(w) ? `${w}d` : cons ? `${w.slice(0, -1)}ied` : `${w}ed`;
  if (end === "ing") return /[^e]e$/i.test(w) ? `${w.slice(0, -1)}ing` : `${w}ing`;
  return /e$/i.test(w) ? `${w}${end.slice(1)}` : cons ? `${w.slice(0, -1)}i${end}` : `${w}${end}`; // er / est
}

/** Options for a gap: the form in the sentence plus distractors with the same ending. */
export function gapOptions(target, distractors, text) {
  let form = surfaceForm(text, target.english) || target.english;
  // A capital only because the word starts the sentence would give the answer away.
  if (!/^[A-Z]/.test(target.english)) form = form.toLowerCase();
  return { answer: form, options: [form, ...distractors.map((d) => inflectLike(d, target.english, form))] };
}

/** A speaking prompt for the back of a flashcard (never shown before the answer). */
export function buildOracyPrompt(item) {
  const w = item.english;
  const phrase = item.collocation && item.collocation.toLowerCase() !== w.toLowerCase() ? item.collocation : w;
  const pos = String(item.type || "").toLowerCase();
  if (/\bv\b|verb|phr/.test(pos)) return `Ask your partner a question with “${phrase}” — or act out “${w}” for the class!`;
  if (/adj/.test(pos)) return `Name two things you could describe as “${w}”. Use “${phrase}” in a sentence.`;
  if (/adv/.test(pos)) return `Mime an action “${w}” — the class guesses what you are doing.`;
  return `Make a true sentence about your family, school or weekend with “${phrase}”.`;
}

/** Normalise raw vocabulary rows into a clean, playable deck (unique headwords, string fields). */
export function buildArcadeDeck(rawWords = [], lookupFn = null) {
  const seen = new Set();
  const deck = [];
  for (const raw of rawWords) {
    const english = String(raw?.english || "").trim();
    if (!english) continue;
    const key = english.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const cb = typeof lookupFn === "function" ? lookupFn(english) : null;
    const pick = (field) => flattenField(raw[field]) || flattenField(cb?.[field]);
    const type = pick("type");
    const emojis = pick("emojis");
    const item = {
      english,
      type,
      greek: pick("greek"),
      // The illustrated picture (picture set, "@w-…" token) replaces the emoji when the word has one.
      emojis: isPicToken(firstEmoji(emojis)) ? emojis : picForWord(english, type, firstEmoji(emojis)) || emojis,
      collocation: pick("collocation"),
      example: pick("example"),
      derivatives: pick("derivatives"),
      synonyms: pick("synonyms"),
      antonyms: pick("antonyms"),
    };
    item.oracyPrompt = buildOracyPrompt(item);
    deck.push(item);
  }
  return deck;
}

const FALLBACK_DISTRACTORS = [
  "journey", "explore", "ancient", "protect", "discover", "habitat", "festival", "energy",
  "neighbour", "invent", "brave", "careful", "village", "machine", "ocean", "healthy",
];

export function distractorsFor(target, deck, count = 3) {
  const t = target.english.toLowerCase();
  const sameType = (w) => (w.type || "").replace(/\W/g, "") === (target.type || "").replace(/\W/g, "");
  const others = deck.filter((w) => w.english.toLowerCase() !== t);
  // Prefer distractors of the same part of speech so the answer can't be guessed by grammar.
  const ranked = [...shuffle(others.filter(sameType)), ...shuffle(others.filter((w) => !sameType(w)))];
  const out = ranked.slice(0, count).map((w) => w.english);
  for (const fb of shuffle(FALLBACK_DISTRACTORS)) {
    if (out.length >= count) break;
    if (fb !== t && !out.includes(fb)) out.push(fb);
  }
  return out;
}

/** Full name of a word-bank part-of-speech tag ("phr. v." → "phrasal verb"). */
export function typeName(t) {
  const m = { "n.": "noun", "v.": "verb", "adj.": "adjective", "adv.": "adverb", "phr.": "phrase", "prep.": "preposition", "phr. v.": "phrasal verb", "pron.": "pronoun", "conj.": "conjunction", "excl.": "exclamation", "det.": "determiner" };
  const k = String(t || "").trim();
  return m[k] || k;
}

/**
 * Quiz Show questions — three rotating rounds:
 *  • Context gap (collocation / example with the word removed)
 *  • Meaning (Greek → English, only when Greek is on) or picture (emoji → English)
 *  • Word family (synonym / opposite / derivative clue)
 * The clue never carries Greek; `greekClue` is shown separately and only when Greek is on.
 */
const maskSource = (t) => (maskWordInText(t.example, t.english) ? t.example : t.collocation);

export function buildDetectiveQuestions(deck = [], maxQuestions = 10, { greek = true } = {}) {
  if (!Array.isArray(deck) || deck.length < 2) return [];
  const pool = shuffle(deck).slice(0, maxQuestions);
  return pool.map((target, idx) => {
    const options = shuffle([target.english, ...distractorsFor(target, deck)]);
    const gapped = maskWordInText(target.example, target.english) || maskWordInText(target.collocation, target.english);
    const family = [];
    if (target.synonyms) family.push({ label: "means the same as", value: englishParts(target.synonyms).slice(0, 2).join(", ") });
    if (target.antonyms) family.push({ label: "is the opposite of", value: englishParts(target.antonyms).slice(0, 2).join(", ") });
    const base = { id: `q${idx + 1}`, answer: target.english, say: target.english, options, target, greekClue: target.greek || "" };
    const round = idx % 3;
    // A gap shows the word as the sentence needs it ("uncles"), and so do the wrong answers ("aunts").
    const gapQ = () => {
      const g = gapOptions(target, options.filter((o) => o !== target.english), maskSource(target));
      return { ...base, kind: "context", kindLabel: "Fill the gap", prompt: gapped, clue: target.emojis || "", answer: g.answer, options: shuffle(g.options) };
    };
    if (round === 0 && gapped) return gapQ();
    if (round === 2 && family.length && family[0].value) {
      const f = family[0];
      return { ...base, kind: "family", kindLabel: "Word family", prompt: `Which word ${f.label} “${f.value}”?`, clue: target.emojis || "" };
    }
    if (greek && target.greek) {
      return { ...base, kind: "meaning", kindLabel: "What's the English?", prompt: target.greek, clue: target.emojis || "", promptLang: "el", greekClue: "" };
    }
    if (firstEmoji(target.emojis)) {
      return { ...base, kind: "picture", kindLabel: "What's this?", prompt: "", clue: target.emojis, bigClue: true };
    }
    if (gapped) return gapQ();
    return { ...base, kind: "listen", kindLabel: "Listen & choose", prompt: "Listen to the word and pick it!", clue: target.emojis || "", speakOnly: true };
  });
}

const TABOO_STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "your", "are", "was", "his", "her", "its", "our", "their", "from", "into",
  "onto", "about", "this", "that", "these", "those", "some", "any", "have", "has", "had", "can", "will", "very",
  "not", "but", "out", "off", "all", "too", "one", "get", "got", "make", "made", "take", "took", "something",
]);

/** Forbidden words for Taboo: the word family first, then collocation partners, then other deck words. */
export function buildTabooCard(target, deck = [], count = 3) {
  const t = target.english.toLowerCase();
  const stem = t.slice(0, Math.max(4, t.length - 2));
  const words = new Set();
  const add = (token) => {
    const clean = String(token || "").toLowerCase().replace(/[^a-z' -]/g, "").trim();
    if (!clean || clean.length < 3 || TABOO_STOPWORDS.has(clean)) return;
    if (clean === t || clean.startsWith(stem) || t.includes(clean)) return;
    words.add(clean);
  };
  englishParts(target.synonyms).forEach(add);
  englishParts(target.antonyms).forEach(add);
  englishParts(target.derivatives).forEach(add);
  String(target.collocation || "").split(/\s+/).forEach(add);
  String(target.example || "").split(/\s+/).forEach(add);
  for (const w of shuffle(deck)) {
    if (words.size >= count) break;
    add(w.english);
  }
  return { ...target, forbiddenWords: [...words].slice(0, count) };
}

/** The first space-separated picture in an emojis field ("🐶 🐱" → "🐶"). */
export function firstEmoji(emojis) {
  return String(emojis || "").trim().split(/\s+/)[0] || "";
}
