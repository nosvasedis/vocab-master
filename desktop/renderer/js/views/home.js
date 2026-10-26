/* Home — the start screen: a greeting with "Ask Lingo" (hands the request to the assistant), the four makers,
 * what the teacher was last working on (the worksheet unit, recent tests, dictations and saved units),
 * and what to do in class. Everything shown is read from what is already saved; nothing is fetched. */
import { CLASS_PROFILES, CPP_BOOKS, getAllSavedSessions } from "../../app.js";
import { state, filledWords, bookTitle, unitNumber, isCpp, LEVEL_COLORS, on } from "../state.js";
import { isAiReady } from "../bridge.js";
import { actions } from "../actions.js";
import { $, esc, icon, plural } from "../ui.js";
import { owl, recentDocs } from "./studio-common.js";
import { askAssistant } from "./assistant.js";
import { openMade, isOpen } from "../made.js";
import { projectorHasContent } from "./projector.js";

let built = false;
let hooks = { newUnit: () => {}, openGames: () => {}, worksheetGames: () => {} };

export function initHome(h) {
  hooks = { ...hooks, ...h };
  // Something made, opened or deleted elsewhere (an Undo, another computer): the recent list follows.
  on("library", () => { if (built && state.view === "home") renderHome(); });
}

const FLOW = [["setup", "Class & unit"], ["words", "Words"], ["exercises", "Exercises"], ["preview", "Your sheets"]];

function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return ["Working late", "Καλό βράδυ"];
  if (h < 12) return ["Good morning", "Καλημέρα"];
  if (h < 18) return ["Good afternoon", "Καλό απόγευμα"];
  return ["Good evening", "Καλό βράδυ"];
}

function currentUnit() {
  const unit = isCpp() ? `Primary Path ${state.cpp.bookId.slice(-1)} · Unit ${state.cpp.unit}` : bookTitle() ? `${bookTitle()}${unitNumber() ? ` · Unit ${unitNumber()}` : ""}` : "";
  const title = isCpp() ? CPP_BOOKS[state.cpp.bookId]?.units?.[state.cpp.unit]?.title || "" : "";
  return { unit, title };
}

/** Example requests for "Ask Lingo" (examples only: they name their own class and unit). */
function ideas() {
  return [
    "A test for B Senior, Primary Path 2 Unit 4",
    "A read-aloud dictation for A Senior, Primary Path 1 Unit 3, 8 sentences",
    "A Present Simple vs Present Continuous quiz for D Senior",
  ];
}

const when = (iso) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  const days = Math.floor((Date.now() - d.getTime()) / 864e5);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : days < 7 ? `${days} days ago` : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

function build() {
  const host = $("homeView");
  host.addEventListener("submit", (e) => {
    if (e.target.id !== "hmAsk") return;
    e.preventDefault();
    const text = $("hmAskText").value.trim();
    if (text) askAssistant(text); else actions.go("assistant");
  });
  host.addEventListener("click", (e) => {
    const b = e.target.closest("[data-hm]");
    if (!b) return;
    const [act, arg] = b.dataset.hm.split(":");
    if (act === "idea") askAssistant(b.dataset.text);
    if (act === "go") actions.go(arg);
    if (act === "new-unit") hooks.newUnit();
    if (act === "games") hooks.openGames();
    if (act === "ws-games") hooks.worksheetGames();
    if (act === "projector") actions.openProjector();
    if (act === "settings") actions.openSettings();
    if (act === "test" || act === "dictation" || act === "unit") openMade(act, arg);
  });
  built = true;
}

function makeCards() {
  const cards = [
    ["worksheets", "file", "Worksheets", "A full vocabulary unit: Lingo Launcher + Dictation sheets, from the coursebook words.", "4 calm steps", "ws"],
    ["tests", "clipboard", "Test Maker", "Listening, reading, vocabulary, grammar and writing, with version B and a teacher’s pack.", "≈ 1 minute", "test"],
    ["dictation", "mic", "Read-aloud dictation", "Classic, gapped, running, dictogloss or picture — read by you or by natural voices.", "5 styles", "dict"],
    ["assistant", "wand", "Teacher assistant", "Just say what you need, in English or Greek. Lingo plans it, you approve it.", "Ask anything", "ai"],
  ];
  return cards.map(([view, ico, title, text, tag, tone], i) => `<button type="button" class="hm-make" data-hm="go:${view}" data-tone="${tone}" style="--i:${i}">
      <span class="hm-make-ico">${icon(ico)}</span>
      <span class="hm-make-tag">${esc(tag)}</span>
      <b>${esc(title)}</b>
      <span class="hm-make-text">${esc(text)}</span>
      <span class="hm-make-go">Start ${icon("arrow-right", "i-sm")}</span>
    </button>`).join("");
}

