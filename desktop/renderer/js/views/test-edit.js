/* Test Maker, Step 5 — everything on the paper can be changed.
 * A click opens the editor for what was clicked: the title, a part's instructions, the reading text, the word box,
 * a question (or the example), the writing task, the speaking cards, the listening script; on the teacher's pack,
 * the script, the speaking script and the model answer. A hovered question shows a small bar: Edit, and ✨ Remake —
 * Lingo rewrites just that question, with the teacher's wish or fresh. A part's heading has ✨ Rewrite part.
 * Every change keeps the part checked (reviseSection) and can be undone from its toast. */
import { esc, icon, toast, openDialog, plural } from "../ui.js";
import { SKILLS, TASKS, tfLabels } from "../../studio/tasks.js";
import { reviseSection, fixItemsPrompt, applyItemFixes } from "../../studio/test-builder.js";
import { remakePlan, remakeProblems, remakeRetryHint } from "../../studio/remake.js";

const CSS = `
.pe-t { position: relative; cursor: pointer; border-radius: 6px; transition: background 140ms, box-shadow 140ms; }
.ex-item.pe-t, .st-sec .pe-t.st-task { margin-left: -6px; margin-right: -6px; padding-left: 6px; padding-right: 6px; }
.pe-t:hover { background: #f3f1ff; box-shadow: 0 0 0 1.5px #b7aefc; }
.pe-t.pe-busy { pointer-events: none; background: #f3f1ff; box-shadow: 0 0 0 1.5px #b7aefc; }
.pe-t.pe-busy > * { opacity: .35; }
.pe-t.pe-busy::after { content: "Lingo is rewriting…"; position: absolute; inset: 0; display: grid; place-items: center; font: 700 12px/1 "Segoe UI", sans-serif; color: #4b3fd6; letter-spacing: .01em; }
.pe-t.pe-flash { animation: pe-flash 1.4s ease-out; }
@keyframes pe-flash { 0% { background: #d9f7e9; box-shadow: 0 0 0 2px #34d399; } 100% { background: transparent; box-shadow: none; } }
.pe-bar { position: absolute; top: -13px; right: 4px; z-index: 6; display: flex; gap: 3px; padding: 3px; border-radius: 10px; background: #fff; box-shadow: 0 6px 18px rgba(40, 30, 120, .18), 0 0 0 1px #e3defd; font: 650 12.5px/1 "Segoe UI", system-ui, sans-serif; white-space: nowrap; }
.pe-bar button { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 10px; border: 0; border-radius: 7px; background: transparent; color: #3b2fc9; font: inherit; cursor: pointer; }
.pe-bar button:hover { background: #efedff; }
.pe-bar button.magic { color: #fff; background: linear-gradient(135deg, #6d5df6, #a855f7); }
.pe-bar button.magic:hover { filter: brightness(1.08); }
.pe-bar button.danger { color: #c2410c; }
.pe-bar button.danger:hover { background: #fff1e8; }
.pe-add { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; margin: 2mm 0 1mm; padding: 1.6mm; border: 1.5px dashed #b7aefc; border-radius: 8px; background: transparent; color: #4b3fd6; font: 650 12.5px/1 "Segoe UI", system-ui, sans-serif; cursor: pointer; opacity: .55; transition: opacity 140ms, background 140ms; }
.st-sec:hover .pe-add, .pe-add:focus-visible { opacity: 1; }
.pe-add:hover { background: #f3f1ff; }
.pe-add.pe-busy { pointer-events: none; opacity: 1; background: #f3f1ff; }
`;

