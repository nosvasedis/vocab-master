/* The "Header" dialog: a switch for every line of a paper's header (school, title, subtitle, the teacher's own
 * line, book, unit, unit title, pages, class, test facts, each field of the student box). The paper behind it
 * changes as the teacher clicks. Used by Test Maker, Dictation and Worksheets. */
import { openDialog, esc, icon } from "./ui.js";
import { actions } from "./actions.js";
import { HEADER_GROUPS, HEADER_DEFAULTS } from "../studio/paper-header.js";

const PRESETS = {
  all: { label: "Everything", set: () => ({ ...HEADER_DEFAULTS }) },
  simple: { label: "Simple", set: (h) => ({ ...h, school: true, title: true, kind: false, book: false, unit: true, unitTitle: false, pages: false, class: true, version: true, minutes: false, points: true, name: true, classLine: false, date: true, score: true }) },
  minimal: { label: "Minimal", set: (h) => ({ ...h, school: false, title: true, kind: false, extra: false, book: false, unit: false, unitTitle: false, pages: false, class: false, version: true, minutes: false, points: false, name: true, classLine: false, date: false, score: false }) },
};

/**
 * header: the current switches (missing ones are on). test: show the test-facts group. schoolName: from Settings.
 * onChange(header) runs on every click.
 */
export function openHeaderDialog({ header = {}, test = false, schoolName = "", subtitle = "", onChange }) {
  let h = { ...HEADER_DEFAULTS, ...header };
  const groups = HEADER_GROUPS.filter((g) => test || !g.test);
  const body = () => `
    <div class="hd-presets">${Object.entries(PRESETS).map(([k, p]) => `<button type="button" class="chip" data-hd-preset="${k}">${esc(p.label)}</button>`).join("")}</div>
    ${groups.map((g) => `<fieldset class="hd-group"><legend>${esc(g.label)}</legend><div class="hd-grid">${g.fields.map(([k, label]) => `<label class="switch sm"><input type="checkbox" data-hd="${k}" ${h[k] ? "checked" : ""} /><span class="track"></span><span class="sw-text">${esc(label)}${k === "school" && !schoolName ? `<small>No school name yet</small>` : ""}</span></label>`).join("")}</div>
      ${g.id === "top" ? `<div class="field hd-extra"${h.extra ? "" : " hidden"}><input class="input sm" data-hd-text placeholder="e.g. Spring term test · Ms Vasedi" value="${esc(h.extraText || "")}" aria-label="Your own line" /></div>
        ${!schoolName ? `<p class="st-hint">${icon("info", "i-xs")} Add your school’s name in <a href="#" data-hd-settings>Settings</a> to show it on every paper.</p>` : ""}` : ""}
      ${g.id === "student" ? `<p class="st-hint">${icon("info", "i-xs")} Turn all four off for no box at all.</p>` : ""}</fieldset>`).join("")}`;
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
      host.addEventListener("input", (e) => { if (e.target.dataset.hdText !== undefined) { h.extraText = e.target.value; changed(); } });
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
