/* ═══════════════════════════════════════════════════════════════════════════
   Vocab Master — Lingo Arcade (Smart Classroom Games Studio)
   5 Curated Smartboard & Projector Games:
   1. 🃏 3D Flashcards & Oracy Studio
   2. 🧩 Memory Match (Numbered Smartboard Grid)
   3. 🐝 Spell Bee & Collocation Anagram
   4. 🕵️ Context Detective (4-Option Game Show Quiz + 50/50 Lifeline)
   5. ⏱️ Hot-Seat Taboo & Charades Timer
   ═══════════════════════════════════════════════════════════════════════════ */

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shuffleArray(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Mask a target word inside a collocation or example sentence with ____ */
export function maskWordInText(text, english) {
  const raw = String(text || "").trim();
  const word = String(english || "").trim();
  if (!raw || !word) return raw;
  const stem = word.length > 4 ? word.slice(0, Math.max(3, word.length - 2)) : word;
  const rxExact = new RegExp(`\\b${escapeRegex(word)}\\w*\\b`, "gi");
  if (rxExact.test(raw)) {
    return raw.replace(rxExact, "____");
  }
  const rxStem = new RegExp(`\\b${escapeRegex(stem)}\\w*\\b`, "gi");
  if (rxStem.test(raw)) {
    return raw.replace(rxStem, "____");
  }
  return `____ (${raw})`;
}

/** Generate an engaging classroom Oracy / Speaking prompt for any word */
export function buildOracyPrompt(item) {
  const w = item.english;
  const col = item.collocation ? `«${item.collocation}»` : `«${w}»`;
  const pos = String(item.type || "").toLowerCase();
  if (pos.includes("v")) {
    return `🎤 Oracy Challenge: Ask your partner a question using ${col}, or act out "${w}" for the class!`;
  }
  if (pos.includes("adj")) {
    return `🎤 Oracy Challenge: Name two things in real life that can be described as "${w}" (${col})!`;
  }
  return `🎤 Oracy Challenge: Make a true sentence about your family, school, or weekend using ${col}!`;
}

/** Normalize and enrich raw vocabulary items into a playable Arcade Deck */
export function buildArcadeDeck(rawWords = [], lookupFn = null) {
  const seen = new Set();
  const deck = [];

  for (const raw of rawWords) {
    const english = String(raw?.english || "").trim();
    if (!english) continue;
    const key = english.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const cbMatch = typeof lookupFn === "function" ? lookupFn(english) : null;
    const type = String(raw.type || cbMatch?.type || "n.").trim();
    const greek = String(raw.greek || cbMatch?.greek || "λέξη λεξιλογίου").trim();
    const emojis = String(raw.emojis || cbMatch?.emojis || "✨").trim();
    const collocation = String(raw.collocation || cbMatch?.collocation || english).trim();
    const example = String(raw.example || cbMatch?.example || "").trim();
    const derivatives = String(raw.derivatives || cbMatch?.derivatives || "").trim();
    const synonyms = String(raw.synonyms || cbMatch?.synonyms || "").trim();
    const antonyms = String(raw.antonyms || cbMatch?.antonyms || "").trim();

    const item = {
      english,
      type,
      greek,
      emojis,
      collocation,
      example,
      derivatives,
      synonyms,
      antonyms,
    };
    item.oracyPrompt = buildOracyPrompt(item);
    deck.push(item);
  }
  return deck;
}

/** Build a smart set of 4-option Context Detective Game Show questions */
export function buildDetectiveQuestions(deck = [], maxQuestions = 10) {
  if (!Array.isArray(deck) || deck.length < 2) return [];
  const pool = shuffleArray(deck);
  const questions = [];

  pool.forEach((target, idx) => {
    const distractors = shuffleArray(
      deck.filter((w) => w.english.toLowerCase() !== target.english.toLowerCase())
    ).slice(0, 3);
    while (distractors.length < 3) {
      distractors.push({
        english: ["explore", "discover", "ancient", "protect", "journey"][distractors.length] || "mystery",
        greek: "μυστήριο",
      });
    }

    const mode = idx % 3;
    if (mode === 0 && (target.collocation || target.example)) {
      const sourceText = target.example || target.collocation;
      const gapped = maskWordInText(sourceText, target.english);
      questions.push({
        id: `Q-${idx + 1}`,
        kindLabel: "🧩 Context & Collocation Cloze",
        prompt: gapped,
        subClue: `${target.emojis} (${target.type}) — ${target.greek}`,
        answer: target.english,
        options: shuffleArray([target.english, ...distractors.map((d) => d.english)]),
        explanation: `"${target.english}" (${target.greek}) completes «${sourceText}».`,
        speakText: sourceText,
        targetWord: target,
      });
    } else if (mode === 1 && (target.synonyms || target.antonyms || target.derivatives)) {
      const familyParts = [];
      if (target.synonyms) familyParts.push(`≈ Synonym: ${target.synonyms}`);
      if (target.antonyms) familyParts.push(`≠ Opposite: ${target.antonyms}`);
      if (target.derivatives) familyParts.push(`🌳 Family: ${target.derivatives}`);
      questions.push({
        id: `Q-${idx + 1}`,
        kindLabel: "🌳 Word Family & Meaning Detective",
        prompt: familyParts.join("  ·  "),
        subClue: `${target.emojis} Greek meaning: ${target.greek} (${target.type})`,
        answer: target.english,
        options: shuffleArray([target.english, ...distractors.map((d) => d.english)]),
        explanation: `"${target.english}" (${target.greek}) matches ${familyParts[0]}.`,
        speakText: target.english,
        targetWord: target,
      });
    } else {
      questions.push({
        id: `Q-${idx + 1}`,
        kindLabel: "🇬🇷 Bilingual Speed Challenge",
        prompt: `${target.emojis}  ${target.greek}`,
        subClue: target.collocation && target.collocation.toLowerCase() !== target.english.toLowerCase()
          ? `Clue: ${maskWordInText(target.collocation, target.english)} (${target.type})`
          : `Part of speech: ${target.type}`,
        answer: target.english,
        options: shuffleArray([target.english, ...distractors.map((d) => d.english)]),
        explanation: `"${target.english}" means «${target.greek}» (${target.collocation || target.type}).`,
        speakText: target.english,
        targetWord: target,
      });
    }
  });

  return questions.slice(0, maxQuestions);
}

/** Build forbidden "Taboo" words for the Hot-Seat classroom game */
export function buildTabooCard(target, deck = []) {
  const taboo = new Set();
  const cleanTokens = (str) =>
    String(str || "")
      .replace(/\([a-z.]+\)/gi, "")
      .split(/[,;/|·\s]+/)
      .map((t) => t.replace(/[^a-zA-Z]/g, "").trim())
      .filter((t) => t.length >= 3 && t.toLowerCase() !== target.english.toLowerCase());

  cleanTokens(target.synonyms).forEach((t) => taboo.add(t));
  cleanTokens(target.antonyms).forEach((t) => taboo.add(t));
  cleanTokens(target.collocation).forEach((t) => taboo.add(t));
  cleanTokens(target.derivatives).forEach((t) => taboo.add(t));

  const fallbackPool = deck
    .filter((w) => w.english.toLowerCase() !== target.english.toLowerCase())
    .map((w) => w.english);
  for (const fb of fallbackPool) {
    if (taboo.size >= 3) break;
    taboo.add(fb);
  }
  const defaults = ["thing", "person", "place", "good"];
  for (const d of defaults) {
    if (taboo.size >= 3) break;
    taboo.add(d);
  }

  return {
    ...target,
    forbiddenWords: [...taboo].slice(0, 3),
  };
}

/* ═══════════════ Web Audio Synthesizer & TTS Engine ═════════════════ */
export class ArcadeAudioEngine {
  constructor() {
    this.ctx = null;
    this.sfxEnabled = true;
    this.ttsEnabled = true;
  }

  _ensureCtx() {
    if (!this.sfxEnabled) return null;
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) this.ctx = new Ctx();
      }
      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume();
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  _tone(freq, duration = 0.12, type = "sine", delay = 0, gainVal = 0.11) {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
      gain.gain.setValueAtTime(gainVal, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + duration);
    } catch {
      // Ignore audio errors in headless environments
    }
  }

  playFlip() {
    this._tone(420, 0.07, "triangle", 0, 0.08);
    this._tone(560, 0.08, "triangle", 0.04, 0.07);
  }

  playCorrect() {
    this._tone(523.25, 0.11, "triangle", 0, 0.12);     // C5
    this._tone(659.25, 0.11, "triangle", 0.08, 0.12);  // E5
    this._tone(783.99, 0.14, "triangle", 0.16, 0.13);  // G5
    this._tone(1046.5, 0.24, "sine", 0.24, 0.14);      // C6
  }

  playWrong() {
    this._tone(240, 0.15, "sawtooth", 0, 0.08);
    this._tone(185, 0.22, "sawtooth", 0.12, 0.08);
  }

  playTick() {
    this._tone(880, 0.04, "sine", 0, 0.06);
  }

  playWin() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 987.77, 1046.5];
    const times = [0, 0.09, 0.18, 0.27, 0.42, 0.54];
    notes.forEach((n, i) => this._tone(n, 0.2, "triangle", times[i], 0.13));
  }

  speak(text, { force = false, rate = 0.94 } = {}) {
    if (!force && !this.ttsEnabled) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const clean = String(text || "").replace(/____+/g, "blank").trim();
    if (!clean) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(clean);
      utter.lang = "en-GB";
      utter.rate = rate;
      const voices = window.speechSynthesis.getVoices?.() || [];
      const enVoice =
        voices.find((v) => /en[-_](GB|US)/i.test(v.lang) && /natural|google|microsoft/i.test(v.name)) ||
        voices.find((v) => /^en/i.test(v.lang));
      if (enVoice) utter.voice = enVoice;
      window.speechSynthesis.speak(utter);
    } catch {
      // Ignore TTS errors in headless runs
    }
  }
}

