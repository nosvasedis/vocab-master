/* Step 4 — A4 preview with click-to-edit, quality checks, coverage, layout options and exports. */
import {
  EXERCISE_LABELS, WORKSHEET_PRINT_CSS, renderLingoLauncher, renderDictation, renderAnswerKey,
  renderCoverageHeatmap, validateWorksheet, buildValidationReport, normalizeWorksheetExercises,
  saveWorksheetSession, applyQuickWorksheetFixes, WORKSHEET_LAYOUT_DEFAULTS, buildWorksheetPrintDocument, splitEmojiText, countQuickFixIssues, fixWorksheetValidationIssues,
  fixDictationCoverageGaps, fixAllWorksheetIssues, exportDocx, openWorksheetPrint, fileBaseName, getSavedSession, remakeWorksheetItem,
} from "../../app.js";
import { $, esc, icon, plural, toast, openDialog, segmented, withBusy } from "../ui.js";
import { state, emit, on, buildForm, makeWord, prefs, worksheetFreshness } from "../state.js";
import { worksheetFontCss } from "../fonts.js";
import { PICTURE_STYLES, ensurePictureStyle, rasterisePictures } from "../pictures.js";
import { savePrefs } from "../state.js";
import { desktop, getApiKey, isAiReady, chatgptUsageLimited, manageChatGPTUsage } from "../bridge.js";
import { actions } from "../actions.js";
import { play } from "../../arcade/audio.js";
import { picPngMap, inlinePictures } from "../../studio/pic-assets.js";

let sheetSeg;
let densitySeg;
let shadow;

const SHEET_NAME = { lingo: "Lingo Launcher", dictation: "Dictation", answer: "Answer Key" };

/* Worksheet CSS for the on-screen paper: the exact print rules, plus edit affordances. */
const PAPER_CSS = WORKSHEET_PRINT_CSS.replace(/@page[^}]*}/, "").replace(/html,\s*body\s*{[^}]*}/, "") + `
:host { all: initial; display: block; color: #000; }
.worksheet { max-width: none; }
.teacher-ans-pill {
  display: inline-flex; align-items: center; margin-left: 6px; padding: 0 8px; height: 20px;
  border-radius: 99px; font: 600 9pt/20px "Segoe UI", sans-serif; color: #057a55; background: #e6f8f1;
  vertical-align: 1px;
}
.editable, .editable-vocab { cursor: pointer; border-radius: 6px; transition: background 140ms, box-shadow 140ms; }
.ex-item.editable { margin-left: -6px; margin-right: -6px; padding: 1px 6px; }
.editable:hover, .editable-vocab:hover { background: #f1efff; box-shadow: 0 0 0 1.5px #b7aefc; }
.editable:focus-visible, .editable-vocab:focus-visible { outline: none; background: #f1efff; box-shadow: 0 0 0 2px #5b4cf5; }
td.editable-vocab { border-radius: 0; }
td.editable-vocab:hover { box-shadow: inset 0 0 0 2px #b7aefc; }
.flash { animation: flash 1.2s ease-out; }
@keyframes flash { 0% { background: #d6f5e8; } 100% { background: transparent; } }
.ex-item.editable { position: relative; }
.pe-bar { position: absolute; top: -13px; right: 4px; z-index: 6; display: flex; gap: 3px; padding: 3px; border-radius: 10px; background: #fff; box-shadow: 0 6px 18px rgba(40, 30, 120, .18), 0 0 0 1px #e3defd; font: 650 12.5px/1 "Segoe UI", system-ui, sans-serif; white-space: nowrap; }
.pe-bar button { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 10px; border: 0; border-radius: 7px; background: transparent; color: #3b2fc9; font: inherit; cursor: pointer; }
.pe-bar button:hover { background: #efedff; }
.pe-bar button.magic { color: #fff; background: linear-gradient(135deg, #6d5df6, #a855f7); }
.pe-bar button.danger { color: #c2410c; }
.pe-bar button.danger:hover { background: #fff1e8; }
.ex-item.pe-busy { pointer-events: none; background: #f3f1ff; }
.ex-item.pe-busy > * { opacity: .35; }
.ex-item.pe-busy::after { content: "Lingo is rewriting…"; position: absolute; inset: 0; display: grid; place-items: center; font: 700 12px/1 "Segoe UI", sans-serif; color: #4b3fd6; }
`;

export function initPreview() {
  shadow = $("paper").attachShadow({ mode: "open" });
  sheetSeg = segmented($("sheetSeg"), {
    value: state.preview.sheet,
    onChange: (v) => { state.preview.sheet = v; emit("preview"); renderLayoutControls(); renderPaper(); },
  });
  densitySeg = segmented($("densitySeg"), {
    value: state.preview.density,
    onChange: (v) => { state.preview.density = v; emit("preview"); renderPaper(); },
  });
  $("optAnswers").addEventListener("change", (e) => { state.preview.showAnswers = e.target.checked; emit("preview"); renderPaper(); });
  document.querySelectorAll("[data-layout]").forEach((cb) => cb.addEventListener("change", () => {
    const sheet = state.preview.sheet;
    state.preview.layout[sheet] = { ...sheetLayout(sheet), [cb.dataset.layout]: cb.checked };
    emit("preview");
    renderPaper();
  }));
  $("picStyle").innerHTML = Object.entries(PICTURE_STYLES).map(([id, s]) => `<option value="${id}">${esc(s.label)}</option>`).join("");
  $("picStyle").addEventListener("change", async (e) => {
    prefs.pictureStyle = e.target.value;
    savePrefs();
    await ensurePictureStyle(prefs.pictureStyle);
    renderLayoutControls();
    renderPaper();
  });
  $("schoolNote").addEventListener("click", (e) => { if (e.target.closest("[data-open-settings]")) actions.openSettings({ focusKey: false }); });
  $("zoomIn").addEventListener("click", () => setZoom(+0.1));
  $("zoomOut").addEventListener("click", () => setZoom(-0.1));
  new ResizeObserver(() => applyZoom()).observe($("paperStage"));

  shadow.addEventListener("click", onPaperActivate);
  // Hovering a line shows Edit, ✨ Remake (Lingo writes just that line again) and Delete.
  shadow.addEventListener("mouseover", (e) => {
    const item = e.composedPath().find((n) => n.classList?.contains("editable") && n.classList.contains("ex-item"));
    if (!item || item.querySelector(".pe-bar") || item.classList.contains("pe-busy")) return;
    shadow.querySelectorAll(".pe-bar").forEach((b) => b.remove());
    item.insertAdjacentHTML("beforeend", `<div class="pe-bar"><button type="button" data-pe-act="edit">✎ Edit</button><button type="button" class="magic" data-pe-act="remake" title="Lingo writes this line again">✨ Remake</button><button type="button" data-pe-act="add" title="Add a new line after this one">＋ Add after</button><button type="button" class="danger" data-pe-act="delete" title="Delete this line — the exercise renumbers">🗑 Delete</button></div>`);
  });
  shadow.addEventListener("mouseleave", () => shadow.querySelectorAll(".pe-bar").forEach((b) => b.remove()), true);
  shadow.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") onPaperActivate(e);
  });

  $("btnExportPack").addEventListener("click", (e) => exportPack(e.currentTarget));
  $("btnDocx").addEventListener("click", (e) => exportWord(state.preview.sheet, e.currentTarget));
  $("btnPdf").addEventListener("click", (e) => exportPdf(state.preview.sheet, e.currentTarget));
  $("btnPrint").addEventListener("click", () => printSheet(state.preview.sheet));
  $("btnDuplicate").addEventListener("click", duplicateUnit);
  $("qualityPanel").addEventListener("click", (e) => {
    const b = e.target.closest("[data-fix]");
    if (b) runFix(b.dataset.fix, b);
  });
  if (!desktop()) $("packNote").textContent = "Downloads all three sheets as Word documents.";

  on("data", () => { if (state.view === "preview") renderPreview(); });
}

