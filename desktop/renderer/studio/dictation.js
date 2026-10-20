/* Vocab Master — dictation maker (pure): settings, prompt, offline book sentences and the printable doc.
 * Styles: classic, gapped, running, dictogloss, picture (docs/research/exercise-design.md).
 * Defaults follow the class level (studio/levels.js); every target is a word from the teacher's list. */
import { DICTATION_DEFAULTS, DIFFICULTY, sentenceRange } from "./levels.js";
import { DICTATION_STYLES } from "./tasks.js";
import { containsForm, wordFormPattern, allowedTerms } from "./word-scope.js";
import { newDocId, LETTERS } from "./doc-model.js";

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
export const countWords = (s) => clean(s).split(" ").filter((w) => /[A-Za-z0-9]/.test(w)).length;
const hasGreek = (s) => /[Ͱ-Ͽἀ-῿]/.test(String(s || ""));

function shuffled(arr, rand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Settings for a class level (the teacher can change every one). */
export function dictationDefaults(levelId = "B_SENIOR") {
  const d = DICTATION_DEFAULTS[levelId] || DICTATION_DEFAULTS.B_SENIOR;
  return {
    levelId,
    style: d.style,
    count: d.count,
    length: "level",
    difficulty: "level",
    targets: d.targets,
    gapsPerSentence: d.gapsPerSentence,
    textWords: d.textWords,
    repeats: d.repeats,
    punctuationAloud: d.punctuationAloud,
    grammar: [],
    topic: "",
    source: "ai",
    greek: ["A_SENIOR", "B_SENIOR", "C_SENIOR"].includes(levelId),
    pictures: true,
    answerKey: true,
  };
}

/** Replace the target words (any inflected form) with gaps: { gapped, answers }. At most `max` gaps. */
export function maskTargets(text, targets = [], max = 2) {
  let gapped = String(text || "");
  const answers = [];
  for (const t of targets) {
    if (answers.length >= max) break;
    const words = String(t).toLowerCase().replace(/\([^)]*\)/g, " ").split(/[^a-z']+/).filter(Boolean);
    if (!words.length) continue;
    const rx = words.length === 1
      ? new RegExp(`(?<![A-Za-z])${wordFormPattern(words[0])}(?![A-Za-z])`, "i")
      : new RegExp(words.map((w) => `(?<![A-Za-z])${wordFormPattern(w)}(?![A-Za-z])`).join("[\\s-]+"), "i");
    const m = gapped.match(rx);
    if (!m) continue;
    answers.push(m[0]);
    gapped = gapped.slice(0, m.index) + "________" + gapped.slice(m.index + m[0].length);
  }
  return { gapped, answers };
}

/** A connected text cut into wall strips of roughly 8–14 words, at sentence breaks where possible. */
export function splitStrips(text, target = 12) {
  const sentences = clean(text).match(/[^.!?]+[.!?]+["”’)]*|[^.!?]+$/g) || [];
  const strips = [];
  let cur = "";
  for (const s of sentences.map(clean)) {
    if (cur && countWords(cur) + countWords(s) > target + 3) { strips.push(cur); cur = s; } else cur = clean(`${cur} ${s}`);
  }
  if (cur) strips.push(cur);
  return strips;
}

/**
 * Free, offline sentences: the official example sentence of each chosen word (from the coursebook word lists),
 * kept when its length suits the class. Returns [{ text, targets }].
 */
export function bookSentences(spec, words, rand = Math.random) {
  const [min, max] = sentenceRange(spec.levelId, spec.length, spec.difficulty);
  const pool = shuffled(words.filter((w) => w.example && containsForm(w.example, w.english)), rand);
  const fits = pool.filter((w) => { const n = countWords(w.example); return n >= min - 1 && n <= max + 2; });
  const rest = pool.filter((w) => !fits.includes(w)).sort((a, b) => Math.abs(countWords(a.example) - (min + max) / 2) - Math.abs(countWords(b.example) - (min + max) / 2));
  // The teacher's own words come first: they were added on purpose.
  const ordered = [...fits, ...rest];
  return [...ordered.filter((w) => w.own), ...ordered.filter((w) => !w.own)].slice(0, spec.count).map((w) => ({ text: clean(w.example), targets: [w.english] }));
}

/** System and user prompts for one AI call (small: only the chosen words travel). */
export function dictationPrompt(spec, words, { profileBlock = "", pictureWords = [], avoid = [] } = {}) {
  const [min, max] = sentenceRange(spec.levelId, spec.length, spec.difficulty);
  const style = DICTATION_STYLES[spec.style] || DICTATION_STYLES.classic;
  const connected = spec.style === "dictogloss" || spec.style === "running";
  const targetList = (spec.style === "picture" ? words.filter((w) => pictureWords.includes(w.english)) : words)
    .map((w) => `${w.english}${w.type ? ` (${w.type})` : ""}${w.greek ? ` = ${w.greek}` : ""}`);
  const system = `You write dictation material for Greek children learning English in a language school (φροντιστήριο).
Return ONLY valid JSON. No markdown.
${profileBlock}

JSON: { "title": "short title", "sentences": [ { "text": "one sentence", "targets": ["unit word used"] } ]${connected ? ', "text": "the connected text"' : ""} }`;
  const rules = [
    `Dictation style: ${style.label} — ${style.hint}`,
    connected
      ? `Write ONE connected text of about ${spec.textWords} words (${Math.max(3, Math.round(spec.textWords / max))}–${Math.max(4, Math.ceil(spec.textWords / min))} sentences, each ${min}–${max} words) in "text", and put the same sentences, in order, in "sentences".`
      : `Write exactly ${spec.count} sentences, each ${min}–${max} words long.`,
    spec.style === "picture"
      ? "Each sentence uses exactly ONE target word, a different one each time; it must be easy to picture."
      : `Each sentence uses ${spec.targets === 1 ? "one target word" : `${spec.targets} target words`} from the list (list them in "targets"). Use as many different target words as you can.`,
    `Target words (a word may be inflected to fit: plural, -s, -ed, -ing): ${targetList.join("; ")}`,
    "Every other word must be one this class already knows. No new vocabulary, no difficult names (use Tom, Anna, Mia, Leo, Nick, Eleni).",
    `Difficulty: ${DIFFICULTY[spec.difficulty]?.note || DIFFICULTY.level.note}`,
    spec.grammar?.length ? `Grammar focus — use it naturally in most sentences: ${spec.grammar.join(", ")}.` : "Grammar: what the class level already knows.",
    spec.topic ? `Context / topic: ${spec.topic}` : "Context: one familiar situation for children, so the sentences make sense together.",
    "Simple punctuation only (full stops, commas, question marks, apostrophes). No Greek. No numbers written as digits.",
  ];
  // "Make it again": the old sentences, so the new ones are really new.
  if (avoid.length) rules.push(`This is a NEW version: write completely different sentences (a new situation, new names) — never reuse or reword these: ${avoid.map((x) => `"${x}"`).join(" ")}`);
  const user = rules.map((r) => `- ${r}`).join("\n");
  return { system, user };
}

/** Problems in AI or book sentences: wrong count, too long/short, missing targets, Greek. */
export function checkSentences(spec, sentences, words) {
  const [min, max] = sentenceRange(spec.levelId, spec.length, spec.difficulty);
  const terms = allowedTerms(words);
  const problems = [];
  if (!["dictogloss", "running"].includes(spec.style) && sentences.length < spec.count) problems.push(`${sentences.length} of ${spec.count} sentences`);
  sentences.forEach((s, i) => {
    const n = countWords(s.text);
    if (n < min - 2 || n > max + 3) problems.push(`sentence ${i + 1} has ${n} words (aim ${min}–${max})`);
    if (!s.targets.length) problems.push(`sentence ${i + 1} uses no word from the list`);
    if (hasGreek(s.text)) problems.push(`sentence ${i + 1} contains Greek`);
    s.targets.forEach((t) => { if (!terms.some((x) => containsForm(t, x) || containsForm(x, t))) problems.push(`sentence ${i + 1}: "${t}" is not on the word list`); });
  });
  return problems;
}

/** Keep only targets that really appear in the sentence (AI lists can drift). */
function realTargets(text, targets, words) {
  const fromList = words.map((w) => w.english).filter((w) => containsForm(text, w));
  const named = (targets || []).map(clean).filter((t) => t && containsForm(text, t));
  return [...new Set([...named.filter((t) => fromList.some((w) => containsForm(t, w) || containsForm(w, t))), ...fromList])];
}

/**
 * The printable dictation doc.
 * raw: AI JSON ({ title, sentences, text }) or { sentences } from bookSentences.
 * ctx: { meta: { bookTitle, unit, classProfile, classLabel, label }, picFor(word) → "@w-…" | "" }
 */
export function buildDictationDoc(spec, raw, words, ctx = {}, rand = Math.random) {
  const style = DICTATION_STYLES[spec.style] ? spec.style : "classic";
  const connected = style === "dictogloss" || style === "running";
  let sentences = (Array.isArray(raw?.sentences) ? raw.sentences : [])
    .map((s) => (typeof s === "string" ? { text: s, targets: [] } : s))
    .map((s) => ({ text: clean(s?.text), targets: realTargets(clean(s?.text), s?.targets, words) }))
    .filter((s) => s.text);
  let text = clean(raw?.text);
  if (connected && !text) text = sentences.map((s) => s.text).join(" ");
  if (connected && !sentences.length && text) sentences = (text.match(/[^.!?]+[.!?]+/g) || [text]).map((t) => ({ text: clean(t), targets: realTargets(t, [], words) }));
  if (!connected) sentences = sentences.slice(0, spec.count);
  const problems = checkSentences(spec, sentences, words);

  sentences = sentences.map((s, i) => {
    const { gapped, answers } = maskTargets(s.text, s.targets, spec.gapsPerSentence || 1);
    return { n: i + 1, text: s.text, targets: s.targets, gapped, answers };
  });
  if (style === "gapped") sentences.filter((s) => !s.answers.length).forEach((s) => problems.push(`sentence ${s.n} has no word to gap`));

  let pictures = [];
  if (style === "picture") {
    const picFor = ctx.picFor || (() => "");
    const withPic = sentences.map((s) => ({ s, word: s.targets.find((t) => picFor(t)) })).filter((x) => x.word);
    if (withPic.length < sentences.length) problems.push(`${sentences.length - withPic.length} sentence(s) have no picture word`);
    const order = shuffled(withPic, rand);
    pictures = order.map((x, i) => ({ letter: LETTERS[i], word: x.word, pic: picFor(x.word), n: x.s.n }));
    pictures.forEach((p) => { const s = sentences.find((x) => x.n === p.n); if (s) s.letter = p.letter; });
  }

  const points = style === "gapped" ? sentences.reduce((n, s) => n + s.answers.length, 0)
    : style === "picture" ? pictures.length * 2
      : style === "classic" ? sentences.length * 2
        : 10;
  const keyWords = connected ? [...new Set(sentences.flatMap((s) => s.targets))].slice(0, 10) : [];
  const meta = ctx.meta || {};
  return {
    id: newDocId("dictation"),
    kind: "dictation",
    createdAt: new Date().toISOString(),
    spec: { ...spec },
    words: words.map((w) => ({ english: w.english, type: w.type || "", greek: w.greek || "", example: w.example || "" })),
    meta: {
      title: clean(raw?.title) ? `Dictation · ${clean(raw.title)}` : "Read-aloud dictation",
      subtitle: DICTATION_STYLES[style].label,
      bookTitle: meta.bookTitle || "",
      unit: meta.unit || "",
      classProfile: spec.levelId,
      classLabel: meta.classLabel || "",
      label: meta.label || "",
      minutes: Math.max(10, Math.round(sentences.length * (spec.repeats || 2) * 0.6 + 5)),
      greek: !!spec.greek,
      pictures: spec.pictures !== false,
    },
    sections: [{
      id: "d1",
      skill: "dictation",
      task: "DICT",
      style,
      rubric: DICTATION_STYLES[style].rubric,
      rubricEl: DICTATION_STYLES[style].el,
      answerType: "dictation",
      items: [],
      sentences,
      text: connected ? text : "",
      textWords: connected ? countWords(text) : 0,
      strips: style === "running" ? splitStrips(text) : [],
      pictures,
      keyWords,
      repeats: spec.repeats,
      punctuationAloud: !!spec.punctuationAloud,
      points,
      problems,
    }],
  };
}

/** What the teacher reads aloud, in order (for the read-aloud player). */
export function readAloudLines(doc) {
  const s = doc?.sections?.[0];
  if (!s) return [];
  if (s.style === "dictogloss" || s.style === "running") return [s.text];
  return s.sentences.map((x) => x.text);
}
