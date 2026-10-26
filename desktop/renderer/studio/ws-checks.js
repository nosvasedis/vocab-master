/* Vocab Master — worksheet lines that are what their exercise says (pure).
 *
 * The task line is the app's ("Choose the opposite of each word: a, b or c."), so every line under it must be that
 * kind of question. The AI sometimes pads an exercise with lines of another kind ("Vacation can also mean
 * (holiday / weekend)" under Opposite match) when the word list has too few opposites. Here:
 *   - repairRelationExercise: Opposite match / Synonym select (D05, D06, L03, L04) keep only lines of the form
 *     "WORD (a / b / c)" whose word is a unit word with a listed opposite (synonym) and whose options hold exactly
 *     one of them. A line that can be read that way is rewritten to it; any other line is rebuilt from the word
 *     list (a word not yet used, its listed opposite and two clearly wrong words), or dropped when no word is left.
 *   - lineProblem: what is wrong with one line of any exercise ("" when nothing), for the quality panel and the
 *     AI line fixer.
 *   - repairLine: small sure fixes the app can make itself (the letter count of a crossword clue).
 * A line the teacher wrote in the line editor (item.byTeacher) is never rewritten, only checked. */

const GREEK = /[Ͱ-Ͽἀ-῿]/;
const GAP = /_{3,}/;
const CHOICE = /\(([^()]*\/[^()]*)\)/;
export const norm = (s) => String(s ?? "").toLowerCase().replace(/[‘’`]/g, "'").replace(/[^a-z' -]/g, " ").replace(/\s+/g, " ").trim();
const noArticle = (s) => norm(s).replace(/^(a|an|the|to) /, "");
const same = (a, b) => !!norm(a) && (norm(a) === norm(b) || noArticle(a) === noArticle(b));

/** The exercises that ask for a word's opposite or synonym, and the word-list field they use. */
export const RELATION_TYPES = { D05: "antonyms", D06: "synonyms", L03: "synonyms", L04: "antonyms" };

/** English words of a word-list field: ["calm"], "calm - ήρεμος, quiet", [{ text: "calm", greek: "…" }]. */
function words(value) {
  const parts = Array.isArray(value) ? value : String(value || "").split(/[,;\n]+/);
  return parts.map((p) => (typeof p === "string" ? p : p?.text))
    .map((s) => String(s || "").split(/\s+[-–—]\s+/)[0].replace(/\([^)]*\)/g, "").trim())
    .filter((s) => /[a-z]/i.test(s) && !GREEK.test(s));
}
export const relationList = (v, kind) => words(v?.[kind]);
const familyList = (v) => words(v?.derivatives);

/** "n", "noun", "adj.", "v / n" → the word classes named. */
export function wordClasses(type) {
  const out = new Set();
  String(type || "").toLowerCase().replace(/\./g, "").split(/[,/&+]|\s+or\s+/).forEach((t) => {
    const s = t.trim();
    if (/^(n|noun|pl n|plural noun)\b/.test(s)) out.add("noun");
    else if (/^(v|verb|phr ?v|phrasal verb)\b/.test(s)) out.add("verb");
    else if (/^adj/.test(s)) out.add("adjective");
    else if (/^adv/.test(s)) out.add("adverb");
    else if (/^prep/.test(s)) out.add("preposition");
  });
  return out;
}

/** The unit words an exercise of this kind can ask about: { english, answers, v }. */
export function relationTargets(vocab, kind) {
  return (vocab || []).filter((v) => String(v?.english || "").trim() && relationList(v, kind).length)
    .map((v) => ({ english: String(v.english).trim(), answers: relationList(v, kind), v }));
}

/** "word (a / b / c)" → { before, after, options }. */
export function splitChoice(prompt) {
  const p = String(prompt || "");
  const m = p.match(CHOICE);
  if (!m) return null;
  return { before: p.slice(0, m.index).trim(), after: p.slice(m.index + m[0].length).trim(), options: m[1].split("/").map((s) => s.trim()).filter(Boolean) };
}

const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const stemOf = (s) => norm(s).slice(0, 5);

/**
 * Words that must not be a wrong option for this word, because they are (or may be) right: the word itself, its
 * listed forms, synonyms and opposites, and everything listed with a word it is paired with.
 */
function relatedWords(target, vocab) {
  const out = new Set();
  const addEntry = (v) => {
    out.add(norm(v.english));
    ["synonyms", "antonyms"].forEach((k) => relationList(v, k).forEach((w) => out.add(norm(w))));
    familyList(v).forEach((w) => out.add(norm(w)));
  };
  addEntry(target.v);
  const mine = new Set([...relationList(target.v, "synonyms"), ...relationList(target.v, "antonyms")].map(norm));
  (vocab || []).forEach((v) => {
    if (!v?.english || v === target.v) return;
    const theirs = [...relationList(v, "synonyms"), ...relationList(v, "antonyms")].map(norm);
    if (mine.has(norm(v.english)) || theirs.includes(norm(target.english))) addEntry(v);
  });
  return out;
}

/**
 * Wrong options for a word: first a "trap" that is clearly wrong (for an opposite, one of its synonyms; for a
 * synonym, one of its opposites), then other unit words of the same word class, then their own synonyms and
 * opposites, then any unit word. Never a word that might be right, never a form of the word or of the answer.
 */
function distractors(target, kind, vocab, answer, have = [], n = 2) {
  const blocked = relatedWords(target, vocab);
  const trapKind = kind === "antonyms" ? "synonyms" : "antonyms";
  const traps = relationList(target.v, trapKind);
  const classes = wordClasses(target.v.type);
  const sameClass = (v) => !classes.size || [...wordClasses(v.type)].some((c) => classes.has(c));
  const others = (vocab || []).filter((v) => v?.english && v !== target.v && !blocked.has(norm(v.english)));
  const turn = (list) => { const k = list.length ? hash(target.english) % list.length : 0; return [...list.slice(k), ...list.slice(0, k)]; };
  const pool = [
    ...traps,
    ...turn(others.filter(sameClass).map((v) => v.english)),
    ...turn(others.filter(sameClass).flatMap((v) => [...relationList(v, "synonyms"), ...relationList(v, "antonyms")])),
    ...turn(others.filter((v) => !sameClass(v)).map((v) => v.english)),
  ];
  const taken = new Set([...have, answer].map(norm));
  const stems = new Set([target.english, answer].map(stemOf));
  const out = [];
  for (const w of pool) {
    const k = norm(w);
    if (out.length >= n) break;
    if (!k || taken.has(k) || k.split(" ").length > 3 || stems.has(stemOf(w))) continue;
    if (blocked.has(k) && !traps.some((t) => norm(t) === k)) continue;
    taken.add(k);
    out.push(String(w).trim());
  }
  return out;
}

/** A new line for a word: "worried (calm / scared / tired)" with the listed answer at a varied place. */
export function buildRelationItem(target, kind, vocab, seat = 0) {
  const answer = target.answers[seat % target.answers.length];
  const wrong = distractors(target, kind, vocab, answer);
  if (!wrong.length) return null;
  const options = [...wrong];
  options.splice((seat + hash(target.english)) % (wrong.length + 1), 0, answer);
  return { prompt: `${target.english} (${options.join(" / ")})`, answer, testsWords: [target.english] };
}

/**
 * Reads a line as "WORD (options)" for this kind: the word (a unit word with a listed answer, named before the
 * options or in the sentence) and exactly one option that is listed for it, no option that might also be right.
 * Returns the line written properly ({ prompt, answer, testsWords, english }) or null.
 */
export function readRelationItem(item, kind, vocab, targets = relationTargets(vocab, kind)) {
  const c = splitChoice(item?.prompt);
  if (!c || c.options.length < 2) return null;
  const options = c.options.filter((o, i) => c.options.findIndex((x) => same(x, o)) === i);
  if (options.length < 2) return null;
  const head = norm(c.before.replace(/\s*(→|->|:|-)\s*$/, ""));
  const fits = (t) => options.filter((o) => t.answers.some((a) => same(a, o))).length === 1;
  let target = targets.find((t) => norm(t.english) === head && fits(t));
  if (!target) {
    const text = ` ${norm(`${c.before} ${c.after}`)} `;
    const found = targets.filter((t) => text.includes(` ${norm(t.english)} `) && fits(t));
    if (found.length !== 1) return null;
    target = found[0];
  }
  const answer = options.find((o) => target.answers.some((a) => same(a, o)));
  const trapKind = kind === "antonyms" ? "synonyms" : "antonyms";
  const traps = relationList(target.v, trapKind).map(norm);
  const blocked = relatedWords(target, vocab);
  // Another option that is (or may be) right as well, or the word itself, makes the line unfair.
  if (options.some((o) => o !== answer && (same(o, target.english) || (blocked.has(norm(o)) && !traps.includes(norm(o)))))) return null;
  if (options.length === 2) {
    const more = distractors(target, kind, vocab, answer, options, 1);
    if (more.length) options.splice(hash(target.english) % 3, 0, more[0]);
  }
  return { prompt: `${target.english} (${options.join(" / ")})`, answer, testsWords: [target.english], english: target.english };
}

/**
 * Makes every line of an opposite / synonym exercise a real one (see the top of this file). Lines stay in place;
 * the exercise only gets shorter when the word list has no more words with that relation. Returns true when
 * something changed. An exercise is left alone when the list has no such words at all (the check says so).
 */
export function repairRelationExercise(ex, vocab) {
  const kind = RELATION_TYPES[ex?.typeId];
  if (!kind || !Array.isArray(ex.items) || !vocab?.length) return false;
  const targets = relationTargets(vocab, kind);
  if (!targets.length) return false;
  const used = new Set();
  const read = ex.items.map((item) => {
    if (item?.byTeacher) return { item, keep: true };
    const r = readRelationItem(item, kind, vocab, targets);
    if (!r || used.has(norm(r.english))) return { item, keep: false };
    used.add(norm(r.english));
    return { item, r, keep: true };
  });
  let changed = false;
  let seat = 0;
  const next = () => {
    for (const t of targets) {
      if (used.has(norm(t.english))) continue;
      used.add(norm(t.english));
      const built = buildRelationItem(t, kind, vocab, seat++);
      if (built) return built;
    }
    return null;
  };
  const items = [];
  read.forEach(({ item, r, keep }) => {
    if (keep && !r) { items.push(item); return; }
    const line = r ? { prompt: r.prompt, answer: r.answer, testsWords: r.testsWords } : next();
    if (!line) { changed = true; return; }
    if (line.prompt !== item.prompt || line.answer !== item.answer) changed = true;
    const { stem, ...rest } = item;
    items.push({ ...rest, ...line });
  });
  items.forEach((it, i) => { if (it.number !== i + 1) { it.number = i + 1; changed = true; } });
  ex.items = items;
  if (ex.wordBank?.length) { ex.wordBank = []; changed = true; }
  if (ex.wordList?.length) { ex.wordList = []; changed = true; }
  return changed;
}

/** How many lines an opposite / synonym exercise can have with this word list (one per word). */
export const relationRoom = (typeId, vocab) => (RELATION_TYPES[typeId] ? relationTargets(vocab, RELATION_TYPES[typeId]).length : Infinity);

/* ── One line of any exercise ─────────────────────────────────────────────────────────────────────────────── */

const CHOICE_TYPES = new Set(["D03", "D12", "D18", "D24", "L02"]);
const CLASS_NAMES = ["noun", "verb", "adjective", "adverb"];
const sentenceWords = (s) => norm(s).split(" ").filter(Boolean);
const bag = (list) => list.slice().sort().join(" ");

function findEntry(vocab, word) {
  return (vocab || []).find((v) => same(v?.english, word)) || null;
}

/** The headwords and listed word-family forms of the list. */
function listedForms(vocab) {
  const out = new Set();
  (vocab || []).forEach((v) => { if (v?.english) out.add(norm(v.english)); familyList(v).forEach((w) => out.add(norm(w))); });
  return out;
}

/** "a) Pack your bag. / b) Wake up. / c) Go out." → the steps. */
export function readSteps(prompt) {
  const parts = String(prompt || "").split(/\s+\/\s+|\s*\n\s*|\s+(?=\(?[a-h]\)\s)/).map((s) => s.trim()).filter(Boolean);
  const steps = parts.filter((s) => /^\(?[a-h][).:]\s*\S/i.test(s));
  return steps.length >= 2 ? steps : parts.length >= 2 ? parts : [];
}

/**
 * What is wrong with one line, said for the teacher ("" when nothing). Only problems a student would trip over:
 * a choice whose answer is not one of its options, two right options, a jumbled sentence that isn't the answer's
 * words, a crossword clue that counts the letters wrongly, a grammar label that disagrees with the word list…
 * Opposite / synonym lines are checked by readRelationItem.
 */
export function lineProblem(typeId, item, vocab = []) {
  const prompt = String(item?.prompt ?? "").trim();
  const answer = String(item?.answer ?? "").trim();
  if (!prompt) return "the line is empty — write the question";
  if (!answer && typeId !== "D16") return "the line has no answer in the key";
  const kind = RELATION_TYPES[typeId];
  if (kind) {
    const targets = relationTargets(vocab, kind);
    if (!targets.length || !vocab?.length) return "";
    const what = kind === "antonyms" ? "opposite" : "synonym";
    return readRelationItem(item, kind, vocab, targets) ? ""
      : `this line must be one unit word and its options — "WORD (a / b / c)" — with exactly one listed ${what} of the word among them (${targets.slice(0, 6).map((t) => `${t.english} → ${t.answers.join("/")}`).join(", ")})`;
  }
  if (CHOICE_TYPES.has(typeId)) {
    const c = splitChoice(prompt);
    if (!c) return typeId === "L02" ? "the sentence needs its options in brackets: (a / b)" : "";
    if (c.options.length < 2) return "the line needs at least two options";
    if (new Set(c.options.map(norm)).size < c.options.length) return "two options are the same word";
    const right = c.options.filter((o) => same(o, answer)).length;
    if (!right) return `the answer "${answer}" is not one of the options (${c.options.join(" / ")})`;
    return "";
  }
  switch (typeId) {
    case "D11": {
      const list = prompt.split(",").map((s) => s.trim()).filter(Boolean);
      if (list.length > 4) return "an odd-one-out line needs exactly 4 words";
      if (list.length === 4 && !list.some((w) => same(w, answer))) return `the answer "${answer}" is not one of the 4 words`;
      return "";
    }
    case "L09": return "";
    case "D21": {
      const steps = readSteps(prompt);
      if (steps.length < 3) return "the line needs 3–4 mixed-up steps: a) … / b) … / c) …";
      const letters = (answer.toLowerCase().match(/\b[a-h]\b/g) || []);
      const want = "abcdefgh".slice(0, steps.length).split("");
      if (bag(letters) !== bag(want)) return `the answer must give the order of all ${steps.length} steps once each (e.g. "${want.slice().reverse().join(", ")}")`;
      if (letters.join("") === want.join("")) return "the steps are already in the right order — mix them up";
      return "";
    }
    case "D22": {
      if (!/^[a-z][a-z-]*$/i.test(answer)) return "a crossword answer must be one word";
      return "";
    }
    case "D07": {
      if (!prompt.includes("+")) return "the line needs the word's parts joined with +";
      if (!/^[a-z-]+$/i.test(answer)) return "the answer must be one word";
      return "";
    }
    case "D14": case "D17": case "D23":
      return GAP.test(prompt) ? "" : "the line needs a ________ gap for the answer";
    case "L06": {
      const label = norm(answer);
      if (!CLASS_NAMES.includes(label)) return `the answer must be a word class in full (${CLASS_NAMES.join(" / ")})`;
      const caps = prompt.match(/\b[A-Z][A-Z'-]{1,}\b/);
      const entry = findEntry(vocab, caps ? caps[0] : prompt);
      const classes = wordClasses(entry?.type);
      if (entry && classes.size && !classes.has(label)) return `"${entry.english}" is a ${[...classes].join(" / ")} in the word list, not a ${label}`;
      return "";
    }
    case "L07": case "D10": {
      const forms = listedForms(vocab);
      const plain = (w) => norm(w).replace(/(es|s)$/, "");
      if (forms.size && ![...forms].some((f) => same(f, answer) || plain(f) === plain(answer))) return `"${answer}" is not a word or word-family form in your word list`;
      return "";
    }
    case "L08": {
      const chunks = prompt.split("/").map((s) => s.trim()).filter(Boolean);
      if (chunks.length < 3) return "the words must be given jumbled, separated by /";
      const given = sentenceWords(chunks.join(" "));
      const want = sentenceWords(answer);
      if (bag(given) !== bag(want)) return "the jumbled words are not exactly the words of the answer sentence";
      if (given.join(" ") === want.join(" ")) return "the words are already in the right order — mix them up";
      return "";
    }
    // The model sentence may use any form of the word (run → ran), so only the word in capitals is checked.
    case "D29": return /\b[A-Z][A-Z'-]{1,}\b/.test(prompt) ? "" : "start the line with the unit word in CAPITALS";
    case "L10": return /\?\s*$/.test(prompt) ? "" : "the line must be a question";
    default: return "";
  }
}

/** Sure fixes for a line (returns true when changed): a crossword clue's "(n letters)" counts the answer. */
export function repairLine(typeId, item) {
  if (!item || item.byTeacher) return false;
  if (typeId === "D22") {
    const answer = String(item.answer || "").trim();
    const n = answer.replace(/[^a-z]/gi, "").length;
    const p = String(item.prompt || "");
    const m = p.match(/\((\d+)\s*letters?\)/i);
    if (m && n && Number(m[1]) !== n && /^[a-z-]+$/i.test(answer)) { item.prompt = p.replace(m[0], `(${n} letters)`); return true; }
  }
  if (typeId === "L06") {
    const a = norm(item.answer);
    if (CLASS_NAMES.includes(a) && item.answer !== a) { item.answer = a; return true; }
  }
  return false;
}
