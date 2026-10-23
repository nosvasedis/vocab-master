/* ══════════════════════════════════════════════════════════════════
   Vocab Master — app shell: boot, navigation, top bar, sidebar, shortcuts.
   ══════════════════════════════════════════════════════════════════ */
import { desktop, hydrateStorage, applyProvider, isAiReady, getChatGPT, getProvider, PROVIDERS, readJSON } from "./bridge.js";
import { initSync } from "./sync/index.js";
import { askMerge } from "./sync/account-ui.js";
import * as engine from "../app.js";
import {
  CLASS_PROFILES, CPP_BOOKS, getSavedSession, normalizeWorksheetExercises,
  validateWorksheet, saveWorksheetSession, lookupCoursebookWord, splitEmojiText,
} from "../app.js";
import { $, $$, esc, icon, plural, toast, confirmDialog, closeTopDialog, hasOpenDialog } from "./ui.js";
import {
  state, prefs, savePrefs, soundPrefs, emit, on, loadDraft, flushDraft, resetState, applyForm, filledWords,
  bookTitle, unitNumber, pageRange, isCpp, LEVEL_COLORS, BOOK_COLORS, coursebookQuery, pickFromQuery,
} from "./state.js";
import { actions } from "./actions.js";
import { registerMaker, closeMade, deleteMade, reconcile, makerActsHtml, SAVES_KEY, DOCS_KEY } from "./made.js";
import { initSetup, loadPoolWords, validateSetup, renderSetup, highlightSetupGap } from "./views/setup.js";
import { initWords, renderWords } from "./views/words.js";
import { initExercises, enterExercises, runGenerate } from "./views/exercises.js";
import { initPreview, renderPreview, printSheet } from "./views/preview.js";
import { initLibrary, renderLibrary, updateLibraryCount } from "./views/library.js";
import { openProjector, isProjectorOpen } from "./views/projector.js";
import { openSettings, openHelp, applyTheme } from "./dialogs.js";
import { openArcade, isArcadeOpen } from "../arcade/arcade.js";
import { buildArcadeDeck } from "../arcade/deck.js";
import { configureAudio, play } from "../arcade/audio.js";
import { initInterfaceSounds } from "./sound-ui.js";
import { initVoice } from "../arcade/voice.js";
import { ensurePictureStyle, pictureSvg } from "./pictures.js";
import { initPics, picImg } from "./pics.js";
import { initLessons, renderLessons, lessonsToast } from "./views/lessons.js";
import { openLesson, isLessonOpen, loadLesson, lessonWords, lessonDeck, lessonLiveChecks, bookLabel } from "../lesson/lesson.js";
import { STUDIO_VIEWS, initStudio } from "./views/studio-views.js";
import { initHome, renderHome } from "./views/home.js";
import { initUpdates } from "./updates.js";

const FLOW = ["setup", "words", "exercises", "preview"];
const VIEW_META = {
  home: { title: "Home", sub: "Your teaching studio: make something, pick up where you left off, or take it to class." },
  setup: { title: "Worksheets", sub: "A Lingo Launcher and a Dictation sheet for one unit — step 1: the class and the unit." },
  words: { title: "Worksheets", sub: "Step 2: the words — check them, and let Lingo add the Greek, phrases and word families." },
  exercises: { title: "Worksheets", sub: "Step 3: the exercises — a smart mix or your own choice, then Lingo writes the sheets." },
  preview: { title: "Worksheets", sub: "Step 4: your sheets — click any line to edit it, then print, export or take it to class." },
  library: { title: "Library", sub: "Every worksheet, test and dictation you make — open, search or back up." },
  lessons: { title: "Lessons", sub: "Curated, animated and voiced lessons for every unit. Teach them on the projector." },
  ...Object.fromEntries(Object.entries(STUDIO_VIEWS).map(([k, v]) => [k, { title: v.title, sub: v.sub }])),
};

/* ── Navigation ──────────────────────────────────────────────────── */
let lastFlow = "setup";

