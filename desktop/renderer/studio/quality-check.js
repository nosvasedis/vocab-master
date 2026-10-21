/* Vocab Master — worksheet quality check (pure, DOM-free).
 * Which unit words each sheet really tests, and whether the Dictation has room for the ones it misses.
 * A word counts as tested only when a line makes students write or choose it: it is the answer (in any
 * form: introduce → introduced), or the line lists it in testsWords AND shows it (matching, odd one out).
 * Matching is by whole words, so "room" never stands in for "bedroom" and "time" never for "spend time". */

import { containsForm, answerParts } from "./word-scope.js";

const textOf = (x) => (typeof x === "string" ? x : x?.text || x?.english || "");
const listOf = (v) => (Array.isArray(v) ? v.map(textOf) : String(v || "").split(/[,;]+/).map((s) => s.replace(/\([^)]*\)/g, "").split(/\s+-\s+/)[0]))
  .map((s) => String(s || "").trim()).filter((s) => /[a-z]/i.test(s));

/** One family per headword: the word itself, then its listed derivatives (same family), synonyms and opposites. */
export function wordFamilies(vocab = []) {
  return (vocab || []).filter((v) => String(v?.english || "").trim()).map((v) => ({
    head: String(v.english).trim(),
    forms: listOf(v.derivatives),
    synonyms: listOf(v.synonyms),
    antonyms: listOf(v.antonyms),
  }));
}

/** The words a line shows students (prompt, stem and the answer once the gap is filled). */
function shownText(item) {
  const answer = String(item?.answer ?? "");
  const prompt = String(item?.prompt ?? "");
  const filled = /_{2,}/.test(prompt) && answer && !/^[A-Za-z]$/.test(answer.trim()) ? prompt.replace(/_{2,}/, answer) : prompt;
  return [filled, item?.stem || "", answer].join(" \n ");
}

