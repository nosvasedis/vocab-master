/* Vocab Master — one question's letter help, chosen by the teacher in the question editor.
 * The answer's own letter boxes: tap a box to show or hide its letter (any letters, not only the first ones), − / +
 * to show fewer or more, or a quick choice (the part's setting, none, first letter, first + last, some letters …).
 * At least one letter always stays for the child to write. */
import { esc } from "../ui.js";
import { KNOBS } from "../../studio/tasks.js";
import { letterPositions, revealFor, cleanReveal } from "../../studio/doc-model.js";

const QUICK = [["count", "Boxes only"], ["first", "First letter"], ["first2", "First two"], ["firstlast", "First + last"], ["some", "Some letters"]];

/**
 * opts: { task, reveal (the question's own: undefined | "none" | [positions]), partMode (the part's setting),
 *         answer(), prompt() — read live from the editor's fields; watch: the fields to follow (selectors);
 *         exclude: quick choices that don't apply (a missing-letters line always shows some letters: "none", "count");
 *         partName: what the part is called ("part", "exercise") }.
 * Returns { html, mount(root), value() → undefined (the part's setting) | "none" | [positions] }.
 */
export function letterHelpField({ task, reveal, partMode, answer, prompt, watch = ["#pe_ans", "#pe_prompt"], exclude = [], partName = "part" }) {
  const family = task === "V-FORM";
  const knob = KNOBS[family ? "family" : "hint"];
  const partLabel = knob.values.find(([v]) => v === partMode)?.[1] || "None";
  const quick = (family ? [["root", "Word inside"], ...QUICK.filter(([m]) => m !== "first2" && m !== "firstlast")] : QUICK).filter(([m]) => !exclude.includes(m));
  const noNone = exclude.includes("none");
  // mode: "part" (the part's setting), "none" (a plain line), "own" (the letters in `shown`).
  const st = reveal === "none" && !noNone ? { mode: "none", shown: [] } : Array.isArray(reveal) ? { mode: "own", shown: [...reveal] } : { mode: "part", shown: [] };
  let host = null;

  const letters = () => letterPositions(answer());
  /** The letters shown now (for "part": what the part's setting gives this answer). */
  const shownNow = () => {
    const L = new Set(letters());
    if (st.mode === "none") return [];
    if (st.mode === "part") return revealFor(answer(), partMode, prompt()) || [];
    return st.shown.filter((i) => L.has(i));
  };
  const same = (a, b) => !!a && a.length === b.length && [...a].sort((x, y) => x - y).every((x, k) => x === [...b].sort((p, q) => p - q)[k]);
  const own = (list) => { st.mode = "own"; st.shown = [...new Set(list)].sort((a, b) => a - b); };

  function draw() {
    if (!host) return;
    const L = letters();
    const shown = new Set(shownNow());
    const off = st.mode === "none" || (st.mode === "part" && partMode === "none");
    const chars = [...String(answer() || "")];
    const cells = L.length ? chars.map((c, i) => (/\s/.test(c) ? `<span class="lh-gap"></span>` : /[A-Za-z]/.test(c)
      ? `<button type="button" class="lh-cell${shown.has(i) ? " on" : ""}" data-lh-cell="${i}" aria-pressed="${shown.has(i)}" title="${shown.has(i) ? "Shown — tap to hide" : "Tap to show this letter"}">${shown.has(i) ? esc(c) : ""}</button>`
      : `<span class="lh-punct">${esc(c)}</span>`)).join("") : `<span class="lh-empty">Type the right answer first.</span>`;
    const n = shown.size;
    const chip = (m, label, active) => `<button type="button" class="chip${active ? " active" : ""}" data-lh-mode="${m}">${esc(label)}</button>`;
    host.innerHTML = `
      <div class="lh-modes">${chip("part", `The ${partName}’s setting · ${partLabel}`, st.mode === "part")}${noNone ? "" : chip("none", "None", st.mode === "none")}${quick.map(([m, label]) => chip(m, label, st.mode === "own" && same(revealFor(answer(), m, prompt()), [...shown]))).join("")}</div>
      <div class="lh-boxes${off ? " off" : ""}">${cells}</div>
      <div class="lh-row">
        <button type="button" class="lh-step" data-lh-step="-1" aria-label="Show one letter fewer"${!off && n > 0 ? "" : " disabled"}>−</button>
        <span>${off ? "No letter help — a line to write on" : `<b>${n}</b> of ${L.length} letter${L.length === 1 ? "" : "s"} shown`}</span>
        <button type="button" class="lh-step" data-lh-step="1" aria-label="Show one letter more"${L.length && n < L.length - 1 ? "" : " disabled"}>+</button>
      </div>
      <small class="lh-note">Tap a box to show or hide that letter — any letters, also ones apart. One letter at least stays to write.</small>`;
  }

  function mount(root) {
    host = root.querySelector("[data-lh]");
    if (!host) return;
    host.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || b.disabled) return;
      const L = letters();
      const shown = shownNow();
      if (b.dataset.lhMode) {
        const m = b.dataset.lhMode;
        if (m === "part" || m === "none") { st.mode = m; st.shown = []; }
        else own(revealFor(answer(), m, prompt()) || []);
      }
      if (b.dataset.lhCell !== undefined) {
        const i = Number(b.dataset.lhCell);
        if (shown.includes(i)) own(shown.filter((x) => x !== i));
        else if (shown.length < L.length - 1) own([...shown, i]);
      }
      if (b.dataset.lhStep) {
        // + shows the first hidden letter from the left; − hides the last shown one.
        if (Number(b.dataset.lhStep) > 0) { const next = L.find((i) => !shown.includes(i)); if (next !== undefined && shown.length < L.length - 1) own([...shown, next]); }
        else own(shown.slice(0, -1));
      }
      draw();
    });
    // The answer (or the word in capitals) changes: the boxes follow; letters that no longer exist go.
    watch.forEach((sel) => root.querySelector(sel)?.addEventListener("input", draw));
    draw();
  }

  const value = () => (st.mode === "part" ? undefined : st.mode === "none" ? "none" : cleanReveal(shownNow(), answer()));
  const html = `<div class="field"><span class="label">Letter help <span class="opt">this question</span></span><div class="lh" data-lh></div></div>`;
  return { html, mount, value };
}
