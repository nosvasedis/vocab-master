/* Vocab Master — the printable document model shared by unit tests and dictations (pure).
 * A doc is { kind, meta, sections[] }. Each section is one task (a test part or a dictation) with its
 * items, optional reading passage / listening script / word bank / writing frame, and points.
 * This module turns AI output into clean sections, balances answer keys, builds an A/B version and
 * totals the points. Rendering lives in doc-render.js. */
import { TASKS, SKILLS, tfLabels, rubricFor, partOpts } from "./tasks.js";
import { readingText } from "./reading-texts.js";
import { balancedPositions, binaryBalance } from "./answer-balance.js";
import { fitWordBox, countExtraWords, repeatedAnswers, withExtraWords } from "./word-box.js";

/** Letters for options, matching meanings and order boxes: enough for the longest part (12 questions + the example). */
export const LETTERS = "abcdefghijklmnopqrstuvwxyz";

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const lc = (s) => clean(s).toLowerCase().replace(/[.!?]+$/, "");
const squash = (s) => String(s ?? "").toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9']+/g, " ").trim();

function shuffled(arr, rand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Canonical two-answer value: 0 = yes / true, 1 = no / false, -1 = neither. */
export function tfValue(answer) {
  const a = lc(answer);
  if (/^(y|yes|t|true|σωστό)$/.test(a)) return 0;
  if (/^(n|no|f|false|λάθος)$/.test(a)) return 1;
  return -1;
}

/** One item, cleaned for its task's answer type. Returns { item, problems[] }. */
export function normalizeItem(raw, task, { levelId, picFor } = {}) {
  const t = TASKS[task] || {};
  const problems = [];
  const item = { prompt: clean(raw?.prompt ?? raw?.question ?? raw?.text ?? "") };
  if (t.answer === "choice") {
    let options = (Array.isArray(raw?.options) ? raw.options : []).map(clean).filter(Boolean);
    options = options.filter((o, i) => options.findIndex((x) => lc(x) === lc(o)) === i);
    let answer = clean(raw?.answer);
    let idx = options.findIndex((o) => lc(o) === lc(answer));
    if (idx < 0 && /^[a-h]$/i.test(answer)) idx = LETTERS.indexOf(answer.toLowerCase());
    if (idx < 0 && answer) { options.push(answer); idx = options.length - 1; problems.push("answer was not among the options"); }
    if (options.length < 2) problems.push("needs at least two options");
    item.options = options;
    item.answerIndex = idx;
    item.answer = options[idx] ?? answer;
    if (t.needs?.includes("pictures") && picFor) {
      const pics = options.map((o) => picFor(o));
      if (pics.every(Boolean)) item.optionPics = pics;
    }
  } else if (t.answer === "tf") {
    const v = tfValue(raw?.answer);
    if (v < 0) problems.push("answer must be yes/no or true/false");
    item.answer = tfLabels(levelId)[Math.max(0, v)];
    item.tf = v;
    if (raw?.evidence) item.evidence = clean(raw.evidence);
  } else {
    item.answer = clean(raw?.answer ?? raw?.sample ?? "");
    if (!item.answer && t.answer !== "open" && task !== "R-ORDER") problems.push("missing answer");
  }
  if (task === "V-SPELL" && raw?.jumble) item.jumble = clean(raw.jumble);
  // The teacher’s own letter help for this question (kept while it fits the answer).
  if (LETTER_HELP_TASKS.includes(task)) { const r = cleanReveal(raw?.reveal, item.answer); if (r !== undefined) item.reveal = r; }
  if (task === "V-PIC" && picFor) {
    const p = picFor(item.answer);
    if (p) item.pic = p;
    else problems.push("no picture for this word");
  }
  // "Look and tick or cross": the picture is its own word; the printed word matches it (yes) or not (no).
  if (task === "V-TICK") {
    const word = clean(raw?.picture ?? raw?.pic ?? (item.tf === 0 ? String(item.prompt).replace(/^(an?|the)\s+/i, "") : ""));
    const p = word && picFor ? picFor(word) : null;
    if (word) item.picWord = word;
    if (p) item.pic = p;
    else if (picFor) problems.push("no picture for this word");
    // The key comes from the picture and the word, never from the writer: the same thing → yes, another → no
    // (the writer is given a yes/no order and once keyed "yes" for "happen" under a beehive).
    const shown = clean(item.prompt).replace(/^(an?|the|some)\s+/i, "");
    if (word && shown) {
      const v = sameThing(word, shown) ? 0 : 1;
      if (v !== item.tf) { item.tf = v; item.answer = tfLabels(levelId)[v]; }
      // The word under a picture names a thing children can see — a word with no picture ("happen") can't be one.
      if (v === 1 && picFor && !picFor(shown) && !picFor(singular(shown))) problems.push(`the word under the picture ("${shown}") should name a thing the children can see, like the picture words`);
    }
  }
  return { item, problems };
}

/** "cats" → "cat", "boxes" → "box", "berries" → "berry" (enough to compare a picture's word with a printed one). */
const singular = (w) => {
  const s = clean(w).toLowerCase();
  if (/ies$/.test(s) && s.length > 4) return `${s.slice(0, -3)}y`;
  if (/(?:ch|sh|x|ss|z)es$/.test(s)) return s.slice(0, -2);
  if (/[^s]s$/.test(s) && s.length > 3) return s.slice(0, -1);
  return s;
};
/** Is the printed word the picture's thing? ("a dog" / "dogs" under a dog: yes.) */
export const sameThing = (picWord, printed) => {
  const a = clean(picWord).toLowerCase().replace(/^(an?|the|some)\s+/, "");
  const b = clean(printed).toLowerCase().replace(/^(an?|the|some)\s+/, "").replace(/[.!?]+$/, "");
  return a === b || singular(a) === singular(b);
};

const orderWords = (s) => clean(s).replace(/[.!?]+$/, "").split(/\s*\/\s*|\s+/).filter(Boolean);
const wordBag = (words) => words.map((w) => w.toLowerCase()).sort().join(" ");

/** "Put the words in order": the jumble must hold exactly the answer's words (the AI once gave "a" for "an").
 *  A jumble that doesn't is rebuilt from the answer, never left in answer order. Returns true when it was rebuilt. */
export function repairOrderItem(item, rand = Math.random) {
  const answer = orderWords(item.answer);
  if (answer.length < 2 || wordBag(orderWords(item.prompt)) === wordBag(answer)) return false;
  let jumble = shuffled(answer, rand);
  for (let t = 0; t < 8 && jumble.join(" ") === answer.join(" "); t++) jumble = shuffled(answer, rand);
  item.prompt = jumble.join(" / ");
  return true;
}

/** A word with its letters mixed up ("frog" → "g · o · r · f"), never in the right order. */
/** Are the mixed-up letters exactly the answer's letters? ("o · g · d" for "dog") */
export const sameLetters = (jumble, answer) => {
  const bag = (s) => String(s || "").toLowerCase().replace(/[^a-z]/g, "").split("").sort().join("");
  return !!jumble && bag(jumble) === bag(answer) && bag(answer).length > 0;
};

export function scramble(word, rand = Math.random) {
  const letters = String(word || "").toLowerCase().replace(/[^a-z]/g, "").split("");
  if (letters.length < 2) return letters.join("");
  let out = shuffled(letters, rand);
  for (let t = 0; t < 12 && out.join("") === letters.join(""); t++) out = shuffled(letters, rand);
  return out.join(" · ");
}

/** Tasks whose letter help the app makes (and the teacher can set per question). */
export const LETTER_HELP_TASKS = ["V-DEF", "V-PIC", "V-OPPW", "V-FORM", "V-SPELL"];

/** A question’s letter help: its own choice when the teacher made one, else the part’s. */
function setHint(it, partHint) {
  const h = it.reveal === "none" ? "" : Array.isArray(it.reveal) ? revealHint(it.answer, it.reveal) : partHint;
  if (h) it.hint = h; else delete it.hint;
}

/** Letter help for a word: "first" → "g _ _ _ _ _", "count" → "_ _ _ _ _ _ (6 letters)", "first2", "firstlast", "some" (see revealFor), "none" → "". */
export function letterHint(word, mode) {
  const w = String(word || "").trim();
  if (!w || mode === "none" || !mode) return "";
  const n = w.replace(/[^A-Za-z]/g, "").length;
  const blanks = (s) => s.split(" ").map((part) => part.replace(/[A-Za-z]/g, "_").split("").join(" ")).join("   ");
  if (mode === "first") return `${w[0].toLowerCase()} ${blanks(w.slice(1)).trim()}`.trim();
  if (mode === "count") return `${blanks(w)} (${n} letters)`;
  const shown = revealFor(w, mode);
  return shown ? revealHint(w, shown) : "";
}

/** The positions of the letters in an answer ("ice-cream" → 0,1,2,4,5,…): only letters ever get a box. */
export const letterPositions = (answer) => [...String(answer || "")].map((c, i) => (/[A-Za-z]/.test(c) ? i : -1)).filter((i) => i >= 0);

/**
 * Which letters a kind of help shows, as positions in the answer (null: no letter help). Always leaves at least one
 * letter to write. "first", "first2" (first two), "firstlast", "some" (about a third, spread out so no two shown
 * letters touch, the first one included), "count" (boxes only), "root" (the word in CAPITALS inside the answer —
 * needs the prompt; else the first letter).
 */
export function revealFor(answer, mode, prompt = "") {
  const L = letterPositions(answer);
  if (!L.length || !mode || mode === "none") return null;
  let out;
  if (mode === "count") out = [];
  else if (mode === "first") out = L.slice(0, 1);
  else if (mode === "first2") out = L.slice(0, 2);
  else if (mode === "firstlast") out = L.length > 2 ? [L[0], L.at(-1)] : L.slice(0, 1);
  else if (mode === "some") {
    const k = Math.max(1, Math.round(L.length / 3));
    out = [...new Set(Array.from({ length: k }, (_, j) => L[Math.round((j * (L.length - 1)) / Math.max(k, 2))]))];
  } else if (mode === "root") {
    const base = (String(prompt || "").match(/\(\s*([A-Z][A-Z' -]*?)\s*\)\s*[.?!]?\s*$/) || [])[1];
    const span = base ? rootSpan(answer, base) : null;
    out = span ? L.filter((i) => i >= span[0] && i < span[1]) : L.slice(0, 1);
  } else return null;
  return out.length >= L.length ? out.slice(0, L.length - 1) : out;
}

/** The letter help for the shown positions, in the boxes' shape: "c _ e _ _ _", words three spaces apart. */
export function revealHint(answer, shown = []) {
  const show = new Set(shown);
  const chars = [...String(answer || "").trim()];
  const words = [];
  let cur = [];
  chars.forEach((c, i) => {
    if (/\s/.test(c)) { if (cur.length) words.push(cur); cur = []; return; }
    cur.push(/[A-Za-z]/.test(c) ? (show.has(i) ? c : "_") : c);
  });
  if (cur.length) words.push(cur);
  return words.map((w) => w.join(" ")).join("   ");
}

/**
 * A question's own letter help, chosen by the teacher: "none", or the positions of the letters to show (any letters,
 * not only the first ones; [] = empty boxes only). Kept only while it fits the answer — at least one letter to write.
 */
export function cleanReveal(reveal, answer) {
  if (reveal === "none") return "none";
  if (!Array.isArray(reveal)) return undefined;
  const L = new Set(letterPositions(answer));
  const out = [...new Set(reveal.map(Number).filter((i) => L.has(i)))].sort((a, b) => a - b);
  return L.size && out.length < L.size ? out : undefined;
}

/**
 * Word-family help, made from the answer and the base word in CAPITALS at the end of the prompt: "root" prints the
 * base word inside the answer's letter boxes (SUN → "s u n _ _"; HAPPY → "_ _ h a p p y"), else the first letter;
 * "count" gives the letter count.
 */
export function familyHint(prompt, answer, mode) {
  const w = String(answer || "").trim();
  if (!w || !mode || mode === "none") return "";
  if (mode === "count") return letterHint(w, "count");
  if (mode !== "root") return letterHint(w, mode);
  const base = (String(prompt || "").match(/\(\s*([A-Z][A-Z' -]*?)\s*\)\s*[.?!]?\s*$/) || [])[1];
  const span = base ? rootSpan(w, base) : null;
  if (!span) return letterHint(w, "first");
  const [from, to] = span;
  return w.split("").map((ch, i) => (i >= from && i < to) || !/[A-Za-z]/.test(ch) ? ch.toLowerCase() : "_").join(" ");
}

/**
 * Where the base word shows inside the answer, as [from, to): the whole base (SUN → sunny, HAPPY → unhappy), or its
 * stem when the spelling changes at the end (PRODUCE → produc|tion, AMAZE → amaz|ing, HAPPY → happ|iness) — so every
 * answer of a family gets the same kind of help. null when the base doesn't sit in the answer that way or would
 * leave nothing to write (BREATHE → breath, CREATURE → create): then the first letter is given.
 */
export function rootSpan(answer, base) {
  const w = String(answer || "").toLowerCase();
  const b = String(base || "").toLowerCase().trim();
  if (!w || !b) return null;
  const at = w.indexOf(b);
  if (at >= 0) return b.length < w.length ? [at, at + b.length] : null;
  let k = 0;
  while (k < b.length && k < w.length && b[k] === w[k]) k++;
  return k >= 3 && k >= b.length - 2 && k <= w.length - 2 ? [0, k] : null;
}

/**
 * The letters named in an instruction follow the part's real options: "Choose the right answer: a, b or c."
 * becomes "…a, b, c or d." when the questions have four options (English "or", Greek "ή"; any case, with or
 * without a comma before or). Text without such a list is returned as it is.
 */
const LETTER_LIST = /\b([a-h])\s*,\s*([a-h])(?:\s*,\s*[a-h])*\s*,?\s*(or|ή|ή\s*το)\s+([a-h])\b/gi;
const TWO_LETTERS = /\b(a)\s+(or|ή)\s+(b)\b/gi;
export function fitChoiceLetters(text, n) {
  const count = Math.max(2, Math.min(LETTERS.length, Number(n) || 0));
  if (!text || !n) return text || "";
  const list = (word) => (count === 2 ? `a ${word} b` : `${LETTERS.slice(0, count - 1).split("").join(", ")} ${word} ${LETTERS[count - 1]}`);
  return String(text)
    .replace(LETTER_LIST, (m, a, b, word) => (a.toLowerCase() === "a" ? list(word.toLowerCase().startsWith("ή") ? "ή" : "or") : m))
    .replace(TWO_LETTERS, (m, a, word) => (count === 2 ? m : list(word.toLowerCase() === "ή" ? "ή" : "or")));
}
/** The number of options a choice part offers (the most any question has). */
export const optionCount = (section) => (section?.answerType === "choice" ? Math.max(0, ...[section.example, ...(section.items || [])].filter(Boolean).map((it) => it.options?.length || 0)) : 0);
/** True when a part has a box of words to choose from for its gaps (not a matching list, not a writing word box). */
export const hasWordBox = (section) => !!TASKS[section?.task]?.bank && section.answerType !== "match" && Array.isArray(section.bank) && typeof section.bank[0] === "string";
/** How many words of a part's box fit no gap (the example's word is neither). */
export const boxExtras = (section) => (hasWordBox(section) ? countExtraWords(section.bank, (section.items || []).map((it) => it.answer), section.example?.answer ? [section.example.answer] : []) : 0);

/**
 * A part's instruction (English and Greek) with the letters of its real options, and — for a word box — the line
 * saying how many extra words it has ("There are two extra words you do not need."), counted from the box itself.
 */
/**
 * A sentence starter as printed before its writing line. The AI sometimes writes the gap itself ("I like ________
 * about my town.", "My name is ____."): a gap at the end becomes the writing line (so the paper never shows two
 * lines in a row), gaps inside stay as short gaps, and "..." is one ellipsis.
 */
export function starterText(starter) {
  let s = clean(starter).replace(/\.{3,}/g, "…");
  // Trailing gap (with any full stop, ellipsis or other punctuation after it) → the line after the starter.
  s = s.replace(/\s*_{3,}[\s_.…!?,;:]*$/, "").trim();
  return s.replace(/_{3,}/g, "________");
}

export function sectionRubric(section) {
  const n = optionCount(section);
  let en = section?.rubric || "";
  let el = section?.rubricEl || "";
  if (n) { en = fitChoiceLetters(en, n); el = fitChoiceLetters(el, n); }
  if (hasWordBox(section)) {
    const k = boxExtras(section);
    en = withExtraWords(en, k, "en");
    if (el) el = withExtraWords(el, k, "el");
  }
  return { en, el };
}

/**
 * Give every lettered thing its letter again (match meanings, order boxes, picture-dictation pictures).
 * Documents saved when the letters stopped at "h" have empty boxes after it; this fills them. Returns the doc.
 */
export function relabelDoc(doc) {
  const unitTest = doc?.spec?.source?.kind === "unit";
  for (const d of [doc, doc?.versionB].filter(Boolean)) {
    // Unit tests saved with "Primary Path 2 · Unit 4" under the title: the header already shows the book and unit, so it becomes the label.
    if (unitTest && d.meta && !d.meta.label && /^Primary Path \d · Units? /.test(d.meta.subtitle || "")) {
      d.meta.label = d.meta.subtitle;
      d.meta.subtitle = "";
    }
    for (const s of d.sections || []) {
      // Instructions saved before they followed the options ("a, b or c" over four options).
      const r = sectionRubric(s);
      s.rubric = r.en;
      s.rubricEl = r.el;
      // "Look and tick or cross" saved with a key the writer got wrong: yes only when the word is the picture's thing.
      if (s.task === "V-TICK") [s.example, ...(s.items || [])].filter(Boolean).forEach((it) => {
        const shown = clean(it.prompt).replace(/^(an?|the|some)\s+/i, "");
        if (!it.picWord || !shown) return;
        const v = sameThing(it.picWord, shown) ? 0 : 1;
        if (v !== it.tf) { it.tf = v; it.answer = tfLabels(d.meta?.classProfile)[v]; }
      });
      if (s.answerType === "match" && Array.isArray(s.bank) && s.bank.length && typeof s.bank[0] === "object") {
        s.bank.forEach((b, i) => { b.letter = LETTERS[i]; });
        const byText = new Map(s.bank.map((b) => [String(b.text), b.letter]));
        [s.example, ...(s.items || [])].filter(Boolean).forEach((it) => { it.letter = byText.get(String(it.answer)) || ""; });
      } else if (s.task === "R-ORDER") {
        (s.items || []).forEach((it, i) => { it.letter = LETTERS[i]; });
      } else if (Array.isArray(s.pictures) && s.pictures.length) {
        s.pictures.forEach((p, i) => { p.letter = LETTERS[i]; const x = (s.sentences || []).find((y) => y.n === p.n); if (x) x.letter = p.letter; });
      }
    }
  }
  return doc;
}

/**
 * "Put the events in order": the example is event 1 and the items come in text order, so the app numbers them
 * 2, 3, 4… and mixes them up (never left in order). Items that already carry a full set of numbers (an edited part)
 * keep them. Each item gets a letter for the paper.
 */
export function orderEvents(example, items, rand = Math.random) {
  const want = items.map((_, i) => String(i + 2));
  const have = items.map((it) => String(it.answer || "").trim());
  if (example) example.answer = "1";
  let list = items;
  if ([...have].sort().join() !== [...want].sort().join()) {
    items.forEach((it, i) => { it.answer = want[i]; });
    list = shuffled(items, rand);
    for (let t = 0; t < 8 && list.length > 1 && list.every((it, i) => it === items[i]); t++) list = shuffled(items, rand);
  }
  list.forEach((it, i) => { it.n = i + 1; it.letter = LETTERS[i]; });
  if (example) example.letter = "";
  return list;
}

/** Option order that spreads the right answer evenly over a, b, c… across a section (other options keep their order). */
export function balanceChoices(items, rand = Math.random) {
  const idx = items.map((it, i) => (Array.isArray(it.options) && it.answerIndex >= 0 ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return;
  const k = Math.min(...idx.map((i) => items[i].options.length));
  const targets = balancedPositions(idx.length, k, rand);
  idx.forEach((i, n) => {
    const it = items[i];
    const want = targets[n] - 1;
    if (want === it.answerIndex || want >= it.options.length) return;
    const move = (arr) => { if (!arr) return arr; const a = [...arr]; const [x] = a.splice(it.answerIndex, 1); a.splice(want, 0, x); return a; };
    it.options = move(it.options);
    it.optionPics = move(it.optionPics);
    it.answerIndex = want;
  });
}

/** How many pictures an open picture task prints (writing story pictures, speaking cards). */
const PICTURES_NEEDED = { "W-PICTURES": 3, "S-PICTURE": 3, "S-STORY": 4, "S-DISCUSS": 5 };

/** The picture of a word the AI wrote loosely ("Firefighters", "the hospital", { word: "park" }), or "". */
function picForLoose(picFor, w) {
  const word = clean(typeof w === "object" && w ? w.word || w.english || w.name : w).replace(/^(?:a|an|the)\s+/i, "").replace(/[.!?,;:]+$/, "");
  if (!word) return { word: "", pic: "" };
  const lc = word.toLowerCase();
  for (const c of [word, lc, lc.replace(/ies$/, "y"), lc.replace(/(?:ch|sh|s|x|z)es$/, (m) => m.slice(0, -2)), lc.replace(/s$/, "")]) {
    const pic = c ? picFor(c) : "";
    if (pic) return { word: c === word || c === lc ? word : c, pic };
  }
  return { word, pic: "" };
}

/**
 * The pictures of an open task. The AI's own choice first (read leniently); a picture task that came back with too
 * few is topped up with words that have pictures — from its word box, then the words its story or cards mention,
 * then the test's other words — so "Write about the pictures" is never printed without them.
 */
function openPictures(taskId, raw, ctx) {
  const out = [];
  const seen = new Set();
  const add = (w) => {
    const p = picForLoose(ctx.picFor, w);
    if (p.pic && !seen.has(p.pic)) { seen.add(p.pic); out.push(p); }
  };
  (Array.isArray(raw.pictures) ? raw.pictures : typeof raw.pictures === "string" ? raw.pictures.split(/[,;]/) : []).forEach(add);
  const need = PICTURES_NEEDED[taskId] || 0;
  if (!need || out.length >= need) return out;
  const said = squash([raw.prompt, raw.task, ...(Array.isArray(raw.frame) ? raw.frame : []), ...(Array.isArray(raw.sample) ? raw.sample : [raw.sample]),
    ...(Array.isArray(raw.cards) ? raw.cards.flatMap((c) => [c?.title, ...(c?.keyWords || []), c?.model]) : [])].map((x) => String(x || "")).join(" "));
  const mentioned = (w) => squash(w) && ` ${said} `.includes(` ${squash(w)} `);
  const bank = (Array.isArray(raw.bank) ? raw.bank : []).map(clean).filter(Boolean);
  const spare = (ctx.spareWords || []).map(clean).filter(Boolean);
  for (const w of [...bank.filter(mentioned), ...spare.filter(mentioned), ...bank, ...spare]) {
    if (out.length >= need) break;
    add(w);
  }
  return out;
}

/**
 * A planned section filled with the AI's content.
 * plan: { id, task, items, pointsEach?, points? } · raw: the AI's object for that section.
 * ctx: { levelId, picFor(word) → "@w-…" | "" , greek }
 */
export function normalizeSection(plan, raw = {}, ctx = {}) {
  const task = TASKS[plan.task] || {};
  const problems = [];
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const want = plan.items || rawItems.length;
  let items = [];
  for (const r of rawItems) {
    if (items.length >= want) break;
    const { item, problems: p } = normalizeItem(r, plan.task, ctx);
    if (task.answer !== "open" && !item.prompt && !item.options?.length && !item.pic) continue;
    items.push(item);
    p.forEach((x) => problems.push(`item ${items.length}: ${x}`));
  }
  if (task.answer !== "open" && items.length < want) problems.push(`has ${items.length} of ${want} items`);
  items.forEach((it, i) => { it.n = i + 1; });
  const example = raw.example && task.answer !== "open" ? normalizeItem(raw.example, plan.task, ctx).item : null;
  if (example) example.n = 0;

  const rubric = rubricFor(plan.task, ctx.levelId);
  const opts = partOpts(plan, ctx.levelId);
  // A reading text from the app's own unit texts is printed exactly as written (the AI only writes the questions).
  const given = opts.text ? readingText(opts.text) : null;
  const section = {
    id: plan.id,
    task: plan.task,
    skill: task.skill,
    answerType: task.answer,
    title: `${SKILLS[task.skill]?.label || ""}`,
    rubric: clean(raw.rubric) || rubric.en,
    rubricEl: rubric.el,
    items,
    example,
    passageTitle: given ? given.title : clean(raw.passageTitle),
    passage: given ? given.text : String(raw.passage || "").trim(),
    ...(given ? { textId: given.id } : {}),
    // The rubric is printed, so a narrator reading it aloud ("Teacher: Listen and tick…") is dropped.
    script: (Array.isArray(raw.script) ? raw.script : []).map((l) => ({ speaker: clean(l?.speaker) || "Narrator", text: clean(l?.text) }))
      .filter((l) => l.text && !(/^(teacher|narrator|announcer)$/i.test(l.speaker) && /^(now )?(listen|look|you will hear)\b/i.test(l.text))),
    frame: (Array.isArray(raw.frame) ? raw.frame : []).map(clean).filter(Boolean),
    prompts: (Array.isArray(raw.prompts) ? raw.prompts : []).map(clean).filter(Boolean),
    sample: Array.isArray(raw.sample) ? raw.sample.map(clean).join("\n") : String(raw.sample || "").trim(),
    task_prompt: clean(raw.prompt || raw.task),
    // Speaking: opening questions and the cards students hold (questions, follow-ups and a model answer for the teacher).
    warmup: (Array.isArray(raw.warmup) ? raw.warmup : []).map(clean).filter(Boolean).slice(0, 4),
    cards: (Array.isArray(raw.cards) ? raw.cards : []).map((c) => ({
      title: clean(c?.title), student: clean(c?.student),
      keyWords: (Array.isArray(c?.keyWords) ? c.keyWords : []).map(clean).filter(Boolean).slice(0, 6),
      questions: (Array.isArray(c?.questions) ? c.questions : []).map(clean).filter(Boolean).slice(0, 6),
      followUps: (Array.isArray(c?.followUps) ? c.followUps : []).map(clean).filter(Boolean).slice(0, 3),
      model: Array.isArray(c?.model) ? c.model.map(clean).join(" ") : clean(c?.model),
    })).filter((c) => c.title || c.student || c.questions.length).slice(0, 6),
    pictures: [],
    bank: [],
    plays: opts.plays === 1 ? 1 : 2,
    words: plan.words || null,
  };
  if (ctx.picFor) {
    section.pictures = openPictures(plan.task, raw, ctx);
    const need = PICTURES_NEEDED[plan.task] || 0;
    if (need && section.pictures.length < need) problems.push(`needs ${need} pictures (has ${section.pictures.length}) — use words from the picture list`);
  }

  // Word banks: shuffled, never in answer order. Matching: lettered definitions.
  if (task.answer === "match") {
    // The example's meaning is in the list too, so item 0 shows its letter (Cambridge style).
    const defs = shuffled([...new Set([...(example?.answer ? [example.answer] : []), ...items.map((it) => it.answer)])]);
    section.bank = defs.map((text, i) => ({ letter: LETTERS[i], text }));
    [example, ...items].filter(Boolean).forEach((it) => { it.letter = LETTERS[defs.indexOf(it.answer)] || ""; it.prompt ||= ""; });
  } else if (task.answer === "open" && task.skill === "writing" && Array.isArray(raw.bank) && raw.bank.length) {
    // A word box for writing with lots of support.
    section.bank = [...new Set(raw.bank.map(clean).filter(Boolean))].slice(0, 10);
  } else if (task.bank) {
    // One word per gap, plus exactly the extra words the part asks for (Step 3 "Extra words in the box").
    // raw.keepBank: the teacher typed this box on the paper — every word of it stays.
    const answers = items.map((it) => it.answer);
    const box = fitWordBox({
      bank: Array.isArray(raw.bank) ? raw.bank : [], answers, extras: opts.extras, keep: raw.extraWords, spare: ctx.spareWords,
      exclude: example?.answer ? [example.answer] : [], asIs: !!raw.keepBank,
    });
    section.bank = box.words;
    section.extraWords = box.extraWords;
    // Every word of the box is used once, so two gaps can't need the same word.
    repeatedAnswers(answers).forEach((r) => problems.push(`item ${r.n}: same answer as item ${r.first} ("${r.answer}") — each gap needs a different word from the box`));
  }
  if (task.answer === "choice") balanceChoices(items);
  if (plan.task === "G-ORDER") [example, ...items].filter(Boolean).forEach((it) => repairOrderItem(it));
  if (plan.task === "R-ORDER") section.items = items = orderEvents(example, items);
  if (task.answer === "choice" || hasWordBox(section)) { const r = sectionRubric(section); section.rubric = r.en; section.rubricEl = r.el; }
  // Letter help, made by the app from the answer (never left to the AI): mixed-up letters, a first letter or a letter count.
  // Unjumble: the mixed-up letters (kept while they are the answer's letters, so a re-check doesn't mix them again),
  // and letter boxes when the part or the question asks for them.
  if (plan.task === "V-SPELL") [example, ...items].filter(Boolean).forEach((it) => {
    if (!sameLetters(it.jumble, it.answer)) it.jumble = scramble(it.answer);
    setHint(it, letterHint(it.answer, opts.hint));
  });
  if (plan.task === "V-FORM") [example, ...items].filter(Boolean).forEach((it) => setHint(it, familyHint(it.prompt, it.answer, opts.family)));
  // Word families and opposites: the answer is never the word in capitals itself.
  if (plan.task === "V-FORM" || plan.task === "V-OPPW") items.forEach((it) => {
    const base = (String(it.prompt || "").match(/\(\s*([A-Z][A-Z' -]*?)\s*\)\s*[.?!]?\s*$/) || [])[1];
    if (base && lc(base) === lc(it.answer)) problems.push(`item ${it.n}: the answer is the word in capitals itself ("${base}")`);
  });
  if (["V-DEF", "V-PIC", "V-OPPW"].includes(plan.task)) {
    const mode = opts.hint;
    [example, ...items].filter(Boolean).forEach((it) => setHint(it, letterHint(it.answer, mode)));
  }

  // Points: one per item; open tasks carry their own total.
  section.pointsEach = task.answer === "open" ? 0 : plan.pointsEach || 1;
  section.points = task.answer === "open" ? plan.points || 10 : items.length * section.pointsEach;

  if (task.needs?.includes("script") && !section.script.length) problems.push("missing the listening script");
  if (task.needs?.includes("passage") && !section.passage) problems.push("missing the reading text");
  if (task.skill === "speaking" && !section.cards.length && !section.prompts.length) problems.push("missing the speaking cards");
  // "Continue the story" needs the story's first lines on the paper — not an instruction ("Continue the story.").
  if (plan.task === "W-STORY" && (!section.task_prompt || /^(?:continue|write|read|finish|now)\b/i.test(section.task_prompt))) {
    if (section.passage) { section.task_prompt = section.passage.replace(/\s+/g, " ").trim(); section.passage = ""; }
    else problems.push("missing the beginning of the story");
  }
  if (task.answer === "tf") {
    const report = binaryBalance("TF", items.map((it) => ({ answer: it.tf === 0 ? "T" : it.tf === 1 ? "F" : "" })));
    if (!report.ok) problems.push(`the answers need a mix of ${tfLabels(ctx.levelId).join(" and ")} (items ${report.flip.map((i) => i + 1).join(", ")} should be "${tfLabels(ctx.levelId)[report.flipTo === "T" ? 0 : 1]}")`);
    // The AI quotes the words that decide each answer; a quote that isn't in the text means the key needs a look.
    const source = squash(`${section.passage} ${section.script.map((l) => l.text).join(" ")}`);
    const unsure = items.filter((it) => it.evidence && !source.includes(squash(it.evidence))).map((it) => it.n);
    if (source && unsure.length) problems.push(`check the answer${unsure.length > 1 ? "s" : ""} to item${unsure.length > 1 ? "s" : ""} ${unsure.join(", ")} against the ${section.script.length ? "script" : "text"}`);
  }
  section.problems = problems;
  return section;
}

/** Total points of a doc. */
export function docPoints(doc) {
  return (doc?.sections || []).reduce((sum, s) => sum + (Number(s.points) || 0), 0);
}

/** Answer key lines for a section: [{ n, text }]. */
export function answerKeyRows(section) {
  return (section.items || []).map((it) => {
    if (section.answerType === "choice") return { n: it.n, text: `${LETTERS[it.answerIndex] ?? "?"}) ${it.answer}` };
    if (section.answerType === "match") return { n: it.n, text: `${it.letter} — ${it.answer}` };
    if (section.task === "R-ORDER") return { n: (it.letter || "").toUpperCase() || it.n, text: `${it.answer} — ${it.prompt}` };
    return { n: it.n, text: it.answer || "" };
  });
}

/**
 * Version B of a doc for the next desk: items in another order (listening keeps the order of the audio),
 * options moved, word banks reshuffled. Same tasks, same texts, same points.
 */
export function makeVersionB(doc, rand = Math.random) {
  const b = JSON.parse(JSON.stringify(doc));
  b.meta = { ...b.meta, version: "B" };
  for (const s of b.sections) {
    if (s.answerType === "open" || s.skill === "dictation") continue;
    // Listening and reading questions follow the order of the audio / text, so only their options move.
    const keepOrder = s.skill === "listening" || s.skill === "reading";
    if (!keepOrder) {
      s.items = shuffled(s.items, rand);
      s.items.forEach((it, i) => { it.n = i + 1; });
    }
    if (s.answerType === "choice") {
      s.items.forEach((it) => {
        const order = shuffled(it.options.map((_, i) => i), rand);
        it.options = order.map((i) => it.options[i]);
        if (it.optionPics) it.optionPics = order.map((i) => it.optionPics[i]);
        it.answerIndex = order.indexOf(it.answerIndex);
      });
      balanceChoices(s.items, rand);
    }
    if (s.answerType === "match") {
      const defs = shuffled(s.bank.map((x) => x.text), rand);
      s.bank = defs.map((text, i) => ({ letter: LETTERS[i], text }));
      [s.example, ...s.items].filter(Boolean).forEach((it) => { it.letter = LETTERS[defs.indexOf(it.answer)] || ""; });
    } else if (s.bank?.length) s.bank = shuffled(s.bank, rand);
  }
  return b;
}

/** Every problem in a doc, for the quality strip: ["Reading: item 2: …"]. */
export function docProblems(doc) {
  return (doc?.sections || []).flatMap((s) => (s.problems || []).map((p) => `${SKILLS[s.skill]?.label || s.task} (${TASKS[s.task]?.label || s.task}): ${p}`));
}

export const newDocId = (kind) => `${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
