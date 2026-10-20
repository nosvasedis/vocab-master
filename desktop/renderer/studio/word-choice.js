/* Vocab Master — which of a unit's words to use (pure). The teacher says it in many ways:
 * "all the words", "only the key words", "15 words", "a mix", "the Lesson A words and the workbook",
 * "only volcano, lava and ash", "everything except crater". A choice is
 *   { mode: "key" | "all" | "some" | "mix" | "pick" | "smart", count, sections: ["BQ","A","B","WB"], only: [], except: [] }
 * and chooseUnitWords() turns it into the words themselves, from the unit's word list and its lessons' key words. */
import { selectSmartCoursebookWords } from "../coursebook-data.js";

export const WORD_MODES = {
  key: { label: "Key words", hint: "The words the unit’s lessons teach" },
  all: { label: "All the words", hint: "Every word of the chosen parts" },
  some: { label: "Some words", hint: "A number of words: key words first, the rest spread over the unit" },
  mix: { label: "A mix", hint: "Half key words, half other words of the unit" },
  pick: { label: "My choice", hint: "Exactly the words you tick" },
  smart: { label: "Fits the class", hint: "As many words as the class level suits" },
};
export const SECTION_KEYS = ["BQ", "A", "B", "WB"];
export const DEFAULT_SECTIONS = ["BQ", "A", "B"];
const key = (s) => String(s || "").trim().toLowerCase();

/** A clean choice: known mode, sensible count, known sections, lists without repeats. */
export function normalizeChoice(c = {}, { fallback = "key", classCount = 15 } = {}) {
  const mode = WORD_MODES[c.mode] ? c.mode : fallback;
  const sections = SECTION_KEYS.filter((s) => (c.sections?.length ? c.sections : DEFAULT_SECTIONS).includes(s));
  const list = (a) => [...new Map((Array.isArray(a) ? a : []).map((w) => String(w?.english ?? w ?? "").trim()).filter(Boolean).map((w) => [key(w), w])).values()];
  const n = Math.round(Number(c.count) || 0);
  return {
    mode,
    count: mode === "some" || mode === "mix" || mode === "smart" ? Math.max(3, Math.min(60, n || (mode === "smart" ? classCount : 12))) : n || 0,
    sections: sections.length ? sections : [...DEFAULT_SECTIONS],
    only: list(c.only),
    except: list(c.except),
  };
}

/**
 * The words a choice picks from a unit.
 * words: the unit's words of the chosen sections ([{ english, section, … }], book order);
 * keyWords: the lessons' key words (lower case); returns { words, missing } — missing = "only" words that aren't
 * in the unit (the caller adds them as the teacher's own words).
 */
export function chooseUnitWords(words = [], keyWords = [], choice = {}) {
  const c = normalizeChoice(choice);
  const keys = new Set(keyWords.map(key));
  const isKey = (w) => keys.has(key(w.english));
  const except = new Set(c.except.map(key));
  const pool = words.filter((w) => !except.has(key(w.english)));
  const keyed = pool.filter(isKey);
  const others = pool.filter((w) => !isKey(w));
  const inOrder = (list) => pool.filter((w) => list.includes(w));
  // selectSmartCoursebookWords reads 0 as "no limit": asking for none must give none.
  const spread = (list, n) => (n > 0 ? selectSmartCoursebookWords(list, n) : []);
  let out;
  if (c.mode === "all") out = pool;
  else if (c.mode === "pick") {
    const want = new Set(c.only.map(key));
    out = pool.filter((w) => want.has(key(w.english)));
  } else if (c.mode === "some" || c.mode === "smart") {
    // Key words first (spread over the unit when there are more than needed), then the rest of the unit, spread.
    const k = keyed.length > c.count ? spread(keyed, c.count) : keyed;
    out = inOrder([...k, ...spread(others, c.count - k.length)]);
  } else if (c.mode === "mix") {
    const half = Math.ceil(c.count / 2);
    const k = spread(keyed, Math.min(half, keyed.length));
    out = inOrder([...k, ...spread(others, c.count - k.length)]);
  } else {
    // Key words; a unit whose lessons aren't available gets a spread of 15 instead.
    out = keyed.length >= 5 ? keyed : spread(pool, 15);
  }
  const have = new Set(words.map((w) => key(w.english)));
  const missing = c.mode === "pick" ? c.only.filter((w) => !have.has(key(w))) : [];
  return { words: out, missing };
}

