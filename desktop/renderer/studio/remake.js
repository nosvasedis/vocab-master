/* Vocab Master — remaking one question or one line with the AI, so that what the teacher asks for really happens
 * (pure). A wish ("another word", "use the word island", "shorter", "better wrong options", or nothing = surprise me)
 * becomes precise instructions built from the question itself — which word it is built on, what the other questions
 * already use — and the same wish becomes checks on the AI's answer. A reply that ignores the wish is sent back with
 * the reason (remakeProblems → retry hint), instead of being accepted.
 *
 * Works for test questions ({ prompt, options, answer }) and worksheet lines ({ prompt, answer, stem }). */
import { containsForm } from "./word-scope.js";

const STOP = new Set(`a an the some any much many few little lot lots of no not none every each all both either neither
is are am was were be been being do does did done don't doesn't didn't isn't aren't wasn't weren't can can't cannot could couldn't
will won't would wouldn't shall should shouldn't must mustn't may might have has had haven't hasn't hadn't to too also very so
in on at by for from with without into onto about over under up down out off near after before than then there here
and or but if because when while where what who whom whose which why how that this these those it its it's
i me my mine you your yours he him his she her hers we us our ours they them their theirs myself yourself
one ones there's let's s t d ll re ve m yes ok please just only really
well always never often sometimes usually today now again still already yet soon later quite more most less`.split(/\s+/));

