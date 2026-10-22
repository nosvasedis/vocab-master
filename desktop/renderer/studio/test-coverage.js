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
