/* Vocab Master — quality checks for AI-written vocabulary fields (Step 2).
 * The AI is good but not reliable: it sometimes lists the headword (or just an inflected form of
 * it) as its own "word family", repeats a synonym as an opposite, or picks a placeholder emoji.
 * Everything here is pure and deterministic, so it can be tested without an AI key. */

const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;
const SKIN_TONES = /[\u{1F3FB}-\u{1F3FF}]/gu;
const LATIN_RE = /[A-Za-z]/;
// Emojis that say nothing about a word (symbols, letters, punctuation, status badges).
const PLACEHOLDER_EMOJI = new Set(["❓", "❔", "❕", "❗", "‼", "⁉", "🔤", "🔠", "🔡", "🔣", "🔢", "ℹ", "🆗", "🆕", "🆒", "🆓", "🅰", "🅱", "🆎", "🔘", "⚪", "⚫", "🔲", "🔳", "▪", "▫", "◾", "◽", "✅", "❌", "❎", "➕", "➖", "➗", "✖", "♾", "💲", "™", "©", "®"]);

function graphemes(text) {
  const str = String(text ?? "");
  const seg = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter("en", { granularity: "grapheme" }) : null;
  return seg ? [...seg.segment(str)].map((s) => s.segment) : Array.from(str);
}

const stripVariation = (g) => g.replace(/️/g, "");

/** Letters only, lower-case: "Ice-cream" / "ice cream" / "ICE CREAM" all become "icecream". */
export function compactWord(text) {
  return String(text || "").toLowerCase().replace(/[^\p{L}]/gu, "");
}

