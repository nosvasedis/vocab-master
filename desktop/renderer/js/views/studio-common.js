/* Shared pieces of the Dictation, Test Maker and Assistant screens: the word source picker, the A4 paper
 * preview, print / PDF / Word export, the AI call wrapper and the list of recent documents. */
import {
  CPP_BOOKS, CLASS_PROFILES, selectSmartCoursebookWords, getProfilePromptBlock, callAi, WORKSHEET_PRINT_CSS, downloadBlob, getAllSavedSessions,
} from "../../app.js";
import { buildClassMemory, reviewWords, memoryBrief } from "../../studio/class-memory.js";
import { $, esc, icon, plural, toast, confirmDialog } from "../ui.js";
import { state, filledWords, prefs, isCpp, bookTitle, unitNumber, BOOK_COLORS } from "../state.js";
import { getApiKey, isAiReady, desktop, chatgptUsageLimited, manageChatGPTUsage } from "../bridge.js";
import { actions } from "../actions.js";
import { picForWord } from "../pics.js";
import { worksheetFontCss } from "../fonts.js";
import { unitWords, sectionCounts, SECTION_LABEL, buildUnitContext } from "../../studio/unit-context.js";
import { STUDIO_PRINT_CSS, studioPrintDocument } from "../../studio/doc-render.js";
import { inlinePictures, picPngMap } from "../../studio/pic-assets.js";
import { BOOK_LEVEL } from "../../studio/levels.js";
import { addOwnWords, mergeOwnWords } from "../../studio/own-words.js";
import { readJSON, writeJSON } from "../bridge.js";
import { recentDocs } from "../made.js";
import { lingoSVG, lingoBadge } from "../../lesson/lingo-art.js";

/* ── Lingo the owl (the app's mascot) and the friendly "working on it" overlay ── */
export const owl = (cls = "") => lingoSVG({ className: `studio-owl ${cls}` });
export const owlHead = (cls = "") => lingoBadge(`lingo-badge studio-owl-head ${cls}`);

/**
 * Cover the paper with Lingo and a short checklist while the AI writes. Returns stop().
 * steps: [[seconds, "text"], …] — each step is ticked off as the next one starts; the last one stays until done.
 * (Its classes are "busy-*": "sb-*" belongs to the sidebar.)
 */
