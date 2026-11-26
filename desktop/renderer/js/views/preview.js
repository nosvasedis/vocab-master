/* Step 4 — A4 preview with click-to-edit, word coverage, layout options and exports. */
import {
  EXERCISE_LABELS, WORKSHEET_PRINT_CSS, renderLingoLauncher, renderDictation, renderAnswerKey,
  renderCoverageHeatmap, validateWorksheet, normalizeWorksheetExercises,
  saveWorksheetSession, getStudentExerciseInstruction, WORKSHEET_LAYOUT_DEFAULTS, buildWorksheetPrintDocument, splitEmojiText, exportDocx, openWorksheetPrint, getSavedSession, remakeWorksheetItem,
} from "../../app.js";
import { $, esc, icon, plural, toast, openDialog, segmented, withBusy } from "../ui.js";
import { wireGapTool } from "../gap-tool.js";
import { state, emit, on, buildForm, makeWord, prefs, worksheetFreshness } from "../state.js";
import { worksheetFontCss } from "../fonts.js";
import { PICTURE_STYLES, ensurePictureStyle, rasterisePictures } from "../pictures.js";
import { savePrefs } from "../state.js";
import { desktop, getApiKey, isAiReady } from "../bridge.js";
import { actions } from "../actions.js";
import { openHeaderDialog, paperWords } from "../header-dialog.js";
import { play } from "../../arcade/audio.js";
import { picPngMap, inlinePictures } from "../../studio/pic-assets.js";
import { productFileName, safeFileName } from "../../studio/file-names.js";
import { wsItemView, WS_HELP, helpMode, helpModes, familyBase, splitClue, joinAB, joinSteps } from "../../studio/ws-paper.js";
import { letterHelpField } from "./letter-help-ui.js";
import { listField, wireLists, listValues } from "../list-field.js";
import { exerciseWords, wordCoverage } from "../../studio/quality-check.js";
import { openWordFinder, closeWordFinder } from "../word-finder.js";
import { wsSheetsOf } from "../../studio/worksheet-tasks.js";

let sheetSeg;
let densitySeg;
let textSizeSeg;
let shadow;

const SHEET_NAME = { lingo: "Lingo Launcher", dictation: "Dictation", answer: "Answer Key" };

/** The papers this unit has: its sheets (a unit may be only a Lingo Launcher or only a Dictation) and the answer key. */
const papers = () => [...wsSheetsOf(state.data), "answer"];

/** Only the unit's own sheets in the switch; a sheet it doesn't have is never shown (the first one it has is). */
function syncSheetSwitch() {
  const have = state.data ? papers() : Object.keys(SHEET_NAME);
  $("sheetSeg").querySelectorAll("button[data-value]").forEach((b) => { b.hidden = !have.includes(b.dataset.value); });
  if (state.data && !have.includes(state.preview.sheet)) {
    state.preview.sheet = have[0];
    emit("preview");
  }
}

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
.ex-head.editable-head { cursor: pointer; border-radius: 8px; margin-left: -6px; margin-right: -6px; padding: 2px 6px; transition: background 140ms, box-shadow 140ms; }
.ex-head.editable-head:hover, .ex-head.editable-head:focus-visible { outline: none; background: #f1efff; box-shadow: 0 0 0 1.5px #b7aefc; }
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
  textSizeSeg = segmented($("textSizeSeg"), {
    value: state.preview.textSize || "standard",
    onChange: (v) => { state.preview.textSize = v; emit("preview"); renderPaper(); },
  });
  $("optAnswers").addEventListener("change", (e) => { state.preview.showAnswers = e.target.checked; emit("preview"); renderPaper(); });
  // Word coverage: a word on the sheets is found there; a word on neither sheet (or the button) opens "Put words on the sheets".
  $("coveragePanel").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cov-find]");
    if (b) { findWord(b.dataset.covFind); return; }
    const p = e.target.closest("[data-cov-place]");
    if (p) {
      // Words go on the Dictation, or on the Lingo practice in a unit that has only the Lingo Launcher.
      const sheet = p.dataset.covSheet || (wsSheetsOf(state.data).includes("dictation") ? "dictation" : "lingo");
      placeWordsDialog(p.dataset.covPlace ? [p.dataset.covPlace] : missingFrom(sheet), sheet);
      return;
    }
  });
  // The header switches apply to all three sheets (screen, print, PDF and Word).
  $("btnHeader").addEventListener("click", () => openHeaderDialog({
    header: state.preview.header, schoolName: prefs.schoolName || "", subtitle: "Every sheet of this unit",
    words: paperWords(state.data?.meta || {}, {
      schoolName: prefs.schoolName || "",
      titles: [["Lingo title", "Lingo Launcher"], ["Dictation title", "Dictation"], ["Key title", "Answer Key"]],
      kinds: [["Lingo subtitle", "Vocabulary study sheet"], ["Dictation subtitle", "Vocabulary test"], ["Key subtitle", "Teacher’s copy"]],
    }),
    onChange: (header) => { state.preview.header = header; emit("preview"); renderPaper(); },
  }));
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
  if (!desktop()) $("packNote").textContent = "Downloads every sheet of this unit as Word documents.";

  on("data", () => { if (state.view === "preview") renderPreview(); });
}

export function renderPreview() {
  syncSheetSwitch();
  sheetSeg.set(state.preview.sheet);
  densitySeg.set(state.preview.density);
  textSizeSeg.set(state.preview.textSize || "standard");
  $("optAnswers").checked = state.preview.showAnswers;
  renderLayoutControls();
  const has = !!state.data;
  ["btnExportPack", "btnDocx", "btnPdf", "btnPrint", "btnDuplicate"].forEach((id) => { $(id).disabled = !has; });
  if (has) {
    const names = papers().map((sh) => SHEET_NAME[sh]).join(", ").replace(/, (?=[^,]*$)/, " & ");
    $("packNote").textContent = desktop() ? `${names} as Word + PDF.` : `Downloads ${names} as Word documents.`;
  }
  if (!has) {
    shadow.innerHTML = "";
    $("paper").classList.add("hidden");
    $("coveragePanel").innerHTML = "";
    return;
  }
  $("paper").classList.remove("hidden");
  renderPaper();
  renderCoverage();
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
  return { lingo: sheetLayout("lingo"), dictation: sheetLayout("dictation"), answer: sheetLayout("answer"), schoolName: prefs.schoolName || "", pictureStyle: prefs.pictureStyle || "emoji", header: state.preview.header || {} };
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
  return { showAnswers: state.preview.showAnswers, density: state.preview.density, textSize: state.preview.textSize, layout: layoutPayload() };
}

function syncMeta() {
  if (!state.data?.meta) return;
  state.data.meta.layout = layoutPayload();
  state.data.meta.includeStudentHeader = !!sheetLayout("lingo").studentHeader;
  state.data.meta.density = state.preview.density;
  state.data.meta.textSize = state.preview.textSize || "standard";
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
    // The heading opens the exercise's own settings (task line, letter help, mixing).
    const head = block.querySelector(".ex-head");
    if (head) {
      head.classList.add("editable-head");
      head.tabIndex = 0;
      head.setAttribute("role", "button");
      head.title = "Click for this exercise's settings: instructions, letter help, mix the options";
      head.dataset.ex = String(exIndex);
    }
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
  const head = path.find((n) => n.classList?.contains("editable-head"));
  if (head) { e.preventDefault(); openExerciseSettings(state.preview.sheet, Number(head.dataset.ex)); return; }
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
  const item = getExercise(sheet, exIndex)?.items?.[itemIndex];
  if (item) deleteLines(sheet, exIndex, [itemIndex], `Line ${item.number} deleted`);
}