const words = (text) => String(text || "").toLowerCase().replace(/_{2,}/g, " ").match(/[a-z]+(?:['’-][a-z]+)*/g) || [];
const content = (text) => words(text).filter((w) => !STOP.has(w) && w.length > 1);

/** The forms of a word to look for: medicine → medicine, medicines; city → cities; boxes → box. */
export function wordForms(w) {
  const s = String(w || "").toLowerCase().trim();
  if (!s) return [];
  const out = new Set([s]);
  if (/[^aeiou]y$/.test(s)) out.add(`${s.slice(0, -1)}ies`);
  if (/(s|x|z|ch|sh)$/.test(s)) out.add(`${s}es`);
  out.add(`${s}s`);
  if (/ies$/.test(s)) out.add(`${s.slice(0, -3)}y`);
  if (/(ses|xes|zes|ches|shes)$/.test(s)) out.add(s.slice(0, -2));
  if (/[^s]s$/.test(s) && s.length > 3) out.add(s.slice(0, -1));
  return [...out];
}

/**
 * The word(s) a question is built on. For a choice question it is what all the options share
 * ("a medicine / any medicine / some medicine" → medicine); otherwise the answer's content words; a question
 * whose answer is only grammar ("can't", "some") is built on the content words of its sentence.
 */
export function testedWords(item) {
  const opts = (item?.options || []).filter(Boolean);
  if (opts.length >= 2) {
    const sets = opts.map((o) => new Set(content(o)));
    const shared = [...sets[0]].filter((w) => sets.every((s) => s.has(w)));
    if (shared.length) return shared;
  }
  const ans = content(item?.answer);
  if (ans.length) return ans.slice(0, 3);
  if (item?.stem) return content(item.stem).slice(0, 2);
  // Grammar-only answer: the nouns and verbs of the sentence carry the question.
  return content(item?.prompt).sort((a, b) => b.length - a.length).slice(0, 2);
}

/** The situation words of the sentence (doctor, cough) — a new question should not reuse them either. */
export const contextWords = (item) => {
  const tested = new Set(testedWords(item));
  return [...new Set(content(item?.prompt).filter((w) => !tested.has(w)))].slice(0, 6);
};

/** What the teacher's wish asks for (the quick chips and typed words, English or Greek). */
export function readWish(wish = "") {
  const t = String(wish).toLowerCase();
  const use = t.match(/\buse (?:the |a )?(?:word |noun |verb |phrase )?["“'‘]?([a-z][a-z'’ -]{1,30}?)["”'’]?\s*(?:$|[,.;!]| instead| in | for | as )/);
  return {
    anotherWord: /\b(another|different|other|new)\s+(word|noun|verb|adjective|item|vocabulary)\b|\bchange the (word|noun)\b|not (the same|this) word|άλλη λέξη|διαφορετική λέξη|άλλη λεξη/.test(t),
    use: use && !/^(a|the|another|different|other|same|it)$/.test(use[1].trim()) ? use[1].trim() : "",
    keepWord: /\bkeep (the |this )?(same )?word\b|\bsame word\b|ίδια λέξη/.test(t),
    shorter: /\bshort(er)?\b|simpler sentence|fewer words|πιο σύντομ|μικρότερ/.test(t),
    options: /\b(wrong|other) options?\b|distractors?|choices? (better|harder|closer)|better options|πιο δύσκολες επιλογές/.test(t),
    easier: /\beasier\b|πιο εύκολ/.test(t),
    harder: /\bharder\b|more difficult|πιο δύσκολ/.test(t),
    text: String(wish || "").trim(),
  };
}

const quote = (list) => list.map((w) => `"${w}"`).join(", ");
const show = (it) => `"${it.prompt || ""}"${it.options?.length ? ` [${it.options.join(" | ")}]` : ""}${it.answer ? ` → ${it.answer}` : ""}`;

/**
 * Instructions and checks for remaking one item.
 * ctx: { wish, item, siblings: [items of the same exercise], candidates: [words the class knows], kind: "question" | "line" }
 * Returns { instruction, checks }.
 */
export function remakePlan({ wish = "", item, siblings = [], candidates = [], kind = "question" } = {}) {
  const w = readWish(wish);
  const tested = testedWords(item);
  const ctxWords = contextWords(item);
  const usedElsewhere = [...new Set(siblings.flatMap((s) => testedWords(s)))];
  const banned = w.anotherWord || !w.text ? tested : [];
  const pool = [...new Set(candidates.map((c) => String(c?.english ?? c).trim()).filter(Boolean))]
    .filter((c) => !wordForms(tested[0] || "").includes(c.toLowerCase()) && !tested.includes(c.toLowerCase()) && !usedElsewhere.includes(c.toLowerCase()))
    .slice(0, 14);
  const lines = [`CURRENT VERSION (being replaced — the new ${kind} must clearly differ from it): ${show(item)}`];
  if (w.text) lines.push(`THE TEACHER ASKED: "${w.text}". Do exactly that.`);
  if (w.anotherWord) {
    lines.push(`It is built on the word ${quote(tested)}. The new ${kind} MUST be built on a DIFFERENT word: do not use ${quote(tested.flatMap(wordForms))} anywhere — not in the sentence, not in the options, not in the answer. Use a new sentence too (avoid ${quote(ctxWords) || "the same situation"}).`);
    lines.push(pool.length ? `Pick the new word from these (they fit this class): ${pool.join(", ")} — or another word the class knows that fits what this part tests.` : "Pick another word the class knows that fits what this part tests.");
  } else if (!w.text) {
    lines.push(`Write a completely new ${kind}: a new sentence and a different word than ${quote(tested)}${ctxWords.length ? `, in a new situation (not ${quote(ctxWords)})` : ""}.${pool.length ? ` Words you could use: ${pool.join(", ")}.` : ""}`);
  }
  if (w.keepWord && !w.anotherWord) lines.push(`Keep the word ${quote(tested)}, but write a new sentence in a new situation (not ${quote(ctxWords) || "the same one"}).`);
  if (w.use) lines.push(`The new ${kind} MUST use the word "${w.use}".`);
  if (w.shorter) lines.push(`Make the sentence clearly shorter: now it has ${words(item?.prompt).length} words; use at most ${Math.max(4, words(item?.prompt).length - 3)}.`);
  if (w.options && item?.options?.length) lines.push("Write NEW wrong options: each one tempting for this class (a real learner mistake or a close word of the same kind), still clearly wrong. Keep the right answer correct.");
  if (w.easier) lines.push("Make it easier for this class: a shorter, more familiar sentence and wrong options that are easier to rule out.");
  if (w.harder) lines.push("Make it harder: the wrong options closer to the right one; one detail decides.");
  if (usedElsewhere.length) lines.push(`The other ${kind}s already use ${quote(usedElsewhere.slice(0, 12))} — do not test those words again.`);
  lines.push(`It must still test the same thing as this part (the same grammar point or skill) in the same format.`);
  return {
    instruction: lines.join("\n"),
    checks: { banned: [...new Set(banned.flatMap(wordForms))], use: w.use || (w.keepWord && !w.anotherWord ? tested[0] || "" : ""), shorter: w.shorter ? words(item?.prompt).length : 0, options: w.options, differ: !w.options || w.anotherWord || !w.text },
  };
}

const jaccard = (a, b) => {
  const A = new Set(content(a));
  const B = new Set(content(b));
  if (!A.size && !B.size) return 1;
  return [...A].filter((x) => B.has(x)).length / new Set([...A, ...B]).size;
};

/** What a remade item got wrong against the wish (empty = fine). The reasons go back to the AI as a retry hint. */
export function remakeProblems(before, after, checks = {}) {
  if (!after) return ["no new item came back"];
  const out = [];
  const all = words(`${after.prompt || ""} ${(after.options || []).join(" ")} ${after.answer || ""} ${after.stem || ""}`);
  const hit = (checks.banned || []).filter((b) => (b.includes(" ") ? all.join(" ").includes(b) : all.includes(b)));
  if (hit.length) out.push(`it still uses ${quote([...new Set(hit)])} — the teacher asked for a different word, so use none of them`);
  // Any form of the word counts (city → cities, live → lives); a phrase may be split ("pick it up").
  if (checks.use && !all.join(" ").includes(checks.use.toLowerCase()) && !containsForm(all.join(" "), checks.use)) out.push(`it does not use the word "${checks.use}"`);
  if (checks.answer && !containsForm(String(after.answer || ""), checks.answer)) out.push(`"${checks.answer}" is not the right answer — the question must test that word, so it must be the answer`);
  if (checks.shorter && words(after.prompt).length >= checks.shorter) out.push(`it is not shorter (it has ${words(after.prompt).length} words; it must have fewer than ${checks.shorter})`);
  if (checks.options && before?.options?.length) {
    const oldWrong = new Set(before.options.filter((o) => o !== before.answer).map((o) => o.toLowerCase()));
    const newWrong = (after.options || []).filter((o) => o !== after.answer).map((o) => o.toLowerCase());
    if (newWrong.every((o) => oldWrong.has(o))) out.push("the wrong options are the same as before");
  }
  if (checks.differ) {
    const same = String(before?.prompt || "").trim().toLowerCase() === String(after.prompt || "").trim().toLowerCase() && String(before?.answer || "").toLowerCase() === String(after.answer || "").toLowerCase();
    if (same || jaccard(before?.prompt, after.prompt) >= 0.75) out.push("it is almost the same as before — write a really different one");
  }
  return out;
}

/** The retry hint for the AI after a reply that ignored the wish. */
export const remakeRetryHint = (problems) => `Your last answer was not accepted: ${problems.join("; ")}. Follow THE TEACHER ASKED and the MUST rules exactly this time.`;
