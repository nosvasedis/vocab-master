/* Vocab Master — the pieces a printed exercise is drawn with, shared by the worksheets (app.js, studio/ws-paper.js)
 * and the Test Maker / dictation papers (doc-render.js), so both look the same: writing lines, letter boxes, lettered
 * options to circle, yes/no and letter boxes, a sort table, word chips (pure; no imports). WORKSHEET_PRINT_CSS includes
 * PAPER_PARTS_CSS, so every paper (screen, print, PDF) has it. */

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A writing line: "" (a short line after the text), "inline" (a gap in a sentence), "short", "full" (a whole line). */
export const lineHtml = (cls = "") => `<span class="st-line ${cls}"></span>`;

/**
 * Letter help drawn as letter boxes, one per letter: the letters the help gives are printed, the rest are empty for
 * the child (words apart, a hyphen or apostrophe between boxes). In an example every box is filled in by hand.
 * hint: "b _ _ _ _ _", "_ _ _ _ (4 letters)", "s u n _ _", "l _ _   _ _ _ _".
 */
export function hintBoxHtml(hint, answer = "", example = false) {
  const words = String(hint).replace(/\s*\(\d+ letters?\)\s*$/, "").trim().split(/\s{2,}/).map((w) => w.split(" ").filter(Boolean));
  const fill = String(answer || "").trim().split(/\s+/).map((w) => [...w]);
  const cell = (t, i, j) => {
    if (!/^[A-Za-z_]$/.test(t)) return `<span class="st-cpunct">${esc(t)}</span>`;
    const given = t !== "_";
    const ch = given ? t : example ? fill[i]?.[j] || "" : "";
    return `<span class="st-cell${given ? " given" : ""}">${esc(ch)}</span>`;
  };
  return `<span class="st-cells${example ? " done" : ""}">${words.map((w, i) => `<span class="st-cword">${w.map((t, j) => cell(t, i, j)).join("")}</span>`).join("")}</span>`;
}

/** Letter help with blanks ("b _ _ _ _ _", "_ _ _ _ (4 letters)", "s u n _ _") is the writing space itself. */
export const isWriteIn = (hint) => /_/.test(hint || "");

export const PAPER_PARTS_CSS = `
/* Shared paper parts (studio/paper-parts.js): lines, letter boxes, options, answer boxes, sort table */
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
.st-order-box { flex: none; width: 7mm; height: 7mm; border: 0.8pt solid var(--ink); border-radius: 1.4mm; text-align: center; font: 700 10pt/7mm "Segoe Print", "Comic Sans MS", cursive; color: var(--ink-2); }
.st-sort { width: calc(100% - 9.8mm); margin: 0 0 2mm 9.8mm; border-collapse: collapse; table-layout: fixed; }
.st-sort th { padding: 1.4mm 2mm; border: 0.8pt solid var(--ink); background: #f1f0eb; font: 800 10pt/1.2 "Manrope", "Inter", "Segoe UI", Arial, sans-serif; text-align: left; }
.st-sort td { padding: 0.6mm 2mm 1mm; border-left: 0.8pt solid var(--ink); border-right: 0.8pt solid var(--ink); vertical-align: bottom; height: 8mm; }
.st-sort tr:last-child td { border-bottom: 0.8pt solid var(--ink); }
.st-sort .st-line.full { height: 6mm; }
.st-item { align-items: flex-start; }
.st-options { display: flex; flex-wrap: wrap; gap: 1.4mm 6mm; margin-top: 0.6mm; }
.st-opt { display: inline-flex; align-items: center; gap: 1.6mm; }
.st-opt b { display: inline-flex; align-items: center; justify-content: center; width: 4.8mm; height: 4.8mm; border: 0.8pt solid var(--ink); border-radius: 50%; font: 700 7.6pt/1 "Manrope", sans-serif; }
.st-opt.picked b { background: #111; color: #fff; }
.st-box { width: 5mm; height: 5mm; border: 0.8pt solid var(--ink); border-radius: 1mm; display: inline-flex; align-items: center; justify-content: center; font-size: 9pt; }
.st-tf { display: flex; align-items: flex-start; gap: 4mm; }
.st-tf > span:first-child { flex: 1; }
.st-tf-box { flex: none; min-width: 14mm; height: 6mm; border: 0.8pt solid var(--ink); border-radius: 1.6mm; text-align: center; font: 700 9pt/6mm "Manrope", sans-serif; }
.st-example { color: var(--ink-2); }
.st-example .item-num { border-style: dashed; }
.st-ex-ans { font-family: "Segoe Print", "Comic Sans MS", cursive; font-size: 11pt; color: var(--ink-2); border-bottom: 0.8pt solid var(--ink-3); padding: 0 2mm; }
.st-ex-ans.picked { color: #fff; background: #111; border-bottom-color: transparent; border-radius: 1.2mm; padding: 0 1.6mm; }
.st-order-box.picked { background: #111; color: #fff; }
/* Worksheet-only parts (studio/ws-paper.js) */
.ws-x .item-text { display: block; }
.ws-x .st-options { margin-top: 0.8mm; }
.ws-x .st-options.stack { flex-direction: column; gap: 1mm; }
.ws-x .st-options.stack .st-opt { align-items: flex-start; }
.ws-x .st-options.stack .st-opt b { flex: none; margin-top: 0.4mm; }
.ws-target { font: 800 10.6pt/1.3 "Manrope", "Inter", "Segoe UI", Arial, sans-serif; letter-spacing: 0.02em; }
.ws-stem { margin-left: 1.6mm; font: 800 10pt/1 "Manrope", "Inter", "Segoe UI", Arial, sans-serif; letter-spacing: 0.04em; }
.ws-wrong { font-weight: 800; }
.ws-clue { color: var(--ink-2); }
.ws-chips { display: inline-flex; flex-wrap: wrap; gap: 1.2mm; margin: 0.4mm 0 1mm; }
.ws-chips span { padding: 0.3mm 2.2mm; border: 0.6pt dashed var(--ink-3); border-radius: 99px; font-weight: 600; }
.ws-x .st-tf { align-items: center; }
.ws-match .item-text { display: flex; align-items: center; gap: 2.4mm; }
.ws-step-row { display: flex; align-items: center; gap: 2.2mm; margin: 0.4mm 0 1mm; }
.ws-step-row b { flex: none; font: 800 9pt/1 "Manrope", "Inter", sans-serif; color: var(--ink-3); }
.ws-step-row .st-order-box { width: 6mm; height: 6mm; line-height: 6mm; }
.ws-match .item-text b { min-width: 24mm; }
.ws-sort-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(42mm, 1fr)); gap: 0; margin: 0 0 2mm 9.8mm; border: 0.8pt solid var(--ink); border-radius: 1.6mm; overflow: hidden; }
.ws-sort-grid .ex-item { display: flex; flex-direction: column; margin: 0 !important; padding: 0 0 1.6mm !important; border-left: 0.8pt solid var(--ink); }
.ws-sort-grid .item-text { width: 100%; }
.ws-sort-grid .ex-item:first-child { border-left: 0; }
.ws-sort-grid .ws-sort-head { display: block; margin-bottom: 0.6mm; padding: 1.4mm 2mm; border-bottom: 0.8pt solid var(--ink); background: #f1f0eb; font: 800 10pt/1.2 "Manrope", "Inter", "Segoe UI", Arial, sans-serif; }
.ws-sort-grid .st-line.full { width: auto; height: 7mm; margin: 0 2.4mm; }
.ws-sort-grid .item-num { display: none; }
.ws-full .st-line.full { height: 7mm; }
`;