export function renderPreview() {
  sheetSeg.set(state.preview.sheet);
  densitySeg.set(state.preview.density);
  $("optAnswers").checked = state.preview.showAnswers;
  renderLayoutControls();
  const has = !!state.data;
  ["btnExportPack", "btnDocx", "btnPdf", "btnPrint", "btnDuplicate"].forEach((id) => { $(id).disabled = !has; });
  if (!has) {
    shadow.innerHTML = "";
    $("paper").classList.add("hidden");
    $("qualityPanel").innerHTML = "";
    $("coveragePanel").innerHTML = "";
    return;
  }
  $("paper").classList.remove("hidden");
  renderPaper();
  renderQuality();
}

/* ── Layout options ──────────────────────────────────────────────── */
function sheetLayout(sheet) {
  const layout = { ...WORKSHEET_LAYOUT_DEFAULTS[sheet], ...(state.preview.layout?.[sheet] || {}) };
  // Greek help lines default to on for A–C Senior (younger classes), off for D–E.
  if (typeof layout.greekHelp !== "boolean") layout.greekHelp = ["A_SENIOR", "B_SENIOR", "C_SENIOR"].includes(state.data?.meta?.classProfile || state.profileId);
  return layout;
}

/** Everything the worksheet renderers and Word builders need (saved in data.meta.layout). */
function layoutPayload() {
  return { lingo: sheetLayout("lingo"), dictation: sheetLayout("dictation"), answer: sheetLayout("answer"), schoolName: prefs.schoolName || "", pictureStyle: prefs.pictureStyle || "emoji" };
}

const LAYOUT_ROWS = { lingo: ["studentHeader", "scoreBoxes", "greekHelp", "footer"], dictation: ["studentHeader", "scoreBoxes", "greekHelp", "reuseNote", "footer"], answer: ["footer"] };

function renderLayoutControls() {
  const sheet = state.preview.sheet;
  const layout = sheetLayout(sheet);
  $("layoutFor").textContent = `· ${SHEET_NAME[sheet]}`;
  $("picStyle").value = prefs.pictureStyle || "emoji";
  $("picHint").textContent = `${PICTURE_STYLES[prefs.pictureStyle || "emoji"].hint} — all sheets, Word files and games.`;
  document.querySelectorAll("[data-layout-row]").forEach((row) => row.classList.toggle("hidden", !LAYOUT_ROWS[sheet].includes(row.dataset.layoutRow)));
  document.querySelectorAll("[data-layout]").forEach((cb) => { cb.checked = !!layout[cb.dataset.layout]; });
  $("schoolNote").innerHTML = prefs.schoolName
    ? `School name on every sheet: <b>${esc(prefs.schoolName)}</b> · <a data-open-settings>change</a>`
    : `Add your school’s name in <a data-open-settings>Settings</a> to print it on every sheet.`;
}

/* ── Paper ───────────────────────────────────────────────────────── */
function renderOpts() {
  return { showAnswers: state.preview.showAnswers, density: state.preview.density, layout: layoutPayload() };
}

function syncMeta() {
  if (!state.data?.meta) return;
  state.data.meta.layout = layoutPayload();
  state.data.meta.includeStudentHeader = !!sheetLayout("lingo").studentHeader;
  state.data.meta.density = state.preview.density;
}

function renderPaper() {
  if (!state.data) return;
  syncMeta();
  const sheet = state.preview.sheet;
  const html = sheet === "lingo" ? renderLingoLauncher(state.data, renderOpts())
    : sheet === "dictation" ? renderDictation(state.data, renderOpts())
      : renderAnswerKey(state.data, renderOpts());
  shadow.innerHTML = `<style>${PAPER_CSS}</style>${html}`;
  $("editHint").classList.toggle("hidden", sheet === "answer");
  if (sheet !== "answer") decorateEditable(sheet);
  const p = $("paper");
  p.style.animation = "none";
  void p.offsetWidth;
  p.style.animation = "";
  applyZoom();
}

function decorateEditable(sheet) {
  if (sheet === "lingo") {
    shadow.querySelectorAll("td.vocab-cell[data-vocab-num]").forEach((td) => {
      td.classList.add("editable-vocab");
      td.tabIndex = 0;
      td.setAttribute("role", "button");
      td.title = "Click to edit this word";
    });
  }
  const list = sheet === "lingo" ? state.data.lingoLauncher.practice : state.data.dictation.exercises;
  shadow.querySelectorAll(".ex-block").forEach((block, exIndex) => {
    if (!list[exIndex]) return;
    block.querySelectorAll(".ex-item").forEach((item, itemIndex) => {
      item.classList.add("editable");
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      item.title = "Click to edit this line";
      item.dataset.ex = String(exIndex);
      item.dataset.item = String(itemIndex);
    });
  });
}

