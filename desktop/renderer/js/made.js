/* What the teacher made — worksheet units, tests and read-aloud dictations — and the one way to open, close
 * and delete them. Each maker (Worksheets, Test Maker, Dictation) tells this module what it has open; the
 * Library, Home, the makers' own lists and account sync all go through here. So a deleted item is closed
 * in its maker at once, is never saved back by a late edit, and can be brought back with Undo. */
import { getAllSavedSessions, deleteSavedSession } from "../app.js";
import { readJSON, writeJSON } from "./bridge.js";
import { state, emit } from "./state.js";
import { actions } from "./actions.js";
import { toast, confirmDialog, icon, esc } from "./ui.js";

export const SAVES_KEY = "lingo_maker_saves";
export const DOCS_KEY = "vm_studio_docs_v1";
const OPEN_KEY = "vm_open_docs_v1";
const MAX_DOCS = 300;

export const KIND_NAME = { unit: "worksheet unit", test: "test", dictation: "dictation" };
/** The screen each kind opens on, and the screens that belong to its maker. */
const HOME_VIEW = { unit: "preview", test: "tests", dictation: "dictation" };
const MAKER_VIEWS = { unit: ["setup", "words", "exercises", "preview"], test: ["tests"], dictation: ["dictation"] };

/**
 * kind → { openId(): string|null, open(id): boolean, close(reason): void, reveal?(), busy?(): boolean, unsaved?(): boolean }
 * open() only loads the item into the maker (no navigation); reveal() shows the open item's paper again;
 * close() empties the maker (the item stays saved).
 */
const makers = {};
/** Ids deleted in this run: a late save (an AI reply that lands after the delete) must not bring them back. */
const deleted = new Set();

export function registerMaker(kind, api) { makers[kind] = api; }
export const openId = (kind) => makers[kind]?.openId() || null;
export const isOpen = (kind, id) => !!id && openId(kind) === id;
/** The item a maker has open as it is now (its own copy when it says, else the saved one), or null. */
export const openItem = (kind) => makers[kind]?.current?.() || findMade(kind, openId(kind));

/* ── Tests and dictations (synced item by item, js/sync/registry.js) ── */
export function recentDocs(kind) {
  return (readJSON(DOCS_KEY, []) || []).filter((d) => d && (!kind || d.kind === kind));
}
export function saveDoc(doc) {
  if (!doc?.id) return false;
  const saved = recentDocs();
  const all = saved.filter((d) => d.id !== doc.id);
  // Deleted (and not put back by Undo or a restored backup): a late save doesn't bring it back.
  if (deleted.has(doc.id) && all.length === saved.length) return false;
  all.unshift({ ...doc, savedAt: new Date().toISOString() });
  // Everything made is kept (the Library lists it); only the very oldest go past 300.
  writeJSON(DOCS_KEY, all.slice(0, MAX_DOCS));
  return true;
}
function removeDoc(id) { writeJSON(DOCS_KEY, recentDocs().filter((d) => d.id !== id)); }
function putBackDoc(doc) {
  const all = [doc, ...recentDocs().filter((d) => d.id !== doc.id)];
  writeJSON(DOCS_KEY, all.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0)).slice(0, MAX_DOCS));
}
function putBackUnit(unit) {
  const all = [unit, ...(getAllSavedSessions() || []).filter((s) => s.id !== unit.id)];
  localStorage.setItem(SAVES_KEY, JSON.stringify(all.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0))));
}

export function findMade(kind, id) {
  if (!id) return null;
  if (kind === "unit") return (getAllSavedSessions() || []).find((s) => s.id === id) || null;
  return recentDocs(kind).find((d) => d.id === id) || null;
}

/* ── The open test / dictation survives a restart, like the open worksheet unit (state.sessionId) ── */
export function rememberOpen(kind, id) {
  const o = { ...(readJSON(OPEN_KEY, {}) || {}) };
  if (id) o[kind] = id; else delete o[kind];
  writeJSON(OPEN_KEY, o);
}
export const rememberedOpen = (kind) => (readJSON(OPEN_KEY, {}) || {})[kind] || null;

/** What a card calls an item: its title, or the kind. */
export function madeTitle(kind, item) {
  if (!item) return KIND_NAME[kind];
  if (kind === "unit") return item.label || "Worksheet unit";
  return item.meta?.title || (kind === "test" ? "Test" : "Read-aloud dictation");
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);
const busyNow = (kind) => {
  if (!makers[kind]?.busy?.()) return false;
  toast("Lingo is still writing — please wait a moment.", "warn");
  return true;
};

