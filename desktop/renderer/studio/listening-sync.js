/* Vocab Master — does a listening part's recording still fit its questions? (pure)
 * The audio is read by the app's voices from the part's script, so "the recording" is the script. A script is written
 * for a set of questions: `section.scriptFor` keeps a key per question it was written for (the example too). A question
 * added or changed since then is checked against the script; one whose answer the script doesn't say means the
 * recording must be made again (scriptPrompt in test-builder.js). Questions taken out leave extra details, which are
 * fine (Cambridge recordings have distractors) — except in "Listen for the main idea", where each question has its own
 * numbered recording: that one is cut out and the rest renumbered (cutGistRecording), no AI needed. */

const squash = (s) => String(s ?? "").toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9':]+/g, " ").trim();

/** One question as a key: what it asks and its answer (options in any order — the app shuffles them). */
export function itemKey(it) {
  if (!it) return "";
  const opts = (it.options || []).map(squash).filter(Boolean).sort().join("/");
  return `${squash(it.prompt)}|${squash(it.answer)}|${opts}`;
}

/** The keys of the questions a script is written for (the example first, "" when there is none). */
export const scriptKeys = (section) => [itemKey(section?.example), ...(section?.items || []).map(itemKey)];

const NUM = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
/** 12 → "twelve", 45 → "forty five" (how a number is said; to 99). */
function numberWords(n) {
  if (n < 20) return NUM[n];
  if (n < 100) return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${NUM[n % 10]}` : ""}`;
  return "";
}
const STOP = new Set("a an the to of in on at for and or is are was were be it its with his her their my your our by from that this these those".split(" "));

/** The script as one plain string, with numbers also as words (so "12" is found in "twelve" and the other way round). */
function scriptText(script) {
  const text = squash((script || []).map((l) => l.text).join(" "));
  return ` ${text.replace(/\b(\d{1,2})\b/g, (m, d) => `${d} ${numberWords(Number(d))}`).replace(/-/g, " ")} `;
}
/** A word (or "12", "9:30", "T-O-M") is said: whole word, a plural, or spelled letter by letter. */
function says(text, word) {
  const w = squash(word);
  if (!w) return true;
  const alts = new Set([w, w.replace(/s$/, ""), `${w}s`, `${w}es`, w.replace(/ies$/, "y")]);
  if (/^\d{1,2}$/.test(w)) alts.add(numberWords(Number(w)));
  const time = w.match(/^(\d{1,2}):(\d{2})$/);
  if (time) { alts.add(time[1]); alts.add(numberWords(Number(time[1]))); }
  if (/^[a-z]{2,12}$/.test(w)) alts.add(w.split("").join(" "));
  return [...alts].some((a) => a && text.includes(` ${a} `));
}
const contentWords = (s) => squash(s).split(" ").filter((w) => w.length > 2 && !STOP.has(w));

/**
 * Is the question's answer said in the script? true (found), false (certainly not: a word answer or a picture word
 * that is never said), null (can't tell from the words alone: a choice said in other words, a yes/no statement,
 * the main idea).
 */
export function answerHeard(section, it, text = scriptText(section?.script)) {
  if (!it) return true;
  const task = section?.task;
  if (task === "L-GIST") return null;
  if (section?.answerType === "tf") return it.evidence && squash(text).includes(squash(it.evidence)) ? true : null;
  if (section?.answerType === "word" || task === "L-PIC") {
    const words = squash(it.answer).split(" ").filter(Boolean);
    return words.length ? words.every((w) => says(text, w)) : true;
  }
  const words = contentWords(it.answer);
  if (!words.length) return null;
  const found = words.filter((w) => says(text, w)).length;
  if (found === words.length) return true;
  return section?.answerType === "match" && found >= Math.ceil(words.length / 2) ? true : null;
}

/**
 * Where a listening part's recording stands.
 * { missing: [n] — questions added or changed whose answer the script doesn't say,
 *   unsure: [n] — questions added or changed that can't be checked from the words (the teacher should listen or remake),
 *   dropped: number of questions taken out since the recording was written,
 *   stale: true when the recording must be made again }
 * A part with no `scriptFor` (made before this was kept) is taken as fitting. null when the part has no recording.
 */
export function recordingState(section) {
  if (section?.skill !== "listening" || !section.script?.length) return null;
  const stamp = Array.isArray(section.scriptFor) ? new Set(section.scriptFor) : null;
  const text = scriptText(section.script);
  const missing = [];
  const unsure = [];
  for (const it of section.items || []) {
    if (!stamp || stamp.has(itemKey(it))) continue;
    const heard = answerHeard(section, it, text);
    if (heard === false) missing.push(it.n);
    else if (heard === null) unsure.push(it.n);
  }
  const now = new Set(scriptKeys(section));
  const dropped = stamp ? [...stamp].filter((k) => k && !now.has(k)).length : 0;
  return { missing, unsure, dropped, stale: missing.length > 0 || unsure.length > 0 };
}

/** The questions of a script the teacher typed whose answer it certainly doesn't say: [{ n, answer }]. */
export function unheardAnswers(section) {
  const text = scriptText(section?.script);
  return (section?.items || []).filter((it) => answerHeard(section, it, text) === false).map((it) => ({ n: it.n, answer: it.answer }));
}

/** The script now fits every question (after the teacher or Lingo wrote it again). */
export function stampRecording(section) {
  if (section?.script?.length) section.scriptFor = scriptKeys(section);
  return section;
}

/** Questions Lingo wrote from the script ("answerable from the script") count as fitting it. */
export function trustItems(section, ns = []) {
  if (!Array.isArray(section?.scriptFor)) return section;
  const add = ns.map((n) => itemKey(section.items?.[n - 1])).filter(Boolean);
  section.scriptFor = [...new Set([...section.scriptFor, ...add])];
  return section;
}

const MARK = /^(?:example|number\s+(\d+|[a-z]+))\b/i;
const isMark = (l) => /^narrator$/i.test(l?.speaker || "") && MARK.test(String(l?.text || "").trim());

/**
 * "Listen for the main idea": every question has its own short recording, opened by the Narrator ("Example.",
 * "Number 1." …). Taking question n out cuts its recording and renumbers the ones after it. Returns the new script,
 * or null when the script isn't laid out that way (then it stays as it is).
 */
export function cutGistRecording(script, n) {
  const lines = Array.isArray(script) ? script : [];
  const starts = lines.map((l, i) => (isMark(l) && !/^example\b/i.test(l.text.trim()) ? i : -1)).filter((i) => i >= 0);
  if (n < 1 || starts.length < n) return null;
  const from = starts[n - 1];
  const to = starts[n] ?? lines.length;
  let k = 0;
  return lines.filter((_, i) => i < from || i >= to).map((l) => (isMark(l) && !/^example\b/i.test(l.text.trim()) ? { ...l, text: `Number ${++k}.` } : l));
}
