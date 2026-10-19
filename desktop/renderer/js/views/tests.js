/* Unit test builder — choose book & unit(s) (or a topic), the class, the length, and edit the parts (skill, task,
 * items, points). One AI request writes the test from the whole unit (words by section, Big Question, readings,
 * lesson stories); any part can be rewritten alone. Version B, a teacher's pack, listening read by the app's
 * voices, click-to-edit items, and print / PDF / Word. */
import { CLASS_PROFILES } from "../../app.js";
import { state, prefs, isCpp } from "../state.js";
import { readJSON, writeJSON } from "../bridge.js";
import { segmented, withBusy, openDialog } from "../ui.js";
import {
  $, esc, icon, plural, toast, createSourcePicker, createPaper, fitPaper, askAi, aiErrorToast, profileBlock, levelLabel,
  makePicFor, printHtml, exportPdf, exportWord, recentDocs, saveDoc, deleteDoc, segHtml, switchHtml, stepperHtml, unitContextFor, owl, busyOverlay,
} from "./studio-common.js";
import { TASKS, SKILLS, tasksFor, defaultTask } from "../../studio/tasks.js";
import { GRAMMAR_MENU, LEVEL_IDS, DIFFICULTY, grammarLabel } from "../../studio/levels.js";
import { testDefaults, presetParts, makePart, testPrompt, buildTestDoc, keyCheckPrompt, applyKeyCheck, estimateMinutes, specPoints, partPoints, planProblems, LENGTHS } from "../../studio/test-builder.js";
import { makeVersionB, docProblems, docPoints, normalizeItem, balanceChoices, LETTERS } from "../../studio/doc-model.js";
import { renderStudentPaper, renderTeacherPack } from "../../studio/doc-render.js";
import { buildUnitContext } from "../../studio/unit-context.js";
import { playScript, RATE } from "../../studio/tts.js";
import { loadLessonJson } from "./studio-common.js";

const PREFS_KEY = "vm_tests_prefs_v1";
let picker;
let paper;
let built = false;
const ts = { spec: null, doc: null, sheet: "A", player: null, playing: null, ctx: null, stale: new Set() };

const savePrefs = () => writeJSON(PREFS_KEY, ts.spec);

export function initTests() {
  const saved = readJSON(PREFS_KEY, null);
  ts.spec = saved?.levelId && Array.isArray(saved.parts) ? { ...testDefaults(saved.levelId), ...saved } : testDefaults(state.profileId || "B_SENIOR");
}

