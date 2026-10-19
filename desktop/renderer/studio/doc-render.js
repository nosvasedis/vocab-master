/* Vocab Master — HTML for unit tests and dictations: the student paper and the teacher's pack (pure).
 * Uses the worksheet header, fonts and print CSS of the existing sheets, so tests and dictations print,
 * preview and export exactly like the Lingo Launcher / Dictation / Answer Key sheets. */
import { escapeHtml as esc, worksheetHeaderHtml, worksheetSectionHtml, WORKSHEET_PRINT_CSS } from "../app.js";
import { picUrl } from "../js/pics.js";
import { SKILLS, TASKS, DICTATION_STYLES } from "./tasks.js";
import { LETTERS, answerKeyRows, docPoints } from "./doc-model.js";

const GAP = /_{3,}/g;
const line = (cls = "") => `<span class="st-line ${cls}"></span>`;
const pic = (token, cls = "ws-pic") => {
  const id = String(token || "").replace(/^@/, "");
  return /^(?:w|c|ui)-[a-z0-9-]+$/.test(id) ? `<img class="${cls}" src="${esc(picUrl(id))}" alt="" draggable="false">` : "";
};
const withGaps = (text) => esc(text).replace(GAP, () => line("inline"));

/** Layout options with their defaults. */
export function docLayout(doc, options = {}) {
  return {
    studentHeader: true,
    greek: !!doc?.meta?.greek,
    pictures: doc?.meta?.pictures !== false,
    schoolName: "",
    density: "standard",
    ...(doc?.meta?.layout || {}),
    ...(options.layout || {}),
  };
}

function headerFor(doc, layout, { teacher = false } = {}) {
  const m = doc.meta || {};
  const facts = [m.version ? `Version ${m.version}` : "", m.minutes ? `${m.minutes} min` : "", !teacher && docPoints(doc) ? `${docPoints(doc)} points` : ""].filter(Boolean).join(" · ");
  return worksheetHeaderHtml(
    { bookTitle: m.bookTitle, unit: m.unit, pageRange: m.pages || "", classLabel: m.classLabel, classProfile: m.classProfile },
    { title: teacher ? `${m.title || "Test"} · Teacher’s pack` : m.title || "Test", kind: teacher ? "Answer key · scripts · marking" : [m.subtitle, facts].filter(Boolean).join(" · "), layout: { studentHeader: !teacher && layout.studentHeader, reuseNote: false, schoolName: layout.schoolName } },
  );
}

function partHead(section, index, layout) {
  const skill = SKILLS[section.skill] || {};
  const pts = section.points ? `<span class="ex-score st-points"><i></i>/ ${section.points}</span>` : "";
  return `<div class="ex-head">
    <span class="ex-num">Part ${index + 1}</span>
    <div class="ex-title">
      <div class="st-skill">${esc(skill.label || "")}</div>
      <h3 class="ex-heading ex-instruction ws-heading">${esc(section.rubric || "")}</h3>
      ${layout.greek && section.rubricEl ? `<p class="ex-help-el" lang="el">${esc(section.rubricEl)}</p>` : ""}
    </div>
    ${pts}
  </div>`;
}

function passageHtml(section) {
  if (!section.passage) return "";
  const body = section.passage.split(/\n{1,}/).map((p) => `<p>${esc(p).replace(/\((\d+)\)\s*_{3,}/g, (_, n) => `<b>(${n})</b>${line("inline")}`).replace(GAP, () => line("inline"))}</p>`).join("");
  return `<div class="st-passage">${section.passageTitle ? `<h4>${esc(section.passageTitle)}</h4>` : ""}${body}</div>`;
}

function bankHtml(section) {
  if (!section.bank?.length) return "";
  if (section.answerType === "match") {
    return `<div class="match-defs">${section.bank.map((b) => `<p class="match-def-line"><b>${esc(b.letter.toUpperCase())}</b><span>${esc(b.text)}</span></p>`).join("")}</div>`;
  }
  return `<div class="word-bank">${section.bank.map((w) => `<span>${esc(w)}</span>`).join("")}</div>`;
}

