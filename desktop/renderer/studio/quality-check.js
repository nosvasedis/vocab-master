/* Vocab Master — worksheet word coverage (pure, DOM-free).
 * Which unit words each sheet really tests (the Word coverage card, the word finder, an exercise's word list).
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
 * The unit words of one worksheet exercise, for its settings' "Words in this exercise" panel (from the word check).
 * sheet: "dictation" | "lingo"; exercise: its number.
 * here: { english, lines: [line numbers], only: no other exercise on this sheet tests it };
 * others: the words it doesn't test, the ones this sheet doesn't test at all first —
 *   { english, status: "missing" (neither sheet) | "other" (only the other sheet) | "tested" (elsewhere on this sheet) }.
 */
export function exerciseWords(data, sheet, exercise) {
  const cov = wordCoverage(data);
  const other = sheet === "dictation" ? "lingo" : "dictation";
  const here = [];
  const others = [];
  for (const w of cov.words) {
    const mine = (w[sheet] || []).filter((a) => a.exercise === exercise);
    if (mine.length) {
      here.push({ english: w.head, lines: [...new Set(mine.map((a) => a.item))].sort((a, b) => a - b), only: !(w[sheet] || []).some((a) => a.exercise !== exercise) });
    } else {
      const status = (w[sheet] || []).length ? "tested" : (w[other] || []).length ? "other" : "missing";
      others.push({ english: w.head, status });
    }
  }
  const rank = { missing: 0, other: 1, tested: 2 };
  here.sort((a, b) => a.lines[0] - b.lines[0]);
  others.sort((a, b) => rank[a.status] - rank[b.status]);
  return { here, others, total: cov.words.length };
}