export function busyOverlay(stage, { title, steps = [], note = "" }) {
  stage.querySelector(".studio-busy")?.remove();
  const box = document.createElement("div");
  box.className = "studio-busy";
  box.setAttribute("role", "status");
  box.setAttribute("aria-live", "polite");
  box.innerHTML = `<div class="busy-card">
      <div class="busy-owl">${owl("busy-owl-art")}</div>
      <h3>${esc(title)}</h3>
      <ol class="busy-steps">${steps.map(([, text], i) => `<li data-i="${i}"><span class="busy-dot" aria-hidden="true">${icon("check", "i-xs")}</span><span>${esc(text)}</span></li>`).join("")}</ol>
      <div class="busy-bar" aria-hidden="true"><i></i></div>
      ${note ? `<small>${esc(note)}</small>` : ""}
    </div>`;
  stage.appendChild(box);
  const items = [...box.querySelectorAll(".busy-steps li")];
  const started = Date.now();
  const tick = () => {
    const sec = (Date.now() - started) / 1000;
    let cur = 0;
    steps.forEach(([t], i) => { if (sec >= t) cur = i; });
    items.forEach((li, i) => { li.classList.toggle("done", i < cur); li.classList.toggle("now", i === cur); });
    box.querySelector(".busy-bar i").style.width = `${Math.round(95 * (1 - Math.exp(-sec / 25)))}%`;
  };
  tick();
  const timer = setInterval(tick, 400);
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

/* ── Recent documents: kept by js/made.js, which also opens, closes and deletes everything made ── */
export { recentDocs, saveDoc } from "../made.js";

/* ── Class memory (the teacher turns it on) ─────────────────────────
 * What a class already met, read from the Library: review words for a new test or dictation, and a short brief
 * for the AI. Off until the teacher says yes. */
const MEMORY_KEY = "vm_class_memory_v1";
export const classMemoryOn = () => !!readJSON(MEMORY_KEY, null)?.on;
export function setClassMemory(on) { writeJSON(MEMORY_KEY, { on: !!on, at: new Date().toISOString() }); }
/** Ask once; true when class memory is (now) on. */
export async function askClassMemory() {
  if (classMemoryOn()) return true;
  const ok = await confirmDialog({
    title: "Let Lingo remember what each class studied?",
    body: "Lingo will read the worksheets, dictations and tests you saved in your Library for this class — which words they met, when, and which were tested — to suggest words that are due for review and to reuse known words in new tests. It reads only your own saved work and you can turn it off any time.",
    okLabel: "Turn on", cancelLabel: "Not now", tone: "brand", iconName: "sparkles",
  });
  if (ok) setClassMemory(true);
  return ok;
}
export const classMemoryFor = (levelId) => buildClassMemory({ units: getAllSavedSessions() || [], docs: recentDocs(), levelId });
/** The AI brief for a class (empty when class memory is off or nothing is saved). */
export function classMemoryBrief(levelId, focus = []) {
  if (!classMemoryOn() || !levelId) return "";
  const mem = classMemoryFor(levelId);
  const review = mem.words.size ? reviewWords(mem, { n: 30 }).filter((r) => focus.some((w) => String(w.english).toLowerCase() === r.english.toLowerCase())) : [];
  return memoryBrief(mem, review);
}

/** A very small page number on a word chip (Student's Book, or WB for the Workbook). */
export const pageTag = (w) => (w?.page ? `<span class="wc-pg" title="${w.section === "WB" ? "Workbook" : "Student’s Book"} page ${esc(w.page)}">${w.section === "WB" ? "WB " : ""}${esc(w.page)}</span>` : "");

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
export function createSourcePicker({ multiUnit = false, allowTopic = false, topicPlaceholder = "e.g. Present Simple vs Present Continuous, daily routines", onChange, review = false, level = () => state.profileId } = {}) {
  const st = {
    kind: "unit",
    bookId: (isCpp() && state.cpp.bookId) || "CPP1",
    units: [isCpp() ? state.cpp.unit : 1],
    sections: ["BQ", "A", "B"],
    focusMode: "key", // key | all | pick
    picked: new Set(),
    topic: "",
    keyWords: [],
    several: false, // tests: taps add units instead of switching
    own: [], // the teacher's own words, mixed in: [{ english, greek }]
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
  /** The words chosen from the source (before the own words). */
  function baseFocus() {
    if (st.kind === "current") return filledWords().map((w) => ({ english: w.english.trim(), type: w.type, greek: w.greek, example: "", collocation: w.collocation }));
    if (st.kind === "topic") return [];
    const words = all();
    if (st.focusMode === "all") return words;
    if (st.focusMode === "pick") return words.filter((w) => st.picked.has(w.english.toLowerCase()));
    const keyed = words.filter((w) => st.keyWords.includes(w.english.toLowerCase()));
    return keyed.length >= 5 ? keyed : selectSmartCoursebookWords(words, 15);
  }
  /** Book and unit an own word is looked up in first (its type, Greek and example). */
  const ownCtx = () => (st.kind === "unit" ? { bookId: st.bookId, unit: st.units[0] } : isCpp() ? { bookId: state.cpp.bookId, unit: state.cpp.unit } : {});
  /** The words to test or dictate: the source's words, then the teacher's own words (no repeats). */
  const focus = () => mergeOwnWords(baseFocus(), st.own, ownCtx());
  function value() {
    const f = focus();
    const book = CPP_BOOKS[st.bookId];
    const ownCount = f.filter((w) => w.own).length;
    const plusOwn = ownCount ? ` + ${plural(ownCount, "own word")}` : "";
    const own = st.own.map((w) => ({ ...w }));
    if (st.kind === "current") {
      return { kind: "words", words: f, focus: f, own, label: `${bookTitle() || "My word list"}${unitNumber() ? ` · Unit ${unitNumber()}` : ""} · ${plural(f.length - ownCount, "word")}${plusOwn}`, meta: { bookTitle: bookTitle(), unit: unitNumber() }, level: state.profileId };
    }
    if (st.kind === "topic") return { kind: "topic", words: f, focus: f, own, topic: st.topic, label: `${st.topic || "A topic"}${ownCount ? ` · ${plural(ownCount, "word")}` : ""}`, meta: {}, level: state.profileId };
    return {
      kind: "unit", bookId: st.bookId, units: [...st.units], sections: [...st.sections], words: all(), focus: f, own,
      label: `Primary Path ${st.bookId.slice(-1)} · ${st.units.length === 1 ? `Unit ${st.units[0]}` : `Units ${st.units.join(", ")}`}${plusOwn}`,
      meta: { bookTitle: book.title, unit: st.units.length === 1 ? st.units[0] : st.units.join(", ") },
      level: BOOK_LEVEL[st.bookId],
    };
  }
  /* Full-size and step by step, like Worksheets → Step 1: where the words come from (three cards), then the
   * book covers, the unit tiles and a panel with the unit's parts and the words to test. */
  function render() {
    if (!host) return;
    const book = CPP_BOOKS[st.bookId];
    const counts = st.units.length === 1 ? sectionCounts(st.bookId, st.units[0]) : null;
    const words = st.kind === "unit" ? all() : [];
    const f = focus();
    const keyCount = words.filter((w) => st.keyWords.includes(w.english.toLowerCase())).length;
    const noList = filledWords().length < 3;
    const modes = [
      ["unit", "book-open", "A coursebook unit", "Primary Path 1–3: its words, stories and Big Question"],
      ["current", "list", "My word list", noList ? "Add 3+ words in Worksheets → Step 2 first" : `The ${plural(filledWords().length, "word")} in Worksheets → Step 2`],
      ...(allowTopic ? [["topic", "bulb", "A grammar point or topic", "No word list: Lingo uses words the class knows"]] : []),
    ];
    // Read-only chips (the Worksheets list); long lists fold to 40 with "Show all".
    const chips = (list, max = 40) => {
      const fold = !st.wordsOpen && list.length > max + 6;
      return `${(fold ? list.slice(0, max) : list).map((w) => `<span class="word-chip on static"><span>${esc(w.english)}</span></span>`).join("")}${fold ? `<button type="button" class="mk-more-btn" data-sp-more>${icon("chevron-down", "i-xs")}Show all ${list.length} words</button>` : st.wordsOpen && list.length > max + 6 ? `<button type="button" class="mk-more-btn" data-sp-more>${icon("chevron-up", "i-xs")}Show fewer</button>` : ""}`;
    };
    const unitTitle = (u) => book.units[u]?.title || "";
    const base = baseFocus();
    const ownN = f.length - base.length;
    const baseKeys = new Set(base.map((w) => String(w.english || "").trim().toLowerCase()));
    // The teacher's own words: mixed in with the source's words, typed or pasted, with the Greek if they like.
    const ownBlock = (title, sub) => `<div class="mk-own">
        <div class="mk-own-head"><span class="mk-lbl">${icon("plus", "i-xs")}${title}</span><small>${sub}</small></div>
        <div class="mk-own-row"><input class="input" data-sp-own placeholder="e.g. crater, ash cloud, volcano - ηφαίστειο" aria-label="${esc(title)}" autocomplete="off" /><button type="button" class="btn btn-secondary" data-sp-own-add>${icon("plus", "i-sm")}Add</button></div>
        ${st.own.length ? `<div class="mk-words mk-own-list">${st.own.map((w, i) => `<span class="word-chip own${baseKeys.has(w.english.toLowerCase()) ? " dup" : ""}"${baseKeys.has(w.english.toLowerCase()) ? ` title="Already among the ${st.kind === "unit" ? "unit’s" : "list’s"} words — it counts once"` : ""}><span>${esc(w.english)}</span>${w.greek ? `<small>${esc(w.greek)}</small>` : ""}<button type="button" class="mk-own-x" data-sp-own-del="${i}" aria-label="Remove ${esc(w.english)}">${icon("x", "i-xs")}</button></span>`).join("")}${st.own.length > 1 ? `<button type="button" class="pk-clear" data-sp-own-clear>Remove all</button>` : ""}</div>` : ""}
      </div>`;
    // Review earlier words: what this class met before and is due again (class memory, when turned on).
    const reviewBlock = () => {
      if (!review) return "";
      const lv = level();
      const name = CLASS_PROFILES[lv]?.label || "this class";
      if (!classMemoryOn()) return `<div class="mk-review off"><div class="mk-review-head"><span class="mk-lbl">${icon("clock", "i-xs")}Review earlier words</span><small>Lingo can look at what ${esc(name)} already studied — your saved worksheets, dictations and tests — and suggest words that are due again.</small></div><button type="button" class="btn btn-secondary btn-sm" data-sp-mem-on>${icon("sparkles", "i-sm")}Turn on</button></div>`;
      const mem = classMemoryFor(lv);
      const ownKeys = new Set(st.own.map((w) => w.english.toLowerCase()));
      const sugg = reviewWords(mem, { exclude: f, n: 10 });
      const body = !mem.items
        ? `<p class="mk-review-empty">Nothing saved for ${esc(name)} yet. The worksheets, dictations and tests you make for this class are remembered here.</p>`
        : !sugg.length
          ? `<p class="mk-review-empty">${plural(mem.words.size, "word")} remembered for ${esc(name)} — none is due for review yet.</p>`
          : `<div class="mk-words">${sugg.map((w) => `<button type="button" class="word-chip off review" data-sp-review="${esc(w.english)}" data-tip="${esc(w.why)}">${icon("plus", "i-xs")}<span>${esc(w.english)}</span></button>`).join("")}${sugg.length > 1 ? `<button type="button" class="mk-more-btn" data-sp-review-all>${icon("plus", "i-xs")}Add all ${sugg.length}</button>` : ""}</div>`;
      return `<div class="mk-review"><div class="mk-review-head"><span class="mk-lbl">${icon("clock", "i-xs")}Review earlier words</span><small>${mem.items ? `Words ${esc(name)} met before and should see again — tap to mix them in.` : ""}</small><button type="button" class="pk-clear" data-sp-mem-off>Turn off</button></div>${body}</div>`;
    };
    const countLine = (verb) => `<p class="mk-count">${icon("target", "i-xs")}<b>${plural(f.length, "word")}</b> ${verb}${ownN ? ` · ${plural(ownN, "of your own", "of your own")}` : ""}</p>`;
    host.innerHTML = `
      <div class="mk-choices" style="--n:${modes.length}" role="radiogroup" aria-label="What the words come from">${modes.map(([k, ico, title, sub]) => `<button type="button" role="radio" aria-checked="${st.kind === k}" class="mk-choice${st.kind === k ? " active" : ""}" data-sp-kind="${k}"${k === "current" && noList ? " disabled" : ""}><span class="mk-choice-ico">${icon(ico)}</span><span class="mk-choice-t"><b>${title}</b><small>${esc(sub)}</small></span><span class="mk-tick">${icon("check", "i-xs")}</span></button>`).join("")}</div>
      ${st.kind === "current" ? `<div class="mk-panel">
        <div class="mk-panel-head"><div><h4>${plural(f.length, "word")} from your list</h4><p>${esc(bookTitle() || "Your own words")}${unitNumber() ? ` · Unit ${esc(unitNumber())}` : ""}</p></div>
          <button type="button" class="btn btn-ghost btn-sm" data-sp-edit>${icon("pencil", "i-sm")}Change the list</button></div>
        <div class="mk-words">${chips(base)}</div>
        ${ownBlock("Add more words", "Words that aren't in your list — mixed in with it.")}
        ${reviewBlock()}
        ${countLine("chosen")}</div>` : ""}
      ${st.kind === "topic" ? `<div class="mk-panel"><label class="mk-h" for="spTopic">What should the test be about?</label>
        <input class="input lg" id="spTopic" data-sp-topic placeholder="${esc(topicPlaceholder)}" value="${esc(st.topic)}" />
        ${ownBlock("Words to use (optional)", "Lingo builds the test around them — or leave it empty and Lingo chooses words the class knows.")}
        ${reviewBlock()}
        ${st.own.length ? countLine("chosen") : ""}</div>` : ""}
      ${st.kind === "unit" ? `
        <div class="mk-block"><h4 class="mk-h">Book</h4>
          <div class="book-grid mk-books">${BOOK_IDS.map((id) => {
    const prof = CLASS_PROFILES[CPP_BOOKS[id].recommendedProfile];
    return `<button type="button" class="book-card${id === st.bookId ? " selected" : ""}" data-sp-book="${id}" style="--bk:${BOOK_COLORS[id] || "var(--brand)"}"><span class="book-cover">${id.slice(-1)}</span><span class="book-meta"><strong>Primary Path ${id.slice(-1)}</strong><span>Usually ${esc(prof?.label || "")} · CEFR ${esc(CPP_BOOKS[id].cefr || "")}</span></span></button>`;
  }).join("")}</div></div>
        <div class="mk-block"><div class="mk-h-row"><h4 class="mk-h">${multiUnit && st.several ? "Units" : "Unit"}</h4>
          ${multiUnit ? `<label class="switch sm"><input type="checkbox" data-sp-several ${st.several ? "checked" : ""} /><span class="track"></span><span class="sw-text">Several units</span></label>` : ""}</div>
          <div class="unit-grid mk-units">${Array.from({ length: 9 }, (_, i) => i + 1).map((u) => `<button type="button" class="unit-tile${st.units.includes(u) ? " selected" : ""}" data-sp-unit="${u}" data-tip="${esc(unitTitle(u))}"><span>Unit</span><b>${u}</b><small>${esc(unitTitle(u))}</small></button>`).join("")}</div></div>
        <div class="mk-panel mk-unit">
          <div class="mk-panel-head"><div><h4>${st.units.map((u) => `Unit ${u} · ${esc(unitTitle(u))}`).join("<br>")}</h4><p>${multiUnit && st.several ? "Tap more units to add them to the test." : `Primary Path ${st.bookId.slice(-1)} · the words, stories and Big Question come from here.`}</p></div></div>
          <div class="mk-field"><span class="mk-lbl">Parts of the unit</span><div class="mk-chips">${["BQ", "A", "B", "WB"].map((s) => `<button type="button" class="chip${st.sections.includes(s) ? " active" : ""}" data-sp-sec="${s}">${esc(SECTION_LABEL[s])}${counts ? ` <small>${counts[s]}</small>` : ""}</button>`).join("")}</div></div>
          <div class="mk-field"><span class="mk-lbl">Words to test</span><div class="mk-chips">
            <button type="button" class="chip${st.focusMode === "key" ? " active" : ""}" data-sp-focus="key">★ Lesson key words${keyCount ? ` <small>${keyCount}</small>` : ""}</button>
            <button type="button" class="chip${st.focusMode === "all" ? " active" : ""}" data-sp-focus="all">All <small>${words.length}</small></button>
            <button type="button" class="chip${st.focusMode === "pick" ? " active" : ""}" data-sp-focus="pick">${icon("pencil", "i-xs")}Selected words${st.focusMode === "pick" ? ` <small>${base.length}</small>` : ""}</button></div></div>
          ${unitWordList(words, base)}
          ${ownBlock("Add your own words", `Any words — from another unit, another book, or your own — mixed in with the unit's.`)}
          ${reviewBlock()}
          ${countLine(st.focusMode === "pick" && !ownN ? "chosen — tap words to add or remove them" : "chosen")}
        </div>` : ""}`;
  }
  /**
   * The unit's words in the panel. Chosen words have a small × (taking one out switches to "Selected words");
   * in "Selected words" the words left out are dashed and come back with a tap. Long lists fold to 40.
   */
  function unitWordList(words, base) {
    const picking = st.focusMode === "pick";
    const list = picking ? words : base;
    const LIMIT = 40;
    const shown = st.wordsOpen || list.length <= LIMIT + 6 ? list : list.slice(0, LIMIT);
    const chip = (w) => {
      const k = w.english.toLowerCase();
      const on = !picking || st.picked.has(k);
      return on
        ? `<span class="word-chip on removable"><span>${esc(w.english)}</span>${pageTag(w)}<button type="button" class="wc-x" data-sp-out="${esc(k)}" aria-label="Leave out ${esc(w.english)}" title="Leave it out">${icon("x", "i-xs")}</button></span>`
        : `<button type="button" class="word-chip off" data-sp-word="${esc(k)}" title="Put it back"><span>${esc(w.english)}</span>${pageTag(w)}${icon("plus", "i-xs")}</button>`;
    };
    const more = list.length > shown.length
      ? `<button type="button" class="mk-more-btn" data-sp-more>${icon("chevron-down", "i-xs")}Show all ${list.length} words</button>`
      : st.wordsOpen && list.length > LIMIT + 6 ? `<button type="button" class="mk-more-btn" data-sp-more>${icon("chevron-up", "i-xs")}Show fewer</button>` : "";
    return `<div class="mk-words${picking ? " picking" : ""}${st.wordsOpen ? " open" : ""}">${shown.map(chip).join("")}${more}</div>`;
  }

  const changed = (byUser = true) => { render(); onChange?.(value(), { byUser }); };
  /** Add typed or pasted own words; false (with a hint) when nothing new was added. */
  function addOwn(text) {
    const before = st.own.length;
    st.own = addOwnWords(st.own, text);
    if (st.own.length > before) return true;
    if (String(text || "").trim()) toast("Those words are already in the list.", "info", { ms: 1800 });
    else host.querySelector("[data-sp-own]")?.focus();
    return false;
  }
  function mount(el) {
    host = el;
    host.classList.add("source-picker");
    host.addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (!b || b.disabled) return;
      if (b.dataset.spEdit !== undefined) { actions.go("words"); return; }
      if (b.dataset.spOwnAdd !== undefined) { if (!addOwn(host.querySelector("[data-sp-own]")?.value)) return; }
      if (b.dataset.spOwnDel !== undefined) st.own = st.own.filter((_, i) => i !== Number(b.dataset.spOwnDel));
      if (b.dataset.spOwnClear !== undefined) st.own = [];
      if (b.dataset.spMemOn !== undefined) { if (!(await askClassMemory())) return; }
      if (b.dataset.spMemOff !== undefined) setClassMemory(false);
      if (b.dataset.spReview || b.dataset.spReviewAll !== undefined) {
        const mem = classMemoryFor(level());
        const pick = reviewWords(mem, { exclude: focus(), n: 10 }).filter((w) => b.dataset.spReviewAll !== undefined || w.english === b.dataset.spReview);
        st.own = [...st.own, ...pick.map((w) => ({ english: w.english, greek: w.greek || "" }))];
      }
      if (b.dataset.spKind) st.kind = b.dataset.spKind;
      if (b.dataset.spBook) { st.bookId = b.dataset.spBook; st.picked.clear(); await refreshKeyWords(); }
      if (b.dataset.spUnit) {
        const u = Number(b.dataset.spUnit);
        // A tap switches unit; with "Several units" on (tests), taps add or remove units (at least one stays).
        if (multiUnit && st.several) {
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
      if (b.dataset.spMore !== undefined) { st.wordsOpen = !st.wordsOpen; render(); return; }
      if (b.dataset.spOut) {
        // From "Key words" / "All": the words chosen now become the selection, minus this one.
        if (st.focusMode !== "pick") st.picked = new Set(baseFocus().map((w) => w.english.toLowerCase()));
        st.focusMode = "pick";
        st.picked.delete(b.dataset.spOut);
      }
      if (b.dataset.spWord) {
        const k = b.dataset.spWord;
        if (st.picked.has(k)) st.picked.delete(k); else st.picked.add(k);
      }
      changed();
    });
    // Enter adds the typed words; a pasted list (one per line) is added at once.
    host.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.target.dataset.spOwn === undefined) return;
      e.preventDefault();
      if (addOwn(e.target.value)) changed();
    });
    host.addEventListener("paste", (e) => {
      if (e.target.dataset?.spOwn === undefined) return;
      const text = e.clipboardData?.getData("text") || "";
      if (!/[\n\r]/.test(text)) return;
      e.preventDefault();
      if (addOwn(text)) changed();
    });
    // "Several units" off keeps the first unit.
    host.addEventListener("change", async (e) => {
      if (e.target.dataset.spSeveral === undefined) return;
      st.several = e.target.checked;
      if (!st.several && st.units.length > 1) { st.units = [st.units[0]]; st.picked.clear(); await refreshKeyWords(); }
      changed();
    });
    host.addEventListener("input", (e) => { if (e.target.dataset.spTopic !== undefined) { st.topic = e.target.value; onChange?.(value(), { byUser: true }); } });
    refreshKeyWords().then(() => changed(false));
    render();
  }
  return {
    mount, value, render,
    set(next = {}) {
      Object.assign(st, next);
      st.own = (next.own || []).map((w) => ({ english: w.english, greek: w.greek || "" }));
      if (next.picked) st.picked = new Set(next.picked);
      st.several = st.units.length > 1;
      refreshKeyWords().then(() => changed(false));
    },
  };
}

