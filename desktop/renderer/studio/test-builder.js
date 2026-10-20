/* Vocab Master — unit test builder (pure): settings, part plans, the AI prompt and the printable doc.
 * A test is a list of parts (skill + task + items + points) the teacher can change; one AI call writes
 * all parts (or one part again). The coursebook unit's whole context goes into the prompt in compact
 * form (studio/unit-context.js). Listening scripts are read by the app's voices (studio/tts.js). */
import { TASKS, SKILLS, defaultTask, tfLabels } from "./tasks.js";
import { TEST_DEFAULTS, DIFFICULTY } from "./levels.js";
import { balancedPattern } from "./answer-balance.js";
import { normalizeSection, docPoints, newDocId, tfValue } from "./doc-model.js";
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

/* ── What the Step 1 source allows ────────────────────────────────────
 * A coursebook unit brings words, pictures, a Big Question and its own grammar (from the book's example
 * sentences). "My word list" brings words (and the unit's context when the list came from the coursebook).
 * "A grammar point or topic" brings no word list at all: no picture tasks, no Big Question. */

/** The task used instead of one the source can't support. */
export const TASK_FALLBACK = { "L-PIC": "L-MC", "V-PIC": "V-BANK", "W-PICTURES": "W-GUIDED", "S-PICTURE": "S-QUESTIONS", "S-BQ": "S-QUESTIONS" };

/**
 * Why a task can't be used with this source ("" when it can).
 * src: { kind: "unit" | "words" | "topic", hasUnit, pictureWords: n }
 */
export function taskBlock(taskId, src = {}) {
  const t = TASKS[taskId];
  if (!t) return "unknown task";
  if (t.needs?.includes("pictures") && (src.pictureWords ?? 0) < 3) return src.kind === "topic" ? "needs a word list with pictures" : "needs 3+ chosen words with pictures";
  if (taskId === "S-BQ" && !src.hasUnit) return "needs a coursebook unit";
  return "";
}

/** A task for a skill that this source supports: the class default, else its fallback, else the first that works. */
export function taskForSource(skill, levelId, src) {
  const first = defaultTask(skill, levelId);
  if (!taskBlock(first, src)) return first;
  const fb = TASK_FALLBACK[first];
  if (fb && !taskBlock(fb, src)) return fb;
  return Object.keys(TASKS).find((id) => TASKS[id].skill === skill && !taskBlock(id, src)) || first;
}

/**
 * Swap parts whose task this source can't support for one it can (same skill, same id).
 * Returns [{ id, from, to, reason }] for the parts that changed.
 */
export function fitPartsToSource(parts, levelId, src) {
  const changed = [];
  for (const p of parts) {
    const reason = taskBlock(p.task, src);
    if (!reason) continue;
    const fb = TASK_FALLBACK[p.task];
    const to = fb && !taskBlock(fb, src) ? fb : taskForSource(p.skill, levelId, src);
    if (to === p.task) continue;
    const fresh = makePart(p.skill, to, levelId);
    const wasOpen = TASKS[p.task].answer === "open";
    changed.push({ id: p.id, from: p.task, to, reason });
    // Same number of questions when both tasks have questions; level defaults otherwise.
    Object.assign(p, { task: to, items: TASKS[to].answer === "open" || wasOpen ? fresh.items : p.items, points: fresh.points, words: fresh.words });
  }
  return changed;
}

/** The title a test gets when the teacher leaves the field empty (the AI names topic tests). */
export function defaultTitle(src = {}) {
  if (src.kind === "unit" && src.units?.length) return `Unit${src.units.length > 1 ? "s" : ""} ${src.units.join(", ")} Test`;
  if (src.kind === "words" && src.unit) return `Unit ${src.unit} Test`;
  return "";
}

/** Word-answer tasks: every item needs its own tested word. */
const ONE_WORD_EACH = ["V-PIC", "V-BANK", "V-MC", "V-MATCH", "R-GAP"];

