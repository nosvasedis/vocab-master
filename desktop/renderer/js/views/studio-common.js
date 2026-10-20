/* Shared pieces of the Dictation, Unit test and Assistant screens: the word source picker, the A4 paper
 * preview, print / PDF / Word export, the AI call wrapper and the list of recent documents. */
import {
  CPP_BOOKS, CLASS_PROFILES, selectSmartCoursebookWords, getProfilePromptBlock, callAi, WORKSHEET_PRINT_CSS, downloadBlob,
} from "../../app.js";
import { $, esc, icon, plural, toast } from "../ui.js";
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
    const chips = (list, max = 60) => `${list.slice(0, max).map((w) => `<span class="word-chip on static"><span>${esc(w.english)}</span></span>`).join("")}${list.length > max ? `<span class="mk-more">+${list.length - max} more</span>` : ""}`;
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
    const countLine = (verb) => `<p class="mk-count">${icon("target", "i-xs")}<b>${plural(f.length, "word")}</b> ${verb}${ownN ? ` · ${plural(ownN, "of your own", "of your own")}` : ""}</p>`;
    host.innerHTML = `
      <div class="mk-choices" style="--n:${modes.length}" role="radiogroup" aria-label="What the words come from">${modes.map(([k, ico, title, sub]) => `<button type="button" role="radio" aria-checked="${st.kind === k}" class="mk-choice${st.kind === k ? " active" : ""}" data-sp-kind="${k}"${k === "current" && noList ? " disabled" : ""}><span class="mk-choice-ico">${icon(ico)}</span><span class="mk-choice-t"><b>${title}</b><small>${esc(sub)}</small></span><span class="mk-tick">${icon("check", "i-xs")}</span></button>`).join("")}</div>
      ${st.kind === "current" ? `<div class="mk-panel">
        <div class="mk-panel-head"><div><h4>${plural(f.length, "word")} from your list</h4><p>${esc(bookTitle() || "Your own words")}${unitNumber() ? ` · Unit ${esc(unitNumber())}` : ""}</p></div>
          <button type="button" class="btn btn-ghost btn-sm" data-sp-edit>${icon("pencil", "i-sm")}Change the list</button></div>
        <div class="mk-words">${chips(base)}</div>
        ${ownBlock("Add more words", "Words that aren't in your list — mixed in with it.")}
        ${countLine("chosen")}</div>` : ""}
      ${st.kind === "topic" ? `<div class="mk-panel"><label class="mk-h" for="spTopic">What should the test be about?</label>
        <input class="input lg" id="spTopic" data-sp-topic placeholder="${esc(topicPlaceholder)}" value="${esc(st.topic)}" />
        ${ownBlock("Words to use (optional)", "Lingo builds the test around them — or leave it empty and Lingo chooses words the class knows.")}
        ${st.own.length ? countLine("chosen") : ""}</div>` : ""}
      ${st.kind === "unit" ? `
        <div class="mk-block"><h4 class="mk-h">Book</h4>
          <div class="book-grid mk-books">${BOOK_IDS.map((id) => {
    const prof = CLASS_PROFILES[CPP_BOOKS[id].recommendedProfile];
    return `<button type="button" class="book-card${id === st.bookId ? " selected" : ""}" data-sp-book="${id}" style="--bk:${BOOK_COLORS[id] || "var(--brand)"}"><span class="book-cover">${id.slice(-1)}</span><span class="book-meta"><strong>Primary Path ${id.slice(-1)}</strong><span>${esc(prof?.label || "")} · CEFR ${esc(CPP_BOOKS[id].cefr || "")}</span></span></button>`;
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
            <button type="button" class="chip${st.focusMode === "pick" ? " active" : ""}" data-sp-focus="pick">${icon("pencil", "i-xs")}Let me choose</button></div></div>
          <div class="mk-words${st.focusMode === "pick" ? " picking" : ""}">${st.focusMode === "pick"
    ? words.map((w) => `<button type="button" class="word-chip${st.picked.has(w.english.toLowerCase()) ? " on" : ""}" data-sp-word="${esc(w.english.toLowerCase())}"><span>${esc(w.english)}</span></button>`).join("")
    : chips(base)}</div>
          ${ownBlock("Add your own words", `Any words — from another unit, another book, or your own — mixed in with the unit's.`)}
          ${countLine(st.focusMode === "pick" && !ownN ? "chosen — tap words to add or remove them" : "chosen")}
        </div>` : ""}`;
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


/* ── Maker wizard (Unit test, Read-aloud dictation) ───────────────────
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