function go(view, { force = false, silent = false } = {}) {
  // "Worksheets" in the sidebar opens the step the teacher was last on.
  if (view === "worksheets") view = lastFlow;
  if (!VIEW_META[view]) view = "home";
  const idx = FLOW.indexOf(view);
  if (!force && idx >= 1) {
    const err = validateSetup();
    if (err) {
      if (!silent) { toast(err, "warn"); setTimeout(highlightSetupGap, 60); }
      view = "setup";
    }
  }
  if (!force && view === "preview" && !state.data) {
    if (!silent) toast("Generate the worksheets first — or open a unit from the Library.", "info");
    view = "exercises";
  }
  const from = state.view;
  if (!silent && from !== view) {
    const order = ["home", ...FLOW, ...Object.keys(STUDIO_VIEWS), "lessons", "library"];
    play(order.indexOf(view) < order.indexOf(from) ? "navBack" : "nav");
  }
  state.view = view;
  if (FLOW.includes(view)) lastFlow = view;
  $$(".view").forEach((v) => v.classList.toggle("active", v.dataset.view === view));
  $("scroller").scrollTo({ top: 0, behavior: "instant" });
  if (view === "setup") renderSetup();
  if (view === "words") renderWords();
  if (view === "exercises") enterExercises();
  if (view === "preview") renderPreview();
  if (view === "library") renderLibrary();
  if (view === "lessons") renderLessons();
  if (view === "home") renderHome();
  STUDIO_VIEWS[view]?.render();
  renderChrome();
  emit("view");
}

/* ── Sidebar: pinned open, or a slim rail that slides open while the mouse is over it ── */
let sbTimer = 0;
const narrow = window.matchMedia("(max-width: 1100px)");
function applySidebar() {
  const rail = !prefs.sidebarPinned || narrow.matches;
  $("app").classList.toggle("sb-rail", rail);
  $("sbPin").setAttribute("aria-pressed", String(!!prefs.sidebarPinned));
  $("sbPin").dataset.tip = prefs.sidebarPinned ? "Let the sidebar tuck away (Ctrl+B)" : "Keep the sidebar open (Ctrl+B)";
  if (!rail) $("sidebar").classList.remove("peek");
}
function toggleSidebarPin() {
  prefs.sidebarPinned = !prefs.sidebarPinned;
  savePrefs();
  play(prefs.sidebarPinned ? "press" : "close");
  applySidebar();
}
function initSidebar() {
  if (prefs.sidebarPinned === undefined) prefs.sidebarPinned = false;
  const sb = $("sidebar");
  const peek = (on, ms) => {
    clearTimeout(sbTimer);
    sbTimer = setTimeout(() => { if ($("app").classList.contains("sb-rail")) sb.classList.toggle("peek", on); }, ms);
  };
  // Opens after a short rest on the rail (a mouse passing by doesn't open it); closes a moment after leaving.
  sb.addEventListener("mouseenter", () => peek(true, 140));
  sb.addEventListener("mouseleave", () => peek(false, 260));
  sb.addEventListener("focusin", () => peek(true, 0));
  sb.addEventListener("focusout", (e) => { if (!sb.contains(e.relatedTarget)) peek(false, 120); });
  // A click in the sidebar that goes somewhere tucks it away again.
  sb.addEventListener("click", (e) => { if (e.target.closest(".sb-item, .ai-card") && $("app").classList.contains("sb-rail")) peek(false, 60); });
  $("sbPin").addEventListener("click", toggleSidebarPin);
  narrow.addEventListener?.("change", applySidebar);
  applySidebar();
}

/* ── Chrome: sidebar, top bar, flow bar ──────────────────────────── */
const VIEW_ICON = { home: "home", setup: "file", words: "file", exercises: "file", preview: "file", tests: "clipboard", dictation: "mic", assistant: "sparkles", library: "library", lessons: "graduation" };
/** The Worksheets maker's steps (its header pills, like the Test Maker's). */
const WS_STEPS = [
  { view: "setup", label: "Class & unit", sub: "Level, book, words" },
  { view: "words", label: "Words", sub: "Check & enrich" },
  { view: "exercises", label: "Exercises", sub: "Plan & write" },
  { view: "preview", label: "Your sheets", sub: "Edit, print, play" },
];

