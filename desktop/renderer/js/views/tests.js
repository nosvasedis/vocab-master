/* Test Maker — choose book & unit(s) (or a topic), the class, the length, and edit the parts (skill, task,
 * items, points). One AI request writes the test from the whole unit (words by section, Big Question, readings,
 * lesson stories); any part can be rewritten alone. Version B, a teacher's pack, listening read by the app's
 * voices, click-to-edit items, and print / PDF / Word. */
import { CLASS_PROFILES, CPP_BOOKS, downloadBlob, resolveCoursebookId } from "../../app.js";
import { state, prefs, LEVEL_COLORS, on } from "../state.js";
import { readJSON, writeJSON } from "../bridge.js";
import { segmented, withBusy } from "../ui.js";
import {
  $, esc, icon, plural, toast, createSourcePicker, createPaper, fitPaper, askAi, aiErrorToast, profileBlock, levelLabel,
  makePicFor, wizardNav, createWizard, safePaperHtml, printHtml, exportPdf, exportWord, recentDocs, saveDoc, segHtml, switchHtml, stepperHtml, unitContextFor, owl, busyOverlay, classMemoryBrief,
} from "./studio-common.js";
/** The class profile plus what the class has already met (class memory, when the teacher turned it on). */
const withMemory = (levelId, focus) => [profileBlock(levelId), classMemoryBrief(levelId, focus || [])].filter(Boolean).join("\n");
import { TASKS, SKILLS, KNOBS, tfLabels, partOpts } from "../../studio/tasks.js";
import { textsFor } from "../../studio/reading-texts.js";
import { openTaskLibrary, sampleHtml, taskBadges, textChooserHtml } from "./task-library.js";
import { GRAMMAR_MENU, LEVEL_IDS, DIFFICULTY, TEST_DEFAULTS, grammarLabel } from "../../studio/levels.js";
import { testDefaults, makePart, testPrompt, buildTestDoc, keyCheckPrompt, applyKeyCheck, estimateMinutes, specPoints, partPoints, planProblems, planNotes, fitPartsToSource, defaultTitle, LENGTHS, TEMPLATES, templateFor, templateParts, PART_LEVELS, partLevel, problemTargets, fixItemsPrompt, applyItemFixes, partSimilarity, textWords, partTextWords, suggestText } from "../../studio/test-builder.js";
import { makeVersionB, docProblems, docPoints, relabelDoc } from "../../studio/doc-model.js";
import { renderStudentPaper, renderTeacherPack } from "../../studio/doc-render.js";
import { buildUnitContext, unitWords } from "../../studio/unit-context.js";
import { playScript, scriptWav, warmScripts, naturalDownloaded } from "../voices/listening.js";
import { audioFileName } from "../../studio/audio-track.js";
import { voicePickerHtml, pickVoice, voiceNote, statusPill } from "./voice-ui.js";
import { loadLessonJson } from "./studio-common.js";
import { mountTestEditing } from "./test-edit.js";
import { registerMaker, openMade, closeMade, deleteMade, rememberOpen, rememberedOpen, findMade, makerActsHtml } from "../made.js";

const PREFS_KEY = "vm_tests_prefs_v1";
let picker;
let paper;
let editor = null;
let built = false;
const ts = { spec: null, doc: null, sheet: "A", player: null, playing: null, ctx: null, stale: new Set(), status: {}, naturalReady: true, peek: null, epoch: 0 };

const savePrefs = () => writeJSON(PREFS_KEY, ts.spec);

export function initTests() {
  const saved = readJSON(PREFS_KEY, null);
  // A part whose task no longer exists is dropped (older settings).
  if (Array.isArray(saved?.parts)) saved.parts = saved.parts.filter((p) => TASKS[p?.task]);
  // Settings saved before templates name only the length: its classic template.
  ts.spec = saved?.levelId && Array.isArray(saved.parts) ? { ...testDefaults(saved.levelId), ...saved, template: templateFor(saved.template, saved.length).id } : testDefaults("B_SENIOR");
  // Opening, closing and deleting go through js/made.js (the Library, Home and this screen's own list alike).
  registerMaker("test", {
    // Before the screen is first shown, the test left open last time counts as open.
    openId: () => (built ? ts.doc?.id : rememberedOpen("test")) || null,
    open(id) {
      const d = findMade("test", id);
      if (!d) return false;
      if (!built) build();
      openDoc(d);
      ts.showResult = true;
      return true;
    },
    reveal() { ts.showResult = true; },
    close: () => closeDoc(),
    busy: () => !!ts.writing,
  });
}

/** The test on the paper (null = none); the open one is remembered for the next start. */
function setDoc(d) {
  ts.doc = d || null;
  rememberOpen("test", ts.doc?.id);
}

/** Put the open test away (it stays in the Library) and start again at Step 1. A part still being
 *  rewritten for it is dropped when its reply comes (ts.epoch). */
function closeDoc() {
  ts.epoch++;
  if (!built) { rememberOpen("test", null); return; }
  stopPlayer();
  setDoc(null);
  ts.ctx = null; ts.stale.clear(); ts.sheet = "A"; ts.peek = null;
  ts.spec.title = "";
  savePrefs();
  renderAll();
  if (!ts.writing) wiz.show(0, { scroll: false });
}

const STEPS = [
  { label: "Content", sub: "Unit, words or topic" },
  { label: "Class", sub: "Level and length" },
  { label: "Parts", sub: "The exercises" },
  { label: "Finish", sub: "Title and paper" },
  { label: "Your test", sub: "Print, PDF, Word" },
];
const RESULT = STEPS.length - 1;
let wiz;

