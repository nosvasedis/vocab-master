/* Read-aloud dictation — a step-by-step maker (like the Test Maker, in its own green): the words, the style, the
 * class and the sentences, then who writes them and how they are read; the last step is the paper with the
 * read-aloud player, print / PDF / Word for the student sheet, the teacher copy and the wall strips. */
import { CLASS_PROFILES, lookupCoursebookWord } from "../../app.js";
import { state, prefs, LEVEL_COLORS } from "../state.js";
import { readJSON, writeJSON } from "../bridge.js";
import {
  $, esc, icon, plural, toast, createSourcePicker, createPaper, fitPaper, askAi, aiErrorToast, profileBlock, levelLabel,
  makePicFor, printHtml, exportPdf, exportWord, recentDocs, saveDoc, deleteDoc, segHtml, switchHtml, stepperHtml, owl, busyOverlay,
  wizardNav, createWizard, classMemoryBrief,
} from "./studio-common.js";
import { segmented, withBusy } from "../ui.js";
import { dictationDefaults, dictationPrompt, bookSentences, buildDictationDoc, readAloudLines } from "../../studio/dictation.js";
import { DICTATION_STYLES } from "../../studio/tasks.js";
import { containsForm } from "../../studio/word-scope.js";
import { GRAMMAR_MENU, LEVEL_IDS, sentenceRange, DIFFICULTY, grammarLabel } from "../../studio/levels.js";
import { renderStudentPaper, renderTeacherPack, renderRunningStrips } from "../../studio/doc-render.js";
import { readDictation } from "../voices/listening.js";
import { voicePickerHtml, pickVoice, voiceNote, statusPill } from "./voice-ui.js";

const PREFS_KEY = "vm_dictation_prefs_v1";
const STYLE_ICON = { classic: "📝", gapped: "✏️", running: "🏃", dictogloss: "👂", picture: "🖼️" };
/** Which classes each style suits best (shown on the style cards). */
const STYLE_FOR = { classic: "Great for A–B", gapped: "Great for B–D", running: "Any class · gets them moving", dictogloss: "Great for D–E", picture: "Great for A–B" };
const STEPS = [
  { label: "Words", sub: "Unit or your list" },
  { label: "Style", sub: "How you dictate" },
  { label: "Sentences", sub: "Class and length" },
  { label: "Finish", sub: "Writer and reading" },
  { label: "Your dictation", sub: "Read aloud, print" },
];
const RESULT = STEPS.length - 1;

let picker;
let paper;
let wiz;
let built = false;
const dc = { spec: null, doc: null, sheet: "student", player: null, status: null };

function savePrefs() { writeJSON(PREFS_KEY, dc.spec); }
const grammarList = () => [...dc.spec.grammar, ...(dc.spec.grammarOwn?.trim() ? [grammarLabel(dc.spec.grammarOwn)] : [])];
const connectedStyle = () => dc.spec.style === "dictogloss" || dc.spec.style === "running";

export function initDictation() {
  const saved = readJSON(PREFS_KEY, null);
  dc.spec = saved?.levelId ? { ...dictationDefaults(saved.levelId), ...saved } : dictationDefaults(state.profileId || "B_SENIOR");
}