function itemHtml(section, it, layout, { example = false, showAnswers = false } = {}) {
  const num = `<span class="item-num">${example ? "0" : esc(it.n)}</span>`;
  const exAns = example ? `<span class="st-ex-ans">${esc(section.answerType === "choice" ? `${LETTERS[it.answerIndex]}` : section.answerType === "match" ? it.letter?.toUpperCase() || "" : it.answer)}</span>` : "";
  const key = showAnswers && !example ? `<span class="teacher-ans-pill">✓ ${esc(section.answerType === "choice" ? `${LETTERS[it.answerIndex]} ${it.answer}` : section.answerType === "match" ? it.letter?.toUpperCase() : it.answer)}</span>` : "";
  const cls = `ex-item st-item${example ? " st-example" : ""}`;
  if (section.answerType === "choice") {
    const pics = layout.pictures && it.optionPics?.length;
    const opts = pics
      ? `<div class="st-pic-options">${it.options.map((o, i) => `<div class="st-pic-opt${example && i === it.answerIndex ? " picked" : ""}">${pic(it.optionPics[i], "st-opt-pic")}<span class="st-box">${example && i === it.answerIndex ? "✓" : ""}</span><small>${LETTERS[i].toUpperCase()}</small></div>`).join("")}</div>`
      : `<div class="st-options">${it.options.map((o, i) => `<span class="st-opt${example && i === it.answerIndex ? " picked" : ""}"><b>${LETTERS[i]}</b>${esc(o)}</span>`).join("")}</div>`;
    return `<div class="${cls}">${num}<div class="item-text">${it.prompt ? `<div>${withGaps(it.prompt)}</div>` : ""}${opts}${key}</div></div>`;
  }
  if (section.answerType === "tf") {
    return `<div class="${cls}">${num}<div class="item-text st-tf"><span>${withGaps(it.prompt)}</span><span class="st-tf-box">${example ? esc(it.answer) : ""}</span>${key}</div></div>`;
  }
  if (section.answerType === "match") {
    return `<div class="${cls}">${num}<div class="item-text"><b>${esc(it.prompt)}</b> ${example ? exAns : line("short")}${key}</div></div>`;
  }
  const hasGap = GAP.test(it.prompt); GAP.lastIndex = 0;
  const prompt = /^\(\d+\)$/.test(it.prompt) ? `<b>${esc(it.prompt)}</b>` : withGaps(it.prompt);
  return `<div class="${cls}">${num}<div class="item-text">${prompt}${example ? ` ${exAns}` : hasGap ? "" : ` ${line()}`}${key}</div></div>`;
}

function pictureCardsHtml(section, layout, showAnswers) {
  const card = (it, example) => `<div class="ex-item pic-card${example ? " st-example" : ""}"><span class="item-num">${example ? "0" : esc(it.n)}</span><div class="pic-frame">${layout.pictures ? pic(it.pic) : ""}</div>${it.prompt ? `<div class="pic-clue">${esc(it.prompt.replace(GAP, "").trim())}</div>` : ""}<div class="pic-line">${example ? `<span class="st-ex-ans">${esc(it.answer)}</span>` : showAnswers ? `<span class="teacher-ans-pill">✓ ${esc(it.answer)}</span>` : ""}</div></div>`;
  return `<div class="pic-grid">${section.example?.pic ? card(section.example, true) : ""}${section.items.map((it) => card(it, false)).join("")}</div>`;
}