function build() {
  const host = $("testsView");
  const head = (title, sub, extra = "") => `<header class="mk-page-head"><div><h2>${title}</h2><p>${sub}</p></div>${extra}</header>`;
  host.innerHTML = `
  <div class="mk mk-test">
    <header class="mk-top">
      <div class="mk-brand"><span class="mk-badge">${icon("clipboard")}</span><div><b>Test Maker</b><span id="tsSummary"></span></div></div>
      ${wizardNav(STEPS)}
      <div class="mk-acts" id="tsActs"></div>
    </header>
    <div class="mk-body">
      <section class="mk-page">
        ${head("What does the test cover?", "Start from a coursebook unit or a grammar point or topic — and add any words of your own.")}
        <div class="mk-card"><div id="tsSource"></div></div>
        <div id="tsFocus" class="mk-focus"></div>
        <div class="mk-recent hidden" id="tsRecentWrap"><h4>${icon("clock", "i-sm")}Or open one of your tests</h4><div id="tsRecent" class="tb-recent-grid"></div></div>
      </section>
      <section class="mk-page" hidden>
        ${head("Your class &amp; how long", "The class sets the language of every question; the length sets how many parts the test starts with.")}
        <div id="tsShape" class="mk-stack"></div>
      </section>
      <section class="mk-page" hidden>
        ${head("The parts", "Each part is one exercise. Open the library to choose how each skill is tested, then tune it: questions, difficulty, texts and help.", `<span class="mk-pill-sum" id="tsSum"></span>`)}
        <div id="tsParts"></div>
      </section>
      <section class="mk-page" hidden>
        ${head("Final touches", "What goes on the paper — then Lingo writes the test.")}
        <div class="mk-finish"><div class="mk-card" id="tsOptions"></div><aside class="mk-ready" id="tsReady"></aside></div>
      </section>
      <section class="mk-page mk-result" hidden>
        <aside class="mk-outline" id="tsOutline"></aside>
        <div class="mk-paper tb-paper">
          <div class="paper-toolbar tb-toolbar">
            <div id="tsSheetSeg"></div>
            <p class="edit-hint tb-hint hidden" id="tsEditHint"></p>
            <label class="switch sm"><input type="checkbox" id="tsAnswers" /><span class="track"></span><span class="sw-text">Show answers</span></label>
            <span class="export-pills tb-exports">
              <button type="button" class="btn btn-secondary btn-sm" id="tsPrint" disabled>${icon("printer", "i-sm")}Print</button>
              <button type="button" class="btn btn-secondary btn-sm" id="tsPdf" disabled>${icon("pdf", "i-sm")}PDF</button>
              <button type="button" class="btn btn-secondary btn-sm" id="tsWord" disabled>${icon("word", "i-sm")}Word</button>
            </span>
          </div>
          <div id="tsListen"></div>
          <div id="tsProblems"></div>
          <div class="paper-stage tb-stage" id="tsStage"><div class="paper hidden" id="tsPaper"></div>
            <div class="mk-empty" id="tsEmpty">
              <div class="empty-owl">${owl()}</div>
              <h3>Your test will appear here</h3>
              <p>Check the four steps, then press <b>Write my test</b>. You get the children’s paper (and a version B if you like) plus a teacher’s pack with the answers, the listening scripts and a marking guide.</p>
              <button type="button" class="btn btn-secondary" data-mk-go="3">${icon("arrow-left", "i-sm")}Back to Final touches</button>
            </div>
          </div>
        </div>
      </section>
    </div>
    <footer class="mk-foot">
      <button type="button" class="btn btn-ghost" id="tsBack">${icon("arrow-left", "i-sm")}<span>Back</span></button>
      <div class="mk-foot-mid"><div id="tsPlanNote"></div><div class="tb-meter" id="tsMeter"></div></div>
      <button type="button" class="btn btn-primary" id="tsNext"><span>Next</span>${icon("arrow-right", "i-sm")}</button>
    </footer>
  </div>`;
  wiz = createWizard(host.querySelector(".mk"), { onShow: () => { renderFoot(); if (wiz?.index === RESULT) fitPaper($("tsStage"), $("tsPaper")); } });
  picker = createSourcePicker({ multiUnit: true, allowTopic: true, topicPlaceholder: "e.g. daily routines, my town, Present Simple vs Present Continuous", onChange: onSourceChange, review: true, level: () => ts.spec.levelId, storeKey: "vm_tests_source_v1" });
  picker.mount($("tsSource"));
  paper = createPaper($("tsPaper"));
  new ResizeObserver(() => fitPaper($("tsStage"), $("tsPaper"))).observe($("tsStage"));

  $("tsBack").addEventListener("click", () => wiz.show(wiz.index - 1));
  $("tsNext").addEventListener("click", (e) => { if (wiz.index === RESULT - 1) generate(e.currentTarget); else wiz.show(wiz.index + 1); });
  $("tsShape").addEventListener("click", (e) => {
    const lvl = e.target.closest("[data-level]");
    if (lvl) { ts.levelTouched = true; setLevel(lvl.dataset.level); ts.spec.levelChosen = true; savePrefs(); return; }
    const tp = e.target.closest("[data-template]");
    if (tp) {
      const t = templateFor(tp.dataset.template);
      if (t.id === ts.spec.template) return;
      ts.spec.template = t.id;
      ts.spec.length = t.length;
      ts.spec.parts = templateParts(t.id, ts.spec.levelId, { pictures: ts.spec.pictures });
      ts.openPart = null;
      fitParts({ quiet: true });
      // An open test keeps its paper until its parts are written again.
      if (ts.doc) ts.spec.parts.forEach((p) => markStale(p.id));
      savePrefs();
      renderShape(); renderParts();
      toast(`“${t.label}”: ${plural(ts.spec.parts.length, "part")} are ready in Step 3 — change any of them there.`, "ok", { ms: 2600 });
    }
  });
  $("tsFocus").addEventListener("click", (e) => {
    const g = e.target.closest("[data-grammar]");
    if (!g) return;
    const v = g.dataset.grammar;
    // "The unit's grammar" / "What the class knows" = no focus chosen.
    if (v === "") { ts.spec.grammar = []; ts.spec.grammarOwn = ""; }
    else ts.spec.grammar = ts.spec.grammar.includes(v) ? ts.spec.grammar.filter((x) => x !== v) : [...ts.spec.grammar, v];
    savePrefs(); renderFocus(); renderPlanNote();
  });
  $("tsFocus").addEventListener("input", (e) => {
    if (e.target.id === "tsTopic") ts.spec.topic = e.target.value;
    if (e.target.id === "tsGrammarOwn") {
      ts.spec.grammarOwn = e.target.value;
      $("tsFocus").querySelector('[data-grammar=""]')?.classList.toggle("active", !grammarList().length);
      renderPlanNote();
    }
    savePrefs();
  });
  $("tsParts").addEventListener("click", onPartsClick);
  $("tsParts").addEventListener("change", (e) => {
    // A new difficulty applies the next time the part is written.
    if (e.target.closest("[data-part-level]")) { markStale(e.target.dataset.partLevel); renderParts(); }
  });
  $("tsParts").addEventListener("input", (e) => {
    const lv = e.target.closest("[data-part-level]");
    if (lv) {
      const p = ts.spec.parts.find((x) => x.id === lv.dataset.partLevel);
      p.level = Number(lv.value);
      const box = lv.closest(".pc-level");
      box.style.setProperty("--lv", `${(p.level - 1) * 25}%`);
      box.querySelector(".pc-level-v").textContent = PART_LEVELS[p.level].label;
      box.dataset.lv = String(p.level);
      lv.setAttribute("aria-valuetext", PART_LEVELS[p.level].label);
      savePrefs();
      return;
    }
    const n = e.target.closest("[data-part-note]");
    if (n) { const p = ts.spec.parts.find((x) => x.id === n.dataset.partNote); p.note = n.value; savePrefs(); }
  });
  $("tsOptions").addEventListener("change", (e) => {
    const k = e.target.dataset.opt;
    if (!k) return;
    ts.spec[k] = e.target.checked;
    savePrefs();
    if (ts.doc) {
      ts.doc.meta.greek = !!ts.spec.greek;
      ts.doc.meta.pictures = !!ts.spec.pictures;
      ts.doc.meta.layout = { ...(ts.doc.meta.layout || {}), studentHeader: ts.spec.studentHeader !== false };
      renderPaper();
    }
    if (k === "pictures") renderParts();
  });
  $("tsOptions").addEventListener("input", (e) => {
    if (e.target.id !== "tsTitle") return;
    ts.spec.title = e.target.value;
    savePrefs();
    renderReady();
  });
  // The open test takes the new title when the teacher leaves the field (an empty field puts the usual title back).
  $("tsOptions").addEventListener("change", (e) => {
    if (e.target.id !== "tsTitle" || !ts.doc) return;
    ts.doc.meta.title = ts.spec.title.trim() || defaultTitle(sourceInfo().src) || ts.doc.meta.title;
    refreshDoc();
  });
  $("tsReady").addEventListener("click", (e) => { const b = e.target.closest("#tsGenerate"); if (b) generate(b); });
  $("tsOutline").addEventListener("click", (e) => {
    const fx = e.target.closest("[data-fix]");
    if (fx) { fixPart(fx.dataset.fix, fx); return; }
    const rw = e.target.closest("[data-rewrite]");
    if (rw) { rewritePart(rw.dataset.rewrite, rw); return; }
  });
  $("tsAnswers").addEventListener("change", renderPaper);
  $("tsPrint").addEventListener("click", () => printHtml(sheetHtml(false), sheetTitle()));
  $("tsPdf").addEventListener("click", (e) => withBusy(e.currentTarget, () => exportPdf(sheetHtml(false), sheetTitle(), sheetTitle())));
  $("tsWord").addEventListener("click", (e) => withBusy(e.currentTarget, () => exportWord(sheetDoc(), ts.sheet === "teacher" ? "teacher" : "student", sheetTitle()).catch((err) => toast(err.message, "error"))));
  $("tsListen").addEventListener("click", (e) => {
    if (pickVoice(e)) { stopPlayer(); renderListen(); warmListening(); return; }
    const play = e.target.closest("[data-play]");
    if (play) { togglePlay(play.dataset.play); return; }
    const wav = e.target.closest("[data-wav]");
    if (wav) saveTrack(wav.dataset.wav, wav);
  });
  $("tsProblems").addEventListener("click", (e) => {
    const fx = e.target.closest("[data-fix]");
    if (fx) { fixPart(fx.dataset.fix, fx); return; }
    const b = e.target.closest("[data-rewrite]");
    if (b) rewritePart(b.dataset.rewrite, b);
  });
  $("tsActs").addEventListener("click", (e) => {
    if (e.target.closest("[data-mk-close]")) closeMade("test");
    if (e.target.closest("[data-mk-del]") && ts.doc) deleteMade("test", ts.doc.id);
  });
  $("tsRecent").addEventListener("click", (e) => {
    const row = e.target.closest("[data-doc]");
    if (!row) return;
    if (e.target.closest("[data-del]")) deleteMade("test", row.dataset.doc);
    else openMade("test", row.dataset.doc);
  });
  editor = mountTestEditing({
    root: paper.root,
    doc: () => ts.doc,
    view: () => sheetDoc(),
    sheet: () => ts.sheet,
    spec: () => specForAi().spec,
    async ctx() {
      if (ts.ctx?.picFor && ts.ctx?.focus) return ts.ctx;
      const c = await contextFor(specForAi().sel);
      ts.ctx = { ...(ts.ctx || {}), ...c };
      return ts.ctx;
    },
    profile: (levelId, focus) => withMemory(levelId, focus),
    ask: (system, user, retryHint = "") => askAi(system, user, { retryHint }),
    checkKeys: (ids) => checkKeys(ts.doc, ids),
    commit: () => refreshDoc(),
    // A question deleted (or put back) on the paper: Step 3 shows the part's new number of questions.
    itemsChanged(id) {
      const p = ts.spec.parts.find((x) => x.id === id);
      const s = ts.doc?.sections.find((x) => x.id === id);
      if (!p || !s || TASKS[p.task]?.answer === "open") return;
      p.items = Math.max(1, s.items.length);
      savePrefs();
      renderParts();
    },
    rewritePart: (id, wish) => rewritePart(id, null, wish),
  });
  built = true;
  // The test that was open when the app last closed comes back (unless it was deleted meanwhile).
  const left = rememberedOpen("test");
  if (left) { const d = findMade("test", left); if (d) { openDoc(d); ts.showResult = true; } else rememberOpen("test", null); }
  // Something saved, opened or deleted anywhere (Library, Home, another computer): refresh this screen's list.
  on("library", () => { if (state.view === "tests") { renderRecent(); renderFoot(); } });
  wiz.show(0, { scroll: false });
}

function setLevel(levelId, { quiet = false } = {}) {
  const old = ts.spec;
  // A new class brings its own parts and item counts; what the teacher chose about the content stays.
  ts.spec = {
    ...testDefaults(levelId, old.length, old.template),
    topic: old.topic, title: old.title, grammar: old.grammar || [], grammarOwn: old.grammarOwn || "",
    versions: old.versions, difficulty: old.difficulty || "level", pictures: old.pictures !== false, studentHeader: old.studentHeader !== false,
    levelChosen: !!old.levelChosen,
  };
  fitParts({ quiet: true });
  savePrefs();
  renderShape(); renderFocus(); renderParts(); renderOptions();
  if (!quiet) toast(`${levelLabel(levelId)}: ${plural(ts.spec.parts.length, "part")}, about ${estimateMinutes(ts.spec)} minutes.`, "info", { ms: 2400 });
}

/* ── Step 1: what the source brings, and the grammar / texts that fit it ── */
const sourceKey = (sel) => [sel.kind, sel.bookId || "", (sel.units || []).join(","), sel.meta?.unit || ""].join("|");

/** What the Step 1 choice brings: its words with pictures and whether a coursebook unit stands behind it. */
function sourceInfo(sel = picker.value()) {
  const all = [...sel.focus, ...(sel.words || [])];
  const picFor = makePicFor(all);
  const pictureWords = [...new Set(all.filter((w) => picFor(w.english)).map((w) => w.english.toLowerCase()))];
  const hasUnit = sel.kind === "unit";
  return { sel, pictureWords, hasUnit, src: { kind: sel.kind, hasUnit, pictureWords: pictureWords.length, units: sel.units, unit: sel.meta?.unit } };
}

