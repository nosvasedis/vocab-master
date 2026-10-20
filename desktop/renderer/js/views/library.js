/* Library — everything the teacher has made: worksheet units, unit tests and read-aloud dictations, with tabs,
 * search, a class filter, open / delete, and backup & restore of all of it. Opening and deleting go through
 * js/made.js, so the maker that has an item open is told at once. */
import { CLASS_PROFILES, getAllSavedSessions } from "../../app.js";
import { $, esc, icon, plural, toast, timeAgo } from "../ui.js";
import { emit, on, LEVEL_COLORS } from "../state.js";
import { actions } from "../actions.js";
import { readJSON, writeJSON } from "../bridge.js";
import { recentDocs, openMade, deleteMade, isOpen, reconcile, SAVES_KEY, DOCS_KEY } from "../made.js";
import { SKILLS, DICTATION_STYLES } from "../../studio/tasks.js";

const KINDS = [
  ["all", "Everything", "library"],
  ["unit", "Worksheets", "file"],
  ["test", "Tests", "clipboard"],
  ["dictation", "Read-aloud dictations", "mic"],
];
let kind = "all";

export function initLibrary() {
  $("libSearch").addEventListener("input", renderLibrary);
  $("libLevel").addEventListener("change", renderLibrary);
  $("libTabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-lib-kind]");
    if (!b) return;
    kind = b.dataset.libKind;
    renderLibrary();
  });
  $("btnBackup").addEventListener("click", exportBackup);
  $("btnRestore").addEventListener("click", () => $("restoreInput").click());
  $("restoreInput").addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (f) importBackup(f);
    e.target.value = "";
  });
  $("libraryGrid").addEventListener("click", (e) => {
    const card = e.target.closest("[data-id]");
    const btn = e.target.closest("[data-act]");
    if (!card || !btn) return;
    const { id, type } = card.dataset;
    if (btn.dataset.act === "open") openMade(type, id);
    if (btn.dataset.act === "words") openMade("unit", id, { view: "words" });
    if (btn.dataset.act === "delete") deleteMade(type, id);
  });
  on("library", () => { renderLibrary(); updateLibraryCount(); });
}

/** Everything saved, newest first: { type, id, savedAt, level, title, sub, words, raw }. */
function allItems() {
  const units = (getAllSavedSessions() || []).map((s) => ({
    type: "unit", id: s.id, savedAt: s.savedAt, level: s.profileId, title: s.label, raw: s,
    sub: `${CLASS_PROFILES[s.profileId]?.label || s.profileId || ""}${s.pageRange ? ` · p. ${s.pageRange}` : ""}`,
    words: (s.data?.lingoLauncher?.vocabulary || []).map((v) => v.english).filter(Boolean),
  }));
  const docs = recentDocs().map((d) => ({
    type: d.kind === "dictation" ? "dictation" : "test", id: d.id, savedAt: d.savedAt || d.createdAt, level: d.meta?.classProfile, raw: d,
    title: d.kind === "dictation" ? `${DICTATION_STYLES[d.sections?.[0]?.style]?.label || "Read-aloud"} dictation` : d.meta?.title || "Test",
    sub: `${CLASS_PROFILES[d.meta?.classProfile]?.label || ""}${d.meta?.label || d.meta?.subtitle ? ` · ${d.meta.label || d.meta.subtitle}` : ""}`,
    words: (d.focusWords || []).map((w) => w.english).filter(Boolean),
  }));
  return [...units, ...docs].sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
}

export function updateLibraryCount() {
  const n = (getAllSavedSessions() || []).length + recentDocs().length;
  $("libraryCount").textContent = n;
  $("libraryCount").classList.toggle("hidden", !n);
}

