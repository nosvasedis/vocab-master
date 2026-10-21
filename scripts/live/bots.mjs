#!/usr/bin/env node
/* Test bots for Lingo Live phone mode (and the classroom load test): N fake students join a room in parallel
   and answer each question after a random delay. Usage:
     node scripts/live/bots.mjs <pin> [count=5] [--quiet]
   --quiet prints one line per question (answers accepted / rejected) instead of one per bot. */
import { initializeApp } from "../../desktop/renderer/vendor/firebase/firebase-app.js";
import { initializeAuth, signInAnonymously, inMemoryPersistence } from "../../desktop/renderer/vendor/firebase/firebase-auth.js";
import { getDatabase, ref, set, onValue, serverTimestamp, get } from "../../desktop/renderer/vendor/firebase/firebase-database.js";
import { FIREBASE_CONFIG, AVATARS } from "../../desktop/renderer/arcade/live/net-config.js";

const args = process.argv.slice(2);
const quiet = args.includes("--quiet");
const [pin, countArg] = args.filter((a) => !a.startsWith("--"));
const count = Number(countArg || 5);
const NAMES = ["Alex", "Eleni", "Nikos", "Sofia", "Giorgos", "Maria", "Kostas", "Anna", "Dimitris", "Katerina"];
if (!/^\d{6}$/.test(pin || "")) { console.error("usage: node scripts/live/bots.mjs <pin> [count] [--quiet]"); process.exit(1); }

const tally = new Map(); // qkey → { ok, rejected, ms: [] }
const note = (qkey, ok, ms) => {
  const t = tally.get(qkey) || { ok: 0, rejected: 0, ms: [] };
  ok ? t.ok++ : t.rejected++;
  if (ok) t.ms.push(ms);
  tally.set(qkey, t);
  if (quiet && t.ok + t.rejected === count) {
    const avg = t.ms.length ? Math.round(t.ms.reduce((a, b) => a + b, 0) / t.ms.length) : 0;
    console.log(`${qkey}: ${t.ok} accepted, ${t.rejected} rejected, write took ${avg} ms on average (max ${Math.max(0, ...t.ms)} ms)`);
  }
};
let closed = 0;

async function bot(i) {
  const app = initializeApp(FIREBASE_CONFIG, `bot${i}`);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  const { user } = await signInAnonymously(auth);
  const db = getDatabase(app);
  const base = `rooms/${pin}`;
  if (!(await get(ref(db, `${base}/meta`))).exists()) { console.error("no such room"); process.exit(1); }
  const name = `${NAMES[i % NAMES.length]}${i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : ""} bot`.slice(0, 16);
  await set(ref(db, `${base}/players/${user.uid}`), { name, avatar: AVATARS[(i * 3) % AVATARS.length], joinedAt: serverTimestamp() });
  if (!quiet) console.log(`bot ${i} joined`);
  let answered = "";
  onValue(ref(db, `${base}/state`), (s) => {
    const st = s.val();
    if (!st) { if (++closed === count) { console.log("room closed — all bots done"); process.exit(0); } return; }
    if (st.phase === "question" && st.qkey !== answered) {
      answered = st.qkey;
      const delay = 1500 + Math.random() * 7000;
      setTimeout(() => {
        const opt = Math.floor(Math.random() * (st.nOpts || 4));
        const t0 = Date.now();
        set(ref(db, `${base}/answers/${st.qkey}/${user.uid}`), { opt, at: serverTimestamp() })
          .then(() => { note(st.qkey, true, Date.now() - t0); if (!quiet) console.log(`bot ${i} answered ${st.qkey}: ${opt}`); })
          .catch((e) => { note(st.qkey, false, 0); if (!quiet) console.log(`bot ${i} rejected: ${e.code || e.message}`); });
      }, delay);
    }
  });
}

const t0 = Date.now();
await Promise.all(Array.from({ length: count }, (_, i) => bot(i)));
console.log(`${count} bots joined in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
