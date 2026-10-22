/* Vocab Master — the word families, opposites and synonyms a teacher says the class learned with a word (pure).
 * Kept per word ({ "describe": { derivatives: ["description"], antonyms: [], synonyms: [] } }) beside the word bank's
 * own lists, and added to them before the Test Maker uses the words (prompt, scope check, word check). */
import { relatedTerms } from "./word-scope.js";

/** The three kinds, as the teacher sees them; sign is how a pair is written ("describe → description"). */
export const REL_KINDS = {
  derivatives: { label: "Word family", sign: "→", hint: "e.g. description" },
  antonyms: { label: "Opposite", sign: "↔", hint: "e.g. pull" },
  synonyms: { label: "Same meaning", sign: "=", hint: "e.g. insect" },
};
const KINDS = Object.keys(REL_KINDS);
const GREEK = /[Ͱ-Ͽἀ-῿]/;
const key = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();

/** "description / descriptive, describer" → English words only (no Greek, no headword, no repeats). */
export function relationTerms(text, english = "") {
  const head = key(english);
  const seen = new Set();
  return String(text || "").split(/[,;/\n\r]+/).map((s) => clean(s.replace(/\([^)]*\)/g, "").split(/\s+[-–—]\s+/)[0]))
    .filter((t) => t && /[a-z]/i.test(t) && !GREEK.test(t) && key(t) !== head && !seen.has(key(t)) && seen.add(key(t)));
}

/**
 * A pair typed with a sign: "describe → description" / "describe -> description" (family), "push ↔ pull" /
 * "push <-> pull" / "push <> pull" (opposite), "bug = insect" (same meaning). null when the text isn't one (or the
 * right side is Greek: "volcano = ηφαίστειο" is a word with its Greek).
 */
export function parseRelationPair(text) {
  const m = String(text || "").match(/^(.*?)\s*(↔|<->|<>|→|->|=)\s*(.+)$/);
  if (!m || GREEK.test(m[3]) || GREEK.test(m[1])) return null;
  const english = clean(m[1]);
  const kind = { "↔": "antonyms", "<->": "antonyms", "<>": "antonyms", "→": "derivatives", "->": "derivatives", "=": "synonyms" }[m[2]];
  const terms = relationTerms(m[3], english);
  return english && /[a-z]/i.test(english) && terms.length ? { english, kind, terms } : null;
}

/** A saved map, made safe: only the three kinds, lists of English words, no empty words. */
export function cleanRelations(map) {
  const out = {};
  if (!map || typeof map !== "object") return out;
  for (const [w, rel] of Object.entries(map)) {
    const entry = {};
    for (const k of KINDS) {
      const terms = relationTerms((Array.isArray(rel?.[k]) ? rel[k] : []).join(", "), w);
      if (terms.length) entry[k] = terms;
    }
    if (key(w) && Object.keys(entry).length) out[key(w)] = entry;
  }
  return out;
}

/** Add what the teacher typed for a word (the words the bank already lists for it are not added again). */
export function addRelation(map, english, kind, text, bank = {}) {
  const w = key(english);
  if (!w || !KINDS.includes(kind)) return map;
  const have = new Set([...(map?.[w]?.[kind] || []), ...relatedTerms(bank?.[kind])].map(key));
  const terms = relationTerms(text, english).filter((t) => !have.has(key(t)) && have.add(key(t)));
  if (!terms.length) return map;
  return { ...map, [w]: { ...(map?.[w] || {}), [kind]: [...(map?.[w]?.[kind] || []), ...terms] } };
}

/** Take one word the teacher added off a word's list. */
export function removeRelation(map, english, kind, term) {
  const w = key(english);
  const left = (map?.[w]?.[kind] || []).filter((t) => key(t) !== key(term));
  const entry = { ...(map?.[w] || {}), [kind]: left };
  if (!left.length) delete entry[kind];
  const out = { ...map, [w]: entry };
  if (!Object.keys(entry).length) delete out[w];
  return out;
}

/** The teacher's words for one word, per kind ({} when none). */
export const relationsOf = (map, english) => map?.[key(english)] || {};

/** Words with the teacher's families, opposites and synonyms added to the bank's ("production (n.) - παραγωγή, product"). */
export function withRelations(words = [], map = {}) {
  return words.map((w) => {
    const rel = relationsOf(map, w?.english);
    if (!Object.keys(rel).length) return w;
    const out = { ...w };
    for (const k of KINDS) {
      const have = new Set(relatedTerms(w[k]).map(key));
      const extra = (rel[k] || []).filter((t) => !have.has(key(t)));
      if (extra.length) out[k] = [w[k], ...extra].filter(Boolean).join(", ");
    }
    return out;
  });
}

/**
 * Back from a saved test: its words carry the bank's lists and the teacher's together; what isn't in the bank's
 * entry for that word (bankFor(english)) is the teacher's.
 */
export function relationsFromSaved(saved = [], bankFor = () => null) {
  let map = {};
  for (const w of saved || []) {
    if (!w?.english) continue;
    const bank = bankFor(w.english) || {};
    for (const k of KINDS) {
      const inBank = new Set(relatedTerms(bank[k]).map(key));
      const extra = relatedTerms(w[k]).filter((t) => !inBank.has(key(t)));
      if (extra.length) map = addRelation(map, w.english, k, extra.join(", "));
    }
  }
  return map;
}

/** Every pair for a list of words, the book's and the teacher's apart: [{ english, kind, term, mine }]. */
export function relationPairs(words = [], map = {}) {
  const out = [];
  for (const w of words) {
    const mine = relationsOf(map, w?.english);
    for (const k of KINDS) {
      const own = new Set((mine[k] || []).map(key));
      for (const t of relatedTerms(w?.[k])) if (!own.has(key(t))) out.push({ english: w.english, kind: k, term: t, mine: false });
      for (const t of mine[k] || []) out.push({ english: w.english, kind: k, term: t, mine: true });
    }
  }
  return out;
}