function continueCard() {
  const words = filledWords().length;
  const p = CLASS_PROFILES[state.profileId];
  const { unit, title } = currentUnit();
  if (!words && !state.data) {
    return `<div class="hm-unit empty">
      <span class="hm-unit-ico">${icon("sparkles")}</span>
      <div><b>No worksheet unit in progress</b><span>Pick a class and a coursebook unit — the words load at once.</span></div>
      <button type="button" class="btn btn-primary btn-sm" data-hm="go:setup">Start a unit${icon("arrow-right", "i-sm")}</button>
    </div>`;
  }
  const step = state.data ? 3 : words ? 2 : 0;
  const next = state.data ? ["preview", "Open the worksheets"] : ["exercises", "Continue to exercises"];
  return `<div class="hm-unit" style="--lvl:${p ? LEVEL_COLORS[p.id] : "var(--brand)"}">
      <div class="hm-unit-top">
        ${p ? `<span class="hm-unit-lvl">${esc(p.label[0])}</span>` : ""}
        <div class="hm-unit-title"><small>Worksheet unit${p ? ` · ${esc(p.label)}` : ""}</small><b>${esc(unit || "Your unit")}</b>${title ? `<span>${esc(title)}</span>` : ""}</div>
        <span class="hm-unit-state${state.data ? " ready" : ""}">${state.data ? `${icon("check", "i-xs")}Ready` : "In progress"}</span>
      </div>
      <ol class="hm-steps">${FLOW.map(([v, l], i) => `<li class="${i < step || (i === step && state.data) ? "done" : i === step ? "now" : ""}"><button type="button" data-hm="go:${v}">${esc(l)}</button></li>`).join("")}</ol>
      <div class="hm-unit-foot">
        <span>${plural(words, "word")}</span>
        <span class="spacer"></span>
        <button type="button" class="btn btn-ghost btn-sm" data-hm="new-unit">${icon("plus", "i-sm")}New unit</button>
        ${state.data ? `<button type="button" class="btn btn-accent btn-sm" data-hm="ws-games">${icon("gamepad", "i-sm")}Play games</button>` : ""}
        <button type="button" class="btn btn-primary btn-sm" data-hm="go:${next[0]}">${esc(next[1])}${icon("arrow-right", "i-sm")}</button>
      </div>
    </div>`;
}

function recentList() {
  const docs = recentDocs().map((d) => ({
    at: d.savedAt, kind: d.kind, title: d.meta?.title || (d.kind === "test" ? "Test" : "Dictation"),
    sub: [d.meta?.subtitle, CLASS_PROFILES[d.meta?.classProfile]?.label].filter(Boolean).join(" · "),
    lvl: d.meta?.classProfile, act: `${d.kind}:${d.id}`, id: d.id,
  }));
  const units = (getAllSavedSessions() || []).slice(0, 4).map((s) => ({
    at: s.savedAt || s.updatedAt || s.createdAt, kind: "unit", title: s.label || "Worksheet unit",
    sub: [s.pageRange ? `pp. ${s.pageRange}` : "", CLASS_PROFILES[s.profileId]?.label].filter(Boolean).join(" · "),
    lvl: s.profileId, act: `unit:${s.id}`, id: s.id,
  }));
  const items = [...docs.slice(0, 6), ...units].sort((a, b) => String(b.at || "").localeCompare(String(a.at || ""))).slice(0, 6);
  if (!items.length) return `<p class="hm-none">${icon("clock", "i-sm")}Everything you make is kept here, so you can print it again any time.</p>`;
  const kindIco = { test: "clipboard", dictation: "mic", unit: "file" };
  const kindName = { test: "Test", dictation: "Dictation", unit: "Worksheets" };
  return `<div class="hm-recent">${items.map((it) => `<button type="button" class="hm-recent-row" data-hm="${esc(it.act)}" data-kind="${it.kind}">
      <span class="hm-recent-ico">${icon(kindIco[it.kind], "i-sm")}</span>
      <span class="hm-recent-text"><b>${esc(it.title)}</b><small>${esc(kindName[it.kind])}${isOpen(it.kind, it.id) ? " · open now" : ""}${it.sub ? ` · ${esc(it.sub)}` : ""}</small></span>
      ${it.lvl && LEVEL_COLORS[it.lvl] ? `<span class="hm-dot" style="background:${LEVEL_COLORS[it.lvl]}"></span>` : ""}
      <small class="hm-when">${esc(when(it.at))}</small>
    </button>`).join("")}</div>`;
}