function wsSummary() {
  const p = CLASS_PROFILES[state.profileId];
  return [p?.label, bookTitle() ? `${isCpp() ? `Primary Path ${state.cpp.bookId.slice(-1)}` : bookTitle()}${unitNumber() ? ` · Unit ${unitNumber()}` : ""}` : "", state.inputMode === "freeform" ? "a description" : filledWords().length ? plural(filledWords().length, "word") : ""].filter(Boolean).join(" · ") || "Lingo Launcher + Dictation";
}

/** The Worksheets header: brand, what the unit is, the four steps, New unit. */
function renderWorksheetsTop(view) {
  const idx = FLOW.indexOf(view);
  const html = `<div class="mk-brand"><span class="mk-badge">${icon("file")}</span><div><b>Worksheets</b><span>${esc(wsSummary())}</span></div></div>
    <nav class="mk-steps" aria-label="Steps">${WS_STEPS.map((st, i) => {
      const locked = st.view === "preview" && !state.data;
      const done = i !== idx && stepDone(st.view);
      return `${i ? `<i class="mk-sep" aria-hidden="true"></i>` : ""}<button type="button" class="mk-pill${i === idx ? " active" : ""}${done ? " done" : ""}" data-goto="${st.view}"${i === idx ? ` aria-current="step"` : ""}${locked ? ` disabled title="Generate the worksheets first"` : ""}><span class="mk-pill-n"><span>${i + 1}</span>${icon("check", "i-xs")}</span><span class="mk-pill-t"><b>${st.label}</b><small>${st.sub}</small></span></button>`;
    }).join("")}</nav>
    <div class="mk-acts">${makerActsHtml("unit", { open: !!(state.data && state.sessionId), draft: !state.data && (filledWords().length > 0 || !!state.freeform.trim()) })}</div>`;
  $$("[data-ws-top]").forEach((el) => { if (el.closest(".view")?.dataset.view === view) el.innerHTML = html; else el.innerHTML = ""; });
}

function stepDone(step) {
  if (step === "setup") return !validateSetup();
  if (step === "words") return state.inputMode === "freeform" ? state.freeform.trim().length > 10 : filledWords().length > 0;
  if (step === "exercises") return !!state.data;
  return false;
}

function renderChrome() {
  const view = state.view;
  const meta = VIEW_META[view];
  $("pageTitle").textContent = meta.title;
  $("pageIco").innerHTML = icon(VIEW_ICON[view] || "home");
  $("pageIco").dataset.view = FLOW.includes(view) ? "worksheets" : view;
  document.querySelector(".tb-ask")?.classList.toggle("hidden", view === "assistant");
  $("pageSub").textContent = meta.sub;

  const inFlow = FLOW.includes(view);
  $$(".sb-item[data-nav]").forEach((b) => b.classList.toggle("active", b.dataset.nav === view || (inFlow && b.dataset.nav === "worksheets")));
  if (inFlow) renderWorksheetsTop(view);
  $("navSub-worksheets").textContent = state.data ? `${bookTitle() || "Your unit"}${unitNumber() ? ` · Unit ${unitNumber()}` : ""} · ready` : filledWords().length ? `${plural(filledWords().length, "word")} · in progress` : "Lingo Launcher + Dictation";
  const p = CLASS_PROFILES[state.profileId];
  document.querySelector('.sb-item[data-action="open-projector"]').disabled = !state.data;


  // Flow bar
  const idx = FLOW.indexOf(view);
  $("flowbar").classList.toggle("hidden", idx < 0);
  if (idx >= 0) {
    const facts = [
      p ? p.label : "",
      state.inputMode === "freeform" ? "described unit" : filledWords().length ? plural(filledWords().length, "word") : "",
      state.plan?.dictationExerciseCount ? `${state.plan.dictationExerciseCount} + ${state.plan.lingoPracticeCount} exercises` : "",
      state.data ? "sheets ready" : "",
    ].filter(Boolean);
    $("flowDots").innerHTML = `<span class="ws-dots">${FLOW.map((s, i) => `<span class="${i === idx ? "active" : i < idx || stepDone(s) ? "done" : ""}"></span>`).join("")}</span><span class="ws-foot-t"><b>Step ${idx + 1} of ${FLOW.length}</b>${facts.length ? ` · ${esc(facts.join(" · "))}` : ""}</span>`;
    $("flowBack").style.visibility = idx === 0 ? "hidden" : "visible";
    $("flowBack").querySelector("span").textContent = idx > 0 ? WS_STEPS[idx - 1].label : "";
    const next = $("flowNext");
    const label = {
      setup: "Continue to vocabulary",
      words: "Continue to exercises",
      exercises: state.data ? "Open the preview" : "Generate worksheets",
      preview: "Play classroom games",
    }[view];
    next.querySelector("span").textContent = label;
    next.className = `btn ${view === "exercises" && !state.data ? "btn-magic" : view === "preview" ? "btn-accent" : "btn-primary"}`;
    next.disabled = view === "exercises" && state.busy;
  }
}