/** Headword as plain lower-case words, without "to ", articles or bracketed notes. */
function plainWords(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}' -]/gu, " ")
    .replace(/[-‐–]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/* ── Inflection: which spellings are just another form of the SAME word ─────────────── */
const IRREGULAR_GROUPS = [
  ["be", "am", "is", "are", "was", "were", "been", "being"], ["have", "has", "had", "having"],
  ["do", "does", "did", "done", "doing"], ["go", "goes", "went", "gone", "going"],
  ["take", "took", "taken", "taking"], ["make", "made", "making"], ["come", "came", "coming"],
  ["see", "saw", "seen", "seeing"], ["get", "got", "gotten", "getting"], ["give", "gave", "given", "giving"],
  ["eat", "ate", "eaten", "eating"], ["run", "ran", "running"], ["swim", "swam", "swum", "swimming"],
  ["write", "wrote", "written", "writing"], ["read", "reads", "reading"], ["speak", "spoke", "spoken", "speaking"],
  ["break", "broke", "broken", "breaking"], ["choose", "chose", "chosen", "choosing"], ["drive", "drove", "driven", "driving"],
  ["fall", "fell", "fallen", "falling"], ["find", "found", "finding"], ["fly", "flew", "flown", "flying", "flies"],
  ["grow", "grew", "grown", "growing"], ["know", "knew", "known", "knowing"], ["buy", "bought", "buying"],
  ["bring", "brought", "bringing"], ["think", "thought", "thinking"], ["teach", "taught", "teaches", "teaching"],
  ["catch", "caught", "catches", "catching"], ["leave", "left", "leaving"], ["feel", "felt", "feeling"],
  ["keep", "kept", "keeping"], ["sleep", "slept", "sleeping"], ["sit", "sat", "sitting"], ["stand", "stood", "standing"],
  ["win", "won", "winning"], ["lose", "lost", "losing"], ["sell", "sold", "selling"], ["tell", "told", "telling"],
  ["build", "built", "building"], ["send", "sent", "sending"], ["spend", "spent", "spending"], ["hide", "hid", "hidden", "hiding"],
  ["ride", "rode", "ridden", "riding"], ["rise", "rose", "risen", "rising"], ["wear", "wore", "worn", "wearing"],
  ["throw", "threw", "thrown", "throwing"], ["draw", "drew", "drawn", "drawing"], ["sing", "sang", "sung", "singing"],
  ["begin", "began", "begun", "beginning"], ["drink", "drank", "drunk", "drinking"], ["forget", "forgot", "forgotten", "forgetting"],
  ["child", "children"], ["man", "men"], ["woman", "women"], ["person", "people"], ["foot", "feet"], ["tooth", "teeth"],
  ["mouse", "mice"], ["goose", "geese"], ["leaf", "leaves"], ["knife", "knives"], ["life", "lives"], ["wolf", "wolves"],
  ["shelf", "shelves"], ["good", "better", "best"], ["bad", "worse", "worst"], ["well", "better", "best"],
  ["much", "more", "most"], ["many", "more", "most"], ["little", "less", "least"], ["far", "farther", "farthest", "further", "furthest"],
];
const IRREGULAR_INDEX = new Map();
IRREGULAR_GROUPS.forEach((group, gi) => group.forEach((w) => {
  if (!IRREGULAR_INDEX.has(w)) IRREGULAR_INDEX.set(w, new Set());
  IRREGULAR_INDEX.get(w).add(gi);
}));

/** Spellings of one word under regular inflection (plural, -s, -ed, -ing; -er/-est only for adj./adv.). */
function regularForms(word, { comparative = false } = {}) {
  const w = word.toLowerCase();
  const forms = new Set([w, `${w}s`, `${w}es`, `${w}d`, `${w}ed`, `${w}ing`]);
  if (comparative) { forms.add(`${w}er`); forms.add(`${w}est`); }
  if (w.endsWith("e")) { forms.add(`${w.slice(0, -1)}ing`); if (comparative) { forms.add(`${w}r`); forms.add(`${w}st`); } }
  if (/[^aeiou]y$/.test(w)) {
    const stem = w.slice(0, -1);
    ["ies", "ied"].forEach((x) => forms.add(stem + x));
    if (comparative) { forms.add(`${stem}ier`); forms.add(`${stem}iest`); }
  }
  if (/[^aeiou][aeiou][^aeiouwxy]$/.test(w) && w.length <= 6) {
    forms.add(`${w}${w.slice(-1)}ed`); forms.add(`${w}${w.slice(-1)}ing`);
    if (comparative) { forms.add(`${w}${w.slice(-1)}er`); forms.add(`${w}${w.slice(-1)}est`); }
  }
  if (w.endsWith("f")) forms.add(`${w.slice(0, -1)}ves`);
  if (w.endsWith("fe")) forms.add(`${w.slice(0, -2)}ves`);
  return forms;
}

function sameWordToken(a, b, comparative) {
  if (a === b) return true;
  const ga = IRREGULAR_INDEX.get(a);
  const gb = IRREGULAR_INDEX.get(b);
  if (ga && gb) for (const g of ga) if (gb.has(g)) return true;
  return regularForms(a, { comparative }).has(b) || regularForms(b, { comparative }).has(a);
}

/** Part-of-speech class from a coursebook label: "phr. v." → v, "adj." → adj, … ("" when unknown). */
function typeClass(type) {
  const t = String(type || "").toLowerCase();
  if (/\badj|adjective/.test(t)) return "adj";
  if (/\badv|adverb/.test(t)) return "adv";
  if (/\bv\b|verb/.test(t)) return "v";
  if (/\bn\b|noun/.test(t)) return "n";
  return "";
}

/**
 * True when `candidate` is the headword itself or only another inflection of it
 * (same spelling, different case/hyphenation, plural, -s, -ed, -ing; -er/-est for adjectives).
 * Real derivatives (compete → competition, teach → teacher, brave → bravely) are NOT the same word,
 * and neither are participle adjectives / nouns (excite → excited (adj.), build → building (n.)):
 * pass `candidateType` so a changed part of speech keeps those.
 */
export function isSameWordForm(candidate, headword, type = "", candidateType = "") {
  const c = plainWords(candidate);
  const h = plainWords(headword);
  if (!c.length || !h.length) return false;
  if (compactWord(candidate) === compactWord(headword)) return true;
  const headClass = typeClass(type);
  const candClass = typeClass(candidateType);
  if (candClass && headClass && candClass !== headClass) return false;
  if (candClass && !headClass && (candClass === "adj" || candClass === "adv")) return false;
  if (c.length !== h.length) return false;
  const comparative = headClass === "adj" || headClass === "adv";
  // Multi-word headwords (phrasal verbs, "ice cream"): same shape, with the first word inflected.
  if (c.length > 1) return c.every((tok, i) => (i === 0 ? sameWordToken(tok, h[i], comparative) : tok === h[i]));
  return sameWordToken(c[0], h[0], comparative);
}

/* ── Word-family entries: "bravery (n.) - θάρρος" ─────────────────────────────────── */
export function parseFamilyEntry(raw) {
  if (raw && typeof raw === "object") {
    const text = String(raw.text || raw.english || raw.word || "").trim();
    return text ? { text, type: String(raw.type || "").trim(), greek: String(raw.greek || "").trim() } : null;
  }
  const s = String(raw || "").trim();
  if (!s) return null;
  const withType = s.match(/^(.+?)\s*\(([^)]*)\)\s*(?:[-–—:]\s*(.*))?$/);
  if (withType) return { text: withType[1].trim(), type: withType[2].trim(), greek: (withType[3] || "").trim() };
  const noType = s.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (noType) return { text: noType[1].trim(), type: "", greek: noType[2].trim() };
  return { text: s, type: "", greek: "" };
}