/** Open a saved item in its maker and go there. */
export async function openMade(kind, id, { view = HOME_VIEW[kind], quiet = false } = {}) {
  const item = findMade(kind, id);
  if (!item) {
    toast(`That ${KIND_NAME[kind]} isn’t in your library any more.`, "warn");
    reconcile();
    emit("library");
    return false;
  }
  const m = makers[kind];
  if (!m) return false;
  if (!isOpen(kind, id)) {
    if (busyNow(kind)) return false;
    if (m.unsaved?.()) {
      const ok = await confirmDialog({
        title: `Open “${madeTitle(kind, item)}”?`,
        body: "The word list you are working on hasn’t been turned into worksheets yet, so it isn’t in your library.",
        okLabel: "Open it", tone: "brand", iconName: "file",
      });
      if (!ok) return false;
    }
    if (!m.open(id)) { toast(`That ${KIND_NAME[kind]} couldn’t be opened.`, "error"); return false; }
    if (!quiet) toast(`Opened “${madeTitle(kind, item)}”.`, "ok", { ms: 2200 });
  } else m.reveal?.();
  actions.go(view, { force: true });
  emit("library");
  return true;
}

/** Close what a maker has open (the header's Close): it stays in the Library, and the maker starts again. */
export function closeMade(kind) {
  const id = openId(kind);
  if (!id || busyNow(kind)) return false;
  const title = madeTitle(kind, findMade(kind, id));
  makers[kind].close("closed");
  emit("library");
  toast(`Closed “${title}” — it is in your Library.`, "info", { ms: 4200, actions: [{ label: "Open again", run: () => openMade(kind, id, { quiet: true }) }] });
  return true;
}

/**
 * Delete a saved item, wherever the teacher asked from. If it is open, its maker is emptied first.
 * Undo puts it back (and opens it again if it was open).
 */
export async function deleteMade(kind, id, { confirm = true } = {}) {
  const item = findMade(kind, id);
  if (!item) { reconcile(); emit("library"); return false; }
  const wasOpen = isOpen(kind, id);
  if (wasOpen && busyNow(kind)) return false;
  const what = KIND_NAME[kind];
  if (confirm) {
    const ok = await confirmDialog({
      title: `Delete this ${what}?`,
      body: `“${madeTitle(kind, item)}” will be removed from your library${wasOpen ? " and closed" : ""}.`,
      okLabel: `Delete ${what}`,
    });
    if (!ok) return false;
  }
  deleted.add(id);
  if (wasOpen) makers[kind].close("deleted");
  if (kind === "unit") deleteSavedSession(id); else removeDoc(id);
  emit("library");
  toast(`${cap(what)} deleted.`, "info", { ms: 6000, actions: [{ label: "Undo", run: () => undoDelete(kind, item, wasOpen) }] });
  return true;
}

function undoDelete(kind, item, reopen) {
  deleted.delete(item.id);
  if (kind === "unit") putBackUnit(item); else putBackDoc(item);
  // Bring it back into its maker only when that maker hasn't moved on to something else meanwhile.
  if (reopen && !openId(kind) && !makers[kind]?.busy?.() && makers[kind]?.open(item.id)) {
    if (MAKER_VIEWS[kind].includes(state.view)) actions.go(HOME_VIEW[kind], { force: true });
  }
  emit("library");
  toast(`“${madeTitle(kind, item)}” is back.`, "ok", { ms: 2400 });
}

/** A maker whose open item is no longer saved (deleted on another computer, a restore…) is emptied. */
export function reconcile({ remote = false } = {}) {
  let closed = 0;
  for (const kind of Object.keys(makers)) {
    const id = openId(kind);
    if (!id || findMade(kind, id) || makers[kind].busy?.()) continue;
    makers[kind].close("gone");
    closed++;
    if (remote) toast(`The open ${KIND_NAME[kind]} was deleted on another computer, so it was closed.`, "info", { ms: 5000 });
  }
  return closed;
}

/**
 * The right end of a maker's header, the same in all three makers.
 * Something open: "Saved" (it is in the Library; every change is kept), Delete, and Close (puts it away —
 * it stays in the Library — and the maker starts again from Step 1).
 * Nothing open but work in progress (draft: a Worksheets word list not yet made into sheets): Start over.
 * The tips open downwards: above, the top bar would cover them.
 */
export function makerActsHtml(kind, { open, draft = false }) {
  const what = KIND_NAME[kind];
  if (open) {
    return `<span class="mk-saved" data-tip="Saved in your Library — every change is kept" data-tip-pos="bottom">${icon("check", "i-xs")}<span>Saved</span></span>
    <button type="button" class="icon-btn sm danger mk-del" data-mk-del data-tip="Delete this ${what}" data-tip-pos="bottom" aria-label="Delete this ${what}">${icon("trash", "i-sm")}</button>
    <button type="button" class="btn btn-secondary btn-sm mk-close" data-mk-close data-tip="Close this ${what} — it stays in your Library" data-tip-pos="bottom-end">${icon("x", "i-sm")}<span>Close</span></button>`;
  }
  if (draft) return `<button type="button" class="btn btn-ghost btn-sm mk-close" data-mk-close data-tip="Clear this word list and start again (Ctrl+N)" data-tip-pos="bottom-end">${icon("refresh", "i-sm")}<span>Start over</span></button>`;
  return "";
}
