/* Unit test builder — choose book & unit(s) (or a topic), the class, the length, and edit the parts (skill, task,
 * items, points). One AI request writes the test from the whole unit (words by section, Big Question, readings,
 * lesson stories); any part can be rewritten alone. Version B, a teacher's pack, listening read by the app's
 * voices, click-to-edit items, and print / PDF / Word. */
import { CLASS_PROFILES, CPP_BOOKS, downloadBlob } from "../../app.js";
import { state, prefs, isCpp, filledWords, LEVEL_COLORS } from "../state.js";
import { readJSON, writeJSON } from "../bridge.js";
import { segmented, withBusy, openDialog } from "../ui.js";
import {
  $, esc, icon, plural, toast, createSourcePicker, createPaper, fitPaper, askAi, aiErrorToast, profileBlock, levelLabel,
  makePicFor, pickRow, printHtml, exportPdf, exportWord, recentDocs, saveDoc, deleteDoc, segHtml, switchHtml, stepperHtml, unitContextFor, owl, busyOverlay,
} from "./studio-common.js";
import { TASKS, SKILLS, tasksFor, defaultTask } from "../../studio/tasks.js";
import { GRAMMAR_MENU, LEVEL_IDS, DIFFICULTY, grammarLabel } from "../../studio/levels.js";
import { testDefaults, presetParts, makePart, testPrompt, buildTestDoc, keyCheckPrompt, applyKeyCheck, estimateMinutes, specPoints, partPoints, planProblems, planNotes, taskBlock, taskForSource, fitPartsToSource, defaultTitle, LENGTHS } from "../../studio/test-builder.js";
import { makeVersionB, docProblems, docPoints, normalizeItem, balanceChoices, LETTERS } from "../../studio/doc-model.js";
import { renderStudentPaper, renderTeacherPack } from "../../studio/doc-render.js";
import { buildUnitContext } from "../../studio/unit-context.js";
import { playScript, scriptWav, warmScripts, naturalDownloaded } from "../voices/listening.js";
import { audioFileName } from "../../studio/audio-track.js";
import { voicePickerHtml, pickVoice, voiceNote, statusPill } from "./voice-ui.js";
import { loadLessonJson } from "./studio-common.js";

const PREFS_KEY = "vm_tests_prefs_v1";
let picker;
let paper;
let built = false;
const ts = { spec: null, doc: null, sheet: "A", player: null, playing: null, ctx: null, stale: new Set(), status: {}, naturalReady: true };

const savePrefs = () => writeJSON(PREFS_KEY, ts.spec);

export function initTests() {
  const saved = readJSON(PREFS_KEY, null);
  ts.spec = saved?.levelId && Array.isArray(saved.parts) ? { ...testDefaults(saved.levelId), ...saved } : testDefaults(state.profileId || "B_SENIOR");
}