/* ═══════════════ Interactive Arcade UI Controller ═══════════════════ */
export function createArcadeController({ getDeckContext }) {
  const audio = new ArcadeAudioEngine();
  const $ = (id) => document.getElementById(id);

  let state = {
    isOpen: false,
    activeGame: "flashcards", // "flashcards" | "memory" | "spellbee" | "detective" | "hotseat"
    unitTitle: "Classroom Unit",
    deck: [],
    streak: 0,
    teamMode: 2, // 0 = Solo, 2 = 2 Teams, 3 = 3 Teams
    activeTeamIdx: 0,
    teams: [
      { name: "⚡ Team Sparks", score: 0 },
      { name: "🔥 Team Blazers", score: 0 },
      { name: "🦁 Team Lions", score: 0 },
    ],
    // Flashcards state
    fcIndex: 0,
    fcFlipped: false,
    fcFrontMode: "greek", // "greek" (Greek+Emoji -> English) or "english" (English -> Greek+Family)
    fcMastered: new Set(),
    // Memory Match state
    memMode: "greek", // "greek" | "collocation"
    memPairCount: 6,
    memTiles: [],
    memFlippedIndices: [],
    memMatchedPairIds: new Set(),
    memMoves: 0,
    memBusy: false,
    // Spell Bee state
    sbIndex: 0,
    sbTarget: "",
    sbCleanLetters: [],
    sbTiles: [],
    sbPickedIndices: [],
    sbSolved: false,
    // Detective state
    detQuestions: [],
    detIndex: 0,
    detAnswered: null,
    detEliminated: new Set(),
    detLifeline50Used: false,
    detScoreCount: 0,
    // Hot-Seat Taboo state
    hsIndex: 0,
    hsSecondsLeft: 60,
    hsDuration: 60,
    hsRunning: false,
    hsTimerId: null,
    hsRoundSolved: 0,
  };

  function stopHotSeatTimer() {
    if (state.hsTimerId) {
      clearInterval(state.hsTimerId);
      state.hsTimerId = null;
    }
    state.hsRunning = false;
  }

  function burstConfetti() {
    const layer = $("arcadeConfettiLayer");
    if (!layer) return;
    layer.innerHTML = "";
    const colors = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#06b6d4", "#8b5cf6"];
    for (let i = 0; i < 38; i++) {
      const piece = document.createElement("span");
      piece.className = "confetti-piece";
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.backgroundColor = colors[i % colors.length];
      piece.style.animationDelay = `${Math.random() * 0.35}s`;
      piece.style.transform = `rotate(${Math.random() * 360}deg)`;
      layer.appendChild(piece);
    }
    setTimeout(() => {
      if (layer) layer.innerHTML = "";
    }, 2400);
  }

  function awardPoints(pts, advanceTurn = true) {
    if (pts > 0) {
      state.streak += 1;
      if (state.teamMode > 0) {
        state.teams[state.activeTeamIdx].score += pts;
        if (advanceTurn) {
          state.activeTeamIdx = (state.activeTeamIdx + 1) % state.teamMode;
        }
      } else {
        state.teams[0].score += pts;
      }
    } else if (pts < 0) {
      state.streak = 0;
      if (state.teamMode > 0) {
        state.teams[state.activeTeamIdx].score = Math.max(0, state.teams[state.activeTeamIdx].score + pts);
        if (advanceTurn) {
          state.activeTeamIdx = (state.activeTeamIdx + 1) % state.teamMode;
        }
      }
    } else {
      state.streak = 0;
      if (state.teamMode > 0 && advanceTurn) {
        state.activeTeamIdx = (state.activeTeamIdx + 1) % state.teamMode;
      }
    }
    renderScoreboard();
  }

  function renderScoreboard() {
    const wrap = $("arcadeTeamsWrap");
    const streakEl = $("arcadeStreakPill");
    const toggleBtn = $("arcadeTeamToggle");
    if (!wrap) return;

    if (streakEl) {
      streakEl.textContent = `🔥 Streak: ${state.streak}`;
      streakEl.classList.toggle("hot", state.streak >= 3);
    }
    if (toggleBtn) {
      toggleBtn.textContent = state.teamMode === 0 ? "👤 Solo Score" : `🏆 ${state.teamMode} Teams`;
    }

    if (state.teamMode === 0) {
      wrap.innerHTML = `
        <div class="arcade-team-pill active">
          <span class="team-name">🌟 Class Score</span>
          <strong class="team-score">${state.teams[0].score} pts</strong>
        </div>
      `;
      return;
    }

    const visibleTeams = state.teams.slice(0, state.teamMode);
    wrap.innerHTML = visibleTeams
      .map(
        (t, idx) => `
        <div class="arcade-team-pill ${idx === state.activeTeamIdx ? "active" : ""}" data-team-idx="${idx}" title="Click to set active turn">
          <span class="team-turn-dot">${idx === state.activeTeamIdx ? "▶" : ""}</span>
          <span class="team-name">${esc(t.name)}</span>
          <strong class="team-score">${t.score}</strong>
          <div class="team-adj-btns">
            <button type="button" class="team-adj-btn" data-team-add="${idx}" title="Add 50 pts">+50</button>
            <button type="button" class="team-adj-btn" data-team-sub="${idx}" title="Subtract 25 pts">−</button>
          </div>
        </div>
      `
      )
      .join("");
  }

  /* ── Game 1: 3D Flashcards & Oracy Studio ───────────────────────── */
  function initFlashcards() {
    state.fcIndex = 0;
    state.fcFlipped = false;
  }

  function renderFlashcards() {
    const stage = $("arcadeStage");
    if (!stage || !state.deck.length) return;
    const idx = Math.max(0, Math.min(state.fcIndex, state.deck.length - 1));
    const card = state.deck[idx];
    const isMastered = state.fcMastered.has(card.english.toLowerCase());
    const greekFirst = state.fcFrontMode === "greek";

    const familyBadges = [];
    if (card.derivatives) familyBadges.push(`<span class="fc-fam-badge">🌳 <strong>Derivatives:</strong> ${esc(card.derivatives)}</span>`);
    if (card.synonyms) familyBadges.push(`<span class="fc-fam-badge">≈ <strong>Synonyms:</strong> ${esc(card.synonyms)}</span>`);
    if (card.antonyms) familyBadges.push(`<span class="fc-fam-badge">≠ <strong>Antonyms:</strong> ${esc(card.antonyms)}</span>`);

    stage.innerHTML = `
      <div class="arcade-game-shell fc-shell">
        <div class="arcade-subbar">
          <div class="arcade-subbar-left">
            <span class="arcade-progress-pill">Card <strong>${idx + 1}</strong> of <strong>${state.deck.length}</strong></span>
            <span class="arcade-mastery-pill">✅ Mastered: <strong>${state.fcMastered.size}</strong> / ${state.deck.length}</span>
          </div>
          <div class="arcade-subbar-right">
            <button type="button" class="btn btn-soft btn-sm" id="fcSwitchFront">
              ${greekFirst ? "🇬🇷 Front: Greek + Emoji → 🇬🇧 English" : "🇬🇧 Front: English → 🇬🇷 Greek & Family"}
            </button>
            <button type="button" class="btn btn-soft btn-sm" id="fcSpeakWord" title="Pronounce English word (S)">
              🔊 Pronounce Word
            </button>
            ${card.collocation ? `<button type="button" class="btn btn-soft btn-sm" id="fcSpeakColloc" title="Pronounce collocation">🗣️ Speak Phrase</button>` : ""}
          </div>
        </div>

        <div class="fc-stage-center">
          <button type="button" class="fc-nav-btn" id="fcPrevBtn" title="Previous card (←)">‹</button>

          <div class="fc-card-3d ${state.fcFlipped ? "is-flipped" : ""}" id="fcCard3d" tabindex="0" role="button" aria-label="Flip flashcard (Space or Click)">
            <div class="fc-card-inner">
              <!-- FRONT -->
              <div class="fc-face fc-front">
                <div class="fc-face-top">
                  <span class="fc-pos-pill">${esc(card.type)}</span>
                  ${isMastered ? `<span class="fc-mastered-tag">✅ Mastered</span>` : `<span class="fc-flip-hint">Click or press Space to flip ↻</span>`}
                </div>
                <div class="fc-emoji-hero">${esc(card.emojis || "✨")}</div>
                ${
                  greekFirst
                    ? `<h2 class="fc-main-title">${esc(card.greek)}</h2>
                       <p class="fc-sub-clue">${esc(maskWordInText(card.collocation || "", card.english))}</p>`
                    : `<h2 class="fc-main-title">${esc(card.english)}</h2>
                       <p class="fc-sub-clue">${esc(card.collocation || "")}</p>`
                }
              </div>

              <!-- BACK -->
              <div class="fc-face fc-back">
                <div class="fc-face-top">
                  <span class="fc-pos-pill">${esc(card.type)}</span>
                  <span class="fc-flip-hint">Click to flip back ↺</span>
                </div>
                <div class="fc-back-head">
                  <span class="fc-emoji-sm">${esc(card.emojis || "✨")}</span>
                  <h2 class="fc-answer-word">${esc(card.english)}</h2>
                </div>
                <p class="fc-greek-line">🇬🇷 ${esc(card.greek)}</p>
                ${card.collocation ? `<div class="fc-colloc-box">💬 <strong>Collocation:</strong> ${esc(card.collocation)}</div>` : ""}
                ${card.example ? `<p class="fc-example-line">📖 <em>"${esc(card.example)}"</em></p>` : ""}
                ${familyBadges.length ? `<div class="fc-family-row">${familyBadges.join("")}</div>` : ""}
              </div>
            </div>
          </div>

          <button type="button" class="fc-nav-btn" id="fcNextBtn" title="Next card (→)">›</button>
        </div>

        <div class="fc-oracy-banner">
          <span>${esc(card.oracyPrompt)}</span>
        </div>

        <div class="fc-bottom-actions">
          <button type="button" class="btn btn-secondary" id="fcFlipBtn">🔄 Flip Card (Space)</button>
          <button type="button" class="btn ${isMastered ? "btn-soft" : "btn-primary"}" id="fcMarkMastered">
            ${isMastered ? "✓ Mastered (Click to unmark)" : "✅ Team Got It! (+50 pts)"}
          </button>
        </div>
      </div>
    `;

    $("fcCard3d")?.addEventListener("click", toggleFlashcardFlip);
    $("fcFlipBtn")?.addEventListener("click", toggleFlashcardFlip);
    $("fcPrevBtn")?.addEventListener("click", () => stepFlashcard(-1));
    $("fcNextBtn")?.addEventListener("click", () => stepFlashcard(1));
    $("fcSwitchFront")?.addEventListener("click", () => {
      state.fcFrontMode = state.fcFrontMode === "greek" ? "english" : "greek";
      state.fcFlipped = false;
      renderFlashcards();
    });
    $("fcSpeakWord")?.addEventListener("click", () => audio.speak(card.english, { force: true }));
    $("fcSpeakColloc")?.addEventListener("click", () => audio.speak(card.collocation || card.english, { force: true }));
    $("fcMarkMastered")?.addEventListener("click", () => {
      const k = card.english.toLowerCase();
      if (state.fcMastered.has(k)) {
        state.fcMastered.delete(k);
      } else {
        state.fcMastered.add(k);
        audio.playCorrect();
        awardPoints(50, true);
        if (state.fcMastered.size === state.deck.length) {
          audio.playWin();
          burstConfetti();
        }
      }
      renderFlashcards();
    });
  }

  function toggleFlashcardFlip() {
    state.fcFlipped = !state.fcFlipped;
    audio.playFlip();
    const card = state.deck[state.fcIndex];
    if (state.fcFlipped && card) {
      audio.speak(card.english);
    }
    renderFlashcards();
  }

  function stepFlashcard(delta) {
    if (!state.deck.length) return;
    state.fcIndex = (state.fcIndex + delta + state.deck.length) % state.deck.length;
    state.fcFlipped = false;
    audio.playFlip();
    renderFlashcards();
  }

  /* ── Game 2: Smartboard Memory Match ────────────────────────────── */
  function initMemoryMatch() {
    const count = Math.min(state.memPairCount, state.deck.length);
    const chosen = shuffleArray(state.deck).slice(0, count);
    const tiles = [];

    chosen.forEach((w, idx) => {
      const pairId = `pair-${idx}`;
      tiles.push({
        pairId,
        side: "en",
        label: w.english,
        sub: w.type,
        emoji: w.emojis || "🇬🇧",
        word: w,
      });

      let matchLabel = w.greek;
      let matchSub = "Greek Meaning";
      if (state.memMode === "collocation" && w.collocation && w.collocation.toLowerCase() !== w.english.toLowerCase()) {
        matchLabel = maskWordInText(w.collocation, w.english);
        matchSub = "Collocation";
      }
      tiles.push({
        pairId,
        side: "clue",
        label: matchLabel,
        sub: matchSub,
        emoji: w.emojis || "✨",
        word: w,
      });
    });

    state.memTiles = shuffleArray(tiles);
    state.memFlippedIndices = [];
    state.memMatchedPairIds = new Set();
    state.memMoves = 0;
    state.memBusy = false;
  }

  function renderMemoryMatch() {
    const stage = $("arcadeStage");
    if (!stage) return;
    const totalPairs = Math.floor(state.memTiles.length / 2);
    const allMatched = totalPairs > 0 && state.memMatchedPairIds.size === totalPairs;

    stage.innerHTML = `
      <div class="arcade-game-shell mem-shell">
        <div class="arcade-subbar">
          <div class="arcade-subbar-left">
            <span class="arcade-progress-pill">Pairs Matched: <strong>${state.memMatchedPairIds.size}</strong> / <strong>${totalPairs}</strong></span>
            <span class="arcade-mastery-pill">Moves: <strong>${state.memMoves}</strong></span>
            <span class="arcade-hint-inline">💡 Students can call out numbers <strong>1–${state.memTiles.length}</strong>!</span>
          </div>
          <div class="arcade-subbar-right">
            <button type="button" class="btn btn-soft btn-sm ${state.memMode === "greek" ? "active" : ""}" id="memModeGreek">🇬🇧 Word ↔ 🇬🇷 Greek</button>
            <button type="button" class="btn btn-soft btn-sm ${state.memMode === "collocation" ? "active" : ""}" id="memModeColloc">🇬🇧 Word ↔ 💬 Collocation</button>
            <button type="button" class="btn btn-soft btn-sm" id="memSizeToggle">${state.memPairCount === 6 ? "12 Tiles (6 Pairs)" : "16 Tiles (8 Pairs)"}</button>
            <button type="button" class="btn btn-secondary btn-sm" id="memRestartBtn">🔄 New Board</button>
          </div>
        </div>

        ${
          allMatched
            ? `<div class="arcade-win-banner">
                 <h3>🎉 Brilliant! All ${totalPairs} Vocabulary Pairs Matched in ${state.memMoves} Moves!</h3>
                 <button type="button" class="btn btn-primary" id="memPlayAgainBtn">🔀 Play Another Board</button>
               </div>`
            : ""
        }

        <div class="mem-grid ${state.memTiles.length > 12 ? "mem-grid-16" : "mem-grid-12"}" id="memGrid">
          ${state.memTiles
            .map((t, i) => {
              const isFlipped = state.memFlippedIndices.includes(i);
              const isMatched = state.memMatchedPairIds.has(t.pairId);
              return `
                <button type="button" class="mem-tile ${isFlipped ? "is-flipped" : ""} ${isMatched ? "is-matched" : ""}" data-mem-idx="${i}" ${isMatched ? "disabled" : ""}>
                  <div class="mem-tile-front">
                    <span class="mem-tile-num">${i + 1}</span>
                    <span class="mem-tile-q">?</span>
                  </div>
                  <div class="mem-tile-back">
                    <span class="mem-tile-badge">${esc(t.sub)}</span>
                    <span class="mem-tile-emoji">${esc(t.emoji)}</span>
                    <strong class="mem-tile-text">${esc(t.label)}</strong>
                  </div>
                </button>
              `;
            })
            .join("")}
        </div>
      </div>
    `;

    $("memModeGreek")?.addEventListener("click", () => {
      state.memMode = "greek";
      initMemoryMatch();
      renderMemoryMatch();
    });
    $("memModeColloc")?.addEventListener("click", () => {
      state.memMode = "collocation";
      initMemoryMatch();
      renderMemoryMatch();
    });
    $("memSizeToggle")?.addEventListener("click", () => {
      state.memPairCount = state.memPairCount === 6 ? 8 : 6;
      initMemoryMatch();
      renderMemoryMatch();
    });
    $("memRestartBtn")?.addEventListener("click", () => {
      initMemoryMatch();
      renderMemoryMatch();
    });
    $("memPlayAgainBtn")?.addEventListener("click", () => {
      initMemoryMatch();
      renderMemoryMatch();
    });

    $("memGrid")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-mem-idx]");
      if (!btn || state.memBusy) return;
      const idx = Number(btn.dataset.memIdx);
      handleMemoryTileClick(idx);
    });
  }

  function handleMemoryTileClick(idx) {
    const tile = state.memTiles[idx];
    if (!tile || state.memMatchedPairIds.has(tile.pairId) || state.memFlippedIndices.includes(idx)) return;

    audio.playFlip();
    if (tile.side === "en") audio.speak(tile.word.english);

    state.memFlippedIndices.push(idx);
    renderMemoryMatch();

    if (state.memFlippedIndices.length === 2) {
      state.memMoves += 1;
      const [i1, i2] = state.memFlippedIndices;
      const t1 = state.memTiles[i1];
      const t2 = state.memTiles[i2];

      if (t1.pairId === t2.pairId) {
        state.memMatchedPairIds.add(t1.pairId);
        state.memFlippedIndices = [];
        audio.playCorrect();
        audio.speak(t1.word.english);
        awardPoints(100, true);
        if (state.memMatchedPairIds.size === Math.floor(state.memTiles.length / 2)) {
          audio.playWin();
          burstConfetti();
        }
        renderMemoryMatch();
      } else {
        state.memBusy = true;
        audio.playWrong();
        awardPoints(0, true);
        setTimeout(() => {
          state.memFlippedIndices = [];
          state.memBusy = false;
          if (state.isOpen && state.activeGame === "memory") renderMemoryMatch();
        }, 1050);
      }
    }
  }

  /* ── Game 3: Spell Bee & Collocation Anagram ────────────────────── */
  function loadSpellBeeWord(idx) {
    if (!state.deck.length) return;
    state.sbIndex = (idx + state.deck.length) % state.deck.length;
    const item = state.deck[state.sbIndex];
    state.sbTarget = item.english;
    const letters = [...item.english].filter((ch) => /[a-zA-Z]/.test(ch));
    state.sbCleanLetters = letters;
    state.sbTiles = shuffleArray(letters.map((ch, i) => ({ ch: ch.toUpperCase(), origIdx: i })));
    // Avoid giving the exact unscrambled order if length > 2
    if (letters.length > 2 && state.sbTiles.map((t) => t.ch).join("") === letters.join("").toUpperCase()) {
      state.sbTiles.reverse();
    }
    state.sbPickedIndices = [];
    state.sbSolved = false;
  }

  function initSpellBee() {
    loadSpellBeeWord(0);
  }

  function renderSpellBee() {
    const stage = $("arcadeStage");
    if (!stage || !state.deck.length) return;
    const item = state.deck[state.sbIndex];
    const targetChars = [...item.english];

    // Map picked letters into the full word template (preserving spaces/hyphens automatically!)
    let letterCursor = 0;
    const slotsHtml = targetChars
      .map((ch) => {
        if (!/[a-zA-Z]/.test(ch)) {
          return `<span class="sb-slot sb-slot-fixed">${esc(ch)}</span>`;
        }
        const pickedTileIdx = state.sbPickedIndices[letterCursor];
        const pickedChar = pickedTileIdx !== undefined ? state.sbTiles[pickedTileIdx]?.ch : "";
        const pos = letterCursor;
        letterCursor++;
        return `<button type="button" class="sb-slot ${pickedChar ? "filled" : ""} ${state.sbSolved ? "solved" : ""}" data-sb-slot="${pos}">${esc(pickedChar)}</button>`;
      })
      .join("");

    stage.innerHTML = `
      <div class="arcade-game-shell sb-shell">
        <div class="arcade-subbar">
          <div class="arcade-subbar-left">
            <span class="arcade-progress-pill">Word <strong>${state.sbIndex + 1}</strong> of <strong>${state.deck.length}</strong></span>
            <span class="arcade-hint-inline">⌨️ Type on keyboard or click letter tiles on the board!</span>
          </div>
          <div class="arcade-subbar-right">
            <button type="button" class="btn btn-soft btn-sm" id="sbHearBtn">🔊 Hear Word</button>
            <button type="button" class="btn btn-soft btn-sm" id="sbHintBtn">💡 Hint (+1 Letter)</button>
            <button type="button" class="btn btn-soft btn-sm" id="sbClearBtn">⌫ Clear</button>
            <button type="button" class="btn btn-secondary btn-sm" id="sbNextWordBtn">⏭️ Next Word →</button>
          </div>
        </div>

        <div class="sb-clue-card">
          <div class="sb-emoji">${esc(item.emojis || "🐝")}</div>
          <span class="fc-pos-pill">${esc(item.type)}</span>
          <h2 class="sb-greek-title">${esc(item.greek)}</h2>
          <p class="sb-colloc-clue">💬 ${esc(maskWordInText(item.collocation || item.example || "", item.english))}</p>
        </div>

        <div class="sb-slots-row" id="sbSlotsRow">
          ${slotsHtml}
        </div>

        ${
          state.sbSolved
            ? `<div class="arcade-win-banner sb-win-inline">
                 <h3>🎉 Correct! <strong>${esc(item.english)}</strong> — ${esc(item.collocation || item.greek)}</h3>
                 <button type="button" class="btn btn-primary" id="sbContinueBtn">Next Spell Bee Word →</button>
               </div>`
            : `<div class="sb-tiles-row" id="sbTilesRow">
                 ${state.sbTiles
                   .map((tile, tIdx) => {
                     const used = state.sbPickedIndices.includes(tIdx);
                     return `<button type="button" class="sb-tile ${used ? "used" : ""}" data-sb-tile="${tIdx}" ${used ? "disabled" : ""}>${esc(tile.ch)}</button>`;
                   })
                   .join("")}
               </div>`
        }
      </div>
    `;

    $("sbHearBtn")?.addEventListener("click", () => audio.speak(item.english, { force: true, rate: 0.85 }));
    $("sbClearBtn")?.addEventListener("click", () => {
      if (state.sbSolved) return;
      state.sbPickedIndices = [];
      renderSpellBee();
    });
    $("sbHintBtn")?.addEventListener("click", giveSpellBeeHint);
    $("sbNextWordBtn")?.addEventListener("click", () => {
      loadSpellBeeWord(state.sbIndex + 1);
      renderSpellBee();
    });
    $("sbContinueBtn")?.addEventListener("click", () => {
      loadSpellBeeWord(state.sbIndex + 1);
      renderSpellBee();
    });

    $("sbTilesRow")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-sb-tile]");
      if (!btn || state.sbSolved) return;
      pickSpellBeeTile(Number(btn.dataset.sbTile));
    });

    $("sbSlotsRow")?.addEventListener("click", (e) => {
      const slot = e.target.closest("[data-sb-slot]");
      if (!slot || state.sbSolved) return;
      const slotPos = Number(slot.dataset.sbSlot);
      if (slotPos < state.sbPickedIndices.length) {
        state.sbPickedIndices.splice(slotPos, 1);
        audio.playFlip();
        renderSpellBee();
      }
    });
  }

  function pickSpellBeeTile(tIdx) {
    if (state.sbSolved || state.sbPickedIndices.includes(tIdx)) return;
    if (state.sbPickedIndices.length >= state.sbCleanLetters.length) return;
    state.sbPickedIndices.push(tIdx);
    audio.playTick();
    checkSpellBeeCompletion();
    renderSpellBee();
  }

  function giveSpellBeeHint() {
    if (state.sbSolved) return;
    // Find first position where the user hasn't placed the right letter yet
    let matchCount = 0;
    while (matchCount < state.sbPickedIndices.length) {
      const tile = state.sbTiles[state.sbPickedIndices[matchCount]];
      if (tile.ch.toUpperCase() !== state.sbCleanLetters[matchCount].toUpperCase()) {
        break;
      }
      matchCount++;
    }
    state.sbPickedIndices = state.sbPickedIndices.slice(0, matchCount);
    const neededChar = state.sbCleanLetters[matchCount]?.toUpperCase();
    if (!neededChar) return;
    const candidateIdx = state.sbTiles.findIndex(
      (t, idx) => !state.sbPickedIndices.includes(idx) && t.ch.toUpperCase() === neededChar
    );
    if (candidateIdx >= 0) {
      state.sbPickedIndices.push(candidateIdx);
      audio.playFlip();
      checkSpellBeeCompletion();
      renderSpellBee();
    }
  }

  function checkSpellBeeCompletion() {
    if (state.sbPickedIndices.length !== state.sbCleanLetters.length) return;
    const attempt = state.sbPickedIndices.map((i) => state.sbTiles[i].ch).join("").toLowerCase();
    const target = state.sbCleanLetters.join("").toLowerCase();
    if (attempt === target) {
      state.sbSolved = true;
      audio.playCorrect();
      audio.speak(state.deck[state.sbIndex].english);
      awardPoints(120, true);
    } else {
      audio.playWrong();
    }
  }

  /* ── Game 4: Context Detective — Game Show Quiz ─────────────────── */
  function initDetective() {
    state.detQuestions = buildDetectiveQuestions(state.deck, Math.min(12, Math.max(6, state.deck.length)));
    state.detIndex = 0;
    state.detAnswered = null;
    state.detEliminated = new Set();
    state.detLifeline50Used = false;
    state.detScoreCount = 0;
  }

  function renderDetective() {
    const stage = $("arcadeStage");
    if (!stage || !state.detQuestions.length) return;

    if (state.detIndex >= state.detQuestions.length) {
      stage.innerHTML = `
        <div class="arcade-game-shell det-shell">
          <div class="arcade-win-banner">
            <h2>🏆 Context Detective Complete!</h2>
            <p class="det-final-score">Your class solved <strong>${state.detScoreCount}</strong> out of <strong>${state.detQuestions.length}</strong> challenges!</p>
            <button type="button" class="btn btn-primary" id="detRestartBtn">🔀 Play New Detective Round</button>
          </div>
        </div>
      `;
      $("detRestartBtn")?.addEventListener("click", () => {
        initDetective();
        renderDetective();
      });
      return;
    }

    const q = state.detQuestions[state.detIndex];
    const letters = ["A", "B", "C", "D"];

    stage.innerHTML = `
      <div class="arcade-game-shell det-shell">
        <div class="arcade-subbar">
          <div class="arcade-subbar-left">
            <span class="arcade-progress-pill">Question <strong>${state.detIndex + 1}</strong> of <strong>${state.detQuestions.length}</strong></span>
            <span class="arcade-mastery-pill">Correct: <strong>${state.detScoreCount}</strong></span>
          </div>
          <div class="arcade-subbar-right">
            <button type="button" class="btn btn-soft btn-sm" id="detLifeline50" ${state.detAnswered || state.detEliminated.size > 0 ? "disabled" : ""}>
              ✂️ 50/50 Lifeline
            </button>
            <button type="button" class="btn btn-soft btn-sm" id="detSpeakBtn">
              🔊 Speak Clue
            </button>
          </div>
        </div>

        <div class="det-question-card">
          <span class="det-kind-badge">${esc(q.kindLabel)}</span>
          <h2 class="det-prompt-text">${esc(q.prompt)}</h2>
          <p class="det-sub-clue">${esc(q.subClue)}</p>
        </div>

        <div class="det-options-grid" id="detOptionsGrid">
          ${q.options
            .map((opt, oIdx) => {
              const isElim = state.detEliminated.has(opt);
              const isCorrect = state.detAnswered && opt.toLowerCase() === q.answer.toLowerCase();
              const isWrongPick = state.detAnswered && state.detAnswered === opt && !isCorrect;
              return `
                <button type="button"
                  class="det-option-btn ${isElim ? "eliminated" : ""} ${isCorrect ? "correct" : ""} ${isWrongPick ? "wrong" : ""}"
                  data-det-opt="${esc(opt)}"
                  ${state.detAnswered || isElim ? "disabled" : ""}>
                  <span class="det-opt-letter">${letters[oIdx] || "•"}</span>
                  <span class="det-opt-text">${esc(opt)}</span>
                </button>
              `;
            })
            .join("")}
        </div>

        ${
          state.detAnswered
            ? `<div class="det-feedback-bar ${state.detAnswered.toLowerCase() === q.answer.toLowerCase() ? "ok" : "err"}">
                 <span>${state.detAnswered.toLowerCase() === q.answer.toLowerCase() ? "✅ Spot on!" : "💡 Good try!"} ${esc(q.explanation)}</span>
                 <button type="button" class="btn btn-primary btn-sm" id="detNextBtn">
                   ${state.detIndex + 1 < state.detQuestions.length ? "Next Question →" : "🏁 See Final Results"}
                 </button>
               </div>`
            : ""
        }
      </div>
    `;

    $("detLifeline50")?.addEventListener("click", () => {
      if (state.detAnswered || state.detEliminated.size > 0) return;
      const wrongOpts = shuffleArray(q.options.filter((o) => o.toLowerCase() !== q.answer.toLowerCase())).slice(0, 2);
      wrongOpts.forEach((o) => state.detEliminated.add(o));
      audio.playFlip();
      renderDetective();
    });

    $("detSpeakBtn")?.addEventListener("click", () => {
      audio.speak(q.speakText || q.answer, { force: true });
    });

    $("detOptionsGrid")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-det-opt]");
      if (!btn || state.detAnswered) return;
      const picked = btn.dataset.detOpt;
      state.detAnswered = picked;
      if (picked.toLowerCase() === q.answer.toLowerCase()) {
        state.detScoreCount += 1;
        audio.playCorrect();
        audio.speak(q.answer);
        awardPoints(100 + state.streak * 10, true);
      } else {
        audio.playWrong();
        awardPoints(0, true);
      }
      renderDetective();
    });

    $("detNextBtn")?.addEventListener("click", () => {
      state.detIndex += 1;
      state.detAnswered = null;
      state.detEliminated = new Set();
      if (state.detIndex >= state.detQuestions.length) {
        audio.playWin();
        burstConfetti();
      }
      renderDetective();
    });
  }

  /* ── Game 5: Hot-Seat Taboo & Charades Timer ────────────────────── */
  function initHotSeat() {
    stopHotSeatTimer();
    state.hsIndex = 0;
    state.hsSecondsLeft = state.hsDuration;
    state.hsRoundSolved = 0;
  }

  function toggleHotSeatTimer() {
    if (state.hsRunning) {
      stopHotSeatTimer();
      renderHotSeat();
      return;
    }
    if (state.hsSecondsLeft <= 0) {
      state.hsSecondsLeft = state.hsDuration;
      state.hsRoundSolved = 0;
    }
    state.hsRunning = true;
    state.hsTimerId = setInterval(() => {
      state.hsSecondsLeft = Math.max(0, state.hsSecondsLeft - 1);
      if (state.hsSecondsLeft <= 5 && state.hsSecondsLeft > 0) {
        audio.playTick();
      }
      if (state.hsSecondsLeft === 0) {
        stopHotSeatTimer();
        audio.playWin();
      }
      if (state.isOpen && state.activeGame === "hotseat") {
        renderHotSeat();
      }
    }, 1000);
    renderHotSeat();
  }

  function renderHotSeat() {
    const stage = $("arcadeStage");
    if (!stage || !state.deck.length) return;
    const rawWord = state.deck[state.hsIndex % state.deck.length];
    const card = buildTabooCard(rawWord, state.deck);
    const pct = Math.round((state.hsSecondsLeft / state.hsDuration) * 100);

    stage.innerHTML = `
      <div class="arcade-game-shell hs-shell">
        <div class="arcade-subbar">
          <div class="arcade-subbar-left">
            <span class="arcade-progress-pill">Hot-Seat Card <strong>${(state.hsIndex % state.deck.length) + 1}</strong> / <strong>${state.deck.length}</strong></span>
            <span class="arcade-mastery-pill">Round Words Guessed: <strong>${state.hsRoundSolved}</strong></span>
          </div>
          <div class="arcade-subbar-right">
            <button type="button" class="btn btn-soft btn-sm" id="hsSet60">${state.hsDuration === 60 ? "⏱️ 60s Round ✓" : "⏱️ 60s Round"}</button>
            <button type="button" class="btn btn-soft btn-sm" id="hsSet90">${state.hsDuration === 90 ? "⏱️ 90s Round ✓" : "⏱️ 90s Round"}</button>
            <button type="button" class="btn btn-soft btn-sm" id="hsResetTimer">🔄 Reset Timer</button>
          </div>
        </div>

        <div class="hs-main-grid">
          <!-- Left: Timer Ring & Controls -->
          <div class="hs-timer-panel">
            <div class="hs-timer-ring ${state.hsSecondsLeft <= 10 ? "urgent" : ""}" style="--hs-pct: ${pct}%">
              <div class="hs-timer-inner">
                <span class="hs-sec-num">${state.hsSecondsLeft}s</span>
                <span class="hs-sec-lbl">${state.hsRunning ? "LIVE" : state.hsSecondsLeft === 0 ? "TIME'S UP!" : "READY"}</span>
              </div>
            </div>
            <button type="button" class="btn ${state.hsRunning ? "btn-secondary" : "btn-primary"} hs-start-btn" id="hsToggleTimerBtn">
              ${state.hsRunning ? "⏸️ Pause Timer" : state.hsSecondsLeft === 0 ? "🔄 Start New Round" : "▶️ Start Countdown"}
            </button>
            <p class="hs-instructions">
              🪑 <strong>How to play:</strong> One student sits facing the class (back to the board). Classmates describe or act out the target word <strong>without saying the 3 Taboo words</strong>!
            </p>
          </div>

          <!-- Right: Giant Target Word + Forbidden Taboo List -->
          <div class="hs-card-panel">
            <div class="hs-target-header">
              <span class="hs-emoji">${esc(card.emojis || "🎯")}</span>
              <div>
                <span class="fc-pos-pill">${esc(card.type)}</span>
                <h2 class="hs-target-word">${esc(card.english)}</h2>
                <p class="hs-target-greek">🇬🇷 ${esc(card.greek)} ${card.collocation ? ` · 💬 ${esc(card.collocation)}` : ""}</p>
              </div>
            </div>

            <div class="hs-taboo-box">
              <span class="hs-taboo-title">🚫 FORBIDDEN TABOO WORDS (Do Not Say!)</span>
              <div class="hs-taboo-chips">
                ${card.forbiddenWords.map((fw) => `<span class="hs-taboo-chip">🚫 ${esc(fw)}</span>`).join("")}
              </div>
            </div>

            <div class="hs-action-buttons">
              <button type="button" class="btn btn-primary hs-btn-big" id="hsGotItBtn">
                ✅ Team Guessed It! (+100 pts)
              </button>
              <button type="button" class="btn btn-soft hs-btn-big" id="hsPassBtn">
                ⏭️ Pass / Next Word
              </button>
              <button type="button" class="btn btn-danger hs-btn-big" id="hsBuzzerBtn">
                🚨 Said a Taboo Word! (-25)
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    $("hsToggleTimerBtn")?.addEventListener("click", toggleHotSeatTimer);
    $("hsResetTimer")?.addEventListener("click", () => {
      stopHotSeatTimer();
      state.hsSecondsLeft = state.hsDuration;
      state.hsRoundSolved = 0;
      renderHotSeat();
    });
    $("hsSet60")?.addEventListener("click", () => {
      stopHotSeatTimer();
      state.hsDuration = 60;
      state.hsSecondsLeft = 60;
      renderHotSeat();
    });
    $("hsSet90")?.addEventListener("click", () => {
      stopHotSeatTimer();
      state.hsDuration = 90;
      state.hsSecondsLeft = 90;
      renderHotSeat();
    });
    $("hsGotItBtn")?.addEventListener("click", () => {
      audio.playCorrect();
      audio.speak(card.english);
      state.hsRoundSolved += 1;
      state.hsIndex = (state.hsIndex + 1) % state.deck.length;
      awardPoints(100, false);
      renderHotSeat();
    });
    $("hsPassBtn")?.addEventListener("click", () => {
      audio.playFlip();
      state.hsIndex = (state.hsIndex + 1) % state.deck.length;
      renderHotSeat();
    });
    $("hsBuzzerBtn")?.addEventListener("click", () => {
      audio.playWrong();
      state.hsIndex = (state.hsIndex + 1) % state.deck.length;
      awardPoints(-25, true);
      renderHotSeat();
    });
  }

  /* ── Master Render & Game Switcher ──────────────────────────────── */
  function startGame(gameId, { shuffle = false } = {}) {
    stopHotSeatTimer();
    if (gameId) state.activeGame = gameId;
    if (shuffle && state.deck.length > 1) {
      state.deck = shuffleArray(state.deck);
    }

    document.querySelectorAll("#arcadeGameTabs .arcade-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.game === state.activeGame);
    });

    if (state.activeGame === "flashcards") {
      initFlashcards();
      renderFlashcards();
    } else if (state.activeGame === "memory") {
      initMemoryMatch();
      renderMemoryMatch();
    } else if (state.activeGame === "spellbee") {
      initSpellBee();
      renderSpellBee();
    } else if (state.activeGame === "detective") {
      initDetective();
      renderDetective();
    } else if (state.activeGame === "hotseat") {
      initHotSeat();
      renderHotSeat();
    }
  }

  function openArcade(preferredGame = null) {
    const ctx = getDeckContext();
    state.deck = ctx.deck || [];
    state.unitTitle = ctx.unitTitle || "Classroom Vocabulary Arcade";
    state.isOpen = true;

    if ($("arcadeUnitTitle")) $("arcadeUnitTitle").textContent = state.unitTitle;
    if ($("arcadeDeckCount")) $("arcadeDeckCount").textContent = `📚 ${state.deck.length} words loaded`;

    $("arcadeModal")?.classList.remove("hidden");
    renderScoreboard();
    startGame(preferredGame || state.activeGame || "flashcards");
  }

  function closeArcade() {
    stopHotSeatTimer();
    state.isOpen = false;
    $("arcadeModal")?.classList.add("hidden");
  }

  function wireEvents() {
    $("closeArcadeModal")?.addEventListener("click", closeArcade);
    $("arcadeGameTabs")?.addEventListener("click", (e) => {
      const tab = e.target.closest("[data-game]");
      if (!tab) return;
      startGame(tab.dataset.game);
    });

    $("arcadeTeamToggle")?.addEventListener("click", () => {
      state.teamMode = state.teamMode === 2 ? 3 : state.teamMode === 3 ? 0 : 2;
      state.activeTeamIdx = 0;
      renderScoreboard();
    });

    $("arcadeSfxToggle")?.addEventListener("click", (e) => {
      audio.sfxEnabled = !audio.sfxEnabled;
      e.currentTarget.classList.toggle("active", audio.sfxEnabled);
      e.currentTarget.textContent = audio.sfxEnabled ? "🔔 Sound ON" : "🔕 Sound OFF";
    });

    $("arcadeTtsToggle")?.addEventListener("click", (e) => {
      audio.ttsEnabled = !audio.ttsEnabled;
      e.currentTarget.classList.toggle("active", audio.ttsEnabled);
      e.currentTarget.textContent = audio.ttsEnabled ? "🔊 Voice ON" : "🔇 Voice OFF";
    });

    $("arcadeShuffleDeck")?.addEventListener("click", () => {
      audio.playFlip();
      startGame(state.activeGame, { shuffle: true });
    });

    $("arcadeResetScores")?.addEventListener("click", () => {
      state.teams.forEach((t) => { t.score = 0; });
      state.streak = 0;
      renderScoreboard();
    });

    $("arcadeTeamsWrap")?.addEventListener("click", (e) => {
      const addBtn = e.target.closest("[data-team-add]");
      if (addBtn) {
        e.stopPropagation();
        const idx = Number(addBtn.dataset.teamAdd);
        state.teams[idx].score += 50;
        audio.playCorrect();
        renderScoreboard();
        return;
      }
      const subBtn = e.target.closest("[data-team-sub]");
      if (subBtn) {
        e.stopPropagation();
        const idx = Number(subBtn.dataset.teamSub);
        state.teams[idx].score = Math.max(0, state.teams[idx].score - 25);
        renderScoreboard();
        return;
      }
      const pill = e.target.closest("[data-team-idx]");
      if (pill) {
        state.activeTeamIdx = Number(pill.dataset.teamIdx);
        renderScoreboard();
      }
    });

    // Global keyboard support while Arcade is open
    window.addEventListener("keydown", (e) => {
      if (!state.isOpen || $("arcadeModal")?.classList.contains("hidden")) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        closeArcade();
        return;
      }
      if (state.activeGame === "flashcards") {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          toggleFlashcardFlip();
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          stepFlashcard(1);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          stepFlashcard(-1);
        } else if (e.key.toLowerCase() === "s") {
          const card = state.deck[state.fcIndex];
          if (card) audio.speak(card.english, { force: true });
        }
      } else if (state.activeGame === "spellbee" && !state.sbSolved) {
        if (e.key === "Backspace") {
          if (state.sbPickedIndices.length > 0) {
            e.preventDefault();
            state.sbPickedIndices.pop();
            audio.playFlip();
            renderSpellBee();
          }
        } else if (/^[a-zA-Z]$/.test(e.key)) {
          const upper = e.key.toUpperCase();
          const tileIdx = state.sbTiles.findIndex(
            (t, idx) => !state.sbPickedIndices.includes(idx) && t.ch.toUpperCase() === upper
          );
          if (tileIdx >= 0) {
            e.preventDefault();
            pickSpellBeeTile(tileIdx);
          }
        }
      }
    });
  }

  wireEvents();

  return {
    openArcade,
    closeArcade,
    audio,
    getState: () => state,
  };
}
