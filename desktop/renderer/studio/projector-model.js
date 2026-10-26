/* Vocab Master — what the projector can show (pure): the sheets of a worksheet unit, a test and a read-aloud
 * dictation, each drawn by the same renderers as the paper. A sheet with `reveal` is drawn with its answers in
 * hidden pills that the teacher taps open one by one; the other sheets (answer key, teacher's pack, wall strips)
 * are shown as they are. */
import { renderLingoLauncher, renderDictation, renderAnswerKey, WORKSHEET_PRINT_CSS, CLASS_PROFILES } from "../app.js";
import { renderStudentPaper, renderTeacherPack, renderRunningStrips, STUDIO_PRINT_CSS } from "./doc-render.js";
import { DICTATION_STYLES } from "./tasks.js";

export const PROJECTOR_KINDS = {
  unit: { label: "Worksheets", icon: "file" },
  test: { label: "Test", icon: "clipboard" },
  dictation: { label: "Read-aloud dictation", icon: "mic" },
};

/** The paper CSS a kind needs (tests and dictations add the Test Maker's parts). */
export function projectorCss(kind) {
  const base = WORKSHEET_PRINT_CSS.replace(/@page[^}]*}/, "").replace(/html,\s*body\s*{[^}]*}/, "");
  return kind === "unit" ? base : base + STUDIO_PRINT_CSS;
}

/**
 * The sheets of one thing to show: [{ id, label, reveal, html() }].
 * unit: Lingo Launcher, Dictation, Answer key · test: the paper (and version B), the teacher's pack ·
 * dictation: the student sheet, the teacher's copy, and the wall strips of a running dictation.
 */
export function projectorSheets(kind, doc, { schoolName = "" } = {}) {
  if (!doc) return [];
  if (kind === "unit") {
    const opts = (showAnswers) => ({ showAnswers, studentHeader: false, density: "comfortable" });
    return [
      { id: "lingo", label: "Lingo Launcher", reveal: true, html: () => renderLingoLauncher(doc, opts(true)) },
      { id: "dictation", label: "Dictation", reveal: true, html: () => renderDictation(doc, opts(true)) },
      { id: "answer", label: "Answer key", reveal: false, html: () => renderAnswerKey(doc, opts(false)) },
    ].filter((s) => s.id !== "lingo" || doc.lingoLauncher).filter((s) => s.id !== "dictation" || doc.dictation?.exercises?.length);
  }
  const layout = { layout: { schoolName, studentHeader: false } };
  if (kind === "test") {
    const out = [{ id: "A", label: doc.versionB ? "Version A" : "Test paper", reveal: true, html: () => renderStudentPaper(doc, { ...layout, showAnswers: true }) }];
    if (doc.versionB) out.push({ id: "B", label: "Version B", reveal: true, html: () => renderStudentPaper(doc.versionB, { ...layout, showAnswers: true }) });
    out.push({ id: "teacher", label: "Teacher’s pack", reveal: false, html: () => renderTeacherPack(doc, layout) + (doc.versionB ? renderTeacherPack(doc.versionB, layout) : "") });
    return out;
  }
  if (kind === "dictation") {
    const out = [
      { id: "student", label: "Student sheet", reveal: true, html: () => renderStudentPaper(doc, { ...layout, showAnswers: true }) },
      { id: "teacher", label: "Teacher copy", reveal: false, html: () => renderTeacherPack(doc, layout) },
    ];
    if ((doc.sections || []).some((s) => s.style === "running" && s.strips?.length)) out.push({ id: "strips", label: "Wall strips", reveal: false, html: () => renderRunningStrips(doc) });
    return out;
  }
  return [];
}

/** The sheet a kind opens on: a running dictation on its wall strips, everything else on its first sheet. */
export function firstSheet(kind, doc) {
  const list = projectorSheets(kind, doc);
  if (kind === "dictation" && list.some((s) => s.id === "strips")) return "strips";
  return list[0]?.id || "";
}

/** Title and one line under it for the projector's bar and the chooser. */
export function projectorTitle(kind, doc, { label = "" } = {}) {
  const m = doc?.meta || {};
  const cls = CLASS_PROFILES[m.classProfile]?.label || "";
  if (kind === "unit") {
    const t = label || [m.bookTitle, m.unit ? `Unit ${m.unit}` : ""].filter(Boolean).join(" · ") || "Worksheet unit";
    return { title: t, sub: [cls, m.pageRange ? `p. ${m.pageRange}` : ""].filter(Boolean).join(" · ") };
  }
  const unit = [m.bookTitle, m.unit ? `Unit ${m.unit}` : ""].filter(Boolean).join(" · ");
  if (kind === "dictation") {
    // Named by its style, as the Library names it ("Picture dictation").
    const style = DICTATION_STYLES[doc?.sections?.[0]?.style]?.label || "Read-aloud";
    return { title: `${style} dictation`, sub: [cls, unit].filter(Boolean).join(" · ") };
  }
  return { title: m.title || "Test", sub: [cls, m.label || m.subtitle || unit].filter(Boolean).join(" · ") };
}