function build() {
  const host = $("dictationView");
  const head = (title, sub) => `<header class="mk-page-head"><div><h2>${title}</h2><p>${sub}</p></div></header>`;
  host.innerHTML = `
  <div class="mk mk-dictation">
    <header class="mk-top">
      <div class="mk-brand"><span class="mk-badge">${icon("mic")}</span><div><b>Read-aloud dictation</b><span id="dcSummary"></span></div></div>
      ${wizardNav(STEPS)}
    </header>
    <div class="mk-body">
      <section class="mk-page">
        ${head("Which words?", "The sentences are built around these words: a coursebook unit, or the list you made in Worksheets.")}
        <div class="mk-card"><div id="dcSource"></div></div>
        <div class="mk-recent hidden" id="dcRecentWrap"><h4>${icon("clock", "i-sm")}Or open one of your dictations</h4><div id="dcRecent" class="tb-recent-grid"></div></div>
      </section>
      <section class="mk-page" hidden>
        ${head("How will you dictate?", "Not sure? <b>Classic</b> suits younger classes; <b>Gapped</b> or <b>Dictogloss</b> suit older ones.")}
        <div class="style-grid" id="dcStyles"></div>
      </section>
      <section class="mk-page" hidden>
        ${head("Your class &amp; the sentences", "The class sets the length and the language of every sentence — the numbers below start from its defaults.")}
        <div id="dcShape" class="mk-stack"></div>
      </section>
      <section class="mk-page" hidden>
        ${head("Final touches", "Who writes the sentences, how you read them, and what goes on the paper.")}
        <div class="mk-finish"><div class="mk-card" id="dcOptions"></div><aside class="mk-ready" id="dcReady"></aside></div>
      </section>
      <section class="mk-page mk-result" hidden>
        <aside class="mk-outline" id="dcOutline"></aside>
        <div class="mk-paper tb-paper">
          <div class="paper-toolbar tb-toolbar">
            <div id="dcSheetSeg">${segHtml("dcSheet", [["student", "Student sheet"], ["teacher", "Teacher copy"], ["strips", "Wall strips"]], dc.sheet)}</div>
            <span class="dc-actions">
              <button type="button" class="btn btn-sm" id="dcRead" disabled data-tip="Each sentence is read, then read again slowly, with time to write">${icon("volume", "i-sm")}<span>Read it aloud</span></button>
              <span class="export-pills tb-exports">
                <button type="button" class="btn btn-secondary btn-sm" id="dcPrint" disabled>${icon("printer", "i-sm")}Print</button>
                <button type="button" class="btn btn-secondary btn-sm" id="dcPdf" disabled>${icon("pdf", "i-sm")}PDF</button>
                <button type="button" class="btn btn-secondary btn-sm" id="dcWord" disabled>${icon("word", "i-sm")}Word</button>
              </span>
            </span>
          </div>
          <div id="dcVoices"></div>
          <div id="dcProblems"></div>
          <div class="paper-stage tb-stage" id="dcStage"><div class="paper hidden" id="dcPaper"></div>
            <div class="mk-empty" id="dcEmpty">
              <div class="empty-owl">${owl()}</div>
              <h3>Your dictation will appear here</h3>
              <p>Check the four steps, then press <b>Make my dictation</b>. You get a sheet for the children and a copy for you, and the app reads every sentence aloud with time to write.</p>
              <button type="button" class="btn btn-secondary" data-mk-go="3">${icon("arrow-left", "i-sm")}Back to Final touches</button>
            </div>
          </div>
        </div>
      </section>
    </div>
    <footer class="mk-foot">
      <button type="button" class="btn btn-ghost" id="dcBack">${icon("arrow-left", "i-sm")}<span>Back</span></button>
      <div class="mk-foot-mid"><div id="dcPlanNote"></div><div class="tb-meter" id="dcMeter"></div></div>
      <button type="button" class="btn btn-primary" id="dcNext"><span>Next</span>${icon("arrow-right", "i-sm")}</button>
    </footer>
  </div>`;
  wiz = createWizard(host.querySelector(".mk"), { onShow: () => { renderFoot(); if (wiz?.index === RESULT) fitPaper($("dcStage"), $("dcPaper")); } });
  picker = createSourcePicker({ multiUnit: false, onChange: () => { renderShape(); }, review: true, level: () => dc.spec.levelId });
  picker.mount($("dcSource"));
  paper = createPaper($("dcPaper"));
  dc.sheetSeg = segmented(host.querySelector('[data-seg="dcSheet"]'), { value: dc.sheet, onChange: (v) => { dc.sheet = v; renderPaper(); } });
  new ResizeObserver(() => fitPaper($("dcStage"), $("dcPaper"))).observe($("dcStage"));

  $("dcBack").addEventListener("click", () => wiz.show(wiz.index - 1));
  $("dcNext").addEventListener("click", (e) => { if (wiz.index === RESULT - 1) generate(e.currentTarget); else wiz.show(wiz.index + 1); });
  $("dcStyles").addEventListener("click", (e) => {
    const b = e.target.closest("[data-style]");
    if (!b) return;
    dc.spec.style = b.dataset.style;
    savePrefs();
    renderStyles();
    renderShape();
  });
  const onControls = (e) => {
    const t = e.target;
    const step = t.closest("[data-stepper] [data-step]");
    if (step) {
      const box = step.closest("[data-stepper]");
      const k = box.dataset.stepper;
      dc.spec[k] = Math.max(Number(box.dataset.min), Math.min(Number(box.dataset.max), Number(dc.spec[k]) + Number(step.dataset.step) * (k === "textWords" ? 10 : 1)));
      savePrefs();
      renderShape();
      return;
    }
    const lvl = t.closest("[data-level]");
    if (lvl) { setLevel(lvl.dataset.level); return; }
    const src = t.closest("[data-source]");
    if (src) { dc.spec.source = src.dataset.source; savePrefs(); renderShape(); return; }
    const g = t.closest("[data-grammar]");
    if (g) {
      const v = g.dataset.grammar;
      if (v === "") { dc.spec.grammar = []; dc.spec.grammarOwn = ""; }
      else dc.spec.grammar = dc.spec.grammar.includes(v) ? dc.spec.grammar.filter((x) => x !== v) : [...dc.spec.grammar, v];
      savePrefs();
      renderShape();
    }
  };
  $("dcShape").addEventListener("click", onControls);
  $("dcShape").addEventListener("input", (e) => {
    if (e.target.id === "dcTopic") dc.spec.topic = e.target.value;
    if (e.target.id === "dcGrammarOwn") {
      dc.spec.grammarOwn = e.target.value;
      $("dcShape").querySelector('[data-grammar=""]')?.classList.toggle("active", !grammarList().length);
    }
    savePrefs();
    renderReady();
  });
  $("dcOptions").addEventListener("click", onControls);
  $("dcOptions").addEventListener("change", (e) => {
    const k = e.target.dataset.opt;
    if (k) { dc.spec[k] = e.target.checked; savePrefs(); if (dc.doc) { dc.doc.meta.greek = !!dc.spec.greek; dc.doc.meta.pictures = !!dc.spec.pictures; renderPaper(); } }
  });
  $("dcReady").addEventListener("click", (e) => { const b = e.target.closest("#dcGenerate"); if (b) generate(b); });
  $("dcOutline").addEventListener("click", (e) => {
    const again = e.target.closest("[data-again]");
    if (again) { generate(again); return; }
    if (e.target.closest("[data-new]")) { if (dc.player) toggleRead(); dc.doc = null; renderAll(); wiz.show(0); }
  });
  $("dcVoices").addEventListener("click", (e) => { if (pickVoice(e)) { if (dc.player) toggleRead(); renderVoices(); } });
  $("dcRead").addEventListener("click", toggleRead);
  $("dcPrint").addEventListener("click", () => printHtml(sheetHtml(), sheetTitle()));
  $("dcPdf").addEventListener("click", (e) => withBusy(e.currentTarget, () => exportPdf(sheetHtml(), sheetTitle(), fileBase())));
  $("dcWord").addEventListener("click", (e) => withBusy(e.currentTarget, () => exportWord(dc.doc, dc.sheet === "teacher" ? "teacher" : "student", fileBase()).catch((err) => toast(err.message, "error"))));
  $("dcRecent").addEventListener("click", (e) => {
    const row = e.target.closest("[data-doc]");
    if (!row) return;
    if (e.target.closest("[data-del]")) { deleteDoc(row.dataset.doc); renderRecent(); return; }
    const d = recentDocs("dictation").find((x) => x.id === row.dataset.doc);
    if (d) { dc.doc = d; dc.spec = { ...dc.spec, ...d.spec }; renderAll(); wiz.show(RESULT); toast("Opened a saved dictation.", "ok", { ms: 2000 }); }
  });
  built = true;
  wiz.show(0, { scroll: false });
}

