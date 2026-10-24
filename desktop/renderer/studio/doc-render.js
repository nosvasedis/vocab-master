/* Vocab Master — HTML for unit tests and dictations: the student paper and the teacher's pack (pure).
 * Uses the worksheet header, fonts and print CSS of the existing sheets, so tests and dictations print,
 * preview and export exactly like the Lingo Launcher / Dictation / Answer Key sheets. */
import { escapeHtml as esc, worksheetHeaderHtml, worksheetSectionHtml, WORKSHEET_PRINT_CSS } from "../app.js";
import { picUrl } from "../js/pics.js";
import { SKILLS, TASKS, DICTATION_STYLES } from "./tasks.js";
import { LETTERS, answerKeyRows, docPoints, matchList, sectionRubric, showsExample, speakingPlan, starterText, sortRows, USE_MARKING } from "./doc-model.js";
import { textSizeKey } from "./text-size.js";
import { testPartColumns } from "./item-columns.js";

const GAP = /_{3,}/g;
const line = (cls = "") => `<span class="st-line ${cls}"></span>`;
const pic = (token, cls = "ws-pic") => {
  const id = String(token || "").replace(/^@/, "");
  return /^(?:w|c|ui)-[a-z0-9-]+$/.test(id) ? `<img class="${cls}" src="${esc(picUrl(id))}" alt="" draggable="false">` : "";
};
const withGaps = (text) => esc(text).replace(GAP, () => line("inline"));
/** Letter help with blanks ("b _ _ _ _ _", "_ _ _ _ (4 letters)", "s u n _ _") is the writing space itself. */
const writeIn = (it) => /_/.test(it?.hint || "");
/**
 * Letter help drawn as letter boxes, one per letter: the letters the help gives are printed, the rest are empty for
 * the child (words apart, a hyphen or apostrophe between boxes). In the example every box is filled in by hand.
 * hint: "b _ _ _ _ _", "_ _ _ _ (4 letters)", "s u n _ _", "l _ _   _ _ _ _".
 */
const hintBox = (it, example) => {
  const words = String(it.hint).replace(/\s*\(\d+ letters?\)\s*$/, "").trim().split(/\s{2,}/).map((w) => w.split(" ").filter(Boolean));
  const fill = String(it.answer || "").trim().split(/\s+/).map((w) => [...w]);
  const cell = (t, i, j) => {
    if (!/^[A-Za-z_]$/.test(t)) return `<span class="st-cpunct">${esc(t)}</span>`;
    const given = t !== "_";
    const ch = given ? t : example ? fill[i]?.[j] || "" : "";
    return `<span class="st-cell${given ? " given" : ""}">${esc(ch)}</span>`;
  };
  return `<span class="st-cells${example ? " done" : ""}">${words.map((w, i) => `<span class="st-cword">${w.map((t, j) => cell(t, i, j)).join("")}</span>`).join("")}</span>`;
};

/** Layout options with their defaults. */
export function docLayout(doc, options = {}) {
  return {
    studentHeader: true,
    greek: !!doc?.meta?.greek,
    pictures: doc?.meta?.pictures !== false,
    schoolName: "",
    density: "standard",
    textSize: "standard",
    examples: true,
    ...(doc?.meta?.layout || {}),
    ...(options.layout || {}),
  };
}

function headerFor(doc, layout, { teacher = false } = {}) {
  const m = doc.meta || {};
  const facts = { version: m.version || "", minutes: m.minutes || "", points: !teacher ? docPoints(doc) || "" : "" };
  return worksheetHeaderHtml(
    { bookTitle: m.bookTitle, unit: m.unit, pageRange: m.pages || "", classLabel: m.classLabel, classProfile: m.classProfile },
    { title: teacher ? `${m.title || "Test"} · Teacher’s pack` : m.title || "Test", kind: teacher ? "Answer key · scripts · marking" : m.subtitle || "", facts, layout: { studentHeader: !teacher && layout.studentHeader, reuseNote: false, schoolName: layout.schoolName, header: layout.header } },
  );
}

function partHead(section, index, layout) {
  const skill = SKILLS[section.skill] || {};
  const pts = section.points ? `<span class="ex-score st-points"><i></i>/ ${section.points}</span>` : "";
  return `<div class="ex-head">
    <span class="ex-num">Part ${index + 1}</span>
    <div class="ex-title">
      <div class="st-skill">${esc(skill.label || "")}</div>
      <h3 class="ex-heading ex-instruction ws-heading">${esc(sectionRubric(section).en)}</h3>
      ${layout.greek && section.rubricEl ? `<p class="ex-help-el" lang="el">${esc(sectionRubric(section).el)}</p>` : ""}
    </div>
    ${pts}
  </div>`;
}

function passageHtml(section) {
  if (!section.passage) return "";
  const body = section.passage.split(/\n{1,}/).map((p) => `<p>${esc(p).replace(/\((\d+)\)\s*_{3,}/g, (_, n) => `<b>(${n})</b>${line("inline")}`).replace(GAP, () => line("inline"))}</p>`).join("");
  return `<div class="st-passage">${section.passageTitle ? `<h4>${esc(section.passageTitle)}</h4>` : ""}${body}</div>`;
}

function bankHtml(section, layout = {}) {
  if (!section.bank?.length) return "";
  if (section.answerType === "match") {
    // The meanings as the paper prints them: the example's own meaning only while the example is shown (selected).
    const { defs, selected } = matchList(section, layout);
    // Short meanings sit in two columns (half the height).
    const twoCol = defs.length >= 6 && defs.every((b) => String(b.text).length <= 38);
    return `<div class="match-defs${twoCol ? " two-col" : ""}">${defs.map((b) => `<p class="match-def-line${b.text === selected ? " picked" : ""}"><b>${esc((b.letter || "").toUpperCase())}</b><span>${esc(b.text)}</span></p>`).join("")}</div>`;
  }
  // The words to sort: the example's word is crossed out (it is already in the table). Not the editable word box.
  if (section.task === "V-SORT") return `<div class="word-bank st-keywords st-sort-words">${section.bank.map((w) => `<span>${w === section.example?.prompt ? `<s>${esc(w)}</s>` : esc(w)}</span>`).join("")}</div>`;
  return `<div class="word-bank">${section.bank.map((w) => `<span>${esc(w)}</span>`).join("")}</div>`;
}