function onPaperActivate(e) {
  const path = e.composedPath();
  const cell = path.find((n) => n.classList?.contains("editable-vocab"));
  if (cell) { e.preventDefault(); openVocabEditor(Number(cell.dataset.vocabNum) - 1); return; }
  const item = path.find((n) => n.classList?.contains("editable"));
  if (!item || item.classList.contains("pe-busy")) return;
  e.preventDefault();
  if (path.some((n) => n.dataset?.peAct === "remake")) { remakeDialog(state.preview.sheet, Number(item.dataset.ex), Number(item.dataset.item)); return; }
  if (path.some((n) => n.dataset?.peAct === "delete")) { deleteLine(state.preview.sheet, Number(item.dataset.ex), Number(item.dataset.item)); return; }
  if (path.some((n) => n.dataset?.peAct === "add")) { addLineDialog(state.preview.sheet, Number(item.dataset.ex), Number(item.dataset.item)); return; }
  openItemEditor(state.preview.sheet, Number(item.dataset.ex), Number(item.dataset.item));
}

/* ── Delete one line: the exercise renumbers, its answer leaves the word box, the answer key follows ── */
function deleteLine(sheet, exIndex, itemIndex) {
  const ex = getExercise(sheet, exIndex);
  const item = ex?.items?.[itemIndex];
  if (!ex || !item) return;
  if (ex.items.length <= 1) { toast("An exercise needs at least one line — edit or remake this one instead.", "warn", { ms: 4500 }); return; }
  const before = JSON.stringify(state.data);
  const lc = (x) => String(typeof x === "string" ? x : x?.english || x?.text || x?.word || "").trim().toLowerCase();
  const [gone] = ex.items.splice(itemIndex, 1);
  ex.items.forEach((it, i) => { it.number = i + 1; });
  // Its answer leaves the word box / word list too, unless another line still needs it (lettered answers stay).
  const answer = lc(gone?.answer);
  if (answer.length > 1 && !ex.items.some((it) => lc(it.answer) === answer)) {
    for (const key of ["wordBank", "wordList"]) {
      const at = Array.isArray(ex[key]) ? ex[key].findIndex((w) => lc(w) === answer) : -1;
      if (at >= 0) ex[key].splice(at, 1);
    }
  }
  state.data = normalizeWorksheetExercises(state.data);
  persistSession();
  renderPreview();
  toast(`Line ${item.number} deleted — ${plural(ex.items.length, "line")} left in exercise ${ex.number}.`, "ok", { ms: 6000, actions: [{ label: "Undo", run: () => { state.data = JSON.parse(before); persistSession(); renderPreview(); } }] });
}