function setLevel(levelId) {
  const keep = { style: dc.spec.style, grammar: dc.spec.grammar || [], grammarOwn: dc.spec.grammarOwn || "", topic: dc.spec.topic, source: dc.spec.source };
  dc.spec = { ...dictationDefaults(levelId), ...keep };
  savePrefs();
  renderAll();
  toast(`${levelLabel(levelId)} defaults: ${dc.spec.count} sentences of ${sentenceRange(levelId).join("–")} words.`, "info", { ms: 2600 });
}

/* Step 2: the five styles as big cards. */
function renderStyles() {
  $("dcStyles").innerHTML = Object.entries(DICTATION_STYLES).map(([id, s]) => `<button type="button" class="style-card${dc.spec.style === id ? " active" : ""}" data-style="${id}" aria-pressed="${dc.spec.style === id}"><span class="sc-ico">${STYLE_ICON[id]}</span><b>${esc(s.label)}</b><small>${esc(s.hint)}</small><span class="sc-best">${esc(STYLE_FOR[id] || "")}</span><span class="mk-tick">${icon("check", "i-xs")}</span></button>`).join("");
}

/* Step 3: the class (Worksheets level cards), the sentence settings, and the grammar and theme. */
function renderShape() {
  const s = dc.spec;
  const lvl = s.levelId;
  const p = CLASS_PROFILES[lvl];
  const [min, max] = sentenceRange(lvl, s.length, s.difficulty);
  const connected = connectedStyle();
  const book = s.source === "book";
  const chosen = grammarList();
  const menu = [...new Set([...(GRAMMAR_MENU[lvl] || []), ...s.grammar])];
  const unused = book ? `<p class="callout info mk-unused">${icon("info")}<span>The coursebook writes these sentences (Final touches), so grammar and theme aren’t used.</span></p>` : "";
  $("dcShape").innerHTML = `
    <div class="mk-card">
      <div class="mk-card-head"><span class="mk-card-ico">${icon("graduation")}</span><div><h3>Class</h3><p>Sets the length and the language of every sentence.</p></div></div>
      <div class="level-grid" role="radiogroup" aria-label="Class">${LEVEL_IDS.map((id) => {
    const lp = CLASS_PROFILES[id];
    return `<button type="button" class="level-card${id === lvl ? " selected" : ""}" data-level="${id}" role="radio" aria-checked="${id === lvl}" style="--lvl:${LEVEL_COLORS[id]}"><span class="lc-top"><span class="lc-letter">${esc(lp.label[0])}</span><span class="lc-check">${icon("check")}</span></span><span class="lc-name">${esc(lp.label)}</span><span class="lc-cefr">CEFR ${esc(lp.cefr)}</span><span class="lc-grade">${esc(lp.greekGrades)}</span></button>`;
  }).join("")}</div>
      <div class="level-detail"><span class="ld-item">${icon("graduation")}<span><strong>${esc(p.label)}</strong> · ages ${esc(p.ageRange)}</span></span><span class="ld-item">${icon("file")}<span>Sentences of <strong>${min}–${max} words</strong></span></span></div>
    </div>
    <div class="mk-card">
      <div class="mk-card-head"><span class="mk-card-ico">${icon("sliders")}</span><div><h3>The sentences</h3><p>${connected ? `${esc(DICTATION_STYLES[s.style].label)} uses one connected text.` : "How many, how long and how hard."}</p></div></div>
      <div class="dc-fields">
        ${connected
    ? `<div class="tb-field"><span class="st-lbl">Length of the text <small>about ${s.textWords} words</small></span><span class="dc-ctl">${stepperHtml("textWords", s.textWords, 20, 160)}<small class="st-note">words</small></span></div>`
    : `<div class="tb-field"><span class="st-lbl">How many sentences <small>${s.count} sentences</small></span>${stepperHtml("count", s.count, 3, 15)}</div>`}
        <div class="tb-field"><span class="st-lbl">Sentence length <small>${min}–${max} words each</small></span>${segHtml("length", [["short", "Short"], ["level", "For the class"], ["long", "Long"]], s.length)}</div>
        ${s.style === "picture" ? "" : `<div class="tb-field"><span class="st-lbl">Unit words in each sentence</span>${segHtml("targets", [[1, "1"], [2, "2"], [3, "3"]], s.targets)}</div>`}
        ${s.style === "gapped" ? `<div class="tb-field"><span class="st-lbl">Gaps in each sentence</span>${segHtml("gapsPerSentence", [[1, "1"], [2, "2"], [3, "3"]], s.gapsPerSentence)}</div>` : ""}
        <div class="tb-field"><span class="st-lbl">Difficulty</span>${segHtml("difficulty", Object.entries(DIFFICULTY).map(([k, v]) => [k, v.label.replace("Right for the class", "Just right")]), s.difficulty)}</div>
      </div>
    </div>
    <div class="mk-focus${book ? " mk-muted" : ""}">
      <div class="mk-card">
        <div class="mk-card-head"><span class="mk-card-ico">${icon("pencil")}</span><div><h3>Grammar to practise</h3><p>Most sentences will use it. Leave it to the class level, or choose one or more.</p></div></div>
        <div class="gram-chips"><button type="button" class="chip tb-default${chosen.length ? "" : " active"}" data-grammar="">${icon("graduation", "i-xs")}What the class knows</button>${menu.map((g) => `<button type="button" class="chip${s.grammar.includes(g) ? " active" : ""}" data-grammar="${esc(g)}">${esc(g)}</button>`).join("")}</div>
        <input class="input" id="dcGrammarOwn" placeholder="…or type your own, e.g. There is / there are" value="${esc(s.grammarOwn || "")}" />
      </div>
      <div class="mk-card">
        <div class="mk-card-head"><span class="mk-card-ico">${icon("bulb")}</span><div><h3>A theme</h3><p>One situation, so the sentences make sense together — or leave it to Lingo.</p></div></div>
        <input class="input" id="dcTopic" placeholder="e.g. a trip to the mountains, a birthday party" value="${esc(s.topic || "")}" />
      </div>
    </div>
    ${unused}`;
  $("dcShape").querySelectorAll("[data-segmented]").forEach((root) => {
    segmented(root, { value: String(s[root.dataset.seg]), onChange: (v) => { s[root.dataset.seg] = /^\d+$/.test(v) ? Number(v) : v; savePrefs(); renderShape(); } });
  });
  renderOptions();
}

