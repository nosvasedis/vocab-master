/* Vocab Master — word scope (pure, DOM-free).
 * The teacher's current word list is the single source of truth for every generation: these helpers
 * compare a worksheet's words with the current list, and check that answers are this unit's words
 * (in any inflected form: uncle → uncles, compete → competed, run → ran). */

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const IRREGULAR_FORMS = {
  be: ["am", "is", "are", "was", "were", "been", "being"], have: ["has", "had", "having"], do: ["does", "did", "done", "doing"],
  go: ["goes", "went", "gone"], get: ["got", "gotten"], give: ["gave", "given"], take: ["took", "taken"], make: ["made"],
  come: ["came"], see: ["saw", "seen"], eat: ["ate", "eaten"], run: ["ran"], swim: ["swam", "swum"], fly: ["flew", "flown", "flies"],
  write: ["wrote", "written"], ride: ["rode", "ridden"], drive: ["drove", "driven"], break: ["broke", "broken"], speak: ["spoke", "spoken"],
  choose: ["chose", "chosen"], wake: ["woke", "woken"], wear: ["wore", "worn"], tear: ["tore", "torn"], throw: ["threw", "thrown"],
  grow: ["grew", "grown"], know: ["knew", "known"], draw: ["drew", "drawn"], blow: ["blew", "blown"], fall: ["fell", "fallen"],
  forget: ["forgot", "forgotten"], hide: ["hid", "hidden"], bite: ["bit", "bitten"], begin: ["began", "begun"], sing: ["sang", "sung"],
  drink: ["drank", "drunk"], ring: ["rang", "rung"], sink: ["sank", "sunk"], buy: ["bought"], bring: ["brought"], think: ["thought"],
  catch: ["caught"], teach: ["taught"], fight: ["fought"], find: ["found"], feel: ["felt"], keep: ["kept"], sleep: ["slept"],
  leave: ["left"], meet: ["met"], sell: ["sold"], tell: ["told"], hold: ["held"], stand: ["stood"], understand: ["understood"],
  build: ["built"], send: ["sent"], spend: ["spent"], lose: ["lost"], win: ["won"], sit: ["sat"], hear: ["heard"], say: ["said"],
  pay: ["paid"], lay: ["laid"], lie: ["lay", "lain", "lying"], die: ["dying"], tie: ["tying"], light: ["lit"], shine: ["shone"],
  feed: ["fed"], lead: ["led"], dig: ["dug"], hang: ["hung"], stick: ["stuck"], strike: ["struck"], shake: ["shook", "shaken"],
  steal: ["stole", "stolen"], freeze: ["froze", "frozen"], mean: ["meant"], dream: ["dreamt"], learn: ["learnt"], burn: ["burnt"],
  good: ["better", "best"], bad: ["worse", "worst"], far: ["further", "farther", "furthest"], child: ["children"], person: ["people"],
  man: ["men"], woman: ["women"], mouse: ["mice"], foot: ["feet"], tooth: ["teeth"], goose: ["geese"], leaf: ["leaves"], knife: ["knives"],
  wolf: ["wolves"], life: ["lives"], shelf: ["shelves"], half: ["halves"], sheep: ["sheep"], fish: ["fish"],
};

/** Regex source matching one word in any common form (helps, helped, happier, made, …). */
export function wordFormPattern(word) {
  const w = String(word || "").toLowerCase();
  const forms = [escapeRegex(w), `${escapeRegex(w)}(?:s|es|ed|ing|er|est|ly|ness)`];
  if (w.length > 3 && /e$/.test(w)) forms.push(`${escapeRegex(w.slice(0, -1))}(?:ing|ed|er|est|ion|ation)`);
  if (w.length > 3 && /y$/.test(w)) forms.push(`${escapeRegex(w.slice(0, -1))}(?:ies|ied|ier|iest|ily|iness)`);
  if (/[aeiou][bcdfghjklmnpqrstvz]$/.test(w)) forms.push(`${escapeRegex(w + w.at(-1))}(?:ed|ing|er|est)`);
  if (/(?:f|fe)$/.test(w)) forms.push(`${escapeRegex(w.replace(/fe?$/, ""))}ves`);
  // Inverse: the list holds an inflected form ("neighbors", "running") and the answer is the base.
  if (w.length > 4 && /(?:s|es)$/.test(w)) forms.push(escapeRegex(w.replace(/e?s$/, "")));
  (IRREGULAR_FORMS[w] || []).forEach((f) => forms.push(escapeRegex(f)));
  for (const [base, list] of Object.entries(IRREGULAR_FORMS)) if (list.includes(w)) forms.push(escapeRegex(base));
  return `(?:${forms.join("|")})`;
}

const B = "(?<![A-Za-z])";
const E = "(?![A-Za-z])";
const STRIP = /\([^)]*\)|\bsth\b|\bsb\b|\bsomething\b|\bsomebody\b|\bsomeone\b|\bone's\b/gi;

