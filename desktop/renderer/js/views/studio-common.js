/* Shared pieces of the Dictation, Unit test and Assistant screens: the word source picker, the A4 paper
 * preview, print / PDF / Word export, the AI call wrapper and the list of recent documents. */
import {
  CPP_BOOKS, CLASS_PROFILES, selectSmartCoursebookWords, getProfilePromptBlock, callAi, WORKSHEET_PRINT_CSS, downloadBlob,
} from "../../app.js";
import { $, esc, icon, plural, toast } from "../ui.js";
import { state, filledWords, prefs, isCpp, bookTitle, unitNumber } from "../state.js";
import { getApiKey, isAiReady, desktop, chatgptUsageLimited, manageChatGPTUsage } from "../bridge.js";
import { actions } from "../actions.js";
import { picForWord } from "../pics.js";
import { worksheetFontCss } from "../fonts.js";
import { unitWords, sectionCounts, SECTION_LABEL, buildUnitContext } from "../../studio/unit-context.js";
import { STUDIO_PRINT_CSS, studioPrintDocument } from "../../studio/doc-render.js";
import { inlinePictures, picPngMap } from "../../studio/pic-assets.js";
import { BOOK_LEVEL } from "../../studio/levels.js";
import { readJSON, writeJSON } from "../bridge.js";
import { lingoSVG, lingoBadge } from "../../lesson/lingo-art.js";

/* ── Lingo the owl (the app's mascot) and the friendly "working on it" overlay ── */
export const owl = (cls = "") => lingoSVG({ className: `studio-owl ${cls}` });
export const owlHead = (cls = "") => lingoBadge(`lingo-badge studio-owl-head ${cls}`);

/**
 * Cover the paper with Lingo and a few reassuring steps while the AI writes. Returns stop().
 * steps: [[seconds, "text"], …]
 */
export function busyOverlay(stage, { title, steps = [], note = "" }) {
  stage.querySelector(".studio-busy")?.remove();
  const box = document.createElement("div");
  box.className = "studio-busy";
  box.innerHTML = `<div class="sb-card">${owl("sb-owl")}<h3>${esc(title)}</h3><p class="sb-step"></p><div class="sb-bar"><i></i></div><small>${esc(note)}</small></div>`;
  stage.appendChild(box);
  const started = Date.now();
  const tick = () => {
    const s = (Date.now() - started) / 1000;
    const step = [...steps].reverse().find(([t]) => s >= t)?.[1] || "";
    const p = box.querySelector(".sb-step");
    if (p.textContent !== step) p.textContent = step;
    box.querySelector(".sb-bar i").style.width = `${Math.round(95 * (1 - Math.exp(-s / 25)))}%`;
  };
  tick();
  const timer = setInterval(tick, 500);
  return () => { clearInterval(timer); box.classList.add("out"); setTimeout(() => box.remove(), 250); };
}