/* Step 4: who writes the sentences, how they are read, the paper — and the summary with "Make my dictation". */
function renderOptions() {
  const s = dc.spec;
  const src = (id, ico, title, note) => `<button type="button" class="dc-src${s.source === id ? " active" : ""}" data-source="${id}" aria-pressed="${s.source === id}"><span class="dc-src-ico">${icon(ico, "i-sm")}</span><b>${title}</b><small>${note}</small></button>`;
  $("dcOptions").innerHTML = `
    <div class="mk-card-head"><span class="mk-card-ico">${icon("sparkles")}</span><div><h3>Who writes the sentences?</h3><p>The AI follows your grammar and theme; the coursebook’s own sentences are free and instant.</p></div></div>
    <div class="dc-srcs">${src("ai", "sparkles", "The AI, for my class", "Follows your grammar, theme and length · a few seconds")}${src("book", "book", "The coursebook", "Its own example sentences · free, instant, offline")}</div>
    <div class="mk-row"><span class="mk-lbl">Read each sentence</span>${segHtml("repeats", [[1, "once"], [2, "twice"], [3, "3 times"]], s.repeats)}</div>
    <div class="st-switches mk-switches">
      ${switchHtml("punctuationAloud", "Say the punctuation", "“comma”, “full stop” — great for younger classes", s.punctuationAloud)}
      ${switchHtml("greek", "Instructions also in Greek", "A small Greek line under the English one", s.greek)}
      ${switchHtml("pictures", "Show pictures", "The app’s illustrations (picture dictation)", s.pictures)}
    </div>`;
  $("dcOptions").querySelectorAll("[data-segmented]").forEach((root) => {
    segmented(root, { value: String(s[root.dataset.seg]), onChange: (v) => { s[root.dataset.seg] = /^\d+$/.test(v) ? Number(v) : v; savePrefs(); renderOptions(); } });
  });
  renderReady();
  renderFoot();
}