/** The unit(s) the texts are about: "Unit 4 · How do volcanoes change the land?" */
function unitThemes(sel) {
  if (sel.kind === "unit") return sel.units.map((u) => `Unit ${u} · ${CPP_BOOKS[sel.bookId]?.units?.[u]?.title || ""}`);
  return [];
}

const grammarList = () => [...ts.spec.grammar, ...(ts.spec.grammarOwn?.trim() ? [grammarLabel(ts.spec.grammarOwn)] : [])];

function onSourceChange(sel, { byUser = true } = {}) {
  const key = sourceKey(sel);
  if (byUser) {
    // A class the teacher chose stays when the book changes (a B class may still be on Primary Path 1); until then the
    // class follows the book's usual class, and says so.
    if (sel.kind === "unit" && sel.level && !ts.levelTouched && !ts.spec.levelChosen && sel.level !== ts.spec.levelId) {
      setLevel(sel.level, { quiet: true });
      toast(`Class set to ${levelLabel(sel.level)}, the book’s usual class — change it in Step 2 if your class uses this book in another year.`, "info", { ms: 4200 });
    }
    // A title written for one unit doesn't belong on another unit's test.
    if (ts.sourceKey && key !== ts.sourceKey && ts.spec.title) { ts.spec.title = ""; savePrefs(); }
  }
  ts.sourceKey = key;
  // A saved test that was just opened keeps its parts as they were written.
  if (byUser || !ts.doc) fitParts({ quiet: !byUser });
  renderFocus();
  renderOptions();
  renderParts();
}

/** Swap parts the source can't support (picture tasks without picture words, the Big Question without a unit). */
function fitParts({ quiet = false } = {}) {
  if (!picker) return;
  fitTexts();
  const changed = fitPartsToSource(ts.spec.parts, ts.spec.levelId, sourceInfo().src);
  if (!changed.length) return;
  changed.forEach((c) => markStale(c.id));
  savePrefs();
  if (!quiet) toast(changed.map((c) => `Part ${ts.spec.parts.findIndex((p) => p.id === c.id) + 1} is now “${TASKS[c.to].label}” — “${TASKS[c.from].label}” ${c.reason}.`).join(" "), "info", { ms: 4200 });
}

/** The unit's own reading texts for the Step 1 choice (a coursebook unit). */
function unitTexts(sel = picker?.value()) {
  if (!sel) return [];
  if (sel.kind === "unit") return textsFor(sel.bookId, sel.units);
  return [];
}

/**
 * Reading parts read the unit's own texts: a part the teacher hasn't set gets one (a story for ordering and "who",
 * a different text for each part); a text of another unit is dropped when the source changes. "Lingo writes a
 * text" (an empty choice) stays as chosen.
 */
function fitTexts() {
  const texts = unitTexts();
  const ids = new Set(texts.map((t) => t.id));
  const used = new Set();
  for (const p of ts.spec.parts) {
    if (!TASKS[p.task]?.knobs?.includes("text")) continue;
    p.opts = p.opts || {};
    const was = p.opts.text;
    if (was && !ids.has(was)) delete p.opts.text;
    if (p.opts.text === undefined && texts.length) p.opts.text = suggestText(p.task, texts, used) || undefined;
    if (p.opts.text) used.add(p.opts.text);
    if (p.opts.text !== was) markStale(p.id);
  }
}

/* Step 1, under the source: the grammar to test and what the texts are about. They say what the source already
 * brings (a unit has its own grammar and stories) and only ask for what it doesn't. */
function renderFocus() {
  if (!picker) return;
  const sel = picker.value();
  const { hasUnit } = sourceInfo(sel);
  const s = ts.spec;
  const topicMode = sel.kind === "topic";
  const chosen = grammarList();
  const menu = [...new Set([...(GRAMMAR_MENU[s.levelId] || []), ...s.grammar])];
  const chips = menu.map((g) => `<button type="button" class="chip${s.grammar.includes(g) ? " active" : ""}" data-grammar="${esc(g)}">${esc(g)}</button>`).join("");
  const grammarHint = topicMode
    ? `Choose one or more for ${esc(levelLabel(s.levelId))}, or type your own — or leave it and just describe the topic above.`
    : hasUnit
      ? "Lingo takes the grammar from the unit’s example sentences. Choose a point only to put the focus on it."
      : "Your words don’t come from a coursebook unit: choose the grammar to test, or leave it to what the class knows.";
  const defaultChip = topicMode ? "" : `<button type="button" class="chip tb-default${chosen.length ? "" : " active"}" data-grammar="">${icon(hasUnit ? "book-open" : "graduation", "i-xs")}${hasUnit ? "The unit’s grammar" : "What the class knows"}</button>`;
  const grammarCard = `<div class="mk-card">
      <div class="mk-card-head"><span class="mk-card-ico">${icon("sliders")}</span><div><h3>${topicMode ? "Grammar to test" : "Grammar"}</h3><p>${grammarHint}</p></div></div>
      <div class="gram-chips">${defaultChip}${chips}</div>
      <input class="input" id="tsGrammarOwn" placeholder="…or type a grammar point" value="${esc(s.grammarOwn || "")}" />
    </div>`;
  const textsCard = topicMode ? "" : `<div class="mk-card">
      <div class="mk-card-head"><span class="mk-card-ico">${icon("book-open")}</span><div><h3>What the texts are about</h3><p>${hasUnit ? "The reading and listening texts follow the unit’s Big Question and stories." : "Your words don’t come with a unit’s stories, so tell Lingo what the texts are about — or leave it to Lingo."}</p></div></div>
      ${hasUnit ? `<div class="mk-theme">${unitThemes(sel).map((t) => `<span>${icon("book", "i-xs")}${esc(t)}</span>`).join("")}</div>` : ""}
      ${unitTexts(sel).length ? `<p class="mk-hint tb-texts">${icon("book-open", "i-xs")}${plural(unitTexts(sel).length, "ready-made reading text")} for this unit (a fact text, a story and an everyday text each) — reading parts use them, and you can swap them in Parts.</p>` : ""}
      <input class="input" id="tsTopic" placeholder="${hasUnit ? "Optional: a setting, e.g. a school trip" : "e.g. a day at the zoo"}" value="${esc(s.topic || "")}" />
    </div>`;
  $("tsFocus").classList.toggle("one", topicMode);
  $("tsFocus").innerHTML = grammarCard + textsCard;
}

/* Step 2: the class (the same cards as Worksheets → Step 1), the length and the difficulty. */
function renderShape() {
  const s = ts.spec;
  const p = CLASS_PROFILES[s.levelId];
  const d = TEST_DEFAULTS[s.levelId] || {};
  const lenIcon = { quiz: "zap", standard: "clipboard", full: "layers" };
  const lenName = { quiz: ["Short", "about 20 minutes"], standard: ["A lesson", "about 40 minutes"], full: ["Long", "about 60 minutes"] };
  // Each template as it would come out for this class: its parts (skill icons) and the minutes.
  const tplCard = (t) => {
    const parts = templateParts(t.id, s.levelId, { pictures: s.pictures });
    const on = s.template === t.id;
    return `<button type="button" class="tp-card${on ? " active" : ""}" data-template="${t.id}" aria-pressed="${on}">
        <span class="tp-top"><b>${esc(t.label)}</b><span class="mk-tick">${icon("check", "i-xs")}</span></span>
        <small>${esc(t.blurb)}</small>
        <span class="tp-parts">${parts.map((p) => `<span class="tp-part" data-skill="${p.skill}" title="${esc(`${SKILLS[p.skill].label}: ${TASKS[p.task].label}`)}">${SKILLS[p.skill].icon}</span>`).join("")}</span>
        <span class="tp-meta">${plural(parts.length, "part")} · ≈ ${estimateMinutes({ ...s, parts })} min</span>
      </button>`;
  };
  $("tsShape").innerHTML = `
    <div class="mk-card">
      <div class="mk-card-head"><span class="mk-card-ico">${icon("graduation")}</span><div><h3>Class</h3><p>Every question, text and instruction is written for this level.</p></div></div>
      <div class="level-grid" role="radiogroup" aria-label="Class">${LEVEL_IDS.map((id) => {
    const lp = CLASS_PROFILES[id];
    return `<button type="button" class="level-card${id === s.levelId ? " selected" : ""}" data-level="${id}" role="radio" aria-checked="${id === s.levelId}" style="--lvl:${LEVEL_COLORS[id]}"><span class="lc-top"><span class="lc-letter">${esc(lp.label[0])}</span><span class="lc-check">${icon("check")}</span></span><span class="lc-name">${esc(lp.label)}</span><span class="lc-cefr">CEFR ${esc(lp.cefr)}</span><span class="lc-grade">${esc(lp.greekGrades)}</span></button>`;
  }).join("")}</div>
      <div class="level-detail"><span class="ld-item">${icon("graduation")}<span><strong>${esc(p.label)}</strong> · ages ${esc(p.ageRange)}</span></span><span class="ld-item">${icon("list")}<span><strong>${d.items || 5}</strong> questions a part</span></span><span class="ld-item">${icon("pencil")}<span>Writing: <strong>${(d.writingWords || []).join("–")} words</strong></span></span><span class="ld-item">${icon("check-circle")}<span>${tfLabels(s.levelId).join(" / ")} answers</span></span></div>
    </div>
    <div class="mk-card">
      <div class="mk-card-head"><span class="mk-card-ico">${icon("timer")}</span><div><h3>How long, and what kind of test</h3><p>Each template gets the parts ready for Step 3, chosen for ${esc(p.label)} — you can change every part there.</p></div></div>
      <div class="tp-groups">${Object.keys(LENGTHS).map((k) => `<div class="tp-group${s.length === k ? " current" : ""}">
          <div class="tp-group-head"><span class="mk-length-ico">${icon(lenIcon[k] || "clipboard")}</span><div><b>${lenName[k][0]}</b><small>${lenName[k][1]}</small></div></div>
          ${TEMPLATES.filter((t) => t.length === k).map(tplCard).join("")}
        </div>`).join("")}</div>
      <div class="mk-row"><span class="mk-lbl">Difficulty</span>${segHtml("difficulty", Object.entries(DIFFICULTY).map(([k, v]) => [k, v.label.replace("Right for the class", "Just right")]), s.difficulty)}</div>
    </div>`;
  $("tsShape").querySelectorAll("[data-segmented]").forEach((root) => segmented(root, { value: s[root.dataset.seg], onChange: (v) => { s[root.dataset.seg] = v; savePrefs(); renderReady(); } }));
}

