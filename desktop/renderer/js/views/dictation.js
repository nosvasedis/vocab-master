/* Dictation maker — five dictation styles with granular controls, level-based defaults, free book sentences or
 * AI-written ones, a read-aloud player, and print / PDF / Word for the student sheet and the teacher copy. */
import { CLASS_PROFILES, lookupCoursebookWord } from "../../app.js";
import { state, prefs } from "../state.js";
import { readJSON, writeJSON } from "../bridge.js";
import {
  $, esc, icon, plural, toast, createSourcePicker, createPaper, fitPaper, askAi, aiErrorToast, profileBlock, levelLabel,
  makePicFor, printHtml, exportPdf, exportWord, recentDocs, saveDoc, deleteDoc, segHtml, switchHtml, stepperHtml, owl, busyOverlay,
} from "./studio-common.js";
import { segmented, withBusy } from "../ui.js";
import { dictationDefaults, dictationPrompt, bookSentences, buildDictationDoc, readAloudLines } from "../../studio/dictation.js";
import { DICTATION_STYLES } from "../../studio/tasks.js";
import { GRAMMAR_MENU, LEVEL_IDS, sentenceRange, DIFFICULTY, grammarLabel } from "../../studio/levels.js";
import { renderStudentPaper, renderTeacherPack, renderRunningStrips } from "../../studio/doc-render.js";
import { readDictation, RATE } from "../../studio/tts.js";

const PREFS_KEY = "vm_dictation_prefs_v1";
const STYLE_ICON = { classic: "📝", gapped: "✏️", running: "🏃", dictogloss: "👂", picture: "🖼️" };

let picker;
let paper;
let built = false;
const dc = { spec: null, doc: null, sheet: "student", player: null };

function levelNow() {
  return dc.spec?.levelId || state.profileId || picker?.value().level || "B_SENIOR";
}
function savePrefs() { writeJSON(PREFS_KEY, dc.spec); }

export function initDictation() {
  const saved = readJSON(PREFS_KEY, null);
  dc.spec = saved?.levelId ? { ...dictationDefaults(saved.levelId), ...saved } : dictationDefaults(state.profileId || "B_SENIOR");
}

