/* Lingo Live — the phone page. Join with a PIN, pick a nickname and an animal, answer with shapes.
   The projector shows the questions; the phone shows shapes only (like Kahoot), so eyes stay on the board.
   Data: rooms/{pin} in Firebase Realtime Database (rules: firebase/database.rules.json). */
import { initializeApp } from "./vendor/firebase-app.js";
import { initializeAuth, signInAnonymously, indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence } from "./vendor/firebase-auth.js";
import { getDatabase, ref, get, set, onValue, serverTimestamp } from "./vendor/firebase-database.js";
import { FIREBASE_CONFIG, AVATARS, SHAPE_COLORS } from "./vendor/net-config.js";

const SHAPES = ["tri", "dia", "cir", "sq"];
const SHAPE_SVG = {
  tri: `<svg viewBox="0 0 100 100"><path d="M50 10 L92 86 H8 Z"/></svg>`,
  dia: `<svg viewBox="0 0 100 100"><path d="M50 6 L94 50 L50 94 L6 50 Z"/></svg>`,
  cir: `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42"/></svg>`,
  sq: `<svg viewBox="0 0 100 100"><rect x="12" y="12" width="76" height="76" rx="8"/></svg>`,
};
const app = document.getElementById("app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const vibrate = (ms) => { try { navigator.vibrate?.(ms); } catch { /* ignore */ } };
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };

const fbApp = initializeApp(FIREBASE_CONFIG);
const auth = initializeAuth(fbApp, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence] });
const db = getDatabase(fbApp);
let uid = null;

const S = { pin: "", room: null, me: null, state: null, team: null, teams: [], result: null, answered: null, unsub: [] };

function screen(cls, html) { app.className = cls; app.innerHTML = html; }

/* ── 1. PIN ─────────────────────────────────────────────────────────── */
function askPin(error = "") {
  const fromUrl = new URLSearchParams(location.search).get("pin") || "";
  screen("s-pin", `
    <div class="brand"><span class="mark">🎯</span><h1>Lingo <b>Live</b></h1></div>
    <form class="card" id="pinForm" autocomplete="off">
      <label for="pin">Game PIN</label>
      <input id="pin" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="123456" value="${esc(fromUrl)}" />
      ${error ? `<p class="err">${esc(error)}</p>` : ""}
      <button type="submit" class="go">Enter</button>
    </form>
    <p class="foot">Look at the board for the PIN.</p>`);
  const input = document.getElementById("pin");
  if (!fromUrl) input.focus();
  document.getElementById("pinForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pin = input.value.replace(/\D/g, "");
    if (pin.length !== 6) return askPin("The PIN has 6 numbers.");
    await openRoom(pin);
  });
  if (/^\d{6}$/.test(fromUrl) && !error) openRoom(fromUrl);
}

async function openRoom(pin) {
  screen("s-wait", `<div class="spinner"></div><p>Finding the game…</p>`);
  try {
    const meta = await get(ref(db, `rooms/${pin}/meta`));
    if (!meta.exists()) return askPin("No game with that PIN. Check the board!");
    S.pin = pin;
    S.room = meta.val();
    S.teams = S.room.teams || [];
    const existing = await get(ref(db, `rooms/${pin}/players/${uid}`));
    if (existing.exists()) { S.me = existing.val(); return enter(); }
    askName();
  } catch {
    askPin("Can't reach the game. Check the Wi-Fi and try again.");
  }
}

