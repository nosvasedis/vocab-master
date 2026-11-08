/* Vocab Master — find a word on the paper: every place it is tested is outlined and the word itself highlighted, and a
 * small bar steps through them ("“dog” — 2 of 3 · Part 1, question 2", ‹ ›, Esc). Used by the Test Maker's word check
 * and the worksheets' word coverage when the teacher clicks a word that is already on the paper. A click on a line still
 * opens its editor as usual; the finder stays until it is closed, the paper changes, or another word is found. */
import { esc, icon } from "./ui.js";

const STYLE = `.wf-hit { outline: 2px dashed rgba(245, 158, 11, 0.55); outline-offset: 2px; border-radius: 6px; }
.wf-current { outline: 2.5px solid #f59e0b; background: #fff8e6; }
mark.wf-mark { background: #fde68a; color: inherit; border-radius: 3px; padding: 0 1px; }`;

let current = null;

const escRx = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The word and its usual endings (cats, watched, swimming, baker…), whole words only, any case. */
function wordRx(word) {
  const w = String(word || "").trim();
  if (!w) return null;
  const body = w.split(/\s+/).map(escRx).join("[\\s-]+");
  return new RegExp(`(?<![A-Za-z])(${body}(?:s|es|ed|d|ing|er|ers)?)(?![A-Za-z])`, "gi");
}

/** Wrap the word in <mark> inside an element's text (not inside inputs or marks already there). */
function markWord(el, rx) {
  if (!el || !rx || el.querySelector("mark.wf-mark")) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest("mark, script, style, input, textarea") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const text = node.nodeValue;
    rx.lastIndex = 0;
    if (!rx.test(text)) continue;
    rx.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let at = 0;
    for (const m of text.matchAll(rx)) {
      if (m.index > at) frag.append(text.slice(at, m.index));
      const mark = document.createElement("mark");
      mark.className = "wf-mark";
      mark.textContent = m[0];
      frag.append(mark);
      at = m.index + m[0].length;
    }
    if (at < text.length) frag.append(text.slice(at));
    node.replaceWith(frag);
  }
}
function unmark(el) {
  el?.querySelectorAll("mark.wf-mark").forEach((m) => m.replaceWith(document.createTextNode(m.textContent)));
  el?.normalize?.();
}

/** Close the open finder (if any): highlights off, the bar away. */
export function closeWordFinder() {
  if (!current) return;
  const c = current;
  current = null;
  c.marked.forEach((el) => { el.classList.remove("wf-hit", "wf-current"); unmark(el); });
  c.bar.remove();
  document.removeEventListener("keydown", c.onKey, true);
  c.observer?.disconnect();
}

/**
 * root: the paper's (shadow) root. word: what to find. spots: [{ label, el() }] — el() shows the place (switching the
 * sheet if needed) and returns its element, or null. extra: { label, run } — a button for one more action (e.g. put it
 * somewhere else too).
 */
export function openWordFinder({ root, word, spots, extra = null }) {
  closeWordFinder();
  if (!root || !spots?.length) return;
  const rx = wordRx(word);
  const bar = document.createElement("div");
  bar.className = "wf-bar";
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", `Where “${word}” is`);
  document.body.appendChild(bar);
  const c = { root, word, spots, i: 0, bar, marked: new Set(), extra };
  current = c;

  const ensureStyle = () => {
    if (!c.root.querySelector("style[data-wf]")) {
      const st = document.createElement("style");
      st.dataset.wf = "";
      st.textContent = STYLE;
      c.root.appendChild(st);
    }
  };
  /** Outline every place that is on the paper now (the sheet shown), highlight the word in it. */
  const markAll = () => {
    ensureStyle();
    c.marked.forEach((el) => { if (!el.isConnected) c.marked.delete(el); });
    for (const s of c.spots) {
      const el = s.peek?.();
      if (!el) continue;
      el.classList.add("wf-hit");
      markWord(el, rx);
      c.marked.add(el);
    }
  };
  const draw = () => {
    const s = c.spots[c.i];
    bar.innerHTML = `<span class="wf-ico">${icon("target", "i-sm")}</span>
      <span class="wf-text"><b>“${esc(word)}”</b> <span class="wf-count">${c.i + 1} of ${c.spots.length}</span><small>${esc(s.label)}</small></span>
      <button type="button" class="icon-btn sm" data-wf-prev aria-label="Previous place" data-tip="Previous (←)"${c.spots.length < 2 ? " disabled" : ""}>${icon("chevron-left", "i-sm")}</button>
      <button type="button" class="icon-btn sm" data-wf-next aria-label="Next place" data-tip="Next (→)"${c.spots.length < 2 ? " disabled" : ""}>${icon("chevron-right", "i-sm")}</button>
      ${c.extra ? `<button type="button" class="btn btn-ghost btn-sm" data-wf-extra>${icon("plus", "i-sm")}${esc(c.extra.label)}</button>` : ""}
      <button type="button" class="icon-btn sm" data-wf-close aria-label="Close" data-tip="Close (Esc)">${icon("x", "i-sm")}</button>`;
  };
  const go = (i) => {
    if (current !== c) return;
    c.i = (i + c.spots.length) % c.spots.length;
    const el = c.spots[c.i].el();
    draw();
    markAll();
    c.marked.forEach((x) => x.classList.remove("wf-current"));
    if (el) {
      el.classList.add("wf-hit", "wf-current");
      markWord(el, rx);
      c.marked.add(el);
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  };
  bar.addEventListener("click", (e) => {
    if (e.target.closest("[data-wf-prev]")) go(c.i - 1);
    else if (e.target.closest("[data-wf-next]")) go(c.i + 1);
    else if (e.target.closest("[data-wf-close]")) closeWordFinder();
    else if (e.target.closest("[data-wf-extra]")) { const run = c.extra?.run; closeWordFinder(); run?.(); }
  });
  c.onKey = (e) => {
    if (current !== c || e.target.closest?.("input, textarea, select, [contenteditable]") || document.querySelector(".dialog-backdrop, [role=dialog]")) return;
    if (e.key === "ArrowRight") { e.preventDefault(); go(c.i + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(c.i - 1); }
    else if (e.key === "Escape") closeWordFinder();
  };
  document.addEventListener("keydown", c.onKey, true);
  // The paper drawn again (an edit, another sheet): the outlines come back on the new paper, at the same place.
  c.observer = new MutationObserver(() => {
    if (current !== c || c.busy) return;
    if ([...c.marked].some((el) => el.isConnected) && c.marked.size) return;
    c.busy = true;
    requestAnimationFrame(() => { c.busy = false; if (current === c) { markAll(); const el = c.spots[c.i].peek?.(); if (el) el.classList.add("wf-current"); } });
  });
  c.observer.observe(root, { childList: true });
  go(0);
}
