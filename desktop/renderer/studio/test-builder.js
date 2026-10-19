/* Vocab Master — unit test builder (pure): settings, part plans, the AI prompt and the printable doc.
 * A test is a list of parts (skill + task + items + points) the teacher can change; one AI call writes
 * all parts (or one part again). The coursebook unit's whole context goes into the prompt in compact
 * form (studio/unit-context.js). Listening scripts are read by the app's voices (studio/tts.js). */
import { TASKS, SKILLS, defaultTask, tfLabels } from "./tasks.js";
import { TEST_DEFAULTS, DIFFICULTY } from "./levels.js";
import { balancedPattern } from "./answer-balance.js";
import { normalizeSection, docPoints, newDocId } from "./doc-model.js";
import { allowedTerms, answerInScope } from "./word-scope.js";
import { unitContextPrompt } from "./unit-context.js";

export const LENGTHS = {
  quiz: { label: "Quick quiz", minutes: 20, skills: ["vocabulary", "vocabulary", "grammar", "reading"] },
  standard: { label: "Unit test", minutes: 40, skills: ["listening", "reading", "vocabulary", "grammar", "writing"] },
  full: { label: "All 4 skills", minutes: 60, skills: ["listening", "listening", "reading", "reading", "vocabulary", "vocabulary", "grammar", "grammar", "writing", "speaking"] },
};

/** Second choice of task for a skill that appears twice. */
const SECOND = { listening: ["L-YN", "L-GAP"], reading: ["R-GAP", "R-MC"], vocabulary: ["V-MATCH", "V-MC"], grammar: ["G-ORDER", "G-FORM"], writing: ["W-MESSAGE"], speaking: ["S-BQ"] };

let partSeq = 0;
export const newPartId = () => `p${Date.now().toString(36).slice(-4)}${(partSeq++).toString(36)}`;

/** One part with level defaults. */
export function makePart(skill, task, levelId) {
  const d = TEST_DEFAULTS[levelId] || TEST_DEFAULTS.B_SENIOR;
  const t = TASKS[task];
  const open = t?.answer === "open";
  return {
    id: newPartId(),
    skill,
    task,
    items: open ? 1 : d.items,
    pointsEach: 1,
    points: open ? (skill === "speaking" ? d.speakingPoints : d.writingPoints) : undefined,
    words: skill === "writing" ? [...d.writingWords] : undefined,
  };
}

/** Parts for a length preset at a level, skipping picture tasks when pictures are off or missing. */
export function presetParts(length, levelId, { pictures = true } = {}) {
  const skills = (LENGTHS[length] || LENGTHS.standard).skills;
  const seen = {};
  return skills.map((skill) => {
    const n = (seen[skill] = (seen[skill] || 0) + 1);
    let task = n === 1 ? defaultTask(skill, levelId) : SECOND[skill][0];
    if (!pictures && TASKS[task]?.needs?.includes("pictures")) task = { listening: "L-MC", vocabulary: "V-BANK", writing: "W-GUIDED", speaking: "S-QUESTIONS" }[skill] || task;
    return makePart(skill, task, levelId);
  });
}

/** Fresh settings for a test. */
export function testDefaults(levelId = "B_SENIOR", length = "standard") {
  return {
    levelId,
    length,
    parts: presetParts(length, levelId),
    difficulty: "level",
    grammar: [],
    topic: "",
    title: "",
    versions: 1,
    greek: ["A_SENIOR", "B_SENIOR", "C_SENIOR"].includes(levelId),
    pictures: true,
    studentHeader: true,
  };
}

/** Rough minutes a test takes (items × level pace + writing and listening time). */
export function estimateMinutes(spec) {
  const d = TEST_DEFAULTS[spec.levelId] || TEST_DEFAULTS.B_SENIOR;
  return Math.round(spec.parts.reduce((m, p) => {
    const t = TASKS[p.task];
    if (p.skill === "writing") return m + Math.max(8, Math.round((p.words?.[1] || 40) / 5));
    if (p.skill === "speaking") return m + 0; // done one by one, outside the written time
    return m + p.items * d.minutesPerItem + (p.skill === "listening" ? 3 : p.skill === "reading" ? 4 : 1) + (t?.bank ? 1 : 0);
  }, 0));
}

