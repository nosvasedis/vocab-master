/* Vocab Master — unit test builder (pure): settings, part plans, the AI prompt and the printable doc.
 * A test is a list of parts (skill + task + items + points) the teacher can change; one AI call writes
 * all parts (or one part again). The coursebook unit's whole context goes into the prompt in compact
 * form (studio/unit-context.js). Listening scripts are read by the app's voices (studio/tts.js). */
import { TASKS, SKILLS, defaultTask, secondTask, tfLabels, partOpts, levelIndex, taskFit, tasksFor } from "./tasks.js";
import { readingText, wordCount } from "./reading-texts.js";
import { TEST_DEFAULTS, DIFFICULTY } from "./levels.js";
import { balancedPattern } from "./answer-balance.js";
import { normalizeSection, docPoints, newDocId, tfValue, hasWordBox, sectionRubric } from "./doc-model.js";
import { allowedTerms, answerInScope, relatedTerms } from "./word-scope.js";
import { unitContextPrompt } from "./unit-context.js";

export const LENGTHS = {
  quiz: { label: "Quick quiz", minutes: 20, skills: ["vocabulary", "vocabulary", "grammar", "reading"] },
  standard: { label: "Unit test", minutes: 40, skills: ["listening", "reading", "vocabulary", "grammar", "writing"] },
  full: { label: "All 4 skills", minutes: 60, skills: ["listening", "listening", "reading", "reading", "vocabulary", "vocabulary", "grammar", "grammar", "writing", "speaking"] },
};

/**
 * How hard one part is (a slider on each part; 3 = right for the class). Mostly about the wrong options:
 * how close they come to the right one.
 */
export const PART_LEVELS = [
  null,
  { label: "Easier", guide: "short, simple sentences; the wrong options are from the same topic and word class but a careful learner rules them out quickly" },
  { label: "A bit easier", guide: "simple sentences; one wrong option is a near miss, the other is clearly wrong" },
  { label: "For the class", guide: "every wrong option is a real temptation for this class: a common learner mistake or a close word" },
  { label: "A bit harder", guide: "all the options are plausible; one detail of form or meaning decides; slightly longer sentences" },
  { label: "Challenging", guide: "all the options are very close — one grammar rule, collocation or detail in the text decides; learners must read the whole sentence" },
];
export const partLevel = (p) => Math.max(1, Math.min(5, Math.round(Number(p?.level) || 3)));

/** The same slider for yes/no parts (how far the statements move from the text's words) and for open parts. */
const TF_LEVELS = [null,
  "statements repeat the text's own words; a \"no\" statement changes one obvious detail",
  "statements are close to the text's words; the changed detail is easy to spot",
  "statements say the text's ideas in other words; a \"no\" statement changes one detail a careless reader misses",
  "statements paraphrase; some need two sentences of the text put together",
  "statements paraphrase throughout; some need two sentences put together or a small inference (how someone feels, why something happens)"];
const OPEN_LEVELS = [null,
  "a short, very concrete task with familiar ideas; simple sentences are enough",
  "a concrete task; the model answer uses simple sentences joined with and / but / because",
  "a task right for the class; the model answer uses linking words and the unit words naturally",
  "a slightly more demanding task (more points, a reason or an example); the model answer is a little longer and richer",
  "a demanding task for strong students: opinions with reasons and examples, varied sentences and linking words"];

/** What the difficulty slider asks for, for this part's kind of answer. */
export function levelGuide(p) {
  const n = partLevel(p);
  const t = TASKS[p?.task] || {};
  if (t.answer === "tf") return TF_LEVELS[n];
  if (t.answer === "open") return OPEN_LEVELS[n];
  return PART_LEVELS[n].guide;
}

/** Reading texts of about this many words, by class (Short / Medium / Long). */
const TEXT_WORDS = [70, 95, 125, 155, 185];
const LENGTH_FACTOR = { short: 0.7, medium: 1, long: 1.35 };
export function textWords(levelId, length = "medium") {
  const n = Math.round((TEXT_WORDS[levelIndex(levelId)] * (LENGTH_FACTOR[length] || 1)) / 5) * 5;
  return [Math.max(35, n - 15), n + 15];
}

/**
 * Every question needs its own detail in the text or the recording (about one per 12 words, two script
 * lines per question). A part with many questions gets a longer text and script, never fewer questions.
 */
export const WORDS_PER_ITEM = 12;
export function partTextWords(p, levelId) {
  const [a, b] = textWords(levelId, partOpts(p, levelId).length);
  const need = TASKS[p.task]?.answer === "open" ? 0 : Math.ceil(((p.items || 0) + 1) * WORDS_PER_ITEM / 5) * 5;
  return need > a ? [need, need + 30] : [a, b];
}
export const scriptLines = (p) => Math.max(6, ((p.items || 0) + 1) * 2);
/** How many questions a given (ready-made) text can carry, one detail each. */
export const textCapacity = (text) => Math.max(3, Math.floor(wordCount(text) / WORDS_PER_ITEM));

/**
 * Wrong options that teach (distractor design for young learners, after Cambridge YLE / A2 Key item writing):
 * each wrong option is wrong for one reason a learner could really get wrong, never filler.
 */
export const DISTRACTOR_RULE = "Wrong options (distractors) must tempt: the same word class and form as the right answer, from the same topic or the same grammar point, each wrong for ONE clear reason a learner could really miss — typical mistakes of Greek learners: wrong tense or person (he go / he goes), a / an / some / any with countable and uncountable nouns, a missing -s, can + to, a near-synonym that doesn't fit the phrase (do / make), a word that fits the meaning but not the grammar, or a detail the text gets wrong. Never mix grammar points inside one item: an item about can / can't offers only forms of can (can, can't, cans, can to) — never 'some'. No silly or impossible options, and no second option that is also right. Spread the right option across a, b and c.";

/** Speaking cards per part, by class. */
const SPEAKING_CARDS = { A_SENIOR: 2, B_SENIOR: 2, C_SENIOR: 3, D_SENIOR: 3, E_SENIOR: 3 };


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
    opts: {},
  };
}