/** Problems with the plan before any AI call (each one blocks "Write my test"). */
export function planProblems(spec, { pictureWords = [], focusWords = [], hasUnit } = {}) {
  const out = [];
  const kind = spec.source?.kind;
  if (!spec.parts.length) out.push("Add at least one part.");
  if (kind === "topic" && !String(spec.topic || "").trim() && !(spec.grammar || []).length) out.push("Type the topic, or choose the grammar to test.");
  if (kind && kind !== "topic" && !focusWords.length) out.push("Choose the words to test.");
  const src = { kind, hasUnit: hasUnit ?? kind === "unit", pictureWords: pictureWords.length };
  const needPics = spec.parts.filter((p) => TASKS[p.task]?.needs?.includes("pictures"));
  if (needPics.length && !spec.pictures) out.push("Pictures are off, but some parts use pictures — turn them on in Final touches or change those parts.");
  else {
    const blocked = spec.parts.map((p, i) => ({ i, reason: taskBlock(p.task, src), p })).filter((x) => x.reason);
    if (blocked.length) out.push(blocked.map(({ i, p, reason }) => `Part ${i + 1} (${TASKS[p.task].label}) ${reason}.`).join(" "));
  }
  return out;
}

/** Soft notes (never block): word-answer parts asking for more answers than there are tested words. */
export function planNotes(spec, { focusWords = [] } = {}) {
  if (spec.source?.kind === "topic" || !focusWords.length) return [];
  return spec.parts.map((p, i) => ({ p, i })).filter(({ p }) => ONE_WORD_EACH.includes(p.task) && p.items > focusWords.length)
    .map(({ p, i }) => `Part ${i + 1} has ${p.items} questions but only ${focusWords.length} word${focusWords.length === 1 ? " is" : "s are"} chosen, so some words will come twice.`);
}

function partBrief(p, i, spec, pictureWords) {
  const t = TASKS[p.task];
  const lines = [`PART ${i + 1} — id "${p.id}" — ${SKILLS[p.skill].label}: ${t.label} [${p.task}]`, `  What to write: ${t.ai}`];
  if (t.answer !== "open") lines.push(`  Items: exactly ${p.items}, plus ONE extra "example" item (shown solved as item 0, not counted).`);
  if (t.answer === "choice") lines.push(`  Each item: "options" (${t.options || 3}) and "answer" = the exact text of the right option.`);
  if (t.answer === "tf") {
    const [yes, no] = tfLabels(spec.levelId);
    lines.push(`  Answer each with "${yes}" or "${no}" in THIS order: ${balancedPattern(tfLabels(spec.levelId), p.items).join(", ")}.`);
    const src = p.skill === "listening" ? "script" : "text";
    lines.push(`  Write the ${src} first, then one statement per item. A "${yes}" statement says what the ${src} says; a "${no}" statement changes one detail (who, what, where or when) so the ${src} clearly says otherwise. Every statement is about something the ${src} says. Never key "${no}" for something that is said.`);
    lines.push(`  Each item (and the example) also has "evidence": the exact words of the ${src} that decide its answer.`);
  }
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
  const hasUnit = !topicMode && !!ctx.unitContext;
  const topic = String(spec.topic || "").trim();
  const grammar = spec.grammar || [];
  const rules = [
    topicMode
      ? topic
        ? `Topic: ${topic} — choose vocabulary the class knows; every part is about this topic${grammar.length ? "" : " (if it names grammar, the grammar parts test that grammar)"}.`
        : "Topic: everyday situations this class knows (home, school, friends, free time) — choose vocabulary the class knows; the grammar focus below is what this test is about."
      : `TEST THESE WORDS (answers come only from this list; a word may be inflected to fit): ${focus.map((w) => `${w.english}${w.type ? ` (${w.type})` : ""}`).join(", ")}`,
    topicMode ? "" : hasUnit ? "Texts and scripts may also use other words of the unit listed below and very common words; nothing above the class level." : "Texts and scripts may also use very common words; nothing above the class level.",
    grammar.length
      ? `Grammar focus (grammar parts test it; other parts may use it): ${grammar.join(", ")}`
      : hasUnit ? "Grammar: the grammar the unit's example sentences show, at this class level." : "Grammar: what this class already knows (see the class profile) — nothing new.",
    topic && !topicMode ? `${hasUnit ? "Context the teacher wants for the texts" : "The texts and scripts are about"}: ${topic}` : "",
    `Difficulty: ${DIFFICULTY[spec.difficulty]?.note || DIFFICULTY.level.note}`,
    "Listening scripts: only what the speakers say — no rubric, no narrator saying \"Listen and…\". Natural spoken English for children, 2 speakers with first names (a child and an adult, or two children), short turns, every answer clearly said once; distractors may be mentioned. No sound effects.",
    "Every non-writing, non-speaking part MUST include its \"example\" item.",
    "Reading texts: 80–180 words depending on the level, a clear title, about the unit topic.",
    "Every correct answer must be clearly right and every wrong option clearly wrong. No trick questions. No Greek anywhere.",
    "Every part has its own sentences: never reuse a sentence or item from another part, even with a different task.",
    "Facts in texts and scripts must be true (lava is hot, ash is grey); only the \"no\" statements may be wrong.",
    "Spread the right option across a, b and c.",
  ].filter(Boolean);
  const user = `${topicMode ? "" : `UNIT CONTEXT\n${unitContextPrompt(ctx.unitContext)}\n\n`}RULES\n${rules.map((r) => `- ${r}`).join("\n")}\n\nLOCKED TEST PLAN (${parts.length} part${parts.length === 1 ? "" : "s"})\n${parts.map((p) => partBrief(p, spec.parts.indexOf(p), spec, ctx.pictureWords || [])).join("\n")}`;
  return { system, user };
}