/** "Put the words in groups": a table with a column per group and the same number of lines in each; the example's word is written in. */
function sortTableHtml(section, layout, showAnswers) {
  const rows = sortRows(section);
  const ex = showsExample(section, layout) ? section.example : null;
  const col = (g) => {
    const words = [ex, ...section.items].filter((it) => it && it.answer === g);
    return Array.from({ length: rows }, (_, r) => {
      const it = words[r];
      if (it && it === ex) return `<span class="st-ex-ans">${esc(it.prompt)}</span>`;
      return showAnswers && it ? `<span class="teacher-ans-pill">✓ ${esc(it.prompt)}</span>` : line("full");
    });
  };
  const cols = section.groups.map(col);
  return `<table class="st-sort"><thead><tr>${section.groups.map((g) => `<th>${esc(g)}</th>`).join("")}</tr></thead><tbody>${Array.from({ length: rows }, (_, r) => `<tr>${cols.map((c) => `<td>${c[r]}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function itemHtml(section, it, layout, { example = false, showAnswers = false } = {}) {
  const num = `<span class="item-num">${example ? "0" : esc(it.n)}</span>`;
  // A matching part's letters are the ones its list prints (the example's meaning is in the list only while it is shown).
  const match = section.answerType === "match" ? matchList(section, layout) : null;
  const letter = (x) => (match ? match.letterOf(x.answer).toUpperCase() : "");
  const exAns = example ? `<span class="st-ex-ans${match ? " picked" : ""}">${esc(section.answerType === "choice" ? `${LETTERS[it.answerIndex]}` : match ? letter(it) : it.answer)}</span>` : "";
  const key = showAnswers && !example ? `<span class="teacher-ans-pill">✓ ${esc(section.answerType === "choice" ? `${LETTERS[it.answerIndex]} ${it.answer}` : match ? letter(it) : it.answer)}</span>` : "";
  const cls = `ex-item st-item${example ? " st-example" : ""}`;
  if (section.answerType === "choice") {
    const pics = layout.pictures && it.optionPics?.length;
    const opts = pics
      ? `<div class="st-pic-options">${it.options.map((o, i) => `<div class="st-pic-opt${example && i === it.answerIndex ? " picked" : ""}">${pic(it.optionPics[i], "st-opt-pic")}<span class="st-box">${example && i === it.answerIndex ? "✓" : ""}</span><small>${(LETTERS[i] || "").toUpperCase()}</small></div>`).join("")}</div>`
      : `<div class="st-options">${it.options.map((o, i) => `<span class="st-opt${example && i === it.answerIndex ? " picked" : ""}"><b>${LETTERS[i]}</b>${esc(o)}</span>`).join("")}</div>`;
    // A sign or message is printed in a box, like the real thing.
    const prompt = !it.prompt ? "" : section.task === "R-SIGNS" ? `<div class="st-notice">${esc(it.prompt)}</div>` : `<div>${withGaps(it.prompt)}</div>`;
    return `<div class="${cls}">${num}<div class="item-text">${prompt}${opts}${key}</div></div>`;
  }
  if (section.answerType === "tf") {
    return `<div class="${cls}">${num}<div class="item-text st-tf"><span>${withGaps(it.prompt)}</span><span class="st-tf-box">${example ? esc(it.answer) : ""}</span>${key}</div></div>`;
  }
  if (section.answerType === "match") {
    // A conversation: the other person's line, then the replier with a box for the letter of the reply.
    const letterBox = `<span class="st-order-box${example ? " picked" : ""}">${example ? esc(letter(it)) : ""}</span>`;
    if (section.task === "R-CONV") return `<div class="${cls} st-conv">${num}<div class="item-text"><div>${esc(it.prompt)}</div><div class="st-conv-reply">${section.replier ? `<b>${esc(section.replier)}:</b>` : ""}${letterBox}${key}</div></div></div>`;
    // Missing sentences: "(1) [ ]" side by side under the list (the gap number is the question number).
    if (section.task === "R-SENT") return `<div class="${cls} st-sent"><div class="item-text"><b>${esc(it.prompt || `(${example ? 0 : it.n})`)}</b>${letterBox}${key}</div></div>`;
    return `<div class="${cls}">${num}<div class="item-text"><b>${esc(it.prompt)}</b> ${example ? exAns : line("short")}${key}</div></div>`;
  }
  // Own sentences: the word (and the idea) with a whole line to write on; the example shows a model written in.
  if (section.task === "V-USE") {
    return `<div class="${cls} st-use">${num}<div class="item-text"><b>${esc(it.prompt)}</b>${example ? `<div><span class="st-ex-ans">${esc(it.answer)}</span></div>` : line("full")}${key}</div></div>`;
  }
  if (section.task === "R-ORDER") {
    return `<div class="${cls} st-order"><span class="item-num">${example ? "✓" : esc((it.letter || "").toUpperCase())}</span><div class="item-text"><span class="st-order-box">${example ? esc(it.answer) : ""}</span><span>${esc(it.prompt)}</span>${showAnswers && !example ? `<span class="teacher-ans-pill">✓ ${esc(it.answer)}</span>` : ""}</div></div>`;
  }
  const hasGap = GAP.test(it.prompt); GAP.lastIndex = 0;
  // Letter help with blanks ("b _ _ _ _ _") is where the child writes: it takes the sentence's gap, or the line's place.
  // Unjumble: the mixed-up letters come right after the clue.
  const jumble = it.jumble ? ` <span class="st-hint st-jumble">${esc(it.jumble)}</span>` : "";
  if (writeIn(it)) {
    const box = hintBox(it, example);
    const text = hasGap ? `${esc(it.prompt).replace(/_{3,}/, () => box).replace(GAP, () => line("inline"))}${jumble}` : `${withGaps(it.prompt)}${jumble} ${box}`;
    return `<div class="${cls}">${num}<div class="item-text">${text}${key}</div></div>`;
  }
  const prompt = /^\(\d+\)$/.test(it.prompt) ? `<b>${esc(it.prompt)}</b>` : withGaps(it.prompt);
  const hint = it.hint ? ` <span class="st-hint">${esc(it.hint)}</span>` : "";
  return `<div class="${cls}">${num}<div class="item-text">${prompt}${jumble}${hint}${example ? ` ${exAns}` : hasGap ? "" : ` ${line()}`}${key}</div></div>`;
}

function pictureCardsHtml(section, layout, showAnswers) {
  const card = (it, example) => `<div class="ex-item pic-card${example ? " st-example" : ""}"><span class="item-num">${example ? "0" : esc(it.n)}</span><div class="pic-frame">${layout.pictures ? pic(it.pic) : ""}</div>${it.prompt ? `<div class="pic-clue">${esc(it.prompt.replace(GAP, "").trim())}</div>` : ""}${it.hint && !writeIn(it) ? `<div class="st-hint">${esc(it.hint)}</div>` : ""}<div class="pic-line${writeIn(it) ? " hinted" : ""}">${section.answerType === "tf" ? `<span class="st-tf-box">${example ? esc(it.answer) : ""}</span>${showAnswers && !example ? `<span class="teacher-ans-pill">✓ ${esc(it.answer)}</span>` : ""}` : writeIn(it) ? `${hintBox(it, example)}${showAnswers && !example ? `<span class="teacher-ans-pill">✓ ${esc(it.answer)}</span>` : ""}` : example ? `<span class="st-ex-ans">${esc(it.answer)}</span>` : showAnswers ? `<span class="teacher-ans-pill">✓ ${esc(it.answer)}</span>` : ""}</div></div>`;
  return `<div class="pic-grid">${section.example?.pic && showsExample(section, layout) ? card(section.example, true) : ""}${section.items.map((it) => card(it, false)).join("")}</div>`;
}

function openTaskHtml(section, layout) {
  const words = section.words ? `<span class="st-words">${esc(section.words[0])}–${esc(section.words[1])} words</span>` : "";
  const pics = layout.pictures && section.pictures.length ? `<div class="st-story-pics">${section.pictures.map((p, i) => `<div class="st-story-pic">${pic(p.pic)}<small>${i + 1}</small></div>`).join("")}</div>` : "";
  if (section.skill === "speaking") return speakingHtml(section, layout);
  // "Finish the sentences": each starter gets its own line to write on.
  if (section.task === "W-SENT" && section.frame.length) return `${section.task_prompt ? `<p class="st-task">${esc(section.task_prompt)}</p>` : ""}<div class="st-starters">${section.frame.map((f, i) => `<p class="st-starter"><span class="item-num">${i + 1}</span><span>${withGaps(starterText(f))}</span>${line("grow")}</p>`).join("")}</div>`;
  const frame = section.frame.length ? `<ul class="st-frame">${section.frame.map((f) => `<li>${withGaps(f)}</li>`).join("")}</ul>` : "";
  const n = Math.max(5, Math.round(((section.words?.[1] || 40) / 8)));
  return `${section.task_prompt ? `<p class="st-task">${esc(section.task_prompt)} ${words}</p>` : words ? `<p class="st-task">${words}</p>` : ""}${pics}${frame}<div class="st-lines">${Array.from({ length: n }, () => line("full")).join("")}</div>`;
}

/* ── Speaking ─────────────────────────────────────────────────────── */
// Small line icons (they print in black and white).
const ICON = {
  talk: '<path d="M4 5h16v10H10l-5 4v-4H4z"/>',
  pair: '<circle cx="8" cy="8" r="2.6"/><circle cx="16" cy="8" r="2.6"/><path d="M3.5 19c0-2.8 2-4.6 4.5-4.6s4.5 1.8 4.5 4.6M11.5 19c0-2.8 2-4.6 4.5-4.6s4.5 1.8 4.5 4.6"/>',
  story: '<rect x="3" y="5" width="7" height="6" rx="1.2"/><rect x="14" y="5" width="7" height="6" rx="1.2"/><rect x="3" y="14" width="7" height="6" rx="1.2"/><rect x="14" y="14" width="7" height="6" rx="1.2"/>',
  choose: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v5.8M12 15.2V21M3 12h5.8M15.2 12H21"/>',
  question: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2 1-1.2 1.9"/><path d="M12 16.8v.2"/>',
};
const icon = (k) => `<svg class="st-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
const speakWords = (list, label) => (list?.length ? `<div class="st-speak-words"><i>${esc(label)}</i>${list.map((w) => `<span>${esc(w)}</span>`).join("")}</div>` : "");
const WORDS_LABEL = { "S-ROLE": "You can say", "S-DISCUSS": "Useful phrases" };
/** Numbered pictures in a row (story panels with arrows between them; pictures no card shows). */
const picStrip = (list, { arrows = false, start = 0 } = {}) => `<div class="st-story-pics${arrows ? " st-storyboard" : ""}">${list.map((p, i) => `${arrows && i ? `<span class="st-story-arrow" aria-hidden="true"><svg viewBox="0 0 12 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5l7 7-7 7"/></svg></span>` : ""}<div class="st-story-pic">${pic(p.pic)}<small>${start + i + 1}</small></div>`).join("")}</div>`;

/** A card students hold: its pictures, what to do and the words to use (role-plays: Student A / B). */
function speakCardHtml(c, task, layout) {
  const pics = layout.pictures && c.pics.length ? `<div class="st-speak-pics">${c.pics.map((p) => `<div class="st-speak-pic">${pic(p.pic)}</div>`).join("")}</div>` : "";
  const role = task === "S-ROLE" ? (c.index % 2 ? " role-b" : " role-a") : "";
  return `<div class="st-speak-card${pics ? " has-pic" : ""}${role}" data-card="${c.index}">${pics}<div class="st-speak-body">
      <div class="st-speak-head"><span class="st-speak-n">${role ? icon("pair") : ""}${esc(c.label)}</span><b>${esc(c.card.title)}</b></div>
      ${c.card.student ? `<p>${esc(c.card.student)}</p>` : ""}
      ${speakWords(c.card.keyWords, WORDS_LABEL[task] || "Words to use")}
    </div></div>`;
}

/** The card a story, a discussion or a Big Question part is built around, in that part's own shape. */
function speakLeadHtml(plan, section, layout) {
  const { lead, kind } = plan;
  const pics = layout.pictures ? plan.pictures : [];
  const c = lead.card;
  const head = (ic, label) => `<div class="st-speak-head"><span class="st-speak-n">${icon(ic)}${esc(label)}</span><b>${esc(c.title)}</b></div>`;
  if (kind === "story") {
    return `<div class="st-speak-lead st-speak-story" data-card="0">${head("story", "Story")}${c.student ? `<p>${esc(c.student)}</p>` : ""}</div>${pics.length ? picStrip(pics, { arrows: true }) : ""}${speakWords(c.keyWords, "Words to use")}`;
  }
  if (kind === "discuss" && pics.length >= 3 && pics.length <= 5) {
    // The situation in the middle, the options around it, joined by lines (as in A2 Key Speaking Part 2).
    const slots = { 3: ["t", "l", "r"], 4: ["tl", "tr", "l", "r"], 5: ["tl", "t", "tr", "l", "r"] }[pics.length];
    const at = { tl: [50, 50], t: [150, 50], tr: [250, 50], l: [50, 150], r: [250, 150] };
    const lines = slots.map((k) => `<line x1="150" y1="150" x2="${at[k][0]}" y2="${at[k][1]}"/>`).join("");
    return `<div class="st-mindmap" data-card="0"><svg class="st-mindmap-lines" viewBox="0 0 300 200" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>
      ${pics.map((p, i) => `<div class="st-mind-pic at-${slots[i]}">${pic(p.pic)}<small>${esc(p.word)}</small></div>`).join("")}
      <div class="st-mind-centre">${icon("choose")}<b>${esc(c.title)}</b>${c.student ? `<p>${esc(c.student)}</p>` : ""}</div>
    </div>${speakWords(c.keyWords, WORDS_LABEL[section.task])}`;
  }
  const ic = kind === "question" ? "question" : "choose";
  return `<div class="st-speak-lead st-speak-${kind === "question" ? "bq" : "discuss"}" data-card="0">${kind === "question" ? `<span class="st-bq-mark">${icon("question")}</span>` : ""}<div class="st-speak-body">${head(ic, kind === "question" ? "Big Question" : "Talk together")}${c.student ? `<p>${esc(c.student)}</p>` : ""}${speakWords(c.keyWords, WORDS_LABEL[section.task] || "Words to use")}</div></div>${kind === "discuss" && pics.length ? picStrip(pics) : ""}`;
}

/** A speaking part on the student's paper: the cards (and pictures) students look at while they talk. */
function speakingHtml(section, layout) {
  const plan = speakingPlan(section);
  const strip = layout.pictures && plan.pictures.length ? picStrip(plan.pictures) : "";
  if (!section.cards?.length) return `${strip}<p class="st-note st-speak-none">${icon("talk")}Your teacher will talk with you.${section.prompts.length ? ` ${section.prompts.length} questions.` : ""}</p>`;
  const n = plan.cards.length;
  const cols = n <= 3 ? n : n === 4 ? 2 : 3;
  const grid = n ? `<div class="st-speak-grid cols-${cols}${plan.kind === "role" ? " st-speak-pairs" : ""}">${plan.cards.map((c) => speakCardHtml(c, section.task, layout)).join("")}</div>` : "";
  if (plan.lead) return `${speakLeadHtml(plan, section, layout)}${grid}`;
  return `${grid}${strip}`;
}

/** The teacher's speaking script: warm-up, each card's questions and follow-ups, a model answer. */
function speakingScriptHtml(s, layout) {
  const plan = speakingPlan(s);
  const thumbs = (list, numbered) => (layout.pictures && list.length ? `<span class="st-speak-thumbs">${list.map((p, i) => `<span>${pic(p.pic)}${numbered ? `<small>${i + 1}</small>` : ""}</span>`).join("")}</span>` : "");
  let h = s.warmup?.length ? `<div class="st-speak-t"><div class="st-speak-head"><span class="st-speak-n">${icon("talk")}Warm-up</span></div><ol>${s.warmup.map((q) => `<li>${esc(q)}</li>`).join("")}</ol></div>` : "";
  // A story or a discussion: the pictures, numbered as on the paper, above its card.
  const leadPics = plan.lead && plan.kind !== "question" ? plan.pictures : [];
  const cards = [...(plan.lead ? [{ ...plan.lead, pics: [] }] : []), ...plan.cards];
  h += cards.map((c) => `<div class="st-speak-t" data-card="${c.index}">
      ${thumbs(c === cards[0] && plan.lead ? leadPics : c.pics, c === cards[0] && plan.lead)}<div class="st-speak-head"><span class="st-speak-n">${esc(c.label)}</span><b>${esc(c.card.title)}</b></div>
      ${c.card.student ? `<p class="st-teacher-note">Student’s card: ${esc(c.card.student)}</p>` : ""}
      ${c.card.questions.length ? `<ol>${c.card.questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ol>` : ""}
      ${c.card.followUps.length ? `<p class="st-speak-follow"><i>Follow-up:</i> ${c.card.followUps.map(esc).join(" · ")}</p>` : ""}
      ${c.card.model ? `<div class="st-sample"><b>${s.task === "S-ROLE" ? "Model dialogue" : "Model answer"}</b><p>${esc(c.card.model)}</p></div>` : ""}</div>`).join("");
  return h;
}

/* ── Dictation sections ──────────────────────────────────────────── */
function dictationHtml(section, layout, showAnswers) {
  const style = section.style;
  const s = section.sentences || [];
  if (style === "gapped") {
    return s.map((x) => `<div class="ex-item st-item">${`<span class="item-num">${x.n}</span>`}<div class="item-text">${withGaps(x.gapped)}${showAnswers ? `<span class="teacher-ans-pill">✓ ${esc(x.answers.join(", "))}</span>` : ""}</div></div>`).join("");
  }
  if (style === "picture") {
    const grid = `<div class="pic-grid st-dict-pics">${(section.pictures || []).map((p) => `<div class="ex-item pic-card"><span class="item-num">${esc((p.letter || "").toUpperCase())}</span><div class="pic-frame">${layout.pictures ? pic(p.pic) : ""}</div><div class="st-dict-pic-lines"><span>No. ${line("tiny")}</span>${line("short")}</div>${showAnswers ? `<span class="teacher-ans-pill">✓ ${esc(p.n)} · ${esc(p.word)}</span>` : ""}</div>`).join("")}</div>`;
    return grid;
  }
  if (style === "dictogloss") {
    const keys = (section.keyWords || []).length ? `<div class="word-bank st-keywords">${section.keyWords.map((w) => `<span>${esc(w)}</span>`).join("")}</div>` : "";
    return `${keys}<div class="st-notes"><b>My notes</b>${Array.from({ length: 4 }, () => line("full")).join("")}</div><div class="st-notes"><b>Our text</b>${Array.from({ length: Math.max(6, Math.ceil((section.textWords || 60) / 9)) }, () => line("full")).join("")}</div>`;
  }
  // classic and running: numbered writing lines
  const n = style === "running" ? Math.max(6, Math.ceil((section.textWords || 60) / 8)) : s.length;
  return Array.from({ length: n }, (_, i) => `<div class="ex-item st-item st-dict-line"><span class="item-num">${style === "running" ? "" : i + 1}</span><div class="item-text">${line("full")}${showAnswers && style !== "running" ? `<span class="teacher-ans-pill">✓ ${esc(s[i]?.text || "")}</span>` : ""}</div></div>`).join("");
}

/** The student paper. options: { showAnswers, layout } */
export function renderStudentPaper(doc, options = {}) {
  const layout = docLayout(doc, options);
  const parts = (doc.sections || []).map((section, i) => {
    let body = "";
    if (section.skill === "listening") body += `<div class="st-audio">Listen to track ${i + 1}. You will hear it ${section.plays === 1 ? "once" : "twice"}.</div>`;
    if (section.skill === "dictation") return `<section class="ex-block st-sec">${partHead(section, i, layout)}${dictationHtml(section, layout, options.showAnswers)}</section>`;
    if (!["writing"].includes(section.skill) || section.task === "W-MESSAGE") body += passageHtml(section);
    body += bankHtml(section, layout);
    if (section.answerType === "open") body += openTaskHtml(section, layout);
    else if (section.task === "V-PIC" || section.task === "V-TICK") body += pictureCardsHtml(section, layout, options.showAnswers);
    else if (section.task === "V-SORT") body += sortTableHtml(section, layout, options.showAnswers);
    else {
      // Picture-choice questions sit two to a row, so a part fits on one page.
      const picGrid = layout.pictures && section.items.some((it) => it.optionPics?.length);
      const example = showsExample(section, layout) ? itemHtml(section, section.example, layout, { example: true }) : "";
      const questions = section.items.map((it) => itemHtml(section, it, layout, { showAnswers: options.showAnswers })).join("");
      // Ten or more short questions with one-letter or one-word answers: two columns, the second half beside the first
      // (the example stays above them, so 10 questions sit five and five).
      const cols = !picGrid && testPartColumns(section, { textSize: layout.textSize, withExample: !!example });
      body += picGrid ? `<div class="st-pic-items">${example}${questions}</div>` : section.task === "R-SENT" ? `<div class="st-sent-row">${example}${questions}</div>` : cols ? `${example}<div class="st-cols">${questions}</div>` : example + questions;
    }
    return `<section class="ex-block st-sec st-${esc(section.skill)}">${partHead(section, i, layout)}${body}</section>`;
  }).join("");
  return `<div class="worksheet studio-sheet density-${esc(layout.density)} text-${textSizeKey(layout.textSize)}">${headerFor(doc, layout)}${parts}</div>`;
}

const WRITING_RUBRIC = [["Task", "All the points are there; the reader understands."], ["Vocabulary", "Uses unit words correctly."], ["Language", "Sentences, grammar, spelling and punctuation."]];
const SPEAKING_RUBRIC = [["Vocabulary", "Uses the unit words and the words on the cards."], ["Grammar", "Sentences are mostly correct for the class level."], ["Fluency & pronunciation", "Speaks clearly, with few long pauses."], ["Interaction", "Understands the questions; answers fully and adds a little more."]];

function rubricTable(rows, total) {
  const each = rows.map((_, i) => Math.floor(total / rows.length) + (i < total % rows.length ? 1 : 0));
  return `<table class="st-rubric"><tbody>${rows.map(([k, v], i) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td><td class="pts">/ ${each[i]}</td></tr>`).join("")}</tbody></table>`;
}

/** The teacher's pack: marking scheme, answer key, listening scripts, writing and speaking guides, dictation scripts. */
export function renderTeacherPack(doc, options = {}) {
  const layout = docLayout(doc, options);
  const scheme = `<table class="st-scheme"><thead><tr><th>Part</th><th>Skill</th><th>Task</th><th>Points</th></tr></thead><tbody>${(doc.sections || []).map((s, i) => `<tr><td>${i + 1}</td><td>${esc(SKILLS[s.skill]?.label || "")}</td><td>${esc(TASKS[s.task]?.label || DICTATION_STYLES[s.style]?.label || "")}</td><td>${esc(s.points || "—")}</td></tr>`).join("")}<tr class="total"><td colspan="3">Total</td><td>${docPoints(doc)}</td></tr></tbody></table>`;
  const parts = (doc.sections || []).map((s, i) => {
    let h = `<section class="ex-block key-block st-key"><div class="key-head"><h3 class="ex-heading ws-heading">Part ${i + 1} · ${esc(SKILLS[s.skill]?.label || "")}</h3><span class="key-type">${esc(TASKS[s.task]?.label || DICTATION_STYLES[s.style]?.label || "")}${s.points ? ` · ${s.points} points` : ""}</span></div>`;
    if (s.skill === "dictation") {
      const style = DICTATION_STYLES[s.style] || {};
      h += `<p class="st-teacher-note">${esc(style.hint || "")}${s.repeats ? ` Read each sentence ${s.repeats} times${s.punctuationAloud ? ", saying the punctuation (comma, full stop)" : ""}.` : ""}</p>`;
      if (s.text) h += `<div class="st-script"><p>${esc(s.text)}</p></div>`;
      if (s.sentences?.length && s.style !== "dictogloss" && s.style !== "running") h += s.sentences.map((x) => `<p class="ex-item"><span class="item-num">${x.n}</span><span class="item-text">${esc(x.text)}${s.style === "gapped" ? ` <span class="ans-tests-tag">gaps: ${esc(x.answers.join(", "))}</span>` : ""}${s.style === "picture" && x.letter ? ` <span class="ans-tests-tag">picture ${esc(x.letter.toUpperCase())}</span>` : ""}</span></p>`).join("");
      if (s.style === "running" && s.strips?.length) h += `<p class="st-teacher-note">Wall strips (print the strips page, cut and stick them around the room):</p>${s.strips.map((t, k) => `<p class="ex-item"><span class="item-num">${k + 1}</span><span class="item-text">${esc(t)}</span></p>`).join("")}`;
      return `${h}</section>`;
    }
    if (s.script?.length) h += `<div class="st-script"><b>Script (track ${i + 1})</b>${s.script.map((l) => `<p><b>${esc(l.speaker)}:</b> ${esc(l.text)}</p>`).join("")}</div>`;
    if (s.answerType === "open") {
      if (s.skill === "speaking" && s.cards?.length) h += speakingScriptHtml(s, layout);
      else if (s.prompts.length) h += `<ol class="st-prompts">${s.prompts.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>`;
      if (s.sample) h += `<div class="st-sample"><b>${s.skill === "speaking" ? "Model answers" : "Model answer"}</b>${s.sample.split("\n").map((p) => `<p>${esc(p)}</p>`).join("")}</div>`;
      h += rubricTable(s.skill === "speaking" ? SPEAKING_RUBRIC : WRITING_RUBRIC, s.points || 10);
    } else {
      if (s.task === "V-USE") h += `<p class="st-teacher-note">${esc(USE_MARKING(s))}</p>`;
      // Groups: "Animals: bee, insect" (a group name doesn't fit a number circle).
      h += answerKeyRows(s, layout).map((r) => (s.task === "V-SORT" ? `<p class="ex-item"><span class="item-text"><b>${esc(r.n)}:</b> <strong>${esc(r.text)}</strong></span></p>` : `<p class="ex-item"><span class="item-num">${esc(r.n)}</span><span class="item-text"><strong>${esc(r.text)}</strong></span></p>`)).join("");
    }
    return `${h}</section>`;
  }).join("");
  return `<div class="worksheet answer-key-sheet studio-sheet density-${esc(layout.density)} text-${textSizeKey(layout.textSize)}">${headerFor(doc, layout, { teacher: true })}${worksheetSectionHtml("Marking scheme")}${scheme}${worksheetSectionHtml("Answer key & scripts")}<div class="key-grid st-key-grid">${parts}</div></div>`;
}

/** Wall strips for a running dictation, big print, to cut out. */
export function renderRunningStrips(doc) {
  const s = (doc.sections || []).find((x) => x.style === "running");
  if (!s?.strips?.length) return "";
  return `<div class="worksheet studio-sheet">${s.strips.map((t, i) => `<div class="st-strip"><span>${i + 1}</span>${esc(t)}</div>`).join("")}</div>`;
}

export const STUDIO_PRINT_CSS = `
/* A part may run on to the next page — no half-empty pages before a long part. What belongs together stays
   together: a question, a text, a word box, a matching list, picture cards, and a heading with what follows. */
.studio-sheet .ex-block, .studio-sheet .key-block { break-inside: auto; page-break-inside: auto; }
.studio-sheet .ex-head, .studio-sheet .st-audio, .studio-sheet .st-task, .studio-sheet .st-skill { break-after: avoid; page-break-after: avoid; }
.studio-sheet .st-passage, .studio-sheet .word-bank, .studio-sheet .match-defs, .studio-sheet .st-story-pics, .studio-sheet .st-notes, .studio-sheet .st-example, .studio-sheet .key-head { break-inside: avoid; page-break-inside: avoid; }
.studio-sheet .key-head { break-after: avoid; page-break-after: avoid; }
/* Room without waste: tighter part spacing, short meanings in two columns; the options stay neatly under their question. */
.studio-sheet .ex-block { margin-bottom: 3.6mm; }
.studio-sheet .ex-head { margin-bottom: 1.4mm; }
.studio-sheet .ex-item:has(.st-options) { line-height: 1.5; margin-bottom: 1.8mm; }
.studio-sheet .ex-item:has(.st-options) .st-options { margin-top: 0.4mm; }
.match-defs.two-col { columns: 2; column-gap: 6mm; }
.match-defs.two-col .match-def-line { break-inside: avoid; margin-top: 0; }
.studio-sheet .st-skill { font: 800 7.4pt/1.2 "Manrope", "Inter", "Segoe UI", Arial, sans-serif; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-3); margin-bottom: 0.4mm; }
.studio-sheet .ex-head { align-items: flex-start; }
.studio-sheet .st-points { margin-left: auto; }
.st-audio { margin: 0 0 2mm 9.8mm; padding: 1.6mm 3mm; border: 0.8pt dashed var(--ink-3); border-radius: 2mm; font-size: 9pt; color: var(--ink-2); }
.st-passage { margin: 0 0 3mm 9.8mm; padding: 3mm 4mm; border: 0.8pt solid var(--ink); border-radius: 2.4mm; font-size: 10.6pt; line-height: 1.6; }
.st-passage h4 { margin: 0 0 1.4mm; font: 800 11pt/1.2 "Manrope", "Inter", "Segoe UI", Arial, sans-serif; }
.st-passage p { margin: 0 0 1.6mm; }
.st-passage p:last-child { margin-bottom: 0; }
.st-line { display: inline-block; min-width: 26mm; border-bottom: 0.8pt solid var(--ink); height: 1.1em; vertical-align: -0.2em; }
.st-line.inline { min-width: 22mm; margin: 0 1mm; }
.st-line.short { min-width: 18mm; }
.st-line.tiny { min-width: 9mm; }
.st-line.full { display: block; width: 100%; height: 8mm; }
.st-line.grow { flex: 1; min-width: 30mm; }
.st-hint { display: inline-block; margin: 0 1.6mm; padding: 0.2mm 1.8mm; border: 0.6pt dashed var(--ink-3); border-radius: 1.4mm; font: 700 9.6pt/1.4 "Manrope", "Inter", "Segoe UI", Arial, sans-serif; letter-spacing: 0.06em; color: var(--ink-2); white-space: nowrap; }
.pic-card .st-hint { margin: 0.6mm 0 0; font-size: 8.6pt; }
.pic-card .pic-line.hinted { height: auto; border-bottom: 0; flex-wrap: wrap; gap: 1mm; }
.st-cells { display: inline-flex; flex-wrap: nowrap; gap: 2.2mm; margin: 0 1.2mm; vertical-align: -1.9mm; }
.st-cword { display: inline-flex; align-items: stretch; }
.st-cell { display: inline-grid; place-items: center; box-sizing: border-box; width: 5.2mm; height: 6.4mm; margin-left: -0.6pt; border: 0.6pt solid var(--ink-3); background: #fff; font: 700 11pt/1 "Manrope", "Inter", "Segoe UI", Arial, sans-serif; color: var(--ink); }
.st-cword > .st-cell:first-child { margin-left: 0; border-radius: 1.2mm 0 0 1.2mm; }
.st-cword > .st-cell:last-child { border-radius: 0 1.2mm 1.2mm 0; }
.st-cword > .st-cell:only-child { border-radius: 1.2mm; }
.st-cell.given { background: #f1f0eb; color: var(--ink-2); }
.st-cells.done .st-cell:not(.given) { font: 400 12pt/1 "Segoe Print", "Comic Sans MS", cursive; color: var(--ink-2); }
.st-cpunct { align-self: flex-end; padding: 0 0.5mm; font-weight: 700; }
.pic-card .pic-line.hinted .st-cells { flex-wrap: wrap; justify-content: center; row-gap: 1mm; margin: 0; }
.pic-card .st-cell { width: 4.4mm; height: 5.4mm; font-size: 9.5pt; }
.st-notice { display: inline-block; max-width: 92%; margin: 0 0 1.2mm; padding: 1.6mm 3mm; border: 0.5mm solid #1f2430; border-radius: 1.6mm; font-weight: 700; letter-spacing: 0.01em; background: #fbfaf6; }
.st-order .item-text { display: flex; align-items: center; gap: 3mm; }
.st-order-box { flex: none; width: 7mm; height: 7mm; border: 0.8pt solid var(--ink); border-radius: 1.4mm; text-align: center; font: 700 10pt/7mm "Segoe Print", "Comic Sans MS", cursive; color: var(--ink-2); }
.st-starters { margin: 0 0 1mm 9.8mm; }
.st-conv .st-conv-reply { display: flex; align-items: center; gap: 2mm; margin-top: 0.6mm; }
.st-use .st-line.full { height: 7mm; }
.st-sort-words s { color: var(--ink-3); }
.st-sort { width: calc(100% - 9.8mm); margin: 0 0 2mm 9.8mm; border-collapse: collapse; table-layout: fixed; }
.st-sort th { padding: 1.4mm 2mm; border: 0.8pt solid var(--ink); background: #f1f0eb; font: 800 10pt/1.2 "Manrope", "Inter", "Segoe UI", Arial, sans-serif; text-align: left; }
.st-sort td { padding: 0.6mm 2mm 1mm; border-left: 0.8pt solid var(--ink); border-right: 0.8pt solid var(--ink); vertical-align: bottom; height: 8mm; }
.st-sort tr:last-child td { border-bottom: 0.8pt solid var(--ink); }
.st-sort .st-line.full { height: 6mm; }
.st-sent-row { display: flex; flex-wrap: wrap; gap: 1.6mm 7mm; margin: 0 0 1mm 9.8mm; }
.st-sent-row .st-sent { margin: 0; padding: 0; }
.st-sent .item-text { display: flex; align-items: center; gap: 1.6mm; }
.st-starter { display: flex; align-items: flex-end; gap: 2mm; margin: 0 0 3.2mm; font-size: 10.4pt; }
.st-starter .item-num { flex: none; }
.st-item { align-items: flex-start; }
.st-options { display: flex; flex-wrap: wrap; gap: 1.4mm 6mm; margin-top: 0.6mm; }
.st-opt { display: inline-flex; align-items: center; gap: 1.6mm; }
.st-opt b { display: inline-flex; align-items: center; justify-content: center; width: 4.8mm; height: 4.8mm; border: 0.8pt solid var(--ink); border-radius: 50%; font: 700 7.6pt/1 "Manrope", sans-serif; }
.st-opt.picked b { background: #111; color: #fff; }
.st-cols { columns: 2; column-gap: 8mm; }
.st-cols > .ex-item { break-inside: avoid; page-break-inside: avoid; }
.st-pic-items { display: grid; grid-template-columns: 1fr 1fr; gap: 1mm 6mm; }
.st-pic-options { display: flex; gap: 3mm; margin-top: 1mm; }
.st-pic-opt { display: flex; flex-direction: column; align-items: center; gap: 1mm; padding: 1.6mm; border: 0.8pt solid var(--rule); border-radius: 2mm; }
.st-opt-pic { width: 19mm; height: 19mm; object-fit: contain; }
.st-box { width: 5mm; height: 5mm; border: 0.8pt solid var(--ink); border-radius: 1mm; display: inline-flex; align-items: center; justify-content: center; font-size: 9pt; }
.st-pic-opt small { font: 700 7.4pt/1 "Manrope", sans-serif; color: var(--ink-3); }
.st-tf { display: flex; align-items: flex-start; gap: 4mm; }
.st-tf > span:first-child { flex: 1; }
.st-tf-box { flex: none; min-width: 14mm; height: 6mm; border: 0.8pt solid var(--ink); border-radius: 1.6mm; text-align: center; font: 700 9pt/6mm "Manrope", sans-serif; }
.st-example { color: var(--ink-2); }
.st-example .item-num { border-style: dashed; }
.st-ex-ans { font-family: "Segoe Print", "Comic Sans MS", cursive; font-size: 11pt; color: var(--ink-2); border-bottom: 0.8pt solid var(--ink-3); padding: 0 2mm; }
/* A matching example is selected, like the picked option of a choice: dark, not grey. */
.st-ex-ans.picked { color: #fff; background: #111; border-bottom-color: transparent; border-radius: 1.2mm; padding: 0 1.6mm; }
.st-order-box.picked { background: #111; color: #fff; }
.match-def-line.picked b { background: #111; color: #fff; }
.st-task { margin: 0 0 2mm 9.8mm; font-weight: 600; }
.st-words { font-size: 8.6pt; font-weight: 700; color: var(--ink-3); border: 0.6pt solid var(--rule); border-radius: 1.4mm; padding: 0.2mm 1.6mm; margin-left: 1mm; }
.st-frame { margin: 0 0 2mm 9.8mm; padding-left: 5mm; font-size: 10pt; color: var(--ink-2); }
.st-lines { margin: 0 0 0 9.8mm; }
.st-story-pics { display: flex; gap: 3mm; margin: 0 0 2.4mm 9.8mm; }
.st-story-pic { flex: 1; display: flex; flex-direction: column; align-items: center; padding: 1.6mm; border: 0.8pt solid var(--ink); border-radius: 2mm; }
.st-story-pic img { width: 100%; max-height: 30mm; object-fit: contain; }
.st-story-pic small { font: 700 8pt/1 "Manrope", sans-serif; }
.st-note { margin: 0 0 2mm 9.8mm; font-size: 9.6pt; color: var(--ink-2); font-style: italic; }
.st-notes { margin: 0 0 3mm 9.8mm; padding: 2mm 3mm; border: 0.8pt solid var(--ink); border-radius: 2.4mm; }
.st-notes b { font: 800 8pt/1.2 "Manrope", sans-serif; letter-spacing: 0.1em; text-transform: uppercase; }
.st-keywords { margin-bottom: 2mm; }
.st-dict-line .item-text { padding-top: 1mm; }
.st-dict-pic-lines { width: 90%; display: flex; flex-direction: column; gap: 1.6mm; font-size: 8.6pt; }
.st-script { margin: 1mm 0 1.6mm; padding: 2mm 3mm; border-left: 1.4mm solid var(--tint-2); font-size: 9.4pt; line-height: 1.45; }
.st-script p { margin: 0.6mm 0; }
.st-sample { margin: 1mm 0 1.6mm; font-size: 9.4pt; }
.st-sample p { margin: 0.6mm 0; font-style: italic; }
.st-prompts { margin: 0 0 1.6mm; padding-left: 5mm; font-size: 9.6pt; }
.st-ic { width: 1.2em; height: 1.2em; flex: none; vertical-align: -0.2em; }
.st-speak-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3mm; margin: 1mm 0 2mm 9.8mm; }
.st-speak-grid.cols-1 { grid-template-columns: minmax(0, 1fr); }
.st-speak-grid.cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.st-speak-card { position: relative; display: flex; flex-direction: column; padding: 2.6mm 3.2mm 3mm; border: 0.8pt solid var(--ink); border-radius: 3mm; break-inside: avoid; page-break-inside: avoid; }
.st-speak-body { flex: 1; min-width: 0; }
.st-speak-head { display: flex; align-items: center; flex-wrap: wrap; gap: 1mm 2mm; margin-bottom: 1.2mm; }
.st-speak-n { display: inline-flex; align-items: center; gap: 1mm; height: 5.6mm; padding: 0 2mm; border: 0.8pt solid var(--ink); border-radius: 99px; background: var(--ink); color: #fff; font: 800 7.6pt/1 "Manrope", "Inter", "Segoe UI", Arial, sans-serif; letter-spacing: .04em; white-space: nowrap; }
.st-speak-head b { flex: 1 1 30mm; font: 800 10.6pt/1.2 "Manrope", "Inter", "Segoe UI", Arial, sans-serif; }
.st-speak-card p, .st-speak-lead p { margin: 0 0 1.6mm; font-size: 10pt; line-height: 1.45; }
.st-speak-words { display: flex; flex-wrap: wrap; align-items: center; gap: 1.4mm; }
.st-speak-words i { font: italic 600 8pt/1 "Manrope", "Inter", sans-serif; color: var(--ink-3); margin-right: 0.4mm; }
.st-speak-words span { padding: 0.5mm 2.2mm; border: 0.6pt dashed var(--ink-3); border-radius: 99px; font-size: 9pt; }
.st-sec > .st-speak-words { margin: 0 0 2.4mm 9.8mm; }
/* Picture cards: the card's own picture on top (beside the text when the card is wide). */
.st-speak-pics { display: flex; justify-content: center; gap: 2mm; margin: 0 0 2mm; padding-bottom: 2mm; border-bottom: 0.6pt dashed var(--rule); }
.st-speak-pic { flex: 0 1 30mm; display: flex; justify-content: center; }
.st-speak-pic img { width: 100%; height: 26mm; object-fit: contain; }
.st-speak-grid:is(.cols-1, .cols-2) .st-speak-card.has-pic { flex-direction: row; align-items: center; gap: 3mm; }
.st-speak-grid:is(.cols-1, .cols-2) .has-pic .st-speak-pics { flex: none; width: 30mm; flex-direction: column; margin: 0; padding: 0 3mm 0 0; border-bottom: 0; border-right: 0.6pt dashed var(--rule); }
.st-speak-grid:is(.cols-1, .cols-2) .has-pic .st-speak-pics:has(> :nth-child(2)) { width: 46mm; flex-direction: row; }
.st-speak-grid:is(.cols-1, .cols-2) .has-pic .st-speak-pic img { height: 24mm; }
/* Role-play: Student A and Student B look different, with a big letter in the corner. */
.st-speak-card.role-b .st-speak-n { background: #fff; color: var(--ink); }
.st-speak-card.role-b { border-style: dashed; border-width: 1pt; }
.st-speak-card:is(.role-a, .role-b)::after { position: absolute; top: 1.4mm; right: 2.6mm; font: 900 20pt/1 "Manrope", "Inter", sans-serif; color: var(--tint-2); content: "A"; }
.st-speak-card.role-b::after { content: "B"; }
.st-speak-card:is(.role-a, .role-b) .st-speak-head { padding-right: 7mm; }
/* Story, discussion and Big Question: the part's main card as a banner. */
.st-speak-lead { display: flex; align-items: flex-start; gap: 3mm; margin: 1mm 0 2.4mm 9.8mm; padding: 2.6mm 3.6mm; border: 1pt solid var(--ink); border-left-width: 2.2mm; border-radius: 3mm; break-inside: avoid; page-break-inside: avoid; break-after: avoid; page-break-after: avoid; }
.st-speak-lead.st-speak-story { display: block; }
.st-speak-lead .st-speak-head b { font-size: 11.6pt; }
.st-speak-lead p { margin-bottom: 0.6mm; }
.st-speak-lead .st-speak-words { margin-top: 1.2mm; }
.st-bq-mark { flex: none; display: flex; width: 13mm; height: 13mm; color: var(--ink); }
.st-bq-mark .st-ic { width: 100%; height: 100%; }
.st-speak-bq .st-speak-head b { font-size: 13pt; }
/* Story: the pictures read left to right, with arrows between them. */
.st-storyboard { align-items: center; gap: 1.2mm; }
.st-story-arrow { flex: none; display: flex; width: 3.4mm; color: var(--ink-3); }
.st-story-arrow svg { width: 100%; height: 6mm; }
.st-storyboard .st-story-pic { position: relative; padding-top: 2mm; }
.st-storyboard .st-story-pic small { position: absolute; top: 1.2mm; left: 1.2mm; display: inline-flex; align-items: center; justify-content: center; width: 5mm; height: 5mm; border-radius: 50%; background: var(--ink); color: #fff; font-size: 7.6pt; }
/* Talk together: the situation in the middle, the pictures around it, joined by lines. */
.st-mindmap { position: relative; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-rows: 34mm 34mm; gap: 3mm 5mm; margin: 1mm 0 2.4mm 9.8mm; break-inside: avoid; page-break-inside: avoid; }
.st-mindmap-lines { position: absolute; inset: 0; width: 100%; height: 100%; stroke: var(--ink-3); stroke-width: 1; stroke-dasharray: 3 3; fill: none; }
.st-mindmap-lines line { vector-effect: non-scaling-stroke; }
.st-mind-pic, .st-mind-centre { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 0.8pt solid var(--ink); border-radius: 3mm; background: #fff; min-width: 0; }
.st-mind-pic { padding: 1.4mm; }
.st-mind-pic img { width: 100%; height: 25mm; object-fit: contain; }
.st-mind-pic small { font: 700 8pt/1.1 "Manrope", sans-serif; color: var(--ink-2); text-align: center; }
.st-mind-centre { grid-area: 2 / 2; padding: 2mm 3mm; border-width: 1.4pt; border-radius: 50% / 40%; text-align: center; gap: 0.8mm; }
.st-mind-centre .st-ic { width: 5mm; height: 5mm; }
.st-mind-centre b { font: 800 10.4pt/1.2 "Manrope", "Inter", sans-serif; }
.st-mind-centre p { margin: 0; font-size: 8.6pt; line-height: 1.3; color: var(--ink-2); }
.st-mind-pic.at-tl { grid-area: 1 / 1; } .st-mind-pic.at-t { grid-area: 1 / 2; } .st-mind-pic.at-tr { grid-area: 1 / 3; }
.st-mind-pic.at-l { grid-area: 2 / 1; } .st-mind-pic.at-r { grid-area: 2 / 3; }
.st-speak-none { display: flex; align-items: center; gap: 2mm; font-style: normal; }
.st-speak-none .st-ic { width: 5mm; height: 5mm; color: var(--ink); }
/* Teacher's pack: each card's script in its own box, its pictures beside the title. */
.st-speak-t { display: flow-root; margin: 0 0 2.4mm; padding: 2mm 3mm 1mm; border-left: 1.4mm solid var(--tint-2); font-size: 9.6pt; break-inside: avoid; page-break-inside: avoid; }
.st-speak-t .st-speak-n { height: 5mm; }
.st-speak-t .st-speak-head b { font-size: 10pt; }
.st-speak-t ol { margin: 0.8mm 0 1mm; padding-left: 5mm; }
.st-speak-thumbs { float: right; display: flex; gap: 1.6mm; margin: 0.6mm 0 1mm 3mm; }
.st-speak-thumbs span { position: relative; display: inline-flex; width: 13mm; height: 13mm; padding: 0.6mm; border: 0.6pt solid var(--rule); border-radius: 1.6mm; }
.st-speak-thumbs img { width: 100%; height: 100%; object-fit: contain; }
.st-speak-thumbs small { position: absolute; top: -1.2mm; left: -1.2mm; display: inline-flex; align-items: center; justify-content: center; width: 4mm; height: 4mm; border-radius: 50%; background: var(--ink); color: #fff; font: 700 6.6pt/1 "Manrope", sans-serif; }
.st-speak-follow { margin: 0 0 1mm; font-size: 9.2pt; color: var(--ink-2); }
.st-teacher-note { font-size: 9pt; color: var(--ink-2); margin: 0 0 1.6mm; }
.st-rubric, .st-scheme { width: 100%; border-collapse: collapse; font-size: 9pt; margin: 1mm 0 2mm; }
.st-rubric th, .st-rubric td, .st-scheme th, .st-scheme td { border: 0.6pt solid var(--rule); padding: 1mm 2mm; text-align: left; vertical-align: top; }
.st-rubric .pts { width: 14mm; text-align: right; white-space: nowrap; }
.st-scheme thead th { font: 800 7.6pt/1.2 "Manrope", sans-serif; letter-spacing: 0.1em; text-transform: uppercase; }
.st-scheme .total td { font-weight: 800; }
.st-key-grid { grid-template-columns: 1fr; }
.st-strip { break-inside: avoid; border: 1pt dashed var(--ink); border-radius: 3mm; padding: 8mm 10mm; margin: 0 0 6mm; font: 700 20pt/1.35 "Manrope", "Inter", sans-serif; }
.st-strip span { display: inline-block; margin-right: 4mm; font-size: 12pt; color: var(--ink-3); }
`;

/** A complete standalone HTML document (print, PDF). */
export function studioPrintDocument(bodyHtml, title, fontCss = "") {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${fontCss}
${WORKSHEET_PRINT_CSS}
${STUDIO_PRINT_CSS}</style></head><body>${bodyHtml}</body></html>`;
}
