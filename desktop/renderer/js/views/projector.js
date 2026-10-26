/* Projector mode — anything the teacher made, on the board: a worksheet unit, a test (versions A and B, the
 * teacher's pack) or a read-aloud dictation (the student sheet, the teacher's copy, the wall strips), the open one
 * or any from the Library. Two ways to show it:
 *   Paper — the whole sheet, fitted to the screen's width; tap a line to reveal its answer.
 *   Focus — one part at a time, as large as the screen allows; ← → move between parts.
 * Pictures open large in a viewer. Space reveals the next answer, B blanks the screen, Esc steps back out.
 * What each thing shows is studio/projector-model.js (the same renderers as the paper). */
import { getAllSavedSessions, normalizeWorksheetExercises } from "../../app.js";
import { $, esc, icon, el, toast, timeAgo } from "../ui.js";
import { state, prefs } from "../state.js";
import { readJSON, writeJSON } from "../bridge.js";
import { openItem, recentDocs } from "../made.js";
import { play } from "../../arcade/audio.js";
import { PROJECTOR_KINDS, projectorSheets, projectorCss, projectorTitle, firstSheet } from "../../studio/projector-model.js";

const PREFS_KEY = "vm_projector_v1";
const MAKER_OF = { tests: "test", dictation: "dictation", setup: "unit", words: "unit", exercises: "unit", preview: "unit" };

/* Inside the paper (shadow root): answers hidden until tapped, parts that can be focused, pictures that open large. */
const PJ_CSS = `
:host { all: initial; display: block; }
.worksheet { display: flow-root; max-width: none; width: 210mm; margin: 0 auto; zoom: var(--pj-zoom, 1); }
.pj-focus > .pj-slide-on:last-child, .pj-focus .pj-slide-on { margin-bottom: 0; }
.pj-focus .st-strip { font-size: 1.5em; }
.teacher-ans-pill {
  display: inline-flex; align-items: center; margin-left: 8px; padding: 0 10px; min-height: 1.6em;
  border-radius: 99px; font: 700 0.95em/1.6 "Segoe UI", system-ui, sans-serif; color: #057a55; background: #d9f7ea;
  opacity: 0; transform: scale(0.6); transition: opacity 220ms, transform 320ms cubic-bezier(.34,1.56,.64,1);
  vertical-align: 1px; white-space: normal;
}
.pj { cursor: pointer; border-radius: 8px; transition: background 140ms, box-shadow 140ms; }
.ex-item.pj { margin-left: -8px; margin-right: -8px; padding-left: 8px; padding-right: 8px; }
.pj:hover { background: #f3f1ff; }
.pj.revealed .teacher-ans-pill { opacity: 1; transform: none; }
.pj.next { box-shadow: inset 4px 0 0 #5b4cf5; }
td.pj.next, .pic-card.pj.next { box-shadow: inset 0 0 0 3px #5b4cf5; }
img.pj-pic { cursor: zoom-in; transition: transform 160ms; }
img.pj-pic:hover { transform: scale(1.04); }
.pj-off { display: none !important; }
.pj-focus .ex-block, .pj-focus .key-block { break-inside: auto; margin-top: 0; }
.pj-slide-on { animation: pj-in 260ms cubic-bezier(.2,.8,.2,1) both; }
@keyframes pj-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.st-strip { break-inside: avoid; }
.pj-split { display: flex; align-items: center; gap: 12px; margin: 14mm 0 6mm; font: 800 13pt/1 "Segoe UI", system-ui, sans-serif; letter-spacing: 0.08em; text-transform: uppercase; color: #5b4cf5; }
.pj-split::before, .pj-split::after { content: ""; flex: 1; height: 2px; background: #d9d4ff; }
`;

let open = null;

/* ── What there is to show ─────────────────────────────────────────────────────────────────────────────── */
const loadPrefs = () => ({ mode: "paper", zoom: { paper: 1, focus: 1 }, ...(readJSON(PREFS_KEY, {}) || {}) });
const unitDoc = (data) => normalizeWorksheetExercises(JSON.parse(JSON.stringify(data)));