/* ── Small form helpers ───────────────────────────────────────────── */
export const segHtml = (name, options, value, cls = "sm") => `<div class="segmented ${cls}" data-segmented data-seg="${name}"><span class="seg-thumb"></span>${options.map(([v, l]) => `<button type="button" data-value="${esc(v)}"${String(v) === String(value) ? ' class="active"' : ""}>${l}</button>`).join("")}</div>`;
export const switchHtml = (name, label, hint, on) => `<label class="switch"><input type="checkbox" data-opt="${name}" ${on ? "checked" : ""} /><span class="track"></span><span class="sw-text">${label}${hint ? `<small>${hint}</small>` : ""}</span></label>`;
export const stepperHtml = (name, value, min, max) => `<span class="stepper" data-stepper="${name}" data-min="${min}" data-max="${max}"><button type="button" class="icon-btn sm" data-step="-1" aria-label="Less">${icon("minus", "i-sm")}</button><b>${value}</b><button type="button" class="icon-btn sm" data-step="1" aria-label="More">${icon("plus", "i-sm")}</button></span>`;

export { $, esc, icon, plural, toast };


/* ── Maker wizard (Test Maker, Read-aloud dictation) ───────────────────
 * A full-width page per step under a tinted header with step pills, and a sticky bar with Back / Next.
 * steps: [{ label, sub }]. The last step is the result (the paper). */
