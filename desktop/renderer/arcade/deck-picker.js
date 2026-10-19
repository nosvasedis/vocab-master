/* "Choose your words" — the arcade's deck picker. The teacher goes Book → Unit → lesson section (Big Question,
   Lesson A/B, Workbook), ticks whole sections, the lesson's ten key words, or single words, and watches the deck grow
   on the right. Nothing here plays a game: it calls onApply(ids) and the arcade rebuilds its deck. */
import { listBooks, unitSections, unitInfo, filterWords, describePick, pickBreakdown, searchWords, randomPick, rowById, typeGroup, TYPE_GROUPS, SECTION_INFO } from "./deck-source.js";
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

/**
 * @param {{ root: HTMLElement, esc: Function, svg: Function, sfx: object, pic: (row)=>string, picked: string[],
 *   minWords: {title:string, min:number}[], hasWorksheet: boolean, onApply: (ids:string[]|null)=>void, onClose: ()=>void }} o
 */
export function openDeckPicker(o) {
  const { esc, svg, sfx } = o;
  const books = listBooks();
  const first = [...o.picked].map((id) => rowById.get(id)).find(Boolean);
  const st = {
    bookId: first?.bookId || books[0].id,
    unit: first?.unit || 1,
    picked: new Set(o.picked.filter((id) => rowById.has(id))),
    groups: new Set(),
    pictureOnly: false,
    search: "",
    keys: {},
  };
  const el = document.createElement("div");
  el.className = "dp";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Choose your words");
  o.root.appendChild(el);

  const filt = () => ({ groups: st.groups, pictureOnly: st.pictureOnly });
  const withFilter = (rows) => filterWords(rows, filt(), (w) => !!o.pic(w));
  const pickedIn = (rows) => rows.reduce((n, w) => n + (st.picked.has(w.id) ? 1 : 0), 0);
  const unitPicked = (b, u) => unitSections(b, u).reduce((n, s) => n + pickedIn(s.words), 0);

  async function loadKeys() {
    const k = `${st.bookId}|${st.unit}`;
    st.keys = {};
    const got = await keyWordsOf(st.bookId, st.unit);
    if (el.isConnected && k === `${st.bookId}|${st.unit}`) { st.keys = got; renderBrowse(); }
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

  function filterHtml() {
    return `<div class="dp-filter"><span>Show</span>${TYPE_GROUPS.map((g) => `<button type="button" class="dp-fchip${st.groups.has(g.id) ? " on" : ""}" data-group="${g.id}">${g.label}</button>`).join("")}
      <button type="button" class="dp-fchip${st.pictureOnly ? " on" : ""}" data-pic>🖼 With a picture</button>
      ${st.groups.size || st.pictureOnly ? `<button type="button" class="dp-fchip clear" data-fclear>Show all</button>` : ""}</div>`;
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
          <button type="button" class="dp-act${allOn ? " on" : ""}" data-sec-all="${s.key}">${allOn ? "✓ " : ""}All ${shown.length}</button>
          ${n ? `<button type="button" class="dp-act ghost" data-sec-none="${s.key}">Clear</button>` : ""}
        </div>
      </header>
      <div class="dp-words">${shown.map((w) => `<button type="button" class="dp-word${st.picked.has(w.id) ? " on" : ""}${key.some((k) => k.id === w.id) ? " key" : ""}" data-word="${w.id}" title="${esc(w.greek || "")}">
        <span class="dp-wp">${o.pic(w)}</span><span class="dp-we">${esc(w.english)}</span><small>${esc(w.type || "")}</small></button>`).join("") || `<p class="dp-none">No words match these filters.</p>`}</div>
    </article>`;
  }

  function browseHtml() {
    const info = unitInfo(st.bookId, st.unit);
    const secs = unitSections(st.bookId, st.unit);
    const allShown = withFilter(secs.flatMap((s) => s.words));
    const allKey = withFilter(Object.values(st.keys).flat().map((id) => rowById.get(id)).filter(Boolean));
    const unitAllOn = allShown.length > 0 && allShown.every((w) => st.picked.has(w.id));
    return `
      <div class="dp-step"><span class="dp-sn">1</span><h3>Book</h3></div>${booksHtml()}
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
    const n = st.picked.size;
    const parts = pickBreakdown(st.picked);
    const hits = st.search ? searchWords(st.search, 24) : [];
    const ready = o.minWords.map((g) => ({ ...g, ok: n >= g.min }));
    const short = ready.filter((g) => !g.ok);
    return `
      <div class="dp-cart-top">
        <div class="dp-count"><b id="dpCount">${n}</b><span>${n === 1 ? "word" : "words"} in your deck</span></div>
        <p class="dp-desc">${esc(describePick(st.picked))}</p>
      </div>
      <div class="dp-breakdown">${parts.map((p) => `<span class="dp-part" data-bk="${p.bookId}" data-bu="${p.unit}"><button type="button" data-goto="${p.bookId}|${p.unit}" title="Show this unit">${esc(p.label)} <b>${p.count}</b></button><button type="button" class="x" data-rm="${p.ids.join(",")}" aria-label="Remove these ${p.count} words">×</button></span>`).join("") || `<p class="dp-empty">Nothing picked yet. Tap a unit, then ★ key words, a whole lesson, or single words.</p>`}</div>
      <label class="dp-search"><span>Find a word</span><input id="dpSearch" value="${esc(st.search)}" placeholder="type: apple, travel, uncle…" autocomplete="off" spellcheck="false" maxlength="30"></label>
      ${hits.length ? `<div class="dp-hits">${hits.map((w) => `<button type="button" class="dp-word${st.picked.has(w.id) ? " on" : ""}" data-word="${w.id}" title="${esc(`${w.bookId.replace("CPP", "Book ")} · Unit ${w.unit}`)}"><span class="dp-wp">${o.pic(w)}</span><span class="dp-we">${esc(w.english)}</span><small>${esc(w.bookId.replace("CPP", "B"))}·U${w.unit}</small></button>`).join("")}</div>` : st.search.length > 1 ? `<p class="dp-empty">No word like “${esc(st.search)}”.</p>` : ""}
      <div class="dp-tools">
        ${n > 12 ? `<button type="button" class="arc-btn ghost sm" data-trim="12">🎲 Keep 12 at random</button>` : ""}
        ${o.hasWorksheet ? `<button type="button" class="arc-btn ghost sm" data-worksheet>📄 My worksheet words</button>` : ""}
        ${n ? `<button type="button" class="arc-btn ghost sm" data-clear>Clear all</button>` : ""}
      </div>
      <ul class="dp-ready">${ready.map((g) => `<li class="${g.ok ? "ok" : ""}">${g.ok ? "✓" : "○"} ${esc(g.title)}${g.ok ? "" : ` <small>needs ${g.min}+</small>`}</li>`).join("")}</ul>
      <button type="button" class="arc-btn primary dp-go" data-apply ${n < 3 ? "disabled" : ""}>${svg("play", "i-sm")}${n < 3 ? "Pick at least 3 words" : `Play with ${n} words`}</button>
      ${short.length && n >= 3 ? `<p class="dp-tip">Tip: ${short.length === 1 ? esc(short[0].title) + " needs" : "a few games need"} more words — pick another lesson to unlock ${short.length === 1 ? "it" : "them"}.</p>` : ""}`;
  }

  const browse = () => el.querySelector(".dp-browse");
  const cart = () => el.querySelector(".dp-cart");
  function renderBrowse() { const sc = browse().scrollTop; browse().innerHTML = browseHtml(); browse().scrollTop = sc; }
  function renderCart({ keepFocus = false } = {}) {
    const had = keepFocus && document.activeElement?.id === "dpSearch";
    const pos = had ? document.activeElement.selectionStart : 0;
    cart().innerHTML = cartHtml();
    if (had) { const i = cart().querySelector("#dpSearch"); i.focus(); i.setSelectionRange(pos, pos); }
  }
  function renderAll() { renderBrowse(); renderCart(); }

  el.innerHTML = `
    <header class="dp-head">
      <div><h2>Choose your words</h2><p>Pick a book and a unit, then tick the lessons you taught — or just the words you want. Every game will use exactly these words.</p></div>
      <button type="button" class="arc-btn ghost" data-close>${svg("x", "i-sm")}Close</button>
    </header>
    <div class="dp-body"><section class="dp-browse"></section><aside class="dp-cart"></aside></div>`;
  renderAll();
  loadKeys();

  const toggle = (ids, on) => { for (const id of ids) on ? st.picked.add(id) : st.picked.delete(id); };
  const flip = (rows) => { const all = rows.length > 0 && rows.every((w) => st.picked.has(w.id)); toggle(rows.map((w) => w.id), !all); return !all; };

  el.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    const d = t.dataset;
    if (t.hasAttribute("data-close")) { sfx.back(); o.onClose(); return; }
    if (d.book) { st.bookId = d.book; st.unit = books.find((b) => b.id === d.book).units[0]; sfx.tap(); renderAll(); loadKeys(); return; }
    if (d.unit) { st.unit = Number(d.unit); sfx.tap(); renderAll(); loadKeys(); return; }
    if (d.goto) { const [b, u] = d.goto.split("|"); st.bookId = b; st.unit = Number(u); sfx.tap(); renderAll(); loadKeys(); return; }
    if (d.group) { st.groups.has(d.group) ? st.groups.delete(d.group) : st.groups.add(d.group); sfx.tap(); renderBrowse(); return; }
    if (t.hasAttribute("data-pic")) { st.pictureOnly = !st.pictureOnly; sfx.tap(); renderBrowse(); return; }
    if (t.hasAttribute("data-fclear")) { st.groups.clear(); st.pictureOnly = false; sfx.tap(); renderBrowse(); return; }
    const sec = d.secKey || d.secAll || d.secNone;
    if (sec) {
      const s = unitSections(st.bookId, st.unit).find((x) => x.key === sec);
      if (d.secNone) toggle(s.words.map((w) => w.id), false);
      else if (d.secAll) flip(withFilter(s.words));
      else flip(withFilter((st.keys[sec] || []).map((id) => rowById.get(id)).filter(Boolean)));
      st.picked.size ? sfx.pop() : sfx.tap();
      renderAll();
      return;
    }
    if (t.hasAttribute("data-unit-all")) { flip(withFilter(unitSections(st.bookId, st.unit).flatMap((s) => s.words))); sfx.pop(); renderAll(); return; }
    if (t.hasAttribute("data-unit-key")) { flip(withFilter(Object.values(st.keys).flat().map((id) => rowById.get(id)).filter(Boolean))); sfx.pop(); renderAll(); return; }
    if (d.word) { st.picked.has(d.word) ? st.picked.delete(d.word) : st.picked.add(d.word); sfx.tap(); t.classList.toggle("on", st.picked.has(d.word)); renderCart({ keepFocus: true }); renderBrowse(); return; }
    if (d.rm) { toggle(d.rm.split(","), false); sfx.pointsDown(); renderAll(); return; }
    if (d.trim) { const keep = new Set(randomPick([...st.picked], Number(d.trim)).map((x) => x)); st.picked = keep; sfx.whoosh(); renderAll(); return; }
    if (t.hasAttribute("data-clear")) { st.picked.clear(); sfx.pointsDown(); renderAll(); return; }
    if (t.hasAttribute("data-worksheet")) { o.onApply(null); return; }
    if (t.hasAttribute("data-apply") && st.picked.size >= 3) {
      // Keep the book's own order so decks read like the unit.
      const order = new Map(CPP_WORDBANK.map((w, i) => [w.id, i]));
      o.onApply([...st.picked].sort((a, b) => order.get(a) - order.get(b)));
    }
  });
  el.addEventListener("input", (e) => {
    if (e.target.id !== "dpSearch") return;
    st.search = e.target.value;
    renderCart({ keepFocus: true });
  });
  el.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); o.onClose(); } }, true);

  return { destroy() { el.remove(); } };
}

export { typeGroup, SECTION_INFO };