function planProblem() {
  const words = picker?.value().focus || [];
  if (words.length < 3) return "Choose at least 3 words in step 1.";
  if (dc.spec.style === "picture" && words.filter((w) => makePicFor(words)(w.english)).length < 3) return "Picture dictation needs 3+ words that have pictures — choose more words or another style.";
  return "";
}

function renderReady() {
  if (!picker || !$("dcReady")) return;
  const s = dc.spec;
  const sel = picker.value();
  const [min, max] = sentenceRange(s.levelId, s.length, s.difficulty);
  const prob = planProblem();
  // Own words the book has no example sentence for can't be in a coursebook dictation.
  const noBookSentence = withExamples(sel.focus.filter((w) => w.own), sel.meta).filter((w) => !w.example || !containsForm(w.example, w.english));
  const reads = { 1: "once", 2: "twice", 3: "3 times" }[s.repeats] || `${s.repeats} times`;
  const row =(ico, label, value, step) => `<button type="button" class="mk-ready-row" data-mk-go="${step}"><span>${icon(ico, "i-sm")}</span><small>${label}</small><b>${value}</b>${icon("pencil", "i-xs mk-ready-edit")}</button>`;
  $("dcReady").innerHTML = `
    <div class="mk-ready-head"><span class="mk-badge">${icon("mic")}</span><div><small>Ready to make</small><b>${STYLE_ICON[s.style] || ""} ${esc(DICTATION_STYLES[s.style]?.label || "")} dictation</b></div></div>
    <div class="mk-ready-rows">
      ${row(sel.kind === "unit" ? "book-open" : "list", "Words", `${esc(sel.label || "")}`, 0)}
      ${row("layers", "Style", esc(DICTATION_STYLES[s.style]?.label || ""), 1)}
      ${row("graduation", "Class", `${esc(levelLabel(s.levelId))} · ${connectedStyle() ? `≈ ${s.textWords} words` : `${s.count} × ${min}–${max} words`}`, 2)}
      ${row("pencil", "Grammar", s.source === "book" ? "The coursebook’s" : esc(grammarList().join(", ") || "What the class knows"), 2)}
      ${row(s.source === "book" ? "book" : "sparkles", "Writer", s.source === "book" ? "The coursebook" : "The AI", 3)}
      ${row("volume", "Reading", `Each sentence ${reads}`, 3)}
    </div>
    ${prob ? `<div class="callout warning">${icon("alert")}<span>${esc(prob)}</span></div>` : ""}
    ${s.source === "book" && noBookSentence.length ? `<div class="callout info">${icon("info")}<span>The coursebook has no sentence for ${esc(noBookSentence.map((w) => w.english).join(", "))}. Choose <b>The AI</b> as the writer to include ${noBookSentence.length === 1 ? "it" : "them"}.</span></div>` : ""}
    <button type="button" class="btn btn-magic btn-lg mk-go" id="dcGenerate"${prob ? " disabled" : ""}>${icon(s.source === "book" ? "book-open" : "sparkles")}${dc.doc ? "Make a new dictation" : "Make my dictation"}</button>
    <small class="mk-hint">${s.source === "book" ? "Instant — from the book’s example sentences." : "Usually 5–15 seconds."} Then press <b>Read it aloud</b> in class.</small>`;
}

