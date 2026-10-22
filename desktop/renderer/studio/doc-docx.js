/* Vocab Master — Word (.docx) files for unit tests and dictations (student paper or teacher's pack).
 * Built in Node (web server / desktop main) from the same doc model as the HTML; pictures arrive as PNG
 * copies in meta.picPng. The docx library is passed in by app.js (buildStudioDocx). */
import { SKILLS, TASKS, DICTATION_STYLES } from "./tasks.js";
import { LETTERS, answerKeyRows, docPoints, sectionRubric, starterText } from "./doc-model.js";
import { scaledSize } from "./text-size.js";
import { testPartColumns, splitColumns } from "./item-columns.js";
import { headerOptions, headerKindLine, headerMetaLines, headerExtra, studentFields } from "./paper-header.js";

const MM = 56.7;
const FONT = "Segoe UI";
const DISPLAY = "Segoe UI Black";

export async function buildStudioDocx({ doc, which = "student" }, d) {
  const meta = doc.meta || {};
  const pics = meta.picPng || {};
  const greek = !!meta.greek;
  const showPics = meta.pictures !== false;
  const toBytes = (b64) => (typeof Buffer !== "undefined" ? Buffer.from(b64, "base64") : Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  const textSize = meta.layout?.textSize;
  const run = (text, o = {}) => new d.TextRun({ text: String(text ?? ""), font: o.display ? DISPLAY : FONT, size: scaledSize(o.size || 22, textSize), bold: o.bold, italics: o.italics, color: o.color });
  const para = (children, o = {}) => new d.Paragraph({ children, ...o });
  const pic = (token, size) => {
    const b64 = showPics && pics[String(token || "").replace(/^@/, "")];
    return b64 ? new d.ImageRun({ data: toBytes(b64), transformation: { width: size, height: size } }) : null;
  };
  const gapText = (s) => String(s || "").replace(/_{3,}/g, "____________");
  const lines = (n) => Array.from({ length: n }, () => para([run("_".repeat(78), { color: "8A8A8A", size: 20 })], { spacing: { before: 2 * MM } }));
  const box = (children) => new d.Table({
    width: { size: 100, type: d.WidthType.PERCENTAGE },
    rows: [new d.TableRow({ children: [new d.TableCell({ margins: { top: 2 * MM, bottom: 2 * MM, left: 3 * MM, right: 3 * MM }, children })] })],
  });
  const item = (n, runs) => para([run(`${n}.`, { display: true, bold: true, size: 20 }), new d.TextRun({ text: "\t" }), ...runs], {
    tabStops: [{ type: d.TabStopType.LEFT, position: 8 * MM }], indent: { left: 8 * MM, hanging: 8 * MM }, spacing: { after: 1.6 * MM, line: 340 }, keepLines: true,
  });

  // Two columns side by side (a table without borders): the first half of the questions left, the rest right.
  const noLine = { style: d.BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const twoColumns = (paras) => {
    const cell = (list) => new d.TableCell({ width: { size: 50, type: d.WidthType.PERCENTAGE }, margins: { right: 3 * MM }, borders: { top: noLine, bottom: noLine, left: noLine, right: noLine }, children: list.length ? list : [para([])] });
    const [left, right] = splitColumns(paras);
    return new d.Table({ width: { size: 100, type: d.WidthType.PERCENTAGE }, borders: { top: noLine, bottom: noLine, left: noLine, right: noLine, insideHorizontal: noLine, insideVertical: noLine }, rows: [new d.TableRow({ children: [cell(left), cell(right)] })] });
  };

  const children = [];
  const teacher = which === "teacher";
  // The header follows the same switches as the paper (paper-header.js).
  const h = headerOptions(meta.layout || {});
  const headLines = headerMetaLines(meta, h, meta.unitTitle || "");
  if (h.school && meta.schoolName) children.push(para([run(String(meta.schoolName).toUpperCase(), { bold: true, size: 15, color: "444444" })]));
  if (h.title) children.push(para([run(teacher ? `${meta.title || "Test"} · Teacher’s pack` : meta.title || "Test", { display: true, bold: true, size: 40 })]));
  const sub = [headLines.book, headLines.unitLine, headLines.detail, headerKindLine(teacher ? "" : meta.subtitle || "", { version: meta.version, minutes: meta.minutes, points: !teacher ? docPoints(doc) : "" }, h)].filter(Boolean).join(" · ");
  if (sub) children.push(para([run(sub, { size: 18, color: "555555" })], { spacing: { after: headerExtra(h) ? 0 : 2 * MM } }));
  if (headerExtra(h)) children.push(para([run(headerExtra(h), { size: 18, color: "444444" })], { spacing: { after: 2 * MM } }));
  const fields = !teacher && meta.layout?.studentHeader !== false ? studentFields(h) : [];
  if (fields.length) {
    const blank = { name: "______________________________   ", classLine: "________   ", date: "________   ", score: `_____ / ${h.points ? docPoints(doc) : "____"}` };
    children.push(para(fields.flatMap(([k, label]) => [run(`${label} `, { bold: true, size: 17 }), run(blank[k], { color: "8A8A8A" })]), { spacing: { after: 3 * MM } }));
  }

  (doc.sections || []).forEach((s, i) => {
    const head = [run(` Part ${i + 1} `, { display: true, bold: true, size: 20 }), run(`  ${SKILLS[s.skill]?.label || ""}`, { bold: true, size: 16, color: "777777" })];
    if (s.points && !teacher) head.push(run(`     ____ / ${s.points}`, { bold: true, size: 18 }));
    children.push(para(head, { spacing: { before: 4 * MM, after: 0.6 * MM }, keepNext: true, border: { top: { style: d.BorderStyle.SINGLE, size: 6, color: "111111", space: 4 } } }));
    if (teacher) {
      children.push(para([run(TASKS[s.task]?.label || DICTATION_STYLES[s.style]?.label || "", { italics: true, size: 18, color: "555555" })], { keepNext: true }));
      if (s.skill === "dictation") {
        if (s.text) children.push(box([para([run(s.text, { size: 21 })])]));
        (s.style === "dictogloss" || s.style === "running" ? [] : s.sentences).forEach((x) => children.push(item(x.n, [run(x.text), ...(s.style === "gapped" ? [run(`   (${x.answers.join(", ")})`, { color: "777777", size: 18 })] : []), ...(x.letter ? [run(`   picture ${x.letter.toUpperCase()}`, { color: "777777", size: 18 })] : [])])));
        return;
      }
      if (s.script?.length) children.push(box(s.script.map((l) => para([run(`${l.speaker}: `, { bold: true, size: 20 }), run(l.text, { size: 20 })]))));
      if (s.answerType === "open") {
        if (s.skill === "speaking" && s.cards?.length) {
          const role = s.task === "S-ROLE";
          if (s.warmup?.length) { children.push(para([run("Warm-up", { bold: true, size: 19 })])); s.warmup.forEach((q, k) => children.push(item(k + 1, [run(q)]))); }
          s.cards.forEach((c, k) => {
            children.push(para([run(`${role ? `Student ${k % 2 ? "B" : "A"}` : `Card ${k + 1}`} · ${c.title}`, { bold: true, size: 20 }), ...(c.student ? [run(`  — ${c.student}`, { italics: true, size: 18, color: "555555" })] : [])], { spacing: { before: 1.6 * MM } }));
            c.questions.forEach((q, j) => children.push(item(j + 1, [run(q)])));
            if (c.followUps.length) children.push(para([run("Follow-up: ", { italics: true, size: 18 }), run(c.followUps.join(" · "), { size: 18 })]));
            if (c.model) children.push(para([run(role ? "Model dialogue: " : "Model answer: ", { bold: true, size: 18 }), run(c.model, { italics: true, size: 18 })]));
          });
        } else s.prompts.forEach((p, k) => children.push(item(k + 1, [run(p)])));
        if (s.sample) children.push(para([run("Model: ", { bold: true, size: 19 }), run(s.sample, { italics: true, size: 19 })]));
        children.push(para([run(`Marking: ${s.points} points — ${s.skill === "speaking" ? "vocabulary, grammar, fluency & pronunciation, interaction" : "task, vocabulary, language"}.`, { size: 18, color: "555555" })]));
      } else answerKeyRows(s).forEach((r) => children.push(item(r.n, [run(r.text, { bold: true })])));
      return;
    }
    const rubric = sectionRubric(s);
    children.push(para([run(rubric.en, { display: true, bold: true, size: 22 })], { keepNext: true }));
    if (greek && s.rubricEl) children.push(para([run(rubric.el, { italics: true, size: 18, color: "666666" })], { keepNext: true }));
    if (s.skill === "listening") children.push(para([run(`Listen to track ${i + 1}. You will hear it ${s.plays === 1 ? "once" : "twice"}.`, { size: 18, color: "555555" })]));
    if (s.skill === "dictation") {
      if (s.style === "gapped") s.sentences.forEach((x) => children.push(item(x.n, [run(gapText(x.gapped))])));
      else if (s.style === "picture") s.pictures.forEach((p) => { const img = pic(p.pic, 70); children.push(item((p.letter || "").toUpperCase(), [...(img ? [img] : []), run("   No. ____   ______________________")])); });
      else if (s.style === "dictogloss") { if (s.keyWords?.length) children.push(box([para([run(s.keyWords.join("   •   "), { bold: true })])])); children.push(para([run("My notes", { bold: true, size: 18 })]), ...lines(4), para([run("Our text", { bold: true, size: 18 })]), ...lines(Math.max(6, Math.ceil((s.textWords || 60) / 9)))); }
      else children.push(...lines(s.style === "running" ? Math.max(6, Math.ceil((s.textWords || 60) / 8)) : s.sentences.length));
      return;
    }
    if (s.passage && (s.skill !== "writing" || s.task === "W-MESSAGE")) children.push(box([...(s.passageTitle ? [para([run(s.passageTitle, { bold: true })])] : []), ...s.passage.split(/\n+/).map((p) => para([run(gapText(p), { size: 21 })], { spacing: { after: 1 * MM } }))]));
    if (s.bank?.length) {
      if (s.answerType === "match") s.bank.forEach((b) => children.push(para([run(`${b.letter.toUpperCase()}  `, { bold: true }), run(b.text, { size: 20 })], { indent: { left: 8 * MM } })));
      else children.push(box([para([run(s.bank.join("     •     "), { bold: true })])]));
    }
    if (s.answerType === "open") {
      if (s.task_prompt) children.push(para([run(s.task_prompt, { bold: true }), ...(s.words ? [run(`  (${s.words[0]}–${s.words[1]} words)`, { size: 18, color: "666666" })] : [])]));
      const storyPics = s.pictures.map((p) => pic(p.pic, 90)).filter(Boolean);
      if (storyPics.length) children.push(para(storyPics.flatMap((p, k) => [p, run(`  ${k + 1}     `)])));
      if (s.skill === "speaking") {
        if (!s.cards?.length) { children.push(para([run("Your teacher will talk with you.", { italics: true })])); return; }
        const role = s.task === "S-ROLE";
        s.cards.forEach((c, k) => children.push(box([
          para([run(`${role ? `Student ${k % 2 ? "B" : "A"}` : `Card ${k + 1}`}   `, { bold: true, size: 18, color: "555555" }), run(c.title, { bold: true, size: 22 })]),
          ...(c.student ? [para([run(c.student, { size: 21 })])] : []),
          ...(c.keyWords.length ? [para([run(c.keyWords.join("   •   "), { size: 19, color: "444444" })])] : []),
        ])));
        return;
      }
      if (s.task === "W-SENT") { s.frame.forEach((f, k) => children.push(item(k + 1, [run(`${gapText(starterText(f))}  `), run("______________________________", { color: "8A8A8A" })]))); return; }
      s.frame.forEach((f) => children.push(para([run(`• ${gapText(f)}`, { size: 20, color: "444444" })], { indent: { left: 6 * MM } })));
      children.push(...lines(Math.max(5, Math.round((s.words?.[1] || 40) / 8))));
      return;
    }
    const withExample = !!s.example && (meta.layout?.examples !== false || s.task === "R-ORDER" || teacher);
    const all = [...(withExample ? [{ ...s.example, n: 0 }] : []), ...s.items];
    const cols = testPartColumns(s, { textSize, withExample });
    const out = [];
    all.forEach((it) => {
      const ex = it.n === 0;
      const runs = [];
      if (s.task === "V-TICK") { const img = pic(it.pic, 80); if (img) runs.push(img); runs.push(run(`   ${it.prompt}   `, { bold: true }), run(ex ? it.answer : "________", { italics: ex })); }
      else if (s.task === "V-PIC") { const img = pic(it.pic, 80); if (img) runs.push(img); runs.push(run(`   ${it.prompt ? `${it.prompt}  ` : ""}${it.hint ? `[${it.hint}]  ` : ""}`, { size: 19, color: "555555" }), run(ex ? it.answer : "______________________", { italics: ex })); }
      else if (s.task === "R-ORDER") runs.push(run(ex ? "[ 1 ]  " : "[    ]  ", { bold: true }), run(it.prompt));
      else if (s.answerType === "choice") {
        if (it.prompt) runs.push(run(gapText(it.prompt)), new d.TextRun({ break: 1 }));
        const optPics = it.optionPics?.map((p) => pic(p, 60));
        it.options.forEach((o, k) => {
          if (optPics?.[k]) runs.push(optPics[k], run(`  ${(LETTERS[k] || "").toUpperCase()} ${ex && k === it.answerIndex ? "✓" : "☐"}      `, { bold: true }));
          else runs.push(run(`${ex && k === it.answerIndex ? "(" : ""}${LETTERS[k]}${ex && k === it.answerIndex ? ")" : ")"} `, { bold: true }), run(`${o}      `));
        });
      } else if (s.answerType === "tf") runs.push(run(gapText(it.prompt)), run(`      ${ex ? it.answer : "______"}`, { bold: true }));
      else if (s.answerType === "match") runs.push(run(it.prompt, { bold: true }), run(`   ${ex ? (it.letter || "").toUpperCase() : "_____"}`));
      else runs.push(run(gapText(it.prompt)), ...(it.hint ? [run(`   [${it.hint}]`, { bold: true, size: 19, color: "555555" })] : []), ...(/_{3,}/.test(it.prompt) && !ex ? [] : [run(`   ${ex ? it.answer : "______________"}`, { italics: ex })]));
      out.push(item(ex ? (s.task === "R-ORDER" ? "✓" : "0") : s.task === "R-ORDER" ? (it.letter || "").toUpperCase() : it.n, runs));
    });
    if (cols && withExample) children.push(out[0], twoColumns(out.slice(1)));
    else if (cols) children.push(twoColumns(out));
    else children.push(...out);
  });

  return d.Packer.toBlob(new d.Document({
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    sections: [{ properties: { page: { margin: { top: 13 * MM, bottom: 15 * MM, left: 14 * MM, right: 14 * MM } } }, children }],
  }));
}