function build() {
  const host = $("testsView");
  host.innerHTML = `
  <div class="studio-layout">
    <div class="studio-settings">
      <section class="st-card"><h3><span class="num">1</span>Which unit?</h3><div id="tsSource"></div></section>
      <section class="st-card"><h3><span class="num">2</span>Your class &amp; how long</h3><div id="tsShape"></div></section>
      <section class="st-card"><h3><span class="num">3</span>The parts of your test <span class="st-sum" id="tsSum"></span></h3><p class="st-hint">Each part is one exercise. Change its type, the number of questions or the points — or add another part at the bottom.</p><div id="tsParts"></div></section>
      <section class="st-card"><h3><span class="num">4</span>Final touches</h3><div id="tsOptions"></div></section>
      <div id="tsPlanNote"></div>
      <button type="button" class="btn btn-magic btn-lg btn-block" id="tsGenerate">${icon("sparkles")}Write my test</button>
      <section class="st-card"><h3>${icon("clock", "i-sm")}Recent tests</h3><div id="tsRecent" class="recent-list"></div></section>
    </div>
    <div class="studio-paper">
      <div class="paper-toolbar">
        <div id="tsSheetSeg"></div>
        <span class="spacer"></span>
        <label class="switch sm"><input type="checkbox" id="tsAnswers" /><span class="track"></span><span class="sw-text">Show answers</span></label>
        <span class="export-pills">
          <button type="button" class="btn btn-secondary btn-sm" id="tsPrint" disabled>${icon("printer", "i-sm")}Print</button>
          <button type="button" class="btn btn-secondary btn-sm" id="tsPdf" disabled>${icon("pdf", "i-sm")}PDF</button>
          <button type="button" class="btn btn-secondary btn-sm" id="tsWord" disabled>${icon("word", "i-sm")}Word</button>
        </span>
      </div>
      <div id="tsListen"></div>
      <div id="tsProblems"></div>
      <p class="edit-hint hidden" id="tsEditHint">${icon("pencil", "i-sm")}Tip: click any question on the paper to change it.</p>
      <div class="paper-stage" id="tsStage"><div class="paper hidden" id="tsPaper"></div>
        <div class="studio-empty" id="tsEmpty"><div class="empty-owl">${owl()}</div><h3>Your test will appear here</h3><p>Choose the unit and your class on the left, check the parts, then press <b>Write my test</b>. You get the children’s paper (and a version B if you like) plus a teacher’s pack with the answers, the listening scripts and a marking guide.</p><ol class="empty-steps"><li>Pick the unit</li><li>Check the parts</li><li>Write it ✨</li></ol></div>
      </div>
    </div>
  </div>`;
  picker = createSourcePicker({ multiUnit: true, allowTopic: true, onChange: (sel) => {
    if (sel.kind === "unit" && sel.level && !ts.levelTouched && sel.level !== ts.spec.levelId) setLevel(sel.level, { quiet: true });
    renderPlanNote();
  } });
  picker.mount($("tsSource"));
  paper = createPaper($("tsPaper"));
  new ResizeObserver(() => fitPaper($("tsStage"), $("tsPaper"))).observe($("tsStage"));

  $("tsShape").addEventListener("click", (e) => {
    const lvl = e.target.closest("[data-level]");
    if (lvl) { ts.levelTouched = true; setLevel(lvl.dataset.level); return; }
    const len = e.target.closest("[data-length]");
    if (len) {
      ts.spec.length = len.dataset.length;
      ts.spec.parts = presetParts(ts.spec.length, ts.spec.levelId, { pictures: ts.spec.pictures });
      savePrefs();
      renderShape(); renderParts();
      return;
    }
    const g = e.target.closest("[data-grammar]");
    if (g) {
      const v = g.dataset.grammar;
      ts.spec.grammar = ts.spec.grammar.includes(v) ? ts.spec.grammar.filter((x) => x !== v) : [...ts.spec.grammar, v];
      savePrefs(); renderShape();
    }
  });
  $("tsShape").addEventListener("input", (e) => {
    if (e.target.id === "tsTopic") ts.spec.topic = e.target.value;
    if (e.target.id === "tsTitle") ts.spec.title = e.target.value;
    if (e.target.id === "tsGrammarOwn") ts.spec.grammarOwn = e.target.value;
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
    if (k === "pictures") renderPlanNote();
  });
  $("tsGenerate").addEventListener("click", (e) => generate(e.currentTarget));
  $("tsAnswers").addEventListener("change", renderPaper);
  $("tsPrint").addEventListener("click", () => printHtml(sheetHtml(false), sheetTitle()));
  $("tsPdf").addEventListener("click", (e) => withBusy(e.currentTarget, () => exportPdf(sheetHtml(false), sheetTitle(), sheetTitle())));
  $("tsWord").addEventListener("click", (e) => withBusy(e.currentTarget, () => exportWord(sheetDoc(), ts.sheet === "teacher" ? "teacher" : "student", sheetTitle()).catch((err) => toast(err.message, "error"))));
  $("tsListen").addEventListener("click", (e) => { const b = e.target.closest("[data-play]"); if (b) togglePlay(b.dataset.play); });
  $("tsProblems").addEventListener("click", (e) => { const b = e.target.closest("[data-rewrite]"); if (b) rewritePart(b.dataset.rewrite, b); });
  $("tsRecent").addEventListener("click", (e) => {
    const row = e.target.closest("[data-doc]");
    if (!row) return;
    if (e.target.closest("[data-del]")) { deleteDoc(row.dataset.doc); renderRecent(); return; }
    const d = recentDocs("test").find((x) => x.id === row.dataset.doc);
    if (d) { ts.doc = d; ts.spec = { ...ts.spec, ...JSON.parse(JSON.stringify(d.spec)) }; ts.stale.clear(); ts.sheet = "A"; ts.ctx = null; renderAll(); toast("Opened a saved test.", "ok", { ms: 2000 }); }
  });
  paperEditing();
  built = true;
}

