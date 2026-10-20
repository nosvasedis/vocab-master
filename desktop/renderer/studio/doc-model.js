/* Vocab Master — the printable document model shared by unit tests and dictations (pure).
 * A doc is { kind, meta, sections[] }. Each section is one task (a test part or a dictation) with its
 * items, optional reading passage / listening script / word bank / writing frame, and points.
 * This module turns AI output into clean sections, balances answer keys, builds an A/B version and
 * totals the points. Rendering lives in doc-render.js. */
import { TASKS, SKILLS, tfLabels, rubricFor, partOpts } from "./tasks.js";
import { readingText } from "./reading-texts.js";
import { balancedPositions, binaryBalance } from "./answer-balance.js";

export const LETTERS = "abcdefgh";

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const lc = (s) => clean(s).toLowerCase().replace(/[.!?]+$/, "");
const squash = (s) => String(s ?? "").toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9']+/g, " ").trim();

function shuffled(arr, rand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Canonical two-answer value: 0 = yes / true, 1 = no / false, -1 = neither. */
export function tfValue(answer) {
  const a = lc(answer);
  if (/^(y|yes|t|true|σωστό)$/.test(a)) return 0;
  if (/^(n|no|f|false|λάθος)$/.test(a)) return 1;
  return -1;
}

/** One item, cleaned for its task's answer type. Returns { item, problems[] }. */
export function normalizeItem(raw, task, { levelId, picFor } = {}) {
  const t = TASKS[task] || {};
  const problems = [];
  const item = { prompt: clean(raw?.prompt ?? raw?.question ?? raw?.text ?? "") };
  if (t.answer === "choice") {
    let options = (Array.isArray(raw?.options) ? raw.options : []).map(clean).filter(Boolean);
    options = options.filter((o, i) => options.findIndex((x) => lc(x) === lc(o)) === i);
    let answer = clean(raw?.answer);
    let idx = options.findIndex((o) => lc(o) === lc(answer));
    if (idx < 0 && /^[a-h]$/i.test(answer)) idx = LETTERS.indexOf(answer.toLowerCase());
    if (idx < 0 && answer) { options.push(answer); idx = options.length - 1; problems.push("answer was not among the options"); }
    if (options.length < 2) problems.push("needs at least two options");
    item.options = options;
    item.answerIndex = idx;
    item.answer = options[idx] ?? answer;
    if (t.needs?.includes("pictures") && picFor) {
      const pics = options.map((o) => picFor(o));
      if (pics.every(Boolean)) item.optionPics = pics;
    }
  } else if (t.answer === "tf") {
    const v = tfValue(raw?.answer);
    if (v < 0) problems.push("answer must be yes/no or true/false");
    item.answer = tfLabels(levelId)[Math.max(0, v)];
    item.tf = v;
    if (raw?.evidence) item.evidence = clean(raw.evidence);
  } else {
    item.answer = clean(raw?.answer ?? raw?.sample ?? "");
    if (!item.answer && t.answer !== "open" && task !== "R-ORDER") problems.push("missing answer");
  }
  if (task === "V-PIC" && picFor) {
    const p = picFor(item.answer);
    if (p) item.pic = p;
    else problems.push("no picture for this word");
  }
  return { item, problems };
}

const orderWords = (s) => clean(s).replace(/[.!?]+$/, "").split(/\s*\/\s*|\s+/).filter(Boolean);
const wordBag = (words) => words.map((w) => w.toLowerCase()).sort().join(" ");

/** "Put the words in order": the jumble must hold exactly the answer's words (the AI once gave "a" for "an").
 *  A jumble that doesn't is rebuilt from the answer, never left in answer order. Returns true when it was rebuilt. */
export function repairOrderItem(item, rand = Math.random) {
  const answer = orderWords(item.answer);
  if (answer.length < 2 || wordBag(orderWords(item.prompt)) === wordBag(answer)) return false;
  let jumble = shuffled(answer, rand);
  for (let t = 0; t < 8 && jumble.join(" ") === answer.join(" "); t++) jumble = shuffled(answer, rand);
  item.prompt = jumble.join(" / ");
  return true;
}

/** A word with its letters mixed up ("frog" → "g · o · r · f"), never in the right order. */
export function scramble(word, rand = Math.random) {
  const letters = String(word || "").toLowerCase().replace(/[^a-z]/g, "").split("");
  if (letters.length < 2) return letters.join("");
  let out = shuffled(letters, rand);
  for (let t = 0; t < 12 && out.join("") === letters.join(""); t++) out = shuffled(letters, rand);
  return out.join(" · ");
}

/** Letter help for a word: "first" → "g _ _ _ _ _", "count" → "_ _ _ _ _ _ (6 letters)", "none" → "". */
export function letterHint(word, mode) {
  const w = String(word || "").trim();
  if (!w || mode === "none" || !mode) return "";
  const n = w.replace(/[^A-Za-z]/g, "").length;
  const blanks = (s) => s.split(" ").map((part) => part.replace(/[A-Za-z]/g, "_").split("").join(" ")).join("   ");
  if (mode === "first") return `${w[0].toLowerCase()} ${blanks(w.slice(1)).trim()}`.trim();
  return `${blanks(w)} (${n} letters)`;
}

/**
 * Word-family help, made from the answer and the base word in CAPITALS at the end of the prompt: "root" prints the
 * base word inside the answer's letter boxes (SUN → "s u n _ _"; HAPPY → "_ _ h a p p y"), else the first letter;
 * "count" gives the letter count.
 */
export function familyHint(prompt, answer, mode) {
  const w = String(answer || "").trim();
  if (!w || !mode || mode === "none") return "";
  if (mode === "count") return letterHint(w, "count");
  const base = (String(prompt || "").match(/\(\s*([A-Z][A-Z' -]*?)\s*\)\s*[.?!]?\s*$/) || [])[1];
  const at = base ? w.toLowerCase().indexOf(base.toLowerCase()) : -1;
  if (at < 0 || base.length >= w.length) return letterHint(w, "first");
  return w.split("").map((ch, i) => (i >= at && i < at + base.length) || !/[A-Za-z]/.test(ch) ? ch.toLowerCase() : "_").join(" ");
}

/**
 * "Put the events in order": the example is event 1 and the items come in text order, so the app numbers them
 * 2, 3, 4… and mixes them up (never left in order). Items that already carry a full set of numbers (an edited part)
 * keep them. Each item gets a letter for the paper.
 */
export function orderEvents(example, items, rand = Math.random) {
  const want = items.map((_, i) => String(i + 2));
  const have = items.map((it) => String(it.answer || "").trim());
  if (example) example.answer = "1";
  let list = items;
  if ([...have].sort().join() !== [...want].sort().join()) {
    items.forEach((it, i) => { it.answer = want[i]; });
    list = shuffled(items, rand);
    for (let t = 0; t < 8 && list.length > 1 && list.every((it, i) => it === items[i]); t++) list = shuffled(items, rand);
  }
  list.forEach((it, i) => { it.n = i + 1; it.letter = LETTERS[i]; });
  if (example) example.letter = "";
  return list;
}

/** Option order that spreads the right answer evenly over a, b, c… across a section (other options keep their order). */
export function balanceChoices(items, rand = Math.random) {
  const idx = items.map((it, i) => (Array.isArray(it.options) && it.answerIndex >= 0 ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return;
  const k = Math.min(...idx.map((i) => items[i].options.length));
  const targets = balancedPositions(idx.length, k, rand);
  idx.forEach((i, n) => {
    const it = items[i];
    const want = targets[n] - 1;
    if (want === it.answerIndex || want >= it.options.length) return;
    const move = (arr) => { if (!arr) return arr; const a = [...arr]; const [x] = a.splice(it.answerIndex, 1); a.splice(want, 0, x); return a; };
    it.options = move(it.options);
    it.optionPics = move(it.optionPics);
    it.answerIndex = want;
  });
}

/**
 * A planned section filled with the AI's content.
 * plan: { id, task, items, pointsEach?, points? } · raw: the AI's object for that section.
 * ctx: { levelId, picFor(word) → "@w-…" | "" , greek }
 */
export function normalizeSection(plan, raw = {}, ctx = {}) {
  const task = TASKS[plan.task] || {};
  const problems = [];
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const want = plan.items || rawItems.length;
  let items = [];
  for (const r of rawItems) {
    if (items.length >= want) break;
    const { item, problems: p } = normalizeItem(r, plan.task, ctx);
    if (task.answer !== "open" && !item.prompt && !item.options?.length && !item.pic) continue;
    items.push(item);
    p.forEach((x) => problems.push(`item ${items.length}: ${x}`));
  }
  if (task.answer !== "open" && items.length < want) problems.push(`has ${items.length} of ${want} items`);
  items.forEach((it, i) => { it.n = i + 1; });
  const example = raw.example && task.answer !== "open" ? normalizeItem(raw.example, plan.task, ctx).item : null;
  if (example) example.n = 0;

  const rubric = rubricFor(plan.task, ctx.levelId);
  const opts = partOpts(plan, ctx.levelId);
  // A reading text from the app's own unit texts is printed exactly as written (the AI only writes the questions).
  const given = opts.text ? readingText(opts.text) : null;
  const section = {
    id: plan.id,
    task: plan.task,
    skill: task.skill,
    answerType: task.answer,
    title: `${SKILLS[task.skill]?.label || ""}`,
    rubric: clean(raw.rubric) || rubric.en,
    rubricEl: rubric.el,
    items,
    example,
    passageTitle: given ? given.title : clean(raw.passageTitle),
    passage: given ? given.text : String(raw.passage || "").trim(),
    ...(given ? { textId: given.id } : {}),
    // The rubric is printed, so a narrator reading it aloud ("Teacher: Listen and tick…") is dropped.
    script: (Array.isArray(raw.script) ? raw.script : []).map((l) => ({ speaker: clean(l?.speaker) || "Narrator", text: clean(l?.text) }))
      .filter((l) => l.text && !(/^(teacher|narrator|announcer)$/i.test(l.speaker) && /^(now )?(listen|look|you will hear)\b/i.test(l.text))),
    frame: (Array.isArray(raw.frame) ? raw.frame : []).map(clean).filter(Boolean),
    prompts: (Array.isArray(raw.prompts) ? raw.prompts : []).map(clean).filter(Boolean),
    sample: Array.isArray(raw.sample) ? raw.sample.map(clean).join("\n") : String(raw.sample || "").trim(),
    task_prompt: clean(raw.prompt || raw.task),
    // Speaking: opening questions and the cards students hold (questions, follow-ups and a model answer for the teacher).
    warmup: (Array.isArray(raw.warmup) ? raw.warmup : []).map(clean).filter(Boolean).slice(0, 4),
    cards: (Array.isArray(raw.cards) ? raw.cards : []).map((c) => ({
      title: clean(c?.title), student: clean(c?.student),
      keyWords: (Array.isArray(c?.keyWords) ? c.keyWords : []).map(clean).filter(Boolean).slice(0, 6),
      questions: (Array.isArray(c?.questions) ? c.questions : []).map(clean).filter(Boolean).slice(0, 6),
      followUps: (Array.isArray(c?.followUps) ? c.followUps : []).map(clean).filter(Boolean).slice(0, 3),
      model: Array.isArray(c?.model) ? c.model.map(clean).join(" ") : clean(c?.model),
    })).filter((c) => c.title || c.student || c.questions.length).slice(0, 6),
    pictures: [],
    bank: [],
    plays: opts.plays === 1 ? 1 : 2,
    words: plan.words || null,
  };
  if (ctx.picFor) section.pictures = (Array.isArray(raw.pictures) ? raw.pictures : []).map((w) => ({ word: clean(w), pic: ctx.picFor(w) })).filter((p) => p.pic);

  // Word banks: shuffled, never in answer order. Matching: lettered definitions.
  if (task.answer === "match") {
    // The example's meaning is in the list too, so item 0 shows its letter (Cambridge style).
    const defs = shuffled([...new Set([...(example?.answer ? [example.answer] : []), ...items.map((it) => it.answer)])]);
    section.bank = defs.map((text, i) => ({ letter: LETTERS[i], text }));
    [example, ...items].filter(Boolean).forEach((it) => { it.letter = LETTERS[defs.indexOf(it.answer)] || ""; it.prompt ||= ""; });
  } else if (task.answer === "open" && task.skill === "writing" && Array.isArray(raw.bank) && raw.bank.length) {
    // A word box for writing with lots of support.
    section.bank = [...new Set(raw.bank.map(clean).filter(Boolean))].slice(0, 10);
  } else if (task.bank) {
    const words = [...new Set([...(raw.bank || []), ...items.map((it) => it.answer)].map(clean).filter(Boolean))];
    let bank = shuffled(words);
    for (let t = 0; t < 8 && bank.length > 2 && items.every((it, i) => lc(bank[i]) === lc(it.answer)); t++) bank = shuffled(words);
    section.bank = bank;
  }
  if (task.answer === "choice") balanceChoices(items);
  if (plan.task === "G-ORDER") [example, ...items].filter(Boolean).forEach((it) => repairOrderItem(it));
  if (plan.task === "R-ORDER") section.items = items = orderEvents(example, items);
  // Letter help, made by the app from the answer (never left to the AI): mixed-up letters, a first letter or a letter count.
  if (plan.task === "V-SPELL") [example, ...items].filter(Boolean).forEach((it) => { it.hint = scramble(it.answer); });
  if (plan.task === "V-FORM") [example, ...items].filter(Boolean).forEach((it) => { const h = familyHint(it.prompt, it.answer, opts.family); if (h) it.hint = h; else delete it.hint; });
  if (["V-DEF", "V-PIC"].includes(plan.task)) {
    const mode = opts.hint;
    [example, ...items].filter(Boolean).forEach((it) => { const h = letterHint(it.answer, mode); if (h) it.hint = h; else delete it.hint; });
  }

  // Points: one per item; open tasks carry their own total.
  section.pointsEach = task.answer === "open" ? 0 : plan.pointsEach || 1;
  section.points = task.answer === "open" ? plan.points || 10 : items.length * section.pointsEach;

  if (task.needs?.includes("script") && !section.script.length) problems.push("missing the listening script");
  if (task.needs?.includes("passage") && !section.passage) problems.push("missing the reading text");
  if (task.skill === "speaking" && !section.cards.length && !section.prompts.length) problems.push("missing the speaking cards");
  if (task.answer === "tf") {
    const report = binaryBalance("TF", items.map((it) => ({ answer: it.tf === 0 ? "T" : it.tf === 1 ? "F" : "" })));
    if (!report.ok) problems.push(`the answers need a mix of ${tfLabels(ctx.levelId).join(" and ")} (items ${report.flip.map((i) => i + 1).join(", ")} should be "${tfLabels(ctx.levelId)[report.flipTo === "T" ? 0 : 1]}")`);
    // The AI quotes the words that decide each answer; a quote that isn't in the text means the key needs a look.
    const source = squash(`${section.passage} ${section.script.map((l) => l.text).join(" ")}`);
    const unsure = items.filter((it) => it.evidence && !source.includes(squash(it.evidence))).map((it) => it.n);
    if (source && unsure.length) problems.push(`check the answer${unsure.length > 1 ? "s" : ""} to item${unsure.length > 1 ? "s" : ""} ${unsure.join(", ")} against the ${section.script.length ? "script" : "text"}`);
  }
  section.problems = problems;
  return section;
}

/** Total points of a doc. */
export function docPoints(doc) {
  return (doc?.sections || []).reduce((sum, s) => sum + (Number(s.points) || 0), 0);
}

/** Answer key lines for a section: [{ n, text }]. */
export function answerKeyRows(section) {
  return (section.items || []).map((it) => {
    if (section.answerType === "choice") return { n: it.n, text: `${LETTERS[it.answerIndex] ?? "?"}) ${it.answer}` };
    if (section.answerType === "match") return { n: it.n, text: `${it.letter} — ${it.answer}` };
    if (section.task === "R-ORDER") return { n: (it.letter || "").toUpperCase() || it.n, text: `${it.answer} — ${it.prompt}` };
    return { n: it.n, text: it.answer || "" };
  });
}

/**
 * Version B of a doc for the next desk: items in another order (listening keeps the order of the audio),
 * options moved, word banks reshuffled. Same tasks, same texts, same points.
 */
export function makeVersionB(doc, rand = Math.random) {
  const b = JSON.parse(JSON.stringify(doc));
  b.meta = { ...b.meta, version: "B" };
  for (const s of b.sections) {
    if (s.answerType === "open" || s.skill === "dictation") continue;
    // Listening and reading questions follow the order of the audio / text, so only their options move.
    const keepOrder = s.skill === "listening" || s.skill === "reading";
    if (!keepOrder) {
      s.items = shuffled(s.items, rand);
      s.items.forEach((it, i) => { it.n = i + 1; });
    }
    if (s.answerType === "choice") {
      s.items.forEach((it) => {
        const order = shuffled(it.options.map((_, i) => i), rand);
        it.options = order.map((i) => it.options[i]);
        if (it.optionPics) it.optionPics = order.map((i) => it.optionPics[i]);
        it.answerIndex = order.indexOf(it.answerIndex);
      });
      balanceChoices(s.items, rand);
    }
    if (s.answerType === "match") {
      const defs = shuffled(s.bank.map((x) => x.text), rand);
      s.bank = defs.map((text, i) => ({ letter: LETTERS[i], text }));
      [s.example, ...s.items].filter(Boolean).forEach((it) => { it.letter = LETTERS[defs.indexOf(it.answer)] || ""; });
    } else if (s.bank?.length) s.bank = shuffled(s.bank, rand);
  }
  return b;
}

/** Every problem in a doc, for the quality strip: ["Reading: item 2: …"]. */
export function docProblems(doc) {
  return (doc?.sections || []).flatMap((s) => (s.problems || []).map((p) => `${SKILLS[s.skill]?.label || s.task} (${TASKS[s.task]?.label || s.task}): ${p}`));
}

export const newDocId = (kind) => `${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