/** Does this line test `term` (a word or phrase)? */
export function lineTestsTerm(item, term) {
  if (!item || !term) return false;
  const answers = answerParts(item.answer);
  if (answers.some((a) => containsForm(a, term))) return true;
  const words = String(term).toLowerCase().split(/[^a-z']+/).filter((w) => w.length > 2);
  // A phrase with one word in the gap: "________ time with friends" → spend.
  if (words.length > 1 && answers.some((a) => words.some((w) => containsForm(a, w))) && containsForm(shownText(item), term)) return true;
  const declared = (item.testsWords || []).some((t) => containsForm(t, term) || containsForm(term, t));
  return declared && containsForm(shownText(item), term);
}

/** Which family members a line tests: "head" (the word or a derivative), or the synonym/opposite it uses. */
function lineTestsFamily(item, fam) {
  if (lineTestsTerm(item, fam.head)) return fam.head;
  for (const f of fam.forms) if (lineTestsTerm(item, f)) return f;
  return null;
}

const sheetLists = (data) => ({
  dictation: data?.dictation?.exercises || [],
  lingo: data?.lingoLauncher?.practice || [],
});

/**
 * Where each unit word is tested.
 * Returns { words: [{ head, related, dictation: [{exercise, item, typeId, via}], lingo: [...] }], missing: [heads not in the Dictation] }
 */
export function wordCoverage(data) {
  const fams = wordFamilies(data?.lingoLauncher?.vocabulary || []);
  const lists = sheetLists(data);
  const words = fams.map((fam) => {
    const where = { dictation: [], lingo: [] };
    for (const sheet of ["dictation", "lingo"]) {
      for (const ex of lists[sheet]) {
        for (const item of ex.items || []) {
          const via = lineTestsFamily(item, fam);
          if (via) where[sheet].push({ exercise: ex.number, item: item.number, typeId: ex.typeId, via });
        }
      }
    }
    return { head: fam.head, related: [...fam.forms, ...fam.synonyms, ...fam.antonyms], ...where };
  });
  return { words, missing: words.filter((w) => !w.dictation.length).map((w) => w.head) };
}

/**
 * How many more words the Dictation can take without breaking its size: lines that test no unit word or only
 * words another line tests too (spare — can be rewritten), plus lines each exercise may still add (up to maxLines).
 */
export function dictationRoom(data, coverage, maxLines) {
  const exercises = sheetLists(data).dictation;
  const tests = new Map(); // "ex:item" → heads it tests
  for (const w of coverage.words) {
    for (const at of w.dictation) {
      const key = `${at.exercise}:${at.item}`;
      if (!tests.has(key)) tests.set(key, []);
      tests.get(key).push(w.head);
    }
  }
  const count = new Map(coverage.words.map((w) => [w.head, new Set(w.dictation.map((a) => `${a.exercise}:${a.item}`)).size]));
  const spare = [];
  let lines = 0;
  for (const ex of exercises) {
    for (const item of ex.items || []) {
      lines++;
      const heads = tests.get(`${ex.number}:${item.number}`) || [];
      if (heads.every((h) => count.get(h) > 1)) {
        heads.forEach((h) => count.set(h, count.get(h) - 1));
        spare.push({ exercise: ex.number, item: item.number, typeId: ex.typeId, repeats: heads });
      }
    }
  }
  const addable = exercises
    .map((ex) => ({ exercise: ex.number, typeId: ex.typeId, free: Math.max(0, (maxLines || 0) - (ex.items?.length || 0)) }))
    .filter((a) => a.free > 0);
  const room = spare.length + addable.reduce((n, a) => n + a.free, 0);
  return { lines, spare, addable, room, short: Math.max(0, coverage.missing.length - room) };
}

/** Exercise types whose lines are not sentences (word groups, matching, categories, letter puzzles). */
export const NOT_SENTENCE_TYPES = new Set(["D11", "D13", "D16", "D26", "D27"]);

/** Longest a dictation sentence may be before the check flags it: the class limit with some leeway. */
export function sentenceLimit(maxWords) {
  return Math.round((maxWords || 10) * 1.35);
}

/* ── Teacher-facing wording ──────────────────────────────────────── */

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** "Dictation 2 · line 3" for an item issue. */
export function lineLabel(t) {
  return `${t.sheet === "lingo" ? "Lingo" : "Dictation"} ${t.exercise} · line ${t.item}`;
}

/** The reason an item issue gives, said for a teacher (the raw text is written for the AI fixer). */
export function friendlyReason(reason = "") {
  const r = String(reason).trim();
  let m;
  if ((m = r.match(/^sentence is (\d+) words — keep it to about (\d+)/i))) return `too long to dictate (${m[1]} words; about ${m[2]} suits this class)`;
  if ((m = r.match(/^prompt reveals answer "([^"]+)"/i))) return `the answer “${m[1]}” is already printed in the line`;
  if ((m = r.match(/riddle gives away answer "([^"]+)"/i))) return `the riddle gives away “${m[1]}”`;
  if ((m = r.match(/^answer "([^"]+)" is not a word from this unit's list/i))) return `the answer “${m[1]}” isn't one of this unit's words`;
  if ((m = r.match(/so the answer is "([^"]+)" — the key needs a mix of (\S+) and (\S+)/i))) return `the key needs a mix of ${m[2]} and ${m[3]} — rewrite so the answer is ${m[1]}`;
  if ((m = r.match(/^copies vocabulary collocation "([^"]+)"/i))) return `copies the word table's phrase “${m[1]}”`;
  if ((m = r.match(/^same sentence as Dictation (\d+) line (\d+)/i))) return `same sentence as Dictation ${m[1]}, line ${m[2]}`;
  if (/^needs bracketed choices/i.test(r)) return "needs choices in brackets (a / b / c)";
  if (/sentence needs a _+ gap|needs a _+ gap|phrase needs a _+ gap/i.test(r)) return "has no gap to fill";
  if (/must contain a mistake/i.test(r)) return "the sentence has no mistake to correct";
  return cap(r.replace(/\s+—\s+e\.g\..*$/i, ""));
}