/** The open worksheet unit, test and dictation: [{ kind, id, doc, title, sub, open: true }]. */
function openSources() {
  const out = [];
  if (state.data) out.push({ kind: "unit", id: state.sessionId || "open-unit", doc: () => state.data, label: libraryUnit(state.sessionId)?.label || "", open: true });
  for (const kind of ["test", "dictation"]) {
    const d = openItem(kind);
    if (d) out.push({ kind, id: d.id, doc: () => openItem(kind) || d, open: true });
  }
  return out.map(describe);
}

const libraryUnit = (id) => (id ? (getAllSavedSessions() || []).find((s) => s.id === id) : null);

/** Everything in the Library, newest first (what is open is listed once, under "Open now"). */
function librarySources() {
  const units = (getAllSavedSessions() || []).filter((s) => s?.data).map((s) => ({ kind: "unit", id: s.id, doc: () => unitDoc(s.data), label: s.label, savedAt: s.savedAt }));
  const docs = recentDocs().filter((d) => d?.kind === "test" || d?.kind === "dictation").map((d) => ({ kind: d.kind, id: d.id, doc: () => d, savedAt: d.savedAt || d.createdAt }));
  return [...units, ...docs].sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0)).map(describe);
}

function describe(src) {
  const doc = src.doc();
  return { ...src, ...projectorTitle(src.kind, doc, { label: src.label }) };
}

/** What to show when the projector is opened without a choice: what the current screen has open, else the newest open thing. */
function defaultSource() {
  const list = openSources();
  const here = MAKER_OF[state.view];
  return list.find((s) => s.kind === here) || list[0] || null;
}

/** Can the projector show anything at all (the sidebar and Home ask)? */
export function projectorHasContent() {
  return !!state.data || !!openItem("test") || !!openItem("dictation") || (getAllSavedSessions() || []).some((s) => s?.data) || recentDocs().some((d) => d?.kind === "test" || d?.kind === "dictation");
}

/* ── The projector ─────────────────────────────────────────────────────────────────────────────────────── */
/**
 * Open the projector. source: { kind: "unit" | "test" | "dictation", id?, item? } (an item from the Library, or the
 * open one of that kind); nothing = what the current screen has open, else the chooser.
 */
export function openProjector(source = null) {
  if (open) return;
  const pick = source && typeof source === "object" && source.kind ? resolve(source) : defaultSource();
  if (!pick && !projectorHasContent()) {
    toast("Make a worksheet unit, a test or a dictation first — then show it here.", "warn");
    return;
  }
  build(pick);
}

function resolve({ kind, id, item }) {
  if (item) return describe({ kind, id: item.id, doc: () => (kind === "unit" ? unitDoc(item.data) : item), label: item.label });
  const opened = openSources().find((s) => s.kind === kind && (!id || s.id === id));
  if (opened) return opened;
  return librarySources().find((s) => s.kind === kind && s.id === id) || null;
}