/** The result page's side column. */
function renderOutline() {
  const d = dc.doc;
  if (!d) { $("dcOutline").innerHTML = `<div class="mk-outline-card"><small>Nothing made yet</small><b>Your dictation</b><p class="mk-hint">Press <b>Make my dictation</b> in Final touches.</p></div>`; return; }
  const sec = d.sections?.[0] || {};
  const n = sec.sentences?.length || 0;
  $("dcOutline").innerHTML = `
    <div class="mk-outline-card">
      <small>${esc(d.meta?.classLabel || levelLabel(d.meta?.classProfile))}</small>
      <b>${STYLE_ICON[sec.style] || ""} ${esc(DICTATION_STYLES[sec.style]?.label || "Read-aloud dictation")}</b>
      <span class="mk-hint">${esc(d.meta?.label || "")}</span>
      <div class="mk-outline-meter"><span><b>${n}</b> ${n === 1 ? "sentence" : "sentences"}</span><span><b>${readAloudLines(d).length}</b> to read</span></div>
    </div>
    <ol class="mk-outline-parts">${(sec.sentences || []).slice(0, 15).map((x, i) => `<li><span class="mk-op-ico">${i + 1}</span><span class="mk-op-t"><b>${esc(x.text || "")}</b></span><span></span></li>`).join("")}</ol>
    <div class="mk-outline-acts">
      <button type="button" class="btn btn-secondary btn-sm" data-again>${icon("refresh", "i-sm")}Make it again</button>
      <button type="button" class="btn btn-ghost btn-sm" data-mk-go="1">${icon("layers", "i-sm")}Another style</button>
      <button type="button" class="btn btn-ghost btn-sm" data-new data-tip="Start again (this one is saved in your recent dictations)">${icon("plus", "i-sm")}New dictation</button>
    </div>`;
}

/** The header line, the sticky bar (Back · what to fix or the size · Next / Make my dictation) and the step ticks. */
function renderFoot() {
  if (!picker || !wiz) return;
  const s = dc.spec;
  const sel = picker.value();
  const [min, max] = sentenceRange(s.levelId, s.length, s.difficulty);
  const prob = planProblem();
  $("dcSummary").textContent = `${sel?.label || "Choose the words"} · ${levelLabel(s.levelId)} · ${DICTATION_STYLES[s.style]?.label || ""}`;
  const reads = { 1: "once", 2: "twice", 3: "3×" }[s.repeats] || `${s.repeats}×`;
  $("dcMeter").innerHTML = `${connectedStyle() ? `<b>≈${s.textWords}</b><span>words</span>` : `<b>${s.count}</b><span>${s.count === 1 ? "sentence" : "sentences"}</span>`}<i></i><b>${min}–${max}</b><span>each</span><i></i><b>${reads}</b><span>read</span>`;
  $("dcPlanNote").innerHTML = prob ? `<div class="callout warning">${icon("alert")}<span>${esc(prob)}</span></div>` : "";
  const i = wiz.index;
  const back = $("dcBack");
  back.style.visibility = i === 0 ? "hidden" : "visible";
  back.querySelector("span").textContent = i > 0 ? STEPS[i - 1].label : "";
  // Planning notes belong to the steps, not to the finished paper.
  $("dcPlanNote").hidden = i === RESULT;
  const next = $("dcNext");
  next.hidden = i === RESULT;
  next.className = `btn ${i === RESULT - 1 ? "btn-magic" : "btn-primary"}`;
  if (i < RESULT) next.querySelector("span").textContent = i === RESULT - 1 ? (dc.doc ? "Make a new dictation" : "Make my dictation") : `Next: ${STEPS[i + 1].label}`;
  next.disabled = i === RESULT - 1 && !!prob;
  const done = [1, 2];
  if ((sel?.focus || []).length >= 3) done.push(0);
  if (dc.doc) done.push(3);
  wiz.mark({ done, locked: dc.doc || dc.writing ? [] : [RESULT] });
}