/* ── Parts editor ─────────────────────────────────────────────────── */
function markStale(id) { if (ts.doc) ts.stale.add(id); }

/** A part's own settings as chip groups (text type, length, recording, plays, choices, letter help, support). */
function knobsHtml(p, texts) {
  const t = TASKS[p.task];
  const o = partOpts(p, ts.spec.levelId);
  const rows = [];
  for (const k of t.knobs || []) {
    if (k === "text") continue;
    // A ready-made text has its own type and length.
    if ((k === "genre" || k === "length") && o.text && texts.some((x) => x.id === o.text)) continue;
    const kn = KNOBS[k];
    rows.push(`<div class="pc-knob"><span class="pc-lbl">${esc(kn.label)}</span><div class="pc-chips" role="radiogroup" aria-label="${esc(kn.label)}">${kn.values.map(([v, label]) => `<button type="button" class="pc-chip${String(o[k]) === String(v) ? " active" : ""}" data-knob="${k}" data-val="${esc(v)}" data-part-opt="${p.id}" role="radio" aria-checked="${String(o[k]) === String(v)}">${esc(label)}</button>`).join("")}</div></div>`);
  }
  return rows.join("");
}

/** The facts a closed part shows on one line: questions, difficulty, the chosen text and every setting. */
function partFacts(p, texts) {
  const t = TASKS[p.task];
  const o = partOpts(p, ts.spec.levelId);
  const facts = [];
  if (t.answer !== "open") facts.push(plural(p.items, "question"));
  if (p.skill === "writing" && p.words) facts.push(`up to ${p.words[1]} words`);
  facts.push(PART_LEVELS[partLevel(p)].label);
  if (t.knobs?.includes("text") && texts.length) {
    const chosen = texts.find((x) => x.id === o.text);
    facts.push(chosen ? `“${chosen.title}”` : "Lingo writes the text");
  }
  for (const k of t.knobs || []) {
    if (k === "text" || ((k === "genre" || k === "length") && o.text && texts.some((x) => x.id === o.text))) continue;
    const label = KNOBS[k].values.find(([v]) => String(v) === String(o[k]))?.[1];
    if (label) facts.push(`${KNOBS[k].label}: ${label}`);
  }
  return facts;
}

/**
 * Step 3: one row per part, all the same height when closed — the number and skill, the exercise (a button
 * to the library), its kind, a one-line summary of the settings and the points. One part opens at a time:
 * what the children do (with a paper preview) beside every setting. Above: each part's share of the points.
 */
function renderParts() {
  const s = ts.spec;
  const texts = picker ? unitTexts() : [];
  if (ts.openPart && !s.parts.some((p) => p.id === ts.openPart)) ts.openPart = null;
  const total = specPoints(s) || 1;
  const rows = s.parts.map((p, i) => {
    const t = TASKS[p.task];
    const open = t.answer === "open";
    const stale = ts.stale.has(p.id);
    const expanded = ts.openPart === p.id;
    const o = partOpts(p, s.levelId);
    const lv = partLevel(p);
    const facts = partFacts(p, texts);
    const head = `<div class="pc-head" data-expand="${p.id}">
        <span class="pc-num" aria-hidden="true"><b>${i + 1}</b><span>${SKILLS[p.skill].icon}</span></span>
        <div class="pc-main">
          <small class="pc-skill">${esc(SKILLS[p.skill].label)}${stale ? ` · <em>${ts.doc ? "changed — write it again" : "changed"}</em>` : ""}</small>
          <div class="pc-name">
            <button type="button" class="pc-task" data-pick="${p.id}" data-tip="Change the exercise" aria-label="Change the exercise of part ${i + 1}: ${esc(t.label)}"><span>${esc(t.label)}</span>${icon("chevron-down", "i-sm")}</button>
            <span class="tk-kind kind-${esc(t.kind)}">${t.kind === "recognise" ? "Recognise" : t.kind === "recall" ? "Recall" : "Create"}</span>
          </div>
          <p class="pc-facts" title="${esc(facts.join(" · "))}">${facts.map((x) => `<span>${esc(x)}</span>`).join("")}${p.note ? `<span class="pc-wish">${icon("pencil", "i-xs")}${esc(p.note)}</span>` : ""}</p>
        </div>
        <span class="pc-pts"><b>${partPoints(p)}</b><small>pts</small></span>
        <span class="part-acts">
          <button type="button" class="icon-btn sm" data-move="-1" data-tip="Move up" aria-label="Move part ${i + 1} up" ${i === 0 ? "disabled" : ""}>${icon("chevron-up", "i-sm")}</button>
          <button type="button" class="icon-btn sm" data-move="1" data-tip="Move down" aria-label="Move part ${i + 1} down" ${i === s.parts.length - 1 ? "disabled" : ""}>${icon("chevron-down", "i-sm")}</button>
          <button type="button" class="icon-btn sm danger" data-remove data-tip="Remove this part" aria-label="Remove part ${i + 1}">${icon("trash", "i-sm")}</button>
        </span>
        <button type="button" class="pc-toggle" data-expand="${p.id}" aria-expanded="${expanded}" aria-controls="pcBody-${p.id}">${icon(expanded ? "chevron-up" : "sliders", "i-sm")}<span>${expanded ? "Done" : "Settings"}</span></button>
      </div>`;
    if (!expanded) return `<li class="part-card${stale ? " stale" : ""}" data-part="${p.id}" data-skill="${p.skill}">${head}</li>`;
    const textPick = t.knobs?.includes("text") && texts.length
      ? `<div class="pc-knob pc-knob-text"><span class="pc-lbl">Reading text</span>${textChooserHtml(p.id, texts, o.text, { newNote: `${partTextWords(p, s.levelId).join("–")} words, your settings`, peek: ts.peek === p.id })}</div>`
      : "";
    return `<li class="part-card open${stale ? " stale" : ""}" data-part="${p.id}" data-skill="${p.skill}">${head}
      <div class="pc-body" id="pcBody-${p.id}">
        <div class="pc-about">
          <div class="pc-badges">${taskBadges(p.task, s.levelId)}</div>
          <p class="pc-blurb">${esc(t.blurb || "")}</p>
          <div class="pc-sample" aria-label="How it looks on the paper">${sampleHtml(p.task)}</div>
          ${t.trains?.length ? `<p class="pc-trains">${icon("target", "i-xs")}<span>Trains: ${esc(t.trains.join(" · "))}</span></p>` : ""}
        </div>
        <div class="pc-set">
          <div class="pc-ctl">
            ${open ? `<span class="part-ctl">${stepperHtml(`pts:${p.id}`, p.points || 10, 4, 30)}<small>points</small></span>` : `<span class="part-ctl">${stepperHtml(`items:${p.id}`, p.items, 3, 12)}<small>questions</small></span>`}
            ${p.skill === "writing" && p.words ? `<span class="part-ctl">${stepperHtml(`words:${p.id}`, p.words[1], 15, 150)}<small>words max</small></span>` : ""}
          </div>
          <div class="pc-level" style="--lv:${(lv - 1) * 25}%" data-lv="${lv}">
            <span class="pc-lbl">Difficulty</span>
            <input type="range" min="1" max="5" step="1" value="${lv}" data-part-level="${p.id}" aria-label="Difficulty of part ${i + 1}" aria-valuetext="${PART_LEVELS[lv].label}" />
            <b class="pc-level-v">${PART_LEVELS[lv].label}</b>
          </div>
          ${textPick}
          ${knobsHtml(p, texts)}
          <div class="pc-knob"><span class="pc-lbl">Your wish</span><input class="input sm part-note" data-part-note="${p.id}" placeholder="Optional, e.g. “about a school trip”" value="${esc(p.note || "")}" /></div>
          ${ts.doc ? `<button type="button" class="btn ${stale ? "btn-primary" : "btn-ghost"} btn-sm part-rewrite" data-rewrite="${p.id}">${icon("refresh", "i-sm")}${stale ? "Write this part with the new settings" : "Write this part again"}</button>` : ""}
        </div>
      </div>
    </li>`;
  }).join("");
  const mix = Object.entries(s.parts.reduce((m, p) => { const k = TASKS[p.task]?.kind; m[k] = (m[k] || 0) + 1; return m; }, {}));
  const bar = s.parts.map((p, i) => `<button type="button" class="pc-seg" data-skill="${p.skill}" data-expand="${p.id}" style="flex:${Math.max(1, partPoints(p))}" data-tip="Part ${i + 1} · ${esc(TASKS[p.task].label)} · ${partPoints(p)} pts" aria-label="Part ${i + 1}: ${partPoints(p)} of ${total} points">${SKILLS[p.skill].icon}</button>`).join("");
  $("tsParts").innerHTML = `${s.parts.length ? `<div class="pc-overview">
      <div class="pc-bar" aria-label="Each part's share of the points">${bar}</div>
      <div class="pc-mix">${icon("layers", "i-sm")}<span>This test:</span>${mix.map(([k, n]) => `<span class="tk-kind kind-${k}">${n} × ${k === "recognise" ? "Recognise" : k === "recall" ? "Recall" : "Create"}</span>`).join("")}<small>${mix.length < 2 ? "Mix kinds of exercise for a fairer test." : "A good mix: recognising, recalling and creating."}</small></div>
    </div>` : ""}
    <ol class="part-list">${rows || `<li class="st-hint">No parts yet — add one below.</li>`}</ol>
    <div class="add-parts"><span>Add a part</span><div class="add-grid">${Object.entries(SKILLS).filter(([k]) => k !== "dictation").map(([k, v]) => `<button type="button" class="add-tile" data-add="${k}" data-skill="${k}"><span>${v.icon}</span>${esc(v.label)}${icon("plus", "i-xs")}</button>`).join("")}</div></div>`;
  const sum = `${plural(s.parts.length, "part")} · ${specPoints(s)} points · ≈ ${estimateMinutes(s)} min`;
  $("tsSum").textContent = sum;
  $("tsMeter").innerHTML = `<b>${specPoints(s)}</b><span>points</span><i></i><b>${s.parts.length}</b><span>${s.parts.length === 1 ? "part" : "parts"}</span><i></i><b>≈${estimateMinutes(s)}</b><span>min</span>`;
  renderPlanNote();
}