function flowNext() {
  const view = state.view;
  if (view === "setup") go("words");
  else if (view === "words") go("exercises");
  else if (view === "exercises") { if (state.data) go("preview"); else runGenerate("full"); }
  else if (view === "preview") worksheetGames();
}

function flowBack() {
  const i = FLOW.indexOf(state.view);
  if (i > 0) go(FLOW[i - 1]);
}

/* ── AI status ───────────────────────────────────────────────────── */
let aiState = "auto";
function setAiState(next = "auto", message = "") {
  if (next === "busy" && aiState !== "busy") play("aiStart");
  else if (aiState === "busy" && next === "error") play("error");
  else if (aiState === "busy" && next !== "busy") play("aiDone");
  aiState = next;
  const dot = $("aiDot");
  const hasKey = isAiReady();
  let cls = hasKey ? "on" : "off";
  let title = hasKey ? "AI ready" : "AI not connected";
  const providerName = PROVIDERS[getProvider()].name;
  let sub = hasKey ? `${providerName} key saved` : `Add a ${providerName} key`;
  if (getProvider() === "chatgpt") {
    const session = getChatGPT();
    const model = session.models.find((m) => m.slug === session.model);
    sub = hasKey ? `Using ChatGPT plan${model?.name || session.model ? ` · ${model?.name || session.model}` : ""}` : session.connected && !session.sharing ? "Allow ChatGPT plan usage in Settings" : "Connect ChatGPT and choose a model";
  }
  if (next === "busy") { cls = "busy"; title = "AI is working…"; sub = "This can take a minute"; }
  if (next === "error") { cls = "error"; title = "Last AI request failed"; sub = message || "Check your connection in Settings"; }
  dot.className = `ai-dot ${cls}`;
  $("aiTitle").textContent = title;
  $("aiSub").textContent = sub;
  $("aiStatusCard").title = message || sub;
}
window.addEventListener("chatgpt-state", () => { if (getProvider() === "chatgpt" && $("aiDot")) setAiState(aiState); });

/* ── Units, new unit, games ──────────────────────────────────────── */
/** Open a complete unit ({ form, data, plan }) in the preview and save it (used by the desktop self-test). */
function openUnit({ form, data, plan }) {
  applyForm(form, plan);
  state.data = normalizeWorksheetExercises(JSON.parse(JSON.stringify(data)));
  state.plan = plan;
  state.sessionId = null;
  try {
    state.sessionId = saveWorksheetSession(form, state.data, state.plan, { validation: validateWorksheet(state.data) });
  } catch { /* storage unavailable */ }
  emit("setup", "words", "level", "data", "library");
  go("preview", { force: true });
}

/** The Worksheets maker in js/made.js: the open unit is state.data + state.sessionId. */
function registerWorksheets() {
  registerMaker("unit", {
    openId: () => (state.data && state.sessionId) || null,
    open(id) {
      const s = getSavedSession(id);
      if (!s) return false;
      applyForm(s.form || {}, s.plan || null);
      state.data = normalizeWorksheetExercises(JSON.parse(JSON.stringify(s.data)));
      state.plan = s.plan || state.plan;
      state.sessionId = s.id;
      emit("setup", "words", "level", "data");
      return true;
    },
    // Closed (deleted here or on another computer): the unit's words and sheets go, the class and book stay.
    close() {
      const view = state.view;
      resetState();
      state.view = view;
      emit("setup", "words", "data", "level");
      lastFlow = "setup";
      if (FLOW.includes(view)) go("setup", { force: true, silent: true });
    },
    busy: () => state.busy,
    // A word list that hasn't become worksheets yet is in no library entry.
    unsaved: () => !state.data && filledWords().length > 0,
  });
}

