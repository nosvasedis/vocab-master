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
export function createSourcePicker({ multiUnit = false, allowTopic = false, topicPlaceholder = "e.g. Present Simple vs Present Continuous, daily routines", onChange } = {}) {
  const st = {
    kind: "unit",
    bookId: (isCpp() && state.cpp.bookId) || "CPP1",
    units: [isCpp() ? state.cpp.unit : 1],
    sections: ["BQ", "A", "B"],
    focusMode: "key", // key | all | pick
    picked: new Set(),
    topic: "",
    keyWords: [],
    open: null, // the line opened in the unit chooser: book | unit | parts | words
    several: false, // tests: taps add units instead of switching
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
  /* Compact and step by step: one line per choice (Book · Unit · Parts · Words) shows what is chosen;
   * tapping a line opens just that choice, and picking moves on to the next one. */
  function render() {
    if (!host) return;
    const book = CPP_BOOKS[st.bookId];
    const counts = st.units.length === 1 ? sectionCounts(st.bookId, st.units[0]) : null;
    const words = st.kind === "unit" ? all() : [];
    const f = focus();
    const keyCount = words.filter((w) => st.keyWords.includes(w.english.toLowerCase())).length;
    const modes = [
      ["unit", "book", "A unit", "A coursebook unit"],
      ["current", "list", "My words", "The words in your Vocabulary list (Step 2)"],
      ...(allowTopic ? [["topic", "bulb", "Grammar/topic", "A grammar point or a topic, without a word list"]] : []),
    ];
    const noList = filledWords().length < 3;
    const wordLine = (list, n) => `<span class="sp-words">${esc(list.slice(0, n).map((w) => w.english).join(", "))}${list.length > n ? "…" : ""}</span>`;
    const unitsVal = st.units.length === 1
      ? `${st.units[0]} <small>· ${esc(book.units[st.units[0]]?.title || "")}</small>`
      : `${st.units.join(", ")} <small>· ${st.units.length} units</small>`;
    const partsVal = `${st.sections.map((s) => esc(SECTION_LABEL[s])).join(", ")} <small>· ${words.length} words</small>`;
    const focusVal = { key: "★ Lesson key words", all: "All the words", pick: "My choice" }[st.focusMode];
    const opt = (attr, v, on, label, extra = "") => `<button type="button" class="pk-opt${on ? " active" : ""}" ${attr}="${esc(v)}" aria-pressed="${on}"${extra}>${label}</button>`;
    host.innerHTML = `
      <div class="sp-tabs" role="tablist" style="--n:${modes.length}">${modes.map(([k, ico, l, tip]) => `<button type="button" role="tab" aria-selected="${st.kind === k}" class="sp-tab${st.kind === k ? " active" : ""}" data-sp-kind="${k}" ${k === "current" && noList ? "disabled data-tip=\"Add 3+ words in Step 2 first\"" : `data-tip="${esc(tip)}"`}>${icon(ico, "i-xs")}<span>${l}</span></button>`).join("")}</div>
      ${st.kind === "current" ? `<p class="sp-summary"><span class="sp-clamp">${icon("check-circle", "i-xs")}<b>${plural(f.length, "word")}</b> from your list${bookTitle() ? ` · ${esc(bookTitle())}${unitNumber() ? ` Unit ${esc(unitNumber())}` : ""}` : ""}: ${wordLine(f, 14)}</span></p>` : ""}
      ${st.kind === "topic" ? `<input class="input sm" data-sp-topic placeholder="${esc(topicPlaceholder)}" value="${esc(st.topic)}" />` : ""}
      ${st.kind === "unit" ? `<div class="pk-rows">
        ${pickRow("book", "Book", `Primary Path ${st.bookId.slice(-1)}`, st.open === "book",
    `<div class="pk-grid" style="--cols:3">${BOOK_IDS.map((id) => opt("data-sp-book", id, id === st.bookId, `Primary Path ${id.slice(-1)}`)).join("")}</div>`)}
        ${pickRow("unit", multiUnit ? "Units" : "Unit", unitsVal, st.open === "unit",
    `<div class="pk-grid pk-units" style="--cols:9">${Array.from({ length: 9 }, (_, i) => i + 1).map((u) => opt("data-sp-unit", u, st.units.includes(u), u, ` data-tip="${esc(book.units[u]?.title || "")}"`)).join("")}</div>
          <div class="pk-foot"><p class="pk-note">${st.units.map((u) => `<b>Unit ${u}</b> ${esc(book.units[u]?.title || "")}`).join(" · ")}</p>
            ${multiUnit ? `<button type="button" class="pk-link" data-sp-several="${st.several ? "" : "1"}">${st.several ? "Just one unit" : `${icon("plus", "i-xs")}Several units`}</button>` : ""}</div>
          ${multiUnit && st.several ? `<p class="pk-note">Tap the numbers to add or remove units.</p>` : ""}`)}
        ${pickRow("parts", "Parts", partsVal, st.open === "parts",
    `<div class="pk-grid" style="--cols:2">${["BQ", "A", "B", "WB"].map((s) => opt("data-sp-sec", s, st.sections.includes(s), `${esc(SECTION_LABEL[s])}${counts ? ` <small>${counts[s]}</small>` : ""}`)).join("")}</div>
          <p class="pk-note">The parts of the unit the words come from.</p>`)}
        ${pickRow("words", "Words", `${focusVal} <small>· ${f.length}</small>`, st.open === "words",
    `<div class="pk-grid" style="--cols:3">${opt("data-sp-focus", "key", st.focusMode === "key", `★ Key words${keyCount ? ` <small>${keyCount}</small>` : ""}`)}${opt("data-sp-focus", "all", st.focusMode === "all", `All <small>${words.length}</small>`)}${opt("data-sp-focus", "pick", st.focusMode === "pick", "Let me choose")}</div>
          ${st.focusMode === "pick" ? `<div class="sp-pick">${words.map((w) => `<button type="button" class="word-chip${st.picked.has(w.english.toLowerCase()) ? " on" : ""}" data-sp-word="${esc(w.english.toLowerCase())}"><span>${esc(w.english)}</span></button>`).join("")}</div>` : `<p class="pk-note">The lesson key words are the ones the lessons teach; “All” takes every word of the chosen parts.</p>`}`)}
      </div>
      <p class="sp-summary"><span class="sp-clamp">${icon("target", "i-xs")}<b>${plural(f.length, "word")}</b>: ${wordLine(f, 16)}</span></p>` : ""}`;
  }
  const changed = (byUser = true) => { render(); onChange?.(value(), { byUser }); };
  function mount(el) {
    host = el;
    host.classList.add("source-picker");
    host.addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (!b || b.disabled) return;
      // Opening or closing a line changes nothing that was chosen.
      if (b.dataset.pkToggle) { st.open = st.open === b.dataset.pkToggle ? null : b.dataset.pkToggle; render(); return; }
      if (b.dataset.spKind) { st.kind = b.dataset.spKind; st.open = null; }
      // "Several units" lets taps add units; "Just one unit" keeps the first.
      if (b.dataset.spSeveral !== undefined) {
        st.several = !!b.dataset.spSeveral;
        if (!st.several && st.units.length > 1) { st.units = [st.units[0]]; st.picked.clear(); await refreshKeyWords(); }
      }
      // A new book: the next thing to choose is its unit.
      if (b.dataset.spBook) { st.bookId = b.dataset.spBook; st.picked.clear(); st.open = "unit"; await refreshKeyWords(); }
      if (b.dataset.spUnit) {
        const u = Number(b.dataset.spUnit);
        // Tests may cover several units: tapping adds or removes a unit (at least one stays); one unit closes the line.
        if (multiUnit && st.several) {
          st.units = st.units.includes(u) ? st.units.filter((x) => x !== u) : [...st.units, u].sort((a, z) => a - z);
          if (!st.units.length) st.units = [u];
        } else { st.units = [u]; st.open = null; }
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
        if (st.focusMode !== "pick") st.open = null;
        // Picking starts from the key words, so the teacher only adds or removes a few.
        if (st.focusMode === "pick" && !st.picked.size) all().filter((w) => st.keyWords.includes(w.english.toLowerCase())).forEach((w) => st.picked.add(w.english.toLowerCase()));
      }
      if (b.dataset.spWord) {
        const k = b.dataset.spWord;
        if (st.picked.has(k)) st.picked.delete(k); else st.picked.add(k);
      }
      changed();
    });
    host.addEventListener("input", (e) => { if (e.target.dataset.spTopic !== undefined) { st.topic = e.target.value; onChange?.(value(), { byUser: true }); } });
    refreshKeyWords().then(() => changed(false));
    render();
  }
  return {
    mount, value, render,
    /** Close the open line (another chooser on the screen opened one). */
    close() { if (st.open) { st.open = null; render(); } },
    set(next = {}) {
      Object.assign(st, next);
      if (next.picked) st.picked = new Set(next.picked);
      st.several = st.units.length > 1;
      st.open = null;
      refreshKeyWords().then(() => changed(false));
    },
  };
}