function build() {
  const host = $("dictationView");
  host.innerHTML = `
  <div class="studio-layout">
    <div class="studio-settings">
      <section class="st-card"><h3><span class="num">1</span>Which words?</h3><div id="dcSource"></div></section>
      <section class="st-card"><h3><span class="num">2</span>How will you dictate?</h3><p class="st-hint">Not sure? <b>Classic</b> suits younger classes; <b>Gapped</b> or <b>Dictogloss</b> suit older ones.</p><div class="style-grid" id="dcStyles"></div></section>
      <section class="st-card"><h3><span class="num">3</span>Your class &amp; the sentences</h3><div id="dcShape"></div></section>
      <section class="st-card"><h3><span class="num">4</span>Final touches</h3><div id="dcOptions"></div></section>
      <button type="button" class="btn btn-magic btn-lg btn-block" id="dcGenerate">${icon("sparkles")}Make my dictation</button>
      <section class="st-card"><h3>${icon("clock", "i-sm")}Recent dictations</h3><div id="dcRecent" class="recent-list"></div></section>
    </div>
    <div class="studio-paper">
      <div class="paper-toolbar">
        ${segHtml("dcSheet", [["student", "Student sheet"], ["teacher", "Teacher copy"], ["strips", "Wall strips"]], dc.sheet)}
        <span class="spacer"></span>
        <button type="button" class="btn btn-accent btn-sm" id="dcRead" disabled data-tip="The computer reads each sentence slowly, with time to write">${icon("volume", "i-sm")}<span>Read it aloud</span></button>
        <span class="export-pills">
          <button type="button" class="btn btn-secondary btn-sm" id="dcPrint" disabled>${icon("printer", "i-sm")}Print</button>
          <button type="button" class="btn btn-secondary btn-sm" id="dcPdf" disabled>${icon("pdf", "i-sm")}PDF</button>
          <button type="button" class="btn btn-secondary btn-sm" id="dcWord" disabled>${icon("word", "i-sm")}Word</button>
        </span>
      </div>
      <div id="dcProblems"></div>
      <div class="paper-stage" id="dcStage"><div class="paper hidden" id="dcPaper"></div>
        <div class="studio-empty" id="dcEmpty"><div class="empty-owl">${owl()}</div><h3>Your dictation will appear here</h3><p>Choose the words and a style on the left, then press <b>Make my dictation</b>. You get a sheet for the children and a copy for you — and the app can read it aloud.</p><ol class="empty-steps"><li>Pick the words</li><li>Choose a style</li><li>Make it ✨</li></ol></div>
      </div>
    </div>
  </div>`;
  picker = createSourcePicker({ multiUnit: false, onChange: () => { renderShape(); } });
  picker.mount($("dcSource"));
  paper = createPaper($("dcPaper"));
  dc.sheetSeg = segmented(host.querySelector('[data-seg="dcSheet"]'), { value: dc.sheet, onChange: (v) => { dc.sheet = v; renderPaper(); } });
  new ResizeObserver(() => fitPaper($("dcStage"), $("dcPaper"))).observe($("dcStage"));

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
    const step = t.closest("[data-step]");
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
    const g = t.closest("[data-grammar]");
    if (g) {
      const v = g.dataset.grammar;
      dc.spec.grammar = dc.spec.grammar.includes(v) ? dc.spec.grammar.filter((x) => x !== v) : [...dc.spec.grammar, v];
      savePrefs();
      renderShape();
    }
  };
  $("dcShape").addEventListener("click", onControls);
  $("dcShape").addEventListener("input", (e) => {
    if (e.target.id === "dcTopic") { dc.spec.topic = e.target.value; savePrefs(); }
    if (e.target.id === "dcGrammarOwn") { dc.spec.grammarOwn = e.target.value; savePrefs(); }
  });
  $("dcOptions").addEventListener("click", onControls);
  $("dcOptions").addEventListener("change", (e) => {
    const k = e.target.dataset.opt;
    if (k) { dc.spec[k] = e.target.checked; savePrefs(); if (dc.doc) { dc.doc.meta.greek = !!dc.spec.greek; dc.doc.meta.pictures = !!dc.spec.pictures; renderPaper(); } }
  });
  $("dcGenerate").addEventListener("click", (e) => generate(e.currentTarget));
  $("dcRead").addEventListener("click", toggleRead);
  $("dcPrint").addEventListener("click", () => printHtml(sheetHtml(), sheetTitle()));
  $("dcPdf").addEventListener("click", (e) => withBusy(e.currentTarget, () => exportPdf(sheetHtml(), sheetTitle(), fileBase())));
  $("dcWord").addEventListener("click", (e) => withBusy(e.currentTarget, () => exportWord(dc.doc, dc.sheet === "teacher" ? "teacher" : "student", fileBase()).catch((err) => toast(err.message, "error"))));
  $("dcRecent").addEventListener("click", (e) => {
    const row = e.target.closest("[data-doc]");
    if (!row) return;
    if (e.target.closest("[data-del]")) { deleteDoc(row.dataset.doc); renderRecent(); return; }
    const d = recentDocs("dictation").find((x) => x.id === row.dataset.doc);
    if (d) { dc.doc = d; dc.spec = { ...dc.spec, ...d.spec }; renderAll(); toast("Opened a saved dictation.", "ok", { ms: 2000 }); }
  });
  built = true;
}

function setLevel(levelId) {
  const keep = { style: dc.spec.style, grammar: [], topic: dc.spec.topic, source: dc.spec.source };
  dc.spec = { ...dictationDefaults(levelId), ...keep };
  savePrefs();
  renderAll();
  toast(`${levelLabel(levelId)} defaults: ${dc.spec.count} sentences of ${sentenceRange(levelId).join("–")} words.`, "info", { ms: 2600 });
}