/** Ctrl+N, the header's Close / Start over, Home's "New unit": an open unit is closed (it stays in the
 *  Library); a word list that isn't worksheets yet is cleared after asking. Then Step 1. */
async function newUnit() {
  if (state.busy) { toast("Please wait for the AI to finish first.", "warn"); return; }
  if (state.data && state.sessionId) {
    closeMade("unit");
    go("setup", { force: true });
    return;
  }
  if (filledWords().length > 0 || state.freeform.trim()) {
    const ok = await confirmDialog({
      title: "Start over?",
      body: "This word list hasn't been turned into worksheets yet, so it isn't in your library. Clear it?",
      okLabel: "Clear and start over",
      tone: "brand",
      iconName: "refresh",
    });
    if (!ok) return;
    toast("Word list cleared.", "info", { ms: 2400 });
  }
  // A new unit starts with no words: they load only when the teacher picks them (Step 1 or "Load unit words").
  resetState();
  emit("setup", "words", "data", "level", "library");
  go("setup", { force: true });
}

function deckContext() {
  // Word-bank emojis are mostly generic fillers; games only get the trusted ones.
  const trusted = (row) => (row ? { ...row, emojis: engine.trustedBankEmoji(row) } : row);
  const lookup = (eng) => trusted(lookupCoursebookWord(eng, bookTitle(), unitNumber()));
  const label = `${bookTitle() || "Your unit"}${unitNumber() ? ` · Unit ${unitNumber()}` : ""}`;
  // Step 2 rows saved before the emoji fix may still hold the bank's filler for that word.
  const words = filledWords().map((w) => (engine.isJunkBankEmoji(w.english, w.emojis) ? { ...w, emojis: "" } : w));
  if (words.length >= 3) return { deck: buildArcadeDeck(words, lookup), title: label };
  const vocab = state.data?.lingoLauncher?.vocabulary || [];
  if (vocab.length >= 3) return { deck: buildArcadeDeck(vocab, lookup), title: label };
  if (isCpp()) {
    const picked = pickFromQuery(coursebookQuery()).map(trusted);
    if (picked.length >= 3) return { deck: buildArcadeDeck(picked, lookup), title: `${CPP_BOOKS[state.cpp.bookId].title} · Unit ${state.cpp.unit}` };
  }
  return null;
}

/** Draw a word's emojis in the chosen picture style (games and lessons use the same style as the worksheets).
 *  Picture-set tokens ("@w-house", js/pics.js) become illustrations in every style except "No pictures".
 *  keepText: also keep (escaped) the non-emoji text around the pictures. */
function picture(text, keepText = false) {
  const style = prefs.pictureStyle || "emoji";
  const str = String(text || "");
  if (str.includes("@")) {
    return str.split(/(@(?:w|c|ui)-[a-z0-9][a-z0-9-]*)/).map((part, i) => (i % 2 ? (style === "none" ? "" : picImg(part.slice(1))) : picture(part, keepText))).join("").trim();
  }
  return splitEmojiText(str).map((p) => {
    if (!p.emoji) return keepText ? esc(p.text) : "";
    if (style === "none") return "";
    if (style === "emoji" || style === "pictures") return esc(p.text);
    return pictureSvg(p.text, style) || "";
  }).join("").trim();
}

const savePlayPrefs = ({ sfx, tts }) => { prefs.sfx = sfx; prefs.tts = tts; savePrefs(); };
/** Lingo Arcade on its own (sidebar, Home): its own remembered words, chosen inside the arcade. */
function openGames() {
  openDeck([], "Choose your words", { standalone: true });
}