/** Take lines out of an exercise (0-based indexes), with their answers out of its word box / list; one Undo. */
function deleteLines(sheet, exIndex, itemIndexes, said) {
  const ex = getExercise(sheet, exIndex);
  if (!ex) return false;
  const drop = [...new Set(itemIndexes)].filter((k) => ex.items[k]).sort((a, b) => b - a);
  if (!drop.length) return false;
  if (ex.items.length - drop.length < 1) { toast("An exercise needs at least one line — edit or remake this one instead.", "warn", { ms: 4500 }); return false; }
  const before = JSON.stringify(state.data);
  const lc = (x) => String(typeof x === "string" ? x : x?.english || x?.text || x?.word || "").trim().toLowerCase();
  for (const k of drop) {
    const [gone] = ex.items.splice(k, 1);
    // Its answer leaves the word box / word list too, unless another line still needs it (lettered answers stay).
    const answer = lc(gone?.answer);
    if (answer.length > 1 && !ex.items.some((it) => lc(it.answer) === answer)) {
      for (const key of ["wordBank", "wordList"]) {
        const at = Array.isArray(ex[key]) ? ex[key].findIndex((w) => lc(w) === answer) : -1;
        if (at >= 0) ex[key].splice(at, 1);
      }
    }
  }
  ex.items.forEach((it, i) => { it.number = i + 1; });
  state.data = normalizeWorksheetExercises(state.data);
  persistSession();
  renderPreview();
  toast(`${said} — ${plural(ex.items.length, "line")} left in exercise ${ex.number}.`, "ok", { ms: 6000, actions: [{ label: "Undo", run: () => { state.data = JSON.parse(before); persistSession(); renderPreview(); } }] });
  return true;
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
  // Edits to worksheets made from an earlier word list keep that list in the library entry:
  // saving them under the current Step 2 words would pair old sheets with new words.
  const form = worksheetFreshness()?.stale ? (getSavedSession(state.sessionId)?.form || buildForm()) : buildForm();
  try {
    state.sessionId = saveWorksheetSession(form, state.data, state.plan, { updateId: state.sessionId });
  } catch (err) {
    toast(`Couldn't save to the library: ${err.message}`, "error");
  }
  emit("library");
}

/* ── Word coverage ──────────────────────────────────────────────── */
function renderCoverage() {
  const val = validateWorksheet(state.data);
  const stale = worksheetFreshness()?.wordsChanged
    ? `<div class="callout info stale-note">${icon("info")}<span>These sheets were written for an earlier word list. <a data-goto="exercises">Generate again</a> to use your current words.</span></div>`
    : "";
  const lingoTested = val.coverage?.lingo?.testedCount ?? 0;
  const words = val.coverage?.dictation?.words || [];
  const sheets = wsSheetsOf(state.data);
  // A unit with only the Lingo Launcher: coverage is about its practice (there is no Dictation to put words on).
  if (!sheets.includes("dictation")) {
    const inLingo = words.filter((w) => w.lingo.length).length;
    $("coveragePanel").innerHTML = `${stale}
    <div class="cov-chips">${renderCoverageHeatmap(val.coverage, state.data.lingoLauncher.vocabulary)}</div>
    <div class="cov-legend"><span><i style="background:var(--warning)"></i>In Lingo practice</span><span><i style="background:var(--danger)"></i>Not practised</span></div>
    <p class="insp-note">This unit has only the Lingo Launcher. Its practice uses ${inLingo} of ${words.length} words (every word is in the word table). Click a word to find it on the sheet, or one that isn't practised to put it in an exercise.</p>
    ${inLingo < words.length ? `<button type="button" class="btn btn-soft btn-sm btn-block" data-cov-place="" data-cov-sheet="lingo">${icon("target", "i-sm")}Put the ${plural(words.length - inLingo, "missing word")} in the Lingo practice…</button>` : ""}`;
    return;
  }
  const inDict = words.filter((w) => w.dictation.length).length;
  const nowhere = words.filter((w) => !w.dictation.length && !w.lingo.length).length;
  if (!sheets.includes("lingo")) {
    $("coveragePanel").innerHTML = `${stale}
    <div class="cov-chips">${renderCoverageHeatmap(val.coverage, state.data.lingoLauncher.vocabulary)}</div>
    <div class="cov-legend"><span><i style="background:var(--success)"></i>In Dictation</span><span><i style="background:var(--danger)"></i>Not tested</span></div>
    <p class="insp-note">This unit has only the Dictation. It tests ${inDict} of ${words.length} words. Click a word to find it on the sheet, or one that isn't tested to choose where it goes.</p>
    ${inDict < words.length ? `<button type="button" class="btn btn-soft btn-sm btn-block" data-cov-place="">${icon("target", "i-sm")}Put the ${plural(words.length - inDict, "missing word")} on the Dictation…</button>` : ""}`;
    return;
  }
  $("coveragePanel").innerHTML = `${stale}
    <div class="cov-chips">${renderCoverageHeatmap(val.coverage, state.data.lingoLauncher.vocabulary)}</div>
    <div class="cov-legend"><span><i style="background:var(--success)"></i>In Dictation</span><span><i style="background:var(--warning)"></i>Lingo only</span><span><i style="background:var(--danger)"></i>Not tested</span></div>
    <p class="insp-note">Dictation tests ${inDict} of ${words.length} words; Lingo practises ${lingoTested}${nowhere ? ` · ${plural(nowhere, "word")} on neither sheet` : ""}. Click a word to find it on the sheets (‹ › moves between its lines), or one that isn't tested to choose where it goes.</p>
    ${inDict < words.length ? `<button type="button" class="btn btn-soft btn-sm btn-block" data-cov-place="">${icon("target", "i-sm")}Put the ${plural(words.length - inDict, "missing word")} on the Dictation…</button>` : ""}`;
}

/** Show a sheet (Lingo Launcher, Dictation, Answer key) on the paper. */
function showSheet(sheet) {
  if (state.preview.sheet === sheet) return;
  state.preview.sheet = sheet;
  sheetSeg.set(sheet);
  emit("preview");
  renderLayoutControls();
  renderPaper();
}

/**
 * Find a unit word on the sheets: every line that tests it, outlined with the word highlighted, and a bar to step
 * through them (switching between the Dictation and Lingo Launcher as needed). A click on a line still edits it.
 */
function findWord(english) {
  const cov = wordCoverage(state.data).words.find((w) => w.head === english);
  if (!cov) return;
  const lists = { dictation: state.data?.dictation?.exercises || [], lingo: state.data?.lingoLauncher?.practice || [] };
  const where = (sheet, at) => {
    const exIdx = lists[sheet].findIndex((ex) => ex.number === at.exercise);
    const itemIdx = exIdx < 0 ? -1 : (lists[sheet][exIdx].items || []).findIndex((it) => it.number === at.item);
    return { exIdx, itemIdx };
  };
  const lineEl = (sheet, at) => { const { exIdx, itemIdx } = where(sheet, at); return itemIdx < 0 ? null : shadow.querySelector(`.ex-item[data-ex="${exIdx}"][data-item="${itemIdx}"]`); };
  const spots = ["dictation", "lingo"].flatMap((sheet) => (cov[sheet] || []).map((at) => ({
    label: `${SHEET_NAME[sheet]} · exercise ${at.exercise}, line ${at.item}${at.via && at.via !== cov.head ? ` (as “${at.via}”)` : ""}`,
    el: () => { showSheet(sheet); return lineEl(sheet, at); },
    peek: () => (state.preview.sheet === sheet ? lineEl(sheet, at) : null),
  })));
  const have = wsSheetsOf(state.data);
  const other = !cov.dictation.length && have.includes("dictation") ? "dictation" : !cov.lingo.length && have.includes("lingo") ? "lingo" : null;
  openWordFinder({
    root: shadow, word: english, spots,
    extra: { label: other ? `Put it on the ${SHEET_NAME[other]} too` : "Put it in another exercise too", run: () => placeWordsDialog([english], other || (state.preview.sheet === "lingo" ? "lingo" : "dictation")) },
  });
}