function renderStyles() {
  $("dcStyles").innerHTML = Object.entries(DICTATION_STYLES).map(([id, s]) => `<button type="button" class="style-card${dc.spec.style === id ? " active" : ""}" data-style="${id}"><span class="sc-ico">${STYLE_ICON[id]}</span><b>${esc(s.label)}</b><small>${esc(s.hint)}</small></button>`).join("");
}

function renderShape() {
  const s = dc.spec;
  const lvl = s.levelId;
  const [min, max] = sentenceRange(lvl, s.length, s.difficulty);
  const connected = s.style === "dictogloss" || s.style === "running";
  const sel = picker?.value();
  const words = sel?.focus || [];
  const grammar = GRAMMAR_MENU[lvl] || [];
  $("dcShape").innerHTML = `
    <div class="st-row"><span class="st-lbl">Class</span><div class="lvl-chips">${LEVEL_IDS.map((id) => `<button type="button" class="chip${id === lvl ? " active" : ""}" data-level="${id}">${esc(CLASS_PROFILES[id].label)}</button>`).join("")}</div></div>
    <p class="st-hint">${esc(CLASS_PROFILES[lvl].greekGrades)} · ages ${esc(CLASS_PROFILES[lvl].ageRange)} · CEFR ${esc(CLASS_PROFILES[lvl].cefr)} — defaults are set for this class.</p>
    ${connected
    ? `<div class="st-row"><span class="st-lbl">Length of the text</span>${stepperHtml("textWords", s.textWords, 20, 160)}<small class="st-note">words, about</small></div>`
    : `<div class="st-row"><span class="st-lbl">How many sentences</span>${stepperHtml("count", s.count, 3, 15)}</div>`}
    <div class="st-row"><span class="st-lbl">Sentence length</span>${segHtml("length", [["short", "Short"], ["level", "For the class"], ["long", "Long"]], s.length)}<small class="st-note">${min}–${max} words each</small></div>
    ${s.style === "picture" ? "" : `<div class="st-row"><span class="st-lbl">Unit words in each sentence</span>${segHtml("targets", [[1, "1"], [2, "2"], [3, "3"]], s.targets)}</div>`}
    ${s.style === "gapped" ? `<div class="st-row"><span class="st-lbl">Gaps in each sentence</span>${segHtml("gapsPerSentence", [[1, "1"], [2, "2"], [3, "3"]], s.gapsPerSentence)}</div>` : ""}
    <div class="st-row"><span class="st-lbl">Difficulty</span>${segHtml("difficulty", Object.entries(DIFFICULTY).map(([k, v]) => [k, v.label.replace("Right for the class", "Just right")]), s.difficulty)}</div>
    <div class="st-row col"><span class="st-lbl">Grammar to practise <small>(optional)</small></span><div class="gram-chips">${grammar.map((g) => `<button type="button" class="chip${s.grammar.includes(g) ? " active" : ""}" data-grammar="${esc(g)}">${esc(g)}</button>`).join("")}</div>
      <input class="input sm" id="dcGrammarOwn" placeholder="…or type your own, e.g. There is / there are" value="${esc(s.grammarOwn || "")}" /></div>
    <div class="st-row col"><span class="st-lbl">A theme for the sentences <small>(optional)</small></span><input class="input sm" id="dcTopic" placeholder="e.g. a trip to the mountains, a birthday party" value="${esc(s.topic || "")}" /></div>
    ${words.length < 3 ? `<div class="callout warning">${icon("alert")}<span>Choose at least 3 words in step 1.</span></div>` : ""}`;
  $("dcShape").querySelectorAll("[data-segmented]").forEach((root) => {
    segmented(root, { value: String(s[root.dataset.seg]), onChange: (v) => { s[root.dataset.seg] = /^\d+$/.test(v) ? Number(v) : v; savePrefs(); renderShape(); } });
  });
  renderOptions();
}

