/* Lessons — the curated lesson library: pick a book, a unit, a lesson; teach it or play its words. */
import { CPP_BOOKS } from "../../app.js";
import { $, esc, icon, toast } from "../ui.js";
import { state, BOOK_COLORS } from "../state.js";
import { loadCatalog, loadArt } from "../../lesson/lesson.js";
import { onePicture } from "../../lesson/wordmatch.js";
import { downloadAllForOffline, offlineStatus } from "../../arcade/voice.js";
import { picUrl } from "../pics.js";

const SECTION_NAMES = { BQ: "Big Question", A: "Part A", B: "Part B" };
const SECTION_ICONS = { BQ: "❓", A: "📗", B: "📘" };
let book = null;
let handlers = { teach: () => {}, games: () => {} };

export function initLessons({ teach, games }) {
  handlers = { teach, games };
  $("lessonsView").addEventListener("click", async (e) => {
    const off = e.target.closest("[data-offline]");
    if (off) {
      off.disabled = true;
      const label = off.querySelector("span");
      const res = await downloadAllForOffline((d, t) => { label.textContent = `Downloading voices… ${Math.round((d / t) * 100)}%`; });
      label.textContent = res.failed ? `Saved ${res.done - res.failed} of ${res.total} — try again for the rest` : "Voices saved — lessons work offline";
      off.classList.toggle("done", !res.failed);
      off.disabled = false;
      return;
    }
    const tab = e.target.closest("[data-book]");
    if (tab) { book = tab.dataset.book; renderLessons(); return; }
    const act = e.target.closest("[data-lesson-act]");
    if (!act) return;
    const id = act.closest("[data-lesson]")?.dataset.lesson;
    if (!id) return;
    if (act.dataset.lessonAct === "teach") handlers.teach(id);
    if (act.dataset.lessonAct === "games") handlers.games(id);
  });
}

export async function renderLessons() {
  const host = $("lessonsView");
  const cat = await loadCatalog();
  const art = await loadArt();
  const lessons = cat.lessons || [];
  book = book || (CPP_BOOKS[state.cpp?.bookId] ? state.cpp.bookId : "CPP1");
  const bookDef = CPP_BOOKS[book];
  const units = Object.keys(bookDef.units).map(Number).filter((u) => u >= 1).sort((a, b) => a - b);
  const total = lessons.length;
  // Two children with their grandma between them (real proportions in lesson.css).
  const cast = ["c-mia-child", "c-grandma-eleni-elder", "c-leo-child"].map((id) => picUrl(id)).filter(Boolean);

  host.innerHTML = `
    <div class="lsn-hero">
      <div class="lsn-hero-text">
        <span class="lsn-kicker">Primary Path · ${total} story lessons</span>
        <h2>Teach a unit like a story</h2>
        <p>Lingo narrates each lesson on the projector: new words with pictures, an illustrated story, quick checks, a game and a speaking task. Three short lessons for every unit.</p>
        <ol class="lsn-steps">
          <li><b>1</b><span>Pick a unit below</span></li>
          <li><b>2</b><span>Press <em>Teach</em>, go full screen</span></li>
          <li><b>3</b><span>Move on with <kbd>→</kbd> or a clicker</span></li>
        </ol>
        <button type="button" class="lsn-offline" data-offline title="Store every recorded voice on this computer so lessons also work without internet">${icon("download", "i-sm")}<span>Save voices for offline use</span></button>
      </div>
      <div class="lsn-hero-art" aria-hidden="true">
        <span class="lsn-hill"></span>
        ${cast.map((src, i) => `<img class="lsn-cast c${i}" src="${esc(src)}" alt="" draggable="false">`).join("")}
      </div>
    </div>
    <div class="lsn-tabs" role="tablist">
      ${Object.values(CPP_BOOKS).map((b) => `<button type="button" role="tab" class="lsn-tab${b.id === book ? " on" : ""}" data-book="${b.id}" style="--book:${BOOK_COLORS[b.id]}"><b>${esc(b.title.replace("Cambridge Primary Paths", "Primary Path"))}</b><small>${esc(b.cefr)}</small></button>`).join("")}
    </div>
    <div class="lsn-grid">
      ${units.map((u, i) => {
        const info = bookDef.units[u];
        const mine = ["BQ", "A", "B"].map((s) => lessons.find((l) => l.bookId === book && l.unit === u && l.section === s));
        const hero = onePicture(mine.find((l) => l?.hero)?.hero) || "📚";
        const heroImg = art.units?.[`${book}-U${u}`];
        return `<article class="lsn-unit${heroImg ? " has-art" : ""}" style="--book:${BOOK_COLORS[book]};animation-delay:${i * 40}ms">
          ${heroImg ? `<img class="lsn-art" src="./assets/art/${esc(heroImg)}" alt="" loading="lazy">` : ""}
          <header><span class="lsn-hero-emoji">${esc(hero)}</span><div><small>Unit ${u}</small><h3>${esc(info.title)}</h3></div></header>
          <div class="lsn-list">
            ${mine.map((l, k) => {
              const s = ["BQ", "A", "B"][k];
              if (!l) return `<div class="lsn-row empty"><span class="lsn-ico">${SECTION_ICONS[s]}</span><span class="lsn-name"><b>${SECTION_NAMES[s]}</b><small>Not written yet</small></span></div>`;
              return `<div class="lsn-row" data-lesson="${esc(l.id)}">
                <span class="lsn-ico">${SECTION_ICONS[s]}</span>
                <span class="lsn-name"><b>${esc(l.title)}</b><small>${SECTION_NAMES[s]} · ${l.focusCount} words · ${l.durationMin} min${l.status !== "approved" ? ` · <em class="lsn-badge ${esc(l.status)}">${esc(l.status)}</em>` : ""}</small></span>
                <button type="button" class="btn btn-ghost btn-sm" data-lesson-act="games" title="Play arcade games with these words">${icon("gamepad", "i-sm")}</button>
                <button type="button" class="btn btn-primary btn-sm" data-lesson-act="teach">${icon("play", "i-sm")}Teach</button>
              </div>`;
            }).join("")}
          </div>
        </article>`;
      }).join("")}
    </div>
    ${total ? "" : `<p class="lsn-empty">No lessons found. Run <code>node scripts/lessons/draft-lessons.mjs --book CPP1 --unit 1</code> to create some.</p>`}`;
  showOfflineState();
}

/** The offline button says whether every voice is already on this computer. */
async function showOfflineState() {
  const btn = document.querySelector("#lessonsView [data-offline]");
  if (!btn || btn.disabled) return;
  try {
    const { cached, total } = await offlineStatus();
    if (total && cached >= total) { btn.classList.add("done"); btn.querySelector("span").textContent = "Voices saved — lessons work offline"; }
  } catch { /* cache unavailable: keep the button */ }
}

export function lessonsToast(err) { toast(`Couldn't open the lesson: ${err.message}`, "error"); }