/**
 * A second, small AI call that answers each yes/no (true/false) statement from the text alone.
 * The writer is told the answer order before it writes, and a real run still keyed "no" for something the
 * script said, so the key is checked by a reader who only sees the text. Returns null when there's nothing to check.
 */
export function keyCheckPrompt(doc, onlyParts = null) {
  const parts = (doc?.sections || []).filter((s) => s.answerType === "tf" && s.items.length && (!onlyParts || onlyParts.includes(s.id)));
  if (!parts.length) return null;
  const system = `You check answer keys for an English test. Read each text and decide, for every statement, whether the text says it (yes) or clearly says otherwise (no). Judge only by the text.
Return ONLY valid JSON: { "sections": [ { "id": "<part id>", "answers": ["yes" or "no", …] } ] } — one answer per statement, in order.`;
  const user = parts.map((s) => {
    const text = s.script.length ? s.script.map((l) => `${l.speaker}: ${l.text}`).join("\n") : s.passage;
    return `PART id "${s.id}"\nTEXT:\n${text}\nSTATEMENTS:\n${s.items.map((it) => `${it.n}. ${it.prompt}`).join("\n")}`;
  }).join("\n\n");
  return { system, user };
}

/** Takes the checker's answers: a key it disagrees with is corrected and flagged for the teacher. Returns the items changed. */
export function applyKeyCheck(doc, reply) {
  let changed = 0;
  const byId = new Map((Array.isArray(reply?.sections) ? reply.sections : []).map((s) => [String(s?.id || ""), s]));
  for (const s of doc?.sections || []) {
    const answers = byId.get(s.id)?.answers;
    if (s.answerType !== "tf" || !Array.isArray(answers) || answers.length !== s.items.length) continue;
    const labels = tfLabels(doc.meta?.classProfile);
    const fixed = [];
    s.items.forEach((it, i) => {
      const v = tfValue(answers[i]);
      if (v < 0 || v === it.tf) return;
      it.tf = v;
      it.answer = labels[v];
      fixed.push(it.n);
    });
    if (fixed.length) {
      s.problems = [...(s.problems || []), `the answer key was corrected for item${fixed.length > 1 ? "s" : ""} ${fixed.join(", ")} — please check against the ${s.script.length ? "script" : "text"}`];
      changed += fixed.length;
    }
  }
  return changed;
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
      subtitle: meta.label || (spec.source?.kind === "topic" ? [spec.topic, ...(spec.grammar || [])].filter(Boolean).join(" · ") : ""),
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