/** Unit words the sheet doesn't test yet (words on neither sheet first). */
function missingFrom(sheet) {
  const other = sheet === "dictation" ? "lingo" : "dictation";
  return wordCoverage(state.data).words.filter((w) => !w[sheet].length).sort((a, b) => Number(!!a[other].length) - Number(!!b[other].length)).map((w) => w.head);
}

/**
 * "Put words on the sheets": the teacher picks the words, the sheet, the exercise, and how — new lines at the end of
 * the exercise, or (one word) instead of a line they choose. Each line says which unit words it tests, so a line that
 * is the only test of a word on this sheet is never replaced by surprise. Lingo writes the lines (Undo after).
 */
function placeWordsDialog(chosen = [], startSheet = "dictation") {
  if (!state.data) return;
  const cov = wordCoverage(state.data).words;
  const lists = { dictation: state.data.dictation?.exercises || [], lingo: state.data.lingoLauncher?.practice || [] };
  let sheet = lists[startSheet]?.length ? startSheet : startSheet === "dictation" ? "lingo" : "dictation";
  const picked = new Set(chosen.filter((w) => cov.some((c) => c.head === w)));
  let exIndex = -1;
  let how = "add";
  let line = -1;

  const statusOn = (w, sh) => (w[sh].length ? "here" : w[sh === "dictation" ? "lingo" : "dictation"].length ? "other" : "missing");
  const single = !(lists.dictation.length && lists.lingo.length);
  const TONE = { missing: "cov-bad", other: "cov-warn", here: "cov-good" };
  const TIP = { missing: "Not tested on either sheet", other: "Only on the other sheet", here: "Already tested on this sheet" };
  /** Which unit words each line of an exercise tests, and whether it is the only line on this sheet that tests one. */
  const lineInfo = (ex) => (ex.items || []).map((it) => {
    const words = cov.filter((w) => w[sheet].some((a) => a.exercise === ex.number && a.item === it.number));
    const only = words.filter((w) => w[sheet].length === 1).map((w) => w.head);
    return { n: it.number, prompt: String(it.prompt || "").replace(/\s+/g, " ").trim(), words: words.map((w) => w.head), only };
  });
  // The first exercise with room for a new line (else the first one).
  const pickExercise = () => {
    const ex = lists[sheet];
    if (!ex.length) return -1;
    return Math.max(0, ex.findIndex((e) => e.items.length < MAX_LINES));
  };
  const pickLine = (ex) => {
    const info = lineInfo(ex);
    const safe = info.findIndex((l) => !l.only.length);
    return safe >= 0 ? safe : 0;
  };

  openDialog({
    title: "Put words on the sheets", subtitle: "Choose the words, the exercise, and where they go — Lingo writes the lines.", iconName: "target", tone: "brand",
    body: `<div data-pw></div>`,
    foot: `<span class="pw-sum" data-pw-sum></span><span class="spacer"></span><button type="button" class="btn btn-secondary" data-close>Cancel</button><button type="button" class="btn btn-magic" data-pw-go>${icon("sparkles", "i-sm")}<span>Add</span></button>`,
    onMount(root, close) {
      const body = root.querySelector("[data-pw]");
      const go = root.querySelector("[data-pw-go]");
      const sum = root.querySelector("[data-pw-sum]");
      exIndex = pickExercise();
      const draw = () => {
        const exs = lists[sheet];
        const ex = exs[exIndex];
        const words = [...cov].sort((a, b) => ["missing", "other", "here"].indexOf(statusOn(a, sheet)) - ["missing", "other", "here"].indexOf(statusOn(b, sheet)));
        const room = ex ? MAX_LINES - ex.items.length : 0;
        const info = ex ? lineInfo(ex) : [];
        if (how === "replace" && picked.size !== 1) how = "add";
        body.innerHTML = `
          <div class="field"><span class="label">Sheet</span><div class="pe-wishes">${["dictation", "lingo"].filter((sh) => lists[sh].length).map((sh) => `<button type="button" class="chip${sh === sheet ? " active" : ""}" data-pw-sheet="${sh}">${esc(SHEET_NAME[sh])} <small>· ${plural(missingFrom(sh).length, "word")} missing</small></button>`).join("")}</div></div>
          <div class="field"><span class="label">Words <span class="opt">${picked.size ? `${picked.size} chosen` : "choose one or more"}</span></span>
            <div class="cov-chips pw-words">${words.map((w) => { const st = statusOn(w, sheet); return `<button type="button" class="wp-add ${TONE[st]}${picked.has(w.head) ? " on" : ""}" data-pw-word="${esc(w.head)}" aria-pressed="${picked.has(w.head)}" title="${esc(TIP[st])}">${icon(picked.has(w.head) ? "check" : "plus", "i-xs")}${esc(w.head)}</button>`; }).join("")}</div>
            <div class="cov-legend">${single ? `<span><i style="background:var(--danger)"></i>Not on the sheet yet</span>` : `<span><i style="background:var(--danger)"></i>On neither sheet</span><span><i style="background:var(--warning)"></i>Only on the other sheet</span>`}<span><i style="background:var(--success)"></i>Already on this sheet</span></div></div>
          <div class="field"><span class="label">Exercise</span>
            <div class="pw-exs">${exs.map((e, i) => { const r = MAX_LINES - e.items.length; return `<button type="button" class="pw-ex${i === exIndex ? " on" : ""}" data-pw-ex="${i}"><b>${esc(String(e.number))}</b><span>${esc(EXERCISE_LABELS[e.typeId] || e.typeId)}<small>${plural(e.items.length, "line")} · ${r > 0 ? `room for ${r}` : "full"}</small></span></button>`; }).join("")}</div></div>
          ${ex ? `<div class="field"><span class="label">Where</span>
            <div class="pe-wishes"><button type="button" class="chip${how === "add" ? " active" : ""}" data-pw-how="add"${room > 0 ? "" : " disabled"}>＋ New lines at the end</button><button type="button" class="chip${how === "replace" ? " active" : ""}" data-pw-how="replace"${picked.size === 1 ? "" : ` disabled title="Choose one word to write a line again with it"`}>↻ Instead of a line</button></div>
            ${how === "add" ? `<p class="st-hint">${room > 0 ? `Lingo writes one new line for each word at the end of exercise ${ex.number} (room for ${plural(room, "more line")}).${picked.size > room ? ` Only the first ${room} fit.` : ""}` : `Exercise ${ex.number} is full (${MAX_LINES} lines): choose “Instead of a line”, or another exercise.`}</p>`
              : `<div class="pw-lines">${info.map((l, k) => `<label class="pw-line${k === line ? " on" : ""}${l.only.length ? " only" : ""}"><input type="radio" name="pw_line" value="${k}"${k === line ? " checked" : ""} /><b>${l.n}</b><span>${esc(l.prompt.length > 80 ? `${l.prompt.slice(0, 78)}…` : l.prompt)}<small>${l.words.length ? `tests ${esc(l.words.join(", "))}` : "tests no unit word"}${l.only.length ? ` · ${icon("alert", "i-xs")} the only line on this sheet for ${esc(l.only.join(", "))}` : ""}</small></span></label>`).join("")}</div>`}
          </div>` : ""}`;
        const n = how === "add" ? Math.min(picked.size, room) : picked.size === 1 && line >= 0 ? 1 : 0;
        go.disabled = !ex || !n;
        go.querySelector("span").textContent = how === "add"
          ? (n > 1 ? `Add ${n} lines` : n === 1 ? `Add a line with “${[...picked][0]}”` : "Add")
          : (n ? `Write line ${info[line].n} again with “${[...picked][0]}”` : "Write the line again");
        sum.textContent = ex ? `${SHEET_NAME[sheet]} · exercise ${ex.number}` : `The ${SHEET_NAME[sheet]} has no exercises.`;
      };
      body.addEventListener("click", (e) => {
        const sh = e.target.closest("[data-pw-sheet]");
        if (sh && !sh.disabled) { sheet = sh.dataset.pwSheet; exIndex = pickExercise(); line = -1; how = "add"; draw(); return; }
        const w = e.target.closest("[data-pw-word]");
        if (w) { const k = w.dataset.pwWord; if (picked.has(k)) picked.delete(k); else picked.add(k); draw(); return; }
        const x = e.target.closest("[data-pw-ex]");
        if (x) { exIndex = Number(x.dataset.pwEx); line = -1; if (how === "replace") line = pickLine(lists[sheet][exIndex]); else if (MAX_LINES - lists[sheet][exIndex].items.length <= 0 && picked.size === 1) { how = "replace"; line = pickLine(lists[sheet][exIndex]); } draw(); return; }
        const h = e.target.closest("[data-pw-how]");
        if (h && !h.disabled) { how = h.dataset.pwHow; line = how === "replace" ? pickLine(lists[sheet][exIndex]) : -1; draw(); }
      });
      body.addEventListener("change", (e) => { if (e.target.name === "pw_line") { line = Number(e.target.value); draw(); } });
      go.addEventListener("click", () => {
        const ex = lists[sheet][exIndex];
        if (!ex || !picked.size) return;
        if (!isAiReady()) { actions.openSettings(); return; }
        const words = [...picked];
        close();
        showSheet(sheet);
        if (how === "replace") {
          const at = (ex.items || []).findIndex((it) => it.number === lineInfo(ex)[line]?.n);
          const old = lineInfo(ex)[line]?.words || [];
          if (at >= 0) remakeLine(sheet, exIndex, at, `Build this line on the word "${words[0]}"${old.length ? ` instead of ${old.map((o) => `"${o}"`).join(", ")} — ${old.length > 1 ? "they" : "it"} must not be the answer any more` : ""}.`);
          return;
        }
        const room = MAX_LINES - ex.items.length;
        addLines(sheet, exIndex, ex.items.length - 1, Math.min(words.length, room), { words: words.slice(0, room) });
      });
      draw();
    },
  });
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

/** What the line editor shows for an exercise: the fields a line of that kind has (studio/ws-paper.js reads it). */
function editKind(ex, view) {
  const t = ex.typeId;
  if (t === "D11" || t === "L09") return view.kind === "choice" ? "odd" : "plain";
  if (t === "L13") return view.kind === "choice" ? "ab" : "plain";
  if (t === "L06") return "label";
  if (view.kind === "choice") return "choice";
  if (view.kind === "tf") return "tf";
  if (t === "D13") return "match";
  if (view.kind === "steps") return "steps";
  if (view.kind === "group") return "group";
  if (t === "D26") return "jumble";
  if (t === "D27") return "missing";
  if (view.kind === "chips") return "order";
  return "plain";
}

const WORD_CLASSES = ["noun", "verb", "adjective", "adverb"];
/** A sentence's words mixed up ("they / the / ran …"), never in the right order. */
function mixWords(sentence) {
  const words = String(sentence || "").replace(/[.!?]+$/, "").split(/\s+/).filter(Boolean);
  let out = words;
  for (let k = 0; k < 12 && words.length > 1 && out.join(" ") === words.join(" "); k++) out = [...words].sort(() => Math.random() - 0.5);
  return out.join(" / ");
}

/**
 * One line of a worksheet, edited like a Test Maker question: the fields its kind has (sentence + options + the right
 * one, A/B, yes/no, the letter of a meaning, the steps, a group's words, a clue), and — for the exercises whose letter
 * boxes the app makes — this line's own letter help.
 */
function openItemEditor(sheet, exIndex, itemIndex) {
  const ex = getExercise(sheet, exIndex);
  const item = ex?.items?.[itemIndex];
  if (!ex || !item) return;
  const level = state.data.meta?.classProfile || state.profileId;
  const view = wsItemView(ex, item, level);
  const kind = editKind(ex, view);
  const showStem = ex.typeId === "D02";
  const showTests = sheet === "dictation" && Array.isArray(item.testsWords);
  const showBank = Array.isArray(ex.wordBank) && ex.wordBank.length > 0 && ex.typeId !== "D16";
  const showList = Array.isArray(ex.wordList) && ex.wordList.length > 0;
  const typeLabel = `${ex.typeId} · ${EXERCISE_LABELS[ex.typeId] || ex.typeId}`;
  const field = (id, label, value, { rows = 0, hint = "", wide = true } = {}) => `<div class="field${wide ? " wide" : ""}"><label class="label" for="${id}">${label}${hint ? ` <span class="opt">${hint}</span>` : ""}</label>${rows ? `<textarea class="textarea" id="${id}" rows="${rows}">${esc(value ?? "")}</textarea>` : `<input class="input" id="${id}" value="${esc(value ?? "")}" autocomplete="off" />`}</div>`;
  const select = (id, label, options, value) => `<div class="field"><label class="label" for="${id}">${label}</label><select class="select" id="${id}">${options.map(([v, l]) => `<option value="${esc(v)}"${String(v).toLowerCase() === String(value ?? "").toLowerCase() ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></div>`;
  const LET = "abcdefgh";
  // The sentence of a choice line, as the teacher edits it: the gap stays (or is where the options were).
  const choiceBody = view.kind === "choice" ? (view.target ? view.before : view.mid ? `${view.before} ________ ${view.after}`.trim() : `${view.before} ${view.after}`.trim()) : "";
  const tfOptions = ex.typeId === "L11" ? [["Yes", "Yes"], ["No", "No"]] : [["T", "T (true)"], ["F", "F (false)"]];
  const meaning = (l) => String((ex.wordBank || []).find((e) => String(e).toUpperCase().startsWith(`${l}.`)) || "").replace(/^[A-Z]\.\s*/i, "");
  const matchLetters = (ex.wordBank || []).map((e) => String(e).match(/^([A-Z])\./i)?.[1]?.toUpperCase()).filter(Boolean);
  let body = "";
  if (kind === "choice") {
    body = field("ie_body", view.target ? "Word" : "Sentence", choiceBody, { rows: view.target ? 0 : 2, hint: view.target ? "its options are printed under it" : "the gap is ________" })
      + listField("ie_opts", "Options", ["Option"], view.options, { hint: "printed a, b, c to circle", add: "Add an option", wide: true })
      + `<div class="field"><label class="label" for="ie_answer">Right answer</label><select class="select" id="ie_answer"></select></div>`;
  } else if (kind === "odd") {
    body = listField("ie_opts", "The words", ["Word"], view.options, { hint: "three belong together", add: "Add a word", wide: true }) + `<div class="field"><label class="label" for="ie_answer">The odd one out</label><select class="select" id="ie_answer"></select></div>`;
  } else if (kind === "ab") {
    body = field("ie_a", "Sentence A", view.options[0], { rows: 2 }) + field("ie_b", "Sentence B", view.options[1], { rows: 2 }) + select("ie_answer", "The right one", [["A", "A"], ["B", "B"]], item.answer);
  } else if (kind === "label") {
    body = field("ie_prompt", "Word", item.prompt) + select("ie_answer", "Word class", WORD_CLASSES.map((w) => [w, w]), item.answer);
  } else if (kind === "tf") {
    body = field("ie_body", ex.typeId === "L11" ? "Question" : "Statement", view.text, { rows: 2 }) + select("ie_answer", "Right answer", tfOptions, item.answer);
  } else if (kind === "match") {
    body = field("ie_body", "Word", view.word) + (matchLetters.length ? select("ie_answer", "Its meaning", matchLetters.map((l) => [l, `${l} · ${meaning(l)}`]), item.answer) : field("ie_answer", "Letter", item.answer, { wide: false }));
  } else if (kind === "steps") {
    body = listField("ie_steps", "Steps", ["Step"], view.steps, { hint: "as printed a, b, c … (mixed up)", add: "Add a step", wide: true }) + field("ie_answer", "Right order", item.answer, { hint: "the letters, e.g. b, a, c" });
  } else if (kind === "group") {
    body = field("ie_body", "Group", view.group) + field("ie_answer", "Its words", item.answer, { hint: "comma-separated — they go in the word box" });
  } else if (kind === "jumble") {
    const c = splitClue(item.prompt);
    body = field("ie_body", "Clue", c.clue) + field("ie_answer", "Answer", item.answer) + `<div class="field wide"><label class="switch sm"><input type="checkbox" id="ie_mix" /><span class="track"></span><span class="sw-text">Mix the letters again (now: ${esc(c.head)})</span></label></div>`;
  } else if (kind === "missing") {
    body = field("ie_body", "Clue", splitClue(item.prompt).clue) + field("ie_answer", "Answer", item.answer, { hint: "the letter boxes below follow it" });
  } else if (kind === "order") {
    body = field("ie_prompt", "Words (mixed up)", item.prompt, { hint: "separated by /" }) + field("ie_answer", "The sentence", item.answer) + `<div class="field wide"><button type="button" class="btn btn-ghost btn-sm" data-mix>${icon("shuffle", "i-sm")}Mix the words again</button></div>`;
  } else {
    body = field("ie_prompt", "Line shown to students", item.prompt, { rows: 3, hint: /_{3,}/.test(item.prompt || "") ? "the gap is ________" : "" }) + (ex.typeId === "D13" ? "" : field("ie_answer", "Answer", item.answer, { wide: !showStem }));
  }
  // Letter help for this one line (the exercises whose letter boxes the app makes), as in the Test Maker.
  let help = null;
  if (WS_HELP[ex.typeId] && ["plain", "missing", "jumble"].includes(kind)) {
    let rootEl = null;
    const family = WS_HELP[ex.typeId].kind === "family";
    help = letterHelpField({
      task: family ? "V-FORM" : "V-DEF", reveal: item.reveal, partMode: helpMode(ex, level), partName: "exercise",
      exclude: WS_HELP[ex.typeId].not || [],
      watch: ["#ie_answer", "#ie_prompt", "#ie_stem"],
      answer: () => rootEl?.querySelector("#ie_answer")?.value ?? item.answer,
      prompt: () => {
        if (!family) return "";
        const base = familyBase(ex, { ...item, prompt: rootEl?.querySelector("#ie_prompt")?.value ?? item.prompt, stem: rootEl?.querySelector("#ie_stem")?.value ?? item.stem });
        return base ? `(${base.toUpperCase()})` : "";
      },
    });
    const mount = help.mount;
    help.mount = (root) => { rootEl = root; mount(root); };
  }

  openDialog({
    title: `${SHEET_NAME[sheet]} · Exercise ${ex.number}, line ${item.number}`,
    subtitle: typeLabel,
    iconName: "pencil",
    sheet: true,
    body: `
      <div class="editor-grid">
        ${body}
        ${showStem ? `<div class="field"><label class="label" for="ie_stem">Stem clue (bold)</label><input class="input" id="ie_stem" value="${esc(item.stem || "")}" autocomplete="off" /></div>` : ""}
        ${showTests ? `<div class="field wide"><label class="label" for="ie_tests">Tests these unit words <span class="opt">comma-separated</span></label><input class="input" id="ie_tests" value="${esc((item.testsWords || []).join(", "))}" autocomplete="off" /></div>` : ""}
        ${showBank ? listField("ie_bank", ex.typeId === "D13" ? "Meanings" : "Word bank", [ex.typeId === "D13" ? "Meaning" : "Word"], ex.wordBank, { hint: `whole exercise${ex.typeId === "D13" ? " · “A. meaning”" : " · words that fit no gap count as extra words"}`, add: ex.typeId === "D13" ? "Add a meaning" : "Add a word", wide: true }) : ""}
        ${showList ? listField("ie_list", "Word list", ["Word"], ex.wordList, { hint: "whole exercise · words that fit no gap count as extra words", add: "Add a word", wide: true }) : ""}
      </div>
      ${help?.html || ""}
      <div class="validation-line ok" id="ie_val">${icon("check-circle")}<span>Checking…</span></div>`,
    foot: `
      <button type="button" class="btn btn-danger-ghost btn-sm" data-del>${icon("trash", "i-sm")}Delete line</button>
      <button type="button" class="btn btn-ghost btn-sm" data-add>${icon("plus", "i-sm")}Add line below</button>
      <span class="spacer"></span>
      <button type="button" class="btn btn-magic btn-sm" data-remake>${icon("sparkles", "i-sm")}Remake with Lingo</button>
      <span class="foot-break"></span>
      <span class="spacer"></span>
      <button type="button" class="btn btn-secondary" data-close>Cancel</button>
      <button type="button" class="btn btn-primary" data-save>Save</button>`,
    onMount(root, close) {
      const q = (id) => root.querySelector(id);
      const val = (id) => q(id)?.value ?? "";
      const lines = (id) => (root.querySelector(`[data-list="${id.slice(1)}"]`) ? listValues(root, id.slice(1)) : val(id).split("\n").map((x) => x.trim()).filter(Boolean));
      help?.mount(root);
      // Gaps: put one in, make one longer or shorter, give it a label (the sheet prints it as long as it is typed).
      wireGapTool(root);
      // The right-answer list follows the options as they are typed.
      const fillAnswers = () => {
        const sel = q("#ie_answer");
        if (!sel || sel.tagName !== "SELECT" || !q('[data-list="ie_opts"]')) return;
        const opts = lines("#ie_opts");
        const cur = sel.value || item.answer;
        sel.innerHTML = opts.map((o, i) => `<option value="${esc(o)}"${o.toLowerCase() === String(cur).toLowerCase() ? " selected" : ""}>${LET[i] || ""}) ${esc(o)}</option>`).join("");
      };
      fillAnswers();
      wireLists(root, (id) => { if (id === "ie_opts") fillAnswers(); validate(); });
      q("[data-mix]")?.addEventListener("click", () => { q("#ie_prompt").value = mixWords(val("#ie_answer")); q("#ie_prompt").dispatchEvent(new Event("input", { bubbles: true })); });
      /** The line as the teacher left it: the prompt rebuilt in the exercise's own format; check = why it can't be saved. */
      const built = () => {
        const out = { check: "" };
        if (kind === "choice") {
          const opts = lines("#ie_opts");
          const group = `(${opts.join(" / ")})`;
          const b = val("#ie_body").trim();
          out.prompt = !view.target && view.mid && /_{3,}/.test(b) ? b.replace(/_{3,}/, group) : `${b} ${group}`;
          out.answer = val("#ie_answer");
          if (opts.length < 2 || !opts.some((o) => o.toLowerCase() === out.answer.toLowerCase())) out.check = "Give at least two options and choose the right one.";
        } else if (kind === "odd") {
          const opts = lines("#ie_opts");
          out.prompt = opts.join(", ");
          out.answer = val("#ie_answer");
          if (opts.length < 3) out.check = "Give three or four words.";
        } else if (kind === "ab") { out.prompt = joinAB([val("#ie_a"), val("#ie_b")]); out.answer = val("#ie_answer"); }
        else if (kind === "label") { out.prompt = val("#ie_prompt").trim(); out.answer = val("#ie_answer"); }
        else if (kind === "tf") { out.prompt = `${ex.typeId === "D15" ? "( ) " : ""}${val("#ie_body").trim()}`; out.answer = val("#ie_answer"); }
        else if (kind === "match") { out.prompt = `${val("#ie_body").trim()} __________`; out.answer = val("#ie_answer").trim().toUpperCase(); }
        else if (kind === "steps") { out.prompt = joinSteps(lines("#ie_steps")); out.answer = val("#ie_answer").trim(); }
        else if (kind === "group") {
          const words = val("#ie_answer").split(",").map((w) => w.trim()).filter(Boolean);
          out.prompt = `${val("#ie_body").trim()}: ${words.map(() => "________").join(", ")}`;
          out.answer = words.join(", ");
        } else if (kind === "jumble") {
          const c = splitClue(item.prompt);
          out.prompt = `${q("#ie_mix")?.checked ? "" : c.head} (${val("#ie_body").trim()})`.trim();
          out.answer = val("#ie_answer").trim();
        } else if (kind === "missing") { out.prompt = `_ (${val("#ie_body").trim()})`; out.answer = val("#ie_answer").trim(); }
        else { out.prompt = val("#ie_prompt").trim(); if (q("#ie_answer")) out.answer = val("#ie_answer").trim(); }
        return out;
      };
      const applyTo = (data) => {
        const cEx = sheet === "lingo" ? data.lingoLauncher.practice[exIndex] : data.dictation.exercises[exIndex];
        const cItem = cEx?.items?.[itemIndex];
        if (!cEx || !cItem) return data;
        const b = built();
        // A line the teacher rewrote is theirs: the app checks it but never rebuilds it (studio/ws-checks.js).
        if (b.prompt !== cItem.prompt || (b.answer !== undefined && b.answer !== cItem.answer)) cItem.byTeacher = true;
        cItem.prompt = b.prompt;
        if (b.answer !== undefined) cItem.answer = b.answer;
        if (showStem) cItem.stem = val("#ie_stem").trim();
        if (showTests) cItem.testsWords = val("#ie_tests").split(",").map((x) => x.trim()).filter(Boolean);
        if (help) { const r = help.value(); if (r === undefined) delete cItem.reveal; else cItem.reveal = r; }
        // A box the teacher typed keeps all its words (the answers are always added); its extra words are then this exercise's own.
        if (showBank && lines("#ie_bank").join("\n") !== (cEx.wordBank || []).join("\n")) { cEx.wordBank = lines("#ie_bank"); cEx.boxByTeacher = true; }
        if (showList && lines("#ie_list").join("\n") !== (cEx.wordList || []).join("\n")) { cEx.wordList = lines("#ie_list"); cEx.boxByTeacher = true; }
        return data;
      };
      let t;
      const validate = () => {
        clearTimeout(t);
        t = setTimeout(() => {
          const out = q("#ie_val");
          try {
            const own = built().check;
            const clone = applyTo(normalizeWorksheetExercises(JSON.parse(JSON.stringify(state.data))));
            const issues = validateWorksheet(clone).issues || [];
            const ex2 = getExercise(sheet, exIndex);
            const re = new RegExp(`^${sheet === "lingo" ? "Lingo" : "Dictation"} ex ${ex2.number}\\b(?: \\([^)]*\\))? item ${item.number}:`, "i");
            const mine = [...(own ? [own] : []), ...issues.filter((i) => re.test(i)).map((i) => i.replace(/^.*?item \d+:\s*/i, ""))];
            out.className = `validation-line ${mine.length ? "warn" : "ok"}`;
            out.innerHTML = `${icon(mine.length ? "alert" : "check-circle")}<span>${mine.length ? esc(mine.join(" · ")) : "This line looks good."}</span>`;
          } catch {
            out.className = "validation-line warn";
            out.innerHTML = `${icon("alert")}<span>Couldn't check this edit.</span>`;
          }
        }, 220);
      };
      root.querySelector(".dialog-body").addEventListener("input", validate);
      root.querySelector(".dialog-body").addEventListener("click", (e) => { if (e.target.closest("[data-lh], [data-mix]")) validate(); });
      validate();

      const commit = (msg) => {
        state.data = normalizeWorksheetExercises(state.data);
        persistSession();
        renderPreview();
        if (msg) toast(msg, "ok", { ms: 2600 });
      };
      const save = () => {
        const b = built();
        if (b.check) { toast(b.check, "warn"); return; }
        applyTo(state.data);
        close();
        commit("Line saved.");
        flashNode(`.ex-item[data-ex="${exIndex}"][data-item="${itemIndex}"]`);
      };
      q("[data-save]").addEventListener("click", save);
      q("[data-remake]").addEventListener("click", () => { close(); remakeDialog(sheet, exIndex, itemIndex); });
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

