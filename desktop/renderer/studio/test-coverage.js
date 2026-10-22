/* Which of a test's words the test really asks about, and where — the Test Maker's word check (like the
 * worksheets' coverage). Pure: works on a saved test doc ({ focusWords, sections }). */
import { containsForm as looseForm } from "./word-scope.js";

/*
 * Word families: the shared matcher is lenient on purpose (an answer "baker" is in scope for the word "bake"). The
 * word check must not be: when another chosen word explains the match ("baker", "bakery" beside "bake"; "painter"
 * beside "paint"), the shorter word counts only where it appears on its own. FAMILY holds, per word, the longer
 * chosen words that are forms of it; containsForm below takes those out of the text before matching.
 */
let FAMILY = new Map();
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function setFamily(words) {
  const list = [...new Set(words.map((w) => String(w || "").trim().toLowerCase()).filter(Boolean))];
  FAMILY = new Map(list.map((w) => [w, list.filter((v) => v !== w && v.length > w.length && looseForm(v, w))]));
}
function containsForm(text, word) {
  const longer = FAMILY.get(String(word || "").trim().toLowerCase()) || [];
  let src = String(text || "");
  for (const v of longer) src = src.replace(new RegExp(`(?<![A-Za-z])${v.split(/\s+/).map(esc).join("[\\s-]+")}(?![A-Za-z])`, "gi"), " ");
  return looseForm(src, word);
}

/** Strings of a question: the answer, the question itself (sentence, picture word), and the wrong options. */
function itemTexts(it) {
  if (!it) return { answer: "", ask: "", other: "" };
  const str = (list) => list.filter((x) => typeof x === "string").join(" \n ");
  const wrong = (it.options || []).filter((_, i) => i !== it.answerIndex);
  return { answer: String(it.answer ?? ""), ask: str([it.prompt, it.picWord]), other: str([...wrong, it.evidence]) };
}

/** The part's texts: the reading, the listening script, word banks, writing prompts, speaking cards. */
function sectionTexts(s) {
  const bank = (s.bank || []).map((b) => (typeof b === "string" ? b : b?.text || b?.word || "")).join(" \n ");
  const script = (s.script || []).map((l) => l?.text || "").join(" \n ");
  const cards = (s.cards || []).map((c) => [c?.title, c?.student, ...(c?.keyWords || []), ...(c?.questions || []), ...(c?.followUps || [])].filter(Boolean).join(" \n ")).join(" \n ");
  const pics = (s.pictures || []).map((p) => p?.word || "").join(" \n ");
  return [s.passageTitle, s.passage, script, bank, pics, ...(s.prompts || []), ...(s.frame || []), ...(s.warmup || []), s.task_prompt, cards].filter((x) => typeof x === "string" && x).join(" \n ");
}

/**
 * For each word: where it is asked about (a question's answer, or the question of a vocabulary part) and where it
 * only appears (a reading or listening text, a wrong option, a word bank).
 * Returns { words: [{ english, greek, own, status: "tested"|"seen"|"missing", tested: [{ part, items }], seen: [part] }],
 *   tested, seen, missing, total, parts: [{ part, skill, task, words: [english] }] }. `part` is 0-based.
 */
export function testCoverage(doc) {
  const sections = doc?.sections || [];
  const seenKeys = new Set();
  const focus = (doc?.focusWords || []).filter((w) => {
    const k = String(w?.english || "").trim().toLowerCase();
    if (!k || seenKeys.has(k)) return false;
    seenKeys.add(k);
    return true;
  });
  setFamily(focus.map((w) => w.english));
  const parts = sections.map((s, i) => ({ part: i, skill: s.skill, task: s.task, words: [] }));
  const words = focus.map((w) => {
    const tested = [];
    const seen = [];
    sections.forEach((s, i) => {
      const vocab = s.skill === "vocabulary";
      const items = [];
      let inPart = false;
      for (const it of s.items || []) {
        const { answer, ask, other } = itemTexts(it);
        // A vocabulary question is about every word in it (matching, definitions); a wrong option is not tested.
        if (containsForm(answer, w.english) || (vocab && containsForm(ask, w.english))) items.push(it.n);
        else if (containsForm(ask, w.english) || containsForm(other, w.english)) inPart = true;
      }
      if (items.length) { tested.push({ part: i, items }); parts[i].words.push(w.english); return; }
      if (inPart || containsForm(sectionTexts(s), w.english)) seen.push(i);
    });
    const status = tested.length ? "tested" : seen.length ? "seen" : "missing";
    return { english: w.english, greek: w.greek || "", type: w.type || "", own: !!w.own, status, tested, seen };
  });
  const count = (st) => words.filter((w) => w.status === st).length;
  return { words, parts, tested: count("tested"), seen: count("seen"), missing: count("missing"), total: words.length };
}