/** A part takes a new exercise (from the library): new item counts and settings, the same place in the test. */
function setTask(p, taskId) {
  const t = TASKS[taskId];
  if (!t || (p.task === taskId)) return;
  const fresh = makePart(t.skill, taskId, ts.spec.levelId);
  const keepItems = t.answer !== "open" && TASKS[p.task]?.answer !== "open";
  Object.assign(p, { skill: t.skill, task: taskId, items: keepItems ? p.items : fresh.items, points: fresh.points, words: fresh.words, opts: {} });
  fitTexts();
  markStale(p.id);
  savePrefs(); renderParts();
}

function libraryFor(p, mode, skill) {
  const i = ts.spec.parts.indexOf(p);
  openTaskLibrary({
    skill: skill || p?.skill,
    levelId: ts.spec.levelId,
    levelName: levelLabel(ts.spec.levelId),
    current: mode === "change" ? p.task : "",
    src: picker ? sourceInfo().src : null,
    mode,
    partLabel: i >= 0 ? `Part ${i + 1}` : "",
    onPick: (taskId) => {
      if (mode === "change") { setTask(p, taskId); toast(`Part ${i + 1} is now “${TASKS[taskId].label}”.`, "ok", { ms: 2000 }); return; }
      const t = TASKS[taskId];
      ts.spec.parts.push(makePart(t.skill, taskId, ts.spec.levelId));
      fitTexts();
      // A new part opens, ready to tune.
      ts.openPart = ts.spec.parts.at(-1).id;
      markStale(ts.openPart); savePrefs(); renderParts();
      requestAnimationFrame(() => $("tsParts").querySelector(`[data-part="${ts.spec.parts.at(-1).id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    },
  });
}

function onPartsClick(e) {
  const s = ts.spec;
  const ex = e.target.closest("[data-expand]");
  if (ex && (ex.matches("button") || !e.target.closest("button, input, a"))) {
    const id = ex.dataset.expand;
    ts.openPart = ts.openPart === id ? null : id;
    renderParts();
    if (ts.openPart) document.querySelector(`#tsParts [data-part="${id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return;
  }
  const add = e.target.closest("[data-add]");
  if (add) { libraryFor(null, "add", add.dataset.add); return; }
  const pick = e.target.closest("[data-pick]");
  if (pick) { libraryFor(s.parts.find((x) => x.id === pick.dataset.pick), "change"); return; }
  const peek = e.target.closest("[data-peek]");
  if (peek) { ts.peek = ts.peek === peek.dataset.peek ? null : peek.dataset.peek; renderParts(); return; }
  const knob = e.target.closest("[data-knob]");
  if (knob) {
    const p = s.parts.find((x) => x.id === knob.dataset.partOpt);
    const k = knob.dataset.knob;
    const raw = knob.dataset.val;
    const v = k === "text" ? raw : KNOBS[k].values.find(([x]) => String(x) === raw)?.[0];
    if (!p || v === undefined || partOpts(p, s.levelId)[k] === v) return;
    p.opts = { ...(p.opts || {}), [k]: v };
    if (k === "text" && v && ts.peek !== p.id) ts.peek = null;
    // How often the recording plays changes only the paper; everything else is written again.
    if (k === "plays" && ts.doc) { const sec = ts.doc.sections.find((x) => x.id === p.id); if (sec) { sec.plays = v; refreshDoc(); } }
    else markStale(p.id);
    savePrefs(); renderParts();
    return;
  }
  const rw = e.target.closest("[data-rewrite]");
  if (rw) { rewritePart(rw.dataset.rewrite, rw); return; }
  const row = e.target.closest("[data-part]");
  if (!row) return;
  const i = s.parts.findIndex((p) => p.id === row.dataset.part);
  const p = s.parts[i];
  // Only a stepper's own ±buttons: the step section around the parts also carries data-step.
  const step = e.target.closest("[data-stepper] [data-step]");
  if (step) {
    const [k] = step.closest("[data-stepper]").dataset.stepper.split(":");
    const d = Number(step.dataset.step);
    if (k === "items") p.items = Math.max(3, Math.min(12, p.items + d));
    if (k === "pts") p.points = Math.max(4, Math.min(30, (p.points || 10) + d));
    if (k === "words") { const w = Math.max(15, Math.min(150, p.words[1] + d * 5)); p.words = [Math.max(10, Math.round(w * 0.7)), w]; }
    if (k === "items" || k === "words") markStale(p.id);
    if (k === "pts" && ts.doc) { const sec = ts.doc.sections.find((x) => x.id === p.id); if (sec) { sec.points = p.points; refreshDoc(); } }
    savePrefs(); renderParts(); return;
  }
  const mv = e.target.closest("[data-move]");
  if (mv) {
    const j = i + Number(mv.dataset.move);
    [s.parts[i], s.parts[j]] = [s.parts[j], s.parts[i]];
    if (ts.doc) { ts.doc.sections = s.parts.map((x) => ts.doc.sections.find((sec) => sec.id === x.id)).filter(Boolean); refreshDoc(); }
    savePrefs(); renderParts(); return;
  }
  if (e.target.closest("[data-remove]")) {
    s.parts.splice(i, 1);
    ts.stale.delete(p.id);
    if (ts.doc) { ts.doc.sections = ts.doc.sections.filter((x) => x.id !== p.id); refreshDoc(); }
    savePrefs(); renderParts();
  }
}

function renderOptions() {
  const s = ts.spec;
  const auto = picker ? defaultTitle(sourceInfo().src) : "";
  $("tsOptions").innerHTML = `
    <div class="mk-card-head"><span class="mk-card-ico">${icon("file")}</span><div><h3>On the paper</h3><p>The title, the versions and what the children see.</p></div></div>
    <div class="mk-field"><label class="mk-lbl" for="tsTitle">Title</label>
      <input class="input" id="tsTitle" placeholder="${esc(auto || "Lingo names it from the topic")}" value="${esc(s.title || "")}" />
      <small class="mk-hint">${auto ? `Leave it empty for “${esc(auto)}”.` : "Leave it empty and Lingo gives the test a short title."}</small></div>
    <div class="mk-field"><span class="mk-lbl">Versions</span>${segHtml("versions", [[1, "One version"], [2, "A + B (no copying!)"]], s.versions)}</div>
    <div class="st-switches mk-switches">
      ${switchHtml("greek", "Instructions also in Greek", "A small Greek line under each English instruction", s.greek)}
      ${switchHtml("pictures", "Show pictures", "The app’s illustrations in picture tasks", s.pictures)}
      ${switchHtml("studentHeader", "Name & score box", "Name · Class · Date · Score at the top", s.studentHeader !== false)}
    </div>`;
  $("tsOptions").querySelectorAll("[data-segmented]").forEach((root) => segmented(root, { value: String(s[root.dataset.seg]), onChange: (v) => {
    s[root.dataset.seg] = Number(v);
    savePrefs();
    renderReady();
    if (ts.doc) { ts.doc.versionB = s.versions > 1 ? makeVersionB(ts.doc) : null; ts.doc.meta.version = s.versions > 1 ? "A" : ""; renderSheetSeg(); renderPaper(); }
  } }));
  renderReady();
}

/** Step 4's summary: everything the test will be, and the button that writes it. */
function renderReady() {
  if (!picker || !$("tsReady")) return;
  const { sel, spec } = specForAi();
  const { pictureWords, hasUnit } = sourceInfo(sel);
  const probs = planProblems(spec, { pictureWords, focusWords: sel.focus, hasUnit });
  const title = spec.title?.trim() || defaultTitle(sourceInfo(sel).src) || "Lingo names it";
  const row = (ico, label, value, step) => `<button type="button" class="mk-ready-row" data-mk-go="${step}"><span>${icon(ico, "i-sm")}</span><small>${label}</small><b>${value}</b>${icon("pencil", "i-xs mk-ready-edit")}</button>`;
  $("tsReady").innerHTML = `
    <div class="mk-ready-head"><span class="mk-badge">${icon("clipboard")}</span><div><small>Ready to write</small><b>${esc(title)}</b></div></div>
    <div class="mk-ready-rows">
      ${row(sel.kind === "topic" ? "bulb" : sel.kind === "unit" ? "book-open" : "list", "Covers", esc(sourceLabel(sel, spec)), 0)}
      ${row("sliders", "Grammar", esc(spec.grammar.join(", ") || (sel.kind === "topic" ? "From the topic" : hasUnit ? "The unit’s grammar" : "What the class knows")), 0)}
      ${row("graduation", "Class", `${esc(levelLabel(spec.levelId))} · ${esc(CLASS_PROFILES[spec.levelId]?.cefr || "")}`, 1)}
      ${row("layers", "Parts", `${plural(spec.parts.length, "part")} · ${specPoints(spec)} points · ≈ ${estimateMinutes(spec)} min`, 2)}
      ${row("copy", "Versions", spec.versions > 1 ? "A + B" : "One version", 3)}
    </div>
    ${probs.length ? `<div class="callout warning">${icon("alert")}<span>${esc(probs.join(" "))}</span></div>` : ""}
    <button type="button" class="btn btn-magic btn-lg mk-go" id="tsGenerate"${probs.length ? " disabled" : ""}>${icon("sparkles")}${ts.doc ? "Write a new test" : "Write my test"}</button>
    <small class="mk-hint">Usually 20–40 seconds. You get the children’s paper and a teacher’s pack with the answers.</small>`;
}

/** The result page's side column: the test at a glance, each part with "Write it again". */
function renderOutline() {
  const d = ts.doc;
  if (!d) { $("tsOutline").innerHTML = `<div class="mk-outline-card"><small>Nothing written yet</small><b>Your test</b><p class="mk-hint">Press <b>Write my test</b> in Final touches.</p></div>`; return; }
  $("tsOutline").innerHTML = `
    <div class="mk-outline-card">
      <small>${esc(d.meta.classLabel || levelLabel(d.meta.classProfile))}${d.versionB ? " · A + B" : ""}</small>
      <b>${esc(d.meta.title || "Test")}</b>
      <span class="mk-hint">${esc(d.meta.subtitle || "")}</span>
      <div class="mk-outline-meter"><span><b>${docPoints(d)}</b> points</span><span><b>${d.sections.length}</b> parts</span><span><b>≈${d.meta.minutes || estimateMinutes(ts.spec)}</b> min</span></div>
    </div>
    <ol class="mk-outline-parts">${d.sections.map((sec, i) => {
    const stale = ts.stale.has(sec.id);
    const probs = sec.problems || [];
    return `<li data-skill="${sec.skill}" class="${stale ? "stale" : ""}${probs.length ? " warn" : ""}">
      <div class="mk-op-row"><span class="mk-op-ico">${SKILLS[sec.skill]?.icon || ""}</span><span class="mk-op-t"><small>Part ${i + 1} · ${esc(SKILLS[sec.skill]?.label || "")}${stale ? " · changed" : ""}</small><b>${esc(TASKS[sec.task]?.label || "")}</b></span>
        <button type="button" class="icon-btn sm" data-rewrite="${sec.id}" data-tip="${stale ? "Write this part again with its new settings" : "Write the whole part again"}" aria-label="Write part ${i + 1} again">${icon("refresh", "i-sm")}</button></div>
      ${probs.length ? `<div class="mk-op-probs">${icon("alert", "i-xs")}<div><ul>${probs.map((pr) => `<li>${esc(friendlyProblem(pr))}</li>`).join("")}</ul>${fixButton(sec)}</div></div>` : ""}
    </li>`;
  }).join("")}</ol>
    <div class="mk-outline-acts">
      <button type="button" class="btn btn-secondary btn-sm" data-mk-go="2">${icon("sliders", "i-sm")}Change the parts</button>
    </div>`;
}

/** The sticky bar: Back, what to fix (or the size of the test), and Next / Write my test. */
function renderFoot() {
  if (!wiz || !picker) return;
  const i = wiz.index;
  const { sel, spec } = specForAi();
  const { pictureWords, hasUnit } = sourceInfo(sel);
  const probs = planProblems(spec, { pictureWords, focusWords: sel.focus, hasUnit });
  const back = $("tsBack");
  back.style.visibility = i === 0 ? "hidden" : "visible";
  back.querySelector("span").textContent = i > 0 ? STEPS[i - 1].label : "";
  // Planning notes belong to the steps, not to the finished paper.
  $("tsPlanNote").hidden = i === RESULT;
  const next = $("tsNext");
  next.hidden = i === RESULT;
  next.className = `btn ${i === RESULT - 1 ? "btn-magic" : "btn-primary"}`;
  if (i < RESULT) next.querySelector("span").textContent = i === RESULT - 1 ? (ts.doc ? "Write a new test" : "Write my test") : `Next: ${STEPS[i + 1].label}`;
  next.disabled = i === RESULT - 1 && !!probs.length;
  // Steps with a tick; "Your test" opens once there is one.
  const done = [1];
  if (!probs.some((p) => /words to test|Type the topic/.test(p))) done.push(0);
  if (spec.parts.length) done.push(2);
  if (ts.doc) done.push(3);
  wiz.mark({ done, locked: ts.doc || ts.writing ? [] : [RESULT] });
  $("tsActs").innerHTML = makerActsHtml("test", { open: !!ts.doc && !ts.writing });
}

/* ── Generation ───────────────────────────────────────────────────── */
async function contextFor(sel) {
  const focus = sel.focus;
  const picFor = makePicFor([...(sel.words || []), ...focus]);
  // Nouns first: picture tasks ask for things you can draw.
  const nounFirst = (a, b) => Number(/^n/.test(b.type || "")) - Number(/^n/.test(a.type || ""));
  // Enough picture words for the biggest picture part (three pictures a question), never fewer than 16.
  const picNeed = Math.max(16, ...ts.spec.parts.filter((p) => TASKS[p.task]?.needs?.includes("pictures")).map((p) => (p.items + 1) * 3));
  const pictureWords = [...new Set([...focus, ...(sel.words || [])].filter((w) => picFor(w.english)).sort(nounFirst).map((w) => w.english))].slice(0, picNeed);
  const unitContext = await unitContextFor(sel);
  return { focus, picFor, pictureWords, unitContext };
}

/**
 * The settings the AI gets. Only what fits the Step 1 source goes in: a topic test's topic is the Step 1 text
 * (the "texts" field belongs to unit and word-list tests), and the grammar is the chips plus the typed point.
 */
function specForAi() {
  const sel = picker.value();
  const spec = JSON.parse(JSON.stringify(ts.spec));
  spec.source = sel.kind === "topic" ? { kind: "topic" } : { kind: sel.kind, bookId: sel.bookId, units: sel.units, sections: sel.sections };
  spec.topic = sel.kind === "topic" ? sel.topic.trim() : String(spec.topic || "").trim();
  spec.grammar = grammarList();
  delete spec.grammarOwn;
  return { sel, spec };
}

/** The line under the test's title and in the header: the unit, or the topic and grammar. */
const sourceLabel = (sel, spec = specForAi().spec) => (sel.kind === "topic" ? [spec.topic, ...spec.grammar, sel.focus.length ? plural(sel.focus.length, "word") : ""].filter(Boolean).join(" · ") || "A grammar point or topic" : sel.label);

function renderPlanNote() {
  if (!picker) return;
  const { sel, spec } = specForAi();
  const { pictureWords, hasUnit } = sourceInfo(sel);
  const probs = planProblems(spec, { pictureWords, focusWords: sel.focus, hasUnit });
  const notes = planNotes(spec, { focusWords: sel.focus });
  $("tsSummary").textContent = `${sourceLabel(sel, spec)} · ${levelLabel(ts.spec.levelId)}`;
  $("tsPlanNote").innerHTML = probs.length
    ? `<div class="callout warning">${icon("alert")}<span>${esc(probs.join(" "))}</span></div>`
    : notes.length ? `<div class="callout info">${icon("info")}<span>${esc(notes.join(" "))}</span></div>` : "";
  renderReady();
  renderFoot();
}

async function generate(btn) {
  const { sel, spec } = specForAi();
  // The test is written on its own page; a failed first try goes back to Final touches.
  ts.writing = true;
  wiz.show(RESULT);
  const stopBusy = busyOverlay($("tsStage"), { title: "Lingo is writing your test…", note: "Usually 20–40 seconds — a full 4-skills test can take a minute", steps: [[0, "Reading the unit: words, stories and the Big Question"], [4, `Writing ${plural(spec.parts.length, "part")} for ${levelLabel(spec.levelId)}`], [14, "Writing the listening and reading texts"], [26, "Checking every answer and mixing the answer key"], [45, "Almost there…"]] });
  await withBusy(btn, async () => {
    try {
      const ctx = await contextFor(sel);
      const { system, user } = testPrompt(spec, { unitContext: ctx.unitContext, focusWords: ctx.focus, pictureWords: ctx.pictureWords, profileBlock: withMemory(spec.levelId, ctx.focus) });
      const reply = await askAi(system, user);
      const meta = { ...sel.meta, label: sourceLabel(sel, spec), classLabel: levelLabel(spec.levelId) };
      ts.ctx = { ...ctx, meta };
      setDoc(buildTestDoc(spec, reply, { levelId: spec.levelId, picFor: ctx.picFor, focusWords: ctx.focus, meta }));
      await topUpShortParts(spec, ctx, meta);
      await checkKeys(ts.doc);
      ts.doc.versionB = spec.versions > 1 ? makeVersionB(ts.doc) : null;
      ts.stale.clear();
      ts.sheet = "A";
      saveDoc(ts.doc);
      renderAll();
      const probs = docProblems(ts.doc);
      toast(probs.length ? `Your test is ready — ${plural(probs.length, "small thing")} to look at.` : `Your test is ready: ${plural(ts.doc.sections.length, "part")}, ${docPoints(ts.doc)} points.`, probs.length ? "warn" : "ok");
    } catch (e) {
      aiErrorToast(e);
      if (!ts.doc) wiz.show(RESULT - 1);
    } finally { ts.writing = false; stopBusy(); renderFoot(); }
  });
}

/** Parts that came back with fewer questions than asked: [{ id, have, want }]. */
function shortParts(doc, ids = null) {
  return (doc?.sections || []).filter((s) => !ids || ids.includes(s.id)).map((s) => {
    const m = (s.problems || []).map((p) => String(p).match(/^has (\d+) of (\d+) items/)).find(Boolean);
    return m ? { id: s.id, have: Number(m[1]), want: Number(m[2]) } : null;
  }).filter(Boolean);
}

/**
 * One more try for the parts that came back short (the AI ran out of text or script): only those parts are
 * written again, and a new version replaces the old one only when it has more questions.
 */
async function topUpShortParts(spec, ctx, meta) {
  const short = shortParts(ts.doc);
  if (!short.length) return 0;
  const epoch = ts.epoch;
  const docId = ts.doc.id;
  const prompt = testPrompt(spec, { unitContext: ctx.unitContext, focusWords: ctx.focus, pictureWords: ctx.pictureWords, profileBlock: withMemory(spec.levelId, ctx.focus) }, short.map((x) => x.id));
  let reply;
  try {
    reply = await askAi(prompt.system, prompt.user, { retryHint: `Last time ${short.map((x) => `part "${x.id}" had only ${x.have} of ${x.want} items`).join("; ")}. Write EXACTLY the number of items each part asks for, plus the example — make the text or script longer if it needs more details.` });
  } catch { return 0; }
  if (epoch !== ts.epoch || ts.doc?.id !== docId) return 0;
  const next = buildTestDoc(spec, reply, { levelId: spec.levelId, picFor: ctx.picFor, focusWords: ctx.focus, meta }, ts.doc);
  let fixed = 0;
  ts.doc.sections = ts.doc.sections.map((s) => {
    if (!short.some((x) => x.id === s.id)) return s;
    const n = next.sections.find((y) => y.id === s.id);
    if (n && n.items.length > s.items.length) { fixed++; return n; }
    return s;
  });
  ts.doc.meta.points = docPoints(ts.doc);
  return fixed;
}

/** Yes/no keys are re-answered from the text alone by a second small call; a failed check leaves the test as it is. */
async function checkKeys(doc, parts = null) {
  const p = keyCheckPrompt(doc, parts);
  if (!p) return 0;
  try { return applyKeyCheck(doc, await askAi(p.system, p.user)); } catch { return 0; }
}

/** A part's problem as a teacher reads it. */
function friendlyProblem(p) {
  return String(p)
    .replace(/^item (\d+): /, "Question $1: ")
    .replace(/^items? /, (m) => (m.startsWith("items") ? "Questions " : "Question "))
    .replace(/answer was not among the options/, "the right answer wasn’t one of the options")
    .replace(/needs at least two options/, "needs at least two options to choose from")
    .replace(/is not one of the tested words/, "isn’t one of the words you chose to test")
    .replace(/^has (\d+) of (\d+) items/, "only $1 of $2 questions were written")
    .replace(/^the answer key was corrected for (items?) /, (m, w) => `the answer key was corrected for ${w === "items" ? "questions" : "question"} `);
}

/** "Fix it" (just the questions in trouble) when the problems name them; else "Write it again". */
function fixButton(sec) {
  const t = problemTargets(sec);
  if (t.whole) return `<button type="button" class="btn btn-secondary btn-sm" data-rewrite="${sec.id}">${icon("refresh", "i-sm")}Write it again</button>`;
  return `<button type="button" class="btn btn-primary btn-sm" data-fix="${sec.id}" data-tip="Lingo rewrites only these questions — the rest of the part stays">${icon("wand", "i-sm")}Fix ${t.items.length === 1 ? `question ${t.items[0]}` : `questions ${t.items.join(", ")}`}</button>`;
}

/** Rewrite only the questions a part's problems name (a small AI call); a broken part is written again whole. */
async function fixPart(partId, btn) {
  if (!ts.doc) return;
  const sec = ts.doc.sections.find((x) => x.id === partId);
  if (!sec) return;
  const t = problemTargets(sec);
  if (t.whole) { rewritePart(partId, btn); return; }
  const { sel, spec } = specForAi();
  const epoch = ts.epoch;
  await withBusy(btn, async () => {
    try {
      const ctx = ts.ctx?.focus ? ts.ctx : await contextFor(sel);
      const { system, user } = fixItemsPrompt(spec, sec, t.items, { profileBlock: withMemory(spec.levelId, ctx.focus), focusWords: ctx.focus, pictureWords: ctx.pictureWords });
      const reply = await askAi(system, user);
      if (epoch !== ts.epoch) return; // the test was closed or deleted meanwhile
      const changed = applyItemFixes(ts.doc, spec, partId, reply, t.items, { picFor: ctx.picFor, focusWords: ctx.focus });
      if (!changed.length) { toast("Lingo couldn’t fix those questions — try “Write it again”.", "warn"); return; }
      await checkKeys(ts.doc, [partId]);
      if (epoch !== ts.epoch) return;
      refreshDoc();
      const left = ts.doc.sections.find((x) => x.id === partId)?.problems?.length || 0;
      toast(`Fixed ${changed.length === 1 ? `question ${changed[0]}` : `questions ${changed.join(", ")}`}${left ? " — one more thing to look at" : ""}.`, left ? "warn" : "ok", { ms: 2600 });
    } catch (e) { aiErrorToast(e); }
  });
}

async function rewritePart(partId, btn, wish = "") {
  if (!ts.doc) return false;
  const { sel, spec } = specForAi();
  const epoch = ts.epoch;
  const old = ts.doc.sections.find((x) => x.id === partId);
  return withBusy(btn, async () => {
    try {
      const ctx = ts.ctx?.focus ? ts.ctx : await contextFor(sel);
      // The AI is told the teacher's wish first and what the old part looked like; a part that comes back
      // nearly the same goes back once more with that reason.
      const prompt = testPrompt(spec, { unitContext: ctx.unitContext, focusWords: ctx.focus, pictureWords: ctx.pictureWords, profileBlock: withMemory(spec.levelId, ctx.focus), rewrite: { wish, previous: old ? [old] : [] } }, [partId]);
      const meta = ts.ctx?.meta || { ...sel.meta, label: sourceLabel(sel, spec), classLabel: levelLabel(spec.levelId) };
      let next = null;
      let hint = "";
      const count = (d) => d?.sections.find((x) => x.id === partId)?.items.length || 0;
      for (let attempt = 0; attempt < 2; attempt++) {
        const reply = await askAi(prompt.system, prompt.user, { retryHint: hint });
        if (epoch !== ts.epoch) return false; // the test was closed or deleted meanwhile
        const cand = buildTestDoc(spec, reply, { levelId: spec.levelId, picFor: ctx.picFor, focusWords: ctx.focus, meta }, ts.doc);
        // A second try is kept unless it has fewer questions than the first.
        if (!next || count(cand) >= count(next)) next = cand;
        const short = shortParts(cand, [partId])[0];
        const same = old && partSimilarity(old, cand.sections.find((x) => x.id === partId)) >= 0.6;
        if (!short && !same) break;
        hint = short
          ? `Your part had only ${short.have} of the ${short.want} items. Write EXACTLY ${short.want} items plus the example — make the text or script longer if it needs more details.`
          : "Your part was almost the same as the old version. Write a really NEW one: a new situation, new sentences and new questions, following the teacher's wish.";
      }
      ts.doc = next;
      await checkKeys(ts.doc, [partId]);
      if (epoch !== ts.epoch) return false;
      ts.stale.delete(partId);
      refreshDoc();
      renderParts();
      if (btn) toast("Done — that part is new.", "ok", { ms: 2000 });
      return true;
    } catch (e) { aiErrorToast(e); return false; }
  });
}

function refreshDoc() {
  if (!ts.doc) return;
  ts.doc.meta.points = docPoints(ts.doc);
  ts.doc.meta.minutes = estimateMinutes(ts.spec);
  ts.doc.spec = JSON.parse(JSON.stringify(ts.spec));
  ts.doc.versionB = ts.spec.versions > 1 ? makeVersionB(ts.doc) : null;
  saveDoc(ts.doc);
  renderPaper();
}

/* ── Paper ────────────────────────────────────────────────────────── */
function sheetDoc() {
  if (ts.sheet === "B" && ts.doc?.versionB) return ts.doc.versionB;
  return ts.doc;
}
function sheetHtml(withAnswers = $("tsAnswers")?.checked) {
  const opts = { layout: { schoolName: prefs.schoolName || "" }, showAnswers: withAnswers };
  if (ts.sheet === "teacher") {
    const a = renderTeacherPack(ts.doc, opts);
    return ts.doc.versionB ? a + renderTeacherPack(ts.doc.versionB, opts) : a;
  }
  return renderStudentPaper(sheetDoc(), opts);
}
const sheetTitle = () => `${ts.doc?.meta?.title || "Test"}${ts.sheet === "teacher" ? " · Teacher's pack" : ts.doc?.versionB ? ` · Version ${ts.sheet}` : ""}`;

function renderSheetSeg() {
  const opts = [["A", ts.doc?.versionB ? "Version A" : "Student paper"], ...(ts.doc?.versionB ? [["B", "Version B"]] : []), ["teacher", "Teacher’s pack"]];
  if (!opts.some(([v]) => v === ts.sheet)) ts.sheet = "A";
  $("tsSheetSeg").innerHTML = segHtml("tsSheet", opts, ts.sheet);
  segmented($("tsSheetSeg").firstElementChild, { value: ts.sheet, onChange: (v) => { ts.sheet = v; renderPaper(); } });
}

function renderPaper() {
  const has = !!ts.doc;
  $("tsPaper").classList.toggle("hidden", !has);
  $("tsEmpty").classList.toggle("hidden", has);
  $("tsEditHint").classList.toggle("hidden", !has);
  $("tsEditHint").innerHTML = ts.sheet === "teacher"
    ? `${icon("pencil", "i-xs")}<span>Click a script or model answer to edit</span>`
    : `${icon("pencil", "i-xs")}<span>Click to edit · hover a question for ✨ Remake</span>`;
  $("tsSheetSeg").classList.toggle("hidden", !has);
  $("testsView").classList.toggle("has-doc", has);
  ["tsPrint", "tsPdf", "tsWord"].forEach((id) => { $(id).disabled = !has; });
  renderOutline();
  renderFoot();
  if (!has) { paper.clear(); $("tsProblems").innerHTML = ""; $("tsListen").innerHTML = ""; return; }
  paper.render(safePaperHtml(() => sheetHtml(), "test"));
  editor?.decorate();
  fitPaper($("tsStage"), $("tsPaper"));
  const byPart = ts.doc.sections.filter((s) => s.problems?.length);
  $("tsProblems").innerHTML = byPart.length ? `<div class="callout warning st-problems">${icon("alert")}<div><b>Worth a quick look before printing</b>${byPart.map((s) => `<div class="prob-row"><span>Part ${ts.doc.sections.indexOf(s) + 1} · ${esc(TASKS[s.task]?.label || "")}: ${esc(s.problems.slice(0, 2).map(friendlyProblem).join("; "))}</span>${fixButton(s)}</div>`).join("")}</div></div>` : "";
  renderListen();
}

/* ── Listening: natural / studio / computer voices, a player per track and a WAV per track ── */
const listeningParts = () => (ts.doc?.sections || []).map((s, i) => ({ s, i })).filter(({ s }) => s.skill === "listening" && s.script?.length);

function renderListen() {
  const parts = listeningParts();
  if (!parts.length) { $("tsListen").innerHTML = ""; return; }
  const chars = parts.reduce((n, { s }) => n + s.script.reduce((m, l) => m + String(l.text || "").length, 0), 0);
  $("tsListen").innerHTML = `<div class="listen-bar">
    <div class="lb-head">${icon("volume", "i-sm")}<b>Play the listening</b><span class="lb-voices">Voices ${voicePickerHtml()}</span></div>
    <div class="lb-tracks">${parts.map(({ s, i }) => `<div class="lb-track">
      <button type="button" class="btn btn-secondary btn-sm${ts.playing === s.id ? " playing" : ""}" data-play="${s.id}">${icon(ts.playing === s.id ? "pause" : "play", "i-sm")}${ts.playing === s.id ? "Stop" : `Track ${i + 1} · plays ${s.plays === 1 ? "once" : "twice"}`}</button>
      <button type="button" class="icon-btn sm" data-wav="${s.id}" data-tip="Save track ${i + 1} as an audio file (WAV) — for a speaker, a CD player or the class page" aria-label="Save track ${i + 1} as audio">${icon("download", "i-sm")}</button>
      ${statusPill(ts.status[s.id])}
    </div>`).join("")}</div>
    <small>${esc(voiceNote(chars, { downloaded: ts.naturalReady }))}</small>
  </div>`;
}

function setStatus(id, st) {
  ts.status[id] = st;
  const row = $("tsListen").querySelector(`[data-play="${id}"]`)?.parentElement;
  if (!row) return;
  row.querySelector(".vp-status")?.remove();
  row.insertAdjacentHTML("beforeend", statusPill(st));
}

function stopPlayer() {
  if (!ts.player) return;
  ts.player.stop();
  ts.player = null;
  ts.playing = null;
}

function togglePlay(id) {
  const was = ts.playing;
  if (ts.player) { stopPlayer(); delete ts.status[was]; renderListen(); if (was === id) return; }
  const s = ts.doc.sections.find((x) => x.id === id);
  if (!s) return;
  ts.playing = id;
  ts.player = playScript(s.script, {
    plays: s.plays,
    levelId: ts.doc.meta.classProfile,
    onStatus: (st) => {
      if (st.phase === "fallback") toast(st.message, "warn");
      if (st.phase === "prepare" && ts.status[id]?.phase === "play") return; // playing while the rest is made
      setStatus(id, st);
    },
    onEnd: () => { if (ts.playing === id) { ts.player = null; ts.playing = null; } delete ts.status[id]; ts.naturalReady = true; renderListen(); },
  });
  renderListen();
}

async function saveTrack(id, btn) {
  const part = listeningParts().find(({ s }) => s.id === id);
  if (!part || btn.disabled) return;
  btn.disabled = true;
  try {
    const { blob, seconds } = await scriptWav(part.s.script, { plays: part.s.plays, levelId: ts.doc.meta.classProfile, onStatus: (st) => setStatus(id, st) });
    setStatus(id, { phase: "save" });
    downloadBlob(blob, audioFileName(`${sheetTitle()} · Track ${part.i + 1}`));
    // In the app a Save window opens (the app says “Saved …” once the file is written); in a browser it downloads.
    if (!window.desktop) toast(`Track ${part.i + 1} saved as audio (${Math.round(seconds)} s).`, "ok", { ms: 2500 });
  } catch (e) {
    toast(e.message || "The audio file could not be made.", "error");
  } finally {
    btn.disabled = false;
    delete ts.status[id];
    ts.naturalReady = true;
    renderListen();
  }
}

/** Make the natural-voice clips in the background, so the listening plays at once in class. */
async function warmListening() {
  ts.naturalReady = await naturalDownloaded();
  renderListen();
  if (ts.doc) warmScripts(listeningParts().map(({ s }) => s.script), ts.doc.meta.classProfile);
}

function renderRecent() {
  const list = recentDocs("test").slice(0, 6);
  $("tsRecentWrap").classList.toggle("hidden", !list.length);
  const when = (iso) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d) ? d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) : ""; };
  $("tsRecent").innerHTML = list.length
    ? list.map((d) => `<div class="tb-recent-card${d.id === ts.doc?.id ? " is-open" : ""}" data-doc="${esc(d.id)}" style="--lvl:${LEVEL_COLORS[d.meta?.classProfile] || "var(--brand)"}">
        <button type="button" class="recent-open"><span class="trc-lvl">${esc((levelLabel(d.meta?.classProfile) || "?")[0])}</span><b>${esc(d.meta?.title || "Test")}${d.id === ts.doc?.id ? ` <span class="badge brand">Open</span>` : ""}</b><span>${esc(d.meta?.subtitle || "")}</span>
          <span class="trc-meta">${plural(d.sections?.length || 0, "part")} · ${esc(d.meta?.points || "")} pts${when(d.savedAt) ? ` · ${esc(when(d.savedAt))}` : ""}</span></button>
        <button type="button" class="icon-btn sm danger trc-del" data-del aria-label="Delete">${icon("trash", "i-sm")}</button></div>`).join("")
    : `<p class="st-hint">Your tests are kept here, so you can open and print them again any time.</p>`;
}

function renderAll() {
  renderShape();
  renderFocus();
  renderParts();
  renderOptions();
  renderSheetSeg();
  renderRecent();
  renderPaper();
  warmListening();
}

export function renderTestsView() {
  if (!built) build();
  renderAll();
  // A test opened from the Home screen shows its paper.
  if (ts.showResult) { ts.showResult = false; wiz.show(RESULT, { scroll: false }); }
}

/** Settings from the assistant: { spec (partial), picker (state) }. */
export function applyTestPreset({ spec = {}, picker: pk = null } = {}) {
  if (!built) build();
  const levelId = spec.levelId || ts.spec.levelId;
  ts.levelTouched = true;
  ts.spec = { ...testDefaults(levelId, spec.length || "standard"), ...spec, title: spec.title || "" };
  // The test that was open stays in the Library; the assistant's plan starts a new one.
  ts.epoch++;
  stopPlayer();
  setDoc(null);
  ts.ctx = null; ts.stale.clear(); ts.sheet = "A";
  if (pk) {
    // A topic plan already carries its topic in Step 1, so the assistant's note isn't a second topic.
    if (pk.kind === "topic" && ts.spec.topic && pk.topic) ts.spec.topic = "";
    ts.sourceKey = "";
    picker.set(pk);
  }
  savePrefs();
  renderAll();
  wiz.show(RESULT - 1, { scroll: false });
}
export function generateTestNow() { return generate($("tsGenerate")); }

/** Show a saved test, with Step 1 set back to the unit, words or topic it was written from. */
function openDoc(d) {
  // A part still being rewritten for the test that was open is dropped when its reply comes.
  if (ts.doc?.id !== d.id) { ts.epoch++; stopPlayer(); }
  setDoc(relabelDoc(d));
  ts.spec = { ...ts.spec, ...JSON.parse(JSON.stringify(d.spec)), grammarOwn: "" };
  ts.levelTouched = true;
  ts.stale.clear(); ts.sheet = "A"; ts.ctx = null;
  let src = d.spec?.source || {};
  // A test written from the old "My word list" (Worksheets words): its book and unit when it had one,
  // otherwise its words come back as the teacher's own words.
  if (src.kind === "words") {
    const bookId = resolveCoursebookId(d.meta?.bookTitle || "");
    const unit = Number.parseInt(src.unit ?? d.meta?.unit, 10);
    src = bookId && unit >= 1 && unit <= 9 ? { kind: "unit", bookId, units: [unit] } : { kind: "topic" };
  }
  let pk = null;
  const words = (d.focusWords || []).filter((w) => w.english);
  const asOwn = (list) => list.map((w) => ({ english: w.english, greek: w.greek || "" }));
  if (src.kind === "unit" && CPP_BOOKS[src.bookId]) {
    const units = src.units?.length ? src.units : [1];
    const sections = src.sections?.length ? src.sections : ["BQ", "A", "B"];
    // The unit's words come back as picked words; the rest (own words, or words of tests saved before own words) as own words.
    const inUnit = new Set(units.flatMap((u) => unitWords(src.bookId, u, sections)).map((w) => w.english.toLowerCase()));
    const picked = words.filter((w) => !w.own && inUnit.has(w.english.toLowerCase())).map((w) => w.english.toLowerCase());
    const own = asOwn(words.filter((w) => w.own || !inUnit.has(w.english.toLowerCase())));
    pk = { kind: "unit", bookId: src.bookId, units, sections, focusMode: picked.length ? "pick" : "key", picked, own };
  } else if (src.kind === "topic") {
    pk = { kind: "topic", topic: d.spec.topic || "", own: asOwn(words) };
    ts.spec.topic = "";
  }
  if (pk) { ts.sourceKey = ""; picker.set(pk); }
  savePrefs();
}