function build() {
  const host = $("testsView");
  const step = (n, title, sub, body, extra = "") => `<section class="tb-step" data-step="${n}">
      <header class="tb-step-head"><span class="tb-num">${n}</span><div><h3>${title}${extra}</h3><p>${sub}</p></div></header>
      ${body}
    </section>`;
  host.innerHTML = `
  <div class="studio-layout tb">
    <div class="studio-settings tb-builder">
      <div class="tb-head">
        <span class="tb-head-ico">${icon("clipboard")}</span>
        <div class="tb-head-text"><b>Test builder</b><span id="tsSummary"></span></div>
      </div>
      <div class="tb-steps">
        ${step(1, "What does the test cover?", "A coursebook unit, your word list, or a grammar point or topic — then the grammar it tests.", `<div id="tsSource"></div><div id="tsFocus" class="tb-focus"></div>`)}
        ${step(2, "Your class &amp; how long", "Sets the level of the language and the size of the test.", `<div id="tsShape"></div>`)}
        ${step(3, "The parts", "Each part is one exercise: change its type, its questions or its points.", `<div id="tsParts"></div>`, `<span class="st-sum" id="tsSum"></span>`)}
        ${step(4, "Final touches", "The title, versions, Greek help and what goes on the paper.", `<div id="tsOptions"></div>`)}
      </div>
      <div class="tb-foot">
        <div id="tsPlanNote"></div>
        <div class="tb-foot-row">
          <div class="tb-meter" id="tsMeter"></div>
          <button type="button" class="btn btn-magic btn-lg" id="tsGenerate">${icon("sparkles")}Write my test</button>
        </div>
      </div>
    </div>
    <div class="studio-paper tb-paper">
      <div class="paper-toolbar tb-toolbar">
        <div id="tsSheetSeg"></div>
        <button type="button" class="btn btn-ghost btn-sm hidden" id="tsNew" data-tip="Back to your tests (this one is saved)">${icon("plus", "i-sm")}New test</button>
        <span class="spacer"></span>
        <label class="switch sm"><input type="checkbox" id="tsAnswers" /><span class="track"></span><span class="sw-text">Show answers</span></label>
        <span class="export-pills tb-exports">
          <button type="button" class="btn btn-secondary btn-sm" id="tsPrint" disabled>${icon("printer", "i-sm")}Print</button>
          <button type="button" class="btn btn-secondary btn-sm" id="tsPdf" disabled>${icon("pdf", "i-sm")}PDF</button>
          <button type="button" class="btn btn-secondary btn-sm" id="tsWord" disabled>${icon("word", "i-sm")}Word</button>
        </span>
      </div>
      <div id="tsListen"></div>
      <div id="tsProblems"></div>
      <p class="edit-hint hidden" id="tsEditHint">${icon("pencil", "i-sm")}Tip: click any question on the paper to change it.</p>
      <div class="paper-stage tb-stage" id="tsStage"><div class="paper hidden" id="tsPaper"></div>
        <div class="studio-empty tb-empty" id="tsEmpty">
          <div class="tb-empty-hero">
            <div class="empty-owl">${owl()}</div>
            <div>
              <span class="tb-kicker">${icon("sparkles", "i-xs")}Unit test</span>
              <h3>A complete test in under a minute</h3>
              <p>Choose the unit and your class, check the parts, then press <b>Write my test</b>. You get the children’s paper (and a version B if you like) plus a teacher’s pack with the answers, the listening scripts and a marking guide.</p>
            </div>
          </div>
          <div class="tb-features">
            <div><span>${icon("layers")}</span><b>4 skills</b><small>Listening, reading, vocabulary, grammar, writing</small></div>
            <div><span>${icon("copy")}</span><b>Version A + B</b><small>Same test, shuffled — no copying</small></div>
            <div><span>${icon("volume")}</span><b>Listening voices</b><small>Played by natural voices, saved as audio</small></div>
            <div><span>${icon("key")}</span><b>Teacher’s pack</b><small>Answers, scripts and a marking guide</small></div>
          </div>
          <div class="tb-recent"><h4>${icon("clock", "i-sm")}Your recent tests</h4><div id="tsRecent" class="tb-recent-grid"></div></div>
        </div>
      </div>
    </div>
  </div>`;
  picker = createSourcePicker({ multiUnit: true, allowTopic: true, topicPlaceholder: "e.g. daily routines, my town, Present Simple vs Present Continuous", onChange: onSourceChange });
  picker.mount($("tsSource"));
  $("tsSource").addEventListener("click", (e) => { if (e.target.closest("[data-pk-toggle]") && ts.focusOpen) { ts.focusOpen = null; renderFocus(); } });
  paper = createPaper($("tsPaper"));
  new ResizeObserver(() => fitPaper($("tsStage"), $("tsPaper"))).observe($("tsStage"));

  $("tsShape").addEventListener("click", (e) => {
    const lvl = e.target.closest("[data-level]");
    if (lvl) { ts.levelTouched = true; setLevel(lvl.dataset.level); return; }
    const len = e.target.closest("[data-length]");
    if (len) {
      ts.spec.length = len.dataset.length;
      ts.spec.parts = presetParts(ts.spec.length, ts.spec.levelId, { pictures: ts.spec.pictures });
      fitParts({ quiet: true });
      savePrefs();
      renderShape(); renderParts();
    }
  });
  $("tsFocus").addEventListener("click", (e) => {
    const tog = e.target.closest("[data-pk-toggle]");
    // One line open at a time in Step 1: opening grammar or texts closes the source's line.
    if (tog) { ts.focusOpen = ts.focusOpen === tog.dataset.pkToggle ? null : tog.dataset.pkToggle; if (ts.focusOpen) picker.close(); renderFocus(); return; }
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
    refreshFocusValues();
    savePrefs();
  });
  $("tsParts").addEventListener("click", onPartsClick);
  $("tsParts").addEventListener("change", (e) => {
    const sel = e.target.closest("[data-part-task]");
    if (!sel) return;
    const p = ts.spec.parts.find((x) => x.id === sel.dataset.partTask);
    const fresh = makePart(p.skill, sel.value, ts.spec.levelId);
    Object.assign(p, { task: sel.value, items: fresh.items, points: fresh.points, words: fresh.words });
    markStale(p.id);
    savePrefs(); renderParts();
  });
  $("tsParts").addEventListener("input", (e) => {
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
    if (k === "pictures") { renderParts(); }
  });
  $("tsOptions").addEventListener("input", (e) => {
    if (e.target.id !== "tsTitle") return;
    ts.spec.title = e.target.value;
    savePrefs();
  });
  // The open test takes the new title when the teacher leaves the field (an empty field puts the usual title back).
  $("tsOptions").addEventListener("change", (e) => {
    if (e.target.id !== "tsTitle" || !ts.doc) return;
    ts.doc.meta.title = ts.spec.title.trim() || defaultTitle(sourceInfo().src) || ts.doc.meta.title;
    refreshDoc();
  });
  $("tsNew").addEventListener("click", () => { stopPlayer(); ts.doc = null; ts.ctx = null; ts.stale.clear(); ts.spec.title = ""; savePrefs(); renderAll(); });
  $("tsGenerate").addEventListener("click", (e) => generate(e.currentTarget));
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
  $("tsProblems").addEventListener("click", (e) => { const b = e.target.closest("[data-rewrite]"); if (b) rewritePart(b.dataset.rewrite, b); });
  $("tsRecent").addEventListener("click", (e) => {
    const row = e.target.closest("[data-doc]");
    if (!row) return;
    if (e.target.closest("[data-del]")) { deleteDoc(row.dataset.doc); renderRecent(); return; }
    const d = recentDocs("test").find((x) => x.id === row.dataset.doc);
    if (d) { openDoc(d); renderAll(); toast("Opened a saved test.", "ok", { ms: 2000 }); }
  });
  paperEditing();
  built = true;
}