/* ── One exercise's settings on the paper (click its heading), like a Test Maker part's: the task line, the letter
   help of the whole exercise, and mixing its options / letters / words / steps again — all without the AI. ── */
const shuffled = (list) => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** Each choice line gets its options in a new order, the right one in a different place from line to line. */
function mixOptions(ex, level) {
  let k = Math.floor(Math.random() * 3);
  ex.items.forEach((it) => {
    const v = wsItemView(ex, it, level);
    if (v.kind !== "choice" || v.answerIndex < 0) return;
    const right = v.options[v.answerIndex];
    const rest = shuffled(v.options.filter((_, i) => i !== v.answerIndex));
    const at = k++ % v.options.length;
    const options = [...rest.slice(0, at), right, ...rest.slice(at)];
    if (ex.typeId === "D11" || ex.typeId === "L09") it.prompt = options.join(", ");
    else if (ex.typeId === "L13") { it.prompt = joinAB(options); it.answer = at === 0 ? "A" : "B"; }
    else it.prompt = it.prompt.replace(/\(([^()]*\/[^()]*)\)/, `(${options.join(" / ")})`);
  });
}

/** Steps in a new order, with the answer's letters following them. */
function mixSteps(ex, level) {
  ex.items.forEach((it) => {
    const v = wsItemView(ex, it, level);
    if (v.kind !== "steps") return;
    const order = String(it.answer || "").toLowerCase().match(/[a-h]/g) || [];
    const right = order.map((l) => v.steps["abcdefgh".indexOf(l)]).filter(Boolean);
    if (right.length !== v.steps.length) return;
    let mixed = shuffled(right);
    for (let t = 0; t < 8 && mixed.join() === right.join(); t++) mixed = shuffled(right);
    it.prompt = joinSteps(mixed);
    it.answer = right.map((st) => "abcdefgh"[mixed.indexOf(st)]).join(", ");
  });
}