/* ── 2. Nickname + avatar ───────────────────────────────────────────── */
function askName(error = "") {
  const lastName = store.get("ll_name") || "";
  const lastAvatar = store.get("ll_avatar") || AVATARS[Math.floor(Math.random() * AVATARS.length)];
  screen("s-name", `
    <div class="brand sm"><span class="mark">🎯</span><span class="room">${esc(S.room?.title || "Lingo Live")}</span></div>
    <form class="card" id="nameForm" autocomplete="off">
      <label for="nick">Your nickname</label>
      <input id="nick" maxlength="16" placeholder="e.g. Super Maria" value="${esc(lastName)}" autocapitalize="words" />
      <label>Pick your animal</label>
      <div class="avatars">${AVATARS.map((a) => `<button type="button" class="av${a === lastAvatar ? " on" : ""}" data-av="${a}">${a}</button>`).join("")}</div>
      ${error ? `<p class="err">${esc(error)}</p>` : ""}
      <button type="submit" class="go">I'm ready!</button>
    </form>
    <p class="foot">Use a nickname — not your full name.</p>`);
  let avatar = lastAvatar;
  app.querySelectorAll("[data-av]").forEach((b) => b.addEventListener("click", () => {
    avatar = b.dataset.av;
    app.querySelectorAll("[data-av]").forEach((x) => x.classList.toggle("on", x === b));
    vibrate(10);
  }));
  document.getElementById("nameForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("nick").value.replace(/\s+/g, " ").trim().slice(0, 16);
    if (!name) return askName("Type a nickname first.");
    try {
      await set(ref(db, `rooms/${S.pin}/players/${uid}`), { name, avatar, joinedAt: serverTimestamp() });
      store.set("ll_name", name);
      store.set("ll_avatar", avatar);
      S.me = { name, avatar };
      enter();
    } catch {
      askName("Couldn't join — is the game still open?");
    }
  });
}

/* ── 3. In the game: follow the host's state ────────────────────────── */
function enter() {
  S.unsub.forEach((u) => u());
  S.unsub = [];
  const watch = (path, cb) => S.unsub.push(onValue(ref(db, `rooms/${S.pin}/${path}`), (s) => cb(s.val())));
  watch(`players/${uid}`, (v) => { if (S.me && !v && S.state?.phase !== "ended") kicked(); });
  watch(`teamOf/${uid}`, (v) => { S.team = Number.isInteger(v) ? v : null; render(); });
  watch(`results/${uid}`, (v) => { S.result = v; render(); });
  watch("state", (v) => {
    const prevKey = S.state?.qkey;
    S.state = v;
    if (!v) { ended(); return; }
    if (v.qkey !== prevKey) S.answered = null;
    render();
  });
}

function header() {
  const t = S.team != null ? S.teams[S.team] : null;
  return `<header class="bar"><span class="who">${esc(S.me?.avatar || "")} ${esc(S.me?.name || "")}</span>${t ? `<span class="team" style="--team:${esc(t.color)}">${esc(t.emoji)} ${esc(t.name)}</span>` : ""}${S.result?.total != null ? `<span class="pts">${S.result.total}</span>` : ""}</header>`;
}