function setLevel(levelId, { quiet = false } = {}) {
  const keepLength = ts.spec.length;
  ts.spec = { ...testDefaults(levelId, keepLength), topic: ts.spec.topic, title: ts.spec.title, versions: ts.spec.versions, grammar: [] };
  savePrefs();
  renderShape(); renderParts(); renderOptions();
  if (!quiet) toast(`${levelLabel(levelId)}: ${plural(ts.spec.parts.length, "part")}, about ${estimateMinutes(ts.spec)} minutes.`, "info", { ms: 2400 });
}

function renderShape() {
  const s = ts.spec;
  $("tsShape").innerHTML = `
    <div class="st-row"><span class="st-lbl">Class</span><div class="lvl-chips">${LEVEL_IDS.map((id) => `<button type="button" class="chip${id === s.levelId ? " active" : ""}" data-level="${id}">${esc(CLASS_PROFILES[id].label)}</button>`).join("")}</div></div>
    <p class="st-hint">${esc(CLASS_PROFILES[s.levelId].greekGrades)} · ages ${esc(CLASS_PROFILES[s.levelId].ageRange)} · CEFR ${esc(CLASS_PROFILES[s.levelId].cefr)}</p>
    <div class="st-row"><span class="st-lbl">How long?</span><div class="len-cards">${Object.entries(LENGTHS).map(([k, l]) => `<button type="button" class="len-card${s.length === k ? " active" : ""}" data-length="${k}"><b>${esc(l.label)}</b><small>≈ ${l.minutes} min · ${l.skills.length} parts</small></button>`).join("")}</div></div>
    <div class="st-row"><span class="st-lbl">Difficulty</span>${segHtml("difficulty", Object.entries(DIFFICULTY).map(([k, v]) => [k, v.label.replace("Right for the class", "Just right")]), s.difficulty)}</div>
    <div class="st-row col"><span class="st-lbl">Grammar to test</span><div class="gram-chips">${(GRAMMAR_MENU[s.levelId] || []).map((g) => `<button type="button" class="chip${s.grammar.includes(g) ? " active" : ""}" data-grammar="${esc(g)}">${esc(g)}</button>`).join("")}</div>
      <input class="input sm" id="tsGrammarOwn" placeholder="…or type one" value="${esc(s.grammarOwn || "")}" /></div>
    <div class="st-row col"><span class="st-lbl">A theme for the texts <small>(optional)</small></span><input class="input sm" id="tsTopic" placeholder="e.g. a school trip to a volcano museum" value="${esc(s.topic || "")}" /></div>
    <div class="st-row col"><span class="st-lbl">Title <small>(optional)</small></span><input class="input sm" id="tsTitle" placeholder="Unit 4 Test" value="${esc(s.title || "")}" /></div>`;
  $("tsShape").querySelectorAll("[data-segmented]").forEach((root) => segmented(root, { value: s[root.dataset.seg], onChange: (v) => { s[root.dataset.seg] = v; savePrefs(); } }));
}

/* ── Parts editor ─────────────────────────────────────────────────── */
function markStale(id) { if (ts.doc) ts.stale.add(id); }

