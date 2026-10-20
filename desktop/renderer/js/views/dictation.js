/* Dictation maker — five dictation styles with granular controls, level-based defaults, free book sentences or
 * AI-written ones, a read-aloud player, and print / PDF / Word for the student sheet and the teacher copy. */
import { CLASS_PROFILES, lookupCoursebookWord } from "../../app.js";
import { state, prefs, LEVEL_COLORS } from "../state.js";
import { readJSON, writeJSON } from "../bridge.js";
import {
  $, esc, icon, plural, toast, createSourcePicker, createPaper, fitPaper, askAi, aiErrorToast, profileBlock, levelLabel,
  makePicFor, pickRow, printHtml, exportPdf, exportWord, recentDocs, saveDoc, deleteDoc, segHtml, switchHtml, stepperHtml, owl, busyOverlay,
} from "./studio-common.js";
import { segmented, withBusy } from "../ui.js";
import { dictationDefaults, dictationPrompt, bookSentences, buildDictationDoc, readAloudLines } from "../../studio/dictation.js";
import { DICTATION_STYLES } from "../../studio/tasks.js";
import { GRAMMAR_MENU, LEVEL_IDS, sentenceRange, DIFFICULTY, grammarLabel } from "../../studio/levels.js";
import { renderStudentPaper, renderTeacherPack, renderRunningStrips } from "../../studio/doc-render.js";
import { readDictation } from "../voices/listening.js";
import { voicePickerHtml, pickVoice, voiceNote, statusPill } from "./voice-ui.js";

const PREFS_KEY = "vm_dictation_prefs_v1";
const STYLE_ICON = { classic: "📝", gapped: "✏️", running: "🏃", dictogloss: "👂", picture: "🖼️" };