/* ── Pictures and lessons ─────────────────────────────────────────── */
/** Word-bank picture token for a word ("@w-volcano"), using the type from the chosen words when known. */
export function makePicFor(words = []) {
  const types = new Map(words.map((w) => [String(w.english || "").toLowerCase(), w.type]));
  return (word) => picForWord(word, types.get(String(word || "").toLowerCase()));
}
const lessonCache = new Map();
export function loadLessonJson(path) {
  if (!lessonCache.has(path)) lessonCache.set(path, fetch(`./lessons/${path}`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return lessonCache.get(path);
}
export const unitContextFor = (sel) => (sel.kind === "unit" ? buildUnitContext({ bookId: sel.bookId, units: sel.units, sections: sel.sections }, { loadLesson: loadLessonJson }) : Promise.resolve(null));

/* ── AI ───────────────────────────────────────────────────────────── */
/** One JSON call with the provider chosen in Settings. Shows the AI status; throws friendly errors. */
export async function askAi(system, user, { retryHint = "" } = {}) {
  if (!isAiReady()) {
    toast("Connect an AI service in Settings first — or use the free book sentences.", "warn", { actions: [{ label: "Open settings", run: () => actions.openSettings() }] });
    throw Object.assign(new Error("AI is not connected."), { quiet: true });
  }
  actions.setAiState("busy");
  try {
    const json = await callAi(getApiKey(), system, user, retryHint);
    actions.setAiState("on");
    return json;
  } catch (e) {
    actions.setAiState("error", e.message);
    throw e;
  }
}
export function aiErrorToast(e) {
  if (e?.quiet) return;
  toast(e?.message || String(e), "error", { actions: chatgptUsageLimited(e) ? [{ label: "Manage usage", run: () => manageChatGPTUsage().catch(() => actions.openSettings()) }] : [] });
}
export const profileBlock = (levelId) => getProfilePromptBlock(levelId);
export const levelLabel = (levelId) => CLASS_PROFILES[levelId]?.label || "";

/* ── Recent documents (synced with the account, js/sync/registry.js) ────────────────────────── */
const DOCS_KEY = "vm_studio_docs_v1";
export function recentDocs(kind) {
  return (readJSON(DOCS_KEY, []) || []).filter((d) => !kind || d.kind === kind);
}
export function saveDoc(doc) {
  const all = (readJSON(DOCS_KEY, []) || []).filter((d) => d.id !== doc.id);
  all.unshift({ ...doc, savedAt: new Date().toISOString() });
  writeJSON(DOCS_KEY, all.slice(0, 40));
}
export function deleteDoc(id) {
  writeJSON(DOCS_KEY, (readJSON(DOCS_KEY, []) || []).filter((d) => d.id !== id));
}

/* ── Paper preview ────────────────────────────────────────────────── */
const PAPER_EXTRA = `:host { all: initial; display: block; color: #000; } .worksheet { max-width: none; }
.teacher-ans-pill { display: inline-flex; align-items: center; margin-left: 6px; padding: 0 8px; height: 20px; border-radius: 99px; font: 600 9pt/20px "Segoe UI", sans-serif; color: #057a55; background: #e6f8f1; vertical-align: 1px; }
.st-playing { background: #fff6d6; border-radius: 6px; }`;
export function createPaper(host) {
  const root = host.attachShadow({ mode: "open" });
  return {
    root,
    render(html) { root.innerHTML = `<style>${WORKSHEET_PRINT_CSS.replace(/@page[^}]*}/, "").replace(/html,\s*body\s*{[^}]*}/, "")}${STUDIO_PRINT_CSS}${PAPER_EXTRA}</style>${html}`; },
    clear() { root.innerHTML = ""; },
  };
}
export function fitPaper(stage, paper) {
  const z = Math.max(0.4, Math.min(1, (stage.clientWidth - 12) / (210 * 3.7795)));
  paper.style.setProperty("--zoom", z.toFixed(3));
}

/* ── Print / PDF / Word ───────────────────────────────────────────── */
export async function printHtml(bodyHtml, title) {
  const doc = studioPrintDocument(bodyHtml, title, await worksheetFontCss());
  let iframe = document.getElementById("studio-print-frame");
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = "studio-print-frame";
    iframe.title = "Print";
    iframe.style.cssText = "position:fixed;width:0;height:0;border:0;left:-9999px;top:0";
    document.body.appendChild(iframe);
  }
  const win = iframe.contentWindow;
  win.document.open();
  win.document.write(doc);
  win.document.close();
  const go = () => Promise.resolve(win.document.fonts?.ready).catch(() => {}).then(() => { win.focus(); win.print(); });
  if (win.document.readyState === "complete") setTimeout(go, 200); else win.addEventListener("load", () => setTimeout(go, 200), { once: true });
}

export async function exportPdf(bodyHtml, title, filename) {
  const d = desktop();
  if (!d?.exportPdf) { await printHtml(bodyHtml, title); toast("Choose “Save as PDF” in the print dialog.", "info"); return; }
  const html = await inlinePictures(studioPrintDocument(bodyHtml, title, await worksheetFontCss()));
  const res = await d.exportPdf({ html, footer: title, filename: safeName(`${filename}.pdf`) });
  if (res.ok) toast(`Saved ${String(res.path).split(/[\\/]/).pop()}`, "ok", { actions: d.openPath ? [{ label: "Open", run: () => d.openPath(res.path) }] : [] });
  else if (!res.canceled) toast(res.error || "PDF export failed.", "error");
}

/** Word file of a test / dictation: which = "student" | "teacher". */
export async function exportWord(doc, which, filename) {
  const data = { doc: { ...doc, meta: { ...doc.meta, picPng: await picPngMap(doc), schoolName: prefs.schoolName || "" } }, which };
  const name = safeName(`${filename}.docx`);
  const d = desktop();
  if (d?.saveDocx) {
    const res = await d.saveDocx({ type: "studio", data, filename: name });
    if (res.ok) toast(`Saved ${String(res.path).split(/[\\/]/).pop()}`, "ok", { actions: d.openPath ? [{ label: "Open", run: () => d.openPath(res.path) }] : [] });
    else if (!res.canceled) toast(`Word export failed: ${res.error || "unknown error"}`, "error");
    return;
  }
  const res = await fetch("/export/docx", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "studio", data }) });
  if (!res.ok) throw new Error((await res.text()) || `Export failed (${res.status})`);
  downloadBlob(await res.blob(), name);
  toast(`Downloaded ${name}`, "ok");
}
export const safeName = (s) => String(s).replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();