/* ── Add lines after a line: Lingo writes new ones (how many, words, a wish), or a copy to edit ── */
const MAX_LINES = 12;
function addLineDialog(sheet, exIndex, itemIndex) {
  const ex = getExercise(sheet, exIndex);
  const item = ex?.items?.[itemIndex];
  if (!ex || !item) return;
  const room = MAX_LINES - ex.items.length;
  if (room <= 0) { toast(`An exercise can have up to ${MAX_LINES} lines.`, "info"); return; }
  const lc = (x) => String(x || "").trim().toLowerCase();
  const used = (w) => ex.items.some((it) => lc(it.answer).includes(lc(w)) || lc(it.prompt).includes(lc(w)));
  const words = (state.data?.lingoLauncher?.vocabulary || []).map((v) => v.english).filter(Boolean).sort((a, b) => Number(used(a)) - Number(used(b))).slice(0, 24);
  openDialog({
    title: `Add after line ${item.number}`, subtitle: `${SHEET_NAME[sheet]} · Exercise ${ex.number} · ${EXERCISE_LABELS[ex.typeId] || ex.typeId}`, iconName: "plus", tone: "brand", size: "sm",
    body: `<div class="pe-wishes pa-mode" role="tablist"><button type="button" class="chip active" data-pa-mode="ai">✨ Lingo writes it</button><button type="button" class="chip" data-pa-mode="copy">⧉ A copy to edit</button></div>
      <div data-pa-panel="ai">
        <div class="field"><span class="label">How many</span><span class="stepper" id="pa_n"><button type="button" class="icon-btn sm" data-pa-step="-1" aria-label="Fewer">${icon("minus", "i-sm")}</button><b>1</b><button type="button" class="icon-btn sm" data-pa-step="1" aria-label="More">${icon("plus", "i-sm")}</button></span> <small class="st-hint">up to ${Math.min(3, room)}</small></div>
        ${words.length ? `<div class="field"><span class="label">Use these words <span class="opt">optional — or Lingo picks words this exercise hasn't used</span></span><div class="pe-wishes">${words.map((w) => `<button type="button" class="chip${used(w) ? " used" : ""}" data-pa-word="${esc(w)}">${esc(w)}</button>`).join("")}</div></div>` : ""}
        <div class="field"><label class="label" for="pa_wish">Anything else? <span class="opt">optional</span></label><textarea class="textarea" id="pa_wish" rows="2" placeholder="e.g. about school, easier, a funny sentence"></textarea></div>
      </div>
      <div data-pa-panel="copy" hidden><p class="st-hint">${icon("info", "i-xs")} Line ${item.number} is copied right after it and opens for editing — change the word and the sentence.</p></div>`,
    foot: `<span class="spacer"></span><button type="button" class="btn btn-secondary" data-close>Cancel</button><button type="button" class="btn btn-magic" data-pa-go>${icon("sparkles", "i-sm")}<span>Add 1 line</span></button>`,
    onMount(root, close) {
      let mode = "ai";
      let n = 1;
      const go = root.querySelector("[data-pa-go]");
      const sync = () => {
        root.querySelector("#pa_n").querySelector("b").textContent = n;
        go.className = `btn ${mode === "ai" ? "btn-magic" : "btn-primary"}`;
        go.innerHTML = `${icon(mode === "ai" ? "sparkles" : "copy", "i-sm")}<span>${mode === "ai" ? `Add ${n} line${n === 1 ? "" : "s"}` : "Copy and edit"}</span>`;
      };
      root.querySelectorAll("[data-pa-mode]").forEach((b) => b.addEventListener("click", () => {
        mode = b.dataset.paMode;
        root.querySelectorAll("[data-pa-mode]").forEach((x) => x.classList.toggle("active", x === b));
        root.querySelectorAll("[data-pa-panel]").forEach((p) => { p.hidden = p.dataset.paPanel !== mode; });
        sync();
      }));
      root.querySelectorAll("[data-pa-step]").forEach((b) => b.addEventListener("click", () => { n = Math.max(1, Math.min(Math.min(3, room), n + Number(b.dataset.paStep))); sync(); }));
      root.querySelectorAll("[data-pa-word]").forEach((b) => b.addEventListener("click", () => b.classList.toggle("active")));
      go.addEventListener("click", () => {
        const picked = [...root.querySelectorAll("[data-pa-word].active")].map((b) => b.dataset.paWord);
        const wish = root.querySelector("#pa_wish")?.value.trim() || "";
        close();
        if (mode === "copy") { copyLine(sheet, exIndex, itemIndex); return; }
        addLines(sheet, exIndex, itemIndex, n, { words: picked, wish });
      });
      sync();
    },
  });
}

/** Put a copy of a line right after it and renumber the exercise; returns the new line's index. */
function insertCopy(sheet, exIndex, itemIndex) {
  const ex = getExercise(sheet, exIndex);
  ex.items.splice(itemIndex + 1, 0, JSON.parse(JSON.stringify(ex.items[itemIndex])));
  ex.items.forEach((it, i) => { it.number = i + 1; });
  return itemIndex + 1;
}

function copyLine(sheet, exIndex, itemIndex) {
  const before = JSON.stringify(state.data);
  const at = insertCopy(sheet, exIndex, itemIndex);
  persistSession();
  renderPreview();
  toast(`Line ${at + 1} is a copy — change it now.`, "ok", { ms: 6000, actions: [{ label: "Undo", run: () => { state.data = JSON.parse(before); persistSession(); renderPreview(); } }] });
  openItemEditor(sheet, exIndex, at);
}

/** Lingo writes new lines: each starts as a copy of the line before and is remade as a NEW line. */
async function addLines(sheet, exIndex, itemIndex, count, { words = [], wish = "" } = {}) {
  if (!isAiReady()) { actions.openSettings(); return; }
  const before = JSON.stringify(state.data);
  const ex = getExercise(sheet, exIndex);
  actions.setAiState("busy");
  const stop = toast(`Lingo is writing ${count === 1 ? "a new line" : `${count} new lines`}…`, "info", { ms: 60000 });
  let made = 0;
  try {
    for (let k = 0; k < count; k++) {
      const at = insertCopy(sheet, exIndex, itemIndex + k);
      const word = words[k] || "";
      const line = getExercise(sheet, exIndex).items[at];
      const ask = [
        "This is a NEW line added to the exercise: write a completely new line of the same kind, different from every other line in the exercise.",
        word ? `Build it on the word "${word}".` : "Build it on a unit word this exercise hasn't used yet.",
        wish,
      ].filter(Boolean).join(" ");
      const res = await remakeWorksheetItem(buildForm(), getApiKey(), state.data, { sheet, exercise: ex.number, item: line.number, wish: ask });
      if (!res.changed) { getExercise(sheet, exIndex).items.splice(at, 1); getExercise(sheet, exIndex).items.forEach((it, i) => { it.number = i + 1; }); break; }
      state.data = res.data;
      // The new answer belongs in the exercise's word box / word list too.
      const exNow = getExercise(sheet, exIndex);
      const ans = String(exNow.items[at]?.answer || "").trim();
      for (const key of ["wordBank", "wordList"]) {
        const box = exNow[key];
        if (ans && Array.isArray(box) && box.length && box.every((w) => typeof w === "string") && !box.some((w) => w.trim().toLowerCase() === ans.toLowerCase())) box.push(ans);
      }
      made++;
    }
    actions.setAiState("on");
    if (!made) { state.data = JSON.parse(before); toast("Lingo couldn’t write a new line this time. Try again, or use “A copy to edit”.", "warn", { ms: 6000 }); return; }
    state.data = normalizeWorksheetExercises(state.data);
    persistSession();
    renderPreview();
    flashNode(`.ex-item[data-ex="${exIndex}"][data-item="${itemIndex + 1}"]`);
    toast(`${made === 1 ? `Line ${itemIndex + 2} is new` : `${made} new lines`}${made < count ? ` (${count - made} couldn’t be written)` : ""}.`, made < count ? "warn" : "ok", { ms: 6000, actions: [{ label: "Undo", run: () => { state.data = JSON.parse(before); persistSession(); renderPreview(); } }] });
  } catch (err) {
    state.data = JSON.parse(before);
    actions.setAiState("error", err.message);
    toast(err.message || String(err), "error");
  } finally {
    stop?.();
  }
}

/* ── ✨ Remake one line ── */
const LINE_WISHES = [["Another word", "build it on another word, not the same one"], ["Easier", "make it easier for this class"], ["Harder", "make it a bit harder"], ["Shorter", "make the sentence shorter"], ["New situation", "keep the word but write a new everyday situation"]];
function remakeDialog(sheet, exIndex, itemIndex) {
  const ex = getExercise(sheet, exIndex);
  const item = ex?.items?.[itemIndex];
  if (!ex || !item) return;
  if (!isAiReady()) { actions.openSettings(); return; }
  openDialog({
    title: `Remake line ${item.number}`, subtitle: `${SHEET_NAME[sheet]} · Exercise ${ex.number} · ${EXERCISE_LABELS[ex.typeId] || ex.typeId}`, iconName: "sparkles", tone: "brand", size: "sm",
    body: `<p class="pe-now">${esc(item.prompt || "")}${item.answer ? ` <b>→ ${esc(item.answer)}</b>` : ""}</p>
      <div class="field"><label class="label" for="pe_wish">What should change? <span class="opt">optional</span></label>
        <textarea class="textarea" id="pe_wish" rows="2" placeholder="e.g. use the word “island”, about school, a funnier sentence"></textarea></div>
      <div class="pe-wishes">${LINE_WISHES.map(([l, w]) => `<button type="button" class="chip" data-wish="${esc(w)}">${esc(l)}</button>`).join("")}</div>`,
    foot: `<button type="button" class="btn btn-ghost" data-fresh>${icon("shuffle", "i-sm")}Surprise me</button><span class="spacer"></span><button type="button" class="btn btn-secondary" data-close>Cancel</button><button type="button" class="btn btn-magic" data-go>${icon("sparkles", "i-sm")}Remake</button>`,
    onMount(root, close) {
      const box = root.querySelector("#pe_wish");
      root.querySelectorAll("[data-wish]").forEach((b) => b.addEventListener("click", () => {
        b.classList.toggle("active");
        const picked = [...root.querySelectorAll("[data-wish].active")].map((x) => x.dataset.wish);
        const typed = box.value.split(";").map((x) => x.trim()).filter((x) => x && !LINE_WISHES.some(([, w]) => w === x));
        box.value = [...typed, ...picked].join("; ");
      }));
      root.querySelector("[data-fresh]").addEventListener("click", () => { close(); remakeLine(sheet, exIndex, itemIndex, ""); });
      root.querySelector("[data-go]").addEventListener("click", () => { close(); remakeLine(sheet, exIndex, itemIndex, box.value.trim()); });
      box.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); root.querySelector("[data-go]").click(); } });
    },
  });
}

async function remakeLine(sheet, exIndex, itemIndex, wish) {
  const ex = getExercise(sheet, exIndex);
  const item = ex?.items?.[itemIndex];
  if (!ex || !item) return;
  const sel = `.ex-item[data-ex="${exIndex}"][data-item="${itemIndex}"]`;
  const node = shadow.querySelector(sel);
  node?.querySelector(".pe-bar")?.remove();
  node?.classList.add("pe-busy");
  const before = JSON.stringify(state.data);
  actions.setAiState("busy");
  try {
    const res = await remakeWorksheetItem(buildForm(), getApiKey(), state.data, { sheet, exercise: ex.number, item: item.number, wish });
    actions.setAiState("on");
    if (!res.changed) { toast(`Lingo didn’t manage it (${res.problems?.[0] || "no new line came back"}). Try other words in the box, or edit the line yourself.`, "warn", { ms: 7000 }); return; }
    state.data = res.data;
    persistSession();
    renderPreview();
    flashNode(sel);
    toast(`Line ${item.number} is new.`, "ok", { ms: 5000, actions: [{ label: "Undo", run: () => { state.data = JSON.parse(before); persistSession(); renderPreview(); flashNode(sel); } }] });
  } catch (err) {
    actions.setAiState("error", err.message);
    toast(err.message || String(err), "error");
  } finally {
    shadow.querySelector(sel)?.classList.remove("pe-busy");
  }
}

function fitZoom() {
  const stage = $("paperStage");
  const paperPx = 210 * 3.7795;
  return Math.max(0.45, Math.min(1, (stage.clientWidth - 8) / paperPx));
}
function applyZoom() {
  const z = state.preview.zoom === "fit" || !state.preview.zoom ? fitZoom() : state.preview.zoom;
  $("paper").style.setProperty("--zoom", z.toFixed(3));
  $("zoomLabel").textContent = `${Math.round(z * 100)}%`;
}
function setZoom(delta) {
  const cur = state.preview.zoom === "fit" || !state.preview.zoom ? fitZoom() : state.preview.zoom;
  state.preview.zoom = Math.round(Math.max(0.5, Math.min(1.6, cur + delta)) * 10) / 10;
  emit("preview");
  applyZoom();
}

/* ── Persistence ─────────────────────────────────────────────────── */
function ensurePlan() {
  if (!state.plan) {
    state.plan = { exerciseMode: "random", dictationTypes: [], lingoTypes: [], dictationExerciseCount: 0, lingoPracticeCount: 0, signature: "" };
  }
}

export function persistSession() {
  if (!state.data) return null;
  ensurePlan();
  const val = validateWorksheet(state.data);
  // Edits to worksheets made from an earlier word list keep that list in the library entry:
  // saving them under the current Step 2 words would pair old sheets with new words.
  const form = worksheetFreshness()?.stale ? (getSavedSession(state.sessionId)?.form || buildForm()) : buildForm();
  try {
    state.sessionId = saveWorksheetSession(form, state.data, state.plan, { updateId: state.sessionId, validation: val });
  } catch (err) {
    toast(`Couldn't save to the library: ${err.message}`, "error");
  }
  emit("library");
  return val;
}

/* ── Quality & coverage ──────────────────────────────────────────── */
function renderQuality() {
  const val = validateWorksheet(state.data);
  const report = buildValidationReport(val, state.data);
  const stale = worksheetFreshness()?.wordsChanged
    ? `<div class="callout info stale-note">${icon("info")}<span>These sheets were written for an earlier word list. <a data-goto="exercises">Generate again</a> to use your current words.</span></div>`
    : "";
  if (report.valid) {
    $("qualityPanel").innerHTML = stale + `<div class="quality-ok">${icon("check-circle")}<span>All checks passed — ready to print.</span></div>`;
  } else {
    const group = (title, items, iconName) => items.length
      ? `<div class="q-group warn"><h5>${icon(iconName, "i-xs")}${esc(title)}</h5><ul>${items.slice(0, 6).map((i) => `<li>${esc(i.friendly)}</li>`).join("")}${items.length > 6 ? `<li>…and ${items.length - 6} more</li>` : ""}</ul></div>`
      : "";
    const btns = [];
    if (report.quickCount) btns.push(`<button type="button" class="btn btn-secondary btn-sm btn-block" data-fix="quick">${icon("zap", "i-sm")}Apply ${plural(report.quickCount, "quick fix", "quick fixes")}</button>`);
    if (report.itemCount) btns.push(`<button type="button" class="btn btn-soft btn-sm btn-block" data-fix="items">${icon("sparkles", "i-sm")}Rewrite ${plural(report.itemCount, "line")} with AI</button>`);
    if (report.coverageCount) btns.push(`<button type="button" class="btn btn-soft btn-sm btn-block" data-fix="coverage">${icon("target", "i-sm")}Add missing words with AI</button>`);
    const total = report.quickCount + report.itemCount + report.coverageCount;
    if (total > 1 && btns.length > 1) btns.unshift(`<button type="button" class="btn btn-primary btn-sm btn-block" data-fix="all">${icon("wand", "i-sm")}Fix everything (${total})</button>`);
    $("qualityPanel").innerHTML = `${stale}
      <p class="q-summary">${esc(report.intro)}</p>
      <div class="quality-list">
        ${group("Quick fixes", report.categories.quick, "zap")}
        ${group("Lines to rewrite", report.categories.items, "pencil")}
        ${report.coverageCount ? `<div class="q-group warn"><h5>${icon("target", "i-xs")}Not in the Dictation yet</h5><div class="cov-chips">${report.coverageWords.map((w) => `<span class="cov-chip cov-bad">${esc(w)}</span>`).join("")}</div></div>` : ""}
        ${group("May need a full rewrite", report.categories.manual, "alert")}
      </div>
      ${btns.length ? `<div class="q-actions">${btns.join("")}</div>` : `<p class="insp-note">Click a line on the sheet to edit it, or regenerate in Step 3.</p>`}`;
  }
  const lingoTested = val.coverage?.lingo?.testedCount ?? 0;
  const lingoTotal = val.coverage?.lingo?.totalHeadwords ?? state.data.lingoLauncher.vocabulary.length;
  $("coveragePanel").innerHTML = `
    <div class="cov-chips">${renderCoverageHeatmap(val.coverage, state.data.lingoLauncher.vocabulary)}</div>
    <div class="cov-legend"><span><i style="background:var(--success)"></i>In Dictation</span><span><i style="background:var(--warning)"></i>Lingo only</span><span><i style="background:var(--danger)"></i>Not tested</span></div>
    <p class="insp-note">Lingo practice tests ${lingoTested} of ${lingoTotal} words — partial coverage there is fine.</p>`;
}

async function runFix(kind, btn) {
  if (!state.data) return;
  const form = buildForm();
  const val = validateWorksheet(state.data);
  if (kind === "quick") {
    state.data = applyQuickWorksheetFixes(state.data);
    const after = persistSession();
    toast(countQuickFixIssues(after?.issues || []) === 0 ? "Quick fixes applied." : "Quick fixes applied — a few notes remain.", "ok");
    renderPreview();
    return;
  }
  const apiKey = getApiKey();
  if (!isAiReady()) { actions.openSettings(); return; }
  await withBusy(btn, async () => {
    actions.setAiState("busy");
    try {
      const fn = kind === "items" ? fixWorksheetValidationIssues : kind === "coverage" ? fixDictationCoverageGaps : fixAllWorksheetIssues;
      const result = await fn(form, apiKey, state.data, val);
      state.data = result.data;
      persistSession();
      actions.setAiState("on");
      toast(result.message || "Fixed.", result.validation?.valid ? "ok" : "warn");
    } catch (err) {
      actions.setAiState("error", err.message);
      toast(err.message || String(err), "error", { actions: chatgptUsageLimited(err) ? [{ label: "Manage usage", run: () => manageChatGPTUsage().catch(() => actions.openSettings()) }] : [] });
    }
  });
  renderPreview();
}

/* ── Editors ─────────────────────────────────────────────────────── */
const asText = (v) => (Array.isArray(v)
  ? v.map((x) => (typeof x === "string" ? x : [x.text, x.type ? `(${x.type})` : "", x.greek ? `- ${x.greek}` : ""].filter(Boolean).join(" "))).join(", ")
  : String(v ?? ""));

function openVocabEditor(index) {
  const vocab = [...state.data.lingoLauncher.vocabulary].sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
  const entry = vocab[index];
  if (!entry) return;
  const fields = [
    ["english", "English word", "wide"], ["type", "Part of speech", ""], ["emojis", "Emojis", ""],
    ["greek", "Greek meaning", "wide"], ["collocation", "Collocation / phrase", "wide"],
    ["derivatives", "Derivatives", "wide"], ["synonyms", "Synonyms", ""], ["antonyms", "Opposites", ""],
  ];
  openDialog({
    title: `Edit word ${index + 1}`,
    subtitle: "Updates the worksheet table and your Step 2 word list.",
    iconName: "pencil",
    sheet: true,
    body: `<div class="editor-grid">${fields.map(([k, label, cls]) => `
      <div class="field ${cls}"><label class="label" for="ve_${k}">${label}</label>
      <input class="input" id="ve_${k}" value="${esc(asText(entry[k]))}" ${k === "greek" ? 'lang="el"' : ""} autocomplete="off" /></div>`).join("")}</div>`,
    foot: `<span class="hint"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> to save</span><span class="spacer"></span>
      <button type="button" class="btn btn-secondary" data-close>Cancel</button>
      <button type="button" class="btn btn-primary" data-save>Save word</button>`,
    onMount(root, close) {
      const save = () => {
        const english = root.querySelector("#ve_english").value.trim();
        if (!english) { root.querySelector("#ve_english").classList.add("is-invalid"); return; }
        const oldEnglish = String(entry.english || "").trim().toLowerCase();
        fields.forEach(([k]) => { entry[k] = root.querySelector(`#ve_${k}`).value.trim(); });
        // Keep Step 2 in sync — match by headword, never by position.
        const w = state.words.find((x) => x.english.trim().toLowerCase() === oldEnglish);
        if (w) fields.forEach(([k]) => { w[k] = entry[k]; });
        else state.words.push(makeWord(entry));
        state.data = normalizeWorksheetExercises(state.data);
        persistSession();
        close();
        emit("words");
        renderPreview();
        flashNode(`td[data-vocab-num="${index + 1}"]`);
        toast(`Updated “${english}”.`, "ok", { ms: 2400 });
      };
      root.querySelector("[data-save]").addEventListener("click", save);
      root.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); save(); } });
    },
  });
}

