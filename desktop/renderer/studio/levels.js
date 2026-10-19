/* Vocab Master — class-level defaults for the dictation maker, the unit test builder and the assistant (pure).
 * A–E Senior map to the app's CLASS_PROFILES (A Senior ≈ ages 8–10, Pre-A1/A1 … E Senior ≈ 13–14, B1).
 * Sentence lengths follow each profile's maxSentenceWords; grammar menus follow the usual Greek
 * φροντιστήριο syllabus for that level. */

export const LEVEL_IDS = ["A_SENIOR", "B_SENIOR", "C_SENIOR", "D_SENIOR", "E_SENIOR"];
const LEVEL_IDS_LIST = LEVEL_IDS;

/** Dictation defaults per level. len = words per sentence [min, max] at "normal" difficulty. */
export const DICTATION_DEFAULTS = {
  A_SENIOR: { style: "classic", count: 6, len: [4, 6], targets: 1, repeats: 3, punctuationAloud: true, gapsPerSentence: 1, textWords: 35 },
  B_SENIOR: { style: "classic", count: 8, len: [5, 8], targets: 1, repeats: 3, punctuationAloud: true, gapsPerSentence: 1, textWords: 50 },
  C_SENIOR: { style: "classic", count: 8, len: [6, 10], targets: 1, repeats: 2, punctuationAloud: false, gapsPerSentence: 2, textWords: 70 },
  D_SENIOR: { style: "gapped", count: 8, len: [8, 12], targets: 2, repeats: 2, punctuationAloud: false, gapsPerSentence: 2, textWords: 90 },
  E_SENIOR: { style: "dictogloss", count: 10, len: [10, 14], targets: 2, repeats: 2, punctuationAloud: false, gapsPerSentence: 3, textWords: 110 },
};

/** Sentence-length presets relative to the level range. */
export const LENGTH_PRESETS = { short: -2, level: 0, long: 3 };

export const DIFFICULTY = {
  easier: { label: "Slightly easier", shift: -1, note: "Use the simplest, most familiar structures and very common words around the targets." },
  level: { label: "Right for the class", shift: 0, note: "Pitch it exactly at the class level and age." },
  harder: { label: "Slightly harder", shift: 1, note: "Stretch a little: one extra clause or a less common structure, still fair for the age." },
};

/** Words-per-sentence range for a level, a length preset and a difficulty nudge. */
export function sentenceRange(levelId, length = "level", difficulty = "level") {
  const base = (DICTATION_DEFAULTS[levelId] || DICTATION_DEFAULTS.B_SENIOR).len;
  const shift = (LENGTH_PRESETS[length] ?? 0) + (DIFFICULTY[difficulty]?.shift ?? 0);
  const min = Math.max(3, base[0] + shift);
  const max = Math.max(min + 1, base[1] + shift);
  return [min, max];
}

/** Grammar the class can be tested on (chips in the dictation maker, test builder and assistant). */
export const GRAMMAR_MENU = {
  A_SENIOR: ["Verb to be (am / is / are)", "Have got", "Can / can't", "There is / there are", "This / that / these / those", "Plurals", "Present Simple (I / you / we / they)", "Prepositions of place", "Imperatives", "Possessive adjectives"],
  B_SENIOR: ["Present Simple", "Present Continuous", "Present Simple vs Present Continuous", "Can / can't (ability)", "Some / any", "Countable and uncountable nouns", "Was / were", "Adverbs of frequency", "Possessive 's", "Object pronouns"],
  C_SENIOR: ["Past Simple (regular verbs)", "Past Simple (irregular verbs)", "Past Continuous", "Comparatives", "Superlatives", "Going to", "Will (predictions)", "Must / mustn't", "Much / many / a lot of", "Adverbs of manner"],
  D_SENIOR: ["Present Perfect", "Present Perfect vs Past Simple", "Past Simple vs Past Continuous", "Future forms", "Should / shouldn't", "Have to / don't have to", "Relative pronouns (who / which / where)", "Zero and First Conditional", "Too / enough", "Question tags"],
  E_SENIOR: ["Present Perfect Continuous", "Past Perfect", "Second Conditional", "Passive voice (present / past)", "Reported speech (statements)", "Used to", "Gerunds and infinitives", "Modals of deduction", "Relative clauses", "Time clauses"],
};