/** "Play games" on a worksheet unit: that unit's words. */
function worksheetGames() {
  const ctx = deckContext();
  if (!ctx) {
    toast("This worksheet unit needs at least 3 words first.", "info", { actions: [{ label: "Add words", run: () => go("words") }] });
    return;
  }
  openDeck(ctx.deck, ctx.title);
}

function openDeck(deck, title, { standalone = false, checks = null, start = "" } = {}) {
  // "Choose your words" in the arcade picks coursebook rows; they get the same trusted pictures as a worksheet's words.
  const buildDeck = (rows) => buildArcadeDeck(rows.map((row) => ({ ...row, emojis: engine.trustedBankEmoji(row) })));
  openArcade({ deck, title, prefs: { sfx: prefs.sfx, tts: prefs.tts }, picture, onPrefs: savePlayPrefs, buildDeck, standalone, checks, start });
}

/** Teach a curated lesson in the full-screen player. */
function teachLesson(id) {
  openLesson(id, {
    picture,
    prefs: { sfx: prefs.sfx, tts: prefs.tts },
    onPrefs: savePlayPrefs,
    calm: !!prefs.calmMotion,
    onPlayGames: (deck, title) => openDeck(deck, title),
    onLiveQuiz: (deck, title, checks) => openDeck(deck, title, { checks, start: "live" }),
  }).catch(lessonsToast);
}

/** "Live quiz" on a lesson: Lingo Live with the lesson's check questions (phones or answer cards). */
async function lessonLive(id) {
  try {
    const lesson = await loadLesson(id);
    const words = lessonWords(lesson);
    openDeck(lessonDeck(words), `${bookLabel(lesson)} · ${lesson.title}`, { checks: lessonLiveChecks(lesson, words), start: "live" });
  } catch (e) { lessonsToast(e); }
}

async function lessonGames(id) {
  try {
    const lesson = await loadLesson(id);
    openDeck(lessonDeck(lessonWords(lesson)), `${bookLabel(lesson)} · ${lesson.title}`);
  } catch (e) { lessonsToast(e); }
}

/* ── Wiring ──────────────────────────────────────────────────────── */
function wire() {
  $$(".sb-item[data-nav]").forEach((b) => b.addEventListener("click", () => go(b.dataset.nav)));
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-action]");
    if (a?.dataset.action === "open-arcade") openGames();
    if (a?.dataset.action === "ws-games") worksheetGames();
    if (a?.dataset.action === "open-projector") openProjector();
    const g = e.target.closest("[data-goto]");
    if (g) go(g.dataset.goto);
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-ws-top] [data-mk-close]")) newUnit();
    if (e.target.closest("[data-ws-top] [data-mk-del]") && state.sessionId) deleteMade("unit", state.sessionId);
  });
  initSidebar();
  $("btnSettings").addEventListener("click", () => openSettings());
  $("aiStatusCard").addEventListener("click", () => openSettings());
  $("btnHelp").addEventListener("click", openHelp);
  $("btnTheme").addEventListener("click", () => {
    prefs.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    play(prefs.theme === "dark" ? "themeDark" : "themeLight");
    savePrefs();
    applyTheme();
  });
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => { if (prefs.theme === "system") applyTheme(); });
  $("flowNext").addEventListener("click", flowNext);
  $("flowBack").addEventListener("click", flowBack);

  window.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || isArcadeOpen() || isProjectorOpen() || isLessonOpen()) return;
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if (e.key === "Escape" && hasOpenDialog()) { e.preventDefault(); closeTopDialog(); return; }
    if (hasOpenDialog()) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); toggleSidebarPin(); return; }
    if (mod && e.key.toLowerCase() === "n") { e.preventDefault(); newUnit(); return; }
    if (mod && e.key.toLowerCase() === "p") { e.preventDefault(); printSheet(); return; }
    if (mod && e.key === "Enter") { e.preventDefault(); flowNext(); return; }
    if (e.altKey && /^[1-4]$/.test(e.key)) { e.preventDefault(); go(FLOW[Number(e.key) - 1]); return; }
    if (e.key === "?" && !typing) { e.preventDefault(); openHelp(); }
  });

  const d = desktop();
  d?.onMenu?.((action) => {
    if (action === "new") newUnit();
    if (action === "print") printSheet();
  });
  d?.onDownloadDone?.(({ state: st, filename, path: savedAt }) => {
    if (st === "completed") toast(`Saved ${filename}.`, "ok", { actions: savedAt && d.showItemInFolder ? [{ label: "Show in folder", run: () => d.showItemInFolder(savedAt) }] : [] });
    else if (st === "interrupted") toast(`Saving ${filename} was interrupted.`, "error");
  });
  window.addEventListener("beforeunload", flushDraft);

  on("*", () => renderChrome());
}