/** The task used instead of one that needs pictures (or a unit), for this class. */
export function fallbackTask(task, levelId) {
  if (task === "W-PICTURES" && levelIndex(levelId) === 0) return "W-SENT";
  if (task === "S-DISCUSS") return "S-ROLE";
  return TASK_FALLBACK[task] || task;
}

/**
 * "How long" → a template: each length has several starting sets of parts for Step 3. A part is
 * [skill, ...tasks it would like]: the first of those tasks that suits the class is used, otherwise the
 * class's usual task for that skill (its second one when the skill comes again). A template with the
 * length's own id (quiz, standard, full) is that length's classic set (LENGTHS).
 */
export const TEMPLATES = [
  { id: "quiz", length: "quiz", label: "Quick quiz", blurb: "The unit's words, its grammar and a short reading.", parts: [["vocabulary"], ["vocabulary"], ["grammar"], ["reading"]] },
  { id: "quiz-words", length: "quiz", label: "Word check", blurb: "Only the words: recognise them, write them, use them in a text, spell them.", parts: [["vocabulary", "V-TICK", "V-DEF", "V-MC"], ["vocabulary", "V-MATCH", "V-COLLOC"], ["vocabulary", "V-BANK"], ["vocabulary", "V-SPELL", "V-FORM"]] },
  { id: "quiz-grammar", length: "quiz", label: "Grammar check", blurb: "The grammar point step by step: choose, build, write — then use it in everyday replies.", parts: [["grammar", "G-MC"], ["grammar", "G-ORDER", "G-QUEST"], ["grammar", "G-FORM", "G-FIX", "G-CLOZE"], ["reading", "R-REPLY"]] },
  { id: "standard", length: "standard", label: "Unit test", blurb: "A part for every skill except speaking.", parts: [["listening"], ["reading"], ["vocabulary"], ["grammar"], ["writing"]] },
  { id: "std-rw", length: "standard", label: "Reading & writing", blurb: "Two readings, words and grammar in context, and a writing task.", parts: [["reading", "R-TF"], ["reading", "R-QA", "R-WHO", "R-MC"], ["vocabulary", "V-BANK"], ["grammar", "G-FORM", "G-MC"], ["writing", "W-GUIDED", "W-PICTURES", "W-SENT"]] },
  { id: "std-ls", length: "standard", label: "Listening & speaking", blurb: "Two listenings, the words, and speaking cards to talk about.", parts: [["listening", "L-PIC", "L-MC"], ["listening", "L-GIST", "L-GAP", "L-YN", "L-MATCH"], ["vocabulary", "V-MATCH"], ["speaking", "S-PICTURE", "S-QUESTIONS"], ["speaking", "S-ROLE", "S-STORY", "S-DISCUSS"]] },
  { id: "full", length: "full", label: "All 4 skills", blurb: "Two parts of every skill and speaking cards: the full picture.", parts: [["listening"], ["listening"], ["reading"], ["reading"], ["vocabulary"], ["vocabulary"], ["grammar"], ["grammar"], ["writing"], ["speaking"]] },
  { id: "full-term", length: "full", label: "End-of-term test", blurb: "A written exam: two parts of each skill except speaking.", parts: [["listening"], ["reading"], ["reading"], ["vocabulary"], ["vocabulary"], ["grammar"], ["grammar"], ["writing"]] },
  { id: "full-exam", length: "full", label: "Exam practice", blurb: "Like a young learners' exam paper: pictures, names, gaps and a story.", parts: [["listening", "L-PIC", "L-MC"], ["listening", "L-MATCH", "L-GAP", "L-NOTES"], ["reading", "R-SIGNS", "R-WHO", "R-MC"], ["reading", "R-MCCLOZE", "R-GAP", "R-TF"], ["vocabulary", "V-DEF", "V-PIC"], ["grammar", "G-CLOZE", "G-MC"], ["writing", "W-STORY", "W-PICTURES", "W-SENT"], ["speaking", "S-STORY", "S-PICTURE"]] },
];
export const templateFor = (id, length) => TEMPLATES.find((t) => t.id === id) || TEMPLATES.find((t) => t.id === length) || TEMPLATES.find((t) => t.id === "standard");

/** A template's parts for a class: tasks that suit the class, no task twice, no picture tasks when pictures are off. */
export function templateParts(id, levelId, { pictures = true } = {}) {
  const tpl = templateFor(id);
  const seen = {};
  const used = new Set();
  const usable = (task) => TASKS[task] && !used.has(task) && (pictures || !TASKS[task].needs?.includes("pictures"));
  return tpl.parts.map(([skill, ...wish]) => {
    const n = (seen[skill] = (seen[skill] || 0) + 1);
    const usual = n === 1 ? defaultTask(skill, levelId) : secondTask(skill, levelId);
    let task = wish.find((t) => usable(t) && taskFit(t, levelId).fit === "great")
      || (usable(usual) ? usual : null)
      || tasksFor(skill, levelId).map((t) => t.id).find((t) => usable(t) && taskFit(t, levelId).fit === "great")
      // Nothing left that is just right: the nearest one (tasksFor ranks a stretch before an easy task).
      || tasksFor(skill, levelId).map((t) => t.id).find(usable)
      || usual;
    if (!pictures && TASKS[task]?.needs?.includes("pictures")) task = fallbackTask(task, levelId);
    used.add(task);
    return makePart(skill, task, levelId);
  });
}

/** Parts for a length preset at a level (its classic template), skipping picture tasks when pictures are off or missing. */
export function presetParts(length, levelId, { pictures = true } = {}) {
  return templateParts(LENGTHS[length] ? length : "standard", levelId, { pictures });
}

