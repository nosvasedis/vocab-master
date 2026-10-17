/* Practice — launches a Lingo Arcade game with the lesson's words, right inside the lesson stage. */
import { pop, rise } from "../motion.js";
import { GAMES } from "../../arcade/arcade.js";
import { mountGame } from "../../arcade/host.js";
import { floatText } from "../../arcade/fx.js";

export default {
  type: "practice",
  label: "Game",
  icon: "🎮",
  mount(ctx, scene) {
    const def = GAMES.find((g) => g.id === scene.game) || GAMES.find((g) => g.id === "memory");
    let game = null;
    let score = 0;
    ctx.setBackdrop(scene.backdrop || ctx.lesson.setting);

    const teams = {
      solo: true,
      get teams() { return [{ name: "Class", emoji: "⭐", color: "#ffd23f", score }]; },
      active: () => ({ name: "Class", emoji: "⭐", color: "#ffd23f", score }),
      award(points, { from = null } = {}) {
        score += points;
        const pill = ctx.ui.querySelector(".pr-score b");
        if (pill) pill.textContent = String(score);
        floatText(from || pill, `+${points}`, { color: "#ffd23f" });
        ctx.sfx.points();
      },
      nextTurn() {},
    };

    function closeGame() { game?.destroy?.(); game = null; ctx.setKeyCapture(null); }

    function intro() {
      closeGame();
      ctx.mascot.place("left");
      ctx.mascot.setPose("cheer");
      ctx.ui.innerHTML = `
        <div class="pr-card">
          <span class="pr-emoji">${def.emoji}</span>
          <h2>Game time: ${ctx.esc(def.title)}</h2>
          <p>${ctx.esc(def.description)}</p>
          <button type="button" class="ls-btn primary pr-play">▶ Play with our ${ctx.deck.length} words</button>
        </div>`;
      pop(ctx.ui.querySelector(".pr-card"), { scale: 0.7 });
      rise(ctx.ui.querySelector(".pr-play"), { delay: 0.4 });
      ctx.ui.querySelector(".pr-play").addEventListener("click", play);
    }

    function play() {
      ctx.clearBubble();
      ctx.stopVoice();
      ctx.mascot.place("hidden");
      ctx.ui.innerHTML = `
        <div class="arcade arc-embed">
          <div class="pr-bar">
            <span class="pr-name">${def.emoji} ${ctx.esc(def.title)}</span>
            <span class="arc-progress" id="prProgress"></span>
            <span class="pr-score">⭐ <b>${score}</b></span>
            <button type="button" class="ls-btn ghost pr-done">Back to the lesson ↩</button>
          </div>
          <div class="arc-main"><div class="arc-game g-${def.id}"><div class="game-stage"></div></div></div>
        </div>`;
      const root = ctx.ui.querySelector(".arc-embed");
      ctx.ui.querySelector(".pr-done").addEventListener("click", () => { closeGame(); ctx.next(); });
      game = mountGame(def, {
        stage: root.querySelector(".game-stage"),
        root,
        deck: ctx.deck,
        picture: ctx.picture,
        teams,
        setProgress(html) { const p = root.querySelector("#prProgress"); if (p) p.innerHTML = html; },
        onFinish: (o) => finished(o),
        onRestart: () => play(),
      });
      ctx.setKeyCapture((e) => { game?.onKey?.(e); return true; });
    }

    function finished({ title = "Well played!", stats = [] } = {}) {
      closeGame();
      ctx.sfx.win();
      ctx.confetti({ count: 200, originY: 0.3 });
      ctx.mascot.place("left");
      ctx.mascot.setPose("cheer");
      ctx.ui.innerHTML = `
        <div class="pr-card">
          <span class="pr-emoji">🏆</span>
          <h2>${ctx.esc(title)}</h2>
          ${stats.length ? `<div class="pr-stats">${stats.map((s) => `<div><b>${ctx.esc(s.value)}</b><span>${ctx.esc(s.label)}</span></div>`).join("")}</div>` : ""}
          <div class="pr-actions"><button type="button" class="ls-btn ghost pr-again">Play again</button><button type="button" class="ls-btn primary pr-next">Continue the lesson ➜</button></div>
        </div>`;
      pop(ctx.ui.querySelector(".pr-card"), { scale: 0.7 });
      ctx.ui.querySelector(".pr-again").addEventListener("click", play);
      ctx.ui.querySelector(".pr-next").addEventListener("click", () => ctx.next());
    }

    return {
      steps: 1,
      async enter() {
        const live = ctx.live();
        intro();
        for (const l of scene.lines || []) { if (!live() || game) break; await ctx.speakBubble(l, { sceneId: scene.id }); }
        return { auto: false };
      },
      destroy: closeGame,
    };
  },
};