/** "Part 2 (3, 5) · Part 4" — where a word is tested; "in the text of Part 3" when it only appears. */
export function coverageWhere(w) {
  const t = w.tested.map((x) => `Part ${x.part + 1} (${x.items.length === 1 ? "question" : "questions"} ${x.items.join(", ")})`);
  const s = w.seen.filter((p) => !w.tested.some((x) => x.part === p)).map((p) => `Part ${p + 1}`);
  if (t.length) return `Tested in ${t.join(" · ")}${s.length ? ` · also appears in ${s.join(", ")}` : ""}`;
  if (s.length) return `Only appears in ${s.join(", ")} — no question asks about it`;
  return "Not on the test";
}

/** True when a question uses the word (its answer, its sentence or an option); words: the test's words (families). */
export function itemUses(it, word, words = null) {
  if (words) setFamily(words);
  const { answer, ask, other } = itemTexts(it);
  return containsForm(answer, word) || containsForm(ask, word) || containsForm(other, word);
}

/**
 * Where a word could go, part by part, for the teacher to decide. For each part:
 *   fit: "best" (a vocabulary question tests the word itself) | "ok" (it can go in, see `note`) | "rewrite" (only by
 *   writing the part again: a writing or speaking task, or a text that doesn't use the word) | "nopic" (a picture
 *   task and a word without a picture: not possible),
 *   canAdd (room for one more question), and its questions, each with the chosen words it is the only test of
 *   (`only`) — a question with none is safe to replace.
 * tasks: the TASKS table (answer type, needs). maxItems: the most questions a part can have.
 */
export function placementOptions(doc, words, { tasks = {}, maxItems = 12, hasPicture = () => true } = {}) {
  const list = (Array.isArray(words) ? words : [words]).map((w) => (typeof w === "string" ? w : w?.english)).filter(Boolean);
  const cov = testCoverage(doc);
  // How many questions test each word: a question that is a word's only test shouldn't be replaced lightly.
  const testsOf = new Map(cov.words.map((w) => [w.english.toLowerCase(), w.tested.reduce((n, t) => n + t.items.length, 0)]));
  return (doc?.sections || []).map((s, i) => {
    const t = tasks[s.task] || {};
    const open = t.answer === "open" || s.skill === "dictation";
    const hasText = !!(s.passage || s.script?.length);
    const inText = hasText && list.every((w) => containsForm(sectionTexts(s), w));
    let fit = "ok";
    let note = "";
    const noPic = !open && t.needs?.includes("pictures") ? list.filter((w) => !hasPicture(w)) : [];
    if (noPic.length) { fit = "nopic"; note = `This part asks about pictures, and ${noPic.length === 1 ? `“${noPic[0]}” has` : `${noPic.slice(0, 3).map((w) => `“${w}”`).join(", ")}${noPic.length > 3 ? ` and ${noPic.length - 3} more have` : " have"}`} no picture in the app — choose another part.`; }
    else if (open) { fit = "rewrite"; note = s.skill === "speaking" ? "Speaking cards have no questions — Lingo can write the part again with the word." : "A writing task has no questions — Lingo can write the part again with the word in it."; }
    else if (s.skill === "vocabulary") { fit = "best"; note = "A question here tests the word itself."; }
    else if (hasText && !inText) { fit = "rewrite"; note = `The ${s.script?.length ? "recording" : "text"} doesn’t use ${list.length === 1 ? "this word" : "all these words"}, so a question can’t ask about it — Lingo can write the part again with ${list.length === 1 ? "it" : "them"} in the ${s.script?.length ? "script" : "text"}.`; }
    else if (hasText) note = `The word is in the ${s.script?.length ? "recording" : "text"}: a new question asks about it.`;
    else if (s.skill === "grammar") note = "The word goes into the sentence. A grammar question tests the grammar, so the word may only “appear” unless it is the answer.";
    else note = "The word goes into the question; it counts as tested when it is the answer.";
    const items = (s.items || []).map((it) => {
      const only = cov.words.filter((w) => w.tested.some((x) => x.part === i && x.items.includes(it.n)) && testsOf.get(w.english.toLowerCase()) === 1).map((w) => w.english);
      const tests = cov.words.filter((w) => w.tested.some((x) => x.part === i && x.items.includes(it.n))).map((w) => w.english);
      return { n: it.n, text: [it.prompt, it.options?.length ? `(${it.options.join(" / ")})` : "", it.answer && !it.options?.length ? `→ ${it.answer}` : ""].filter(Boolean).join(" ").trim(), tests, only };
    });
    return { part: i, id: s.id, skill: s.skill, task: s.task, fit, note, canAdd: fit !== "rewrite" && fit !== "nopic" && (s.items || []).length < maxItems, canReplace: fit !== "rewrite" && fit !== "nopic" && items.length > 0, items };
  });
}