function getExercise(sheet, exIndex) {
  const list = sheet === "lingo" ? state.data.lingoLauncher.practice : state.data.dictation.exercises;
  return list?.[exIndex] || null;
}

function openItemEditor(sheet, exIndex, itemIndex) {
  const ex = getExercise(sheet, exIndex);
  const item = ex?.items?.[itemIndex];
  if (!ex || !item) return;
  const showAnswer = ex.typeId !== "D13";
  const showStem = ex.typeId === "D02";
  const showTests = sheet === "dictation" && Array.isArray(item.testsWords);
  const showBank = Array.isArray(ex.wordBank) && ex.wordBank.length > 0;
  const showList = Array.isArray(ex.wordList) && ex.wordList.length > 0;
  const typeLabel = `${ex.typeId} · ${EXERCISE_LABELS[ex.typeId] || ex.typeId}`;

  openDialog({
    title: `${SHEET_NAME[sheet]} · Exercise ${ex.number}, line ${item.number}`,
    subtitle: ex.typeId === "D13" ? `${typeLabel} — matching letters come from the definition list` : typeLabel,
    iconName: "pencil",
    sheet: true,
    body: `
      <div class="field"><label class="label" for="ie_prompt">Line shown to students</label>
        <textarea class="textarea" id="ie_prompt" rows="3">${esc(item.prompt || "")}</textarea></div>
      <div class="editor-grid">
        ${showAnswer ? `<div class="field ${showStem ? "" : "wide"}"><label class="label" for="ie_answer">Answer</label><input class="input" id="ie_answer" value="${esc(item.answer || "")}" autocomplete="off" /></div>` : ""}
        ${showStem ? `<div class="field"><label class="label" for="ie_stem">Stem clue (bold)</label><input class="input" id="ie_stem" value="${esc(item.stem || "")}" autocomplete="off" /></div>` : ""}
        ${showTests ? `<div class="field wide"><label class="label" for="ie_tests">Tests these unit words <span class="opt">comma-separated</span></label><input class="input" id="ie_tests" value="${esc((item.testsWords || []).join(", "))}" autocomplete="off" /></div>` : ""}
        ${showBank ? `<div class="field wide"><label class="label" for="ie_bank">Word bank <span class="opt">one per line · whole exercise</span></label><textarea class="textarea" id="ie_bank" rows="4">${esc(ex.wordBank.join("\n"))}</textarea></div>` : ""}
        ${showList ? `<div class="field wide"><label class="label" for="ie_list">Word list <span class="opt">one per line · whole exercise</span></label><textarea class="textarea" id="ie_list" rows="4">${esc(ex.wordList.join("\n"))}</textarea></div>` : ""}
      </div>
      <div class="validation-line ok" id="ie_val">${icon("check-circle")}<span>Checking…</span></div>`,
    foot: `
      <button type="button" class="btn btn-danger-ghost btn-sm" data-del>${icon("trash", "i-sm")}Delete line</button>
      <button type="button" class="btn btn-ghost btn-sm" data-add>${icon("plus", "i-sm")}Add line below</button>
      <span class="spacer"></span>
      <button type="button" class="btn btn-secondary" data-close>Cancel</button>
      <button type="button" class="btn btn-primary" data-save>Save</button>`,
    onMount(root, close) {
      const q = (id) => root.querySelector(id);
      const applyTo = (data) => {
        const cEx = sheet === "lingo" ? data.lingoLauncher.practice[exIndex] : data.dictation.exercises[exIndex];
        const cItem = cEx?.items?.[itemIndex];
        if (!cEx || !cItem) return data;
        cItem.prompt = q("#ie_prompt").value.trim();
        if (showAnswer) cItem.answer = q("#ie_answer").value.trim();
        if (showStem) cItem.stem = q("#ie_stem").value.trim();
        if (showTests) cItem.testsWords = q("#ie_tests").value.split(",").map((s) => s.trim()).filter(Boolean);
        if (showBank) cEx.wordBank = q("#ie_bank").value.split("\n").map((s) => s.trim()).filter(Boolean);
        if (showList) cEx.wordList = q("#ie_list").value.split("\n").map((s) => s.trim()).filter(Boolean);
        return data;
      };
      let t;
      const validate = () => {
        clearTimeout(t);
        t = setTimeout(() => {
          const out = q("#ie_val");
          try {
            const clone = applyTo(normalizeWorksheetExercises(JSON.parse(JSON.stringify(state.data))));
            const issues = validateWorksheet(clone).issues || [];
            const ex2 = getExercise(sheet, exIndex);
            const re = new RegExp(`^${sheet === "lingo" ? "Lingo" : "Dictation"} ex ${ex2.number}\\b(?: \\([^)]*\\))? item ${item.number}:`, "i");
            const mine = issues.filter((i) => re.test(i)).map((i) => i.replace(/^.*?item \d+:\s*/i, ""));
            out.className = `validation-line ${mine.length ? "warn" : "ok"}`;
            out.innerHTML = `${icon(mine.length ? "alert" : "check-circle")}<span>${mine.length ? esc(mine.join(" · ")) : "This line looks good."}</span>`;
          } catch {
            out.className = "validation-line warn";
            out.innerHTML = `${icon("alert")}<span>Couldn't check this edit.</span>`;
          }
        }, 220);
      };
      root.querySelector(".dialog-body").addEventListener("input", validate);
      validate();

      const commit = (msg) => {
        state.data = normalizeWorksheetExercises(state.data);
        const val = persistSession();
        renderPreview();
        if (msg) toast(msg, val?.issues?.length ? "warn" : "ok", { ms: 2600 });
      };
      const save = () => {
        applyTo(state.data);
        close();
        commit("Line saved.");
        flashNode(`.ex-item[data-ex="${exIndex}"][data-item="${itemIndex}"]`);
      };
      q("[data-save]").addEventListener("click", save);
      root.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); save(); } });
      q("[data-add]").addEventListener("click", () => {
        applyTo(state.data);
        const exNow = getExercise(sheet, exIndex);
        const prev = exNow.items[itemIndex];
        exNow.items.splice(itemIndex + 1, 0, {
          number: itemIndex + 2,
          prompt: "",
          answer: "",
          ...(ex.typeId === "D02" ? { stem: "" } : {}),
          ...(sheet === "dictation" ? { testsWords: prev?.testsWords ? [...prev.testsWords] : [] } : {}),
        });
        exNow.items.forEach((it, i) => { it.number = i + 1; });
        close();
        commit("");
        openItemEditor(sheet, exIndex, itemIndex + 1);
      });
      q("[data-del]").addEventListener("click", () => {
        const exNow = getExercise(sheet, exIndex);
        if (exNow.items.length <= 1) { toast("An exercise needs at least one line.", "warn"); return; }
        const removed = exNow.items.splice(itemIndex, 1)[0];
        exNow.items.forEach((it, i) => { it.number = i + 1; });
        close();
        commit("");
        toast("Line deleted.", "info", {
          actions: [{ label: "Undo", run: () => {
            const e2 = getExercise(sheet, exIndex);
            e2.items.splice(itemIndex, 0, removed);
            e2.items.forEach((it, i) => { it.number = i + 1; });
            commit("Line restored.");
          } }],
        });
      });
    },
  });
}

