#!/usr/bin/env node
/* Test bots for Lingo Live phone mode: N fake students join a room and answer each question after a
   random delay (mostly right if --smart). Usage: node scripts/live/bots.mjs <pin> [count=5] [--smart] */
import { initializeApp } from "../../desktop/renderer/vendor/firebase/firebase-app.js";
import { initializeAuth, signInAnonymously, inMemoryPersistence } from "../../desktop/renderer/vendor/firebase/firebase-auth.js";
import { getDatabase, ref, set, onValue, serverTimestamp, get } from "../../desktop/renderer/vendor/firebase/firebase-database.js";
import { FIREBASE_CONFIG, AVATARS } from "../../desktop/renderer/arcade/live/net-config.js";

const [pin, countArg] = process.argv.slice(2);
const count = Number(countArg || 5);
const NAMES = ["Alex", "Eleni", "Nikos", "Sofia", "Giorgos", "Maria", "Kostas", "Anna", "Dimitris", "Katerina"];
if (!/^\d{6}$/.test(pin || "")) { console.error("usage: node scripts/live/bots.mjs <pin> [count]"); process.exit(1); }

for (let i = 0; i < count; i++) {
  const app = initializeApp(FIREBASE_CONFIG, `bot${i}`);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  const { user } = await signInAnonymously(auth);
  const db = getDatabase(app);
  const base = `rooms/${pin}`;
  if (!(await get(ref(db, `${base}/meta`))).exists()) { console.error("no such room"); process.exit(1); }
  await set(ref(db, `${base}/players/${user.uid}`), { name: `${NAMES[i % NAMES.length]} (bot)`.slice(0, 16), avatar: AVATARS[(i * 3) % AVATARS.length], joinedAt: serverTimestamp() });
  console.log(`bot ${i} joined`);
  let answered = "";
  onValue(ref(db, `${base}/state`), (s) => {
    const st = s.val();
    if (!st) { console.log(`bot ${i}: room closed`); process.exit(0); }
    if (st.phase === "question" && st.qkey !== answered) {
      answered = st.qkey;
      const delay = 1500 + Math.random() * 7000;
      setTimeout(() => {
        const opt = Math.floor(Math.random() * (st.nOpts || 4));
        set(ref(db, `${base}/answers/${st.qkey}/${user.uid}`), { opt, at: serverTimestamp() })
          .then(() => console.log(`bot ${i} answered ${st.qkey}: ${opt}`))
          .catch((e) => console.log(`bot ${i} rejected: ${e.code || e.message}`));
      }, delay);
    }
  });
}
