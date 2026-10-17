/* Library — every saved unit, with search, level filter, backup and restore. */
import {
  CLASS_PROFILES, getAllSavedSessions, getSavedSession, deleteSavedSession, normalizeWorksheetExercises,
} from "../../app.js";
import { $, esc, icon, plural, toast, confirmDialog, timeAgo } from "../ui.js";
import { state, emit, on, applyForm, LEVEL_COLORS } from "../state.js";
import { actions } from "../actions.js";

const SAVES_KEY = "lingo_maker_saves";

export function initLibrary() {
  $("libSearch").addEventListener("input", renderLibrary);
  $("libLevel").addEventListener("change", renderLibrary);
  $("btnBackup").addEventListener("click", exportBackup);
  $("btnRestore").addEventListener("click", () => $("restoreInput").click());
  $("restoreInput").addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (f) importBackup(f);
    e.target.value = "";
  });
  $("libraryGrid").addEventListener("click", async (e) => {
    const card = e.target.closest("[data-id]");
    const btn = e.target.closest("[data-act]");
    if (!card || !btn) return;
    const id = card.dataset.id;
    if (btn.dataset.act === "open") openSession(id, "preview");
    if (btn.dataset.act === "words") openSession(id, "words");
    if (btn.dataset.act === "delete") {
      const s = getSavedSession(id);
      const ok = await confirmDialog({ title: "Delete this unit?", body: `“${s?.label || "Unit"}” will be removed from this computer.`, okLabel: "Delete unit" });
      if (!ok) return;
      deleteSavedSession(id);
      if (state.sessionId === id) state.sessionId = null;
      card.style.transition = "opacity 200ms, transform 200ms";
      card.style.opacity = "0";
      card.style.transform = "scale(0.96)";
      setTimeout(() => emit("library"), 180);
      toast("Unit deleted.", "info");
    }
  });
  on("library", () => { renderLibrary(); updateLibraryCount(); });
}

export function updateLibraryCount() {
  const n = (getAllSavedSessions() || []).length;
  $("libraryCount").textContent = n;
  $("libraryCount").classList.toggle("hidden", !n);
}

export function openSession(id, view = "preview") {
  const s = getSavedSession(id);
  if (!s) { toast("That unit no longer exists.", "error"); return; }
  applyForm(s.form || {}, s.plan || null);
  state.data = normalizeWorksheetExercises(JSON.parse(JSON.stringify(s.data)));
  state.plan = s.plan || state.plan;
  state.sessionId = s.id;
  emit("setup", "words", "level", "data");
  actions.go(view);
  toast(`Opened ${s.label}.`, "ok", { ms: 2400 });
}

export function renderLibrary() {
  const all = getAllSavedSessions() || [];
  const q = $("libSearch").value.trim().toLowerCase();
  const lvl = $("libLevel").value;
  const list = all.filter((s) => {
    if (lvl && s.profileId !== lvl) return false;
    if (!q) return true;
    const words = (s.data?.lingoLauncher?.vocabulary || []).map((v) => v.english).join(" ");
    return `${s.label} ${s.pageRange} ${words}`.toLowerCase().includes(q);
  });
  const grid = $("libraryGrid");
  if (!all.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <div class="empty-art">${icon("library")}</div>
      <h3>Your library is empty</h3>
      <p>Every unit you generate or edit is saved here automatically. Try the sample unit to see how it works.</p>
      <button type="button" class="btn btn-primary" data-lib-sample>${icon("graduation", "i-sm")}Open the sample unit</button>
    </div>`;
    grid.querySelector("[data-lib-sample]").addEventListener("click", () => actions.loadSample());
    return;
  }
  if (!list.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty-art">${icon("search")}</div><h3>No units match</h3><p>Try another search or level.</p></div>`;
    return;
  }
  grid.innerHTML = list.map((s, i) => {
    const p = CLASS_PROFILES[s.profileId];
    const words = (s.data?.lingoLauncher?.vocabulary || []).map((v) => v.english).filter(Boolean);
    const current = s.id === state.sessionId;
    return `<article class="lib-card" data-id="${esc(s.id)}" style="--lvl:${LEVEL_COLORS[s.profileId] || "var(--brand)"};animation-delay:${Math.min(i, 12) * 35}ms">
      <div class="lib-top">
        <span class="lc-letter">${esc((p?.label || "?").charAt(0))}</span>
        <div class="lib-title">
          <strong title="${esc(s.label)}">${esc(s.label)}</strong>
          <span>${esc(p?.label || s.profileId || "")}${s.pageRange ? ` · p. ${esc(s.pageRange)}` : ""}</span>
        </div>
        ${current ? `<span class="badge brand">Open</span>` : ""}
      </div>
      <div class="lib-words">${words.slice(0, 7).map((w) => `<span>${esc(w)}</span>`).join("")}${words.length > 7 ? `<span>+${words.length - 7}</span>` : ""}</div>
      <div class="lib-meta">
        ${s.validationOk === false ? `<span class="badge warning">${icon("alert", "i-xs")}Has notes</span>` : `<span class="badge success">${icon("check", "i-xs")}Checked</span>`}
        <span>${plural(words.length, "word")}</span><span>·</span><span>${esc(timeAgo(s.savedAt))}</span>
      </div>
      <div class="lib-actions">
        <button type="button" class="btn btn-primary btn-sm" data-act="open">${icon("eye", "i-sm")}Open</button>
        <button type="button" class="btn btn-secondary btn-sm" data-act="words">${icon("list", "i-sm")}Edit words</button>
        <button type="button" class="icon-btn danger" data-act="delete" data-tip="Delete" aria-label="Delete unit">${icon("trash", "i-sm")}</button>
      </div>
    </article>`;
  }).join("");
}

function exportBackup() {
  const sessions = getAllSavedSessions() || [];
  if (!sessions.length) { toast("Nothing to back up yet.", "warn"); return; }
  const blob = new Blob([JSON.stringify({ app: "Vocab Master", version: 3, exportedAt: new Date().toISOString(), sessions }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `Vocab-Master-Backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  toast(`Backing up ${plural(sessions.length, "unit")}…`, "ok");
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || "{}"));
      const incoming = (Array.isArray(parsed) ? parsed : parsed.sessions || []).filter((s) => s && s.id && s.data && s.form);
      if (!incoming.length) { toast("No units found in that file.", "error"); return; }
      const byId = new Map((getAllSavedSessions() || []).map((s) => [s.id, s]));
      incoming.forEach((s) => byId.set(s.id, s));
      const merged = [...byId.values()].sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
      localStorage.setItem(SAVES_KEY, JSON.stringify(merged));
      emit("library");
      toast(`Restored ${plural(incoming.length, "unit")}.`, "ok");
    } catch (err) {
      toast(`That file couldn't be read: ${err.message}`, "error");
    }
  };
  reader.readAsText(file);
}