export const wizardNav = (steps) => `<nav class="mk-steps" aria-label="Steps">${steps.map((s, i) => `${i ? `<i class="mk-sep" aria-hidden="true"></i>` : ""}<button type="button" class="mk-pill" data-mk-go="${i}"><span class="mk-pill-n"><span>${i + 1}</span>${icon("check", "i-xs")}</span><span class="mk-pill-t"><b>${s.label}</b><small>${s.sub}</small></span></button>`).join("")}</nav>`;

/** Shows one .mk-page at a time; pills and any [data-mk-go] button move between them. */
export function createWizard(root, { onShow } = {}) {
  const pages = () => [...root.querySelectorAll(".mk-page")];
  let cur = 0;
  let seen = 0; // the furthest step opened: only steps up to it get a tick
  let marks = { done: [], locked: [] };
  const w = {
    get index() { return cur; },
    get count() { return pages().length; },
    show(i, { scroll = true } = {}) {
      const all = pages();
      cur = Math.max(0, Math.min(all.length - 1, Number(i) || 0));
      seen = Math.max(seen, cur);
      all.forEach((p, k) => { p.hidden = k !== cur; });
      root.dataset.page = String(cur + 1);
      w.mark();
      if (scroll) $("scroller")?.scrollTo({ top: 0 });
      onShow?.(cur);
    },
    /** done: steps with a tick; locked: steps that can't be opened yet. */
    mark(next = marks) {
      marks = next;
      root.querySelectorAll(".mk-pill").forEach((b, k) => {
        b.classList.toggle("active", k === cur);
        b.classList.toggle("done", k !== cur && k <= seen && marks.done.includes(k));
        b.disabled = marks.locked.includes(k);
        if (k === cur) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
      });
    },
  };
  root.addEventListener("click", (e) => {
    const g = e.target.closest("[data-mk-go]");
    if (g && !g.disabled) w.show(g.dataset.mkGo);
  });
  return w;
}