function flashNode(selector) {
  requestAnimationFrame(() => {
    const n = shadow.querySelector(selector);
    if (!n) return;
    n.classList.add("flash");
    n.scrollIntoView({ block: "center", behavior: "smooth" });
    setTimeout(() => n.classList.remove("flash"), 1300);
  });
}

/* ── Exports ─────────────────────────────────────────────────────── */
const safeName = (s) => String(s).replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();

function savedToast(filePath, label) {
  const d = desktop();
  const name = label || String(filePath).split(/[\\/]/).pop();
  toast(`Saved ${name}`, "ok", {
    ms: 6500,
    actions: d?.openPath ? [
      { label: "Open", run: () => d.openPath(filePath) },
      { label: "Show in folder", run: () => d.showItemInFolder(filePath) },
    ] : [],
  });
}

/** Standalone A4 document for PDF export, with the worksheet fonts embedded. */
async function pdfHtml(sheet) {
  const opts = { showAnswers: false, density: state.preview.density, layout: layoutPayload() };
  const body = sheet === "lingo" ? renderLingoLauncher(state.data, opts)
    : sheet === "dictation" ? renderDictation(state.data, opts) : renderAnswerKey(state.data, opts);
  return inlinePictures(buildWorksheetPrintDocument(body, SHEET_NAME[sheet], await worksheetFontCss()));
}