/** Fresh settings for a test. */
export function testDefaults(levelId = "B_SENIOR", length = "standard", template = "") {
  const tpl = templateFor(template, length);
  return {
    levelId,
    length: tpl.length,
    template: tpl.id,
    parts: templateParts(tpl.id, levelId),
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

/** The chosen words as a test keeps them (Step 1's words, with what the word check and the families need). */
export function docWordList(words = []) {
  return (words || []).filter((w) => w?.english).map((w) => ({ english: w.english, type: w.type || "", greek: w.greek || "", ...(w.own ? { own: true } : {}), ...Object.fromEntries(["derivatives", "synonyms", "antonyms"].filter((k) => w[k]).map((k) => [k, w[k]])) }));
}

/** Rough minutes a test takes (items × level pace + writing and listening time). */
export function estimateMinutes(spec) {
  const d = TEST_DEFAULTS[spec.levelId] || TEST_DEFAULTS.B_SENIOR;
  return Math.round(spec.parts.reduce((m, p) => {
    const t = TASKS[p.task];
    if (p.skill === "writing") return m + Math.max(8, Math.round((p.words?.[1] || 40) / 5));
    if (p.skill === "speaking") return m + 0; // done one by one, outside the written time
    const reading = t?.needs?.includes("passage") ? { short: 3, medium: 4, long: 6 }[p.opts?.length] || 4 : 0;
    return m + p.items * d.minutesPerItem + (p.skill === "listening" ? 3 * (p.opts?.plays === 1 ? 0.6 : 1) : reading || 1) + (t?.bank ? 1 : 0);
  }, 0));
}

export const partPoints = (p) => (TASKS[p.task]?.answer === "open" ? p.points || 10 : (p.items || 0) * (p.pointsEach || 1));
export const specPoints = (spec) => spec.parts.reduce((n, p) => n + partPoints(p), 0);

/* ── What the Step 1 source allows ────────────────────────────────────
 * A coursebook unit brings words, pictures, a Big Question and its own grammar (from the book's example
 * sentences). "A grammar point or topic" brings only the teacher's own words (if any): no picture tasks
 * unless those words have pictures, no Big Question. */

/** The task used instead of one the source can't support. */
export const TASK_FALLBACK = { "L-PIC": "L-MC", "V-PIC": "V-BANK", "V-TICK": "V-MC", "W-PICTURES": "W-GUIDED", "S-PICTURE": "S-QUESTIONS", "S-STORY": "S-QUESTIONS", "S-DISCUSS": "S-ROLE", "S-BQ": "S-QUESTIONS" };

/**
 * Why a task can't be used with this source ("" when it can).
 * src: { kind: "unit" | "topic", hasUnit, pictureWords: n } ("words": tests written from the old Worksheets list)
 */
export function taskBlock(taskId, src = {}) {
  const t = TASKS[taskId];
  if (!t) return "unknown task";
  if (t.needs?.includes("pictures") && (src.pictureWords ?? 0) < 3) return src.kind === "topic" ? "needs 3+ words with pictures (add them under the topic)" : "needs 3+ chosen words with pictures";
  if (taskId === "S-BQ" && !src.hasUnit) return "needs a coursebook unit";
  return "";
}

/** A task for a skill that this source supports: the class default, else its fallback, else the first that works. */
export function taskForSource(skill, levelId, src) {
  const first = defaultTask(skill, levelId);
  if (!taskBlock(first, src)) return first;
  const fb = fallbackTask(first, levelId);
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
    const fb = fallbackTask(p.task, levelId);
    const to = fb && !taskBlock(fb, src) ? fb : taskForSource(p.skill, levelId, src);
    if (to === p.task) continue;
    const fresh = makePart(p.skill, to, levelId);
    const wasOpen = TASKS[p.task].answer === "open";
    changed.push({ id: p.id, from: p.task, to, reason });
    // Same number of questions when both tasks have questions; level defaults otherwise.
    Object.assign(p, { task: to, items: TASKS[to].answer === "open" || wasOpen ? fresh.items : p.items, points: fresh.points, words: fresh.words, opts: {} });
  }
  return changed;
}

/** Which kind of unit text suits a reading task best: a story for "who" and "in order", otherwise a fact text first. */
const TEXT_PREFERENCE = { "R-ORDER": ["story", "everyday", "fact"], "R-WHO": ["story", "everyday", "fact"] };

/** A unit text for a reading part (texts: the unit's texts; used: ids other parts already read). */
export function suggestText(task, texts = [], used = new Set()) {
  const order = TEXT_PREFERENCE[task] || ["fact", "story", "everyday"];
  for (const kind of order) {
    const t = texts.find((x) => x.kind === kind && !used.has(x.id));
    if (t) return t.id;
  }
  return texts.find((x) => !used.has(x.id))?.id || "";
}

/** The title a test gets when the teacher leaves the field empty (the AI names topic tests). */
export function defaultTitle(src = {}) {
  if (src.kind === "unit" && src.units?.length) return `Unit${src.units.length > 1 ? "s" : ""} ${src.units.join(", ")} Test`;
  if (src.kind === "words" && src.unit) return `Unit ${src.unit} Test`;
  return "";
}

/** Word-answer tasks: every item needs its own tested word. */
const ONE_WORD_EACH = ["V-PIC", "V-BANK", "V-MC", "V-MATCH", "V-DEF", "V-SPELL", "R-GAP"];

/** Problems with the plan before any AI call (each one blocks "Write my test"). */
export function planProblems(spec, { pictureWords = [], focusWords = [], hasUnit } = {}) {
  const out = [];
  const kind = spec.source?.kind;
  if (!spec.parts.length) out.push("Add at least one part.");
  if (kind === "topic" && !String(spec.topic || "").trim() && !(spec.grammar || []).length && !focusWords.length) out.push("Type the topic, choose the grammar to test, or add the words to use.");
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

/**
 * What the class learned with the chosen words (from the word bank or the teacher's list): word families, opposites
 * and synonyms, as [word, related] pairs.
 */
export function taughtRelations(focus = []) {
  const out = { derivatives: [], antonyms: [], synonyms: [] };
  for (const w of focus) for (const k of Object.keys(out)) for (const t of relatedTerms(w?.[k])) out[k].push([w.english, t]);
  return out;
}

const FAMILY_TASKS = ["V-FORM", "V-FAMMC"];
const OPPOSITE_TASKS = ["V-OPP", "V-OPPW"];

/** The prompt line for a part that asks for families, opposites or synonyms: the taught ones first. */
function relationLine(task, focus) {
  const r = taughtRelations(focus);
  if (FAMILY_TASKS.includes(task)) return r.derivatives.length
    ? `  TAUGHT FAMILIES — use these first (base word → the form the class learned): ${r.derivatives.map(([a, b]) => `${a.toUpperCase()} → ${b}`).join(", ")}. They may go beyond the class ladder: the class learned them.`
    : "";
  if (OPPOSITE_TASKS.includes(task)) return r.antonyms.length
    ? `  TAUGHT OPPOSITES — use these first: ${r.antonyms.map(([a, b]) => `${a} ↔ ${b}`).join(", ")}. Other items: unit words with a clear, common opposite the class knows (big ↔ small).`
    : "  No opposites are listed for these words: choose unit words with a clear, common opposite the class knows (big ↔ small, push ↔ pull); skip words without one.";
  if (task === "V-SYN") return r.synonyms.length
    ? `  TAUGHT SYNONYMS — use these first: ${r.synonyms.map(([a, b]) => `${a} = ${b}`).join(", ")}. Other items: unit words with a common word of the same meaning the class knows.`
    : "  No synonyms are listed for these words: choose unit words that have a common word of the same meaning the class knows (big = large); skip words without one.";
  return "";
}

/** Soft notes (never block): word-answer parts asking for more answers than there are tested words. */
export function planNotes(spec, { focusWords = [] } = {}) {
  const notes = [];
  if (spec.source?.kind !== "topic" && focusWords.length) {
    spec.parts.forEach((p, i) => {
      if (TASKS[p.task]?.bank && TASKS[p.task]?.answer !== "match" && p.items > focusWords.length) notes.push(`Part ${i + 1} has ${p.items} questions but only ${focusWords.length} word${focusWords.length === 1 ? " is" : "s are"} chosen — a word box needs a different word for each gap: choose more words or fewer questions.`);
      else if (ONE_WORD_EACH.includes(p.task) && p.items > focusWords.length) notes.push(`Part ${i + 1} has ${p.items} questions but only ${focusWords.length} word${focusWords.length === 1 ? " is" : "s are"} chosen, so some words will come twice.`);
    });
  }
  const r = taughtRelations(focusWords);
  spec.parts.forEach((p, i) => {
    if (OPPOSITE_TASKS.includes(p.task) && !r.antonyms.length) notes.push(`Part ${i + 1}: none of the chosen words has an opposite in its list, so Lingo picks unit words with a common opposite (you can add opposites in Worksheets → Words).`);
    if (p.task === "V-SYN" && !r.synonyms.length) notes.push(`Part ${i + 1}: none of the chosen words has a synonym in its list, so Lingo picks unit words with a common synonym.`);
  });
  // A ready-made reading text is printed as it is: a short text can't carry very many questions.
  spec.parts.forEach((p, i) => {
    const text = TASKS[p.task]?.answer !== "open" && partOpts(p, spec.levelId).text ? readingText(partOpts(p, spec.levelId).text) : null;
    if (text && p.items > textCapacity(text.text)) notes.push(`Part ${i + 1}: “${text.title}” is short for ${p.items} questions (about ${textCapacity(text.text)} fit) — choose “Lingo writes a text” for a longer one, or fewer questions.`);
  });
  return notes;
}

const GENRE = { story: "a story with named characters", article: "a fact text (like a children's magazine article)", email: "an email or a letter", diary: "a diary entry or a blog post", dialogue: "a dialogue between two or three people (Name: line)", notice: "a poster, notice or advertisement with short lines" };
const AUDIO = { dialogue: "a dialogue between two speakers", talk: "one speaker: a phone message, a short talk or a description", interview: "an interview (one speaker asks, the other answers)", announcement: "an announcement (at school, a station, a museum) by one speaker" };
const SUPPORT = {
  full: "Support: LOTS — frame = 4–5 sentence starters, and \"bank\" = 6–8 useful words for a word box.",
  some: "",
  none: "Support: NONE — frame = only the points to cover, as short notes, no sentence starters.",
};

/** "Finish the sentences" always prints starters: support only changes how much each starter gives. */
const SENTENCE_SUPPORT = {
  "W-SENT": {
    full: "Support: LOTS — frame = 5–6 long, guiding sentence starters, and \"bank\" = 6–8 useful words for a word box.",
    some: "",
    none: "Support: LITTLE — frame = 5–6 SHORT sentence starters (\"I like…\", \"On Saturdays, I…\"); still starters, never notes or questions.",
  },
};

/** The knob settings of a part as prompt lines. */
/** Word families, by class: which word-building changes each class meets (Pre-A1 endings → B1 word formation). */
const FAMILY_LADDER = [
  "A Senior: ONE easy, very common change to a word the children know: plural -s / -es (CAT → cats), a person who does it with -er (TEACH → teacher, FARM → farmer), weather and feeling words with -y (SUN → sunny, RAIN → rainy). Short, concrete sentences; never a prefix.",
  "B Senior: ONE common change: -er / -or people (PLAY → player), -y adjectives (SALT → salty, DIRT → dirty), -ful (COLOUR → colourful), the opposite with un- (HAPPY → unhappy), -ly for how (SLOW → slowly).",
  "C Senior: one change: -ful / -less (CARE → careful, careless), un- / dis- opposites, -ly adverbs, -er / -ist / -ian people (ART → artist, MUSIC → musician), -y adjectives.",
  "D Senior: noun, verb and adjective families: -ness, -tion / -sion, -ment, -able, -ous, dis- / im- / in- opposites (DECIDE → decision, ENJOY → enjoyable, POSSIBLE → impossible).",
  "E Senior: B1 word formation: any of the above, some with two changes (CARE → carelessly, HELP → unhelpful) or a spelling change (DECIDE → decision, FAME → famous); the sentence decides the word class.",
];

function knobLines(p, spec, focus = []) {
  const t = TASKS[p.task];
  const o = partOpts(p, spec.levelId);
  const out = [];
  const text = o.text ? readingText(o.text) : null;
  if (text) {
    out.push(`  READING TEXT (given — the app prints it exactly as below; do NOT write a passage or a passageTitle): "${text.title}"\n    ${text.text.replace(/\n+/g, "\n    ")}`);
    out.push("  Every question is about THIS text and is answered by it alone; never ask about something the text doesn't say.");
    if (t.answer !== "open" && p.items > textCapacity(text.text)) out.push(`  The text is short for ${p.items} questions: use every detail it has (who, what, where, when, how many, why) — still exactly ${p.items} different questions, never the same one twice.`);
  } else if (t.needs?.includes("passage") && p.skill !== "writing") {
    const [a, b] = partTextWords(p, spec.levelId);
    out.push(`  The text: ${a}–${b} words${o.genre && o.genre !== "any" ? `, ${GENRE[o.genre]}` : ""}, with a short title${t.answer !== "open" ? ` — long enough that each of the ${p.items} questions (and the example) is about a different detail` : ""}.`);
  }
  if (o.audio && o.audio !== "any") out.push(`  The recording: ${AUDIO[o.audio]}.`);
  if (o.plays === 1) out.push("  It is played ONCE: every answer is said slowly and clearly, never in the middle of a long sentence.");
  if (o.support && (SENTENCE_SUPPORT[p.task] || SUPPORT)[o.support]) out.push(`  ${(SENTENCE_SUPPORT[p.task] || SUPPORT)[o.support]}`);
  if (FAMILY_TASKS.includes(p.task)) out.push(`  CLASS LADDER — ${FAMILY_LADDER[levelIndex(spec.levelId)]}`);
  const rel = relationLine(p.task, focus);
  if (rel) out.push(rel);
  return out;
}

/** What the word box of a gap-fill part must hold: one word per gap, or the answers plus exactly N extra words. */
export function wordBoxRule(p, spec) {
  const extras = partOpts(p, spec.levelId).extras || 0;
  const head = `WORD BOX ("bank"): every item has a DIFFERENT answer (never the same word twice), and the example's answer is not in the box.`;
  if (!extras) return `${head} The box = EXACTLY the ${p.items} answers, each once, in the form that fits its gap — NO extra words, so gaps and words match one to one.`;
  return `${head} The box = the ${p.items} answers (in the form that fits each gap) plus EXACTLY ${extras} extra word${extras > 1 ? "s" : ""} that fit${extras > 1 ? "" : "s"} NO gap — unit words of the same word class as the answers, never a form of an answer — ${p.items + extras} words in all. Don't mention the extra words in the rubric: the app writes that line.`;
}

function partBrief(p, i, spec, pictureWords, focus = []) {
  const t = TASKS[p.task];
  const lines = [`PART ${i + 1} — id "${p.id}" — ${SKILLS[p.skill].label}: ${t.label} [${p.task}]`, `  What to write: ${t.ai}`];
  if (t.answer !== "open") lines.push(`  Items: exactly ${p.items}, plus ONE extra "example" item (shown solved as item 0, not counted). Never fewer: if the text or script seems too short, make it longer.`);
  if (t.needs?.includes("script") && t.answer !== "open") lines.push(`  The script holds every answer: at least ${scriptLines(p)} lines, each answer (and the example's) said in its own place, in the order of the questions.`);
  if (t.answer === "choice") lines.push(`  Each item: "options" (${t.knobs?.includes("options") ? partOpts(p, spec.levelId).options : t.options || 3}) and "answer" = the exact text of the right option.`);
  if (t.answer === "tf") {
    const [yes, no] = tfLabels(spec.levelId);
    lines.push(`  Answer each with "${yes}" or "${no}" in THIS order: ${balancedPattern(tfLabels(spec.levelId), p.items).join(", ")}.`);
    const src = p.skill === "listening" ? "script" : "text";
    if (t.needs?.includes("script") || t.needs?.includes("passage") || TASKS[p.task]?.knobs?.includes("text")) lines.push(`  Write the ${src} first, then one statement per item. A "${yes}" statement says what the ${src} says; a "${no}" statement changes one detail (who, what, where or when) so the ${src} clearly says otherwise. Every statement is about something the ${src} says. Never key "${no}" for something that is said.`);
    if (t.needs?.includes("script") || t.needs?.includes("passage") || TASKS[p.task]?.knobs?.includes("text")) lines.push(`  Each item (and the example) also has "evidence": the exact words of the ${src} that decide its answer.`);
  }
  lines.push(...knobLines(p, spec, focus));
  if (t.bank && t.answer !== "match") lines.push(`  ${wordBoxRule(p, spec)}`);
  if (p.skill === "writing" && p.words) lines.push(`  Students write ${p.words[0]}–${p.words[1]} words.`);
  if (p.skill === "speaking") {
    const n = SPEAKING_CARDS[spec.levelId] || 3;
    lines.push(`  Speaking: "warmup" = 2 easy opening questions; "cards" = exactly ${n} cards, easy to harder. Each card: "title" (2–4 words), "student" (one short instruction the student reads, e.g. "Talk about your favourite place."), "keyWords" (3–5 unit words to use), "questions" (3–4 questions the teacher asks, in order, easy to harder), "followUps" (1–2 "Why?"-type questions for stronger students), "model" (a short model answer at class level using the key words).`);
  }
  lines.push(`  Difficulty of this part: ${PART_LEVELS[partLevel(p)].label} — ${levelGuide(p)}.`);
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

JSON: { "title": "short test title", "sections": [ { "id": "<part id>", "passageTitle": "", "passage": "", "script": [ { "speaker": "Name", "text": "line" } ], "bank": [], "example": { "prompt": "", "options": [], "answer": "" }, "items": [ { "prompt": "", "options": [], "answer": "" } ], "prompt": "", "frame": [], "pictures": [], "prompts": [], "sample": "", "warmup": [], "cards": [ { "title": "", "student": "", "keyWords": [], "questions": [], "followUps": [], "model": "" } ] } ] }
Only include the fields a part needs. One object per part, same ids, same order.`;
  const hasUnit = !topicMode && !!ctx.unitContext;
  const topic = String(spec.topic || "").trim();
  const grammar = spec.grammar || [];
  const rules = [
    topicMode
      ? topic
        ? `Topic: ${topic} — choose vocabulary the class knows; every part is about this topic${grammar.length ? "" : " (if it names grammar, the grammar parts test that grammar)"}.`
        : `Topic: everyday situations this class knows (home, school, friends, free time) — choose vocabulary the class knows; ${grammar.length ? "the grammar focus below is what this test is about" : "the words below are what this test is about"}.`
      : `TEST THESE WORDS (answers come only from this list; a word may be inflected to fit — in word-family, opposite and synonym parts the CAPITALS word is from this list and the answer is its form, opposite or synonym): ${focus.map((w) => `${w.english}${w.type ? ` (${w.type})` : ""}`).join(", ")}`,
    relationsRule(focus),
    // A topic test can still have words the teacher wants: the vocabulary parts test exactly those.
    topicMode && focus.length ? `TEST THESE WORDS in the vocabulary parts (their answers come only from this list; a word may be inflected to fit); the other parts use them where they fit: ${focus.map((w) => `${w.english}${w.type ? ` (${w.type})` : ""}`).join(", ")}` : "",
    !topicMode && focus.some((w) => w.own) ? `The teacher added some words of their own (not from the unit): ${focus.filter((w) => w.own).map((w) => w.english).join(", ")} — test them like the others and use them naturally in the texts.` : "",
    topicMode ? "" : hasUnit ? "Texts and scripts may also use other words of the unit listed below and very common words; nothing above the class level." : "Texts and scripts may also use very common words; nothing above the class level.",
    grammar.length
      ? `Grammar focus (grammar parts test it; other parts may use it): ${grammar.join(", ")}`
      : hasUnit ? "Grammar: the grammar the unit's example sentences show, at this class level." : "Grammar: what this class already knows (see the class profile) — nothing new.",
    topic && !topicMode ? `${hasUnit ? "Context the teacher wants for the texts" : "The texts and scripts are about"}: ${topic}` : "",
    `Difficulty: ${DIFFICULTY[spec.difficulty]?.note || DIFFICULTY.level.note}`,
    "Listening scripts: only what the speakers say — no rubric, no narrator saying \"Listen and…\". Natural spoken English for children, 2 speakers with first names (a child and an adult, or two children), short turns, every answer clearly said once; distractors may be mentioned. No sound effects.",
    "Every non-writing, non-speaking part MUST include its \"example\" item.",
    "Reading texts: the length each part asks for, a clear title, about the unit topic. A text the plan gives is used as it is.",
    "Every correct answer must be clearly right and every wrong option clearly wrong. No trick questions. No Greek anywhere.",
    "Every part has its own sentences: never reuse a sentence or item from another part, even with a different task.",
    "Facts in texts and scripts must be true (lava is hot, ash is grey); only the \"no\" statements may be wrong.",
    DISTRACTOR_RULE,
    "When a part tests two grammar points, each item tests ONE of them and the items alternate between them.",
  ].filter(Boolean);
  const rewrite = rewriteBlock(ctx.rewrite, parts);
  const user = `${topicMode ? "" : `UNIT CONTEXT\n${unitContextPrompt(ctx.unitContext)}\n\n`}RULES\n${rules.map((r) => `- ${r}`).join("\n")}\n\nLOCKED TEST PLAN (${parts.length} part${parts.length === 1 ? "" : "s"})\n${parts.map((p) => partBrief(p, spec.parts.indexOf(p), spec, ctx.pictureWords || [], focus)).join("\n")}${rewrite ? `\n\n${rewrite}` : ""}`;
  return { system, user };
}

/** One rule listing what the class learned with the words; "" when nothing is listed. */
function relationsRule(focus) {
  const r = taughtRelations(focus);
  const bits = [
    ...r.derivatives.map(([a, b]) => `${a} → ${b}`),
    ...r.antonyms.map(([a, b]) => `${a} ↔ ${b} (opposite)`),
    ...r.synonyms.map(([a, b]) => `${a} = ${b} (same meaning)`),
  ];
  return bits.length ? `The class learned these word families, opposites and synonyms with the words — they count as the words, and word-family, opposite and synonym questions use them first: ${bits.join("; ")}` : "";
}

/** A part as it is now, in a few lines (so a rewrite can be told what to move away from). */
function partDigest(s) {
  return [
    s.passageTitle || s.passage ? `text: ${s.passageTitle ? `"${s.passageTitle}" ` : ""}${String(s.passage || "").slice(0, 160)}…` : "",
    s.script?.length ? `script: ${s.script.slice(0, 3).map((l) => `${l.speaker}: ${l.text}`).join(" / ")}…` : "",
    s.task_prompt ? `task: ${s.task_prompt}` : "",
    s.cards?.length ? `cards: ${s.cards.map((c) => c.title).join(", ")}` : "",
    s.items?.length ? `questions: ${s.items.map((it) => `${it.prompt || ""}${it.answer ? ` → ${it.answer}` : ""}`).join(" | ")}` : "",
  ].filter(Boolean).join("\n  ");
}

/** Writing a part again: the teacher's wish first, and the old version to move away from. rewrite: { wish, previous: [sections] } */
function rewriteBlock(rewrite, parts) {
  if (!rewrite) return "";
  const old = parts.map((p) => (rewrite.previous || []).find((s) => s.id === p.id)).filter(Boolean);
  return [
    "THIS IS A REWRITE — it must be clearly NEW: a new text or script (new situation, new names, new title) and new questions; do not reuse sentences, situations or the same tested words where others fit.",
    parts.some((p) => p.opts?.text) ? "A part with a READING TEXT given keeps that text: write new questions about it." : "",
    rewrite.wish ? `THE TEACHER ASKED FOR THIS REWRITE (follow it exactly, it comes before everything else): "${rewrite.wish}"` : "",
    old.length ? `THE OLD VERSION (move away from it):\n  ${old.map(partDigest).join("\n  ")}` : "",
  ].filter(Boolean).join("\n");
}

/** How much a rewritten part still looks like the old one (0 = all new, 1 = the same), from its text and questions. */
export function partSimilarity(a, b) {
  const bag = (s) => new Set(`${s?.passage || ""} ${(s?.script || []).map((l) => l.text).join(" ")} ${(s?.items || []).map((it) => `${it.prompt} ${it.answer}`).join(" ")} ${s?.task_prompt || ""}`.toLowerCase().match(/[a-z]{3,}/g) || []);
  const A = bag(a);
  const B = bag(b);
  if (!A.size || !B.size) return 0;
  return [...A].filter((x) => B.has(x)).length / new Set([...A, ...B]).size;
}

/**
 * A second, small AI call that answers each yes/no (true/false) statement from the text alone.
 * The writer is told the answer order before it writes, and a real run still keyed "no" for something the
 * script said, so the key is checked by a reader who only sees the text. Returns null when there's nothing to check.
 */
export function keyCheckPrompt(doc, onlyParts = null) {
  // Only parts with a text or a script can be re-answered from it (a picture task has neither).
  const parts = (doc?.sections || []).filter((s) => s.answerType === "tf" && s.items.length && (s.passage || s.script?.length) && (!onlyParts || onlyParts.includes(s.id)));
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

/* ── Fixing only what is wrong ─────────────────────────────────────
 * A part's problems name its items ("item 3: …", "items 2, 4 should be \"no\""). Those items are rewritten alone,
 * with the part's text and the other items as context; a part whose text, script or items are missing is
 * written again whole. */

/** Which items a part's problems are about: { items: [n…], whole } — whole when the part itself must be rewritten. */
export function problemTargets(section) {
  const items = new Set();
  let whole = false;
  for (const p of section?.problems || []) {
    if (/missing the|did not write this part|has \d+ of \d+ items/.test(p)) { whole = true; continue; }
    const m = String(p).match(/\bitems?\s+(\d+(?:\s*(?:,|and)\s*\d+)*)/i);
    if (m) m[1].split(/\D+/).filter(Boolean).forEach((n) => items.add(Number(n)));
    else whole = true;
  }
  const list = [...items].filter((n) => n >= 1 && n <= (section?.items?.length || 0)).sort((a, b) => a - b);
  return { items: list, whole: whole || (!list.length && !!section?.problems?.length) };
}

/** Answers the problems ask for: { n: "no" } from "items 2, 4 should be \"no\"". */
function requiredAnswers(section) {
  const out = {};
  for (const p of section?.problems || []) {
    const m = String(p).match(/items?\s+([\d,\s]+(?:and\s+\d+)?)\s+should be "([^"]+)"/i);
    if (m) m[1].split(/\D+/).filter(Boolean).forEach((n) => { out[Number(n)] = m[2]; });
  }
  return out;
}

/** Parts whose answers must be the tested words (their answers are checked against them). */
const SCOPED = ["V-PIC", "V-BANK", "V-MC", "V-DEF", "V-SPELL", "R-GAP", "L-GAP"];

/** A small prompt that rewrites only some items of a part. ctx: { profileBlock, focusWords, pictureWords } */
export function fixItemsPrompt(spec, section, itemNs, ctx = {}) {
  const plan = spec.parts.find((x) => x.id === section.id) || { id: section.id, task: section.task, skill: section.skill, items: section.items.length };
  const idx = Math.max(0, spec.parts.indexOf(plan));
  const t = TASKS[section.task] || {};
  const src = section.script?.length ? "script" : section.passage ? "text" : "";
  const must = requiredAnswers(section);
  const show = (it) => `${it.n}. ${it.prompt || ""}${it.options?.length ? ` [${it.options.join(" | ")}]` : ""} → ${it.answer || ""}`;
  const system = `You fix single questions in an English test for Greek learners in a language school. Return ONLY valid JSON: { "items": [ { "n": 3, "prompt": "", "options": [], "answer": ""${t.answer === "tf" ? ', "evidence": "the exact words of the ' + (src || "text") + ' that decide it"' : ""} } ] } — only the items asked for, with their numbers.
${ctx.profileBlock || ""}`;
  const focus = (ctx.focusWords || []).map((w) => w.english).filter(Boolean);
  const user = [
    partBrief(plan, idx, spec, ctx.pictureWords || [], ctx.focusWords || []),
    section.script?.length ? `SCRIPT:\n${section.script.map((l) => `${l.speaker}: ${l.text}`).join("\n")}` : "",
    section.passage ? `TEXT${section.passageTitle ? ` "${section.passageTitle}"` : ""}:\n${section.passage}` : "",
    section.bank?.length && section.answerType !== "match" ? `WORD BOX: ${section.bank.join(", ")}` : "",
    `THE ITEMS NOW:\n${section.items.map(show).join("\n")}`,
    section.problems?.length ? `PROBLEMS:\n${section.problems.map((p) => `- ${p}`).join("\n")}` : "",
    ctx.instruction ? `FOR ITEM${itemNs.length > 1 ? "S" : ""} ${itemNs.join(", ")} (these rules come first):
${ctx.instruction}` : "",
    `REWRITE ONLY items ${itemNs.join(", ")}. Keep the same task and the same kind of question; every other item stays exactly as it is, so never repeat one of them.${t.bank && t.answer !== "match" ? " Each gap needs a different word: never the answer of another item (the app makes the word box from the answers again)." : ""}${src ? ` Every item must be answerable from the ${src} above.` : ""}${focus.length ? (SCOPED.includes(section.task) ? ` Answers come only from these words (inflected if needed): ${focus.join(", ")}.` : ` Use words the class knows (the unit words where they fit: ${focus.slice(0, 30).join(", ")}).`) : ""}`,
    Object.keys(must).length ? `Required answers: ${Object.entries(must).map(([n, a]) => `item ${n} = "${a}"`).join(", ")}.` : "",
    t.answer === "choice" ? DISTRACTOR_RULE : "",
  ].filter(Boolean).join("\n\n");
  return { system, user };
}

/** A section back into the AI's shape (to normalize it again after some items change). */
function sectionToRaw(s) {
  const item = (it) => (it ? { prompt: it.prompt, options: it.options, answer: it.answer, evidence: it.evidence, picture: it.picWord, reveal: it.reveal } : null);
  return {
    items: (s.items || []).map(item), example: item(s.example), passage: s.passage, passageTitle: s.passageTitle, script: s.script,
    frame: s.frame, prompts: s.prompts, sample: s.sample, prompt: s.task_prompt, pictures: (s.pictures || []).map((p) => p.word),
    bank: s.answerType === "match" ? [] : s.bank, extraWords: s.extraWords, rubric: s.rubric, warmup: s.warmup, cards: s.cards,
  };
}

/**
 * Put the AI's rewritten items into a doc's part and check the part again. Returns the item numbers changed.
 * ctx: { picFor, focusWords }
 */
export function applyItemFixes(doc, spec, sectionId, reply, itemNs, ctx = {}) {
  const want = new Set(itemNs.map(Number));
  const changed = [];
  const ok = reviseSection(doc, spec, sectionId, (raw) => {
    for (const it of Array.isArray(reply?.items) ? reply.items : []) {
      const n = Number(it?.n);
      if (!want.has(n) || !raw.items[n - 1] || changed.includes(n)) continue;
      // The teacher’s letter help stays while the answer does.
      const old = raw.items[n - 1];
      raw.items[n - 1] = { prompt: it.prompt ?? it.question ?? "", options: it.options, answer: it.answer, evidence: it.evidence, picture: it.picture ?? old.picture, ...(old.reveal !== undefined && String(it.answer || "").trim().toLowerCase() === String(old.answer || "").trim().toLowerCase() ? { reveal: old.reveal } : {}) };
      changed.push(n);
    }
    return changed.length > 0;
  }, ctx);
  return ok ? changed.sort((a, b) => a - b) : [];
}

/**
 * Change a part of a doc and check it again (the teacher's edits on the paper, and the AI's single-question fixes).
 * edit(raw) changes the part in the AI's shape and returns false to cancel. The part's pictures stay when no picFor is
 * given. Returns true when the part changed. ctx: { picFor, focusWords }
 */
export function reviseSection(doc, spec, sectionId, edit, ctx = {}) {
  const s = doc?.sections?.find((x) => x.id === sectionId);
  if (!s) return false;
  const raw = sectionToRaw(s);
  if (edit(raw) === false) return false;
  const plan = spec?.parts?.find((x) => x.id === sectionId) || { id: s.id, task: s.task, items: s.items.length };
  const picFor = spec?.pictures !== false ? ctx.picFor || keepPics(s) : null;
  const fresh = normalizeSection({ ...plan, items: raw.items.length, points: s.points, pointsEach: s.pointsEach, words: s.words }, raw, { levelId: doc.meta?.classProfile || spec?.levelId, picFor, spareWords: spareFirst(spareWords(ctx.focusWords, doc.focusWords), doc, sectionId) });
  fresh.problems.push(...scopeProblems(fresh, ctx.focusWords));
  fresh.plays = s.plays || fresh.plays;
  fresh.rubricEl = s.rubricEl || fresh.rubricEl;
  Object.assign(s, fresh);
  // The kept Greek line says how many extra words the old box had: say it for the new box.
  if (hasWordBox(s)) { const r = sectionRubric(s); s.rubric = r.en; s.rubricEl = r.el; }
  doc.meta.points = docPoints(doc);
  return true;
}

/** Words a word box may take its extra words from when the AI gave too few: the test's words. */
function spareWords(...lists) {
  return [...new Set(lists.flat().map((w) => String((typeof w === "string" ? w : w?.english) || "").trim()).filter(Boolean))];
}

/** Spare words that no other part has as an answer come first (an extra word shouldn't be another part's answer if it can help it). */
function spareFirst(list, doc, sectionId) {
  const used = new Set((doc?.sections || []).filter((x) => x.id !== sectionId).flatMap((x) => (x.items || []).map((it) => String(it.answer || "").trim().toLowerCase())));
  return [...list.filter((w) => !used.has(w.toLowerCase())), ...list.filter((w) => used.has(w.toLowerCase()))];
}

/** A picFor that only knows the pictures a part already has (so an edit keeps them). */
function keepPics(s) {
  const map = new Map();
  const add = (word, pic) => { if (word && pic) map.set(String(word).trim().toLowerCase(), pic); };
  [s.example, ...(s.items || [])].filter(Boolean).forEach((it) => { add(it.answer, it.pic); (it.options || []).forEach((o, i) => add(o, it.optionPics?.[i])); });
  (s.pictures || []).forEach((p) => add(p.word, p.pic));
  return map.size ? (w) => map.get(String(w || "").trim().toLowerCase()) || null : null;
}

/** Answers outside the tested words, per part (vocabulary, reading gaps and listening gaps). */
function scopeProblems(section, focusWords) {
  if (!focusWords?.length || !SCOPED.includes(section.task)) return [];
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
    const s = normalizeSection(p, raw || {}, { levelId: spec.levelId, picFor: spec.pictures !== false ? ctx.picFor : null, spareWords: spareWords(ctx.focusWords || []) });
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
    focusWords: docWordList(ctx.focusWords),
    meta: {
      title,
      // A unit test's "Primary Path 2 · Unit 4" is its label: the book and unit already print on the right of the header.
      subtitle: spec.source?.kind === "topic" ? meta.label || [spec.topic, ...(spec.grammar || [])].filter(Boolean).join(" · ") : "",
      label: spec.source?.kind === "topic" ? "" : meta.label || "",
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