/* ── Account sync (js/sync/) ─────────────────────────────────────── */
async function startSync() {
  try {
    await initSync({ askMerge });
  } catch (err) {
    console.error("sync start failed", err?.message || err); // the app works without it
  }
  // Settings are read once at start; take the synced copy, and keep it fresh when another computer changes it.
  Object.assign(prefs, readJSON("vm_prefs_v2", {}));
  window.addEventListener("vm-sync-changed", (e) => {
    const keys = e.detail?.keys || [];
    if (keys.includes("vm_prefs_v2")) { Object.assign(prefs, readJSON("vm_prefs_v2", {})); applyTheme(); configureAudio(soundPrefs()); }
    // Worksheets, tests or dictations changed on another computer: a maker whose open item was deleted there is emptied.
    if (keys.includes(SAVES_KEY) || keys.includes(DOCS_KEY)) { reconcile({ remote: true }); emit("library"); }
    // The AI service chosen on another computer: the engine must use it too (not only the status card).
    if (keys.includes("vm_ai_provider")) void applyProvider().finally(() => setAiState());
    else if (keys.some((k) => k === "lingo_maker_api_key" || k === "vm_gemini_api_key")) setAiState();
  });
}

/* ── Boot ────────────────────────────────────────────────────────── */
async function boot() {
  try {
    const splash = window.__splash || { step() {}, done() {} };
    splash.step("Loading your units…", 18);
    await hydrateStorage();
    splash.step("Syncing your account…", 38);
    await startSync();
    applyTheme();
    splash.step("Preparing pictures and sounds…", 62);
    configureAudio(soundPrefs());
    await Promise.all([ensurePictureStyle(prefs.pictureStyle), initPics()]);
    initVoice();
    splash.step("Setting up your screens…", 82);

    loadDraft();
    if (state.sessionId) {
      const s = getSavedSession(state.sessionId);
      if (s) state.data = normalizeWorksheetExercises(JSON.parse(JSON.stringify(s.data)));
      else state.sessionId = null;
    }
    registerWorksheets();

    Object.assign(actions, { go, openSettings, openArcade: openGames, openProjector, setAiState, settingsSaved: async () => { await ensurePictureStyle(prefs.pictureStyle); if (state.view === "preview") renderPreview(); } });
    initSetup();
    initWords();
    initExercises();
    initPreview();
    initLibrary();
    initLessons({ teach: teachLesson, games: lessonGames, live: lessonLive });
    initStudio();
    initHome({ newUnit, openGames, worksheetGames });
    initInterfaceSounds();
    wire();
    // The pages started: tell the main process (a broken update is rolled back), and greet an update.
    initUpdates();

    const d = desktop();
    if (d) {
      const info = await d.info().catch(() => null);
      $("appVersion").textContent = info ? `v${info.version}` : "";
    } else {
      const info = await fetch("/app-info").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      $("appVersion").textContent = info?.version ? `v${info.version} · Web` : "Web";
    }
    setAiState();
    updateLibraryCount();
    if (FLOW.includes(state.view)) lastFlow = state.view;
    go("home", { silent: true });
    splash.done();
  } catch (err) {
    console.error(err);
    window.__splash?.done();
    const banner = document.createElement("div");
    banner.className = "callout danger";
    banner.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:999;max-width:640px";
    banner.textContent = `Vocab Master couldn't start: ${err.message}`;
    document.body.appendChild(banner);
  }
  // Hooks for the desktop smoke test.
  window.__LINGO_ENGINE__ = engine;
  window.__VM__ = { state, go, emit, openUnit, openGames, worksheetGames, openProjector, teachLesson, actions };
}

boot();
