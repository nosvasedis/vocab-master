/* The "Header" dialog: a switch for every line of a paper's header (school, title, subtitle, the teacher's own
 * line, book, unit, unit title, pages, class, test facts, each field of the student box). The paper behind it
 * changes as the teacher clicks. Used by Test Maker, Dictation and Worksheets. */
import { openDialog, esc, icon } from "./ui.js";
import { actions } from "./actions.js";
import { HEADER_GROUPS, HEADER_DEFAULTS, textKey, headerMetaAuto } from "../studio/paper-header.js";
import { worksheetUnitTitle } from "../app.js";

/**
 * The header lines a teacher can reword for a set of papers: the school, each paper's title and subtitle (left),
 * the book, unit and pages · class lines (right). titles / kinds: [[label, the app's text]].
 */
export function paperWords(meta = {}, { schoolName = "", titles = [], kinds = [] } = {}) {
  const right = headerMetaAuto(meta, meta.unitTitle ?? worksheetUnitTitle(meta));
  return {
    left: [
      { field: "school", auto: String(schoolName || "").trim(), label: "School" },
      ...titles.map(([label, auto]) => ({ field: "title", auto, label })),
      ...kinds.filter(([, auto]) => auto !== undefined).map(([label, auto]) => ({ field: "kind", auto: auto || "", label })),
    ],
    right: [
      { field: "book", auto: right.book, label: "Book" },
      { field: "unit", auto: right.unit, label: "Unit" },
      { field: "detail", auto: right.detail, label: "Pages · class" },
    ],
  };
}

const PRESETS = {
  all: { label: "Everything", set: () => ({ ...HEADER_DEFAULTS }) },
  simple: { label: "Simple", set: (h) => ({ ...h, school: true, title: true, kind: false, book: false, unit: true, unitTitle: false, pages: false, class: true, version: true, minutes: false, points: true, name: true, classLine: false, date: true, score: true }) },
  minimal: { label: "Minimal", set: (h) => ({ ...h, school: false, title: true, kind: false, extra: false, book: false, unit: false, unitTitle: false, pages: false, class: false, version: true, minutes: false, points: false, name: true, classLine: false, date: false, score: false }) },
};

/**
 * header: the current switches (missing ones are on). test: show the test-facts group. schoolName: from Settings.
 * words: the header's text lines the teacher can reword, by side — { left: [{ field, auto, label }], right: [...] }
 * (auto = the app's text; the teacher's words replace it on screen, in print and in Word; empty = the app's).
 * onChange(header) runs on every click and keystroke.
 */
export function openHeaderDialog({ header = {}, test = false, schoolName = "", subtitle = "", words = null, onChange }) {
  let h = { ...HEADER_DEFAULTS, ...header, texts: { ...(header.texts || {}) } };
  const groups = HEADER_GROUPS.filter((g) => test || !g.test);
  const wordRow = ({ field, auto, label }) => {
    const key = textKey(field, auto);
    return `<label class="hd-word"><span>${esc(label)}</span><input class="input sm" data-hd-word="${esc(key)}" value="${esc(h.texts[key] || "")}" placeholder="${esc(auto || "Empty — type to add a line")}" /></label>`;
  };
  const wordsHtml = () => (words && (words.left?.length || words.right?.length) ? `<fieldset class="hd-group hd-words"><legend>The words</legend>
      <p class="st-hint">${icon("pencil", "i-xs")} Type your own words for any line; leave a box empty for the app's text (shown in grey). A line's switch above still shows or hides it.</p>
      <div class="hd-sides">${[["left", "Left side"], ["right", "Right side"]].filter(([k]) => words[k]?.length).map(([k, label]) => `<div class="hd-side"><b>${label}</b>${words[k].map(wordRow).join("")}</div>`).join("")}</div>
    </fieldset>` : "");
  const body = () => `
    <div class="hd-presets">${Object.entries(PRESETS).map(([k, p]) => `<button type="button" class="chip" data-hd-preset="${k}">${esc(p.label)}</button>`).join("")}</div>
    ${groups.map((g) => `<fieldset class="hd-group"><legend>${esc(g.label)}</legend><div class="hd-grid">${g.fields.map(([k, label]) => `<label class="switch sm"><input type="checkbox" data-hd="${k}" ${h[k] ? "checked" : ""} /><span class="track"></span><span class="sw-text">${esc(label)}${k === "school" && !schoolName ? `<small>No school name yet</small>` : ""}</span></label>`).join("")}</div>
      ${g.id === "top" ? `<div class="field hd-extra"${h.extra ? "" : " hidden"}><input class="input sm" data-hd-text placeholder="e.g. Spring term test · Ms Vasedi" value="${esc(h.extraText || "")}" aria-label="Your own line" /></div>
        ${!schoolName ? `<p class="st-hint">${icon("info", "i-xs")} Add your school’s name in <a href="#" data-hd-settings>Settings</a> to show it on every paper.</p>` : ""}` : ""}
      ${g.id === "student" ? `<p class="st-hint">${icon("info", "i-xs")} Turn all four off for no box at all.</p>` : ""}</fieldset>`).join("")}
    ${wordsHtml()}`;
  openDialog({
    title: "Header", subtitle: subtitle || "What the top of the paper shows", iconName: "sliders", sheet: true,
    body: `<div class="hd">${body()}</div>`,
    foot: `<span class="spacer"></span><button type="button" class="btn btn-primary" data-close>${icon("check", "i-sm")}Done</button>`,
    onMount(root) {
      const host = root.querySelector(".hd");
      const changed = () => onChange?.({ ...h });
      host.addEventListener("change", (e) => {
        const k = e.target.dataset.hd;
        if (!k) return;
        h[k] = e.target.checked;
        if (k === "extra") {
          host.querySelector(".hd-extra").hidden = !h.extra;
          if (h.extra) host.querySelector("[data-hd-text]").focus();
        }
        changed();
      });
      host.addEventListener("input", (e) => {
        if (e.target.dataset.hdText !== undefined) { h.extraText = e.target.value; changed(); }
        const key = e.target.dataset.hdWord;
        if (key !== undefined) {
          const v = e.target.value;
          if (v.trim()) h.texts = { ...h.texts, [key]: v };
          else { const { [key]: _gone, ...rest } = h.texts; h.texts = rest; }
          changed();
        }
      });
      host.addEventListener("click", (e) => {
        const p = e.target.closest("[data-hd-preset]");
        if (p) {
          h = PRESETS[p.dataset.hdPreset].set(h);
          host.innerHTML = body();
          changed();
        }
        if (e.target.closest("[data-hd-settings]")) { e.preventDefault(); actions.openSettings(); }
      });
    },
  });
}