function openExerciseSettings(sheet, exIndex) {
  const ex = getExercise(sheet, exIndex);
  if (!ex) return;
  const level = state.data.meta?.classProfile || state.profileId;
  const views = ex.items.map((it) => wsItemView(ex, it, level));
  const modes = helpModes(ex.typeId);
  const family = WS_HELP[ex.typeId]?.kind === "family";
  let mode = helpMode(ex, level);
  const appLine = getStudentExerciseInstruction({ ...ex, ownInstruction: false });
  const own = ex.ownInstruction ? String(ex.instruction || "") : "";
  const mixes = [
    views.some((v) => v.kind === "choice") && ["options", "Mix the options", "a new order on every line — the right answer moves around"],
    views.some((v) => v.kind === "steps") && ["steps", "Mix the steps", "the right order follows"],
    ex.typeId === "D26" && ["letters", "Mix the letters again", "every word"],
    ex.typeId === "L08" && ["words", "Mix the words again", "every sentence"],
  ].filter(Boolean);
  const ownLines = ex.items.filter((it) => it.reveal !== undefined).length;
  openDialog({
    title: `${SHEET_NAME[sheet]} · Exercise ${ex.number}`,
    subtitle: `${ex.typeId} · ${EXERCISE_LABELS[ex.typeId] || ex.typeId}`,
    iconName: "sliders",
    sheet: true,
    body: `${exerciseWordsHtml(sheet, ex)}
      <div class="field"><label class="label" for="es_instr">What the children read <span class="opt">empty = the app's line, which fits what is printed</span></label>
        <textarea class="textarea" id="es_instr" rows="2" placeholder="${esc(appLine)}">${esc(own)}</textarea></div>
      ${modes.length ? `<div class="field"><span class="label">${family ? "Word help" : "Letter help"} <span class="opt">the whole exercise — the app draws the letter boxes</span></span>
        <div class="chip-row" data-es-modes>${modes.map(([v, l]) => `<button type="button" class="chip${v === mode ? " active" : ""}" data-mode="${esc(v)}">${esc(l)}</button>`).join("")}</div>
        <small class="hint">${ownLines ? `${plural(ownLines, "line")} ${ownLines === 1 ? "has" : "have"} its own letters (click a line to change them) — <button type="button" class="ex-crosslink" data-es-clear>use the exercise's for all</button>` : "Click a line on the paper to choose its own letters."}</small></div>` : ""}
      ${mixes.length ? `<div class="field"><span class="label">Mix</span><div class="es-mixes">${mixes.map(([k, l, hint]) => `<button type="button" class="btn btn-ghost btn-sm" data-es-mix="${k}">${icon("shuffle", "i-sm")}${esc(l)}</button><small class="hint">${esc(hint)}</small>`).join("")}</div></div>` : ""}`,
    foot: `<span class="spacer"></span><button type="button" class="btn btn-secondary" data-close>Close</button><button type="button" class="btn btn-primary" data-save>Save</button>`,
    onMount(root, close) {
      let clearOwn = false;
      const pending = new Set();
      // A words-panel action first keeps what was changed above (Save), then acts on the sheet as it is now.
      let dirty = false;
      root.addEventListener("input", (e) => { if (!e.target.closest("[data-wp]")) dirty = true; });
      root.addEventListener("click", (e) => { if (e.target.closest("[data-mode], [data-es-clear], [data-es-mix]")) dirty = true; });
      wireExerciseWords(root, sheet, exIndex, () => { if (dirty) root.querySelector("[data-save]").click(); else close(); });
      root.querySelector("[data-es-modes]")?.addEventListener("click", (e) => {
        const b = e.target.closest("[data-mode]");
        if (!b) return;
        mode = b.dataset.mode;
        root.querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("active", x === b));
      });
      root.querySelector("[data-es-clear]")?.addEventListener("click", (e) => { clearOwn = true; e.target.closest("small").textContent = "Every line will use the exercise's letter help."; });
      root.querySelectorAll("[data-es-mix]").forEach((b) => b.addEventListener("click", () => {
        pending.add(b.dataset.esMix);
        b.classList.add("active");
        b.disabled = true;
        b.lastChild.textContent = `${b.lastChild.textContent} ✓`;
      }));
      root.querySelector("[data-save]").addEventListener("click", () => {
        const before = JSON.stringify(state.data);
        const text = root.querySelector("#es_instr").value.trim();
        if (text && text !== appLine) { ex.instruction = text; ex.ownInstruction = true; } else { delete ex.ownInstruction; ex.instruction = ""; }
        if (modes.length) ex.letterHelp = mode;
        if (clearOwn) ex.items.forEach((it) => { delete it.reveal; });
        if (pending.has("options")) mixOptions(ex, level);
        if (pending.has("steps")) mixSteps(ex, level);
        if (pending.has("letters")) ex.items.forEach((it) => { it.prompt = `(${splitClue(it.prompt).clue})`; });
        if (pending.has("words")) ex.items.forEach((it) => { it.prompt = mixWords(it.answer); });
        close();
        state.data = normalizeWorksheetExercises(state.data);
        persistSession();
        renderPreview();
        toast("Exercise saved.", "ok", { ms: 2600, actions: [{ label: "Undo", run: () => { state.data = JSON.parse(before); persistSession(); renderPreview(); } }] });
      });
    },
  });
}