function renderParts() {
  const s = ts.spec;
  const rows = s.parts.map((p, i) => {
    const t = TASKS[p.task];
    const open = t.answer === "open";
    const stale = ts.stale.has(p.id);
    return `<div class="part-row${stale ? " stale" : ""}" data-part="${p.id}">
      <span class="part-n">${i + 1}</span>
      <span class="part-skill" title="${esc(SKILLS[p.skill].label)}">${SKILLS[p.skill].icon}<b>${esc(SKILLS[p.skill].label)}</b></span>
      <select class="select sm" data-part-task="${p.id}" aria-label="Task">${tasksFor(p.skill).map((x) => `<option value="${x.id}" ${x.id === p.task ? "selected" : ""}>${esc(x.label)}</option>`).join("")}</select>
      ${open ? `<span class="part-ctl"><small>points</small>${stepperHtml(`pts:${p.id}`, p.points || 10, 4, 30)}</span>` : `<span class="part-ctl"><small>questions</small>${stepperHtml(`items:${p.id}`, p.items, 3, 12)}</span>`}
      <span class="part-pts">${partPoints(p)} points</span>
      <span class="part-acts">
        <button type="button" class="icon-btn sm" data-move="-1" aria-label="Move up" ${i === 0 ? "disabled" : ""}>${icon("chevron-up", "i-sm")}</button>
        <button type="button" class="icon-btn sm" data-move="1" aria-label="Move down" ${i === s.parts.length - 1 ? "disabled" : ""}>${icon("chevron-down", "i-sm")}</button>
        <button type="button" class="icon-btn sm danger" data-remove aria-label="Remove part">${icon("x", "i-sm")}</button>
      </span>
      ${p.skill === "writing" && p.words ? `<span class="part-extra">${stepperHtml(`words:${p.id}`, p.words[1], 15, 150)}<small>words at most</small></span>` : ""}
      <input class="input sm part-note" data-part-note="${p.id}" placeholder="Any wish for this part? (optional) e.g. “about a school trip”" value="${esc(p.note || "")}" />
      ${ts.doc ? `<button type="button" class="btn btn-ghost btn-sm part-rewrite" data-rewrite="${p.id}">${icon("refresh", "i-sm")}${stale ? "Write this part" : "Write it again"}</button>` : ""}
    </div>`;
  }).join("");
  $("tsParts").innerHTML = `${rows || `<p class="st-hint">No parts yet — add one below.</p>`}
    <div class="add-parts"><span>Add a part:</span>${Object.entries(SKILLS).filter(([k]) => k !== "dictation").map(([k, v]) => `<button type="button" class="chip" data-add="${k}">${v.icon} ${esc(v.label)}</button>`).join("")}</div>`;
  $("tsSum").textContent = `${plural(s.parts.length, "part")} · ${specPoints(s)} points · ≈ ${estimateMinutes(s)} min`;
  renderPlanNote();
}

