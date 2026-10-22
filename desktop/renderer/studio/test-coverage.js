/* Which of a test's words the test really asks about, and where — the Test Maker's word check (like the
 * worksheets' coverage). Pure: works on a saved test doc ({ focusWords, sections }). */
import { containsForm } from "./word-scope.js";

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
    return { english: w.english, greek: w.greek || "", own: !!w.own, status, tested, seen };
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

/** True when a question uses the word (its answer, its sentence or an option). */
export function itemUses(it, word) {
  const { answer, ask, other } = itemTexts(it);
  return containsForm(answer, word) || containsForm(ask, word) || containsForm(other, word);
}

/**
 * Where a word could go, part by part, for the teacher to decide. For each part:
 *   fit: "best" (a vocabulary question tests the word itself) | "ok" (it can go in, see `note`) | "rewrite" (only by
 *   writing the part again: a writing or speaking task, or a text that doesn't use the word),
 *   canAdd (room for one more question), and its questions, each with the chosen words it is the only test of
 *   (`only`) — a question with none is safe to replace.
 * tasks: the TASKS table (answer type, needs). maxItems: the most questions a part can have.
 */
export function placementOptions(doc, words, { tasks = {}, maxItems = 12 } = {}) {
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
    if (open) { fit = "rewrite"; note = s.skill === "speaking" ? "Speaking cards have no questions — Lingo can write the part again with the word." : "A writing task has no questions — Lingo can write the part again with the word in it."; }
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
    return { part: i, id: s.id, skill: s.skill, task: s.task, fit, note, canAdd: fit !== "rewrite" && (s.items || []).length < maxItems, canReplace: fit !== "rewrite" && items.length > 0, items };
  });
}