/* ── "Words in this exercise": the word check for one exercise, in its settings ── */
const WP_TONE = { missing: "cov-bad", other: "cov-warn", tested: "cov-good" };
const WP_TIP = { missing: "Not tested on either sheet", other: "Only on the other sheet", tested: "Tested in another exercise of this sheet" };

function exerciseWordsHtml(sheet, ex) {
  const ew = exerciseWords(state.data, sheet, ex.number);
  if (!ew.total) return "";
  const lines = (ns) => `${ns.length > 1 ? "lines" : "line"} ${ns.join(", ")}`;
  const here = ew.here.length
    ? ew.here.map((w) => `<span class="wp-chip${w.only ? " only" : ""}" data-ftip="${esc(w.only ? "No other exercise on this sheet tests it" : "Another exercise on this sheet tests it too")}"><b>${esc(w.english)}</b><small>${esc(lines(w.lines))}</small><button type="button" class="wp-x" data-wp-x="${esc(w.english)}" aria-label="Take “${esc(w.english)}” out of this exercise">${icon("x", "i-xs")}</button></span>`).join("")
    : `<span class="wp-none">No unit word is tested here yet.</span>`;
  const room = MAX_LINES - ex.items.length;
  const others = ew.others.map((w) => `<button type="button" class="wp-add ${WP_TONE[w.status]}" data-wp-add="${esc(w.english)}" aria-pressed="false" data-ftip="${esc(WP_TIP[w.status])}">${icon("plus", "i-xs")}${esc(w.english)}</button>`).join("");
  const untested = ew.others.filter((w) => w.status !== "tested").length;
  return `<section class="wp" data-wp>
    <header><span>${icon("target", "i-xs")}<b>Words in this exercise</b></span><small>${plural(ew.here.length, "word")} of ${ew.total} · from the word check</small></header>
    <div class="wp-here">${here}</div>
    <div class="wp-confirm" data-wp-confirm hidden></div>
    ${others ? `<details class="wp-more"${ew.here.length ? "" : " open"}><summary>${icon("plus", "i-xs")}Add words from the word check <small>${untested} not on this sheet yet</small></summary>
      <div class="wp-others">${others}</div>
      <div class="wp-go"><button type="button" class="btn btn-magic btn-sm" data-wp-place disabled${room > 0 ? "" : ` data-full`}>${icon("sparkles", "i-sm")}<span>Add lines with them</span></button><small>${room > 0 ? `Lingo writes one new line for each word, at the end (room for ${plural(room, "more line")}).` : `The exercise is full (${MAX_LINES} lines) — take a word out first.`}</small></div>
    </details>` : ""}
  </section>`;
}