export function formatFamilyEntry(e) {
  return `${e.text}${e.type ? ` (${e.type})` : ""}${e.greek ? ` - ${e.greek}` : ""}`;
}

/** Split a comma-list; Greek fragments created by commas inside a translation rejoin their entry. */
export function splitFamilyList(value) {
  const pieces = Array.isArray(value)
    ? value.map((v) => (v && typeof v === "object" ? v : String(v ?? "")))
    : String(value ?? "").split(/[,;]/);
  const out = [];
  for (const piece of pieces) {
    if (piece && typeof piece === "object") {
      const e = parseFamilyEntry(piece);
      if (e) out.push(e);
      continue;
    }
    const s = piece.trim();
    if (!s) continue;
    if (!LATIN_RE.test(s) && out.length) {
      const prev = out[out.length - 1];
      prev.greek = prev.greek ? `${prev.greek}, ${s}` : s;
      continue;
    }
    const e = parseFamilyEntry(s);
    if (e) out.push(e);
  }
  return out;
}

/* ── Field sanitisers ───────────────────────────────────────────────────────────── */
const sameWordHint = "same word";

/**
 * Keep only genuine derivatives. Drops the headword, its inflections, duplicates and
 * entries that are not English words. Returns { value, rejected }.
 */
export function cleanDerivatives(value, { english, type, max = 99 } = {}) {
  const rejected = [];
  const seen = new Set();
  const kept = [];
  for (const e of splitFamilyList(value)) {
    const key = compactWord(e.text);
    if (!key || !LATIN_RE.test(e.text)) { rejected.push(e.text); continue; }
    if (isSameWordForm(e.text, english, type, e.type) || /^(?:the same|same word)$/i.test(e.text)) { rejected.push(e.text); continue; }
    if (seen.has(key)) continue;
    // "run (n.)" for headword "run (v.)": a spelling identical to the headword is never a derivative.
    seen.add(key);
    kept.push(e);
  }
  const limited = kept.slice(0, Math.max(1, max));
  return { value: limited.map(formatFamilyEntry).join(", "), rejected };
}

/** Synonyms: other words only — never the headword, an inflection of it, or a duplicate. */
export function cleanSynonyms(value, { english, type, max = 3 } = {}) {
  const rejected = [];
  const seen = new Set();
  const kept = [];
  const items = Array.isArray(value) ? value.map((v) => (typeof v === "object" ? v?.text : v)) : String(value ?? "").split(/[,;]/);
  for (const raw of items) {
    const text = String(raw ?? "").replace(/\s*\([^)]*\)\s*$/, "").trim();
    const key = compactWord(text);
    if (!key || !LATIN_RE.test(text)) continue;
    if (isSameWordForm(text, english, type)) { rejected.push(text); continue; }
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(text);
  }
  return { value: kept.slice(0, Math.max(1, max)).join(", "), rejected };
}