export const partPoints = (p) => (TASKS[p.task]?.answer === "open" ? p.points || 10 : (p.items || 0) * (p.pointsEach || 1));
export const specPoints = (spec) => spec.parts.reduce((n, p) => n + partPoints(p), 0);

/** Problems with the plan before any AI call. */
export function planProblems(spec, { pictureWords = [], focusWords = [] } = {}) {
  const out = [];
  if (!spec.parts.length) out.push("Add at least one part.");
  const needPics = spec.parts.filter((p) => TASKS[p.task]?.needs?.includes("pictures"));
  if (needPics.length && spec.pictures && pictureWords.length < 3) out.push(`${needPics.map((p) => TASKS[p.task].label).join(", ")} needs 3+ words with pictures — choose another task or more words.`);
  if (needPics.length && !spec.pictures) out.push("Pictures are off, but some parts use pictures.");
  if (spec.source?.kind !== "topic" && !focusWords.length) out.push("Choose the words to test.");
  return out;
}

function partBrief(p, i, spec, pictureWords) {
  const t = TASKS[p.task];
  const lines = [`PART ${i + 1} — id "${p.id}" — ${SKILLS[p.skill].label}: ${t.label} [${p.task}]`, `  What to write: ${t.ai}`];
  if (t.answer !== "open") lines.push(`  Items: exactly ${p.items}, plus ONE extra "example" item (shown solved as item 0, not counted).`);
  if (t.answer === "choice") lines.push(`  Each item: "options" (${t.options || 3}) and "answer" = the exact text of the right option.`);
  if (t.answer === "tf") lines.push(`  Answer each with "${tfLabels(spec.levelId).join('" or "')}" in THIS order: ${balancedPattern(tfLabels(spec.levelId), p.items).join(", ")}.`);
  if (p.skill === "writing" && p.words) lines.push(`  Students write ${p.words[0]}–${p.words[1]} words.`);
  if (t.needs?.includes("pictures") && pictureWords.length) lines.push(`  Picture words (ONLY these can be pictures): ${pictureWords.join(", ")}`);
  if (p.note) lines.push(`  Teacher's note for this part: ${p.note}`);
  return lines.join("\n");
}

/**
 * Prompts for the whole test, or for some parts only (onlyParts: ids).
 * ctx: { unitContext, focusWords: [{english,type,greek}], pictureWords: [], profileBlock }
 */
export function testPrompt(spec, ctx = {}, onlyParts = null) {
  const parts = onlyParts ? spec.parts.filter((p) => onlyParts.includes(p.id)) : spec.parts;
  const focus = ctx.focusWords || [];
  const topicMode = spec.source?.kind === "topic";
  const system = `You are an expert ESL test writer for Greek learners in a language school (φροντιστήριο), following Cambridge Young Learners (Starters/Movers/Flyers) and Cambridge A2 Key for Schools task styles.
Return ONLY valid JSON. No markdown.
${ctx.profileBlock || ""}

JSON: { "title": "short test title", "sections": [ { "id": "<part id>", "passageTitle": "", "passage": "", "script": [ { "speaker": "Name", "text": "line" } ], "bank": [], "example": { "prompt": "", "options": [], "answer": "" }, "items": [ { "prompt": "", "options": [], "answer": "" } ], "prompt": "", "frame": [], "pictures": [], "prompts": [], "sample": "" } ] }
Only include the fields a part needs. One object per part, same ids, same order.`;
  const rules = [
    topicMode
      ? `Topic: ${spec.topic || "general English for this class"} — choose vocabulary the class knows; every item tests the topic.`
      : `TEST THESE WORDS (answers come only from this list; a word may be inflected to fit): ${focus.map((w) => `${w.english}${w.type ? ` (${w.type})` : ""}`).join(", ")}`,
    topicMode ? "" : "Texts and scripts may also use other words of the unit listed below and very common words; nothing above the class level.",
    spec.grammar?.length ? `Grammar focus (grammar parts test it; other parts may use it): ${spec.grammar.join(", ")}` : "Grammar: the grammar the unit's example sentences show, at this class level.",
    spec.topic && !topicMode ? `Context the teacher wants: ${spec.topic}` : "",
    `Difficulty: ${DIFFICULTY[spec.difficulty]?.note || DIFFICULTY.level.note}`,
    "Listening scripts: only what the speakers say — no rubric, no narrator saying \"Listen and…\". Natural spoken English for children, 2 speakers with first names (a child and an adult, or two children), short turns, every answer clearly said once; distractors may be mentioned. No sound effects.",
    "Every non-writing, non-speaking part MUST include its \"example\" item.",
    "Reading texts: 80–180 words depending on the level, a clear title, about the unit topic.",
    "Every correct answer must be clearly right and every wrong option clearly wrong. No trick questions. No Greek anywhere.",
    "Spread the right option across a, b and c.",
  ].filter(Boolean);
  const user = `${topicMode ? "" : `UNIT CONTEXT\n${unitContextPrompt(ctx.unitContext)}\n\n`}RULES\n${rules.map((r) => `- ${r}`).join("\n")}\n\nLOCKED TEST PLAN (${parts.length} part${parts.length === 1 ? "" : "s"})\n${parts.map((p) => partBrief(p, spec.parts.indexOf(p), spec, ctx.pictureWords || [])).join("\n")}`;
  return { system, user };
}