/** done(): keep the settings above and close the dialog — every action then works on the sheet as it is. */
function wireExerciseWords(root, sheet, exIndex, done) {
  const box = root.querySelector("[data-wp]");
  if (!box) return;
  const pick = [];
  const confirmEl = box.querySelector("[data-wp-confirm]");
  const go = box.querySelector("[data-wp-place]");
  const exNow = () => getExercise(sheet, exIndex);
  box.addEventListener("click", (e) => {
    const add = e.target.closest("[data-wp-add]");
    if (add) {
      const w = add.dataset.wpAdd;
      const at = pick.indexOf(w);
      if (at >= 0) pick.splice(at, 1); else pick.push(w);
      add.classList.toggle("on", at < 0);
      add.setAttribute("aria-pressed", String(at < 0));
      const room = MAX_LINES - (exNow()?.items.length || 0);
      go.disabled = !pick.length || room <= 0;
      go.querySelector("span").textContent = pick.length ? `Add ${pick.length > 1 ? `${Math.min(pick.length, room)} lines` : `a line with “${pick[0]}”`}` : "Add lines with them";
      return;
    }
    if (e.target.closest("[data-wp-place]")) {
      const ex = exNow();
      if (!ex || !pick.length) return;
      const words = pick.slice(0, MAX_LINES - ex.items.length);
      if (!words.length) return;
      if (!isAiReady()) { actions.openSettings(); return; }
      done();
      const last = getExercise(sheet, exIndex).items.length - 1;
      addLines(sheet, exIndex, last, words.length, { words });
      return;
    }
    const x = e.target.closest("[data-wp-x]");
    if (x) { askRemove(x.dataset.wpX); return; }
    if (e.target.closest("[data-wp-cancel]")) { confirmEl.hidden = true; confirmEl.innerHTML = ""; return; }
    const del = e.target.closest("[data-wp-del]");
    if (del) {
      const lines = JSON.parse(del.dataset.wpDel);
      const word = del.dataset.word;
      done();
      deleteLines(sheet, exIndex, lines.map((n) => n - 1), `“${word}” taken out (${lines.length > 1 ? `lines ${lines.join(", ")}` : `line ${lines[0]}`} deleted)`);
      return;
    }
    const swap = e.target.closest("[data-wp-swap]");
    if (swap) {
      const neu = confirmEl.querySelector("[data-wp-new]")?.value;
      if (!neu) return;
      if (!isAiReady()) { actions.openSettings(); return; }
      const lines = JSON.parse(swap.dataset.wpSwap);
      const old = swap.dataset.word;
      done();
      swapLines(sheet, exIndex, lines, old, neu);
    }
  });

  function askRemove(word) {
    const ex = exNow();
    if (!ex) return;
    const ew = exerciseWords(state.data, sheet, ex.number);
    const w = ew.here.find((x) => x.english === word);
    if (!w) return;
    const canDelete = ex.items.length - w.lines.length >= 1;
    const lines = w.lines.length > 1 ? `lines ${w.lines.join(", ")}` : `line ${w.lines[0]}`;
    const swapTo = ew.others;
    confirmEl.innerHTML = `<p><b>“${esc(word)}”</b> is tested by ${lines}.${w.only ? ` <span class="wp-warn">${icon("alert", "i-xs")}No other exercise on this sheet tests it.</span>` : ""}</p>
      <div class="wp-acts">
        ${canDelete ? `<button type="button" class="btn btn-danger-ghost btn-sm" data-wp-del="${esc(JSON.stringify(w.lines))}" data-word="${esc(word)}">${icon("trash", "i-sm")}Delete ${lines}</button>` : `<span class="wp-note">The exercise needs at least one line, so it can’t be deleted.</span>`}
        ${swapTo.length ? `<span class="wp-or">or</span><select class="select sm" data-wp-new aria-label="Another word">${swapTo.map((o) => `<option value="${esc(o.english)}">${esc(o.english)}${o.status === "tested" ? " (tested elsewhere)" : ""}</option>`).join("")}</select>
        <button type="button" class="btn btn-magic btn-sm" data-wp-swap="${esc(JSON.stringify(w.lines))}" data-word="${esc(word)}">${icon("sparkles", "i-sm")}Lingo writes ${w.lines.length > 1 ? "them" : "it"} with this word</button>` : ""}
        <button type="button" class="btn btn-ghost btn-sm" data-wp-cancel>Keep it</button>
      </div>`;
    confirmEl.hidden = false;
  }
}