const plainKey = (g) => String(g || "").toLowerCase().replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
const TENSE_WORD = /\b(present|past|future|simple|continuous|progressive|perfect)\b/gi;
const CONDITIONAL = /\b(zero|first|second|third|mixed)(\s+(?:and\s+(?:zero|first|second|third)\s+)?conditionals?)\b/gi;

/**
 * A grammar point written the way ELT books write it: tense names capitalised ("Present Simple vs Present
 * Continuous", "Second Conditional"), everything else in sentence case. Menu items keep their exact label.
 */
export function grammarLabel(raw) {
  const text = String(raw || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const key = plainKey(text);
  const all = LEVEL_IDS_LIST.flatMap((id) => GRAMMAR_MENU[id]);
  const exact = all.find((g) => g.toLowerCase() === text.toLowerCase()) || all.find((g) => plainKey(g) === key && !/\(/.test(text) && all.filter((x) => plainKey(x) === key).length === 1);
  if (exact) return exact;
  let out = text.replace(TENSE_WORD, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .replace(CONDITIONAL, (m) => m.replace(/\b(zero|first|second|third|mixed|conditionals?)\b/gi, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .replace(/\b(vs\.?|versus)(?=\s)/gi, "vs");
  return out[0].toUpperCase() + out.slice(1);
}

/** All grammar topics up to and including a level (a class may revise earlier grammar). */
export function grammarUpTo(levelId) {
  const i = Math.max(0, LEVEL_IDS.indexOf(levelId));
  return LEVEL_IDS.slice(0, i + 1).flatMap((id) => GRAMMAR_MENU[id]);
}

/** Items per test task, points for open tasks and minutes, per level. */
export const TEST_DEFAULTS = {
  A_SENIOR: { items: 5, writingWords: [15, 25], writingPoints: 8, speakingPoints: 8, minutesPerItem: 0.9 },
  B_SENIOR: { items: 5, writingWords: [25, 35], writingPoints: 10, speakingPoints: 10, minutesPerItem: 0.8 },
  C_SENIOR: { items: 6, writingWords: [35, 50], writingPoints: 10, speakingPoints: 10, minutesPerItem: 0.7 },
  D_SENIOR: { items: 6, writingWords: [50, 70], writingPoints: 12, speakingPoints: 10, minutesPerItem: 0.7 },
  E_SENIOR: { items: 7, writingWords: [70, 100], writingPoints: 15, speakingPoints: 10, minutesPerItem: 0.6 },
};

/** Which class level suits a Cambridge Primary Path book (the book's recommended profile). */
export const BOOK_LEVEL = { CPP1: "A_SENIOR", CPP2: "B_SENIOR", CPP3: "C_SENIOR" };

/** Short names the assistant understands: "E class", "Ε τάξη", "D senior", "Δ'". */
export function parseLevel(text) {
  const t = String(text || "");
  const m = t.match(/\b([A-Ea-e])\s*(?:'|΄|’)?\s*(?:senior|class|τάξη|level)\b/i)
    || t.match(/\b(?:class|level|τάξη)\s*([A-Ea-e])\b/i)
    || t.match(/(?:^|\s)([ΑΒΓΔΕαβγδε])(?:'|΄|’)?\s*(?:senior|τάξη|class)/i)
    || t.match(/(?:^|\s)([ΑΒΓΔΕ])(?:'|΄|’)(?=\s|$)/);
  if (!m) return "";
  const map = { a: "A", b: "B", c: "C", d: "D", e: "E", α: "A", β: "B", γ: "C", δ: "D", ε: "E" };
  const letter = map[m[1].toLowerCase()] || "";
  return letter ? `${letter}_SENIOR` : "";
}