function openTaskHtml(section, layout) {
  const words = section.words ? `<span class="st-words">${esc(section.words[0])}–${esc(section.words[1])} words</span>` : "";
  const pics = layout.pictures && section.pictures.length ? `<div class="st-story-pics">${section.pictures.map((p, i) => `<div class="st-story-pic">${pic(p.pic)}<small>${i + 1}</small></div>`).join("")}</div>` : "";
  if (section.skill === "speaking") {
    return `${pics}<p class="st-note">Your teacher will talk with you. ${section.prompts.length ? `${section.prompts.length} questions.` : ""}</p>`;
  }
  const frame = section.frame.length ? `<ul class="st-frame">${section.frame.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : "";
  const n = Math.max(5, Math.round(((section.words?.[1] || 40) / 8)));
  return `${section.task_prompt ? `<p class="st-task">${esc(section.task_prompt)} ${words}</p>` : words ? `<p class="st-task">${words}</p>` : ""}${pics}${frame}<div class="st-lines">${Array.from({ length: n }, () => line("full")).join("")}</div>`;
}

/* ── Dictation sections ──────────────────────────────────────────── */
function dictationHtml(section, layout, showAnswers) {
  const style = section.style;
  const s = section.sentences || [];
  if (style === "gapped") {
    return s.map((x) => `<div class="ex-item st-item">${`<span class="item-num">${x.n}</span>`}<div class="item-text">${withGaps(x.gapped)}${showAnswers ? `<span class="teacher-ans-pill">✓ ${esc(x.answers.join(", "))}</span>` : ""}</div></div>`).join("");
  }
  if (style === "picture") {
    const grid = `<div class="pic-grid st-dict-pics">${(section.pictures || []).map((p) => `<div class="ex-item pic-card"><span class="item-num">${esc(p.letter.toUpperCase())}</span><div class="pic-frame">${layout.pictures ? pic(p.pic) : ""}</div><div class="st-dict-pic-lines"><span>No. ${line("tiny")}</span>${line("short")}</div>${showAnswers ? `<span class="teacher-ans-pill">✓ ${esc(p.n)} · ${esc(p.word)}</span>` : ""}</div>`).join("")}</div>`;
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
    body += bankHtml(section);
    if (section.answerType === "open") body += openTaskHtml(section, layout);
    else if (section.task === "V-PIC") body += pictureCardsHtml(section, layout, options.showAnswers);
    else {
      if (section.example) body += itemHtml(section, section.example, layout, { example: true });
      body += section.items.map((it) => itemHtml(section, it, layout, { showAnswers: options.showAnswers })).join("");
    }
    return `<section class="ex-block st-sec st-${esc(section.skill)}">${partHead(section, i, layout)}${body}</section>`;
  }).join("");
  return `<div class="worksheet studio-sheet density-${esc(layout.density)}">${headerFor(doc, layout)}${parts}</div>`;
}

const WRITING_RUBRIC = [["Task", "All the points are there; the reader understands."], ["Vocabulary", "Uses unit words correctly."], ["Language", "Sentences, grammar, spelling and punctuation."]];
const SPEAKING_RUBRIC = [["Interaction", "Understands and answers; keeps talking."], ["Vocabulary", "Uses unit words."], ["Pronunciation & fluency", "Clear, with few long pauses."]];

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
      if (s.prompts.length) h += `<ol class="st-prompts">${s.prompts.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>`;
      if (s.sample) h += `<div class="st-sample"><b>${s.skill === "speaking" ? "Model answers" : "Model answer"}</b>${s.sample.split("\n").map((p) => `<p>${esc(p)}</p>`).join("")}</div>`;
      h += rubricTable(s.skill === "speaking" ? SPEAKING_RUBRIC : WRITING_RUBRIC, s.points || 10);
    } else {
      h += answerKeyRows(s).map((r) => `<p class="ex-item"><span class="item-num">${r.n}</span><span class="item-text"><strong>${esc(r.text)}</strong></span></p>`).join("");
    }
    return `${h}</section>`;
  }).join("");
  return `<div class="worksheet answer-key-sheet studio-sheet density-${esc(layout.density)}">${headerFor(doc, layout, { teacher: true })}${worksheetSectionHtml("Marking scheme")}${scheme}${worksheetSectionHtml("Answer key & scripts")}<div class="key-grid st-key-grid">${parts}</div></div>`;
}

/** Wall strips for a running dictation, big print, to cut out. */
export function renderRunningStrips(doc) {
  const s = (doc.sections || []).find((x) => x.style === "running");
  if (!s?.strips?.length) return "";
  return `<div class="worksheet studio-sheet">${s.strips.map((t, i) => `<div class="st-strip"><span>${i + 1}</span>${esc(t)}</div>`).join("")}</div>`;
}

export const STUDIO_PRINT_CSS = `
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
.st-item { align-items: flex-start; }
.st-options { display: flex; flex-wrap: wrap; gap: 1.4mm 6mm; margin-top: 0.6mm; }
.st-opt { display: inline-flex; align-items: center; gap: 1.6mm; }
.st-opt b { display: inline-flex; align-items: center; justify-content: center; width: 4.8mm; height: 4.8mm; border: 0.8pt solid var(--ink); border-radius: 50%; font: 700 7.6pt/1 "Manrope", sans-serif; }
.st-opt.picked b { background: #111; color: #fff; }
.st-pic-options { display: flex; gap: 4mm; margin-top: 1mm; }
.st-pic-opt { display: flex; flex-direction: column; align-items: center; gap: 1mm; padding: 1.6mm; border: 0.8pt solid var(--rule); border-radius: 2mm; }
.st-opt-pic { width: 22mm; height: 22mm; object-fit: contain; }
.st-box { width: 5mm; height: 5mm; border: 0.8pt solid var(--ink); border-radius: 1mm; display: inline-flex; align-items: center; justify-content: center; font-size: 9pt; }
.st-pic-opt small { font: 700 7.4pt/1 "Manrope", sans-serif; color: var(--ink-3); }
.st-tf { display: flex; align-items: flex-start; gap: 4mm; }
.st-tf > span:first-child { flex: 1; }
.st-tf-box { flex: none; min-width: 14mm; height: 6mm; border: 0.8pt solid var(--ink); border-radius: 1.6mm; text-align: center; font: 700 9pt/6mm "Manrope", sans-serif; }
.st-example { color: var(--ink-2); }
.st-example .item-num { border-style: dashed; }
.st-ex-ans { font-family: "Segoe Print", "Comic Sans MS", cursive; font-size: 11pt; color: var(--ink-2); border-bottom: 0.8pt solid var(--ink-3); padding: 0 2mm; }
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