function setLevel(levelId, { quiet = false } = {}) {
  const old = ts.spec;
  // A new class brings its own parts and item counts; what the teacher chose about the content stays.
  ts.spec = {
    ...testDefaults(levelId, old.length),
    topic: old.topic, title: old.title, grammar: old.grammar || [], grammarOwn: old.grammarOwn || "",
    versions: old.versions, difficulty: old.difficulty || "level", pictures: old.pictures !== false, studentHeader: old.studentHeader !== false,
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
  // "My word list" from the coursebook still gets that unit's stories and Big Question (contextFor).
  const hasUnit = sel.kind === "unit" || (sel.kind === "words" && isCpp());
  return { sel, pictureWords, hasUnit, src: { kind: sel.kind, hasUnit, pictureWords: pictureWords.length, units: sel.units, unit: sel.meta?.unit } };
}

/** The unit(s) the texts are about: "Unit 4 · How do volcanoes change the land?" */
function unitThemes(sel) {
  if (sel.kind === "unit") return sel.units.map((u) => `Unit ${u} · ${CPP_BOOKS[sel.bookId]?.units?.[u]?.title || ""}`);
  if (sel.kind === "words" && isCpp()) return [`Unit ${state.cpp.unit} · ${CPP_BOOKS[state.cpp.bookId]?.units?.[state.cpp.unit]?.title || ""}`];
  return [];
}

const grammarList = () => [...ts.spec.grammar, ...(ts.spec.grammarOwn?.trim() ? [grammarLabel(ts.spec.grammarOwn)] : [])];

function onSourceChange(sel, { byUser = true } = {}) {
  const key = sourceKey(sel);
  if (byUser) {
    if (sel.kind === "unit" && sel.level && !ts.levelTouched && sel.level !== ts.spec.levelId) setLevel(sel.level, { quiet: true });
    // A title written for one unit doesn't belong on another unit's test.
    if (ts.sourceKey && key !== ts.sourceKey && ts.spec.title) { ts.spec.title = ""; savePrefs(); }
  }
  ts.sourceKey = key;
  // Another kind of source starts with its lines closed (a topic test opens its grammar).
  if (sel.kind !== ts.sourceKind) { ts.sourceKind = sel.kind; ts.focusOpen = undefined; }
  // A saved test that was just opened keeps its parts as they were written.
  if (byUser || !ts.doc) fitParts({ quiet: !byUser });
  renderFocus();
  renderOptions();
  renderParts();
}

/** Swap parts the source can't support (picture tasks without picture words, the Big Question without a unit). */
function fitParts({ quiet = false } = {}) {
  if (!picker) return;
  const changed = fitPartsToSource(ts.spec.parts, ts.spec.levelId, sourceInfo().src);
  if (!changed.length) return;
  changed.forEach((c) => markStale(c.id));
  savePrefs();
  if (!quiet) toast(changed.map((c) => `Part ${ts.spec.parts.findIndex((p) => p.id === c.id) + 1} is now “${TASKS[c.to].label}” — “${TASKS[c.from].label}” ${c.reason}.`).join(" "), "info", { ms: 4200 });
}

/** What the Grammar and Texts lines say when closed. */
function focusValues(sel = picker.value()) {
  const { hasUnit } = sourceInfo(sel);
  const chosen = grammarList();
  const topic = String(ts.spec.topic || "").trim();
  const grammar = chosen.length ? esc(chosen.join(", ")) : sel.kind === "topic" ? `<small>Choose, or leave it to the topic</small>` : hasUnit ? "The unit’s grammar" : "What the class knows";
  const texts = hasUnit
    ? `${esc(unitThemes(sel).join(", "))}${topic ? ` <small>· ${esc(topic)}</small>` : ""}`
    : topic ? esc(topic) : "<small>Lingo chooses</small>";
  return { grammar, texts };
}

/* Grammar and the texts, as two compact lines under the source; they say what the source already brings. */
function renderFocus() {
  if (!picker) return;
  const sel = picker.value();
  const { hasUnit } = sourceInfo(sel);
  const s = ts.spec;
  const topicMode = sel.kind === "topic";
  const chosen = grammarList();
  // A topic test is mostly about its grammar: that line starts open.
  if (ts.focusOpen === undefined) ts.focusOpen = topicMode ? "grammar" : null;
  const menu = [...new Set([...(GRAMMAR_MENU[s.levelId] || []), ...s.grammar])];
  const chips = menu.map((g) => `<button type="button" class="chip${s.grammar.includes(g) ? " active" : ""}" data-grammar="${esc(g)}">${esc(g)}</button>`).join("");
  const grammarHint = topicMode
    ? "Choose one or more, or type your own — or leave it and just type the topic above."
    : hasUnit
      ? "Lingo takes the grammar from the unit’s example sentences. Choose a point only to put the focus on it."
      : "These words don’t come from a coursebook unit: choose the grammar to test, or leave it to what the class knows.";
  const defaultChip = topicMode ? "" : `<button type="button" class="chip tb-default${chosen.length ? "" : " active"}" data-grammar="">${icon(hasUnit ? "book-open" : "graduation", "i-xs")}${hasUnit ? "The unit’s grammar" : "What the class knows"}</button>`;
  const v = focusValues(sel);
  const grammarBody = `<div class="gram-chips">${defaultChip}${chips}</div>
      <input class="input sm" id="tsGrammarOwn" placeholder="…or type a grammar point" value="${esc(s.grammarOwn || "")}" />
      <p class="pk-note">${esc(grammarHint)}</p>`;
  const textsBody = hasUnit
    ? `<p class="pk-note">About the unit’s Big Question, stories and readings. Add a setting if you like:</p>
      <input class="input sm" id="tsTopic" placeholder="e.g. a school trip" value="${esc(s.topic || "")}" />`
    : `<input class="input sm" id="tsTopic" placeholder="e.g. a day at the zoo — or leave it to Lingo" value="${esc(s.topic || "")}" />
      <p class="pk-note">Your words don’t come with a unit’s stories, so the texts can be about anything you like.</p>`;
  $("tsFocus").innerHTML = `<div class="pk-rows">
    ${pickRow("grammar", "Grammar", v.grammar, ts.focusOpen === "grammar", grammarBody)}
    ${topicMode ? "" : pickRow("texts", "Texts", v.texts, ts.focusOpen === "texts", textsBody)}
  </div>`;
}

/** Keep the closed lines in step while the teacher types. */
function refreshFocusValues() {
  const v = focusValues();
  const set = (k, html) => { const el = $("tsFocus").querySelector(`[data-pk="${k}"] .pk-val`); if (el) el.innerHTML = html; };
  set("grammar", v.grammar);
  set("texts", v.texts);
}

function renderShape() {
  const s = ts.spec;
  const p = CLASS_PROFILES[s.levelId];
  const lenIcon = { quiz: "zap", standard: "clipboard", full: "layers" };
  $("tsShape").innerHTML = `
    <div class="tb-levels" role="radiogroup" aria-label="Class">${LEVEL_IDS.map((id) => `<button type="button" role="radio" aria-checked="${id === s.levelId}" class="tb-level${id === s.levelId ? " active" : ""}" data-level="${id}" style="--lvl:${LEVEL_COLORS[id]}"><span class="tb-level-l">${esc(CLASS_PROFILES[id].label[0])}</span><small>${esc(CLASS_PROFILES[id].cefr)}</small></button>`).join("")}</div>
    <p class="tb-level-note"><b>${esc(p.label)}</b> · ${esc(p.greekGrades)} · ages ${esc(p.ageRange)}</p>
    <div class="len-cards">${Object.entries(LENGTHS).map(([k, l]) => `<button type="button" class="len-card${s.length === k ? " active" : ""}" data-length="${k}"><span class="len-ico">${icon(lenIcon[k] || "clipboard", "i-sm")}</span><b>${esc(l.label)}</b><small>≈ ${l.minutes} min · ${l.skills.length} parts</small></button>`).join("")}</div>
    <div class="tb-field"><span class="st-lbl">Difficulty</span>${segHtml("difficulty", Object.entries(DIFFICULTY).map(([k, v]) => [k, v.label.replace("Right for the class", "Just right")]), s.difficulty)}</div>`;
  $("tsShape").querySelectorAll("[data-segmented]").forEach((root) => segmented(root, { value: s[root.dataset.seg], onChange: (v) => { s[root.dataset.seg] = v; savePrefs(); } }));
}

/* ── Parts editor ─────────────────────────────────────────────────── */
function markStale(id) { if (ts.doc) ts.stale.add(id); }

function renderParts() {
  const s = ts.spec;
  const src = picker ? sourceInfo().src : null;
  const taskOption = (x, p) => {
    const why = src && x.id !== p.task ? taskBlock(x.id, src) : "";
    return `<option value="${x.id}" ${x.id === p.task ? "selected" : ""}${why ? " disabled" : ""}>${esc(x.label)}${why ? ` — ${esc(why)}` : ""}</option>`;
  };
  const rows = s.parts.map((p, i) => {
    const t = TASKS[p.task];
    const open = t.answer === "open";
    const stale = ts.stale.has(p.id);
    return `<div class="part-card${stale ? " stale" : ""}" data-part="${p.id}" data-skill="${p.skill}">
      <div class="pc-top">
        <span class="pc-ico" aria-hidden="true">${SKILLS[p.skill].icon}</span>
        <div class="pc-title">
          <small>Part ${i + 1} · ${esc(SKILLS[p.skill].label)}${stale ? ` · <em>changed</em>` : ""}</small>
          <select class="select sm" data-part-task="${p.id}" aria-label="Task for part ${i + 1}">${tasksFor(p.skill).map((x) => taskOption(x, p)).join("")}</select>
        </div>
        <span class="part-acts">
          <button type="button" class="icon-btn sm" data-move="-1" aria-label="Move up" ${i === 0 ? "disabled" : ""}>${icon("chevron-up", "i-sm")}</button>
          <button type="button" class="icon-btn sm" data-move="1" aria-label="Move down" ${i === s.parts.length - 1 ? "disabled" : ""}>${icon("chevron-down", "i-sm")}</button>
          <button type="button" class="icon-btn sm danger" data-remove aria-label="Remove part">${icon("trash", "i-sm")}</button>
        </span>
      </div>
      <div class="pc-ctl">
        ${open ? `<span class="part-ctl">${stepperHtml(`pts:${p.id}`, p.points || 10, 4, 30)}<small>points</small></span>` : `<span class="part-ctl">${stepperHtml(`items:${p.id}`, p.items, 3, 12)}<small>questions</small></span>`}
        ${p.skill === "writing" && p.words ? `<span class="part-ctl">${stepperHtml(`words:${p.id}`, p.words[1], 15, 150)}<small>words max</small></span>` : ""}
        <span class="pc-pts">${partPoints(p)}<small>pts</small></span>
      </div>
      <input class="input sm part-note" data-part-note="${p.id}" placeholder="Any wish for this part? (optional) e.g. “about a school trip”" value="${esc(p.note || "")}" />
      ${ts.doc ? `<button type="button" class="btn ${stale ? "btn-primary" : "btn-ghost"} btn-sm part-rewrite" data-rewrite="${p.id}">${icon("refresh", "i-sm")}${stale ? "Write this part" : "Write it again"}</button>` : ""}
    </div>`;
  }).join("");
  $("tsParts").innerHTML = `<div class="part-list">${rows || `<p class="st-hint">No parts yet — add one below.</p>`}</div>
    <div class="add-parts"><span>Add a part</span><div class="add-grid">${Object.entries(SKILLS).filter(([k]) => k !== "dictation").map(([k, v]) => `<button type="button" class="add-tile" data-add="${k}" data-skill="${k}"><span>${v.icon}</span>${esc(v.label)}${icon("plus", "i-xs")}</button>`).join("")}</div></div>`;
  const sum = `${plural(s.parts.length, "part")} · ${specPoints(s)} points · ≈ ${estimateMinutes(s)} min`;
  $("tsSum").textContent = sum;
  $("tsMeter").innerHTML = `<b>${specPoints(s)}</b><span>points</span><i></i><b>${s.parts.length}</b><span>${s.parts.length === 1 ? "part" : "parts"}</span><i></i><b>≈${estimateMinutes(s)}</b><span>min</span>`;
  renderPlanNote();
}

function onPartsClick(e) {
  const s = ts.spec;
  const add = e.target.closest("[data-add]");
  if (add) {
    const skill = add.dataset.add;
    s.parts.push(makePart(skill, picker ? taskForSource(skill, s.levelId, sourceInfo().src) : defaultTask(skill, s.levelId), s.levelId));
    markStale(s.parts.at(-1).id); savePrefs(); renderParts();
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
    <div class="st-row col"><span class="st-lbl">Title on the paper</span>
      <input class="input sm" id="tsTitle" placeholder="${esc(auto || "Lingo names it from the topic")}" value="${esc(s.title || "")}" />
      ${s.title?.trim() ? "" : `<small class="st-hint">${auto ? `Leave it empty for “${esc(auto)}”.` : "Leave it empty and Lingo gives the test a short title."}</small>`}</div>
    <div class="st-row"><span class="st-lbl">Versions</span>${segHtml("versions", [[1, "One version"], [2, "A + B (no copying!)"]], s.versions)}</div>
    <div class="st-switches">
      ${switchHtml("greek", "Instructions also in Greek", "A small Greek line under each English instruction", s.greek)}
      ${switchHtml("pictures", "Show pictures", "The app’s illustrations in picture tasks", s.pictures)}
      ${switchHtml("studentHeader", "Name & score box", "Name · Class · Date · Score at the top", s.studentHeader !== false)}
    </div>`;
  $("tsOptions").querySelectorAll("[data-segmented]").forEach((root) => segmented(root, { value: String(s[root.dataset.seg]), onChange: (v) => {
    s[root.dataset.seg] = Number(v);
    savePrefs();
    if (ts.doc) { ts.doc.versionB = s.versions > 1 ? makeVersionB(ts.doc) : null; ts.doc.meta.version = s.versions > 1 ? "A" : ""; renderSheetSeg(); renderPaper(); }
  } }));
}

/* ── Generation ───────────────────────────────────────────────────── */
async function contextFor(sel) {
  const focus = sel.focus;
  const picFor = makePicFor([...(sel.words || []), ...focus]);
  // Nouns first: picture tasks ask for things you can draw.
  const nounFirst = (a, b) => Number(/^n/.test(b.type || "")) - Number(/^n/.test(a.type || ""));
  const pictureWords = [...new Set([...focus, ...(sel.words || [])].filter((w) => picFor(w.english)).sort(nounFirst).map((w) => w.english))].slice(0, 16);
  let unitContext = await unitContextFor(sel);
  // Step 2 words from a coursebook unit still get that unit's context.
  if (!unitContext && sel.kind === "words" && isCpp()) unitContext = await buildUnitContext({ bookId: state.cpp.bookId, units: [state.cpp.unit] }, { loadLesson: loadLessonJson });
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

/** The line under the test's title and in the header: the unit, the word list, or the topic and grammar. */
const sourceLabel = (sel, spec = specForAi().spec) => (sel.kind === "topic" ? [spec.topic, ...spec.grammar].filter(Boolean).join(" · ") || "A grammar point or topic" : sel.label);

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
  $("tsGenerate").disabled = !!probs.length;
}

async function generate(btn) {
  const { sel, spec } = specForAi();
  const stopBusy = busyOverlay($("tsStage"), { title: "Lingo is writing your test…", note: "Usually 20–40 seconds — a full 4-skills test can take a minute", steps: [[0, "Reading the unit: words, stories and the Big Question"], [4, `Writing ${plural(spec.parts.length, "part")} for ${levelLabel(spec.levelId)}`], [14, "Writing the listening and reading texts"], [26, "Checking every answer and mixing the answer key"], [45, "Almost there…"]] });
  await withBusy(btn, async () => {
    try {
      const ctx = await contextFor(sel);
      const { system, user } = testPrompt(spec, { unitContext: ctx.unitContext, focusWords: ctx.focus, pictureWords: ctx.pictureWords, profileBlock: profileBlock(spec.levelId) });
      const reply = await askAi(system, user);
      const meta = { ...sel.meta, label: sourceLabel(sel, spec), classLabel: levelLabel(spec.levelId) };
      ts.ctx = { ...ctx, meta };
      ts.doc = buildTestDoc(spec, reply, { levelId: spec.levelId, picFor: ctx.picFor, focusWords: ctx.focus, meta });
      await checkKeys(ts.doc);
      ts.doc.versionB = spec.versions > 1 ? makeVersionB(ts.doc) : null;
      ts.stale.clear();
      ts.sheet = "A";
      saveDoc(ts.doc);
      renderAll();
      const probs = docProblems(ts.doc);
      toast(probs.length ? `Your test is ready — ${plural(probs.length, "small thing")} to look at.` : `Your test is ready: ${plural(ts.doc.sections.length, "part")}, ${docPoints(ts.doc)} points.`, probs.length ? "warn" : "ok");
    } catch (e) { aiErrorToast(e); } finally { stopBusy(); }
  });
}

/** Yes/no keys are re-answered from the text alone by a second small call; a failed check leaves the test as it is. */
async function checkKeys(doc, parts = null) {
  const p = keyCheckPrompt(doc, parts);
  if (!p) return 0;
  try { return applyKeyCheck(doc, await askAi(p.system, p.user)); } catch { return 0; }
}

async function rewritePart(partId, btn) {
  if (!ts.doc) return;
  const { sel, spec } = specForAi();
  await withBusy(btn, async () => {
    try {
      const ctx = ts.ctx?.focus ? ts.ctx : await contextFor(sel);
      const { system, user } = testPrompt(spec, { unitContext: ctx.unitContext, focusWords: ctx.focus, pictureWords: ctx.pictureWords, profileBlock: profileBlock(spec.levelId) }, [partId]);
      const reply = await askAi(system, user);
      const meta = ts.ctx?.meta || { ...sel.meta, label: sourceLabel(sel, spec), classLabel: levelLabel(spec.levelId) };
      ts.doc = buildTestDoc(spec, reply, { levelId: spec.levelId, picFor: ctx.picFor, focusWords: ctx.focus, meta }, ts.doc);
      await checkKeys(ts.doc, [partId]);
      ts.stale.delete(partId);
      refreshDoc();
      renderParts();
      toast("Done — that part is new.", "ok", { ms: 2000 });
    } catch (e) { aiErrorToast(e); }
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
  $("tsEditHint").classList.toggle("hidden", !has || ts.sheet === "teacher");
  $("tsNew").classList.toggle("hidden", !has);
  $("tsSheetSeg").classList.toggle("hidden", !has);
  $("testsView").classList.toggle("has-doc", has);
  ["tsPrint", "tsPdf", "tsWord"].forEach((id) => { $(id).disabled = !has; });
  if (!has) { paper.clear(); $("tsProblems").innerHTML = ""; $("tsListen").innerHTML = ""; return; }
  paper.render(sheetHtml());
  fitPaper($("tsStage"), $("tsPaper"));
  const byPart = ts.doc.sections.filter((s) => s.problems?.length);
  $("tsProblems").innerHTML = byPart.length ? `<div class="callout warning st-problems">${icon("alert")}<div><b>Worth a quick look before printing</b>${byPart.map((s) => `<div class="prob-row"><span>Part ${ts.doc.sections.indexOf(s) + 1} · ${esc(TASKS[s.task]?.label || "")}: ${esc(s.problems.slice(0, 2).join("; "))}</span><button type="button" class="btn btn-ghost btn-sm" data-rewrite="${s.id}">${icon("refresh", "i-sm")}Write it again</button></div>`).join("")}</div></div>` : "";
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
    toast(`Track ${part.i + 1} saved as audio (${Math.round(seconds)} s).`, "ok", { ms: 2500 });
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

/* Click a question on the paper to edit it (prompt, options, answer). */
function paperEditing() {
  paper.root.addEventListener("click", (e) => {
    if (ts.sheet === "teacher") return;
    const itemEl = e.composedPath().find((n) => n.classList?.contains("st-item") || n.classList?.contains("pic-card"));
    if (!itemEl) return;
    const secEl = itemEl.closest("section.st-sec");
    const secs = [...paper.root.querySelectorAll("section.st-sec")];
    const doc = sheetDoc();
    const section = doc.sections[secs.indexOf(secEl)];
    if (!section || section.answerType === "open" || section.skill === "dictation") return;
    const items = [...secEl.querySelectorAll(".st-item:not(.st-example), .pic-card:not(.st-example)")];
    const item = section.items[items.indexOf(itemEl)];
    if (item) openItemEditor(section, item);
  });
}

function openItemEditor(section, item) {
  const choice = section.answerType === "choice";
  openDialog({
    title: `Edit question ${item.n}`,
    subtitle: `${SKILLS[section.skill]?.label} · ${TASKS[section.task]?.label}`,
    iconName: "pencil",
    sheet: true,
    body: `<div class="field"><label class="label" for="te_prompt">Question / sentence</label><textarea class="textarea" id="te_prompt" rows="3">${esc(item.prompt || "")}</textarea></div>
      ${choice ? `<div class="field"><label class="label" for="te_opts">Options <span class="opt">one per line</span></label><textarea class="textarea" id="te_opts" rows="4">${esc(item.options.join("\n"))}</textarea></div>` : ""}
      <div class="field"><label class="label" for="te_ans">Right answer</label><input class="input" id="te_ans" value="${esc(item.answer || "")}" autocomplete="off" /></div>`,
    foot: `<span class="spacer"></span><button type="button" class="btn btn-secondary" data-close>Cancel</button><button type="button" class="btn btn-primary" data-save>Save</button>`,
    onMount(root, close) {
      root.querySelector("[data-save]").addEventListener("click", () => {
        const raw = { prompt: root.querySelector("#te_prompt").value, answer: root.querySelector("#te_ans").value, options: choice ? root.querySelector("#te_opts").value.split("\n") : undefined };
        const { item: fixed, problems } = normalizeItem(raw, section.task, { levelId: ts.doc.meta.classProfile, picFor: ts.ctx?.picFor });
        if (problems.length) { toast(problems.join(" · "), "warn"); return; }
        // Edits go to both versions: the same question keeps its place in A; B is rebuilt.
        const target = ts.doc.sections.find((s) => s.id === section.id);
        const it = target.items.find((x) => x.prompt === item.prompt && x.answer === item.answer) || target.items[item.n - 1];
        Object.assign(it, fixed, { n: it.n });
        if (choice) balanceChoices([it]);
        close();
        refreshDoc();
        toast("Question saved.", "ok", { ms: 1800 });
      });
    },
  });
}

function renderRecent() {
  const list = recentDocs("test").slice(0, 6);
  const when = (iso) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d) ? d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) : ""; };
  $("tsRecent").innerHTML = list.length
    ? list.map((d) => `<div class="tb-recent-card" data-doc="${esc(d.id)}" style="--lvl:${LEVEL_COLORS[d.meta?.classProfile] || "var(--brand)"}">
        <button type="button" class="recent-open"><span class="trc-lvl">${esc((levelLabel(d.meta?.classProfile) || "?")[0])}</span><b>${esc(d.meta?.title || "Test")}</b><span>${esc(d.meta?.subtitle || "")}</span>
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
}

/** Settings from the assistant: { spec (partial), picker (state) }. */
export function applyTestPreset({ spec = {}, picker: pk = null } = {}) {
  if (!built) build();
  const levelId = spec.levelId || ts.spec.levelId;
  ts.levelTouched = true;
  ts.spec = { ...testDefaults(levelId, spec.length || "standard"), ...spec, title: spec.title || "" };
  ts.doc = null;
  if (pk) {
    // A topic plan already carries its topic in Step 1, so the assistant's note isn't a second topic.
    if (pk.kind === "topic" && ts.spec.topic && pk.topic) ts.spec.topic = "";
    if (pk.kind === "current" && filledWords().length < 3) pk = { kind: "unit", bookId: state.cpp.bookId || "CPP1", units: [state.cpp.unit || 1] };
    ts.sourceKey = "";
    picker.set(pk);
  }
  savePrefs();
  renderAll();
}
export function generateTestNow() { return generate($("tsGenerate")); }

/** Show a saved test, with Step 1 set back to the unit, words or topic it was written from. */
function openDoc(d) {
  ts.doc = d;
  ts.spec = { ...ts.spec, ...JSON.parse(JSON.stringify(d.spec)), grammarOwn: "" };
  ts.levelTouched = true;
  ts.stale.clear(); ts.sheet = "A"; ts.ctx = null;
  const src = d.spec?.source || {};
  let pk = null;
  if (src.kind === "unit" && CPP_BOOKS[src.bookId]) {
    const picked = (d.focusWords || []).map((w) => String(w.english || "").toLowerCase()).filter(Boolean);
    pk = { kind: "unit", bookId: src.bookId, units: src.units?.length ? src.units : [1], sections: src.sections?.length ? src.sections : ["BQ", "A", "B"], focusMode: picked.length ? "pick" : "key", picked };
  } else if (src.kind === "topic") {
    pk = { kind: "topic", topic: d.spec.topic || "" };
    ts.spec.topic = "";
  } else if (src.kind === "words" && filledWords().length >= 3) pk = { kind: "current" };
  if (pk) { ts.sourceKey = ""; picker.set(pk); }
  savePrefs();
}

/** Open a saved test (from the Home screen). */
export function openSavedTest(id) {
  if (!built) build();
  const d = recentDocs("test").find((x) => x.id === id);
  if (!d) return false;
  openDoc(d);
  return true;
}