/** Footer text for PDF pages (page numbers are added by the PDF renderer), or "" when switched off. */
function pdfFooter(sheet) {
  if (!sheetLayout(sheet).footer) return "";
  const m = state.data.meta || {};
  return [SHEET_NAME[sheet], m.bookTitle, m.unit ? `Unit ${m.unit}` : ""].filter(Boolean).join(" · ");
}

/** The worksheet plus PNG copies of its pictures, for Word files (never saved into the library). */
async function wordData() {
  const style = prefs.pictureStyle || "emoji";
  const d = state.data;
  // Word-bank illustrations (picture exercise, "Word-bank pictures" table) travel as PNG copies.
  const picPng = style === "none" ? {} : await picPngMap(d);
  if (style === "emoji" || style === "none" || style === "pictures") return { ...d, meta: { ...d.meta, picPng } };
  const texts = [
    ...(d.lingoLauncher?.vocabulary || []).map((v) => v.emojis),
    ...[...(d.lingoLauncher?.practice || []), ...(d.dictation?.exercises || [])].flatMap((ex) => (ex.items || []).map((it) => it.prompt)),
  ];
  const emojis = texts.flatMap((t) => splitEmojiText(t || "").filter((p) => p.emoji).map((p) => p.text));
  return { ...d, meta: { ...d.meta, picPng, pictures: await rasterisePictures(emojis, style) } };
}

