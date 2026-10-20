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
  school: true, title: true, kind: true, extra: false, extraText: "",
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

/** The line under the title: the subtitle, then (tests) the version, the time and the points — each when on. */
export function headerKindLine(kind, facts = {}, h = HEADER_DEFAULTS) {
  return [
    h.kind ? kind : "",
    h.version && facts.version ? `Version ${facts.version}` : "",
    h.minutes && facts.minutes ? `${facts.minutes} min` : "",
    h.points && facts.points ? `${facts.points} points` : "",
  ].filter(Boolean).join(" · ");
}

/** Book, unit line and detail line for the right side of the header. */
export function headerMetaLines(meta = {}, h = HEADER_DEFAULTS, unitTitle = "") {
  const pages = String(meta.pageRange || meta.pages || "").trim();
  return {
    book: h.book ? meta.bookTitle || "" : "",
    unitLine: [h.unit && meta.unit ? `Unit ${meta.unit}` : "", h.unitTitle ? unitTitle : ""].filter(Boolean).join(" · "),
    detail: [h.pages && pages ? `pp. ${pages}` : "", h.class ? meta.classLabel || "" : ""].filter(Boolean).join(" · "),
  };
}

/** The teacher's own line (e.g. "Spring term test · Ms Vasedi"), when switched on. */
export const headerExtra = (h = HEADER_DEFAULTS) => (h.extra ? String(h.extraText || "").trim() : "");

/** The student box fields that are on: [[key, label]]. */
export function studentFields(h = HEADER_DEFAULTS) {
  return [["name", "Name"], ["classLine", "Class"], ["date", "Date"], ["score", "Score"]].filter(([k]) => h[k]);
}