/** How a choice reads in a sentence: "the key words", "all the words of Lesson A and the Workbook", "12 words". */
export function describeChoice(choice = {}, { sectionLabels = { BQ: "the Big Question", A: "Lesson A", B: "Lesson B", WB: "the Workbook" } } = {}) {
  const c = normalizeChoice(choice);
  const secs = c.sections.join(",") === DEFAULT_SECTIONS.join(",") ? "" : ` of ${c.sections.map((s) => sectionLabels[s]).join(", ").replace(/, ([^,]*)$/, " and $1")}`;
  const except = c.except.length ? `, except ${c.except.join(", ")}` : "";
  if (c.mode === "all") return `all the words${secs}${except}`;
  if (c.mode === "some") return `${c.count} words${secs} (key words first)${except}`;
  if (c.mode === "smart") return `${c.count} words${secs} (right for the class)${except}`;
  if (c.mode === "mix") return `a mix of ${c.count} key and other words${secs}${except}`;
  if (c.mode === "pick") return `only ${c.only.join(", ") || "the words you tick"}`;
  return `the key words${secs}${except}`;
}

/* ── Reading the teacher's words ───────────────────────────────────── */
const NUMBER_WORDS = { "a few": 8, few: 8, "a dozen": 12, dozen: 12, some: 12, ten: 10, twelve: 12, fifteen: 15, twenty: 20, δέκα: 10, δώδεκα: 12, δεκαπέντε: 15, είκοσι: 20 };
const NOT_A_WORD = /^(?:greek|the greek|pictures?|listening|reading|writing|speaking|grammar|vocabulary|versions?|audio|answers?|the answers|the key|instructions?|greek instructions|english|a version b|(?:the )?workbook|wb|(?:the )?student'?s book|lesson [ab]|(?:the )?big question|τετράδιο|το τετράδιο)$/i;

/**
 * A list ends where the next part of the request begins: "crater and lava, without pictures, called …" → "crater and lava".
 * Exported for the assistant's own-words reader.
 */
export function cutList(text) {
  const s = String(text || "");
  const stop = s.search(/\s+(?:plus|also|but|then|without|with|called|titled|named|for|from|in|on|no|not|except|only|please|make|so|because|για|χωρίς|με|εκτός)\s|,\s*(?:and\s+)?(?:without|with|no|not|called|titled|named|for|plus|also|from|in|on|but|then|please|make|a|an|the|two|2|one|easier|harder|short|long|full)\b/i);
  return stop >= 0 ? s.slice(0, stop) : s;
}

function splitList(text) {
  return String(text || "")
    .replace(/\s+(?:too|as well|please)\s*$/i, "")
    .split(/\s*(?:,|;|\band\b|\bor\b|\bκαι\b|\bή\b|&|\/)\s*/i)
    .map((w) => w.replace(/^(?:the|a|an)\s+/i, "").replace(/["“”'‘’]/g, "").trim())
    .filter((w) => w && /[a-z]/i.test(w) && w.split(/\s+/).length <= 4 && !NOT_A_WORD.test(w) && !/^(?:from|of|in)\b/i.test(w) && !/\d|\bunit\b|\bclass\b|\bwords?\b/i.test(w));
}

/**
 * The word choice in a request, and the request without the word lists it found (so they aren't read as a topic).
 * Returns { choice: {…} | null, rest }.
 */
export function findWordChoice(text) {
  let rest = String(text || "");
  const t = rest.toLowerCase();
  const choice = {};

  // "only the words volcano, lava and ash" / "just these words: …" / «μόνο τις λέξεις …»
  const only = rest.match(/\b(?:only|just)\s+(?:test\s+|use\s+)?(?:the\s+|these\s+)?(?:following\s+)?words?\s*:?\s*([^.?!;]+)/i)
    || rest.match(/μόνο\s+(?:τις\s+)?λέξεις\s*:?\s*([^.?!;]+)/i);
  // Only the list itself is taken out of the request; what follows it ("…, without pictures") stays to be read.
  const consumed = (m) => m[0].slice(0, m[0].length - m[1].length) + cutList(m[1]);
  if (only && !/^\s*(?:of|from|in)\b/i.test(only[1])) {
    const list = splitList(cutList(only[1]));
    if (list.length) { choice.mode = "pick"; choice.only = list; rest = rest.replace(consumed(only), " "); }
  }
  // "except crater and lava" / "without the word ash" / «εκτός από …», «χωρίς …»
  const except = rest.match(/\b(?:except(?:\s+for)?|but not|leave out|leaving out|apart from|not including|without)\s+(?:the\s+)?(?:words?\s*:?\s*)?([^.?!;]+)/i)
    || rest.match(/(?:εκτός\s+από|χωρίς)\s+(?:τις?\s+)?(?:λέξεις?\s*:?\s*)?([^.?!;]+)/i);
  if (except) {
    const list = splitList(cutList(except[1]));
    if (list.length) { choice.except = list; rest = rest.replace(consumed(except), " "); }
  }

  if (!choice.mode) {
    const num = t.match(/\b(\d{1,2})\s+(?:of\s+the\s+)?(?:unit(?:'s)?\s+|new\s+|vocabulary\s+)?(?:words|vocabulary words|λέξεις)\b/)
      || t.match(/\b(a few|few|a dozen|dozen|ten|twelve|fifteen|twenty|δέκα|δώδεκα|δεκαπέντε|είκοσι)\s+(?:of\s+the\s+)?(?:unit(?:'s)?\s+)?(?:words|λέξεις)\b/);
    const count = num ? Number(num[1]) || NUMBER_WORDS[num[1]] : 0;
    const writing = num && /\b(?:write|writing|of about|γράψ)\b[^.]{0,20}$/.test(t.slice(0, num.index));
    if (/\bmix(?:ed|ture)?\b|a bit of everything|key words and (?:some )?other|μείγμα|ανάμεικτ/.test(t)) { choice.mode = "mix"; if (count && !writing) choice.count = count; }
    else if (/\b(?:all|every|each)\s+(?:of\s+)?(?:the\s+|its\s+)?(?:unit(?:'s)?\s+)?(?:words|vocabulary)\b|\b(?:the\s+)?whole\s+(?:unit|vocabulary|word list)\b|\bentire\s+unit\b|όλες\s+(?:οι\s+|τις\s+)?λέξεις|όλο\s+το\s+λεξιλόγιο/.test(t)) choice.mode = "all";
    else if (/\b(?:key|main|core|basic|highlighted|important)\s+words\b|βασικές\s+λέξεις|σημαντικές\s+λέξεις/.test(t)) choice.mode = "key";
    else if (count && !writing && count <= 60) { choice.mode = "some"; choice.count = count; }
    else if (/\bsome\s+(?:of\s+the\s+)?(?:unit(?:'s)?\s+)?words\b|μερικές\s+λέξεις/.test(t)) { choice.mode = "some"; choice.count = 12; }
  }

  // Which parts of the unit: each part named is in, unless "except / without / not" comes right before it.
  const PARTS = { BQ: /big question|\bbq\b|μεγάλη ερώτηση/g, A: /\blesson\s*a\b|μάθημα\s*a\b/g, B: /\blesson\s*b\b|μάθημα\s*b\b/g, WB: /\bworkbook\b|\bwb\b|τετράδιο/g };
  const NEGATED = /(?:\bexcept(?:\s+for)?|\bwithout|\bbut not|\bapart from|\bleave out|\bnot|\bno|χωρίς|εκτός από)\s+(?:from\s+|in\s+)?(?:the\s+|το\s+|τη\s+|την\s+)?(?:words of\s+(?:the\s+)?)?$/;
  const named = new Set();
  const dropped = new Set();
  for (const [sec, rx] of Object.entries(PARTS)) {
    for (const m of t.matchAll(rx)) (NEGATED.test(t.slice(Math.max(0, m.index - 30), m.index)) ? dropped : named).add(sec);
  }
  dropped.forEach((s) => named.delete(s));
  if (named.size) {
    let secs = SECTION_KEYS.filter((s) => named.has(s));
    // "and the workbook" / "plus the workbook" adds it to the usual parts; "the workbook words" alone means only it.
    if (secs.length === 1 && secs[0] === "WB" && /\b(?:and|plus|also|with|including|και)\s+(?:the\s+)?(?:workbook|wb)\b|\bworkbook\s+too\b/.test(t)) secs = [...DEFAULT_SECTIONS, "WB"];
    choice.sections = secs;
    // "the Lesson A words", "the workbook words": a part named without an amount means all of its words.
    if (!choice.mode) choice.mode = "all";
  } else if (dropped.size) {
    choice.sections = DEFAULT_SECTIONS.filter((s) => !dropped.has(s));
  } else if (/\bstudent'?s book\b(?!\s+and)|\bsb only\b/.test(t)) choice.sections = [...DEFAULT_SECTIONS];

  const found = Object.keys(choice).length;
  return { choice: found ? choice : null, rest: rest.replace(/\s+/g, " ").trim() };
}