/* ── Word source picker ───────────────────────────────────────────── */
const BOOK_IDS = Object.keys(CPP_BOOKS);

/**
 * Where the words come from: the Step 2 list, coursebook units (book → units → sections → words), or a free topic.
 * mount(host) renders it; value() returns { kind, bookId, units, sections, words, focus, label, meta }.
 */
export function createSourcePicker({ multiUnit = false, allowTopic = false, onChange } = {}) {
  const st = {
    kind: "unit",
    bookId: (isCpp() && state.cpp.bookId) || "CPP1",
    units: [isCpp() ? state.cpp.unit : 1],
    sections: ["BQ", "A", "B"],
    focusMode: "key", // key | all | pick
    picked: new Set(),
    topic: "",
    keyWords: [],
    open: false,
  };
  if (filledWords().length >= 3) st.kind = "current";
  let host = null;

  const all = () => (st.kind === "unit" ? st.units.flatMap((u) => unitWords(st.bookId, u, st.sections)) : []);
  async function refreshKeyWords() {
    const keys = [];
    for (const u of st.units) for (const sec of ["BQ", "A", "B"]) {
      if (!st.sections.includes(sec)) continue;
      const l = await loadLessonJson(`${st.bookId}/U${u}-${sec}.json`);
      (l?.focusWords || []).forEach((f) => keys.push(String(f.english || "").toLowerCase()));
    }
    st.keyWords = keys;
  }
  function focus() {
    if (st.kind === "current") return filledWords().map((w) => ({ english: w.english.trim(), type: w.type, greek: w.greek, example: "", collocation: w.collocation }));
    if (st.kind === "topic") return [];
    const words = all();
    if (st.focusMode === "all") return words;
    if (st.focusMode === "pick") return words.filter((w) => st.picked.has(w.english.toLowerCase()));
    const keyed = words.filter((w) => st.keyWords.includes(w.english.toLowerCase()));
    return keyed.length >= 5 ? keyed : selectSmartCoursebookWords(words, 15);
  }
  function value() {
    const f = focus();
    const book = CPP_BOOKS[st.bookId];
    if (st.kind === "current") {
      return { kind: "words", words: f, focus: f, label: `${bookTitle() || "My word list"}${unitNumber() ? ` · Unit ${unitNumber()}` : ""} · ${plural(f.length, "word")}`, meta: { bookTitle: bookTitle(), unit: unitNumber() }, level: state.profileId };
    }
    if (st.kind === "topic") return { kind: "topic", words: [], focus: [], topic: st.topic, label: st.topic || "A topic", meta: {}, level: state.profileId };
    return {
      kind: "unit", bookId: st.bookId, units: [...st.units], sections: [...st.sections], words: all(), focus: f,
      label: `Primary Path ${st.bookId.slice(-1)} · ${st.units.length === 1 ? `Unit ${st.units[0]}` : `Units ${st.units.join(", ")}`}`,
      meta: { bookTitle: book.title, unit: st.units.length === 1 ? st.units[0] : st.units.join(", ") },
      level: BOOK_LEVEL[st.bookId],
    };
  }
  function render() {
    if (!host) return;
    const book = CPP_BOOKS[st.bookId];
    const counts = st.units.length === 1 ? sectionCounts(st.bookId, st.units[0]) : null;
    const words = st.kind === "unit" ? all() : [];
    const f = focus();
    const keyCount = words.filter((w) => st.keyWords.includes(w.english.toLowerCase())).length;
    const modes = [["current", `${icon("list", "i-xs")}My word list (Step 2)`], ["unit", `${icon("book", "i-xs")}A coursebook unit`], ...(allowTopic ? [["topic", `${icon("bulb", "i-xs")}A grammar point or topic`]] : [])];
    host.innerHTML = `
      <div class="sp-modes">${modes.map(([k, l]) => `<button type="button" class="chip${st.kind === k ? " active" : ""}" data-sp-kind="${k}" ${k === "current" && filledWords().length < 3 ? "disabled title=\"Add 3+ words in Step 2 first\"" : ""}>${l}</button>`).join("")}</div>
      ${st.kind === "current" ? `<p class="sp-summary">${icon("check-circle", "i-xs")}Using <b>${plural(f.length, "word")}</b> from your Vocabulary list${bookTitle() ? ` · ${esc(bookTitle())}${unitNumber() ? ` Unit ${esc(unitNumber())}` : ""}` : ""}: <span class="sp-words">${esc(f.slice(0, 14).map((w) => w.english).join(", "))}${f.length > 14 ? "…" : ""}</span></p>` : ""}
      ${st.kind === "topic" ? `<input class="input" data-sp-topic placeholder="e.g. Present Simple vs Present Continuous, daily routines" value="${esc(st.topic)}" />` : ""}
      ${st.kind === "unit" ? `
        <div class="sp-row"><span class="sp-lbl">Book</span>${BOOK_IDS.map((id) => `<button type="button" class="chip${id === st.bookId ? " active" : ""}" data-sp-book="${id}">Primary Path ${id.slice(-1)}</button>`).join("")}</div>
        <div class="sp-row"><span class="sp-lbl">Unit${multiUnit ? "s" : ""}</span>${multiUnit ? `<small class="sp-hint">tap to add or remove</small>` : ""}${Array.from({ length: 9 }, (_, i) => i + 1).map((u) => `<button type="button" class="chip sp-unit${st.units.includes(u) ? " active" : ""}" data-sp-unit="${u}" title="${esc(book.units[u]?.title || "")}">${u}</button>`).join("")}</div>
        <p class="sp-title">${st.units.map((u) => `<b>Unit ${u}</b> ${esc(book.units[u]?.title || "")}`).join(" · ")}</p>
        <div class="sp-row"><span class="sp-lbl">Parts</span><small class="sp-hint">which parts of the unit</small>${["BQ", "A", "B", "WB"].map((s) => `<button type="button" class="chip${st.sections.includes(s) ? " active" : ""}" data-sp-sec="${s}">${SECTION_LABEL[s]}${counts ? ` <small>${counts[s]}</small>` : ""}</button>`).join("")}</div>
        <div class="sp-row"><span class="sp-lbl">Words</span>
          <button type="button" class="chip${st.focusMode === "key" ? " active" : ""}" data-sp-focus="key">★ Lesson key words${keyCount ? ` <small>${keyCount}</small>` : ""}</button>
          <button type="button" class="chip${st.focusMode === "all" ? " active" : ""}" data-sp-focus="all">All <small>${words.length}</small></button>
          <button type="button" class="chip${st.focusMode === "pick" ? " active" : ""}" data-sp-focus="pick">Let me choose…</button>
        </div>
        ${st.focusMode === "pick" ? `<div class="sp-pick">${words.map((w) => `<button type="button" class="word-chip${st.picked.has(w.english.toLowerCase()) ? " on" : ""}" data-sp-word="${esc(w.english.toLowerCase())}"><span>${esc(w.english)}</span></button>`).join("")}</div>` : ""}
        <p class="sp-summary">${icon("target", "i-xs")}<b>${plural(f.length, "word")}</b> chosen: <span class="sp-words">${esc(f.slice(0, 16).map((w) => w.english).join(", "))}${f.length > 16 ? "…" : ""}</span></p>` : ""}`;
  }
  const changed = () => { render(); onChange?.(value()); };
  function mount(el) {
    host = el;
    host.classList.add("source-picker");
    host.addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (!b || b.disabled) return;
      if (b.dataset.spKind) st.kind = b.dataset.spKind;
      if (b.dataset.spBook) { st.bookId = b.dataset.spBook; st.picked.clear(); await refreshKeyWords(); }
      if (b.dataset.spUnit) {
        const u = Number(b.dataset.spUnit);
        // Tests may cover several units: tapping adds or removes a unit (at least one stays).
        if (multiUnit) {
          st.units = st.units.includes(u) ? st.units.filter((x) => x !== u) : [...st.units, u].sort((a, z) => a - z);
          if (!st.units.length) st.units = [u];
        } else st.units = [u];
        st.picked.clear();
        await refreshKeyWords();
      }
      if (b.dataset.spSec) {
        const s = b.dataset.spSec;
        st.sections = st.sections.includes(s) ? st.sections.filter((x) => x !== s) : [...st.sections, s];
        if (!st.sections.length) st.sections = [s];
        await refreshKeyWords();
      }
      if (b.dataset.spFocus) {
        st.focusMode = b.dataset.spFocus;
        // Picking starts from the key words, so the teacher only adds or removes a few.
        if (st.focusMode === "pick" && !st.picked.size) all().filter((w) => st.keyWords.includes(w.english.toLowerCase())).forEach((w) => st.picked.add(w.english.toLowerCase()));
      }
      if (b.dataset.spWord) {
        const k = b.dataset.spWord;
        if (st.picked.has(k)) st.picked.delete(k); else st.picked.add(k);
      }
      changed();
    });
    host.addEventListener("input", (e) => { if (e.target.dataset.spTopic !== undefined) { st.topic = e.target.value; onChange?.(value()); } });
    refreshKeyWords().then(changed);
    render();
  }
  return {
    mount, value, render,
    set(next = {}) {
      Object.assign(st, next);
      if (next.picked) st.picked = new Set(next.picked);
      refreshKeyWords().then(changed);
    },
  };
}

/* ── Small form helpers ───────────────────────────────────────────── */
export const segHtml = (name, options, value, cls = "sm") => `<div class="segmented ${cls}" data-segmented data-seg="${name}"><span class="seg-thumb"></span>${options.map(([v, l]) => `<button type="button" data-value="${esc(v)}"${String(v) === String(value) ? ' class="active"' : ""}>${l}</button>`).join("")}</div>`;
export const switchHtml = (name, label, hint, on) => `<label class="switch"><input type="checkbox" data-opt="${name}" ${on ? "checked" : ""} /><span class="track"></span><span class="sw-text">${label}${hint ? `<small>${hint}</small>` : ""}</span></label>`;
export const stepperHtml = (name, value, min, max) => `<span class="stepper" data-stepper="${name}" data-min="${min}" data-max="${max}"><button type="button" class="icon-btn sm" data-step="-1" aria-label="Less">${icon("minus", "i-sm")}</button><b>${value}</b><button type="button" class="icon-btn sm" data-step="1" aria-label="More">${icon("plus", "i-sm")}</button></span>`;

export { $, esc, icon, plural, toast };
