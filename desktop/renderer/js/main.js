/* ══════════════════════════════════════════════════════════════════
   Vocab Master — app shell: boot, navigation, top bar, sidebar, shortcuts.
   ══════════════════════════════════════════════════════════════════ */
import { desktop, hydrateStorage, isAiReady, getChatGPT, getProvider, PROVIDERS, readJSON } from "./bridge.js";
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
import { openLesson, isLessonOpen, loadLesson, lessonWords, lessonDeck, bookLabel } from "../lesson/lesson.js";
import { STUDIO_VIEWS, initStudio } from "./views/studio-views.js";

const FLOW = ["setup", "words", "exercises", "preview"];
const VIEW_META = {
  setup: { title: "Unit setup", sub: "Choose the class level and the coursebook unit." },
  words: { title: "Vocabulary", sub: "Review the words — AI adds phrases, emojis and word families." },
  exercises: { title: "Exercises", sub: "Plan the exercise mix and let AI write the worksheets." },
  preview: { title: "Preview & export", sub: "Click any line to edit. Export, print or take it to class." },
  library: { title: "Saved units", sub: "Everything you've made — open, edit, duplicate or back up." },
  lessons: { title: "Lessons", sub: "Curated, animated and voiced lessons for every unit. Teach them on the projector." },
  ...Object.fromEntries(Object.entries(STUDIO_VIEWS).map(([k, v]) => [k, { title: v.title, sub: v.sub }])),
};

/* ── Navigation ──────────────────────────────────────────────────── */
function go(view, { force = false, silent = false } = {}) {
  if (!VIEW_META[view]) view = "setup";
  const idx = FLOW.indexOf(view);
  if (!force && idx >= 1) {
    const err = validateSetup();
    if (err) {
      if (!silent) { toast(err, "warn"); setTimeout(highlightSetupGap, 60); }
      view = "setup";
    }
  }
  if (!force && view === "preview" && !state.data) {
    if (!silent) toast("Generate the worksheets first — or open a unit from Saved units.", "info");
    view = "exercises";
  }
  const from = state.view;
  if (!silent && from !== view) {
    const order = [...FLOW, ...Object.keys(STUDIO_VIEWS), "lessons", "library"];
    play(order.indexOf(view) < order.indexOf(from) ? "navBack" : "nav");
  }
  state.view = view;
  $$(".view").forEach((v) => v.classList.toggle("active", v.dataset.view === view));
  $("scroller").scrollTo({ top: 0, behavior: "instant" });
  if (view === "setup") renderSetup();
  if (view === "words") renderWords();
  if (view === "exercises") enterExercises();
  if (view === "preview") renderPreview();
  if (view === "library") renderLibrary();
  if (view === "lessons") renderLessons();
  STUDIO_VIEWS[view]?.render();
  renderChrome();
  emit("view");
}

