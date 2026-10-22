/* "Choose your words" — the arcade's deck picker. The teacher goes Book → Unit → lesson section (Big Question,
   Lesson A/B, Workbook), ticks whole sections, the lesson's ten key words, or single words, and watches the deck grow
   on the right. Finer controls:
     • By page — "pp. 34–41" of the Student's Book and/or Workbook, across units and sections
     • Quick picks — key words, whole unit, tricky words, a review of the units so far, saved decks
     • Filters — word groups, single words / phrases, level, length, with a picture, with a recording,
       hide words played in the last week
     • Save the deck under a name (vm_arcade_decks) and load it next lesson
   Nothing here plays a game: it calls onApply(ids) and the arcade rebuilds its deck. */
import {
  listBooks, unitSections, unitInfo, filterWords, describePick, pickBreakdown, searchWords, randomPick, rowById, typeGroup,
  TYPE_GROUPS, SECTION_INFO, LEVELS, LENGTHS, wordLevel, wordsOnPages, pagesSummary, recentWords, saveDeck, deleteDeck, reviewPick,
  describeDeck, ownNotPicked,
} from "./deck-source.js";
import { addOwnWords } from "../studio/own-words.js";
import { CPP_WORDBANK } from "../coursebook-data.js";

let lessonIndex = null;
const keyCache = new Map();
/** The ten key words of each animated lesson of a unit: { BQ: [ids], A: [ids], B: [ids] } (empty when offline). */
async function keyWordsOf(bookId, unit) {
  const k = `${bookId}|${unit}`;
  if (keyCache.has(k)) return keyCache.get(k);
  const job = (async () => {
    try {
      lessonIndex = lessonIndex || (await fetch("./lessons/index.json").then((r) => r.json())).lessons;
      const out = {};
      await Promise.all(lessonIndex.filter((l) => l.bookId === bookId && l.unit === unit).map(async (l) => {
        const lesson = await fetch(`./lessons/${l.path}`).then((r) => r.json());
        out[l.section] = (lesson.focusWords || []).map((f) => f.wordId).filter((id) => rowById.has(id));
      }));
      return out;
    } catch { return {}; }
  })();
  keyCache.set(k, job);
  return job;
}

const read = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key) || "null"); return v ?? fallback; } catch { return fallback; } };
const write = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ } };
const bookOrder = new Map(CPP_WORDBANK.map((w, i) => [w.id, i]));
const inBookOrder = (ids) => [...ids].sort((a, b) => bookOrder.get(a) - bookOrder.get(b));

/**
 * @param {{ root: HTMLElement, esc: Function, svg: Function, sfx: object, pic: (row)=>string, picked: string[],
 *   minWords: {title:string, min:number}[], hasWorksheet: boolean, hasVoice?: (row)=>boolean,
 *   onApply: (ids:string[]|null)=>void, onClose: ()=>void }} o
 */
