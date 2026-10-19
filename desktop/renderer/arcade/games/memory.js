/* Memory Match — numbered tiles; find each English word's partner. Teams keep their turn on a match. */
import { shuffle, maskWordInText } from "../deck.js";
import { teamPic } from "../../js/pics.js";

const MODES = {
  emoji: { label: "Picture", partner: (w) => ({ main: w.emojis, sub: "", big: true }) },
  phrase: { label: "Sentence", partner: (w) => ({ main: w.maskedPhrase, sub: "" }) },
  greek: { label: "Greek", partner: (w) => ({ main: w.greek, sub: "", lang: "el" }) },
};

/** A short sentence with the word gapped: the collocation if it has the word, else the example. */
function gapPhrase(w) {
  const c = String(w.collocation || "");
  const fromColl = c && c.toLowerCase() !== w.english.toLowerCase() ? maskWordInText(c, w.english, "____") : null;
  const fromEx = String(w.example || "").length <= 70 ? maskWordInText(w.example, w.english, "____") : null;
  return fromColl || fromEx || "";
}

export default {
  id: "memory",
  title: "Memory Match",
  emoji: "🧩",
  description: "Call out two numbers, flip the tiles and find each word's matching meaning.",
  tags: ["Teams", "Memory", "Meaning"],
  minWords: 3,
  create(ctx) {
    const { stage, esc, svg, sfx, speak, teams, pic } = ctx;
    const available = (mode) => ctx.deck.filter((w) => {
      if (mode === "greek") return ctx.greek() && !!w.greek;
      if (mode === "emoji") return !!pic(w.emojis);
      return !!gapPhrase(w);
    });
    let mode = localStorage.getItem("vm_mem_mode") || "emoji";
    const fallback = () => { if (available(mode).length < 3) mode = ["emoji", "phrase", "greek"].find((m) => available(m).length >= 3) || "emoji"; };
    fallback();
    let pairs = Number(localStorage.getItem("vm_mem_pairs") || 6);
    let tiles = [];
    let open = [];
    let lock = false;
    let moves = 0;
    let found = 0;
    let started = Date.now();
    let clock = null;

    function setup() {
      const pool = available(mode).map((w) => ({ ...w, maskedPhrase: gapPhrase(w) }));
      const n = Math.max(3, Math.min(pairs, pool.length));
      const chosen = shuffle(pool).slice(0, n);
      tiles = shuffle(chosen.flatMap((w, k) => [
        { pair: k, kind: "word", word: w },
        { pair: k, kind: "meaning", word: w },
      ])).map((t, idx) => ({ ...t, n: idx + 1, state: "down" }));
      open = [];
      lock = false;
      moves = 0;
      found = 0;
      started = Date.now();
      render();
    }

    function tileFace(t) {
      if (t.kind === "word") return `<span class="mm-en">${esc(t.word.english)}</span>`;
      const p = MODES[mode].partner(t.word);
      const main = mode === "emoji" ? pic(p.main) : esc(p.main || "");
      const sub = p.sub ? pic(p.sub) : "";
      return `<span class="mm-mean${p.big ? " big" : ""}" ${p.lang ? `lang="${p.lang}"` : ""}>${main}</span>${sub ? `<span class="mm-sub">${sub}</span>` : ""}`;
    }

    function render() {
      const cols = tiles.length <= 12 ? 4 : tiles.length <= 16 ? 4 : 5;
      stage.innerHTML = `
        <div class="mm">
          <div class="mm-bar">
            <span class="mm-label">Match words with</span><div class="arc-seg sm" id="mmMode">${Object.entries(MODES).map(([k, m]) => `<button type="button" data-mode="${k}" class="${k === mode ? "on" : ""}${k === "greek" ? " gk" : ""}" ${available(k).length < 3 ? "disabled" : ""}>${m.label}</button>`).join("")}</div>
            <div class="arc-seg sm" id="mmPairs">${[6, 8, 10].map((n) => `<button type="button" data-pairs="${n}" class="${n === pairs ? "on" : ""}" ${available(mode).length < n && n !== 6 ? "disabled" : ""}>${n * 2} tiles</button>`).join("")}</div>
            <span class="mm-turn" id="mmTurn"></span>
          </div>
          <div class="mm-grid" style="--cols:${cols}">
            ${tiles.map((t, idx) => `
              <button type="button" class="mm-tile ${t.kind}" data-idx="${idx}" style="--i:${idx};--dx:${(idx % cols) - (cols - 1) / 2};--dy:${Math.floor(idx / cols) - (Math.ceil(tiles.length / cols) - 1) / 2}" aria-label="Tile ${t.n}">
                <span class="mm-inner">
                  <span class="mm-back"><b>${t.n}</b></span>
                  <span class="mm-front">${tileFace(t)}</span>
                </span>
              </button>`).join("")}
          </div>
        </div>`;
      updateBar();
      clearInterval(clock);
      clock = setInterval(updateBar, 1000);
    }

    function updateBar() {
      const secs = Math.round((Date.now() - started) / 1000);
      ctx.setProgress(`<b>${found}</b> / ${tiles.length / 2} pairs · ${moves} moves · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`);
      const turn = stage.querySelector("#mmTurn");
      if (turn) turn.innerHTML = teams.solo ? "" : `<span class="mm-who" style="--team:${teams.active().color}">Turn: ${teams.turnHtml()}</span>`;
    }

    function flipTile(idx) {
      const t = tiles[idx];
      if (lock || !t || t.state !== "down") return;
      t.state = "up";
      const el = stage.querySelector(`[data-idx="${idx}"]`);
      el.classList.add("up");
      sfx.flip();
      if (t.kind === "word") speak(t.word.english);
      open.push(idx);
      if (open.length < 2) return;
      moves++;
      const [a, b] = open.map((k) => tiles[k]);
      lock = true;
      if (a.pair === b.pair) {
        setTimeout(() => {
          [a, b].forEach((x) => { x.state = "done"; });
          open.forEach((k) => {
            const n = stage.querySelector(`[data-idx="${k}"]`);
            n.classList.add("done");
            n.style.setProperty("--team", teams.active().color);
          });
          sfx.match();
          open.forEach((k) => ctx.fx.sparks(stage.querySelector(`[data-idx="${k}"]`), { count: 16, color: teams.active().color }));
          teams.award(10, { from: el });
          found++;
          open = [];
          lock = false;
          updateBar();
          if (found === tiles.length / 2) {
            clearInterval(clock);
            setTimeout(() => ctx.finish({
              title: "All pairs found!",
              stats: [{ value: moves, label: "moves" }, { value: `${Math.round((Date.now() - started) / 1000)}s`, label: "time" }],
            }), 700);
          }
        }, 380);
      } else {
        setTimeout(() => {
          open.forEach((k) => stage.querySelector(`[data-idx="${k}"]`)?.classList.add("nope"));
          sfx.wrong();
        }, 450);
        setTimeout(() => {
          open.forEach((k) => {
            tiles[k].state = "down";
            stage.querySelector(`[data-idx="${k}"]`)?.classList.remove("up", "nope");
          });
          open = [];
          lock = false;
          teams.nextTurn();
          updateBar();
        }, 1350);
      }
    }

    stage.addEventListener("click", (e) => {
      const tile = e.target.closest("[data-idx]");
      if (tile) { flipTile(Number(tile.dataset.idx)); return; }
      const m = e.target.closest("[data-mode]");
      if (m && !m.disabled && m.dataset.mode !== mode) {
        mode = m.dataset.mode;
        localStorage.setItem("vm_mem_mode", mode);
        setup();
      }
      const p = e.target.closest("[data-pairs]");
      if (p && !p.disabled) {
        pairs = Number(p.dataset.pairs);
        localStorage.setItem("vm_mem_pairs", String(pairs));
        setup();
      }
    });

    setup();

    let typed = "";
    let typedTimer = null;
    return {
      onTurn: () => updateBar(),
      onKey(e) {
        // Type a tile number (e.g. 1 then 2 for tile 12).
        if (/^\d$/.test(e.key)) {
          typed += e.key;
          clearTimeout(typedTimer);
          const commit = () => {
            const n = Number(typed);
            typed = "";
            const idx = tiles.findIndex((t) => t.n === n);
            if (idx >= 0) flipTile(idx);
          };
          if (Number(typed) * 10 > tiles.length) commit();
          else typedTimer = setTimeout(commit, 650);
        }
      },
      onGreek() {
        // Greek pairs only exist while Greek is on; otherwise fall back to pictures or sentences.
        if (mode === "greek" && !ctx.greek()) { fallback(); setup(); return; }
        stage.querySelectorAll("[data-mode]").forEach((b) => { b.disabled = available(b.dataset.mode).length < 3; });
      },
      destroy() { clearInterval(clock); clearTimeout(typedTimer); },
    };
  },
};