/* ── Chrome: sidebar, top bar, flow bar ──────────────────────────── */
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
  $("pageSub").textContent = meta.sub;

  $$(".sb-item[data-nav]").forEach((b) => b.classList.toggle("active", b.dataset.nav === view));
  FLOW.forEach((step, i) => {
    const dot = document.querySelector(`[data-step-dot="${i + 1}"]`);
    if (dot) dot.classList.toggle("done", step !== view && stepDone(step));
  });
  const p = CLASS_PROFILES[state.profileId];
  $("navSub-setup").textContent = p ? `${p.label} · ${isCpp() ? `PP${state.cpp.bookId.slice(-1)} ` : ""}Unit ${unitNumber()}` : "Level & coursebook";
  $("navSub-words").textContent = state.inputMode === "freeform" ? "Freeform brief" : plural(filledWords().length, "word");
  $("navSub-exercises").textContent = state.plan ? `${state.plan.dictationExerciseCount} Dictation · ${state.plan.lingoPracticeCount} Lingo` : "Plan & generate";
  $("navSub-preview").textContent = state.data ? "Ready to export" : "Not generated yet";
  document.querySelector('.sb-item[data-action="open-projector"]').disabled = !state.data;

  // Context chips
  const chips = [];
  if (p) chips.push(`<button type="button" class="ctx-chip" data-goto="setup"><span class="ctx-ico" style="background:${LEVEL_COLORS[p.id]}">${esc(p.label[0])}</span><span>${esc(p.label)} · ${esc(p.cefr)}</span></button>`);
  if (bookTitle()) {
    const color = isCpp() ? BOOK_COLORS[state.cpp.bookId] : "var(--text-3)";
    chips.push(`<button type="button" class="ctx-chip shrink" data-goto="setup" title="${esc(bookTitle())}"><span class="ctx-ico" style="background:${color}">${icon("book")}</span><span>${esc(bookTitle())} · Unit ${esc(unitNumber())}${pageRange() ? ` · p. ${esc(pageRange())}` : ""}</span></button>`);
  }
  if (state.inputMode === "structured") chips.push(`<button type="button" class="ctx-chip" data-goto="words"><span class="ctx-ico" style="background:var(--brand)">${icon("list")}</span><span>${plural(filledWords().length, "word")}</span></button>`);
  $("ctxChips").innerHTML = chips.join("");

  // Flow bar
  const idx = FLOW.indexOf(view);
  $("flowbar").classList.toggle("hidden", idx < 0);
  if (idx >= 0) {
    $("flowDots").innerHTML = FLOW.map((s, i) => `<span class="${i === idx ? "active" : i < idx || stepDone(s) ? "done" : ""}"></span>`).join("");
    $("flowBack").style.visibility = idx === 0 ? "hidden" : "visible";
    $("flowBack").querySelector("span").textContent = idx > 0 ? VIEW_META[FLOW[idx - 1]].title : "";
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
  else if (view === "preview") openGames();
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
    sub = hasKey ? `Using ChatGPT plan · ${model?.name || ""}` : "Connect ChatGPT and choose a model";
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

async function newUnit() {
  if (state.busy) { toast("Please wait for the AI to finish first.", "warn"); return; }
  const unsaved = !state.data && filledWords().length > 0;
  if (unsaved) {
    const ok = await confirmDialog({
      title: "Start a new unit?",
      body: "Your current word list hasn't been turned into worksheets yet, so it isn't in the library.",
      okLabel: "Start new unit",
      tone: "brand",
      iconName: "plus",
    });
    if (!ok) return;
  }
  resetState();
  if (isCpp()) loadPoolWords({ silent: true });
  emit("setup", "words", "data", "level");
  go("setup", { force: true });
  toast("Fresh unit started — everything you generated is in your library.", "info", { ms: 3000 });
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
function openGames() {
  const ctx = deckContext();
  if (!ctx) {
    toast("Add at least 3 words first — pick a coursebook unit or type your words.", "info", { actions: [{ label: "Choose a unit", run: () => go("setup") }] });
    return;
  }
  openDeck(ctx.deck, ctx.title);
}

function openDeck(deck, title) {
  // "Choose your words" in the arcade picks coursebook rows; they get the same trusted pictures as a worksheet's words.
  const buildDeck = (rows) => buildArcadeDeck(rows.map((row) => ({ ...row, emojis: engine.trustedBankEmoji(row) })));
  openArcade({ deck, title, prefs: { sfx: prefs.sfx, tts: prefs.tts }, picture, onPrefs: savePlayPrefs, buildDeck });
}

/** Teach a curated lesson in the full-screen player. */
function teachLesson(id) {
  openLesson(id, {
    picture,
    prefs: { sfx: prefs.sfx, tts: prefs.tts },
    onPrefs: savePlayPrefs,
    calm: !!prefs.calmMotion,
    onPlayGames: (deck, title) => openDeck(deck, title),
  }).catch(lessonsToast);
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
    if (a?.dataset.action === "open-projector") openProjector();
    const g = e.target.closest("[data-goto]");
    if (g) go(g.dataset.goto);
  });
  $("btnNew").addEventListener("click", newUnit);
  $("btnPlayTop").addEventListener("click", openGames);
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
  d?.onDownloadDone?.(({ state: st, filename }) => {
    if (st === "completed") toast(`Saved ${filename}.`, "ok");
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
    if (keys.includes("lingo_maker_saves")) { updateLibraryCount(); if (state.view === "library") renderLibrary(); }
    if (keys.some((k) => k === "lingo_maker_api_key" || k === "vm_gemini_api_key" || k === "vm_ai_provider")) setAiState();
  });
}

/* ── Boot ────────────────────────────────────────────────────────── */
async function boot() {
  try {
    await hydrateStorage();
    await startSync();
    applyTheme();
    configureAudio(soundPrefs());
    await Promise.all([ensurePictureStyle(prefs.pictureStyle), initPics()]);
    initVoice();

    const hadDraft = loadDraft();
    if (state.sessionId) {
      const s = getSavedSession(state.sessionId);
      if (s) state.data = normalizeWorksheetExercises(JSON.parse(JSON.stringify(s.data)));
      else state.sessionId = null;
    }
    if (!hadDraft && isCpp()) loadPoolWords({ silent: true });

    Object.assign(actions, { go, openSettings, openArcade: openGames, openProjector, setAiState, settingsSaved: async () => { await ensurePictureStyle(prefs.pictureStyle); if (state.view === "preview") renderPreview(); } });
    initSetup();
    initWords();
    initExercises();
    initPreview();
    initLibrary();
    initLessons({ teach: teachLesson, games: lessonGames });
    initStudio();
    initInterfaceSounds();
    wire();

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
    go(state.view || "setup", { silent: true });
  } catch (err) {
    console.error(err);
    const banner = document.createElement("div");
    banner.className = "callout danger";
    banner.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:999;max-width:640px";
    banner.textContent = `Vocab Master couldn't start: ${err.message}`;
    document.body.appendChild(banner);
  }
  // Hooks for the desktop smoke test.
  window.__LINGO_ENGINE__ = engine;
  window.__VM__ = { state, go, emit, openUnit, openGames, openProjector, teachLesson, actions };
}

boot();