function renderRecent() {
  const list = recentDocs("dictation").slice(0, 6);
  $("dcRecentWrap").classList.toggle("hidden", !list.length);
  const when = (iso) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) : ""; };
  $("dcRecent").innerHTML = list.map((d) => {
    const sec = d.sections?.[0] || {};
    const style = DICTATION_STYLES[sec.style];
    return `<div class="tb-recent-card" data-doc="${esc(d.id)}" style="--lvl:${LEVEL_COLORS[d.meta?.classProfile] || "var(--brand)"}">
        <button type="button" class="recent-open"><span class="trc-lvl">${esc((levelLabel(d.meta?.classProfile) || "?")[0])}</span><b>${STYLE_ICON[sec.style] || ""} ${esc(style?.label || "Read-aloud dictation")}</b><span>${esc(d.meta?.label || d.meta?.bookTitle || "")}</span>
          <span class="trc-meta">${plural(sec.sentences?.length || 0, "sentence")}${when(d.savedAt) ? ` · ${esc(when(d.savedAt))}` : ""}</span></button>
        <button type="button" class="icon-btn sm danger trc-del" data-del aria-label="Delete">${icon("trash", "i-sm")}</button></div>`;
  }).join("");
}

/* ── Generate ─────────────────────────────────────────────────────── */
/** Step 2 words carry no example sentence: borrow the coursebook's (same book and unit first). */
function withExamples(words, meta = {}) {
  return words.map((w) => (w.example ? w : { ...w, example: lookupCoursebookWord(w.english, meta.bookTitle || "", meta.unit)?.example || "" }));
}

async function generate(btn) {
  const sel = picker.value();
  const s = dc.spec;
  const words = withExamples(sel.focus, sel.meta);
  if (words.length < 3) { toast("Choose at least 3 words first.", "warn"); return; }
  const picFor = makePicFor(words);
  const pictureWords = words.filter((w) => picFor(w.english)).map((w) => w.english);
  if (s.style === "picture" && pictureWords.length < 3) { toast("Picture dictation needs 3+ words that have word-bank pictures.", "warn"); return; }
  const spec = { ...s, grammar: [...s.grammar, ...(s.grammarOwn?.trim() ? [grammarLabel(s.grammarOwn)] : [])] };
  const ctx = { meta: { ...sel.meta, label: sel.label, classLabel: levelLabel(s.levelId) }, picFor };
  dc.writing = true;
  wiz.show(RESULT);
  const stopBusy = s.source === "ai" ? busyOverlay($("dcStage"), { title: "Lingo is writing your dictation…", note: "Usually 5–15 seconds", steps: [[0, "Reading your words"], [2, `Writing sentences for ${levelLabel(s.levelId)}`], [6, "Checking that every sentence uses your words"], [14, "Almost there…"]] }) : () => {};
  await withBusy(btn, async () => {
    try {
      let raw;
      if (s.source === "book") {
        const pool = s.style === "picture" ? words.filter((w) => pictureWords.includes(w.english)) : words;
        raw = { sentences: bookSentences(spec, pool) };
        if (!raw.sentences.length) { toast("These words have no book sentences — try AI-written sentences.", "warn"); return; }
        if (s.style === "dictogloss" || s.style === "running") raw.text = raw.sentences.map((x) => x.text).join(" ");
      } else {
        const { system, user } = dictationPrompt(spec, words, { profileBlock: [profileBlock(s.levelId), classMemoryBrief(s.levelId, words)].filter(Boolean).join("\n"), pictureWords });
        raw = await askAi(system, user);
        let doc = buildDictationDoc(spec, raw, words, ctx);
        const bad = doc.sections[0].problems;
        // One cheap retry when many sentences miss the brief.
        if (bad.length >= Math.max(2, Math.ceil(doc.sections[0].sentences.length / 3))) {
          raw = await askAi(system, user, { retryHint: `Fix these problems:\n${bad.join("\n")}` });
        }
      }
      dc.doc = buildDictationDoc(spec, raw, words, ctx);
      saveDoc(dc.doc);
      dc.sheet = dc.doc.sections[0].style === "running" ? "strips" : "student";
      renderAll();
      toast(`Dictation ready: ${plural(dc.doc.sections[0].sentences.length, "sentence")}.`, "ok");
    } catch (e) {
      aiErrorToast(e);
    } finally {
      dc.writing = false;
      stopBusy();
      // Nothing made (an error, or no book sentences): back to Final touches.
      if (!dc.doc) wiz.show(RESULT - 1); else renderFoot();
    }
  });
}

/* ── Paper ────────────────────────────────────────────────────────── */
function sheetHtml() {
  if (!dc.doc) return "";
  const layout = { layout: { schoolName: prefs.schoolName || "" } };
  if (dc.sheet === "teacher") return renderTeacherPack(dc.doc, layout);
  if (dc.sheet === "strips") return renderRunningStrips(dc.doc) || renderStudentPaper(dc.doc, layout);
  return renderStudentPaper(dc.doc, layout);
}
const sheetTitle = () => `${dc.doc?.meta?.title || "Read-aloud dictation"}${dc.sheet === "teacher" ? " · Teacher" : dc.sheet === "strips" ? " · Wall strips" : ""}`;
const fileBase = () => `${sheetTitle()}, ${dc.doc?.meta?.label || ""}`;