/* ── Small form helpers ───────────────────────────────────────────── */
export const segHtml = (name, options, value, cls = "sm") => `<div class="segmented ${cls}" data-segmented data-seg="${name}"><span class="seg-thumb"></span>${options.map(([v, l]) => `<button type="button" data-value="${esc(v)}"${String(v) === String(value) ? ' class="active"' : ""}>${l}</button>`).join("")}</div>`;
export const switchHtml = (name, label, hint, on) => `<label class="switch"><input type="checkbox" data-opt="${name}" ${on ? "checked" : ""} /><span class="track"></span><span class="sw-text">${label}${hint ? `<small>${hint}</small>` : ""}</span></label>`;
export const stepperHtml = (name, value, min, max) => `<span class="stepper" data-stepper="${name}" data-min="${min}" data-max="${max}"><button type="button" class="icon-btn sm" data-step="-1" aria-label="Less">${icon("minus", "i-sm")}</button><b>${value}</b><button type="button" class="icon-btn sm" data-step="1" aria-label="More">${icon("plus", "i-sm")}</button></span>`;

export { $, esc, icon, plural, toast };

/**
 * One line of a compact chooser: a label, what is chosen now and a chevron; only an open line shows its options.
 * value and body are HTML (escape before). The host handles clicks on [data-pk-toggle].
 */
export const pickRow = (key, label, value, open, body) => `<div class="pk-row${open ? " open" : ""}" data-pk="${key}">
  <button type="button" class="pk-head" data-pk-toggle="${key}" aria-expanded="${open}"><span class="pk-lbl">${label}</span><span class="pk-val">${value}</span>${icon("chevron-down", "i-sm pk-chev")}</button>
  ${open ? `<div class="pk-body">${body}</div>` : ""}
</div>`;