/** True when `text` contains `term` (a word or phrase) in any inflected form, as whole words. */
export function containsForm(text, term) {
  const t = String(term || "").toLowerCase().replace(STRIP, " ").trim();
  const words = t.split(/[^a-z']+/).filter(Boolean);
  if (!words.length) return false;
  const src = String(text || "");
  if (words.length === 1) return new RegExp(`${B}${wordFormPattern(words[0])}${E}`, "i").test(src);
  // Phrases: the content words in order, allowing up to two words between (phrasal verbs: "picked it up").
  const rx = words.map((w) => `${B}${wordFormPattern(w)}${E}`).join("(?:[\\s-]+(?:[A-Za-z']+[\\s-]+){0,2}?)");
  return new RegExp(rx, "i").test(src);
}

const textOf = (x) => (typeof x === "string" ? x : x?.text || x?.english || "");
const listOf = (v) => (Array.isArray(v) ? v.map(textOf) : String(v || "").split(/[,;]+/).map((s) => s.replace(/\([^)]*\)/g, "").split(/\s+-\s+/)[0]));

/** Every word a worksheet may use as an answer: headwords plus the family, synonyms and opposites listed for them. */
export function allowedTerms(vocab = []) {
  const out = new Set();
  for (const v of vocab || []) {
    const head = String(v?.english || "").trim();
    if (head) out.add(head.toLowerCase());
    for (const k of ["derivatives", "synonyms", "antonyms"]) {
      for (const t of listOf(v?.[k])) { const s = String(t || "").trim().toLowerCase(); if (s && /[a-z]/.test(s)) out.add(s); }
    }
  }
  return [...out];
}

/** Answers an item asks for, split from "track, stadium" / "1 track 2 stadium" / testsWords. */
export function answerParts(answer) {
  return String(answer ?? "")
    .split(/[,;\n]+|\s*\(?\d+\)?[.)]\s+/)
    .map((s) => s.replace(/^\s*\(?\d+\)?[.)]?\s*/, "").trim())
    .filter((s) => s && /[a-z]/i.test(s));
}

/** True when an answer is (a form of) one of the allowed terms. */
export function answerInScope(answer, terms) {
  const parts = answerParts(answer);
  if (!parts.length) return true;
  return parts.every((p) => terms.some((t) => containsForm(p, t) || containsForm(t, p)));
}

/** Answers that must be one of the unit's words (gap fills, choices, spelling, picture and letter puzzles). */
export const SCOPED_ANSWER_TYPES = new Set([
  "D01", "D03", "D04", "D08", "D12", "D14", "D16", "D17", "D19", "D22", "D24", "D25", "D26", "D27", "D28",
  "L01", "L02", "L05", "L12",
]);

/** Items whose answer isn't a word from this unit's list: [{ sheet, exercise, typeId, item, answer }]. */
export function findOutsideAnswers(data) {
  const terms = allowedTerms(data?.lingoLauncher?.vocabulary || []);
  if (!terms.length) return [];
  const out = [];
  const scan = (sheet, list) => (list || []).forEach((ex) => {
    if (!SCOPED_ANSWER_TYPES.has(ex?.typeId)) return;
    (ex.items || []).forEach((item) => {
      const answer = item?.answer;
      if (!String(answer ?? "").trim()) return;
      if (!answerInScope(answer, terms)) out.push({ sheet, exercise: ex.number, typeId: ex.typeId, item: item.number, answer: String(answer).trim() });
    });
  });
  scan("Lingo", data?.lingoLauncher?.practice);
  scan("Dictation", data?.dictation?.exercises);
  return out;
}

const normEnglish = (s) => String(s || "").toLowerCase().replace(/[’']/g, "'").replace(/[-‐–]/g, " ").replace(/\s+/g, " ").trim();

/** Order-free identity of a word list ("apple|bread|milk"). */
export function wordsKey(list = []) {
  return [...new Set((list || []).map((w) => normEnglish(typeof w === "string" ? w : w?.english)).filter(Boolean))].sort().join("|");
}

/**
 * Does a generated worksheet belong to this form's word list? Freeform briefs compare the brief text.
 * A worksheet with no recorded words (very old saves) counts as matching.
 */
export function worksheetMatchesForm(data, form) {
  if (!data || !form) return false;
  if (form.inputMode === "freeform") {
    const was = data.meta?.freeformKey;
    return was == null || was === normEnglish(form.freeform);
  }
  const rows = form.vocabRows || [];
  const vocab = data.lingoLauncher?.vocabulary || [];
  if (!vocab.length) return true;
  return wordsKey(rows) === wordsKey(vocab);
}

/** The unit a worksheet or form belongs to ("cambridge primary paths 2|4"); pages are left out on purpose. */
export function unitIdentity(meta = {}) {
  return `${normEnglish(meta.bookTitle)}|${String(meta.unit ?? "").trim()}`;
}