/** Answers outside the tested words, per part (vocabulary, reading gaps and listening gaps). */
function scopeProblems(section, focusWords) {
  if (!focusWords?.length || !["V-PIC", "V-BANK", "V-MC", "R-GAP", "L-GAP"].includes(section.task)) return [];
  const terms = allowedTerms(focusWords);
  return section.items.filter((it) => !answerInScope(it.answer, terms)).map((it) => `item ${it.n}: "${it.answer}" is not one of the tested words`);
}

/**
 * Assemble the doc from the AI reply (or merge new parts into an existing doc).
 * ctx: { levelId, picFor, focusWords, meta: { bookTitle, unit, classLabel, label } }
 */
export function buildTestDoc(spec, reply, ctx = {}, previous = null) {
  const rawSections = Array.isArray(reply?.sections) ? reply.sections : [];
  const byId = new Map(rawSections.map((s) => [String(s?.id || ""), s]));
  const sections = spec.parts.map((p, i) => {
    const raw = byId.get(p.id) || (!previous && rawSections[i]);
    if (!raw && previous) return previous.sections.find((s) => s.id === p.id) || null;
    const s = normalizeSection(p, raw || {}, { levelId: spec.levelId, picFor: spec.pictures ? ctx.picFor : null });
    s.problems.push(...scopeProblems(s, ctx.focusWords));
    if (!raw) s.problems.push("the AI did not write this part");
    return s;
  }).filter(Boolean);
  const meta = ctx.meta || {};
  const title = spec.title || previous?.meta?.title || (meta.unit ? `Unit ${meta.unit} Test` : String(reply?.title || "").trim() || "English Test");
  const doc = {
    id: previous?.id || newDocId("test"),
    kind: "test",
    createdAt: previous?.createdAt || new Date().toISOString(),
    spec: JSON.parse(JSON.stringify(spec)),
    focusWords: (ctx.focusWords || []).map((w) => ({ english: w.english, type: w.type || "", greek: w.greek || "" })),
    meta: {
      title,
      subtitle: meta.label || (spec.source?.kind === "topic" ? spec.topic : ""),
      bookTitle: meta.bookTitle || "",
      unit: meta.unit || "",
      classProfile: spec.levelId,
      classLabel: meta.classLabel || "",
      minutes: estimateMinutes(spec),
      version: spec.versions > 1 ? "A" : "",
      greek: !!spec.greek,
      pictures: spec.pictures !== false,
      layout: { studentHeader: spec.studentHeader !== false },
    },
    sections,
  };
  doc.meta.points = docPoints(doc);
  return doc;
}