function renderOptions() {
  const s = dc.spec;
  $("dcOptions").innerHTML = `
    <div class="st-row"><span class="st-lbl">Who writes the sentences?</span>${segHtml("source", [["ai", `${icon("sparkles", "i-xs")}The AI, for my class`], ["book", `${icon("book", "i-xs")}The coursebook (free)`]], s.source)}</div>
    <p class="st-hint">${s.source === "book" ? "Uses the coursebook’s own example sentence for each word — instant, free and works offline. (The grammar and theme above are not used.)" : "Fresh sentences that follow your grammar, theme and length — ready in a few seconds."}</p>
    <div class="st-row"><span class="st-lbl">Read each sentence</span>${segHtml("repeats", [[1, "once"], [2, "twice"], [3, "3 times"]], s.repeats)}</div>
    <div class="st-switches">
      ${switchHtml("punctuationAloud", "Say the punctuation", "“comma”, “full stop” — great for younger classes", s.punctuationAloud)}
      ${switchHtml("greek", "Instructions also in Greek", "A small Greek line under the English one", s.greek)}
      ${switchHtml("pictures", "Show pictures", "The app’s illustrations (picture dictation)", s.pictures)}
    </div>`;
  $("dcOptions").querySelectorAll("[data-segmented]").forEach((root) => {
    segmented(root, { value: String(s[root.dataset.seg]), onChange: (v) => { s[root.dataset.seg] = /^\d+$/.test(v) ? Number(v) : v; savePrefs(); renderOptions(); } });
  });
}

function renderRecent() {
  const list = recentDocs("dictation").slice(0, 8);
  $("dcRecent").innerHTML = list.length
    ? list.map((d) => `<div class="recent-row" data-doc="${esc(d.id)}"><button type="button" class="recent-open"><b>${esc(DICTATION_STYLES[d.sections?.[0]?.style]?.label || "Dictation")}</b><span>${esc(d.meta?.label || d.meta?.bookTitle || "")} · ${esc(levelLabel(d.meta?.classProfile))}</span></button><button type="button" class="icon-btn sm danger" data-del aria-label="Delete">${icon("trash", "i-sm")}</button></div>`).join("")
    : `<p class="st-hint">Your dictations are kept here, so you can print them again any time.</p>`;
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
        const { system, user } = dictationPrompt(spec, words, { profileBlock: profileBlock(s.levelId), pictureWords });
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
    } catch (e) { aiErrorToast(e); } finally { stopBusy(); }
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
const sheetTitle = () => `${dc.doc?.meta?.title || "Dictation"}${dc.sheet === "teacher" ? " · Teacher" : dc.sheet === "strips" ? " · Wall strips" : ""}`;
const fileBase = () => `${sheetTitle()}, ${dc.doc?.meta?.label || ""}`;

function renderPaper() {
  const has = !!dc.doc;
  $("dcPaper").classList.toggle("hidden", !has);
  $("dcEmpty").classList.toggle("hidden", has);
  ["dcRead", "dcPrint", "dcPdf", "dcWord"].forEach((id) => { $(id).disabled = !has; });
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
  if (dc.player) { dc.player.stop(); dc.player = null; setReadBtn(false); return; }
  const lines = readAloudLines(dc.doc);
  if (!lines.length) return;
  if (dc.sheet !== "teacher") { dc.sheet = "teacher"; document.querySelector('[data-seg="dcSheet"] [data-value="teacher"]')?.click(); }
  setReadBtn(true);
  const items = () => [...paper.root.querySelectorAll(".st-key .ex-item")];
  dc.player = readDictation(lines, {
    repeats: dc.spec.repeats,
    rate: RATE[dc.doc.meta.classProfile] || 0.85,
    punctuation: !!dc.spec.punctuationAloud,
    onLine: (i) => items().forEach((el, k) => el.classList.toggle("st-playing", k === i)),
    onEnd: () => { dc.player = null; setReadBtn(false); },
  });
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
}

/** Settings handed over by the assistant: { levelId, style, count, grammar, topic, source: picker state }. */
export function applyPreset(p) {
  dc.spec = { ...dictationDefaults(p.levelId || dc.spec.levelId), ...p.spec };
  if (p.picker) picker.set(p.picker);
  savePrefs();
}

/** Generate right away (assistant hand-off). */
export function generateNow() { return generate($("dcGenerate")); }

export const dictationState = dc;
