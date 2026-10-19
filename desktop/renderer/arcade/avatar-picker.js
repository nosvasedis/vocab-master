/* Lingo Arcade — the avatar picker (a child's character and colour) and the crest picker (a team's mascot, colour,
   badge shape and name). Both save straight into the class (onChange → the arcade stores vm_classes). The avatar
   picker steps through the class with ‹ › so a teacher can dress everyone in one go. */
import { AVATARS, SHELVES, onShelf, COLORS, TEAM_MASCOTS, CREST_SHAPES, playerLook, teamCrest, setTeamCrest, takenAvatars, avatarDisc, crestBadge } from "./avatars.js";
import { sparks, pop } from "./showtime.js";

const SHAPE_LABEL = { shield: "Shield", circle: "Circle", star: "Star", hex: "Hexagon" };

function shell(root, { title, cls = "" }) {
  const el = document.createElement("div");
  el.className = `avp ${cls}`;
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", title);
  root.appendChild(el);
  return el;
}

/**
 * @param {{ root: HTMLElement, cls: object, playerId: string, sfx: object, esc: Function, onChange: Function }} o
 */
export function openAvatarPicker(o) {
  const { cls, sfx, esc } = o;
  let id = o.playerId;
  let shelf = "all";
  const el = shell(o.root, { title: "Choose an avatar" });
  const player = () => cls.players.find((p) => p.id === id);

  function render(animate = false) {
    const p = player();
    if (!p) { close(); return; }
    const look = playerLook(cls, p);
    const taken = takenAvatars(cls, p.id);
    const whoHas = new Map(cls.players.filter((x) => x.id !== p.id).map((x) => [playerLook(cls, x).emoji, x.name]));
    const i = cls.players.indexOf(p);
    el.innerHTML = `
      <div class="avp-box">
        <header class="avp-head">
          <h2>Choose <b>${esc(p.name)}</b>'s avatar</h2>
          <span class="avp-count">${i + 1} / ${cls.players.length}</span>
          <button type="button" class="arc-btn ghost sm" data-close>Done</button>
        </header>
        <div class="avp-main">
          <div class="avp-preview" style="--av:${look.color}">
            <div class="avp-stage">${avatarDisc(look.emoji, look.color, { cls: "hero" })}</div>
            <b class="avp-name">${esc(p.name)}</b>
            <span class="avp-what">${esc(AVATARS.find((a) => a.emoji === look.emoji)?.name || "")}</span>
            <div class="avp-colors" role="radiogroup" aria-label="Colour">${COLORS.map((c) => `<button type="button" class="avp-sw${c === look.color ? " on" : ""}" data-color="${c}" style="--c:${c}" aria-label="Colour ${c}"></button>`).join("")}</div>
            <button type="button" class="arc-btn ghost sm" data-random>🎲 Surprise me</button>
            <div class="avp-nav">
              <button type="button" class="arc-btn ghost sm" data-prev ${i === 0 ? "disabled" : ""}>‹ ${esc(cls.players[i - 1]?.name || "")}</button>
              <button type="button" class="arc-btn primary sm" data-next ${i === cls.players.length - 1 ? "disabled" : ""}>${esc(cls.players[i + 1]?.name || "")} ›</button>
            </div>
          </div>
          <div class="avp-pick">
            <div class="avp-shelves">${[{ id: "all", label: "All" }, ...SHELVES].map((s) => `<button type="button" class="${s.id === shelf ? "on" : ""}" data-shelf="${s.id}">${esc(s.label)}</button>`).join("")}</div>
            <div class="avp-grid">${AVATARS.filter((a) => shelf === "all" || onShelf(a, shelf)).map((a, k) => `
              <button type="button" class="avp-opt${a.emoji === look.emoji ? " on" : ""}${taken.has(a.emoji) ? " taken" : ""}" data-av="${esc(a.emoji)}" style="--i:${k}" title="${esc(a.name)}${whoHas.has(a.emoji) ? ` — ${esc(whoHas.get(a.emoji))} has it` : ""}">
                ${avatarDisc(a.emoji, a.emoji === look.emoji ? look.color : "#3a3570", { cls: "md" })}
                <small>${whoHas.has(a.emoji) ? esc(whoHas.get(a.emoji)) : esc(a.name)}</small>
              </button>`).join("")}</div>
          </div>
        </div>
      </div>`;
    if (animate) el.querySelector(".avp-box")?.classList.add("in");
  }

  function set(patch) {
    Object.assign(player(), patch);
    o.onChange();
    render();
    const hero = el.querySelector(".avp-stage .av");
    pop(hero, { scale: 1.18 });
    sparks(hero, { count: 16, color: playerLook(cls, player()).color });
  }

  function step(d) {
    const i = cls.players.findIndex((p) => p.id === id);
    const nx = cls.players[i + d];
    if (!nx) return;
    id = nx.id;
    sfx.whoosh();
    render();
    el.querySelector(".avp-stage")?.animate?.([{ transform: `translateX(${d * 40}px)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 260, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
  }

  function close() {
    window.removeEventListener("keydown", onKey, true);
    el.classList.add("out");
    setTimeout(() => el.remove(), 180);
  }

  const onKey = (e) => {
    if (!el.isConnected) { window.removeEventListener("keydown", onKey, true); return; }
    if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
    else if (e.key === "Enter") { e.preventDefault(); close(); }
  };
  window.addEventListener("keydown", onKey, true);
  el.addEventListener("arc-close", () => window.removeEventListener("keydown", onKey, true));

  el.addEventListener("click", (e) => {
    if (e.target === el) { close(); return; }
    const b = e.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-close")) { sfx.tap(); close(); return; }
    if (b.dataset.shelf) { shelf = b.dataset.shelf; sfx.tap(); render(); return; }
    if (b.dataset.av) { sfx.pop(); set({ avatar: b.dataset.av }); return; }
    if (b.dataset.color) { sfx.tap(); set({ color: b.dataset.color }); return; }
    if (b.hasAttribute("data-random")) {
      const free = AVATARS.map((a) => a.emoji).filter((x) => !takenAvatars(cls, id).has(x));
      const pool = free.length ? free : AVATARS.map((a) => a.emoji);
      sfx.sparkle();
      set({ avatar: pool[Math.floor(Math.random() * pool.length)], color: COLORS[Math.floor(Math.random() * COLORS.length)] });
      return;
    }
    if (b.hasAttribute("data-prev")) { step(-1); return; }
    if (b.hasAttribute("data-next")) step(1);
  });
  render(true);
  return { close };
}

/**
 * @param {{ root: HTMLElement, cls: object, teamIndex: number, sfx: object, esc: Function, teamName: (i:number)=>string,
 *   onRename: (i:number, name:string)=>void, onChange: Function }} o
 */
export function openCrestPicker(o) {
  const { cls, sfx, esc } = o;
  const ti = o.teamIndex;
  const el = shell(o.root, { title: "Team crest", cls: "crest-pick" });
  // 🐯 and 🐬 are team mascots already: their avatar twins would only repeat them.
  const mascots = [...TEAM_MASCOTS, ...AVATARS.filter((a) => !TEAM_MASCOTS.some((m) => m.emoji === a.emoji))];

  function render(animate = false) {
    const c = teamCrest(cls, ti);
    el.innerHTML = `
      <div class="avp-box">
        <header class="avp-head">
          <h2>Team crest</h2>
          <button type="button" class="arc-btn ghost sm" data-close>Done</button>
        </header>
        <div class="avp-main">
          <div class="avp-preview" style="--av:${c.color}">
            <div class="avp-stage">${crestBadge(c, { cls: "hero" })}</div>
            <input class="avp-tname" id="avpName" value="${esc(o.teamName(ti))}" maxlength="16" spellcheck="false" aria-label="Team name">
            <div class="avp-colors" role="radiogroup" aria-label="Colour">${COLORS.map((col) => `<button type="button" class="avp-sw${col === c.color ? " on" : ""}" data-color="${col}" style="--c:${col}" aria-label="Colour ${col}"></button>`).join("")}</div>
            <div class="avp-shapes">${CREST_SHAPES.map((s) => `<button type="button" class="${s === c.shape ? "on" : ""}" data-shape="${s}" title="${SHAPE_LABEL[s]}">${crestBadge({ ...c, shape: s }, { cls: "sm" })}</button>`).join("")}</div>
          </div>
          <div class="avp-pick">
            <div class="avp-grid">${mascots.map((m, k) => `
              <button type="button" class="avp-opt${m.emoji === c.emoji ? " on" : ""}" data-mascot="${esc(m.emoji)}" style="--i:${k}" title="${esc(m.name)}">
                ${crestBadge({ ...c, emoji: m.emoji, color: m.emoji === c.emoji ? c.color : "#3a3570" }, { cls: "md" })}<small>${esc(m.name)}</small>
              </button>`).join("")}</div>
          </div>
        </div>
      </div>`;
    if (animate) el.querySelector(".avp-box")?.classList.add("in");
    el.querySelector("#avpName").addEventListener("input", (e) => { o.onRename(ti, e.target.value.trim()); o.onChange(); });
  }

  function set(patch) {
    setTeamCrest(cls, ti, patch);
    o.onChange();
    render();
    const hero = el.querySelector(".avp-stage .crest");
    pop(hero, { scale: 1.15 });
    sparks(hero, { count: 16, color: teamCrest(cls, ti).color });
  }

  function close() {
    window.removeEventListener("keydown", onKey, true);
    el.classList.add("out");
    setTimeout(() => el.remove(), 180);
  }
  const onKey = (e) => {
    if (!el.isConnected) { window.removeEventListener("keydown", onKey, true); return; }
    if (e.key === "Enter") { e.preventDefault(); close(); }
  };
  window.addEventListener("keydown", onKey, true);
  el.addEventListener("arc-close", () => window.removeEventListener("keydown", onKey, true));

  el.addEventListener("click", (e) => {
    if (e.target === el) { close(); return; }
    const b = e.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-close")) { sfx.tap(); close(); return; }
    if (b.dataset.mascot) { sfx.pop(); set({ emoji: b.dataset.mascot }); return; }
    if (b.dataset.color) { sfx.tap(); set({ color: b.dataset.color }); return; }
    if (b.dataset.shape) { sfx.tap(); set({ shape: b.dataset.shape }); }
  });
  render(true);
  return { close };
}