let picker;
let paper;
let built = false;
const dc = { spec: null, doc: null, sheet: "student", player: null, status: null };

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
  // data-n, not data-step: the stepper buttons below use data-step.
  const step = (n, title, sub, body) => `<section class="tb-step" data-n="${n}">
      <header class="tb-step-head"><span class="tb-num">${n}</span><div><h3>${title}</h3><p>${sub}</p></div></header>
      ${body}
    </section>`;
  host.innerHTML = `
  <div class="studio-layout tb dc">
    <div class="studio-settings tb-builder">
      <div class="tb-head">
        <span class="tb-head-ico">${icon("mic")}</span>
        <div class="tb-head-text"><b>Read-aloud dictation</b><span id="dcSummary"></span></div>
      </div>
      <div class="tb-steps">
        ${step(1, "Which words?", "The unit words your sentences are built around.", `<div id="dcSource"></div>`)}
        ${step(2, "How will you dictate?", "Not sure? <b>Classic</b> suits younger classes; <b>Gapped</b> or <b>Dictogloss</b> suit older ones.", `<div class="style-grid" id="dcStyles"></div>`)}
        ${step(3, "Your class &amp; the sentences", "Sets the length and the language of every sentence.", `<div id="dcShape"></div>`)}
        ${step(4, "Final touches", "Who writes the sentences, how they are read, and the paper.", `<div id="dcOptions"></div>`)}
      </div>
      <div class="tb-foot">
        <div id="dcPlanNote"></div>
        <div class="tb-foot-row">
          <div class="tb-meter" id="dcMeter"></div>
          <button type="button" class="btn btn-magic btn-lg" id="dcGenerate">${icon("sparkles")}Make my dictation</button>
        </div>
      </div>
    </div>
    <div class="studio-paper tb-paper">
      <div class="paper-toolbar tb-toolbar">
        <div id="dcSheetSeg">${segHtml("dcSheet", [["student", "Student sheet"], ["teacher", "Teacher copy"], ["strips", "Wall strips"]], dc.sheet)}</div>
        <button type="button" class="btn btn-ghost btn-sm hidden" id="dcNew" data-tip="Back to your dictations (this one is saved)">${icon("plus", "i-sm")}New dictation</button>
        <span class="dc-actions">
          <button type="button" class="btn btn-accent btn-sm" id="dcRead" disabled data-tip="Each sentence is read, then read again slowly, with time to write">${icon("volume", "i-sm")}<span>Read it aloud</span></button>
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
        <div class="studio-empty tb-empty" id="dcEmpty">
          <div class="tb-empty-hero">
            <div class="empty-owl">${owl()}</div>
            <div>
              <span class="tb-kicker">${icon("mic", "i-xs")}Read-aloud dictation</span>
              <h3>Sentences your class can write, read aloud for you</h3>
              <p>Choose the words, a style and your class, then press <b>Make my dictation</b>. You get a sheet for the children and a copy for you, and the app reads every sentence aloud with time to write.</p>
            </div>
          </div>
          <div class="tb-features">
            <div><span>${icon("layers")}</span><b>5 styles</b><small>Classic, gapped, running, dictogloss, picture</small></div>
            <div><span>${icon("volume")}</span><b>Read aloud</b><small>Natural voices, slower the second time</small></div>
            <div><span>${icon("key")}</span><b>Teacher copy</b><small>Every sentence, ready to read or check</small></div>
            <div><span>${icon("book-open")}</span><b>Free from the book</b><small>Or fresh AI sentences for your grammar</small></div>
          </div>
          <div class="tb-recent"><h4>${icon("clock", "i-sm")}Your recent dictations</h4><div id="dcRecent" class="tb-recent-grid"></div></div>
        </div>
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
      dc.spec.grammar = dc.spec.grammar.includes(v) ? dc.spec.grammar.filter((x) => x !== v) : [...dc.spec.grammar, v];
      savePrefs();
      renderShape();
    }
  };
  $("dcShape").addEventListener("click", onControls);
  $("dcShape").addEventListener("input", (e) => {
    if (e.target.id === "dcTopic") { dc.spec.topic = e.target.value; savePrefs(); }
    if (e.target.id === "dcGrammarOwn") { dc.spec.grammarOwn = e.target.value; savePrefs(); }
    // The closed line says what is chosen, also while typing.
    const val = (k) => $("dcShape").querySelector(`[data-pk="${k}"] .pk-val`);
    if (dc.spec.source === "book") return;
    if (e.target.id === "dcTopic" && val("theme")) val("theme").innerHTML = dc.spec.topic.trim() ? esc(dc.spec.topic.trim()) : "<small>Lingo chooses</small>";
    if (e.target.id === "dcGrammarOwn" && val("grammar")) {
      const chosen = [...dc.spec.grammar, ...(dc.spec.grammarOwn.trim() ? [grammarLabel(dc.spec.grammarOwn)] : [])];
      val("grammar").innerHTML = chosen.length ? esc(chosen.join(", ")) : "What the class knows";
    }
  });
  $("dcShape").addEventListener("click", (e) => {
    const tog = e.target.closest("[data-pk-toggle]");
    if (tog) { dc.moreOpen = dc.moreOpen === tog.dataset.pkToggle ? null : tog.dataset.pkToggle; renderShape(); }
  });
  $("dcOptions").addEventListener("click", onControls);
  $("dcOptions").addEventListener("change", (e) => {
    const k = e.target.dataset.opt;
    if (k) { dc.spec[k] = e.target.checked; savePrefs(); if (dc.doc) { dc.doc.meta.greek = !!dc.spec.greek; dc.doc.meta.pictures = !!dc.spec.pictures; renderPaper(); } }
  });
  $("dcGenerate").addEventListener("click", (e) => generate(e.currentTarget));
  $("dcNew").addEventListener("click", () => { if (dc.player) toggleRead(); dc.doc = null; renderAll(); });
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
  $("dcStyles").innerHTML = Object.entries(DICTATION_STYLES).map(([id, s]) => `<button type="button" class="style-card${dc.spec.style === id ? " active" : ""}" data-style="${id}" aria-pressed="${dc.spec.style === id}"><span class="sc-ico">${STYLE_ICON[id]}</span><b>${esc(s.label)}</b><small>${esc(s.hint)}</small></button>`).join("");
}

function renderShape() {
  const s = dc.spec;
  const lvl = s.levelId;
  const p = CLASS_PROFILES[lvl];
  const [min, max] = sentenceRange(lvl, s.length, s.difficulty);
  const connected = s.style === "dictogloss" || s.style === "running";
  const grammar = GRAMMAR_MENU[lvl] || [];
  const chosen = [...s.grammar, ...(s.grammarOwn?.trim() ? [grammarLabel(s.grammarOwn)] : [])];
  const book = s.source === "book";
  const unused = "<small>Not used — the coursebook’s own sentences</small>";
  $("dcShape").innerHTML = `
    <div class="tb-levels" role="radiogroup" aria-label="Class">${LEVEL_IDS.map((id) => `<button type="button" role="radio" aria-checked="${id === lvl}" class="tb-level${id === lvl ? " active" : ""}" data-level="${id}" style="--lvl:${LEVEL_COLORS[id]}"><span class="tb-level-l">${esc(CLASS_PROFILES[id].label[0])}</span><small>${esc(CLASS_PROFILES[id].cefr)}</small></button>`).join("")}</div>
    <p class="tb-level-note"><b>${esc(p.label)}</b> · ${esc(p.greekGrades)} · ages ${esc(p.ageRange)} · defaults set for this class</p>
    <div class="dc-fields">
      ${connected
    ? `<div class="tb-field"><span class="st-lbl">Length of the text</span><span class="dc-ctl">${stepperHtml("textWords", s.textWords, 20, 160)}<small class="st-note">words, about</small></span></div>`
    : `<div class="tb-field"><span class="st-lbl">How many sentences</span>${stepperHtml("count", s.count, 3, 15)}</div>`}
      <div class="tb-field"><span class="st-lbl">Sentence length <small>${min}–${max} words each</small></span>${segHtml("length", [["short", "Short"], ["level", "For the class"], ["long", "Long"]], s.length)}</div>
      ${s.style === "picture" ? "" : `<div class="tb-field"><span class="st-lbl">Unit words in each sentence</span>${segHtml("targets", [[1, "1"], [2, "2"], [3, "3"]], s.targets)}</div>`}
      ${s.style === "gapped" ? `<div class="tb-field"><span class="st-lbl">Gaps in each sentence</span>${segHtml("gapsPerSentence", [[1, "1"], [2, "2"], [3, "3"]], s.gapsPerSentence)}</div>` : ""}
      <div class="tb-field"><span class="st-lbl">Difficulty</span>${segHtml("difficulty", Object.entries(DIFFICULTY).map(([k, v]) => [k, v.label.replace("Right for the class", "Just right")]), s.difficulty)}</div>
    </div>
    <div class="pk-rows dc-more">
      ${pickRow("grammar", "Grammar", book ? unused : chosen.length ? esc(chosen.join(", ")) : "What the class knows", dc.moreOpen === "grammar",
    `<div class="gram-chips">${grammar.map((g) => `<button type="button" class="chip${s.grammar.includes(g) ? " active" : ""}" data-grammar="${esc(g)}">${esc(g)}</button>`).join("")}</div>
        <input class="input sm" id="dcGrammarOwn" placeholder="…or type your own, e.g. There is / there are" value="${esc(s.grammarOwn || "")}" />
        <p class="pk-note">${book ? "Only used when the AI writes the sentences (Final touches)." : "Most sentences will use it. Leave it empty for grammar the class already knows."}</p>`)}
      ${pickRow("theme", "Theme", book ? unused : s.topic?.trim() ? esc(s.topic.trim()) : "<small>Lingo chooses</small>", dc.moreOpen === "theme",
    `<input class="input sm" id="dcTopic" placeholder="e.g. a trip to the mountains, a birthday party" value="${esc(s.topic || "")}" />
        <p class="pk-note">One situation, so the sentences make sense together.</p>`)}
    </div>`;
  $("dcShape").querySelectorAll("[data-segmented]").forEach((root) => {
    segmented(root, { value: String(s[root.dataset.seg]), onChange: (v) => { s[root.dataset.seg] = /^\d+$/.test(v) ? Number(v) : v; savePrefs(); renderShape(); } });
  });
  renderOptions();
}

function renderOptions() {
  const s = dc.spec;
  const src = (id, ico, title, note) => `<button type="button" class="dc-src${s.source === id ? " active" : ""}" data-source="${id}" aria-pressed="${s.source === id}"><span class="dc-src-ico">${icon(ico, "i-sm")}</span><b>${title}</b><small>${note}</small></button>`;
  $("dcOptions").innerHTML = `
    <div class="st-row col"><span class="st-lbl">Who writes the sentences?</span>
      <div class="dc-srcs">${src("ai", "sparkles", "The AI, for my class", "Follows your grammar, theme and length · a few seconds")}${src("book", "book", "The coursebook", "Its own example sentences · free, instant, offline")}</div>
      ${s.source === "book" ? `<p class="st-hint">The grammar and theme in step 3 are not used.</p>` : ""}</div>
    <div class="tb-field"><span class="st-lbl">Read each sentence</span>${segHtml("repeats", [[1, "once"], [2, "twice"], [3, "3 times"]], s.repeats)}</div>
    <div class="st-switches">
      ${switchHtml("punctuationAloud", "Say the punctuation", "“comma”, “full stop” — great for younger classes", s.punctuationAloud)}
      ${switchHtml("greek", "Instructions also in Greek", "A small Greek line under the English one", s.greek)}
      ${switchHtml("pictures", "Show pictures", "The app’s illustrations (picture dictation)", s.pictures)}
    </div>`;
  $("dcOptions").querySelectorAll("[data-segmented]").forEach((root) => {
    segmented(root, { value: String(s[root.dataset.seg]), onChange: (v) => { s[root.dataset.seg] = /^\d+$/.test(v) ? Number(v) : v; savePrefs(); renderOptions(); } });
  });
  renderFoot();
}

/** The sticky header line and footer: what the dictation is about and how big it is. */
function renderFoot() {
  if (!picker) return;
  const s = dc.spec;
  const sel = picker.value();
  const words = sel?.focus || [];
  const [min, max] = sentenceRange(s.levelId, s.length, s.difficulty);
  const connected = s.style === "dictogloss" || s.style === "running";
  $("dcSummary").textContent = `${sel?.label || "Choose the words"} · ${levelLabel(s.levelId)} · ${DICTATION_STYLES[s.style]?.label || ""}`;
  const reads = { 1: "once", 2: "twice", 3: "3×" }[s.repeats] || `${s.repeats}×`;
  $("dcMeter").innerHTML = `${connected ? `<b>≈${s.textWords}</b><span>words</span>` : `<b>${s.count}</b><span>${s.count === 1 ? "sentence" : "sentences"}</span>`}<i></i><b>${min}–${max}</b><span>each</span><i></i><b>${reads}</b><span>read</span>`;
  $("dcPlanNote").innerHTML = words.length < 3 ? `<div class="callout warning">${icon("alert")}<span>Choose at least 3 words in step 1.</span></div>` : "";
}

function renderRecent() {
  const list = recentDocs("dictation").slice(0, 6);
  const when = (iso) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) : ""; };
  $("dcRecent").innerHTML = list.length
    ? list.map((d) => {
      const sec = d.sections?.[0] || {};
      const style = DICTATION_STYLES[sec.style];
      return `<div class="tb-recent-card" data-doc="${esc(d.id)}" style="--lvl:${LEVEL_COLORS[d.meta?.classProfile] || "var(--brand)"}">
        <button type="button" class="recent-open"><span class="trc-lvl">${esc((levelLabel(d.meta?.classProfile) || "?")[0])}</span><b>${STYLE_ICON[sec.style] || ""} ${esc(style?.label || "Read-aloud dictation")}</b><span>${esc(d.meta?.label || d.meta?.bookTitle || "")}</span>
          <span class="trc-meta">${plural(sec.sentences?.length || 0, "sentence")}${when(d.savedAt) ? ` · ${esc(when(d.savedAt))}` : ""}</span></button>
        <button type="button" class="icon-btn sm danger trc-del" data-del aria-label="Delete">${icon("trash", "i-sm")}</button></div>`;
    }).join("")
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
const sheetTitle = () => `${dc.doc?.meta?.title || "Read-aloud dictation"}${dc.sheet === "teacher" ? " · Teacher" : dc.sheet === "strips" ? " · Wall strips" : ""}`;
const fileBase = () => `${sheetTitle()}, ${dc.doc?.meta?.label || ""}`;

function renderPaper() {
  const has = !!dc.doc;
  $("dcPaper").classList.toggle("hidden", !has);
  $("dcEmpty").classList.toggle("hidden", has);
  $("dcNew").classList.toggle("hidden", !has);
  $("dcSheetSeg").classList.toggle("hidden", !has);
  $("dictationView").classList.toggle("has-doc", has);
  ["dcRead", "dcPrint", "dcPdf", "dcWord"].forEach((id) => { $(id).disabled = !has; });
  renderVoices();
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