function onPartsClick(e) {
  const s = ts.spec;
  const add = e.target.closest("[data-add]");
  if (add) { s.parts.push(makePart(add.dataset.add, defaultTask(add.dataset.add, s.levelId), s.levelId)); markStale(s.parts.at(-1).id); savePrefs(); renderParts(); return; }
  const rw = e.target.closest("[data-rewrite]");
  if (rw) { rewritePart(rw.dataset.rewrite, rw); return; }
  const row = e.target.closest("[data-part]");
  if (!row) return;
  const i = s.parts.findIndex((p) => p.id === row.dataset.part);
  const p = s.parts[i];
  const step = e.target.closest("[data-step]");
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
  $("tsOptions").innerHTML = `
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

function specForAi() {
  const sel = picker.value();
  const spec = JSON.parse(JSON.stringify(ts.spec));
  spec.source = sel.kind === "topic" ? { kind: "topic" } : { kind: sel.kind, bookId: sel.bookId, units: sel.units, sections: sel.sections };
  if (sel.kind === "topic") spec.topic = [sel.topic, spec.topic].filter(Boolean).join(" — ");
  spec.grammar = [...spec.grammar, ...(spec.grammarOwn?.trim() ? [grammarLabel(spec.grammarOwn)] : [])];
  return { sel, spec };
}

function renderPlanNote() {
  if (!picker) return;
  const sel = picker.value();
  const picFor = makePicFor([...(sel.words || []), ...sel.focus]);
  const pictureWords = [...(sel.words || []), ...sel.focus].filter((w) => picFor(w.english));
  const spec = { ...ts.spec, source: { kind: sel.kind } };
  const probs = planProblems(spec, { pictureWords, focusWords: sel.focus });
  if (sel.kind === "topic" && !sel.topic.trim()) probs.push("Type the topic or grammar point to test.");
  $("tsPlanNote").innerHTML = probs.length ? `<div class="callout warning">${icon("alert")}<span>${esc(probs.join(" "))}</span></div>` : "";
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
      const meta = { ...sel.meta, label: sel.label, classLabel: levelLabel(spec.levelId) };
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
      const meta = ts.ctx?.meta || { ...sel.meta, label: sel.label, classLabel: levelLabel(spec.levelId) };
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
  ["tsPrint", "tsPdf", "tsWord"].forEach((id) => { $(id).disabled = !has; });
  if (!has) { paper.clear(); $("tsProblems").innerHTML = ""; $("tsListen").innerHTML = ""; return; }
  paper.render(sheetHtml());
  fitPaper($("tsStage"), $("tsPaper"));
  const byPart = ts.doc.sections.filter((s) => s.problems?.length);
  $("tsProblems").innerHTML = byPart.length ? `<div class="callout warning st-problems">${icon("alert")}<div><b>Worth a quick look before printing</b>${byPart.map((s) => `<div class="prob-row"><span>Part ${ts.doc.sections.indexOf(s) + 1} · ${esc(TASKS[s.task]?.label || "")}: ${esc(s.problems.slice(0, 2).join("; "))}</span><button type="button" class="btn btn-ghost btn-sm" data-rewrite="${s.id}">${icon("refresh", "i-sm")}Write it again</button></div>`).join("")}</div></div>` : "";
  const listening = ts.doc.sections.map((s, i) => ({ s, i })).filter(({ s }) => s.skill === "listening" && s.script?.length);
  $("tsListen").innerHTML = listening.length ? `<div class="listen-bar">${icon("volume", "i-sm")}<b>Play the listening</b>${listening.map(({ s, i }) => `<button type="button" class="btn btn-secondary btn-sm${ts.playing === s.id ? " playing" : ""}" data-play="${s.id}">${icon(ts.playing === s.id ? "pause" : "play", "i-sm")}Track ${i + 1} · plays ${s.plays === 1 ? "once" : "twice"}</button>`).join("")}<small>The computer reads it — a different voice for each speaker.</small></div>` : "";
}

function togglePlay(id) {
  if (ts.player) { ts.player.stop(); const was = ts.playing; ts.player = null; ts.playing = null; renderPaper(); if (was === id) return; }
  const s = ts.doc.sections.find((x) => x.id === id);
  if (!s) return;
  ts.playing = id;
  ts.player = playScript(s.script, { plays: s.plays, rate: RATE[ts.doc.meta.classProfile] || 0.9, onEnd: () => { ts.player = null; ts.playing = null; renderPaper(); } });
  renderPaper();
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
  const list = recentDocs("test").slice(0, 8);
  $("tsRecent").innerHTML = list.length
    ? list.map((d) => `<div class="recent-row" data-doc="${esc(d.id)}"><button type="button" class="recent-open"><b>${esc(d.meta?.title || "Test")}</b><span>${esc(d.meta?.subtitle || "")} · ${esc(levelLabel(d.meta?.classProfile))} · ${esc(d.meta?.points || "")} pts</span></button><button type="button" class="icon-btn sm danger" data-del aria-label="Delete">${icon("trash", "i-sm")}</button></div>`).join("")
    : `<p class="st-hint">Your tests are kept here, so you can print them again any time.</p>`;
}

function renderAll() {
  renderShape();
  renderParts();
  renderOptions();
  renderSheetSeg();
  renderRecent();
  renderPaper();
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
  ts.spec = { ...testDefaults(levelId, spec.length || "standard"), ...spec };
  if (pk) picker.set(pk);
  ts.doc = null;
  savePrefs();
  renderAll();
}
export function generateTestNow() { return generate($("tsGenerate")); }
