/* Vocab Master — the gap tool of the editors: while the teacher types in a box of an exercise editor (Test Maker parts,
 * worksheet lines and exercises), a small bar under it puts in a gap (short, standard, long, extra long), gives a gap
 * its label — "________ (name)" — and, with the cursor on a gap, makes that gap shorter or longer or takes it out.
 * A gap is a run of underscores; the paper prints it as long as it is (studio/paper-parts.js → gapsHtml). */
import { GAP_UNDERSCORES, gapSize } from "../studio/paper-parts.js";

const SIZES = [["short", "Short"], ["standard", "Gap"], ["long", "Long"], ["xlong", "Extra long"]];
const CSS = `
.gap-tool { position: fixed; z-index: 2000; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; max-width: min(560px, calc(100vw - 24px));
  padding: 4px 6px; border: 1px solid var(--line, #d9d6cc); border-radius: 10px; background: var(--surface, #fff); box-shadow: 0 6px 22px rgba(0,0,0,.14); font-size: 12px; }
.gap-tool[hidden] { display: none; }
.gap-tool > span { color: var(--ink-3, #777); font-weight: 700; padding: 0 4px 0 2px; white-space: nowrap; }
.gap-tool button { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 8px; border: 1px solid transparent; border-radius: 7px; background: var(--surface-2, #f4f2ec); color: inherit; font: inherit; font-weight: 600; cursor: pointer; white-space: nowrap; }
.gap-tool button:hover { border-color: var(--brand, #6b5bd6); }
.gap-tool button.on { background: var(--brand, #6b5bd6); color: #fff; }
.gap-tool button i { display: inline-block; height: 0; border-bottom: 1.6px solid currentColor; transform: translateY(3px); }
.gap-tool > .gt-sep { padding: 0; width: 1px; align-self: stretch; margin: 2px 3px; background: var(--line, #d9d6cc); }
.gap-tool .gt-x { color: var(--danger, #c0392b); }
`;
const LINE_PX = { short: 12, standard: 22, long: 34, xlong: 46 };

/** The gap under or next to the cursor: { start, end } of its underscores, or null. */
export function gapAt(value, pos) {
  const v = String(value || "");
  for (const m of v.matchAll(/_{3,}/g)) if (pos >= m.index && pos <= m.index + m[0].length) return { start: m.index, end: m.index + m[0].length };
  return null;
}

