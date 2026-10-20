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
`;

const lines = (v) => String(v || "").split("\n").map((x) => x.trim()).filter(Boolean);
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
    bar.innerHTML = `<button type="button" data-pe-act="edit">✎ Edit</button>${d.remake ? `<button type="button" class="magic" data-pe-act="remake" title="Lingo writes this question again">✨ Remake</button>` : ""}${d.rewrite ? `<button type="button" class="magic" data-pe-act="rewrite" title="Lingo writes this whole part again">✨ Rewrite part</button>` : ""}${d.kind === "item" ? `<button type="button" class="danger" data-pe-act="delete" title="Delete this question — the part renumbers and its points change">🗑 Delete</button>` : ""}`;
    el.appendChild(bar);
  }
  host.root.addEventListener("mouseover", (e) => {
    const el = e.composedPath().find((n) => n.classList?.contains("pe-t"));
    if (el) showBar(el);
  });
  host.root.addEventListener("mouseleave", () => { bar?.remove(); bar = null; barFor = null; }, true);
  host.root.addEventListener("click", (e) => {
    const path = e.composedPath();
    const el = path.find((n) => n.classList?.contains("pe-t"));
    if (!el || busy.has(el)) return;
    const d = targets.get(el);
    const act = path.find((n) => n.dataset?.peAct)?.dataset.peAct || "edit";
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