function classCards() {
  return `
    <button type="button" class="hm-class" data-hm="go:lessons" data-tone="lesson"><span>${icon("graduation")}</span><b>Teach a lesson</b><small>Curated, animated and voiced units</small></button>
    <button type="button" class="hm-class" data-hm="games" data-tone="games"><span>${icon("gamepad")}</span><b>Lingo Arcade</b><small>Smartboard games with your words</small></button>
    <button type="button" class="hm-class" data-hm="projector" data-tone="proj" ${projectorHasContent() ? "" : "disabled"}><span>${icon("monitor")}</span><b>Projector mode</b><small>${projectorHasContent() ? "Worksheets, tests and dictations on the board" : "Make a worksheet, test or dictation first"}</small></button>
    <button type="button" class="hm-class" data-hm="go:library" data-tone="lib"><span>${icon("library")}</span><b>Library</b><small>${plural((getAllSavedSessions() || []).length + recentDocs().length, "thing", "things")} you made · backups</small></button>`;
}

export function renderHome() {
  if (!built) build();
  const [hello, el] = greeting();
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const tests = recentDocs("test").length;
  const dicts = recentDocs("dictation").length;
  const units = (getAllSavedSessions() || []).length;
  $("homeView").innerHTML = `
  <section class="hm-hero">
    <div class="hm-hero-glow" aria-hidden="true"><i></i><i></i></div>
    <div class="hm-hero-text">
      <span class="hm-date">${icon("clock", "i-xs")}${esc(today)}</span>
      <h2>${esc(hello)}! <span class="hm-el" lang="el">${esc(el)}</span></h2>
      <p>What are we making for your class today?</p>
      <form class="hm-ask" id="hmAsk">
        <span class="hm-ask-ico">${icon("sparkles")}</span>
        <input id="hmAskText" autocomplete="off" aria-label="Ask Lingo" placeholder="Ask Lingo… “a test for Unit 4, a bit easier”" />
        <button type="submit" class="btn btn-magic">Ask Lingo${icon("arrow-right", "i-sm")}</button>
      </form>
      <div class="hm-ideas">${ideas().map((t) => `<button type="button" class="hm-idea" data-hm="idea" data-text="${esc(t)}">${esc(t)}</button>`).join("")}</div>
    </div>
    <div class="hm-hero-art" aria-hidden="true">
      <div class="hm-owl">${owl()}</div>
      <span class="hm-float f1">${icon("clipboard", "i-sm")}Test Maker</span>
      <span class="hm-float f2">${icon("mic", "i-sm")}Dictation</span>
      <span class="hm-float f3">${icon("gamepad", "i-sm")}Games</span>
    </div>
  </section>

  ${isAiReady() ? "" : `<div class="hm-alert">${icon("cpu")}<div><b>Connect an AI service to write tests and worksheets</b><span>Free options work too: book sentences, lessons and games need no AI.</span></div><button type="button" class="btn btn-primary btn-sm" data-hm="settings">Open settings</button></div>`}

  <section class="hm-sec">
    <header><h3>Make something</h3><span class="hm-stats"><b>${units}</b> units · <b>${tests}</b> tests · <b>${dicts}</b> dictations made</span></header>
    <div class="hm-makes">${makeCards()}</div>
  </section>

  <div class="hm-cols">
    <section class="hm-sec">
      <header><h3>Pick up where you left off</h3></header>
      ${continueCard()}
      ${recentList()}
    </section>
    <section class="hm-sec">
      <header><h3>In class</h3></header>
      <div class="hm-classes">${classCards()}</div>
    </section>
  </div>`;
}