function render() {
  const st = S.state;
  if (!st || !S.me) return;
  if (st.phase === "lobby") {
    screen("s-lobby", `${header()}<div class="center"><div class="big-av bob">${esc(S.me.avatar)}</div><h2>You're in!</h2><p>See your name on the board?<br>The game starts soon.</p></div>`);
  } else if (st.phase === "question" && S.answered == null) {
    const n = Math.max(2, Math.min(4, st.nOpts || 4));
    screen(`s-question n${n}`, `${header()}<p class="qline">${st.qnum ? `Question ${st.qnum}${st.total ? ` of ${st.total}` : ""}` : ""}</p>
      <div class="shapes">${SHAPES.slice(0, n).map((s, k) => `<button type="button" class="shape s-${s}" data-opt="${k}" style="--c:${SHAPE_COLORS[s]}" aria-label="Answer ${k + 1}">${SHAPE_SVG[s]}${n === 2 ? `<b>${k === 0 ? "True" : "False"}</b>` : ""}</button>`).join("")}</div>`);
    app.querySelectorAll("[data-opt]").forEach((b) => b.addEventListener("click", () => answer(Number(b.dataset.opt)), { once: true }));
  } else if (st.phase === "question") {
    const s = SHAPES[S.answered];
    screen("s-locked", `${header()}<div class="center"><div class="chip-big" style="--c:${SHAPE_COLORS[s]}">${SHAPE_SVG[s]}</div><h2>Answer locked!</h2><p>Eyes on the board 👀</p></div>`);
  } else if (st.phase === "reveal") {
    const r = S.result?.last;
    const right = r?.correct;
    screen(`s-result ${right ? "ok" : "no"}`, `${header()}<div class="center">
      <div class="verdict">${right ? "✓" : r?.opt == null ? "⏱" : "✗"}</div>
      <h2>${right ? "Correct!" : r?.opt == null ? "Too slow this time" : "Not this time"}</h2>
      ${right ? `<p class="gain">+${r.pts}</p>` : ""}
      ${r?.streak >= 2 ? `<p class="streak">🔥 ${r.streak} in a row!</p>` : ""}
      ${S.result?.rank ? `<p class="rank">You're <b>${ordinal(S.result.rank)}</b> of ${S.result.of}</p>` : ""}
    </div>`);
    vibrate(right ? [20, 40, 20] : 60);
  } else if (st.phase === "board") {
    screen("s-board", `${header()}<div class="center"><div class="big-av">${esc(S.me.avatar)}</div><h2>${S.result?.rank ? `${ordinal(S.result.rank)} place` : "Leaderboard"}</h2><p>${S.result?.total ?? 0} points · get ready for the next one!</p></div>`);
  } else if (st.phase === "podium" || st.phase === "ended") {
    const rank = S.result?.rank;
    screen("s-final", `${header()}<div class="center"><div class="medal">${rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "🎉"}</div><h2>${rank ? `You finished ${ordinal(rank)}!` : "Great game!"}</h2><p><b>${S.result?.total ?? 0}</b> points</p><p class="foot">Thanks for playing Lingo Live!</p></div>`);
  } else {
    screen("s-wait", `${header()}<div class="center"><div class="spinner"></div><p>Get ready…</p></div>`);
  }
}

async function answer(opt) {
  if (S.answered != null || S.state?.phase !== "question") return;
  S.answered = opt;
  vibrate(25);
  render();
  try {
    await set(ref(db, `rooms/${S.pin}/answers/${S.state.qkey}/${uid}`), { opt, at: serverTimestamp() });
  } catch {
    // Too late (the host already revealed) or already answered: the reveal screen will say so.
  }
}

function kicked() {
  S.unsub.forEach((u) => u());
  screen("s-pin", `<div class="center"><div class="medal">👋</div><h2>You left the game</h2><p>Ask your teacher, then join again.</p><button class="go" onclick="location.reload()">Join again</button></div>`);
}
function ended() {
  S.unsub.forEach((u) => u());
  screen("s-final", `<div class="center"><div class="medal">🎉</div><h2>The game has ended</h2><p>Thanks for playing!</p></div>`);
}
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;

/* ── Connection: a strip at the top while the phone is offline (Firebase reconnects by itself) ── */
let wasOnline = false;
onValue(ref(db, ".info/connected"), (s) => {
  const on = s.val() === true;
  if (on) wasOnline = true;
  let strip = document.getElementById("netStrip");
  if (on || !wasOnline) { strip?.remove(); return; }
  if (!strip) {
    strip = document.createElement("div");
    strip.id = "netStrip";
    strip.className = "net-strip";
    strip.setAttribute("role", "status");
    strip.textContent = "📶 Reconnecting… stay on this page";
    document.body.appendChild(strip);
  }
});

/* ── Start ──────────────────────────────────────────────────────────── */
screen("s-wait", `<div class="center"><div class="spinner"></div><p>Connecting…</p></div>`);
signInAnonymously(auth)
  .then((cred) => { uid = cred.user.uid; askPin(); })
  .catch(() => screen("s-pin", `<div class="center"><div class="medal">📶</div><h2>No connection</h2><p>Check the Wi-Fi, then reload the page.</p></div>`));