/** Opposites ("word - Greek"): not the headword, not "not + headword", not one of its synonyms. */
export function cleanAntonyms(value, { english, type, synonyms = "", max = 2 } = {}) {
  const rejected = [];
  const seen = new Set();
  const synKeys = new Set(String(Array.isArray(synonyms) ? synonyms.join(",") : synonyms || "").split(/[,;]/).map(compactWord).filter(Boolean));
  const kept = [];
  const items = Array.isArray(value)
    ? value.map((v) => (v && typeof v === "object" ? `${v.text || ""}${v.greek ? ` - ${v.greek}` : ""}` : String(v ?? "")))
    : String(value ?? "").split(/[,;]/);
  for (const raw of items) {
    const s = String(raw ?? "").trim();
    if (!s) continue;
    if (!LATIN_RE.test(s)) {
      if (kept.length) kept[kept.length - 1].greek += `, ${s}`;
      continue;
    }
    const m = s.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    const text = (m ? m[1] : s).replace(/\s*\([^)]*\)\s*$/, "").trim();
    const greek = m ? m[2].trim() : "";
    const key = compactWord(text);
    if (!key) continue;
    const negated = /^(?:not|no)\s+(.+)$/i.exec(text);
    if (isSameWordForm(text, english, type) || (negated && isSameWordForm(negated[1], english, type)) || synKeys.has(key)) { rejected.push(text); continue; }
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push({ text, greek });
  }
  return { value: kept.slice(0, Math.max(1, max)).map((a) => (a.greek ? `${a.text} - ${a.greek}` : a.text)).join(", "), rejected };
}

/**
 * Emoji field: real emojis only (no letters, placeholders or skin tones), no duplicates, at most 2.
 * `isDrawable(emoji)` (optional) rejects emojis the picture packs cannot draw — those would
 * silently disappear from worksheets when a drawn style is chosen.
 */
export function cleanEmojis(value, { isDrawable, max = 2 } = {}) {
  const rejected = [];
  const seen = new Set();
  const kept = [];
  for (const g0 of graphemes(Array.isArray(value) ? value.join("") : value)) {
    if (!EMOJI_RE.test(g0)) continue;
    const g = g0.replace(SKIN_TONES, "");
    const base = stripVariation(g);
    if (PLACEHOLDER_EMOJI.has(base) || /^[0-9#*]⃣?$/.test(base) || /^\p{Regional_Indicator}/u.test(base)) { rejected.push(g); continue; }
    if (isDrawable && !isDrawable(g)) { rejected.push(g); continue; }
    if (seen.has(base)) continue;
    seen.add(base);
    kept.push(g);
  }
  return { value: kept.slice(0, max).join(""), rejected };
}

/** Dispatch by field key. Fields without special rules pass through trimmed. */
export function sanitizeVocabField(key, value, ctx = {}) {
  const text = typeof value === "string" ? value.trim() : value;
  switch (key) {
    case "derivatives": return cleanDerivatives(text, ctx);
    case "synonyms": return cleanSynonyms(text, ctx);
    case "antonyms": return cleanAntonyms(text, ctx);
    case "emojis": return cleanEmojis(text, ctx);
    default: return { value: String(text ?? "").trim(), rejected: [] };
  }
}

/** Short reason lines shown to the AI when a first answer was rejected. */
export function rejectionNote(key, rejected) {
  if (!rejected?.length) return "";
  const list = rejected.join(", ");
  if (key === "derivatives") return `rejected — ${sameWordHint} or not a derivative: ${list}`;
  if (key === "synonyms") return `rejected — ${sameWordHint}: ${list}`;
  if (key === "antonyms") return `rejected — same word, "not + word" or a synonym: ${list}`;
  if (key === "emojis") return `rejected — placeholder or cannot be drawn on worksheets: ${list}`;
  return `rejected: ${list}`;
}
