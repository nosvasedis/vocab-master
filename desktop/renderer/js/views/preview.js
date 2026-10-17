/* Step 4 — A4 preview with click-to-edit, quality checks, coverage, layout options and exports. */
import {
  EXERCISE_LABELS, WORKSHEET_PRINT_CSS, renderLingoLauncher, renderDictation, renderAnswerKey,
  renderCoverageHeatmap, validateWorksheet, buildValidationReport, normalizeWorksheetExercises,
  saveWorksheetSession, applyQuickWorksheetFixes, countQuickFixIssues, fixWorksheetValidationIssues,
  fixDictationCoverageGaps, fixAllWorksheetIssues, exportDocx, openWorksheetPrint, fileBaseName,
} from "../../app.js";
import { $, esc, icon, plural, toast, openDialog, segmented, withBusy } from "../ui.js";
import { state, emit, on, buildForm, makeWord } from "../state.js";
import { desktop, getApiKey } from "../bridge.js";
import { actions } from "../actions.js";

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
`;

export function initPreview() {
  shadow = $("paper").attachShadow({ mode: "open" });
  sheetSeg = segmented($("sheetSeg"), {
    value: state.preview.sheet,
    onChange: (v) => { state.preview.sheet = v; emit("preview"); renderPaper(); },
  });
  densitySeg = segmented($("densitySeg"), {
    value: state.preview.density,
    onChange: (v) => { state.preview.density = v; emit("preview"); renderPaper(); },
  });
  $("optAnswers").addEventListener("change", (e) => { state.preview.showAnswers = e.target.checked; emit("preview"); renderPaper(); });
  $("optHeader").addEventListener("change", (e) => { state.preview.studentHeader = e.target.checked; emit("preview"); renderPaper(); });
  $("zoomIn").addEventListener("click", () => setZoom(+0.1));
  $("zoomOut").addEventListener("click", () => setZoom(-0.1));
  new ResizeObserver(() => applyZoom()).observe($("paperStage"));

  shadow.addEventListener("click", onPaperActivate);
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
  $("optHeader").checked = state.preview.studentHeader;
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

/* ── Paper ───────────────────────────────────────────────────────── */
function renderOpts() {
  return { showAnswers: state.preview.showAnswers, studentHeader: state.preview.studentHeader, density: state.preview.density };
}

function syncMeta() {
  if (!state.data?.meta) return;
  state.data.meta.includeStudentHeader = !!state.preview.studentHeader;
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
  if (item) { e.preventDefault(); openItemEditor(state.preview.sheet, Number(item.dataset.ex), Number(item.dataset.item)); }
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
  try {
    state.sessionId = saveWorksheetSession(buildForm(), state.data, state.plan, { updateId: state.sessionId, validation: val });
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
  if (report.valid) {
    $("qualityPanel").innerHTML = `<div class="quality-ok">${icon("check-circle")}<span>All checks passed — ready to print.</span></div>`;
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
    $("qualityPanel").innerHTML = `
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
  if (!apiKey) { actions.openSettings(); return; }
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
      toast(err.message || String(err), "error");
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

function pdfHtml(sheet) {
  const opts = { showAnswers: false, studentHeader: state.preview.studentHeader, density: state.preview.density };
  const body = sheet === "lingo" ? renderLingoLauncher(state.data, opts)
    : sheet === "dictation" ? renderDictation(state.data, opts) : renderAnswerKey(state.data, opts);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(SHEET_NAME[sheet])}</title><style>${WORKSHEET_PRINT_CSS}</style></head><body>${body}</body></html>`;
}

async function exportWord(sheet, btn) {
  if (!state.data) return;
  syncMeta();
  const filename = safeName(`${SHEET_NAME[sheet]}, ${fileBaseName(state.data.meta)}.docx`);
  await withBusy(btn, async () => {
    try {
      const d = desktop();
      if (d?.saveDocx) {
        const res = await d.saveDocx({ type: sheet, data: state.data, filename });
        if (res.ok) savedToast(res.path);
        else if (!res.canceled) toast(`Word export failed: ${res.error || "unknown error"}`, "error");
      } else {
        await exportDocx(sheet, state.data, filename);
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
      const res = await d.exportPdf({ html: pdfHtml(sheet), filename: safeName(`${SHEET_NAME[sheet]}, ${fileBaseName(state.data.meta)}.pdf`) });
      if (res.ok) savedToast(res.path);
      else if (!res.canceled) toast(res.error || "PDF export failed.", "error");
    } catch (e) {
      toast(`PDF export failed: ${e.message || e}`, "error");
    }
  });
}

export function printSheet(sheet = state.preview.sheet) {
  if (!state.data) { toast("Generate or open a unit first.", "warn"); return; }
  try {
    openWorksheetPrint(state.data, sheet, { studentHeader: state.preview.studentHeader, density: state.preview.density });
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
          data: state.data,
          baseSlug: base,
          htmlPages: { lingo: pdfHtml("lingo"), dictation: pdfHtml("dictation"), answer: pdfHtml("answer") },
        });
        if (res.ok) savedToast(res.folder, `unit pack (${plural(res.files.length, "file")})`);
        else if (!res.canceled) toast(`Pack export failed: ${res.error || "unknown error"}`, "error");
      } else {
        for (const sheet of ["lingo", "dictation", "answer"]) {
          await exportDocx(sheet, state.data, safeName(`${SHEET_NAME[sheet]}, ${base}.docx`));
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
