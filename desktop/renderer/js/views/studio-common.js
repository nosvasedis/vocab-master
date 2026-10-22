/* Shared pieces of the Dictation, Test Maker and Assistant screens: the word source picker, the A4 paper
 * preview, print / PDF / Word export, the AI call wrapper and the list of recent documents. */
import {
  CPP_BOOKS, CLASS_PROFILES, selectSmartCoursebookWords, getProfilePromptBlock, callAi, WORKSHEET_PRINT_CSS, downloadBlob, getAllSavedSessions,
} from "../../app.js";
import { buildClassMemory, reviewWords, reviewPlan, memorySummary, memoryBrief } from "../../studio/class-memory.js";
import { $, esc, icon, plural, toast, confirmDialog } from "../ui.js";
import { prefs, BOOK_COLORS } from "../state.js";
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
import { segmented as segmentedCtl } from "../ui.js";
import { TEXT_SIZES, SPACINGS, textSizeKey } from "../../studio/text-size.js";
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
/** Other classes with saved worksheet units of this book this school year: [{ label, n }] (memories are kept per class). */
function otherClassesOnBook(levelId, bookId) {
  if (!bookId) return [];
  const counts = new Map();
  for (const lv of Object.keys(CLASS_PROFILES)) {
    if (lv === levelId) continue;
    const n = classMemoryFor(lv).encounters.filter((e) => e.type === "unit" && e.bookId === bookId).length;
    if (n) counts.set(lv, n);
  }
  return [...counts].map(([lv, n]) => ({ label: CLASS_PROFILES[lv]?.label || lv, n }));
}
const dueDate = (t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
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
.st-playing { background: #fff6d6; border-radius: 6px; }
.pe-flash-sec { animation: pe-flash-sec 1.6s ease-out; border-radius: 6px; }
@keyframes pe-flash-sec { 0% { background: #e0f2fe; box-shadow: 0 0 0 3px #38bdf8; } 100% { background: transparent; box-shadow: 0 0 0 3px transparent; } }`;
export function createPaper(host) {
  const root = host.attachShadow({ mode: "open" });
  return {
    root,
    render(html) { root.innerHTML = `<style>${WORKSHEET_PRINT_CSS.replace(/@page[^}]*}/, "").replace(/html,\s*body\s*{[^}]*}/, "")}${STUDIO_PRINT_CSS}${PAPER_EXTRA}</style>${html}`; },
    clear() { root.innerHTML = ""; },
  };
}
/** The paper's HTML, or — if drawing it fails — a note on the paper instead of a blank page (the document stays saved). */
export function safePaperHtml(draw, what = "paper") {
  try { return draw(); } catch (err) {
    console.error(`The ${what} could not be drawn`, err);
    return `<div style="margin:40px auto;max-width:460px;padding:18px 20px;border:1.5px solid #f59e0b;border-radius:12px;background:#fff8eb;font:500 14px/1.5 system-ui,sans-serif;color:#7a4b00"><b>This ${esc(what)} couldn't be drawn.</b><br>It is saved in your Library. Try writing it (or one part) again, or close it and open it again. <small style="display:block;margin-top:8px;opacity:.75">${esc(err?.message || String(err))}</small></div>`;
  }
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

/** The printable page of a test / dictation sheet (fonts and pictures inlined) — for PDF files. */
const pdfPage = async (bodyHtml, title) => inlinePictures(studioPrintDocument(bodyHtml, title, await worksheetFontCss()));
/** What the Word builder needs for a test / dictation: which = "student" | "teacher". */
const wordData = async (doc, which) => ({ doc: { ...doc, meta: { ...doc.meta, picPng: await picPngMap(doc), schoolName: prefs.schoolName || "" } }, which });

/** Pack entries, built exactly like the single Word / PDF exports. */
export const packPdf = async (bodyHtml, title, filename) => ({ name: safeName(`${filename}.pdf`), pdf: { html: await pdfPage(bodyHtml, title), footer: title } });
export const packWord = async (doc, which, filename) => ({ name: safeName(`${filename}.docx`), docx: { type: "studio", data: await wordData(doc, which) } });
export const packBytes = (bytes, filename) => ({ name: safeName(filename), bytes });

/**
 * Save a pack into one folder the teacher chooses once (desktop app 3.5.5+). In a browser the Word and audio files
 * download one by one (PDFs need the app). An older app is told to finish its update.
 * files: from packPdf / packWord / packBytes. Returns true when saved.
 */
export async function savePack({ folderName, title, files }) {
  const d = desktop();
  if (d?.savePack) {
    const res = await d.savePack({ folderName: safeName(folderName), title, files });
    if (res.ok) {
      toast(`Saved ${plural(res.files.length, "file")} in “${String(res.folder).split(/[\\/]/).pop()}”`, "ok", { ms: 6000, actions: d.openPath ? [{ label: "Open folder", run: () => d.openPath(res.folder) }] : [] });
      return true;
    }
    if (!res.canceled) toast(`Pack export failed: ${res.error || "unknown error"}`, "error");
    return false;
  }
  if (d) {
    toast("Saving a whole pack needs Vocab Master 3.5.5 — it downloads by itself; restart the app to install it. Until then use Word, PDF and the track buttons.", "warn", { ms: 8000 });
    return false;
  }
  let n = 0;
  for (const f of files) {
    if (f.docx) {
      const res = await fetch("/export/docx", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f.docx) });
      if (!res.ok) throw new Error((await res.text()) || `Export failed (${res.status})`);
      downloadBlob(await res.blob(), f.name); n++;
    } else if (f.bytes) { downloadBlob(new Blob([f.bytes]), f.name); n++; }
  }
  toast(`Downloaded ${plural(n, "file")} — PDFs are saved from the desktop app (or Print → Save as PDF).`, "ok", { ms: 6000 });
  return n > 0;
}

export async function exportPdf(bodyHtml, title, filename) {
  const d = desktop();
  if (!d?.exportPdf) { await printHtml(bodyHtml, title); toast("Choose “Save as PDF” in the print dialog.", "info"); return; }
  const html = await pdfPage(bodyHtml, title);
  const res = await d.exportPdf({ html, footer: title, filename: safeName(`${filename}.pdf`) });
  if (res.ok) toast(`Saved ${String(res.path).split(/[\\/]/).pop()}`, "ok", { actions: d.openPath ? [{ label: "Open", run: () => d.openPath(res.path) }] : [] });
  else if (!res.canceled) toast(res.error || "PDF export failed.", "error");
}

/** Word file of a test / dictation: which = "student" | "teacher". */
export async function exportWord(doc, which, filename) {
  const data = await wordData(doc, which);
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
 * Where the words come from: coursebook units (book → units → sections → words) or a free topic, plus the
 * teacher's own words. Each maker has its own picker and its own choice (storeKey: remembered on this
 * computer) — nothing is taken from another screen.
 * mount(host) renders it; value() returns { kind, bookId, units, sections, words, focus, label, meta }.
 */
export function createSourcePicker({ multiUnit = false, allowTopic = false, topicPlaceholder = "e.g. Present Simple vs Present Continuous, daily routines", onChange, review = false, level = () => "B_SENIOR", levelHint = () => "", storeKey = "" } = {}) {
  const st = {
    kind: "unit",
    bookId: "CPP1",
    units: [1],
    sections: ["BQ", "A", "B"],
    focusMode: "key", // key | all | pick
    picked: new Set(),
    topic: "",
    keyWords: [],
    several: false, // tests: taps add units instead of switching
    query: "", // the search over the unit's words (not remembered)
    own: [], // the teacher's own words, mixed in: [{ english, greek }]
  };
  /** The choice is remembered per maker: book, units, parts, which words, the topic and the own words. */
  function load(saved) {
    if (!saved || typeof saved !== "object") return;
    if (saved.kind === "unit" || (saved.kind === "topic" && allowTopic)) st.kind = saved.kind;
    if (CPP_BOOKS[saved.bookId]) st.bookId = saved.bookId;
    const units = (Array.isArray(saved.units) ? saved.units : []).map(Number).filter((u) => u >= 1 && u <= 9);
    if (units.length) st.units = multiUnit ? units : [units[0]];
    const secs = (Array.isArray(saved.sections) ? saved.sections : []).filter((s) => SECTION_LABEL[s]);
    if (secs.length) st.sections = secs;
    if (["key", "all", "pick"].includes(saved.focusMode)) st.focusMode = saved.focusMode;
    if (Array.isArray(saved.picked)) st.picked = new Set(saved.picked.map(String));
    if (typeof saved.topic === "string") st.topic = saved.topic;
    if (Array.isArray(saved.own)) st.own = saved.own.filter((w) => w?.english).map((w) => ({ english: String(w.english), greek: String(w.greek || "") }));
    st.several = multiUnit && st.units.length > 1;
  }
  const save = () => {
    if (storeKey) writeJSON(storeKey, { kind: st.kind, bookId: st.bookId, units: st.units, sections: st.sections, focusMode: st.focusMode, picked: [...st.picked], topic: st.topic, own: st.own });
  };
  if (storeKey) load(readJSON(storeKey, null));
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
    if (st.kind === "topic") return [];
    const words = all();
    if (st.focusMode === "all") return words;
    if (st.focusMode === "pick") return words.filter((w) => st.picked.has(w.english.toLowerCase()));
    const keyed = words.filter((w) => st.keyWords.includes(w.english.toLowerCase()));
    return keyed.length >= 5 ? keyed : selectSmartCoursebookWords(words, 15);
  }
  /** Book and unit an own word is looked up in first (its type, Greek and example). */
  const ownCtx = () => (st.kind === "unit" ? { bookId: st.bookId, unit: st.units[0] } : {});
  /** The unit being made now: review words come only from before it (earlier units of this book, other books). */
  const currentUnit = () => (st.kind === "unit" ? { bookId: st.bookId, unit: Math.min(...st.units) } : null);
  /** The words to test or dictate: the source's words, then the teacher's own words (no repeats). */
  const focus = () => mergeOwnWords(baseFocus(), st.own, ownCtx());
  function value() {
    const f = focus();
    const book = CPP_BOOKS[st.bookId];
    const ownCount = f.filter((w) => w.own).length;
    const plusOwn = ownCount ? ` + ${plural(ownCount, "own word")}` : "";
    const own = st.own.map((w) => ({ ...w }));
    if (st.kind === "topic") return { kind: "topic", words: f, focus: f, own, topic: st.topic, label: `${st.topic || "A topic"}${ownCount ? ` · ${plural(ownCount, "word")}` : ""}`, meta: {}, level: level() };
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
    // A coursebook unit, or (tests) a grammar point or topic; own words can be added to either.
    const modes = allowTopic ? [
      ["unit", "book-open", "A coursebook unit", "Primary Path 1–3: its words, stories and Big Question"],
      ["topic", "bulb", "A grammar point or topic", "Your own words, or Lingo uses words the class knows"],
    ] : [];
    const unitTitle = (u) => book.units[u]?.title || "";
    const base = baseFocus();
    const ownN = f.length - base.length;
    const baseKeys = new Set(base.map((w) => String(w.english || "").trim().toLowerCase()));
    // The teacher's own words: mixed in with the source's words, typed or pasted, with the Greek if they like.
    const ownBlock = (title, sub) => `<div class="mk-own">
        <div class="mk-own-head"><span class="mk-lbl">${icon("plus", "i-xs")}${title}</span><small>${sub}</small></div>
        <div class="mk-own-row"><input class="input" data-sp-own placeholder="e.g. crater, ash cloud, volcano - ηφαίστειο" aria-label="${esc(title)}" autocomplete="off" /><button type="button" class="btn btn-secondary" data-sp-own-add>${icon("plus", "i-sm")}Add</button></div>
        ${st.own.length ? `<div class="mk-words mk-own-list">${st.own.map((w, i) => `<span class="word-chip own${baseKeys.has(w.english.toLowerCase()) ? " dup" : ""}"${baseKeys.has(w.english.toLowerCase()) ? ` title="Already among the unit’s words — it counts once"` : ""}><span>${esc(w.english)}</span>${w.greek ? `<small>${esc(w.greek)}</small>` : ""}<button type="button" class="mk-own-x" data-sp-own-del="${i}" aria-label="Remove ${esc(w.english)}">${icon("x", "i-xs")}</button></span>`).join("")}${st.own.length > 1 ? `<button type="button" class="pk-clear" data-sp-own-clear>Remove all</button>` : ""}</div>` : ""}
      </div>`;
    // Review earlier words: what this class met before and is due again (class memory, when turned on).
    const reviewBlock = () => {
      if (!review) return "";
      const lv = level();
      const name = CLASS_PROFILES[lv]?.label || "this class";
      const head = (sub, extra = "") => `<div class="mk-review-head"><span class="mk-lbl">${icon("clock", "i-xs")}Review earlier words · ${esc(name)}</span><small>${sub}</small>${extra}</div>`;
      if (!classMemoryOn()) return `<div class="mk-review off">${head(`Lingo can look at what ${esc(name)} already studied this school year — your saved worksheets, dictations and tests — and suggest words that are due again.`)}<button type="button" class="btn btn-secondary btn-sm" data-sp-mem-on>${icon("sparkles", "i-sm")}Turn on</button></div>`;
      const mem = classMemoryFor(lv);
      const plan = reviewPlan(mem, { exclude: f, n: 10, current: currentUnit() });
      const off = `<button type="button" class="pk-clear" data-sp-mem-off>Turn off</button>`;
      // Two classes on the same book is where a class set from the book can mislead: say so only then.
      const others = otherClassesOnBook(lv, st.kind === "unit" ? st.bookId : "");
      const hint = others.length ? levelHint() : "";
      const notes = [];
      if (hint) notes.push(esc(hint));
      if (plan.ahead) notes.push(`${plural(plan.ahead, "word")} from this unit or later units of the book aren’t counted yet.`);
      if (mem.older) notes.push(`Work saved before September (last school year) isn’t counted.`);
      const noteHtml = notes.length ? `<p class="mk-review-note">${notes.join(" ")}</p>` : "";
      const chip = (w, early) => `<button type="button" class="word-chip off review${early ? " early" : ""}" data-sp-review="${esc(w.english)}" data-tip="${esc(early ? `${w.why} · due ${dueDate(w.dueAt)}` : w.why)}">${icon("plus", "i-xs")}<span>${esc(w.english)}</span></button>`;
      if (!mem.items) {
        const other = others.length ? ` ${others.map((o) => `${esc(o.label)} has ${plural(o.n, "saved unit")} of this book`).join("; ")} — each class keeps its own memory.` : "";
        return `<div class="mk-review">${head("", off)}<p class="mk-review-empty">Nothing saved for ${esc(name)} this school year yet. The worksheets, dictations and tests you make for ${esc(name)} are remembered here.${other}</p>${noteHtml}</div>`;
      }
      const from = `<p class="mk-review-src">From your saved work for ${esc(name)}: ${esc(memorySummary(mem))}.</p>`;
      let body;
      if (plan.due.length) {
        body = `<div class="mk-words">${plan.due.map((w) => chip(w, false)).join("")}${plan.due.length > 1 ? `<button type="button" class="mk-more-btn" data-sp-review-all>${icon("plus", "i-xs")}Add all ${plan.due.length}</button>` : ""}</div>`;
      } else if (plan.upcoming.length) {
        body = `<p class="mk-review-empty">None is due yet — a word comes back 1, 2, 4 and then 8 weeks after the class last met it. Next: ${esc(dueDate(plan.upcoming[0].dueAt))}. You can mix some in early:</p><div class="mk-words">${plan.upcoming.slice(0, 8).map((w) => chip(w, true)).join("")}</div>`;
      } else {
        body = `<p class="mk-review-empty">${plan.earlier ? "The earlier words are all in this test already." : `No earlier words yet — ${esc(name)}’s saved work is all from this unit or later ones.`}</p>`;
      }
      return `<div class="mk-review">${head(plan.due.length ? `Words ${esc(name)} met before and should see again — tap to mix them in.` : "", off)}${from}${body}${noteHtml}</div>`;
    };
    const countLine = (verb) => `<p class="mk-count">${icon("target", "i-xs")}<b>${plural(f.length, "word")}</b> ${verb}${ownN ? ` · ${plural(ownN, "of your own", "of your own")}` : ""}</p>`;
    host.innerHTML = `
      ${modes.length ? `<div class="mk-choices" style="--n:${modes.length}" role="radiogroup" aria-label="What the test is built on">${modes.map(([k, ico, title, sub]) => `<button type="button" role="radio" aria-checked="${st.kind === k}" class="mk-choice${st.kind === k ? " active" : ""}" data-sp-kind="${k}"><span class="mk-choice-ico">${icon(ico)}</span><span class="mk-choice-t"><b>${title}</b><small>${esc(sub)}</small></span><span class="mk-tick">${icon("check", "i-xs")}</span></button>`).join("")}</div>` : ""}
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
          <div class="mk-field"><span class="mk-lbl">Parts of the unit</span><div class="mk-chips">${["BQ", "A", "B", "WB"].map((s) => `<button type="button" class="chip${st.sections.includes(s) ? " active" : ""}" data-sp-sec="${s}"><i class="sec-dot sec-${s.toLowerCase()}"></i>${esc(SECTION_LABEL[s])}${counts ? ` <small>${counts[s]}</small>` : ""}</button>`).join("")}</div></div>
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
   * The unit's words, all of them, like Worksheets → Word pool: a tick on the chosen ones, a + on the rest, the
   * Greek, the page and a dot in its part's colour. A search filters by English or Greek; "Select all" / "Clear"
   * act on what is shown. Any change makes the choice "Selected words".
   */
  /** The unit's words the search lets through (all of them without a search). */
  function shownWords() {
    const q = (st.query || "").trim().toLowerCase();
    const words = all();
    return q ? words.filter((w) => w.english.toLowerCase().includes(q) || String(w.greek || "").toLowerCase().includes(q)) : words;
  }
  function unitWordList(words, base) {
    const chosen = new Set(base.map((w) => w.english.toLowerCase()));
    const q = (st.query || "").trim().toLowerCase();
    const list = shownWords();
    const chip = (w, i) => {
      const k = w.english.toLowerCase();
      const on = chosen.has(k);
      const tip = `${w.english}${w.type ? ` (${w.type})` : ""}${w.greek ? ` — ${w.greek}` : ""}\n${SECTION_LABEL[w.section] || ""}${w.page ? ` · ${w.section === "WB" ? "Workbook" : "Student’s Book"} p.${w.page}` : ""}\n${on ? "Tap to leave it out" : "Tap to add it"}`;
      return `<button type="button" class="word-chip sec-${esc(String(w.section || "").toLowerCase())}${on ? " on" : ""}" data-sp-word="${esc(k)}" aria-pressed="${on}" title="${esc(tip)}" style="animation-delay:${Math.min(i, 30) * 10}ms"><span class="wc-box">${icon(on ? "check" : "plus")}</span><span>${esc(w.english)}</span>${w.greek ? `<span class="wc-gr">${esc(w.greek)}</span>` : ""}${pageTag(w)}<span class="wc-src"></span></button>`;
    };
    const chips = !words.length
      ? `<div class="mk-pool-empty">No words in the parts chosen above.</div>`
      : !list.length
        ? `<div class="mk-pool-empty">No word matches “${esc(st.query)}”.</div>`
        : list.map(chip).join("");
    const shownOn = list.filter((w) => chosen.has(w.english.toLowerCase())).length;
    const secs = [...new Set(words.map((w) => w.section))];
    return `<div class="mk-pool">
      <div class="mk-pool-bar">
        <div class="input-group pool-search mk-pool-search">${icon("search", "i-sm")}<input class="input sm" type="search" data-sp-search placeholder="Search words or Greek…" value="${esc(st.query || "")}" autocomplete="off" aria-label="Search the unit’s words" /></div>
        <span class="pool-legend">${secs.map((s) => `<span><i class="sec-dot sec-${s.toLowerCase()}"></i>${esc(SECTION_LABEL[s] || s)}</span>`).join("")}</span>
      </div>
      <div class="pool-chips mk-pool-chips" data-sp-chips>${chips}</div>
      <div class="pool-foot mk-pool-foot"><span><strong>${base.length}</strong> of ${words.length} unit words chosen${q ? ` · ${list.length} shown` : ""}</span><span class="spacer"></span>
        <button type="button" class="btn btn-ghost btn-sm" data-sp-all ${!list.length || shownOn === list.length ? "disabled" : ""}>${q ? "Select these" : "Select all"}</button>
        <button type="button" class="btn btn-ghost btn-sm" data-sp-none ${!shownOn ? "disabled" : ""}>${q ? "Clear these" : "Clear"}</button></div>
    </div>`;
  }

  const changed = (byUser = true) => { save(); render(); onChange?.(value(), { byUser }); };
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
      if (b.dataset.spOwnAdd !== undefined) { if (!addOwn(host.querySelector("[data-sp-own]")?.value)) return; }
      if (b.dataset.spOwnDel !== undefined) st.own = st.own.filter((_, i) => i !== Number(b.dataset.spOwnDel));
      if (b.dataset.spOwnClear !== undefined) st.own = [];
      if (b.dataset.spMemOn !== undefined) { if (!(await askClassMemory())) return; }
      if (b.dataset.spMemOff !== undefined) setClassMemory(false);
      if (b.dataset.spReview || b.dataset.spReviewAll !== undefined) {
        const plan = reviewPlan(classMemoryFor(level()), { exclude: focus(), n: 10, current: currentUnit() });
        const pick = b.dataset.spReviewAll !== undefined ? plan.due : [...plan.due, ...plan.upcoming].filter((w) => w.english === b.dataset.spReview).slice(0, 1);
        st.own = [...st.own, ...pick.map((w) => ({ english: w.english, greek: w.greek || "" }))];
      }
      if (b.dataset.spKind) st.kind = b.dataset.spKind;
      if (b.dataset.spBook || b.dataset.spUnit) st.query = "";
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
      // A tap on a word, "Select all" or "Clear": from "Key words" / "All", the words chosen now become the
      // selection, then the change is made to it (to the words shown, while searching).
      if (b.dataset.spWord || b.dataset.spAll !== undefined || b.dataset.spNone !== undefined) {
        if (st.focusMode !== "pick") st.picked = new Set(baseFocus().map((w) => w.english.toLowerCase()));
        st.focusMode = "pick";
        const k = b.dataset.spWord;
        if (k) { if (st.picked.has(k)) st.picked.delete(k); else st.picked.add(k); }
        else shownWords().forEach((w) => st.picked[b.dataset.spAll !== undefined ? "add" : "delete"](w.english.toLowerCase()));
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
    // The search filters the words in place (the field keeps its focus).
    host.addEventListener("input", (e) => {
      if (e.target.dataset.spSearch === undefined) return;
      st.query = e.target.value;
      const pool = host.querySelector(".mk-pool");
      if (!pool) return;
      const tmp = document.createElement("div");
      tmp.innerHTML = unitWordList(all(), baseFocus());
      pool.querySelector("[data-sp-chips]").replaceWith(tmp.querySelector("[data-sp-chips]"));
      pool.querySelector(".mk-pool-foot").replaceWith(tmp.querySelector(".mk-pool-foot"));
    });
    host.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && e.target.dataset.spSearch !== undefined && e.target.value) { e.preventDefault(); e.target.value = ""; e.target.dispatchEvent(new Event("input", { bubbles: true })); }
    });
    host.addEventListener("input", (e) => { if (e.target.dataset.spTopic !== undefined) { st.topic = e.target.value; save(); onChange?.(value(), { byUser: true }); } });
    refreshKeyWords().then(() => changed(false));
    render();
  }
  return {
    mount, value, render,
    /** A saved test, or the assistant's plan: { kind: "unit"|"topic", … }. { keep: true, own } keeps the
     *  choice and only mixes in those own words. */
    set(next = {}) {
      if (next.keep) {
        const have = new Set(st.own.map((w) => w.english.toLowerCase()));
        st.own = [...st.own, ...(next.own || []).filter((w) => w?.english && !have.has(w.english.toLowerCase())).map((w) => ({ english: w.english, greek: w.greek || "" }))];
      } else {
        load({ ...next, kind: next.kind === "topic" && !allowTopic ? "unit" : next.kind, own: next.own || [], picked: next.picked || [] });
        if (!next.picked) st.picked = new Set();
      }
      refreshKeyWords().then(() => changed(false));
    },
  };
}

/* ── Page controls under a paper: text size, spacing, (tests) examples ── */
/** layout: the doc's meta.layout. examples: show the "Examples" switch (tests). */
export function pageControlsHtml(layout = {}, { examples = false } = {}) {
  return `<div class="page-ctl">
    <span class="page-ctl-l">${icon("zoom-in", "i-xs")}Text size</span>${segHtml("textSize", Object.entries(TEXT_SIZES).map(([k, v]) => [k, `<span title="${esc(v.name)}">${esc(v.label)}</span>`]), textSizeKey(layout.textSize))}
    <span class="page-ctl-l">${icon("layers", "i-xs")}Spacing</span>${segHtml("density", SPACINGS, layout.density || "standard")}
    ${examples ? `<label class="switch sm" data-tip="The solved question 0 at the start of each part" data-tip-pos="bottom"><input type="checkbox" data-page-examples ${layout.examples !== false ? "checked" : ""} /><span class="track"></span><span class="sw-text">Examples</span></label>` : ""}
    <button type="button" class="btn btn-ghost btn-sm" data-page-header data-tip="Choose what the top of the paper shows" data-tip-pos="bottom">${icon("sliders", "i-sm")}Header</button>
  </div>`;
}
/** Wire the page controls: onChange({ textSize | density | examples }); onHeader() opens the header switches. */
export function wirePageControls(host, onChange, onHeader) {
  host.querySelector("[data-page-header]")?.addEventListener("click", () => onHeader?.());
  host.querySelectorAll("[data-segmented]").forEach((root) => segmentedCtl(root, { value: root.querySelector(".active")?.dataset.value, onChange: (v) => onChange({ [root.dataset.seg]: v }) }));
  host.querySelector("[data-page-examples]")?.addEventListener("change", (e) => onChange({ examples: e.target.checked }));
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
