/* What a paper's header shows — every line can be switched off, for worksheets, tests and dictations, on
 * screen, in print and in Word. Pure: the renderers (app.js, doc-render.js) and the Word builders read it. */

/** The switches, in groups. "test" groups only appear for tests and dictations. */
export const HEADER_GROUPS = [
  { id: "top", label: "At the top", fields: [["school", "School name"], ["title", "Title"], ["kind", "Subtitle"], ["extra", "Your own line"]] },
  { id: "unit", label: "Book & unit", fields: [["book", "Book"], ["unit", "Unit number"], ["unitTitle", "Unit title"], ["pages", "Pages"], ["class", "Class"]] },
  { id: "facts", label: "Test facts", test: true, fields: [["version", "Version (A / B)"], ["minutes", "Time"], ["points", "Total points"]] },
  { id: "student", label: "Student box", fields: [["name", "Name"], ["classLine", "Class"], ["date", "Date"], ["score", "Score"]] },
];

export const HEADER_DEFAULTS = {
  school: true, title: true, kind: true, extra: false, extraText: "", texts: {},
  book: true, unit: true, unitTitle: true, pages: true, class: true,
  version: true, minutes: true, points: true,
  name: true, classLine: true, date: true, score: true,
};

/** The header switches of a layout ({ header, studentHeader }); the old "Name & score box" switch still hides the whole box. */
export function headerOptions(layout = {}) {
  const h = { ...HEADER_DEFAULTS, ...(layout?.header || {}) };
  if (layout?.studentHeader === false) Object.assign(h, { name: false, classLine: false, date: false, score: false });
  return h;
}

/**
 * The teacher's own wording for a header line. It is kept with the line and the app's text it replaces
 * ("title:Dictation", "unit:Unit 1 · What is a family?"), so it never moves to another sheet or another unit.
 */
export const textKey = (field, auto) => `${field}:${String(auto ?? "").trim()}`;
export function headerText(h, field, auto) {
  const t = h?.texts?.[textKey(field, auto)];
  return typeof t === "string" && t.trim() ? t.trim() : auto;
}

/** The school line and the title, in the teacher's words when they changed them. */
export const headerSchool = (h, name) => headerText(h, "school", String(name || "").trim());
export const headerTitle = (h, title) => headerText(h, "title", title);

/** The line under the title: the subtitle, then (tests) the version, the time and the points — each when on. */
export function headerKindLine(kind, facts = {}, h = HEADER_DEFAULTS) {
  return [
    h.kind ? headerText(h, "kind", kind) : "",
    h.version && facts.version ? `Version ${facts.version}` : "",
    h.minutes && facts.minutes ? `${facts.minutes} min` : "",
    h.points && facts.points ? `${facts.points} points` : "",
  ].filter(Boolean).join(" · ");
}

/**
 * Book, unit line and detail line for the right side of the header. A line the teacher reworded replaces the whole
 * line (shown while any of its switches is on); its key is the full line, so the switches don't change it.
 */
export function headerMetaLines(meta = {}, h = HEADER_DEFAULTS, unitTitle = "") {
  const full = headerMetaAuto(meta, unitTitle);
  const pages = String(meta.pageRange || meta.pages || "").trim();
  const own = (field, on, computed) => {
    const t = headerText(h, field, full[field]);
    return !on ? "" : t !== full[field] ? t : computed;
  };
  return {
    book: own("book", h.book, meta.bookTitle || ""),
    unitLine: own("unit", h.unit || h.unitTitle, [h.unit && meta.unit ? `Unit ${meta.unit}` : "", h.unitTitle ? unitTitle : ""].filter(Boolean).join(" · ")),
    detail: own("detail", h.pages || h.class, [h.pages && pages ? `pp. ${pages}` : "", h.class ? meta.classLabel || "" : ""].filter(Boolean).join(" · ")),
  };
}

/** The right side as the app writes it with every switch on — what the teacher's wording replaces. */
export function headerMetaAuto(meta = {}, unitTitle = "") {
  const pages = String(meta.pageRange || meta.pages || "").trim();
  return {
    book: meta.bookTitle || "",
    unit: [meta.unit ? `Unit ${meta.unit}` : "", unitTitle].filter(Boolean).join(" · "),
    detail: [pages ? `pp. ${pages}` : "", meta.classLabel || ""].filter(Boolean).join(" · "),
  };
}

/** The teacher's own line (e.g. "Spring term test · Ms Vasedi"), when switched on. */
export const headerExtra = (h = HEADER_DEFAULTS) => (h.extra ? String(h.extraText || "").trim() : "");

/** The student box fields that are on: [[key, label]]. */
export function studentFields(h = HEADER_DEFAULTS) {
  return [["name", "Name"], ["classLine", "Class"], ["date", "Date"], ["score", "Score"]].filter(([k]) => h[k]);
}
