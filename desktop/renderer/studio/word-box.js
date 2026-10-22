/* Vocab Master — word boxes (pure, DOM-free): the words students choose from in a gap fill, for worksheets
 * (D01, L01, L05) and tests (V-BANK, R-GAP).
 * Unless the teacher asks for extra words, a box holds exactly one word per gap: every answer once, nothing else.
 * With extra words on, it holds the answers plus exactly that many words that fit no gap, and the instruction says
 * how many ("There are two extra words you do not need."). The AI is told the same, but the box is always made
 * here, because a real run listed every unit word for seven gaps. */
import { wordFormPattern } from "./word-scope.js";

/** The most extra words a box can have (the Step 3 choices go up to 3; the worksheet tune accepts 4). */
export const MAX_EXTRA_WORDS = 4;

const words = (s) => String(s ?? "").toLowerCase().replace(/[’']/g, "'").replace(/[^a-z'\s-]/g, " ").split(/[\s-]+/).filter(Boolean);
const formCache = new Map();
function isFormOf(base, w) {
  let rx = formCache.get(base);
  if (!rx) { rx = new RegExp(`^${wordFormPattern(base)}$`); formCache.set(base, rx); }
  return rx.test(w);
}

/**
 * Two box entries are the same word when every word of one is the other's word in some form
 * (city / cities, run / ran, take off / took off). Stricter than "contains" on purpose: "art" is not "party".
 */
export function sameWord(a, b) {
  const x = words(a);
  const y = words(b);
  if (!x.length || x.length !== y.length) return false;
  return x.every((w, i) => w === y[i] || isFormOf(w, y[i]) || isFormOf(y[i], w));
}

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/** One entry per word (the first form wins), empty entries dropped. */
export function uniqueWords(list) {
  const out = [];
  for (const w of (list || []).map(clean)) if (w && !out.some((x) => sameWord(x, w))) out.push(w);
  return out;
}

/** True when the box gives the answers away: they appear in it in the order of the gaps. */
export function inAnswerOrder(list, answers) {
  const a = (answers || []).filter(Boolean);
  if (!list?.length || a.length < 2) return false;
  let at = 0;
  for (const ans of a) {
    while (at < list.length && !sameWord(list[at], ans)) at++;
    if (at >= list.length) return false;
    at++;
  }
  return true;
}

function shuffled(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * The box for one exercise.
 * bank: the words the AI (or the teacher) gave · answers: what each gap needs, in gap order · extras: how many
 * words that fit no gap · keep: extra words the box had before (kept first, so fixing one question doesn't
 * change them) · spare: words to fall back on when the AI gave too few extras (other words of the unit) ·
 * exclude: words that are neither answers nor extras (the example's answer) · asIs: the teacher typed this box —
 * keep every word of it (the answers are still added) instead of trimming it to `extras`.
 * Returns { words, extraWords, short }: short = how many extra words were asked for but couldn't be found.
 * A box that already holds exactly these words, not in answer order, keeps its order (renders stay the same).
 */
export function fitWordBox({ bank = [], answers = [], extras = 0, keep = [], spare = [], exclude = [], asIs = false, rand = Math.random } = {}) {
  const need = uniqueWords(answers);
  const given = uniqueWords(bank);
  const isAnswer = (w) => need.some((a) => sameWord(a, w));
  const excluded = (w) => (exclude || []).some((x) => clean(x) && sameWord(x, w));
  // The answers in the form the gaps need: students find exactly what they write.
  const out = [...need];
  const extraWords = [];
  const take = (w) => {
    if (!w || isAnswer(w) || excluded(w) || out.some((x) => sameWord(x, w))) return false;
    out.push(w);
    extraWords.push(w);
    return true;
  };
  const want = asIs ? Infinity : Math.max(0, Math.min(MAX_EXTRA_WORDS, Math.round(Number(extras) || 0)));
  if (asIs) given.forEach(take);
  else if (want) {
    // The words it had before first, then the AI's (it lists its extra words after the answers, so from the end).
    for (const w of [...uniqueWords(keep), ...[...given].reverse(), ...uniqueWords(spare)]) {
      if (extraWords.length >= want) break;
      take(w);
    }
  }
  const short = asIs ? 0 : Math.max(0, want - extraWords.length);
  const sameSet = given.length === out.length && given.every((w) => out.includes(w));
  let list = sameSet ? given : shuffled(out, rand);
  for (let t = 0; t < 12 && list.length > 1 && inAnswerOrder(list, answers); t++) list = shuffled(out, rand);
  if (list.length > 1 && inAnswerOrder(list, answers)) list = [...out].reverse();
  return { words: list, extraWords, short };
}

/** How many words of a box fit no gap. */
export function countExtraWords(bank, answers, exclude = []) {
  return uniqueWords(bank).filter((w) => !(answers || []).some((a) => sameWord(a, w)) && !(exclude || []).some((x) => clean(x) && sameWord(x, w))).length;
}

/** Gaps that need a word an earlier gap already needs: [{ n, first, answer }] (n and first are 1-based). */
export function repeatedAnswers(answers) {
  const out = [];
  (answers || []).forEach((a, i) => {
    if (!clean(a)) return;
    const j = answers.findIndex((b, k) => k < i && clean(b) && sameWord(a, b));
    if (j >= 0) out.push({ n: i + 1, first: j + 1, answer: clean(a) });
  });
  return out;
}

const EN_NUM = ["no", "one", "two", "three", "four", "five", "six"];
const EL_NUM = ["καμία", "μία", "δύο", "τρεις", "τέσσερις", "πέντε", "έξι"];

/** The instruction's extra-words sentence ("" for none). */
export function extraWordsLine(n, lang = "en") {
  const k = Math.max(0, Math.round(Number(n) || 0));
  if (!k) return "";
  if (lang === "el") return k === 1 ? "Υπάρχει μία λέξη που δεν χρειάζεσαι." : `Υπάρχουν ${EL_NUM[k] || k} λέξεις που δεν χρειάζεσαι.`;
  return k === 1 ? "There is one extra word you do not need." : `There are ${EN_NUM[k] || k} extra words you do not need.`;
}

// Any earlier sentence about extra words (the app's own, or one the AI wrote), so it is never said twice or wrongly.
const EN_EXTRA = /\s*(?:\(\s*)?(?:there\s+(?:is|are)\s+(?:an?|no|one|two|three|four|five|six|\d+)\s+(?:extra|more)\s+words?|(?:you\s+(?:do\s+not|don['’]t)\s+need\s+(?:all|every|one|two|three|four|\d+)\s+(?:of\s+)?(?:the\s+)?words?))[^.!)]*[.!]?\s*\)?/gi;
const EL_EXTRA = /\s*Υπάρχ(?:ει|ουν)\s+[^.]*?(?:δεν\s+(?:θα\s+)?χρειάζ\S*|περισσ\S*)[^.]*\.?/g;

/** An instruction with the right extra-words sentence for a box with n extra words (and no other such sentence). */
export function withExtraWords(text, n, lang = "en") {
  const base = String(text || "").replace(lang === "el" ? EL_EXTRA : EN_EXTRA, " ").replace(/\s+/g, " ").trim();
  const line = extraWordsLine(n, lang);
  if (!line) return base;
  if (!base) return line;
  return `${/[.!?:]$/.test(base) ? base : `${base}.`} ${line}`;
}