function build(initial) {
  const saved = loadPrefs();
  const st = {
    src: null, doc: null, sheets: [], sheet: "", mode: saved.mode === "focus" ? "focus" : "paper",
    zoom: { paper: Number(saved.zoom?.paper) || 1, focus: Number(saved.zoom?.focus) || 1 },
    slides: [], slide: 0, pics: [], pic: -1, blank: false,
  };
  const root = el(`<div class="projector" role="dialog" aria-modal="true" aria-label="Projector mode">
    <div class="pj-bar">
      <button type="button" class="pj-source" data-source aria-haspopup="dialog" data-tip="Show something else" data-tip-pos="bottom">
        <span class="pj-source-ico"></span>
        <span class="pj-title"><small>Projector</small><strong></strong></span>
        ${icon("chevron-down", "i-sm")}
      </button>
      <div class="pj-tabs" role="tablist"></div>
      <div class="pj-modes" role="group" aria-label="How to show it">
        <button type="button" data-mode="paper" data-tip="The whole sheet" data-tip-pos="bottom">${icon("file", "i-sm")}<span>Paper</span></button>
        <button type="button" data-mode="focus" data-tip="One part at a time, as large as the screen allows" data-tip-pos="bottom">${icon("maximize", "i-sm")}<span>Focus</span></button>
      </div>
      <button type="button" class="pj-btn" data-reveal>${icon("eye", "i-sm")}<span>Reveal all</span></button>
      <div class="pj-zoom" role="group" aria-label="Size">
        <button type="button" class="pj-icon" data-zoom="-1" aria-label="Smaller" data-tip="Smaller (−)" data-tip-pos="bottom">${icon("zoom-out")}</button>
        <button type="button" class="pj-zoom-v" data-zoom="0" data-tip="Fit to the screen (0)" data-tip-pos="bottom">100%</button>
        <button type="button" class="pj-icon" data-zoom="1" aria-label="Larger" data-tip="Larger (+)" data-tip-pos="bottom">${icon("zoom-in")}</button>
      </div>
      <button type="button" class="pj-icon" data-blank aria-label="Blank the screen" data-tip="Blank the screen (B)" data-tip-pos="bottom">${icon("eye-off")}</button>
      <button type="button" class="pj-icon" data-full aria-label="Full screen" data-tip="Full screen (F)" data-tip-pos="bottom">${icon("maximize")}</button>
      <button type="button" class="btn btn-primary btn-sm" data-exit>${icon("x", "i-sm")}Exit</button>
    </div>
    <div class="pj-stage"><div class="pj-sheet"><div class="pj-paper"></div></div></div>
    <div class="pj-foot">
      <div class="pj-nav hidden">
        <button type="button" class="pj-nav-btn" data-step="-1" aria-label="Previous part">${icon("chevron-left")}</button>
        <div class="pj-nav-mid"><b class="pj-nav-label"></b><span class="pj-dots"></span></div>
        <button type="button" class="pj-nav-btn" data-step="1" aria-label="Next part">${icon("chevron-right")}</button>
      </div>
      <div class="pj-hint"></div>
    </div>
    <div class="pj-viewer hidden" role="dialog" aria-label="Picture">
      <button type="button" class="pj-viewer-nav prev" data-pic="-1" aria-label="Previous picture">${icon("chevron-left")}</button>
      <figure><img alt="" draggable="false"><figcaption></figcaption></figure>
      <button type="button" class="pj-viewer-nav next" data-pic="1" aria-label="Next picture">${icon("chevron-right")}</button>
      <button type="button" class="pj-viewer-x" data-pic-close aria-label="Close the picture">${icon("x")}</button>
    </div>
    <div class="pj-blank hidden"><span>Press <kbd>B</kbd> or click to come back</span></div>
    <div class="pj-picker hidden" role="dialog" aria-label="What to show"></div>
  </div>`);
  $("overlayRoot").appendChild(root);
  const q = (s) => root.querySelector(s);
  const stage = q(".pj-stage");
  const shadow = q(".pj-paper").attachShadow({ mode: "open" });
  const ws = () => shadow.querySelector(".worksheet");
  const sheetInfo = () => st.sheets.find((s) => s.id === st.sheet) || st.sheets[0];
  const savePrefs = () => writeJSON(PREFS_KEY, { mode: st.mode, zoom: st.zoom });

  /* ── Answers ── */
  const hosts = () => [...shadow.querySelectorAll(".pj")].filter((n) => !n.closest(".pj-off"));
  const markNext = () => {
    const list = hosts();
    shadow.querySelectorAll(".pj.next").forEach((n) => n.classList.remove("next"));
    list.find((n) => !n.classList.contains("revealed"))?.classList.add("next");
    const can = !!sheetInfo()?.reveal && list.length > 0;
    const all = can && list.every((n) => n.classList.contains("revealed"));
    q("[data-reveal]").classList.toggle("hidden", !can);
    q("[data-reveal] span").textContent = all ? "Hide all" : st.mode === "focus" ? "Reveal this part" : "Reveal all";
  };
  const revealNext = () => {
    const next = hosts().find((n) => !n.classList.contains("revealed"));
    if (!next) return false;
    play("pop");
    next.classList.add("revealed");
    next.scrollIntoView({ block: "center", behavior: "smooth" });
    markNext();
    return true;
  };
  const hideLast = () => {
    const shown = hosts().filter((n) => n.classList.contains("revealed"));
    if (!shown.length) return false;
    play("tap");
    shown[shown.length - 1].classList.remove("revealed");
    markNext();
    return true;
  };

  /* ── Parts (Focus) ── */
  // A part: an exercise or a test part, a key block, the word table, the marking scheme, a wall strip. The title band
  // and the section labels ("Let's practise") stay on the paper; Focus names the part under the screen instead.
  const findSlides = () => {
    const w = ws();
    if (!w) return [];
    const parts = [...w.querySelectorAll(".ex-block, .st-strip, table.vocab-table, table.st-scheme")].filter((n) => !n.parentElement.closest(".ex-block, .st-strip"));
    return parts.map((n) => ({ el: n, label: slideLabel(n) }));
  };
  const slideLabel = (n) => {
    const group = n.closest("[data-pj-group]")?.dataset.pjGroup;
    const named = (s) => (group ? `${group} · ${s}` : s);
    if (n.matches("table.vocab-table")) return named("Words to learn");
    if (n.matches("table.st-scheme")) return named("Marking scheme");
    if (n.matches(".st-strip")) return `Strip ${n.querySelector("span")?.textContent || ""}`.trim();
    const num = n.querySelector(".ex-num")?.textContent?.trim() || "";
    const head = (n.querySelector(".ex-heading")?.textContent || "").trim().replace(/\s+/g, " ");
    return named([num, head].filter(Boolean).join(" · ") || "Part");
  };
  const applyFocus = () => {
    const w = ws();
    if (!w) return;
    w.querySelectorAll(".pj-off").forEach((n) => n.classList.remove("pj-off"));
    w.querySelectorAll(".pj-slide-on").forEach((n) => n.classList.remove("pj-slide-on"));
    w.classList.toggle("pj-focus", st.mode === "focus");
    if (st.mode !== "focus" || !st.slides.length) return;
    st.slide = Math.max(0, Math.min(st.slides.length - 1, st.slide));
    const cur = st.slides[st.slide].el;
    // Everything off the path from the paper to this part is put away (the title is in the projector's bar).
    for (let node = cur; node && node !== w; node = node.parentElement) {
      [...node.parentElement.children].forEach((sib) => { if (sib !== node) sib.classList.add("pj-off"); });
    }
    cur.classList.add("pj-slide-on");
  };
  const go = (d) => {
    if (st.mode !== "focus" || !st.slides.length) return false;
    const to = Math.max(0, Math.min(st.slides.length - 1, st.slide + d));
    if (to === st.slide) return false;
    st.slide = to;
    play(d > 0 ? "whoosh" : "back");
    layout();
    return true;
  };

  /* ── Size ── */
  const MM = 3.7795;
  const PAPER_W = 210 * MM;
  // A part is never laid out narrower than this (tables, picture grids and columns are made for paper).
  const NARROW_W = 150 * MM;
  /** The room inside the stage's and the white sheet's padding. */
  const room = () => {
    const pad = (node, a, b) => { const cs = getComputedStyle(node); return parseFloat(cs[a]) + parseFloat(cs[b]); };
    const sheet = q(".pj-sheet");
    return {
      w: stage.clientWidth - pad(stage, "paddingLeft", "paddingRight") - pad(sheet, "paddingLeft", "paddingRight") - 4,
      h: stage.clientHeight - pad(stage, "paddingTop", "paddingBottom") - pad(sheet, "paddingTop", "paddingBottom") - 4,
    };
  };
  /**
   * Paper: the A4 sheet fitted to the screen's width. Focus: the part as large as fits the screen — it is laid out
   * to the screen's shape (between 150 mm and A4 wide) at the largest size whose height still fits; a part too long
   * for the screen keeps the paper's width and scrolls. The teacher's − / + multiply what fits.
   */
  const applyZoom = () => {
    const w = ws();
    if (!w) return;
    const { w: sw, h: sh } = room();
    const factor = st.zoom[st.mode];
    let z;
    let width = PAPER_W;
    if (st.mode === "paper" || !st.slides.length) {
      z = Math.max(0.6, Math.min(sw / PAPER_W, 2)) * factor;
    } else {
      const heightAt = (zz) => {
        w.style.setProperty("--pj-zoom", 1);
        w.style.width = `${Math.max(NARROW_W, Math.min(PAPER_W, sw / zz))}px`;
        return w.getBoundingClientRect().height * zz;
      };
      const zMin = sw / PAPER_W;
      const zMax = Math.max(zMin, Math.min(3.2, sw / NARROW_W));
      // A part a little taller than the screen is shown smaller so it fits; a long one (a reading text) scrolls.
      const tall = heightAt(zMin);
      let best = tall > sh ? Math.max(zMin * (sh / tall), zMin * 0.6) : zMin;
      if (tall <= sh) {
        let lo = zMin;
        let hi = zMax;
        if (heightAt(hi) <= sh) lo = hi;
        else for (let i = 0; i < 9; i++) { const mid = (lo + hi) / 2; if (heightAt(mid) <= sh) lo = mid; else hi = mid; }
        best = lo;
      }
      z = best * factor;
      width = Math.max(NARROW_W, Math.min(PAPER_W, sw / z));
    }
    w.style.width = `${width}px`;
    w.style.setProperty("--pj-zoom", z.toFixed(3));
    q(".pj-zoom-v").textContent = `${Math.round(factor * 100)}%`;
  };
  const layout = () => {
    applyFocus();
    applyZoom();
    const focus = st.mode === "focus" && st.slides.length;
    q(".pj-nav").classList.toggle("hidden", !focus);
    root.classList.toggle("is-focus", st.mode === "focus");
    root.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("active", b.dataset.mode === st.mode));
    if (focus) {
      q(".pj-nav-label").textContent = st.slides[st.slide].label;
      q(".pj-dots").innerHTML = st.slides.length <= 24
        ? st.slides.map((_, i) => `<button type="button" class="${i === st.slide ? "on" : ""}" data-dot="${i}" aria-label="Part ${i + 1}"></button>`).join("")
        : `<small>${st.slide + 1} / ${st.slides.length}</small>`;
      q("[data-step='-1']").disabled = st.slide === 0;
      q("[data-step='1']").disabled = st.slide === st.slides.length - 1;
    }
    stage.scrollTop = 0;
    markNext();
    hint();
  };
  const hint = () => {
    const reveal = sheetInfo()?.reveal;
    const bits = [
      reveal ? "Tap a line to show its answer · <kbd>Space</kbd> next answer" : "",
      st.mode === "focus" ? "<kbd>←</kbd> <kbd>→</kbd> parts" : reveal ? "<kbd>←</kbd> hide the last one" : "",
      "Tap a picture to see it large",
      "<kbd>B</kbd> blank",
      "<kbd>Esc</kbd> exit",
    ].filter(Boolean);
    q(".pj-hint").innerHTML = bits.join(" · ");
  };

  /* ── Drawing a sheet ── */
  const render = () => {
    const info = sheetInfo();
    let html = "";
    try { html = info ? info.html() : ""; } catch (err) {
      console.error("Projector: the sheet could not be drawn", err);
      html = `<div class="worksheet"><p style="padding:30px;font:600 16px system-ui">This sheet couldn't be drawn. ${esc(err?.message || "")}</p></div>`;
    }
    shadow.innerHTML = `<style>${projectorCss(st.src.kind)}${PJ_CSS}</style>${html}`;
    // Two sheets in one (the teacher's packs of versions A and B): one paper, B's parts named "Version B".
    const sheets = [...shadow.querySelectorAll(".worksheet")];
    sheets.slice(1).forEach((extra, k) => {
      const tag = st.src.kind === "test" ? `Version ${"BCDE"[k]}` : `Sheet ${k + 2}`;
      sheets[0].append(el(`<div class="pj-split"><span>${esc(tag)}</span></div>`));
      [...extra.children].forEach((n) => { n.dataset.pjGroup = tag; sheets[0].append(n); });
      extra.remove();
    });
    // The answers to reveal: each pill's line (a question, a table cell, a picture card).
    if (info?.reveal) {
      shadow.querySelectorAll(".teacher-ans-pill").forEach((pill) => {
        (pill.closest(".ex-item, td, .st-starter, .pic-card") || pill.parentElement)?.classList.add("pj");
      });
    } else shadow.querySelectorAll(".teacher-ans-pill").forEach((p) => { p.style.opacity = 1; p.style.transform = "none"; });
    shadow.querySelectorAll("img").forEach((img) => img.classList.add("pj-pic"));
    st.slides = findSlides();
    st.slide = 0;
    q(".pj-tabs").innerHTML = st.sheets.map((s) => `<button type="button" role="tab" class="${s.id === st.sheet ? "active" : ""}" aria-selected="${s.id === st.sheet}" data-sheet="${esc(s.id)}">${esc(s.label)}</button>`).join("");
    layout();
    // Pictures load after the first fit: fit again once they have a size.
    shadow.querySelectorAll("img").forEach((img) => { if (!img.complete) img.addEventListener("load", () => applyZoom(), { once: true }); });
  };

  const show = (src, sheetId) => {
    st.src = src;
    root.classList.remove("is-empty");
    st.doc = src.doc();
    st.sheets = projectorSheets(src.kind, st.doc, { schoolName: prefs.schoolName || "" });
    st.sheet = st.sheets.some((s) => s.id === sheetId) ? sheetId : firstSheet(src.kind, st.doc);
    q(".pj-title strong").textContent = src.title;
    q(".pj-title small").textContent = `${PROJECTOR_KINDS[src.kind].label}${src.sub ? ` · ${src.sub}` : ""}`;
    q(".pj-source-ico").innerHTML = icon(PROJECTOR_KINDS[src.kind].icon);
    q(".pj-source").dataset.kind = src.kind;
    render();
  };

  /* ── The chooser: what is open now, and everything in the Library ── */
  const picker = q(".pj-picker");
  let pickerQuery = "";
  const pickerList = () => {
    const openNow = openSources();
    const openIds = new Set(openNow.map((s) => `${s.kind}:${s.id}`));
    const lib = librarySources().filter((s) => !openIds.has(`${s.kind}:${s.id}`));
    const match = (s) => !pickerQuery || `${s.title} ${s.sub}`.toLowerCase().includes(pickerQuery);
    const row = (s) => `<button type="button" class="pj-pick${st.src && s.kind === st.src.kind && s.id === st.src.id ? " current" : ""}" data-pick="${esc(`${s.kind}:${s.id}`)}" data-kind="${s.kind}">
        <span class="pj-pick-ico">${icon(PROJECTOR_KINDS[s.kind].icon)}</span>
        <span class="pj-pick-text"><b>${esc(s.title)}</b><small>${esc([PROJECTOR_KINDS[s.kind].label, s.sub, s.open ? "open now" : s.savedAt ? timeAgo(s.savedAt) : ""].filter(Boolean).join(" · "))}</small></span>
      </button>`;
    const a = openNow.filter(match);
    const b = lib.filter(match).slice(0, 40);
    return { all: [...openNow, ...lib], html: `${a.length ? `<h4>Open now</h4>${a.map(row).join("")}` : ""}${b.length ? `<h4>From your Library</h4>${b.map(row).join("")}` : ""}${!a.length && !b.length ? `<p class="pj-pick-empty">${pickerQuery ? "Nothing matches." : "Nothing made yet — a worksheet unit, a test or a dictation shows here."}</p>` : ""}` };
  };
  let pickerItems = [];
  const drawPicker = () => {
    const { all, html } = pickerList();
    pickerItems = all;
    picker.querySelector(".pj-pick-list").innerHTML = html;
  };
  const openPicker = () => {
    picker.innerHTML = `<div class="pj-pick-card">
        <div class="pj-pick-head"><b>What to show</b>${st.src ? `<button type="button" class="pj-icon" data-pick-close aria-label="Close">${icon("x")}</button>` : ""}</div>
        <label class="pj-pick-search">${icon("search", "i-sm")}<input type="search" placeholder="Search tests, units, dictations…" value="${esc(pickerQuery)}" autocomplete="off"></label>
        <div class="pj-pick-list"></div>
      </div>`;
    drawPicker();
    picker.classList.remove("hidden");
    picker.querySelector("input").addEventListener("input", (e) => { pickerQuery = e.target.value.trim().toLowerCase(); drawPicker(); });
    setTimeout(() => picker.querySelector("input")?.focus(), 30);
  };
  const closePicker = () => { if (!st.src) return; picker.classList.add("hidden"); };
  picker.addEventListener("click", (e) => {
    if (e.target === picker || e.target.closest("[data-pick-close]")) { closePicker(); return; }
    const b = e.target.closest("[data-pick]");
    if (!b) return;
    const s = pickerItems.find((x) => `${x.kind}:${x.id}` === b.dataset.pick);
    if (!s) return;
    play("tap");
    picker.classList.add("hidden");
    show(s);
  });

  /* ── Pictures ── */
  const viewer = q(".pj-viewer");
  const visiblePics = () => [...shadow.querySelectorAll("img.pj-pic")].filter((img) => !img.closest(".pj-off") && img.getAttribute("src"));
  const showPic = (i) => {
    st.pics = visiblePics();
    if (!st.pics.length) return;
    st.pic = (i + st.pics.length) % st.pics.length;
    const img = st.pics[st.pic];
    viewer.querySelector("img").src = img.currentSrc || img.src;
    // The number of the line or card the picture belongs to — never its word (that may be the answer).
    const card = img.closest(".pic-card, .ex-item, .st-story-pic, .st-speak-card, .st-mind-pic");
    const num = card?.querySelector(":scope > .item-num, small")?.textContent?.trim();
    viewer.querySelector("figcaption").textContent = `${num ? `${/^\d+$/.test(num) ? "No. " : ""}${num} · ` : ""}Picture ${st.pic + 1} of ${st.pics.length}`;
    viewer.querySelectorAll(".pj-viewer-nav").forEach((b) => b.classList.toggle("hidden", st.pics.length < 2));
    viewer.classList.remove("hidden");
  };
  const closePic = () => { viewer.classList.add("hidden"); st.pic = -1; };
  viewer.addEventListener("click", (e) => {
    const nav = e.target.closest("[data-pic]");
    if (nav) { play("tap"); showPic(st.pic + Number(nav.dataset.pic)); return; }
    if (e.target.closest("[data-pic-close]") || !e.target.closest("figure")) closePic();
  });

  /* ── Blank screen ── */
  const setBlank = (on) => { st.blank = on; q(".pj-blank").classList.toggle("hidden", !on); };
  q(".pj-blank").addEventListener("click", () => setBlank(false));

  /* ── The bar ── */
  q("[data-source]").addEventListener("click", () => { play("tap"); openPicker(); });
  q(".pj-tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-sheet]");
    if (!b || b.dataset.sheet === st.sheet) return;
    play("tap");
    st.sheet = b.dataset.sheet;
    render();
  });
  root.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
    if (st.mode === b.dataset.mode) return;
    play("tap");
    // Focus starts at the part the teacher was looking at.
    if (b.dataset.mode === "focus") {
      const top = stage.getBoundingClientRect().top + 80;
      const k = st.slides.findIndex((s) => s.el.getBoundingClientRect().bottom > top);
      st.slide = Math.max(0, k);
    }
    st.mode = b.dataset.mode;
    savePrefs();
    layout();
    if (st.mode === "paper") st.slides[st.slide]?.el.scrollIntoView({ block: "start" });
  }));
  q("[data-reveal]").addEventListener("click", () => {
    const list = hosts();
    const all = list.every((n) => n.classList.contains("revealed"));
    list.forEach((n) => n.classList.toggle("revealed", !all));
    play(all ? "back" : "whoosh");
    markNext();
  });
  const zoomBy = (d) => {
    st.zoom[st.mode] = d === 0 ? 1 : Math.max(0.5, Math.min(2.5, Math.round((st.zoom[st.mode] + d * 0.1) * 10) / 10));
    savePrefs();
    applyZoom();
  };
  root.querySelectorAll("[data-zoom]").forEach((b) => b.addEventListener("click", () => zoomBy(Number(b.dataset.zoom))));
  q("[data-blank]").addEventListener("click", () => setBlank(true));
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else root.requestFullscreen?.().catch(() => {});
  };
  q("[data-full]").addEventListener("click", toggleFull);
  q(".pj-nav").addEventListener("click", (e) => {
    const s = e.target.closest("[data-step]");
    if (s) { go(Number(s.dataset.step)); return; }
    const d = e.target.closest("[data-dot]");
    if (d) { const to = Number(d.dataset.dot); if (to !== st.slide) { play("tap"); st.slide = to; layout(); } }
  });

  /* ── The paper: tap a line, tap a picture ── */
  shadow.addEventListener("click", (e) => {
    const path = e.composedPath();
    const img = path.find((n) => n.classList?.contains("pj-pic"));
    if (img) { e.stopPropagation(); play("tap"); showPic(visiblePics().indexOf(img)); return; }
    const host = path.find((n) => n.classList?.contains("pj"));
    if (host) { play(host.classList.toggle("revealed") ? "pop" : "tap"); markNext(); }
  });

  /* ── Keys ── */
  const typing = (e) => e.target?.closest?.("input, textarea, select");
  const onKey = (e) => {
    if (e.key === "Escape") {
      e.preventDefault(); e.stopPropagation();
      if (!viewer.classList.contains("hidden")) closePic();
      else if (st.blank) setBlank(false);
      else if (!picker.classList.contains("hidden") && st.src) closePicker();
      else close();
      return;
    }
    if (!picker.classList.contains("hidden") || typing(e)) return;
    if (!viewer.classList.contains("hidden")) {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); showPic(st.pic + (e.key === "ArrowRight" ? 1 : -1)); }
      return;
    }
    if (st.blank) { if (/^[bB.]$/.test(e.key) || e.key === " ") { e.preventDefault(); setBlank(false); } return; }
    const k = e.key;
    if (k === "b" || k === "B" || k === ".") { e.preventDefault(); setBlank(true); return; }
    if (k === "f" || k === "F") { e.preventDefault(); toggleFull(); return; }
    if (k === "+" || k === "=") { e.preventDefault(); zoomBy(1); return; }
    if (k === "-" || k === "_") { e.preventDefault(); zoomBy(-1); return; }
    if (k === "0") { e.preventDefault(); zoomBy(0); return; }
    if (k === "r" || k === "R") { e.preventDefault(); q("[data-reveal]").click(); return; }
    const reveal = sheetInfo()?.reveal;
    if (k === " " || k === "Enter") {
      e.preventDefault();
      // In Focus, when this part's answers are all shown, Space moves on to the next part.
      if (!(reveal && revealNext()) && st.mode === "focus") go(1);
      return;
    }
    if (k === "ArrowRight" || k === "PageDown" || k === "ArrowDown" && st.mode === "focus") {
      if (st.mode === "focus") { e.preventDefault(); go(1); } else if (k === "ArrowRight" && reveal) { e.preventDefault(); revealNext(); }
      return;
    }
    if (k === "ArrowLeft" || k === "PageUp" || k === "ArrowUp" && st.mode === "focus") {
      if (st.mode === "focus") { e.preventDefault(); go(-1); } else if (k === "ArrowLeft" && reveal) { e.preventDefault(); hideLast(); }
      return;
    }
    if (k === "Home" && st.mode === "focus") { e.preventDefault(); st.slide = 0; layout(); }
    if (k === "End" && st.mode === "focus") { e.preventDefault(); st.slide = st.slides.length - 1; layout(); }
  };
  window.addEventListener("keydown", onKey, true);
  let resizeTimer = 0;
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(applyZoom, 120); };
  window.addEventListener("resize", onResize);
  document.addEventListener("fullscreenchange", onResize);

  const close = () => {
    if (!open) return;
    open = null;
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("fullscreenchange", onResize);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    root.classList.add("closing");
    play("close");
    setTimeout(() => root.remove(), 200);
  };
  q("[data-exit]").addEventListener("click", close);
  open = { close };
  if (initial) show(initial);
  else { root.classList.add("is-empty"); openPicker(); }
  play("launch");
}

export function isProjectorOpen() { return !!open; }