/** Lingo writes the lines that test one word again, each on another word (like ✨ Remake with a wish). */
async function swapLines(sheet, exIndex, lines, old, neu) {
  for (const n of lines) {
    const k = (getExercise(sheet, exIndex)?.items || []).findIndex((it) => it.number === n);
    if (k >= 0) await remakeLine(sheet, exIndex, k, `Build this line on the word "${neu}" instead of "${old}" — "${old}" must not be in the line any more.`);
  }
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
/** "Dictation, CPP1, Unit 5, pp. 40-41" (studio/file-names.js — the same pattern as tests and dictations). */
const sheetFileName = (sheet) => safeFileName(productFileName(SHEET_NAME[sheet], state.data.meta));

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
  const opts = { showAnswers: false, density: state.preview.density, textSize: state.preview.textSize, layout: layoutPayload() };
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
  const filename = `${sheetFileName(sheet)}.docx`;
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
      const res = await d.exportPdf({ html: await pdfHtml(sheet), footer: pdfFooter(sheet), filename: `${sheetFileName(sheet)}.pdf` });
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
    openWorksheetPrint(state.data, sheet, { density: state.preview.density, textSize: state.preview.textSize, layout: layoutPayload(), fontCss: await worksheetFontCss() });
  } catch (e) {
    toast(e.message || String(e), "error");
  }
}

async function exportPack(btn) {
  if (!state.data) return;
  syncMeta();
  await withBusy(btn, async () => {
    try {
      // "CPP1, Unit 5, pp. 40-41": shells before 3.5.4 name the files "<base>_Dictation.docx"; newer ones use `names`.
      const base = safeFileName(productFileName("", state.data.meta)) || "Unit";
      const d = desktop();
      const sheets = papers();
      const both = sheets.length === 3;
      // A unit with one sheet: just its papers (Word + PDF), through the shell's general pack saver.
      if (!both && d?.savePack) {
        const data = await wordData();
        const files = [];
        for (const sheet of sheets) files.push({ name: `${sheetFileName(sheet)}.docx`, docx: { type: sheet, data } });
        for (const sheet of sheets) files.push({ name: `${sheetFileName(sheet)}.pdf`, pdf: { html: await pdfHtml(sheet), footer: pdfFooter(sheet) } });
        const res = await d.savePack({ folderName: safeFileName(productFileName("Unit pack", state.data.meta)), title: "Choose folder to export the unit pack", files });
        if (res.ok) savedToast(res.folder, `unit pack (${plural(res.files.length, "file")})`);
        else if (!res.canceled) toast(`Pack export failed: ${res.error || "unknown error"}`, "error");
      } else if (both && d?.exportPack) {
        const res = await d.exportPack({
          data: await wordData(),
          baseSlug: base,
          folderName: safeFileName(productFileName("Unit pack", state.data.meta)),
          names: { lingo: sheetFileName("lingo"), dictation: sheetFileName("dictation"), answer: sheetFileName("answer") },
          htmlPages: { lingo: await pdfHtml("lingo"), dictation: await pdfHtml("dictation"), answer: await pdfHtml("answer") },
          footers: { lingo: pdfFooter("lingo"), dictation: pdfFooter("dictation"), answer: pdfFooter("answer") },
        });
        if (res.ok) savedToast(res.folder, `unit pack (${plural(res.files.length, "file")})`);
        else if (!res.canceled) toast(`Pack export failed: ${res.error || "unknown error"}`, "error");
      } else {
        const data = await wordData();
        for (const sheet of sheets) {
          await exportDocx(sheet, data, `${sheetFileName(sheet)}.docx`);
        }
        toast(`Downloaded ${sheets.map((sh) => SHEET_NAME[sh]).join(", ").replace(/, (?=[^,]*$)/, " and ")}.`, "ok");
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
  try {
    state.sessionId = saveWorksheetSession(buildForm(), data, JSON.parse(JSON.stringify(state.plan)));
    state.data = data;
    emit("library", "data");
    toast("Duplicated. Pick another class level, adjust words, then generate again.", "ok", { ms: 5200 });
    actions.go("setup");
  } catch (e) {
    toast(`Couldn't duplicate: ${e.message}`, "error");
  }
}
