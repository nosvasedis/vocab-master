/* Vocab Master — a list the teacher can grow and shrink in an editor: one row per entry (one or two boxes), a trash
 * can on each row and "+ Add" below. Used by the Test Maker's editors (pairs, word box, groups, help points…) and the
 * worksheet line editor (options, steps, word bank, word list). */
import { esc, icon } from "./ui.js";

const row = (cols, v = []) => {
  const vals = Array.isArray(v) ? v : [v];
  return `<div class="pe-pair pe-row${cols.length > 1 ? "" : " one"}" data-row><span class="pe-n"></span>${cols.map((c, j) => `<input class="input" data-col="${j}" value="${esc(vals[j] ?? "")}" aria-label="${esc(c)}" placeholder="${esc(c)}" autocomplete="off" />`).join("")}<button type="button" class="icon-btn sm danger pe-row-x" data-row-x aria-label="Delete this entry" data-tip="Delete">${icon("trash", "i-sm")}</button></div>`;
};

/** cols: [label] or [left label, right label]; values: strings or [left, right]. */
export const listField = (id, label, cols, values, { hint = "", add = "Add", wide = false } = {}) => `<div class="field pe-list${wide ? " wide" : ""}" data-list="${esc(id)}" data-cols="${esc(JSON.stringify(cols))}">
    ${label ? `<span class="label">${label}${hint ? ` <span class="opt">${hint}</span>` : ""}</span>` : ""}
    <div class="pe-pairs">${(values || []).map((v) => row(cols, v)).join("")}</div>
    <button type="button" class="btn btn-ghost btn-sm pe-row-add" data-row-add>${icon("plus", "i-sm")}${esc(add)}</button></div>`;

/** Wire every list in a dialog: delete a row, add one (and focus it), keep the numbers in order. onChange(id) after each. */
export function wireLists(root, onChange) {
  const renumber = (list) => list.querySelectorAll("[data-row] .pe-n").forEach((n, k) => { n.textContent = k + 1; });
  root.querySelectorAll("[data-list]").forEach(renumber);
  root.addEventListener("click", (e) => {
    const list = e.target.closest("[data-list]");
    if (!list) return;
    if (e.target.closest("[data-row-x]")) {
      e.target.closest("[data-row]").remove();
      renumber(list);
      onChange?.(list.dataset.list);
      return;
    }
    if (e.target.closest("[data-row-add]")) {
      list.querySelector(".pe-pairs").insertAdjacentHTML("beforeend", row(JSON.parse(list.dataset.cols)));
      renumber(list);
      list.querySelector(".pe-pairs [data-row]:last-child input")?.focus();
      onChange?.(list.dataset.list);
    }
  });
  root.addEventListener("input", (e) => { const list = e.target.closest("[data-list]"); if (list) onChange?.(list.dataset.list); });
}

/** The rows of a list: strings (one box) or [left, right] (two); empty rows are left out. */
export function listValues(root, id) {
  const list = root.querySelector(`[data-list="${id}"]`);
  if (!list) return [];
  return [...list.querySelectorAll("[data-row]")].map((r) => [...r.querySelectorAll("input")].map((i) => i.value.trim()))
    .filter((v) => v.some(Boolean)).map((v) => (v.length > 1 ? v : v[0]));
}
