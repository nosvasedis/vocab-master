/* Projector mode — full-screen worksheet for the interactive whiteboard; tap lines to reveal answers. */
import { WORKSHEET_PRINT_CSS, renderLingoLauncher, renderDictation, renderAnswerKey } from "../../app.js";
import { $, esc, icon, el, segmented, toast } from "../ui.js";
import { state, bookTitle, unitNumber, pageRange } from "../state.js";

const PJ_CSS = WORKSHEET_PRINT_CSS.replace(/@page[^}]*}/, "").replace(/html,\s*body\s*{[^}]*}/, "") + `
:host { all: initial; display: block; }
.worksheet { max-width: none; zoom: var(--pj-zoom, 1.35); }
.teacher-ans-pill {
  display: inline-flex; align-items: center; margin-left: 8px; padding: 0 10px; height: 1.6em;
  border-radius: 99px; font-weight: 700; color: #057a55; background: #d9f7ea;
  opacity: 0; transform: scale(0.6); transition: opacity 220ms, transform 320ms cubic-bezier(.34,1.56,.64,1);
  vertical-align: 1px;
}
.ex-item.pj { cursor: pointer; border-radius: 8px; margin-left: -8px; margin-right: -8px; padding: 2px 8px; transition: background 140ms; }
.ex-item.pj:hover { background: #f3f1ff; }
.ex-item.pj.revealed .teacher-ans-pill { opacity: 1; transform: none; }
.ex-item.pj.next { box-shadow: inset 3px 0 0 #5b4cf5; }
`;

let open = null;

export function openProjector() {
  if (!state.data) {
    toast("Generate a unit (or open the sample) to use Projector mode.", "warn");
    return;
  }
  if (open) return;
  let sheet = state.preview.sheet;
  let zoom = 1.35;
  const root = el(`<div class="projector" role="dialog" aria-modal="true" aria-label="Projector mode">
    <div class="pj-bar">
      <div class="pj-title"><small>Projector mode</small><strong>${esc(bookTitle())}${unitNumber() ? ` · Unit ${esc(unitNumber())}` : ""}${pageRange() ? ` · p. ${esc(pageRange())}` : ""}</strong></div>
      <div class="segmented" data-segmented>
        <span class="seg-thumb"></span>
        <button type="button" data-value="lingo">🚀 Lingo Launcher</button>
        <button type="button" data-value="dictation">📝 Dictation</button>
        <button type="button" data-value="answer">📋 Answer key</button>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" data-reveal>${icon("eye", "i-sm")}<span>Reveal all</span></button>
      <button type="button" class="icon-btn" data-zoom="-1" aria-label="Smaller text">${icon("zoom-out")}</button>
      <button type="button" class="icon-btn" data-zoom="1" aria-label="Larger text">${icon("zoom-in")}</button>
      <button type="button" class="icon-btn" data-full aria-label="Full screen">${icon("maximize")}</button>
      <button type="button" class="btn btn-primary btn-sm" data-exit>${icon("x", "i-sm")}Exit</button>
    </div>
    <div class="pj-stage"><div class="pj-paper"></div></div>
    <div class="pj-hint">Tap a line to reveal its answer · <kbd>Space</kbd> reveals the next one · <kbd>Esc</kbd> exits</div>
  </div>`);
  document.getElementById("overlayRoot").appendChild(root);
  const shadow = root.querySelector(".pj-paper").attachShadow({ mode: "open" });

  const items = () => [...shadow.querySelectorAll(".ex-item.pj")];
  const markNext = () => {
    const list = items();
    list.forEach((n) => n.classList.remove("next"));
    list.find((n) => !n.classList.contains("revealed"))?.classList.add("next");
    const all = list.length && list.every((n) => n.classList.contains("revealed"));
    root.querySelector("[data-reveal] span").textContent = all ? "Hide all" : "Reveal all";
    root.querySelector("[data-reveal]").classList.toggle("hidden", sheet === "answer");
  };
  const render = () => {
    const opts = { showAnswers: sheet !== "answer", studentHeader: false, density: "comfortable" };
    const html = sheet === "lingo" ? renderLingoLauncher(state.data, opts) : sheet === "dictation" ? renderDictation(state.data, opts) : renderAnswerKey(state.data, opts);
    shadow.innerHTML = `<style>${PJ_CSS}</style>${html}`;
    shadow.querySelector(".worksheet")?.style.setProperty("--pj-zoom", zoom);
    if (sheet !== "answer") shadow.querySelectorAll(".ex-item").forEach((n) => n.classList.add("pj"));
    markNext();
  };
  segmented(root.querySelector("[data-segmented]"), { value: sheet, onChange: (v) => { sheet = v; render(); } });
  shadow.addEventListener("click", (e) => {
    const item = e.composedPath().find((n) => n.classList?.contains("pj"));
    if (item) { item.classList.toggle("revealed"); markNext(); }
  });
  root.querySelector("[data-reveal]").addEventListener("click", () => {
    const list = items();
    const all = list.every((n) => n.classList.contains("revealed"));
    list.forEach((n) => n.classList.toggle("revealed", !all));
    markNext();
  });
  root.querySelectorAll("[data-zoom]").forEach((b) => b.addEventListener("click", () => {
    zoom = Math.max(0.9, Math.min(2.4, zoom + Number(b.dataset.zoom) * 0.15));
    shadow.querySelector(".worksheet")?.style.setProperty("--pj-zoom", zoom);
  }));
  root.querySelector("[data-full]").addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else root.requestFullscreen?.().catch(() => {});
  });
  const close = () => {
    if (!open) return;
    open = null;
    window.removeEventListener("keydown", onKey, true);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    root.classList.add("closing");
    setTimeout(() => root.remove(), 200);
  };
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
    if ((e.key === " " || e.key === "ArrowRight") && sheet !== "answer") {
      e.preventDefault();
      const next = items().find((n) => !n.classList.contains("revealed"));
      if (next) { next.classList.add("revealed"); next.scrollIntoView({ block: "center", behavior: "smooth" }); markNext(); }
    }
    if (e.key === "ArrowLeft" && sheet !== "answer") {
      e.preventDefault();
      const revealed = items().filter((n) => n.classList.contains("revealed"));
      revealed[revealed.length - 1]?.classList.remove("revealed");
      markNext();
    }
  };
  window.addEventListener("keydown", onKey, true);
  root.querySelector("[data-exit]").addEventListener("click", close);
  open = { close };
  render();
}

export function isProjectorOpen() { return !!open; }