function cardHtml(it, i) {
  const p = CLASS_PROFILES[it.level];
  const base = `class="lib-card" data-id="${esc(it.id)}" data-type="${it.type}" style="--lvl:${LEVEL_COLORS[it.level] || "var(--brand)"};animation-delay:${Math.min(i, 12) * 35}ms"`;
  const kindChip = { unit: [icon("file", "i-xs"), "Worksheets"], test: [icon("clipboard", "i-xs"), "Test"], dictation: [icon("mic", "i-xs"), "Dictation"] }[it.type];
  const top = `<div class="lib-top">
      <span class="lc-letter">${esc((p?.label || "?").charAt(0))}</span>
      <div class="lib-title"><strong title="${esc(it.title)}">${esc(it.title)}</strong><span>${esc(it.sub)}</span></div>
      ${isOpen(it.type, it.id) ? `<span class="badge brand" data-tip="Open in its maker now">Open</span>` : `<span class="lib-kind ${it.type}">${kindChip[0]}${kindChip[1]}</span>`}
    </div>`;
  const words = it.words.length ? `<div class="lib-words">${it.words.slice(0, 7).map((w) => `<span>${esc(w)}</span>`).join("")}${it.words.length > 7 ? `<span>+${it.words.length - 7}</span>` : ""}</div>` : "";
  let meta;
  if (it.type === "unit") {
    meta = `${it.raw.validationOk === false ? `<span class="badge warning">${icon("alert", "i-xs")}Has notes</span>` : `<span class="badge success">${icon("check", "i-xs")}Checked</span>`}<span>${plural(it.words.length, "word")}</span>`;
  } else if (it.type === "test") {
    const secs = it.raw.sections || [];
    const skills = [...new Set(secs.map((s) => SKILLS[s.skill]?.icon).filter(Boolean))].join(" ");
    meta = `<span>${plural(secs.length, "part")} · ${esc(it.raw.meta?.points || "")} pts</span>${skills ? `<span>${skills}</span>` : ""}${it.raw.versionB ? `<span class="badge">A + B</span>` : ""}`;
  } else {
    const sec = it.raw.sections?.[0] || {};
    meta = `<span>${plural(sec.sentences?.length || 0, "sentence")}</span>`;
  }
  const actionsHtml = it.type === "unit"
    ? `<button type="button" class="btn btn-primary btn-sm" data-act="open">${icon("eye", "i-sm")}Open</button><button type="button" class="btn btn-secondary btn-sm" data-act="words">${icon("list", "i-sm")}Edit words</button>`
    : `<button type="button" class="btn btn-primary btn-sm" data-act="open">${icon("eye", "i-sm")}Open</button>`;
  return `<article ${base}>${top}${words}
      <div class="lib-meta">${meta}<span>·</span><span>${esc(timeAgo(it.savedAt))}</span></div>
      <div class="lib-actions">${actionsHtml}<button type="button" class="icon-btn danger" data-act="delete" data-tip="Delete" aria-label="Delete">${icon("trash", "i-sm")}</button></div>
    </article>`;
}

export function renderLibrary() {
  const all = allItems();
  const q = $("libSearch").value.trim().toLowerCase();
  const lvl = $("libLevel").value;
  const count = (k) => (k === "all" ? all.length : all.filter((x) => x.type === k).length);
  $("libTabs").innerHTML = KINDS.map(([k, label, ico]) => `<button type="button" class="lib-tab${kind === k ? " active" : ""}" data-lib-kind="${k}" aria-pressed="${kind === k}">${icon(ico, "i-sm")}${label}<small>${count(k)}</small></button>`).join("");
  const list = all.filter((it) => {
    if (kind !== "all" && it.type !== kind) return false;
    if (lvl && it.level !== lvl) return false;
    if (!q) return true;
    return `${it.title} ${it.sub} ${it.words.join(" ")}`.toLowerCase().includes(q);
  });
  const grid = $("libraryGrid");
  if (!all.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <div class="empty-art">${icon("library")}</div>
      <h3>Your library is empty</h3>
      <p>Every worksheet unit, test and read-aloud dictation you make is saved here automatically.</p>
      <button type="button" class="btn btn-primary" data-lib-new>${icon("plus", "i-sm")}Create your first unit</button>
    </div>`;
    grid.querySelector("[data-lib-new]").addEventListener("click", () => actions.go("setup"));
    return;
  }
  if (!list.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty-art">${icon("search")}</div><h3>Nothing matches</h3><p>Try another search, class or tab.</p></div>`;
    return;
  }
  grid.innerHTML = list.map(cardHtml).join("");
}

function exportBackup() {
  const sessions = getAllSavedSessions() || [];
  const docs = recentDocs();
  if (!sessions.length && !docs.length) { toast("Nothing to back up yet.", "warn"); return; }
  const blob = new Blob([JSON.stringify({ app: "Vocab Master", version: 4, exportedAt: new Date().toISOString(), sessions, docs }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `Vocab-Master-Backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  toast(`Backing up ${[sessions.length && plural(sessions.length, "unit"), docs.length && plural(docs.length, "test and dictation", "tests and dictations")].filter(Boolean).join(" and ")}…`, "ok");
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || "{}"));
      const incoming = (Array.isArray(parsed) ? parsed : parsed.sessions || []).filter((s) => s && s.id && s.data && s.form);
      const docs = (Array.isArray(parsed.docs) ? parsed.docs : []).filter((d) => d && d.id && (d.kind === "test" || d.kind === "dictation"));
      if (!incoming.length && !docs.length) { toast("Nothing to restore in that file.", "error"); return; }
      if (incoming.length) {
        const byId = new Map((getAllSavedSessions() || []).map((s) => [s.id, s]));
        incoming.forEach((s) => byId.set(s.id, s));
        const merged = [...byId.values()].sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
        localStorage.setItem(SAVES_KEY, JSON.stringify(merged));
      }
      if (docs.length) {
        const byId = new Map((readJSON(DOCS_KEY, []) || []).map((d) => [d.id, d]));
        docs.forEach((d) => byId.set(d.id, d));
        writeJSON(DOCS_KEY, [...byId.values()].sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0)).slice(0, 300));
      }
      reconcile();
      emit("library");
      toast(`Restored ${[incoming.length && plural(incoming.length, "unit"), docs.length && plural(docs.length, "test and dictation", "tests and dictations")].filter(Boolean).join(" and ")}.`, "ok");
    } catch (err) {
      toast(`That file couldn't be read: ${err.message}`, "error");
    }
  };
  reader.readAsText(file);
}