/* ── New parts for words the current parts can't hold ── */
// Vocabulary tasks a new part can use, in the order they are offered, and what each needs from the words.
const NEW_PART_TASKS = ["V-BANK", "V-MC", "V-DEF", "V-MATCH", "V-SPELL", "V-PIC"];
/** The tasks a new vocabulary part can be for this class (its fit range), the picture task only when every word has a picture. */
export function newPartTasks(levelIdx, { tasks = {}, pictures = true } = {}) {
  return NEW_PART_TASKS.filter((t) => tasks[t] && levelIdx >= tasks[t].fit[0] && levelIdx <= tasks[t].fit[1] && (t !== "V-PIC" || pictures));
}

/**
 * The order words go in when not all of them fit: the teacher's own words first, then words not on the test at all,
 * then words that only appear in a text; within each, the order of the test's word list (the unit's order).
 */
export function wordPriority(cov) {
  const rank = (w) => (w.own ? 0 : w.status === "missing" ? 1 : w.status === "seen" ? 2 : 3);
  return cov.words.map((w, i) => ({ w, i })).sort((a, b) => rank(a.w) - rank(b.w) || a.i - b.i).map((x) => x.w);
}

/**
 * New vocabulary parts for these words: one question per word, `perPart` words a part (the last part takes a short
 * remainder rather than a part of 1–2 questions). Words with pictures fill a "Look and write" part first when the
 * class suits it; the other parts take the class's word tasks in turn, preferring ones the test doesn't use yet.
 * words: [{ english, type }]. Returns [{ task, words: [english] }].
 */
export function planNewParts(words, { levelIdx = 1, tasks = {}, perPart = 8, hasPicture = () => false, used = [] } = {}) {
  const list = words.filter((w) => w?.english);
  if (!list.length) return [];
  const out = [];
  let rest = list;
  const canPic = newPartTasks(levelIdx, { tasks }).includes("V-PIC");
  const pics = canPic ? list.filter((w) => /^n/i.test(w.type || "n") && hasPicture(w.english)) : [];
  if (pics.length >= 4) {
    const take = pics.slice(0, perPart);
    out.push({ task: "V-PIC", words: take.map((w) => w.english) });
    const taken = new Set(take.map((w) => w.english));
    rest = list.filter((w) => !taken.has(w.english));
  }
  const choices = newPartTasks(levelIdx, { tasks, pictures: false });
  const fresh = [...choices.filter((t) => !used.includes(t)), ...choices.filter((t) => used.includes(t))];
  const chunks = [];
  for (let k = 0; k < rest.length; k += perPart) chunks.push(rest.slice(k, k + perPart));
  // A last part of one or two words joins the part before it (a part may have up to perPart + 2 questions).
  if (chunks.length > 1 && chunks.at(-1).length <= 2) chunks.at(-2).push(...chunks.pop());
  chunks.forEach((c, k) => out.push({ task: fresh[k % fresh.length] || "V-BANK", words: c.map((w) => w.english) }));
  return out;
}

/** True when the text has the word itself, not only a longer chosen word of its family ("baker" for "bake"). */
export function hasWord(text, word, words = []) {
  setFamily(words);
  return containsForm(text, word);
}