async function exportWord(sheet, btn) {
  if (!state.data) return;
  syncMeta();
  const filename = safeName(`${SHEET_NAME[sheet]}, ${fileBaseName(state.data.meta)}.docx`);
  await withBusy(btn, async () => {
    try {
      const d = desktop();
      if (d?.saveDocx) {
        const res = await d.saveDocx({ type: sheet, data: await wordData(), filename });
        if (res.ok) savedToast(res.path);
        else if (!res.canceled) toast(`Word export failed: ${res.error || "unknown error"}`, "error");
      } else {
        await exportDocx(sheet, await wordData(), filename);
        toast(`Downloaded ${filename}`, "ok");
      }
    } catch (e) {
      toast(`Word export failed: ${e.message || e}`, "error");
    }
  });
}

async function exportPdf(sheet, btn) {
  if (!state.data) return;
  const d = desktop();
  if (!d?.exportPdf) { printSheet(sheet); toast("Choose “Save as PDF” in the print dialog.", "info"); return; }
  await withBusy(btn, async () => {
    try {
      const res = await d.exportPdf({ html: await pdfHtml(sheet), footer: pdfFooter(sheet), filename: safeName(`${SHEET_NAME[sheet]}, ${fileBaseName(state.data.meta)}.pdf`) });
      if (res.ok) savedToast(res.path);
      else if (!res.canceled) toast(res.error || "PDF export failed.", "error");
    } catch (e) {
      toast(`PDF export failed: ${e.message || e}`, "error");
    }
  });
}

export async function printSheet(sheet = state.preview.sheet) {
  if (!state.data) { toast("Generate or open a unit first.", "warn"); return; }
  try {
    play("print");
    openWorksheetPrint(state.data, sheet, { density: state.preview.density, layout: layoutPayload(), fontCss: await worksheetFontCss() });
  } catch (e) {
    toast(e.message || String(e), "error");
  }
}

async function exportPack(btn) {
  if (!state.data) return;
  syncMeta();
  await withBusy(btn, async () => {
    try {
      const base = safeName(fileBaseName(state.data.meta));
      const d = desktop();
      if (d?.exportPack) {
        const res = await d.exportPack({
          data: await wordData(),
          baseSlug: base,
          htmlPages: { lingo: await pdfHtml("lingo"), dictation: await pdfHtml("dictation"), answer: await pdfHtml("answer") },
          footers: { lingo: pdfFooter("lingo"), dictation: pdfFooter("dictation"), answer: pdfFooter("answer") },
        });
        if (res.ok) savedToast(res.folder, `unit pack (${plural(res.files.length, "file")})`);
        else if (!res.canceled) toast(`Pack export failed: ${res.error || "unknown error"}`, "error");
      } else {
        const data = await wordData();
        for (const sheet of ["lingo", "dictation", "answer"]) {
          await exportDocx(sheet, data, safeName(`${SHEET_NAME[sheet]}, ${base}.docx`));
        }
        toast("Downloaded Lingo Launcher, Dictation and Answer Key.", "ok");
      }
    } catch (e) {
      toast(`Pack export failed: ${e.message || e}`, "error");
    }
  });
}

function duplicateUnit() {
  if (!state.data) return;
  ensurePlan();
  const data = normalizeWorksheetExercises(JSON.parse(JSON.stringify(state.data)));
  const val = validateWorksheet(data);
  try {
    state.sessionId = saveWorksheetSession(buildForm(), data, JSON.parse(JSON.stringify(state.plan)), { validation: val });
    state.data = data;
    emit("library", "data");
    toast("Duplicated. Pick another class level, adjust words, then generate again.", "ok", { ms: 5200 });
    actions.go("setup");
  } catch (e) {
    toast(`Couldn't duplicate: ${e.message}`, "error");
  }
}