/** The text with a new gap of a size put in at [from, to] (spaced from the words around it). → { value, caret } */
export function insertGap(value, from, to, size = "standard") {
  const v = String(value || "");
  const gap = "_".repeat(GAP_UNDERSCORES[size] || 8);
  const before = v.slice(0, from);
  const after = v.slice(to);
  const pre = before && !/\s$/.test(before) && !/[(\[“"']$/.test(before) ? " " : "";
  const post = after && !/^[\s.,!?;:)\]…”"']/.test(after) ? " " : "";
  const out = `${before}${pre}${gap}${post}${after}`;
  return { value: out, caret: before.length + pre.length + gap.length };
}

/** The gap at [start, end] made another size. */
export function resizeGap(value, { start, end }, size) {
  const v = String(value || "");
  const gap = "_".repeat(GAP_UNDERSCORES[size] || 8);
  return { value: v.slice(0, start) + gap + v.slice(end), caret: start + gap.length };
}

/** The gap at [start, end] taken out (with its label, if it has one). */
export function removeGap(value, { start, end }) {
  const v = String(value || "");
  const label = v.slice(end).match(/^\s*\([^()]{0,32}\)/);
  const stop = end + (label ? label[0].length : 0);
  const out = (v.slice(0, start).replace(/ $/, "") + (v.slice(stop).startsWith(" ") || !v.slice(0, start).endsWith(" ") ? "" : " ") + v.slice(stop)).replace(/ {2,}/g, " ");
  return { value: out, caret: Math.max(0, start - 1) };
}

/** A label "( )" right after the gap at [start, end] (or the cursor inside its label if it has one). */
export function labelGap(value, { end }) {
  const v = String(value || "");
  const has = v.slice(end).match(/^(\s*\()([^()]{0,32})\)/);
  if (has) return { value: v, caret: end + has[1].length + has[2].length, select: [end + has[1].length, end + has[1].length + has[2].length] };
  const out = `${v.slice(0, end)} ()${v.slice(end)}`;
  return { value: out, caret: end + 2 };
}

let styled = false;
const isGapField = (el) => el && ((el.tagName === "TEXTAREA") || (el.tagName === "INPUT" && /^(text|search|)$/i.test(el.type || "text"))) && !el.closest("[data-no-gaps]") && !el.readOnly && !el.disabled;

/** Wire the gap tool into an editor (a dialog's root). Every text box in it gets the bar while it has the focus. */
export function wireGapTool(root) {
  if (!root || root.__gapTool) return;
  root.__gapTool = true;
  if (!styled) { const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st); styled = true; }
  const bar = document.createElement("div");
  bar.className = "gap-tool";
  bar.hidden = true;
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Gaps");
  // On the backdrop (fixed over the whole window), so a moving dialog never shifts it.
  root.appendChild(bar);
  let field = null;

  const draw = () => {
    if (!field) return;
    const at = gapAt(field.value, field.selectionStart ?? 0);
    const cur = at ? gapSize(at.end - at.start) : null;
    const btn = (size, label) => `<button type="button" data-gt-size="${size}" class="${cur === size ? "on" : ""}" title="${at ? `Make this gap ${label.toLowerCase()}` : `Put in a ${label === "Gap" ? "standard" : label.toLowerCase()} gap`}"><i style="width:${LINE_PX[size]}px"></i>${label}</button>`;
    bar.innerHTML = `<span>${at ? "This gap" : "Gap"}</span>${SIZES.map(([s, l]) => btn(s, l)).join("")}<span class="gt-sep"></span><button type="button" data-gt-label title="A label after the gap, e.g. (name) — printed small under the line in sentences about you">( ) Label</button>${at ? `<button type="button" class="gt-x" data-gt-remove title="Take this gap out">✕ Remove</button>` : ""}`;
    place();
  };
  const place = () => {
    if (!field || bar.hidden) return;
    const r = field.getBoundingClientRect();
    const h = bar.offsetHeight || 34;
    const below = r.bottom + 4 + h < window.innerHeight;
    bar.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - bar.offsetWidth - 8))}px`;
    bar.style.top = `${below ? r.bottom + 4 : Math.max(8, r.top - h - 4)}px`;
  };
  const show = (el) => { field = el; bar.hidden = false; draw(); };
  const hide = () => { bar.hidden = true; field = null; };
  const apply = (res) => {
    if (!field || !res) return;
    field.value = res.value;
    field.focus();
    if (res.select) field.setSelectionRange(res.select[0], res.select[1]);
    else field.setSelectionRange(res.caret, res.caret);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    draw();
  };

  root.addEventListener("focusin", (e) => { if (isGapField(e.target)) show(e.target); else if (!bar.contains(e.target)) hide(); });
  root.addEventListener("focusout", (e) => { if (e.target === field) setTimeout(() => { if (document.activeElement !== field && !bar.contains(document.activeElement)) hide(); }, 120); });
  ["keyup", "click", "input", "select"].forEach((ev) => root.addEventListener(ev, (e) => { if (e.target === field) draw(); }));
  root.addEventListener("scroll", place, true);
  window.addEventListener("resize", place);
  // The bar's buttons never take the focus from the box.
  bar.addEventListener("mousedown", (e) => e.preventDefault());
  bar.addEventListener("click", (e) => {
    if (!field) return;
    const v = field.value;
    const from = field.selectionStart ?? v.length;
    const to = field.selectionEnd ?? from;
    const at = gapAt(v, from);
    const size = e.target.closest("[data-gt-size]")?.dataset.gtSize;
    if (size) apply(at ? resizeGap(v, at, size) : insertGap(v, from, to, size));
    else if (e.target.closest("[data-gt-label]")) {
      if (at) apply(labelGap(v, at));
      else { const g = insertGap(v, from, to, "standard"); apply(labelGap(g.value, { end: g.caret })); }
    } else if (e.target.closest("[data-gt-remove]") && at) apply(removeGap(v, at));
  });
}