function renderPaper() {
  const has = !!dc.doc;
  $("dcPaper").classList.toggle("hidden", !has);
  $("dcEmpty").classList.toggle("hidden", has);
  $("dcSheetSeg").classList.toggle("hidden", !has);
  $("dictationView").classList.toggle("has-doc", has);
  ["dcRead", "dcPrint", "dcPdf", "dcWord"].forEach((id) => { $(id).disabled = !has; });
  renderVoices();
  renderOutline();
  renderFoot();
  const stripsBtn = document.querySelector('[data-seg="dcSheet"] [data-value="strips"]');
  if (stripsBtn) stripsBtn.hidden = dc.doc?.sections?.[0]?.style !== "running";
  if (dc.sheet === "strips" && stripsBtn?.hidden) dc.sheet = "student";
  dc.sheetSeg?.set(dc.sheet);
  if (!has) { paper.clear(); $("dcProblems").innerHTML = ""; return; }
  paper.render(sheetHtml());
  fitPaper($("dcStage"), $("dcPaper"));
  const probs = dc.doc.sections[0].problems || [];
  $("dcProblems").innerHTML = probs.length ? `<div class="callout warning">${icon("alert")}<span><b>Worth a quick look before printing:</b> ${esc(probs.slice(0, 4).join(" · "))}${probs.length > 4 ? " …" : ""}</span></div>` : "";
}

function toggleRead() {
  if (dc.player) { dc.player.stop(); dc.player = null; dc.status = null; setReadBtn(false); renderVoices(); return; }
  const lines = readAloudLines(dc.doc);
  if (!lines.length) return;
  if (dc.sheet !== "teacher") { dc.sheet = "teacher"; document.querySelector('[data-seg="dcSheet"] [data-value="teacher"]')?.click(); }
  setReadBtn(true);
  const items = () => [...paper.root.querySelectorAll(".st-key .ex-item")];
  dc.player = readDictation(lines, {
    repeats: dc.spec.repeats,
    levelId: dc.doc.meta.classProfile,
    punctuation: !!dc.spec.punctuationAloud,
    onLine: (i) => items().forEach((el, k) => el.classList.toggle("st-playing", k === i)),
    onStatus: (st) => {
      if (st.phase === "fallback") toast(st.message, "warn");
      if (st.phase === "prepare" && dc.status?.phase === "play") return; // reading while the rest is made
      dc.status = st;
      renderVoices();
    },
    onEnd: () => { dc.player = null; dc.status = null; setReadBtn(false); renderVoices(); },
  });
}

/** Voices picker and the reader's status, above the paper. */
function renderVoices() {
  if (!dc.doc) { $("dcVoices").innerHTML = ""; return; }
  $("dcVoices").innerHTML = `<div class="listen-bar dc-voice-bar"><div class="lb-head">${icon("volume", "i-sm")}<b>Reading voice</b>${voicePickerHtml()}${statusPill(dc.status)}</div><small>${esc(voiceNote(readAloudLines(dc.doc).join(" ").length * Math.max(1, dc.spec.repeats || 2)))}</small></div>`;
}
function setReadBtn(on) {
  $("dcRead").innerHTML = `${icon(on ? "pause" : "volume", "i-sm")}<span>${on ? "Stop reading" : "Read it aloud"}</span>`;
}

function renderAll() {
  renderStyles();
  renderShape();
  renderRecent();
  renderPaper();
}

/** Called when the Dictation view is shown. */
export function renderDictationView(preset = null) {
  if (!built) build();
  if (preset) applyPreset(preset);
  renderAll();
  // A dictation opened from the Library shows its paper.
  if (dc.showResult) { dc.showResult = false; wiz.show(RESULT, { scroll: false }); }
}

/** Open a saved dictation (from the Library or Home). */
export function openSavedDictation(id) {
  if (!built) build();
  const d = recentDocs("dictation").find((x) => x.id === id);
  if (!d) return false;
  dc.doc = d;
  dc.spec = { ...dc.spec, ...d.spec };
  dc.sheet = d.sections?.[0]?.style === "running" ? "strips" : "student";
  dc.showResult = true;
  return true;
}

/** Settings handed over by the assistant: { levelId, style, count, grammar, topic, source: picker state }. */
export function applyPreset(p) {
  dc.spec = { ...dictationDefaults(p.levelId || dc.spec.levelId), ...p.spec };
  if (p.picker) picker.set(p.picker);
  dc.doc = null;
  savePrefs();
  renderAll();
  wiz.show(RESULT - 1, { scroll: false });
}

/** Generate right away (assistant hand-off). */
export function generateNow() { return generate($("dcGenerate")); }

export const dictationState = dc;