const lines = (v) => String(v || "").split("\n").map((x) => x.trim()).filter(Boolean);
/** A value safe inside a CSS attribute selector ("…"). */
const CSS_ESC = (s) => String(s).replace(/["\\]/g, (c) => `\\${c}`);
const WISHES = [["Another word", "build it on another word, not the same one"], ["Easier", "make it easier for this class"], ["Harder", "make it a bit harder"], ["Better wrong options", "write better wrong options"], ["Shorter", "make the sentence shorter"]];

/**
 * host: { root, doc(), view(), sheet(), spec(), ctx(): Promise<{ picFor, focus, pictureWords }>, profile(levelId, focus),
 *   ask(system, user), checkKeys(ids), commit(), rewritePart(id, wish) }
 */
export function mountTestEditing(host) {
  const targets = new WeakMap();
  let bar = null;
  let barFor = null;
  const busy = new Set();

  const mark = (el, data) => { if (el) { el.classList.add("pe-t"); targets.set(el, data); } };
  const A = (id) => host.doc()?.sections.find((s) => s.id === id);
  const label = (s) => `Part ${host.doc().sections.indexOf(s) + 1} · ${SKILLS[s.skill]?.label || ""} · ${TASKS[s.task]?.label || ""}`;

  /** Mark what can be edited on the paper just drawn. */
  function decorate() {
    const root = host.root;
    if (!host.doc()) return;
    const style = document.createElement("style");
    style.textContent = CSS;
    root.appendChild(style);
    bar = null; barFor = null;
    if (host.sheet() === "teacher") {
      root.querySelectorAll("section.st-key").forEach((secEl, i) => {
        const s = host.doc().sections[i];
        if (!s || s.skill === "dictation") return;
        mark(secEl.querySelector(".st-script"), { kind: "script", id: s.id });
        secEl.querySelectorAll(".st-speak-t").forEach((el) => mark(el, { kind: "speaking", id: s.id }));
        secEl.querySelectorAll(":scope > .st-sample").forEach((el) => mark(el, { kind: s.skill === "speaking" && s.cards?.length ? "speaking" : "sample", id: s.id }));
      });
      return;
    }
    const view = host.view();
    mark(root.querySelector(".ws-head"), { kind: "meta" });
    root.querySelectorAll("section.st-sec").forEach((secEl, i) => {
      const s = view.sections[i];
      if (!s || s.skill === "dictation") return;
      const id = s.id;
      mark(secEl.querySelector(".ex-head"), { kind: "rubric", id, rewrite: true });
      mark(secEl.querySelector(".st-audio"), { kind: "script", id });
      mark(secEl.querySelector(".st-passage"), { kind: "passage", id });
      mark(secEl.querySelector(".word-bank:not(.st-keywords)"), { kind: "bank", id });
      mark(secEl.querySelector(".match-defs"), { kind: "pairs", id });
      mark(secEl.querySelector(".st-example"), { kind: "example", id });
      [...secEl.querySelectorAll(".st-item:not(.st-example), .pic-card:not(.st-example)")].forEach((el, k) => {
        if (s.items[k]) mark(el, { kind: "item", id, ref: s.items[k], remake: true });
      });
      secEl.querySelectorAll(".st-task, .st-frame, .st-story-pics").forEach((el) => mark(el, { kind: "writing", id }));
      if (host.sheet() !== "B" && canAdd(s)) secEl.insertAdjacentHTML("beforeend", `<button type="button" class="pe-add" data-pe-add="${esc(id)}">＋ Add a question</button>`);
      secEl.querySelectorAll(".st-speak-card").forEach((el, k) => mark(el, { kind: "speaking", id, card: k }));
    });
  }

  /* ── The hover bar ── */
  function showBar(el) {
    if (barFor === el) return;
    bar?.remove();
    barFor = el;
    const d = targets.get(el);
    if (!d || busy.has(el)) { bar = null; return; }
    bar = document.createElement("div");
    bar.className = "pe-bar";
    bar.innerHTML = `<button type="button" data-pe-act="edit">✎ Edit</button>${d.remake ? `<button type="button" class="magic" data-pe-act="remake" title="Lingo writes this question again">✨ Remake</button>` : ""}${d.rewrite ? `<button type="button" class="magic" data-pe-act="rewrite" title="Lingo writes this whole part again">✨ Rewrite part</button>` : ""}${d.kind === "item" && canAdd(A(d.id)) ? `<button type="button" data-pe-act="add" title="Add a new question after this one">＋ Add after</button>` : ""}${d.kind === "item" ? `<button type="button" class="danger" data-pe-act="delete" title="Delete this question — the part renumbers and its points change">🗑 Delete</button>` : ""}`;
    el.appendChild(bar);
  }
  host.root.addEventListener("mouseover", (e) => {
    const el = e.composedPath().find((n) => n.classList?.contains("pe-t"));
    if (el) showBar(el);
  });
  host.root.addEventListener("mouseleave", () => { bar?.remove(); bar = null; barFor = null; }, true);
  host.root.addEventListener("click", (e) => {
    const path = e.composedPath();
    const addBtn = path.find((n) => n.dataset?.peAdd);
    if (addBtn) { addDialog(addBtn.dataset.peAdd); return; }
    const el = path.find((n) => n.classList?.contains("pe-t"));
    if (!el || busy.has(el)) return;
    const d = targets.get(el);
    const act = path.find((n) => n.dataset?.peAct)?.dataset.peAct || "edit";
    if (act === "add") { const s = A(d.id); if (s) addDialog(s.id, itemIndex(s, d.ref) + 1); return; }
    if (act === "remake") remakeDialog(d, el);
    else if (act === "rewrite") rewriteDialog(d);
    else if (act === "delete") deleteItem(d);
    else openEditor(d, el);
  });

  /* ── Changes, with undo ── */
  function snapshot() {
    return JSON.stringify({ sections: host.doc().sections, meta: host.doc().meta });
  }
  function done(before, message) {
    const doc = host.doc();
    host.commit();
    toast(message, "ok", { ms: 5000, actions: [{ label: "Undo", run: () => { if (host.doc() !== doc) return; Object.assign(doc, JSON.parse(before)); host.commit(); toast("Undone.", "info", { ms: 1600 }); } }] });
  }
  /** Change a part in the AI's shape and check it again. */
  async function revise(id, edit, message) {
    const before = snapshot();
    const ctx = await host.ctx().catch(() => ({}));
    // The test was closed or deleted meanwhile: nothing to change.
    if (!host.doc() || !reviseSection(host.doc(), host.spec(), id, edit, { picFor: ctx.picFor, focusWords: ctx.focus })) return;
    const s = A(id);
    done(before, s?.problems?.length ? `${message} — Lingo noticed something: see the orange note.` : message);
  }
  /**
   * Delete one question: the part is checked again, so the numbers, the letters of a matching list, the word
   * box, the points and the total all follow; Step 3 gets the new number of questions. Undo puts it back.
   */
  async function deleteItem(d) {
    const s = A(d.id);
    if (!s) return;
    if (s.items.length <= 1) { toast("A part needs at least one question — to drop the whole part, remove it in Step 3 (The parts).", "warn", { ms: 5000 }); return; }
    const idx = itemIndex(s, d.ref);
    const n = idx + 1;
    const doc = host.doc();
    const before = snapshot();
    const lc = (x) => String(x || "").trim().toLowerCase();
    const ctx = await host.ctx().catch(() => ({}));
    if (host.doc() !== doc) return;
    const ok = reviseSection(doc, host.spec(), d.id, (raw) => {
      if (!raw.items[idx]) return false;
      const [gone] = raw.items.splice(idx, 1);
      // Its answer leaves the word box too (unless another question still needs it).
      if (Array.isArray(raw.bank) && gone?.answer && !raw.items.some((it) => lc(it.answer) === lc(gone.answer))) {
        const at = raw.bank.findIndex((w) => lc(w) === lc(gone.answer));
        if (at >= 0) raw.bank.splice(at, 1);
      }
    }, { picFor: ctx.picFor, focusWords: ctx.focus });
    if (!ok) return;
    host.itemsChanged?.(d.id);
    host.commit();
    toast(`Question ${n} deleted — ${plural(A(d.id).items.length, "question")} left in this part.`, "ok", { ms: 6000, actions: [{ label: "Undo", run: () => {
      if (host.doc() !== doc) return;
      Object.assign(doc, JSON.parse(before));
      host.itemsChanged?.(d.id);
      host.commit();
      toast("Question put back.", "info", { ms: 1600 });
    } }] });
  }

  /* ── Add questions: Lingo writes them (how many, where, which words, how hard, a wish) or the teacher does ── */
  const MAX_ITEMS = 12;
  function canAdd(s) { return !!s && TASKS[s.task]?.answer !== "open" && s.skill !== "dictation" && s.items.length < MAX_ITEMS; }

  async function addDialog(id, at = null) {
    const s = A(id);
    if (!canAdd(s)) { toast(`A part can have up to ${MAX_ITEMS} questions.`, "info"); return; }
    const pos = at == null ? s.items.length : Math.max(0, Math.min(s.items.length, at));
    const room = MAX_ITEMS - s.items.length;
    const ctx = await host.ctx().catch(() => ({}));
    const lc = (x) => String(x || "").trim().toLowerCase();
    const inPart = (w) => s.items.some((it) => lc(it.answer).includes(lc(w)) || lc(it.prompt).includes(lc(w)));
    // The unit words this part hasn't used yet come first.
    const words = [...(ctx.focus || [])].filter((w) => w?.english).sort((a, b) => Number(inPart(a.english)) - Number(inPart(b.english))).slice(0, 24);
    const choice = s.answerType === "choice";
    const tf = s.answerType === "tf";
    const match = s.answerType === "match";
    const where = `<div class="field"><label class="label" for="pa_pos">Where</label><select class="select" id="pa_pos">${Array.from({ length: s.items.length + 1 }, (_, k) => `<option value="${k}"${k === pos ? " selected" : ""}>${k === s.items.length ? "At the end" : k === 0 ? "At the start (before question 1)" : `After question ${k}`}</option>`).join("")}</select></div>`;
    const ansField = tf
      ? `<div class="field"><label class="label" for="pa_ans">Right answer</label><select class="select" id="pa_ans">${tfLabels(host.doc().meta.classProfile).map((l) => `<option>${esc(l)}</option>`).join("")}</select></div>`
      : field("pa_ans", match ? "Meaning" : "Right answer", "");
    openDialog({
      title: "Add a question", subtitle: label(s), iconName: "plus", tone: "brand", sheet: true,
      body: `<div class="pe-wishes pa-mode" role="tablist"><button type="button" class="chip active" data-pa-mode="ai">✨ Lingo writes it</button><button type="button" class="chip" data-pa-mode="me">✎ I'll write it</button></div>
        ${where}
        <div data-pa-panel="ai">
          <div class="field"><span class="label">How many</span><span class="stepper" id="pa_n"><button type="button" class="icon-btn sm" data-pa-step="-1" aria-label="Fewer">${icon("minus", "i-sm")}</button><b>1</b><button type="button" class="icon-btn sm" data-pa-step="1" aria-label="More">${icon("plus", "i-sm")}</button></span> <small class="st-hint">up to ${Math.min(5, room)}</small></div>
          ${words.length ? `<div class="field"><span class="label">Use these words <span class="opt">optional — or Lingo picks words this part hasn't used</span></span><div class="pe-wishes">${words.map((w) => `<button type="button" class="chip${inPart(w.english) ? " used" : ""}" data-pa-word="${esc(w.english)}" title="${inPart(w.english) ? "Already in this part" : "Not in this part yet"}">${esc(w.english)}</button>`).join("")}</div></div>` : ""}
          <div class="field"><span class="label">How hard</span><div class="pe-wishes" data-pa-level><button type="button" class="chip" data-pa-lv="easier">Easier</button><button type="button" class="chip active" data-pa-lv="same">Like the others</button><button type="button" class="chip" data-pa-lv="harder">Harder</button></div></div>
          <div class="field"><label class="label" for="pa_wish">Anything else? <span class="opt">optional</span></label><textarea class="textarea" id="pa_wish" rows="2" placeholder="e.g. about the picnic, a question with “Where”, a funny sentence"></textarea></div>
          ${s.script?.length || s.passage ? `<p class="st-hint">${icon("info", "i-xs")} New questions ask about details of the ${s.script?.length ? "recording" : "text"} that no other question asks about.</p>` : ""}
        </div>
        <div data-pa-panel="me" hidden>
          ${field("pa_prompt", match ? "Word" : "Question / sentence", "", { rows: 2, hint: match ? "" : "write the gap as ________" })}
          ${choice ? field("pa_opts", "Options", "", { rows: 4, hint: "one per line — the right answer must be one of them" }) : ""}
          ${ansField}
        </div>`,
      foot: `<span class="spacer"></span><button type="button" class="btn btn-secondary" data-close>Cancel</button><button type="button" class="btn btn-magic" data-pa-go>${icon("sparkles", "i-sm")}<span>Add 1 question</span></button>`,
      onMount(root, close) {
        let mode = "ai";
        let n = 1;
        const go = root.querySelector("[data-pa-go]");
        const sync = () => {
          root.querySelector("#pa_n b").textContent = n;
          go.className = `btn ${mode === "ai" ? "btn-magic" : "btn-primary"}`;
          go.innerHTML = `${icon(mode === "ai" ? "sparkles" : "check", "i-sm")}<span>${mode === "ai" ? `Add ${n} question${n === 1 ? "" : "s"}` : "Add the question"}</span>`;
        };
        root.querySelectorAll("[data-pa-mode]").forEach((b) => b.addEventListener("click", () => {
          mode = b.dataset.paMode;
          root.querySelectorAll("[data-pa-mode]").forEach((x) => x.classList.toggle("active", x === b));
          root.querySelectorAll("[data-pa-panel]").forEach((p) => { p.hidden = p.dataset.paPanel !== mode; });
          sync();
        }));
        root.querySelectorAll("[data-pa-step]").forEach((b) => b.addEventListener("click", () => { n = Math.max(1, Math.min(Math.min(5, room), n + Number(b.dataset.paStep))); sync(); }));
        root.querySelectorAll("[data-pa-word]").forEach((b) => b.addEventListener("click", () => b.classList.toggle("active")));
        root.querySelectorAll("[data-pa-lv]").forEach((b) => b.addEventListener("click", () => root.querySelectorAll("[data-pa-lv]").forEach((x) => x.classList.toggle("active", x === b))));
        go.addEventListener("click", () => {
          const at2 = Number(root.querySelector("#pa_pos").value);
          if (mode === "me") {
            const v = (k) => root.querySelector(`#${k}`)?.value?.trim() ?? "";
            const item = { prompt: v("pa_prompt"), answer: v("pa_ans"), options: choice ? lines(v("pa_opts")) : undefined };
            if (!item.prompt && !match) { toast("Write the question.", "warn"); return; }
            if (!item.answer) { toast("Add the right answer.", "warn"); return; }
            if (choice && !item.options.some((o) => lc(o) === lc(item.answer))) { toast("The right answer must be one of the options.", "warn"); return; }
            close();
            addOwn(id, at2, item);
            return;
          }
          const picked = [...root.querySelectorAll("[data-pa-word].active")].map((b) => b.dataset.paWord);
          const lv = root.querySelector("[data-pa-lv].active")?.dataset.paLv || "same";
          close();
          addWithLingo(id, at2, n, { words: picked, level: lv, wish: root.querySelector("#pa_wish").value.trim() });
        });
        sync();
      },
    });
  }

  /** Insert items at a position (and keep Step 3's count in step); returns the doc snapshot taken before. */
  function insertItems(id, at, items, ctx) {
    const doc = host.doc();
    const before = snapshot();
    const ok = reviseSection(doc, host.spec(), id, (raw) => { raw.items.splice(at, 0, ...items); }, { picFor: ctx.picFor, focusWords: ctx.focus });
    if (!ok) return null;
    host.itemsChanged?.(id);
    return before;
  }
  function addedToast(doc, id, before, message, first) {
    host.commit();
    flash(id, first);
    toast(message, "ok", { ms: 6000, actions: [{ label: "Undo", run: () => {
      if (host.doc() !== doc) return;
      Object.assign(doc, JSON.parse(before));
      host.itemsChanged?.(id);
      host.commit();
      toast("Taken out again.", "info", { ms: 1600 });
    } }] });
  }

  async function addOwn(id, at, item) {
    const ctx = await host.ctx().catch(() => ({}));
    const doc = host.doc();
    const before = insertItems(id, at, [item], ctx);
    if (!before) return;
    addedToast(doc, id, before, `Question ${at + 1} added.`, at + 1);
  }

  async function addWithLingo(id, at, count, { words = [], level = "same", wish = "" } = {}) {
    const s = A(id);
    if (!s) return;
    const doc = host.doc();
    const btn = host.root.querySelector(`[data-pe-add="${CSS_ESC(id)}"]`);
    btn?.classList.add("pe-busy");
    if (btn) btn.textContent = `Lingo is writing ${count === 1 ? "a new question" : `${count} new questions`}…`;
    const stop = toast(`Lingo is writing ${count === 1 ? "a new question" : `${count} new questions`}…`, "info", { ms: 60000 });
    let before = null;
    try {
      const ctx = await host.ctx();
      if (host.doc() !== doc) return;
      // Placeholders hold the places; Lingo writes exactly those items, then the part is checked again.
      before = insertItems(id, at, Array.from({ length: count }, () => ({ prompt: "(a new question)", answer: "", options: s.answerType === "choice" ? ["?", "?"] : undefined })), ctx);
      if (!before) return;
      const ns = Array.from({ length: count }, (_, k) => at + k + 1);
      const others = A(id).items.filter((_, k) => !ns.includes(k + 1));
      const instruction = [
        `These are NEW questions added to the part. Each one is different from every other question (another word or another detail) — never a copy or a rewording of one of them.`,
        A(id).script?.length || A(id).passage ? `Each asks about a detail of the ${A(id).script?.length ? "script" : "text"} that no other question asks about.` : "",
        words.length ? `Build them on these words, one each where possible: ${words.join(", ")}.` : "Use words this part hasn't tested yet where you can.",
        level === "easier" ? "Make them a little easier than the others." : level === "harder" ? "Make them a little harder than the others." : "Make them as hard as the others.",
        s.answerType === "tf" ? "Mix the answers: about half one way, half the other, as in the rest of the part." : "",
        wish ? `The teacher's wish: ${wish}` : "",
        `The other questions (do not repeat): ${others.map((it) => it.prompt || it.answer).filter(Boolean).slice(0, 14).join(" | ")}`,
      ].filter(Boolean).join("\n");
      let missing = ns;
      for (let attempt = 0; attempt < 2 && missing.length; attempt++) {
        const { system, user } = fixItemsPrompt(host.spec(), A(id), missing, { profileBlock: host.profile(host.spec().levelId, ctx.focus), focusWords: ctx.focus, pictureWords: ctx.pictureWords, instruction });
        const reply = await host.ask(system, user, attempt ? `Write items ${missing.join(", ")} — real new questions with a right answer${s.answerType === "choice" ? " among the options" : ""}.` : "");
        if (host.doc() !== doc) return;
        applyItemFixes(doc, host.spec(), id, reply, missing, { picFor: ctx.picFor, focusWords: ctx.focus });
        const sec = A(id);
        missing = ns.filter((n) => { const it = sec.items[n - 1]; return !it || it.prompt === "(a new question)" || !it.answer || it.answer === "?"; });
      }
      if (missing.length) {
        Object.assign(doc, JSON.parse(before));
        host.itemsChanged?.(id);
        host.commit();
        toast("Lingo couldn’t write the new questions this time. Try again, or write one yourself (✎ I'll write it).", "warn", { ms: 7000 });
        return;
      }
      await host.checkKeys([id]);
      if (host.doc() !== doc) return;
      addedToast(doc, id, before, count === 1 ? `Question ${at + 1} is new.` : `Questions ${at + 1}–${at + count} are new.`, at + 1);
    } catch (e) {
      if (before && host.doc() === doc) { Object.assign(doc, JSON.parse(before)); host.itemsChanged?.(id); host.commit(); }
      toast(e?.message || "Lingo couldn’t add the questions.", "error");
    } finally {
      stop?.();
      btn?.classList.remove("pe-busy");
    }
  }

  /** The A-version item a paper item stands for (version B shuffles questions). */
  function itemIndex(s, ref) {
    if (host.sheet() !== "B") return ref.n - 1;
    const i = s.items.findIndex((it) => it.prompt === ref.prompt && it.answer === ref.answer);
    return i >= 0 ? i : ref.n - 1;
  }

  /* ── Editors ── */
  function form({ title, subtitle, iconName = "pencil", body, onSave, extraFoot = "", onMount }) {
    openDialog({
      title, subtitle, iconName, sheet: true, body,
      foot: `${extraFoot}<span class="spacer"></span><button type="button" class="btn btn-secondary" data-close>Cancel</button><button type="button" class="btn btn-primary" data-save>${icon("check", "i-sm")}Save</button>`,
      onMount(root, close) {
        const val = (id) => root.querySelector(`#${id}`)?.value ?? "";
        root.querySelector("[data-save]").addEventListener("click", async () => { if ((await onSave(val, root)) !== false) close(); });
        root.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) root.querySelector("[data-save]").click(); });
        onMount?.(root, close);
      },
    });
  }
  const field = (id, lab, value, { rows = 0, hint = "", attrs = "" } = {}) => `<div class="field"><label class="label" for="${id}">${lab}${hint ? ` <span class="opt">${hint}</span>` : ""}</label>${rows ? `<textarea class="textarea" id="${id}" rows="${rows}" ${attrs}>${esc(value || "")}</textarea>` : `<input class="input" id="${id}" value="${esc(value || "")}" autocomplete="off" ${attrs} />`}</div>`;

  function openEditor(d, el) {
    const doc = host.doc();
    if (d.kind === "meta") {
      return form({
        title: "The test’s title", iconName: "pencil",
        body: field("pe_title", "Title", doc.meta.title) + field("pe_sub", "Line under the title", doc.meta.subtitle, { hint: "optional" }),
        onSave: (v) => { const before = snapshot(); doc.meta.title = v("pe_title").trim() || doc.meta.title; doc.meta.subtitle = v("pe_sub").trim(); done(before, "Title saved."); },
      });
    }
    const s = A(d.id);
    if (!s) return;
    const sub = label(s);
    if (d.kind === "rubric") {
      return form({
        title: "Instructions", subtitle: sub,
        body: field("pe_rub", "What the children read", s.rubric, { rows: 2 }) + field("pe_rubel", "In Greek", s.rubricEl, { rows: 2, hint: "printed when Greek help is on" }),
        onSave: (v) => { const before = snapshot(); s.rubric = v("pe_rub").trim() || s.rubric; s.rubricEl = v("pe_rubel").trim(); done(before, "Instructions saved."); },
      });
    }
    if (d.kind === "passage") {
      return form({
        title: "The text", subtitle: sub,
        body: field("pe_ptitle", "Title", s.passageTitle, { hint: "optional" }) + field("pe_pass", "Text", s.passage, { rows: 12, hint: s.task === "R-GAP" || /\(\d+\)/.test(s.passage) ? "keep the gaps as (1) ________" : "" })
          + `<p class="st-hint">${icon("info", "i-xs")} The questions are checked against the text again when you save.</p>`,
        onSave: (v) => { if (!v("pe_pass").trim()) { toast("The text can’t be empty.", "warn"); return false; } revise(s.id, (raw) => { raw.passageTitle = v("pe_ptitle").trim(); raw.passage = v("pe_pass").trim(); }, "Text saved."); },
      });
    }
    if (d.kind === "bank") {
      return form({
        title: "The word box", subtitle: sub,
        body: field("pe_bank", "Words", s.bank.join("\n"), { rows: 8, hint: "one per line — the answers are always in it; extra words make it harder" }),
        onSave: (v) => revise(s.id, (raw) => { raw.bank = lines(v("pe_bank")); }, "Word box saved."),
      });
    }
    if (d.kind === "pairs") {
      return form({
        title: "Words and meanings", subtitle: sub,
        body: `<div class="pe-pairs">${s.items.map((it, k) => `<div class="pe-pair"><span class="pe-n">${k + 1}</span><input class="input" id="pe_w${k}" value="${esc(it.prompt)}" aria-label="Word ${k + 1}" /><input class="input" id="pe_m${k}" value="${esc(it.answer)}" aria-label="Meaning ${k + 1}" /></div>`).join("")}</div>`,
        onSave: (v) => revise(s.id, (raw) => { s.items.forEach((_, k) => { raw.items[k] = { ...raw.items[k], prompt: v(`pe_w${k}`).trim(), answer: v(`pe_m${k}`).trim() }; }); }, "Words and meanings saved."),
      });
    }
    if (d.kind === "item" || d.kind === "example") return itemEditor(s, d, el);
    if (d.kind === "writing") {
      return form({
        title: "The writing task", subtitle: sub,
        body: field("pe_task", "The task", s.task_prompt, { rows: 3 }) + field("pe_frame", "Help points", s.frame.join("\n"), { rows: 4, hint: "one per line" }) + field("pe_sample", "Model answer", s.sample, { rows: 5, hint: "teacher’s pack" }),
        onSave: (v) => revise(s.id, (raw) => { raw.prompt = v("pe_task").trim(); raw.frame = lines(v("pe_frame")); raw.sample = v("pe_sample").trim(); }, "Writing task saved."),
      });
    }
    if (d.kind === "sample") {
      return form({
        title: "Model answer", subtitle: sub,
        body: field("pe_sample", "Model answer", s.sample, { rows: 8 }),
        onSave: (v) => revise(s.id, (raw) => { raw.sample = v("pe_sample").trim(); }, "Model answer saved."),
      });
    }
    if (d.kind === "script") {
      return form({
        title: "Listening script", subtitle: sub, iconName: "mic",
        body: field("pe_script", "What the speakers say", s.script.map((l) => `${l.speaker}: ${l.text}`).join("\n"), { rows: 12, hint: "one line each: Name: words" })
          + `<div class="field"><label class="label" for="pe_plays">The children hear it</label><select class="select" id="pe_plays"><option value="2"${s.plays !== 1 ? " selected" : ""}>twice</option><option value="1"${s.plays === 1 ? " selected" : ""}>once</option></select></div>`
          + `<p class="st-hint">${icon("info", "i-xs")} Every answer must still be said in the script. The audio is made again from the new script.</p>`,
        onSave: (v) => {
          const script = lines(v("pe_script")).map((l) => { const m = l.match(/^([^:]{1,24}):\s*(.+)$/); return m ? { speaker: m[1].trim(), text: m[2].trim() } : { speaker: "Narrator", text: l }; });
          if (!script.length) { toast("The script can’t be empty.", "warn"); return false; }
          const plays = Number(v("pe_plays")) === 1 ? 1 : 2;
          revise(s.id, (raw) => { raw.script = script; }, "Script saved.").then(() => { const x = A(s.id); if (x) { x.plays = plays; host.commit(); } });
        },
      });
    }
    if (d.kind === "speaking") return speakingEditor(s, d.card);
  }

  function itemEditor(s, d, el) {
    const example = d.kind === "example";
    const idx = example ? -1 : itemIndex(s, d.ref);
    const it = example ? s.example : s.items[idx];
    if (!it) return;
    const choice = s.answerType === "choice";
    const tf = s.answerType === "tf";
    const ans = tf ? `<div class="field"><label class="label" for="pe_ans">Right answer</label><select class="select" id="pe_ans">${tfLabels(host.doc().meta.classProfile).map((l, i) => `<option${it.tf === i ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></div>` : field("pe_ans", s.answerType === "match" ? "Meaning" : "Right answer", it.answer);
    form({
      title: example ? "The example" : `Question ${it.n}`, subtitle: label(s),
      body: field("pe_prompt", s.answerType === "match" ? "Word" : "Question / sentence", it.prompt, { rows: 3, hint: /_{3,}/.test(it.prompt || "") ? "the gap is ________" : "" })
        + (choice ? field("pe_opts", "Options", it.options.join("\n"), { rows: 4, hint: "one per line — the right answer must be one of them" }) : "")
        + ans,
      extraFoot: example ? "" : `<button type="button" class="btn btn-magic" data-pe-remake>${icon("sparkles", "i-sm")}Remake with Lingo</button>`,
      onMount(root, close) { root.querySelector("[data-pe-remake]")?.addEventListener("click", () => { close(); remakeDialog(d, el); }); },
      onSave: (v) => {
        const item = { prompt: v("pe_prompt").trim(), answer: v("pe_ans").trim(), options: choice ? lines(v("pe_opts")) : undefined, evidence: it.evidence };
        if (choice && !item.options.some((o) => o.toLowerCase() === item.answer.toLowerCase())) { toast("The right answer must be one of the options.", "warn"); return false; }
        if (!item.answer) { toast("Add the right answer.", "warn"); return false; }
        revise(s.id, (raw) => { if (example) raw.example = item; else raw.items[idx] = item; }, example ? "Example saved." : `Question ${it.n} saved.`);
      },
    });
  }

  function speakingEditor(s, focusCard = -1) {
    const role = s.task === "S-ROLE";
    const cards = s.cards.length ? s.cards : [{ title: "", student: "", keyWords: [], questions: [], followUps: [], model: "" }];
    form({
      title: "Speaking cards", subtitle: label(s), iconName: "mic",
      body: field("pe_warm", "Warm-up questions", (s.warmup || []).join("\n"), { rows: 2, hint: "one per line" })
        + cards.map((c, k) => `<fieldset class="pe-card" data-card="${k}"><legend>${role ? `Student ${k % 2 ? "B" : "A"}` : `Card ${k + 1}`}</legend>
          ${field(`pe_ct${k}`, "Title", c.title)}${field(`pe_cs${k}`, "What the student reads", c.student, { rows: 2 })}
          ${field(`pe_ck${k}`, "Key words", c.keyWords.join(", "), { hint: "commas" })}
          ${field(`pe_cq${k}`, "Teacher’s questions", c.questions.join("\n"), { rows: 3, hint: "one per line" })}
          ${field(`pe_cf${k}`, "Follow-up questions", c.followUps.join("\n"), { rows: 2, hint: "one per line" })}
          ${field(`pe_cm${k}`, role ? "Model dialogue" : "Model answer", c.model, { rows: 3 })}</fieldset>`).join(""),
      onMount(root) { if (focusCard >= 0) root.querySelector(`[data-card="${focusCard}"]`)?.scrollIntoView({ block: "center" }); },
      onSave: (v) => revise(s.id, (raw) => {
        raw.warmup = lines(v("pe_warm"));
        raw.cards = cards.map((_, k) => ({ title: v(`pe_ct${k}`).trim(), student: v(`pe_cs${k}`).trim(), keyWords: v(`pe_ck${k}`).split(",").map((x) => x.trim()).filter(Boolean), questions: lines(v(`pe_cq${k}`)), followUps: lines(v(`pe_cf${k}`)), model: v(`pe_cm${k}`).trim() }));
      }, "Speaking cards saved."),
    });
  }

  /* ── Lingo remakes one question ── */
  function remakeDialog(d, el) {
    const s = A(d.id);
    if (!s) return;
    const idx = itemIndex(s, d.ref);
    const it = s.items[idx];
    if (!it) return;
    const shown = `${it.prompt || ""}${it.options?.length ? ` — ${it.options.join(" / ")}` : ""}`.trim() || it.answer;
    openDialog({
      title: `Remake question ${it.n}`, subtitle: label(s), iconName: "sparkles", tone: "brand", size: "sm",
      body: `<p class="pe-now">${esc(shown)}</p>
        <div class="field"><label class="label" for="pe_wish">What should change? <span class="opt">optional</span></label>
          <textarea class="textarea" id="pe_wish" rows="2" placeholder="e.g. use the word “island”, ask about the second paragraph, make the wrong options closer"></textarea></div>
        <div class="pe-wishes">${WISHES.map(([l, w]) => `<button type="button" class="chip" data-wish="${esc(w)}">${esc(l)}</button>`).join("")}</div>`,
      foot: `<button type="button" class="btn btn-ghost" data-fresh>${icon("shuffle", "i-sm")}Surprise me</button><span class="spacer"></span><button type="button" class="btn btn-secondary" data-close>Cancel</button><button type="button" class="btn btn-magic" data-go>${icon("sparkles", "i-sm")}Remake</button>`,
      onMount(root, close) {
        const box = root.querySelector("#pe_wish");
        root.querySelectorAll("[data-wish]").forEach((b) => b.addEventListener("click", () => {
          b.classList.toggle("active");
          const picked = [...root.querySelectorAll("[data-wish].active")].map((x) => x.dataset.wish);
          const typed = box.value.split(";").map((x) => x.trim()).filter((x) => x && !WISHES.some(([, w]) => w === x));
          box.value = [...typed, ...picked].join("; ");
        }));
        root.querySelector("[data-fresh]").addEventListener("click", () => { close(); remake(s.id, idx, "", el); });
        root.querySelector("[data-go]").addEventListener("click", () => { close(); remake(s.id, idx, box.value.trim(), el); });
        box.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); root.querySelector("[data-go]").click(); } });
      },
    });
  }

  async function remake(id, idx, wish, el) {
    const s = A(id);
    const n = idx + 1;
    if (!s?.items[idx]) return;
    busy.add(el);
    el.classList.add("pe-busy");
    bar?.remove(); bar = null; barFor = null;
    const before = snapshot();
    const doc0 = host.doc();
    const restore = () => { if (host.doc() === doc0) Object.assign(doc0, JSON.parse(before)); };
    try {
      const ctx = await host.ctx();
      const spec = host.spec();
      // The wish becomes precise rules built from the question itself, and checks on the answer: a reply that
      // ignores the wish (the same word again, the same sentence) goes back to Lingo with the reason, up to 3 tries.
      const original = JSON.parse(JSON.stringify(s.items[idx]));
      const plan = remakePlan({ wish, item: original, siblings: s.items.filter((_, k) => k !== idx), candidates: ctx.focus || [] });
      let problems = [];
      for (let attempt = 0; attempt < 3; attempt++) {
        const sec = A(id);
        const { system, user } = fixItemsPrompt(spec, sec, [n], { profileBlock: host.profile(spec.levelId, ctx.focus), focusWords: ctx.focus, pictureWords: ctx.pictureWords, instruction: plan.instruction });
        const reply = await host.ask(system, user, attempt ? remakeRetryHint(problems) : "");
        if (host.doc() !== doc0) return; // the test was closed, deleted or rewritten meanwhile
        const changed = applyItemFixes(host.doc(), spec, id, reply, [n], { picFor: ctx.picFor, focusWords: ctx.focus });
        const now = A(id)?.items[idx];
        problems = changed.length ? remakeProblems(original, now, plan.checks) : ["no new question came back"];
        // A new question with its own fault (answer not among the options, a word outside the list) is not done either.
        if (changed.length) problems.push(...(A(id)?.problems || []).filter((p) => p.startsWith(`item ${n}:`)).map((p) => p.replace(/^item \d+: /, "")));
        if (!problems.length) break;
        restore();
      }
      if (problems.length) { toast(`Lingo didn’t manage it (${problems[0]}). Try other words in the box, or edit the question yourself.`, "warn", { ms: 7000 }); return; }
      await host.checkKeys([id]);
      if (host.doc() !== doc0) return;
      done(before, `Question ${n} is new.`);
      flash(id, n);
    } catch (e) {
      restore();
      toast(e?.message || "Lingo couldn’t remake that question.", "error");
    } finally {
      busy.delete(el);
      el.classList.remove("pe-busy");
    }
  }

  /** Light up a question after a change (on the paper just redrawn). */
  function flash(id, n) {
    const i = host.view()?.sections.findIndex((s) => s.id === id);
    const secEl = host.root.querySelectorAll("section.st-sec")[i];
    const item = secEl?.querySelectorAll(".st-item:not(.st-example), .pic-card:not(.st-example)")[host.sheet() === "B" ? -1 : n - 1];
    if (item) { item.classList.add("pe-flash"); item.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  }

  function rewriteDialog(d) {
    const s = A(d.id);
    if (!s) return;
    openDialog({
      title: "Rewrite this part", subtitle: label(s), iconName: "sparkles", tone: "brand", size: "sm",
      body: `<p class="st-hint">Lingo writes the whole part again — new questions${s.passage ? ", a new text" : s.script?.length ? ", a new script" : ""}. You can undo it.</p>
        <div class="field"><label class="label" for="pe_pwish">Anything to change? <span class="opt">optional</span></label>
        <textarea class="textarea" id="pe_pwish" rows="2" placeholder="e.g. a story about a school trip, more questions about animals"></textarea></div>`,
      foot: `<span class="spacer"></span><button type="button" class="btn btn-secondary" data-close>Cancel</button><button type="button" class="btn btn-magic" data-go>${icon("sparkles", "i-sm")}Rewrite part</button>`,
      onMount(root, close) {
        root.querySelector("[data-go]").addEventListener("click", async () => {
          const wish = root.querySelector("#pe_pwish").value.trim();
          close();
          const before = snapshot();
          const docId = host.doc()?.id;
          const secEl = host.root.querySelectorAll("section.st-sec")[host.view().sections.findIndex((x) => x.id === s.id)];
          secEl?.classList.add("pe-t", "pe-busy");
          const ok = await host.rewritePart(s.id, wish);
          secEl?.classList.remove("pe-busy");
          if (ok) toast("That part is new.", "ok", { ms: 5000, actions: [{ label: "Undo", run: () => { const d = host.doc(); if (!d || d.id !== docId) return; Object.assign(d, JSON.parse(before)); host.commit(); } }] });
        });
      },
    });
  }

  return { decorate };
}