export function openDeckPicker(o) {
  const { esc, svg, sfx } = o;
  const hasVoice = o.hasVoice || (() => true);
  const books = listBooks();
  const first = [...o.picked].map((id) => rowById.get(id)).find(Boolean);
  const savedF = read("vm_dp_filters", {});
  const st = {
    bookId: first?.bookId || books[0].id,
    unit: first?.unit || 1,
    picked: new Set(o.picked.filter((id) => rowById.has(id))),
    groups: new Set(savedF.groups || []),
    pictureOnly: !!savedF.pictureOnly,
    voiceOnly: !!savedF.voiceOnly,
    phrases: ["any", "none"].includes(savedF.phrases) ? savedF.phrases : "any",
    levels: new Set(savedF.levels || []),
    lengths: new Set(savedF.lengths || []),
    hideRecent: !!savedF.hideRecent,
    more: !!(savedF.levels?.length || savedF.lengths?.length || savedF.voiceOnly || savedF.hideRecent || savedF.phrases === "none"),
    search: "",
    keys: {},
    pages: "",
    pageSrc: "sb", // sb | wb | both
    decks: read("vm_arcade_decks", []),
    naming: false,
    own: (o.own || []).map((w) => ({ english: w.english, greek: w.greek || "" })), // the teacher's own words
  };
  /** Words in the deck: the picked book words (a word picked in two units or sections counts once) plus the own words that aren't among them. */
  const deckSize = () => new Set([...st.picked].map((id) => rowById.get(id)?.english.trim().toLowerCase())).size + ownNotPicked(st.picked, st.own).length;
  const recent = recentWords(read("vm_arcade_played", {}), { days: 7 });
  const el = document.createElement("div");
  el.className = "dp";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Choose your words");
  o.root.appendChild(el);

  const filt = () => ({ groups: st.groups, pictureOnly: st.pictureOnly, voiceOnly: st.voiceOnly, phrases: st.phrases, levels: st.levels, lengths: st.lengths, exclude: st.hideRecent ? recent : null });
  const filtersOn = () => st.groups.size || st.pictureOnly || st.voiceOnly || st.phrases !== "any" || st.levels.size || st.lengths.size || st.hideRecent;
  const saveFilters = () => write("vm_dp_filters", { groups: [...st.groups], pictureOnly: st.pictureOnly, voiceOnly: st.voiceOnly, phrases: st.phrases, levels: [...st.levels], lengths: [...st.lengths], hideRecent: st.hideRecent });
  const withFilter = (rows) => filterWords(rows, filt(), (w) => !!o.pic(w), hasVoice);
  const pickedIn = (rows) => rows.reduce((n, w) => n + (st.picked.has(w.id) ? 1 : 0), 0);
  const unitPicked = (b, u) => unitSections(b, u).reduce((n, s) => n + pickedIn(s.words), 0);
  const unitRows = () => unitSections(st.bookId, st.unit).flatMap((s) => s.words);
  const keyRows = () => Object.values(st.keys).flat().map((id) => rowById.get(id)).filter(Boolean);
  const pageRows = () => withFilter(wordsOnPages(st.bookId, st.pages, { sb: st.pageSrc !== "wb", wb: st.pageSrc !== "sb" }));
  const bookShort = (id) => books.find((b) => b.id === id)?.short || id;

  async function loadKeys() {
    const k = `${st.bookId}|${st.unit}`;
    st.keys = {};
    const got = await keyWordsOf(st.bookId, st.unit);
    if (el.isConnected && k === `${st.bookId}|${st.unit}`) { st.keys = got; renderBrowse(); }
  }

  /* ── Quick picks: one tap to a good deck ─────────────────────────── */
  function quickHtml() {
    const tricky = withFilter(unitRows()).filter((w) => wordLevel(w) === 3);
    const key = withFilter(keyRows());
    return `<div class="dp-quick">
      <span class="dp-quick-l">⚡ Quick picks</span>
      ${key.length ? `<button type="button" class="dp-qp" data-qp="key" title="The words this unit's animated lessons teach">★ Unit ${st.unit} key words <b>${key.length}</b></button>` : ""}
      <button type="button" class="dp-qp" data-qp="unit">📗 Whole Unit ${st.unit} <b>${withFilter(unitRows()).length}</b></button>
      ${tricky.length >= 3 ? `<button type="button" class="dp-qp" data-qp="tricky" title="The longest, hardest words of the unit">🧗 Tricky words <b>${tricky.length}</b></button>` : ""}
      ${st.unit > 1 ? `<button type="button" class="dp-qp" data-qp="review" title="12 words from Units 1–${st.unit}, more from this unit">🔁 Review Units 1–${st.unit} <b>12</b></button>` : ""}
      <button type="button" class="dp-qp" data-qp="book" title="12 words from anywhere in the book">🎲 12 from ${esc(bookShort(st.bookId))}</button>
      ${st.decks.length ? `<span class="dp-quick-l mine">💾 My decks</span>${st.decks.map((d) => `<span class="dp-deck"><button type="button" data-load="${esc(d.id)}" title="${esc(describePick(d.ids))}">${esc(d.name)} <b>${d.ids.length}</b></button><button type="button" class="x" data-unsave="${esc(d.id)}" aria-label="Delete the deck ${esc(d.name)}">×</button></span>`).join("")}` : ""}
    </div>`;
  }

  function booksHtml() {
    return `<div class="dp-books">${books.map((b) => {
      const n = b.units.reduce((s, u) => s + unitPicked(b.id, u), 0);
      return `<button type="button" class="dp-book${b.id === st.bookId ? " on" : ""}" data-book="${b.id}">
        <b>${esc(b.short)}</b><span>${esc(b.cefr)}</span>${n ? `<i class="dp-badge">${n}</i>` : ""}</button>`;
    }).join("")}</div>`;
  }

  function unitsHtml() {
    const b = books.find((x) => x.id === st.bookId);
    return `<div class="dp-units">${b.units.map((u) => {
      const info = unitInfo(b.id, u);
      const n = unitPicked(b.id, u);
      return `<button type="button" class="dp-unit${u === st.unit ? " on" : ""}${n ? " has" : ""}" data-unit="${u}">
        <span class="dp-un">${u}</span><span class="dp-ut">${esc(info.title)}</span><small>${info.count} words</small>${n ? `<i class="dp-badge">${n}</i>` : ""}</button>`;
    }).join("")}</div>`;
  }

  /** "By page": any pages of the book, across units and sections. */
  function pagesHtml() {
    const rows = st.pages.trim() ? pageRows() : [];
    const allOn = rows.length > 0 && rows.every((w) => st.picked.has(w.id));
    return `<div class="dp-pages">
      <label class="dp-pg-in"><span>📖 By page</span><input id="dpPages" value="${esc(st.pages)}" placeholder="e.g. 34–41 or 34, 36, 40" autocomplete="off" spellcheck="false" maxlength="40"></label>
      <div class="arc-seg sm" id="dpPgSrc">${[["sb", "Student's Book"], ["wb", "Workbook"], ["both", "Both"]].map(([k, l]) => `<button type="button" data-pgsrc="${k}" class="${st.pageSrc === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <button type="button" class="dp-act${allOn ? " on" : ""}" data-pages-add ${rows.length ? "" : "disabled"}>${allOn ? "✓ " : "＋ "}${rows.length ? `${rows.length} words` : "Add the pages"}</button>
      <small class="dp-pg-note" id="dpPgNote">${st.pages.trim() ? (rows.length ? esc(pagesSummary(rows)) : "No words on those pages") : `${esc(bookShort(st.bookId))} · type the pages you taught`}</small>
    </div>`;
  }

  function filterHtml() {
    const chip = (on, attr, label, title = "") => `<button type="button" class="dp-fchip${on ? " on" : ""}" ${attr}${title ? ` title="${esc(title)}"` : ""}>${label}</button>`;
    return `<div class="dp-filter"><span>Show</span>${TYPE_GROUPS.map((g) => chip(st.groups.has(g.id), `data-group="${g.id}"`, g.label)).join("")}
      ${chip(st.pictureOnly, "data-pic", "🖼 With a picture")}
      <button type="button" class="dp-fchip more${st.more ? " on" : ""}" data-more>${st.more ? "▾" : "▸"} More filters${!st.more && (st.levels.size || st.lengths.size || st.voiceOnly || st.hideRecent || st.phrases !== "any") ? " •" : ""}</button>
      ${filtersOn() ? `<button type="button" class="dp-fchip clear" data-fclear>Show all</button>` : ""}</div>
      ${st.more ? `<div class="dp-filter more-row">
        <span>Level</span>${LEVELS.map((l) => chip(st.levels.has(l.id), `data-level="${l.id}"`, `${"★".repeat(l.id)} ${l.label}`)).join("")}
        <span>Length</span>${LENGTHS.map((l) => chip(st.lengths.has(l.id), `data-len="${l.id}"`, l.label)).join("")}
      </div>
      <div class="dp-filter more-row">
        ${chip(st.phrases === "none", "data-nophrase", "Single words only", "Leave out phrases like “go out”")}
        ${chip(st.voiceOnly, "data-voice", "🔊 With a recording", "Only words the studio voice has recorded")}
        ${chip(st.hideRecent, "data-recent", `🕘 Hide words played this week${recent.size ? ` (${recent.size})` : ""}`, "Leave out words your class played in the arcade in the last 7 days")}
      </div>` : ""}`;
  }

  function sectionHtml(s) {
    const shown = withFilter(s.words);
    const key = (st.keys[s.key] || []).map((id) => rowById.get(id)).filter(Boolean);
    const keyShown = withFilter(key);
    const n = pickedIn(s.words);
    const allOn = shown.length > 0 && shown.every((w) => st.picked.has(w.id));
    const keyOn = keyShown.length > 0 && keyShown.every((w) => st.picked.has(w.id));
    const pages = [...new Set(s.words.map((w) => w.sbPage || w.page).filter(Boolean))].sort((a, b) => a - b);
    const range = pages.length ? `pp. ${pages[0]}${pages.length > 1 ? `–${pages[pages.length - 1]}` : ""}` : "";
    return `<article class="dp-sec s-${s.key}${n ? " has" : ""}" data-sec="${s.key}">
      <header>
        <div class="dp-sec-title"><span class="dp-sec-tag">${esc(s.short)}</span><div><b>${esc(s.label)}</b><small>${esc(range)}${range ? " · " : ""}${s.words.length} words${n ? ` · <em>${n} picked</em>` : ""}</small></div></div>
        <div class="dp-sec-actions">
          ${key.length ? `<button type="button" class="dp-act${keyOn ? " on" : ""}" data-sec-key="${s.key}" title="The words this lesson's animated lesson teaches">★ ${keyShown.length} key words</button>` : ""}
          <button type="button" class="dp-act${allOn ? " on" : ""}" data-sec-all="${s.key}" ${shown.length ? "" : "disabled"}>${allOn ? "✓ " : ""}All ${shown.length}</button>
          ${n ? `<button type="button" class="dp-act ghost" data-sec-none="${s.key}">Clear</button>` : ""}
        </div>
      </header>
      <div class="dp-words">${shown.map((w) => `<button type="button" class="dp-word${st.picked.has(w.id) ? " on" : ""}${key.some((k) => k.id === w.id) ? " key" : ""}${recent.has(w.english.toLowerCase()) ? " recent" : ""}" data-word="${w.id}" title="${esc(`${w.greek || ""} · p. ${w.page}${recent.has(w.english.toLowerCase()) ? " · played this week" : ""}`)}">
        <span class="dp-wp">${o.pic(w)}</span><span class="dp-we">${esc(w.english)}</span><small>${esc(w.type || "")}</small>${w.page ? `<span class="dp-pg">p${esc(w.page)}</span>` : ""}</button>`).join("") || `<p class="dp-none">No words match these filters.</p>`}</div>
    </article>`;
  }

  function browseHtml() {
    const info = unitInfo(st.bookId, st.unit);
    const secs = unitSections(st.bookId, st.unit);
    const allShown = withFilter(secs.flatMap((s) => s.words));
    const allKey = withFilter(keyRows());
    const unitAllOn = allShown.length > 0 && allShown.every((w) => st.picked.has(w.id));
    return `
      ${quickHtml()}
      <div class="dp-step"><span class="dp-sn">1</span><h3>Book</h3></div>${booksHtml()}
      ${pagesHtml()}
      <div class="dp-step"><span class="dp-sn">2</span><h3>Unit</h3></div>${unitsHtml()}
      <div class="dp-step"><span class="dp-sn">3</span><h3>Lessons &amp; words</h3></div>
      <div class="dp-uhero">
        <div><b>Unit ${info.unit} · ${esc(info.title)}</b><small>${info.reading.map(esc).join(" · ")}</small></div>
        <div class="dp-uactions">
          ${allKey.length ? `<button type="button" class="dp-act" data-unit-key>★ Key words of the unit (${allKey.length})</button>` : ""}
          <button type="button" class="dp-act${unitAllOn ? " on" : ""}" data-unit-all>${unitAllOn ? "✓ " : ""}Whole unit (${allShown.length})</button>
        </div>
      </div>
      ${filterHtml()}
      <div class="dp-secs">${secs.map(sectionHtml).join("")}</div>`;
  }

  function cartHtml() {
    const n = deckSize();
    const parts = pickBreakdown(st.picked);
    const hits = st.search ? searchWords(st.search, 24) : [];
    const ready = o.minWords.map((g) => ({ ...g, ok: n >= g.min }));
    const short = ready.filter((g) => !g.ok);
    const stale = [...st.picked].filter((id) => recent.has(rowById.get(id)?.english.toLowerCase()));
    return `
      <div class="dp-cart-top">
        <div class="dp-count"><b id="dpCount">${n}</b><span>${n === 1 ? "word" : "words"} in your deck</span></div>
        <p class="dp-desc">${esc(describeDeck(st.picked, st.own))}</p>
      </div>
      <div class="dp-breakdown">${parts.map((p) => `<span class="dp-part" data-bk="${p.bookId}" data-bu="${p.unit}"><button type="button" data-goto="${p.bookId}|${p.unit}" title="Show this unit">${esc(p.label)} <b>${p.count}</b></button><button type="button" class="x" data-rm="${p.ids.join(",")}" aria-label="Remove these ${p.count} words">×</button></span>`).join("") || `<p class="dp-empty">Nothing picked yet. Tap a quick pick, a unit's ★ key words, type the pages you taught, or tap single words.</p>`}</div>
      <label class="dp-search"><span>Find a word</span><input id="dpSearch" value="${esc(st.search)}" placeholder="type: apple, travel, uncle…" autocomplete="off" spellcheck="false" maxlength="30"></label>
      ${hits.length ? `<div class="dp-hits">${hits.map((w) => `<button type="button" class="dp-word${st.picked.has(w.id) ? " on" : ""}" data-word="${w.id}" title="${esc(`${w.bookId.replace("CPP", "Book ")} · Unit ${w.unit} · p. ${w.page}`)}"><span class="dp-wp">${o.pic(w)}</span><span class="dp-we">${esc(w.english)}</span><small>${esc(w.bookId.replace("CPP", "B"))}·U${w.unit}</small></button>`).join("")}</div>` : st.search.length > 1 ? `<p class="dp-empty">No word like “${esc(st.search)}”.</p>` : ""}
      <div class="dp-own">
        <label class="dp-search"><span>Add your own words</span><input id="dpOwn" placeholder="e.g. crater, ash cloud, volcano - ηφαίστειο" autocomplete="off" spellcheck="false"></label>
        <button type="button" class="arc-btn ghost sm" data-own-add>＋ Add</button>
        ${st.own.length ? `<div class="dp-own-list">${st.own.map((w, i) => `<span class="dp-own-w"><b>${esc(w.english)}</b>${w.greek ? `<small>${esc(w.greek)}</small>` : ""}<button type="button" class="x" data-own-del="${i}" aria-label="Remove ${esc(w.english)}">×</button></span>`).join("")}</div>` : `<p class="dp-empty">Words that aren't in the books, or from another unit — they play alongside the words you picked. Separate them with commas.</p>`}
      </div>
      <div class="dp-tools">
        ${n > 12 ? `<button type="button" class="arc-btn ghost sm" data-trim="12">🎲 Keep 12 at random</button>` : ""}
        ${stale.length && stale.length < n ? `<button type="button" class="arc-btn ghost sm" data-unstale title="Leave out words the class played in the last 7 days">🕘 Leave out ${stale.length} played this week</button>` : ""}
        ${o.worksheetWords?.length ? `<button type="button" class="arc-btn ghost sm" data-worksheet-add title="Add the words of your worksheet (Worksheets → Step 2) to these">＋ My worksheet words</button>` : ""}
        ${o.hasWorksheet ? `<button type="button" class="arc-btn ghost sm" data-worksheet title="Play only the words of your worksheet">📄 Only my worksheet words</button>` : ""}
        ${n ? `<button type="button" class="arc-btn ghost sm" data-clear>Clear all</button>` : ""}
      </div>
      ${n >= 3 ? (st.naming
        ? `<div class="dp-save"><input id="dpDeckName" value="${esc(describeDeck(st.picked, st.own))}" maxlength="40" spellcheck="false" aria-label="Deck name"><button type="button" class="arc-btn primary sm" data-save-ok>Save</button><button type="button" class="arc-btn ghost sm" data-save-cancel>Cancel</button></div>`
        : `<button type="button" class="arc-btn ghost sm dp-save-btn" data-save>💾 Save this deck for next time</button>`) : ""}
      <ul class="dp-ready">${ready.map((g) => `<li class="${g.ok ? "ok" : ""}">${g.ok ? "✓" : "○"} ${esc(g.title)}${g.ok ? "" : ` <small>needs ${g.min}+</small>`}</li>`).join("")}</ul>
      <button type="button" class="arc-btn primary dp-go" data-apply ${n < 3 ? "disabled" : ""}>${svg("play", "i-sm")}${n < 3 ? "Pick at least 3 words" : `Play with ${n} words`}</button>
      ${short.length && n >= 3 ? `<p class="dp-tip">Tip: ${short.length === 1 ? esc(short[0].title) + " needs" : "a few games need"} more words — pick another lesson to unlock ${short.length === 1 ? "it" : "them"}.</p>` : ""}`;
  }

  const browse = () => el.querySelector(".dp-browse");
  const cart = () => el.querySelector(".dp-cart");
  function renderBrowse({ keepFocus = false } = {}) {
    const had = keepFocus && document.activeElement?.id === "dpPages";
    const pos = had ? document.activeElement.selectionStart : 0;
    const sc = browse().scrollTop;
    browse().innerHTML = browseHtml();
    browse().scrollTop = sc;
    if (had) { const i = browse().querySelector("#dpPages"); i.focus(); i.setSelectionRange(pos, pos); }
  }
  function renderCart({ keepFocus = false } = {}) {
    const had = keepFocus && document.activeElement?.id === "dpSearch";
    const pos = had ? document.activeElement.selectionStart : 0;
    cart().innerHTML = cartHtml();
    if (had) { const i = cart().querySelector("#dpSearch"); i.focus(); i.setSelectionRange(pos, pos); }
    if (st.naming) { const i = cart().querySelector("#dpDeckName"); i?.focus(); i?.select(); }
  }
  function renderAll() { renderBrowse(); renderCart(); }
  /** The count in the cart pops when it changes. */
  function bumpCount() { el.querySelector("#dpCount")?.animate?.([{ transform: "scale(1)" }, { transform: "scale(1.35)" }, { transform: "scale(1)" }], { duration: 380, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" }); }

  el.innerHTML = `
    <header class="dp-head">
      <div><h2>Choose your words</h2><p>Pick a book and a unit, then tick the lessons you taught — or type the pages, or just the words you want. Every game will use exactly these words.</p></div>
      <button type="button" class="arc-btn ghost" data-close>${svg("x", "i-sm")}Close</button>
    </header>
    <div class="dp-body"><section class="dp-browse"></section><aside class="dp-cart"></aside></div>`;
  renderAll();
  loadKeys();

  const toggle = (ids, on) => { for (const id of ids) on ? st.picked.add(id) : st.picked.delete(id); };
  const flip = (rows) => { const all = rows.length > 0 && rows.every((w) => st.picked.has(w.id)); toggle(rows.map((w) => w.id), !all); return !all; };
  const replace = (rows) => { st.picked = new Set(rows.map((w) => w.id)); };
  const filtersChanged = () => { saveFilters(); sfx.tap(); renderBrowse(); };
  const flipIn = (set, v) => { set.has(v) ? set.delete(v) : set.add(v); };

  /** Add typed or pasted own words to the deck. */
  function addOwn(text) {
    const before = st.own.length;
    st.own = addOwnWords(st.own, text);
    if (st.own.length === before) { el.querySelector("#dpOwn")?.focus(); return; }
    sfx.pop();
    renderCart();
    bumpCount();
    el.querySelector("#dpOwn")?.focus();
  }
  function saveNamed() {
    const name = el.querySelector("#dpDeckName")?.value || "";
    st.decks = saveDeck(st.decks, name, inBookOrder(st.picked), Date.now(), st.own);
    write("vm_arcade_decks", st.decks);
    st.naming = false;
    sfx.star();
    renderAll();
  }

  el.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    const d = t.dataset;
    if (t.hasAttribute("data-close")) { sfx.back(); o.onClose(); return; }
    if (d.book) { st.bookId = d.book; st.unit = books.find((b) => b.id === d.book).units[0]; sfx.tap(); renderAll(); loadKeys(); return; }
    if (d.unit) { st.unit = Number(d.unit); sfx.tap(); renderAll(); loadKeys(); return; }
    if (d.goto) { const [b, u] = d.goto.split("|"); st.bookId = b; st.unit = Number(u); sfx.tap(); renderAll(); loadKeys(); return; }
    // Filters (remembered for next time)
    if (d.group) { flipIn(st.groups, d.group); filtersChanged(); return; }
    if (t.hasAttribute("data-pic")) { st.pictureOnly = !st.pictureOnly; filtersChanged(); return; }
    if (t.hasAttribute("data-voice")) { st.voiceOnly = !st.voiceOnly; filtersChanged(); return; }
    if (t.hasAttribute("data-nophrase")) { st.phrases = st.phrases === "none" ? "any" : "none"; filtersChanged(); return; }
    if (t.hasAttribute("data-recent")) { st.hideRecent = !st.hideRecent; filtersChanged(); return; }
    if (d.level) { flipIn(st.levels, Number(d.level)); filtersChanged(); return; }
    if (d.len) { flipIn(st.lengths, d.len); filtersChanged(); return; }
    if (t.hasAttribute("data-more")) { st.more = !st.more; sfx.tap(); renderBrowse(); return; }
    if (t.hasAttribute("data-fclear")) { st.groups.clear(); st.levels.clear(); st.lengths.clear(); st.pictureOnly = false; st.voiceOnly = false; st.phrases = "any"; st.hideRecent = false; filtersChanged(); return; }
    // By page
    if (d.pgsrc) { st.pageSrc = d.pgsrc; sfx.tap(); renderBrowse(); return; }
    if (t.hasAttribute("data-pages-add")) { flip(pageRows()); sfx.pop(); renderAll(); bumpCount(); return; }
    // Quick picks
    if (d.qp) {
      const rows = d.qp === "key" ? withFilter(keyRows())
        : d.qp === "unit" ? withFilter(unitRows())
        : d.qp === "tricky" ? withFilter(unitRows()).filter((w) => wordLevel(w) === 3)
        : d.qp === "review" ? reviewPick(st.bookId, st.unit, 12)
        : randomPick(withFilter(CPP_WORDBANK.filter((w) => w.bookId === st.bookId && w.unit >= 1 && w.type !== "title")), 12);
      replace(rows);
      sfx.whoosh();
      renderAll();
      bumpCount();
      return;
    }
    if (d.load) { const deck = st.decks.find((x) => x.id === d.load); if (deck) { st.picked = new Set(deck.ids.filter((id) => rowById.has(id))); st.own = (deck.own || []).map((w) => ({ ...w })); const r = rowById.get(deck.ids[0]); if (r) { st.bookId = r.bookId; st.unit = r.unit; loadKeys(); } sfx.whoosh(); renderAll(); bumpCount(); } return; }
    if (d.unsave) { st.decks = deleteDeck(st.decks, d.unsave); write("vm_arcade_decks", st.decks); sfx.pointsDown(); renderBrowse(); return; }
    // Sections, units, words
    const sec = d.secKey || d.secAll || d.secNone;
    if (sec) {
      const s = unitSections(st.bookId, st.unit).find((x) => x.key === sec);
      if (d.secNone) toggle(s.words.map((w) => w.id), false);
      else if (d.secAll) flip(withFilter(s.words));
      else flip(withFilter((st.keys[sec] || []).map((id) => rowById.get(id)).filter(Boolean)));
      st.picked.size ? sfx.pop() : sfx.tap();
      renderAll();
      bumpCount();
      return;
    }
    if (t.hasAttribute("data-unit-all")) { flip(withFilter(unitRows())); sfx.pop(); renderAll(); bumpCount(); return; }
    if (t.hasAttribute("data-unit-key")) { flip(withFilter(keyRows())); sfx.pop(); renderAll(); bumpCount(); return; }
    if (d.word) { st.picked.has(d.word) ? st.picked.delete(d.word) : st.picked.add(d.word); sfx.tap(); t.classList.toggle("on", st.picked.has(d.word)); renderCart({ keepFocus: true }); renderBrowse(); bumpCount(); return; }
    if (d.rm) { toggle(d.rm.split(","), false); sfx.pointsDown(); renderAll(); return; }
    if (d.trim) { st.picked = new Set(randomPick([...st.picked], Number(d.trim))); sfx.whoosh(); renderAll(); bumpCount(); return; }
    if (t.hasAttribute("data-unstale")) { [...st.picked].forEach((id) => { if (recent.has(rowById.get(id)?.english.toLowerCase())) st.picked.delete(id); }); sfx.pointsDown(); renderAll(); bumpCount(); return; }
    if (t.hasAttribute("data-clear")) { st.picked.clear(); st.own = []; sfx.pointsDown(); renderAll(); return; }
    // The teacher's own words
    if (t.hasAttribute("data-own-add")) { addOwn(el.querySelector("#dpOwn")?.value); return; }
    if (d.ownDel !== undefined) { st.own = st.own.filter((_, i) => i !== Number(d.ownDel)); sfx.pointsDown(); renderCart(); return; }
    if (t.hasAttribute("data-worksheet-add")) { addOwn(o.worksheetWords.map((w) => (w.greek ? `${w.english} = ${w.greek}` : w.english)).join("\n")); return; }
    if (t.hasAttribute("data-save")) { st.naming = true; sfx.tap(); renderCart(); return; }
    if (t.hasAttribute("data-save-cancel")) { st.naming = false; sfx.tap(); renderCart(); return; }
    if (t.hasAttribute("data-save-ok")) { saveNamed(); return; }
    if (t.hasAttribute("data-worksheet")) { o.onApply(null); return; }
    // Keep the book's own order so decks read like the unit.
    if (t.hasAttribute("data-apply") && deckSize() >= 3) o.onApply(inBookOrder(st.picked), ownNotPicked(st.picked, st.own));
  });
  el.addEventListener("input", (e) => {
    if (e.target.id === "dpSearch") { st.search = e.target.value; renderCart({ keepFocus: true }); }
    if (e.target.id === "dpPages") { st.pages = e.target.value; renderBrowse({ keepFocus: true }); }
  });
  el.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); if (st.naming) { st.naming = false; renderCart(); } else o.onClose(); return; }
    if (e.key === "Enter" && e.target.id === "dpDeckName") { e.preventDefault(); saveNamed(); return; }
    if (e.key === "Enter" && e.target.id === "dpOwn") { e.preventDefault(); addOwn(e.target.value); return; }
    if (e.key === "Enter" && e.target.id === "dpPages") { e.preventDefault(); const rows = pageRows(); if (rows.length) { toggle(rows.map((w) => w.id), true); sfx.pop(); renderAll(); bumpCount(); } }
  }, true);

  return { destroy() { el.remove(); } };
}

export { typeGroup, SECTION_INFO };
