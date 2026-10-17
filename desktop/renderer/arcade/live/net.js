/* Lingo Live — phone transport for the projector host (Firebase Realtime Database).
   Room layout under rooms/{pin}: meta · state · players/{uid} · teamOf/{uid} · answers/{qkey}/{uid} · results/{uid}.
   Players write only their own player node and one answer per open question (see firebase/database.rules.json);
   everything else is written by the host. The room is deleted when the show ends. */
import { initializeApp, getApps } from "../../vendor/firebase/firebase-app.js";
import { initializeAuth, signInAnonymously, indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence } from "../../vendor/firebase/firebase-auth.js";
import { getDatabase, ref, set, update, remove, onValue, off, serverTimestamp, get } from "../../vendor/firebase/firebase-database.js";
import { FIREBASE_CONFIG, PLAY_URL } from "./net-config.js";

let fb = null;
async function connect() {
  if (fb) return fb;
  const app = getApps()[0] || initializeApp(FIREBASE_CONFIG);
  const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence] });
  const cred = await signInAnonymously(auth);
  fb = { app, db: getDatabase(app), uid: cred.user.uid };
  return fb;
}

const randomPin = () => String(100000 + Math.floor(Math.random() * 900000));

/**
 * Open a room. Returns a handle the live game drives; throws when offline / blocked.
 * @param {{ title: string, teams: {name, emoji, color}[] }} opts
 */
export async function openRoom({ title, teams }) {
  const { db, uid } = await connect();
  let pin = "";
  for (let k = 0; k < 6 && !pin; k++) {
    const cand = randomPin();
    const snap = await get(ref(db, `rooms/${cand}/meta`)).catch(() => null);
    if (!snap?.exists()) pin = cand;
  }
  if (!pin) throw new Error("Could not find a free game PIN");
  const base = `rooms/${pin}`;
  await set(ref(db, base), {
    meta: { host: uid, createdAt: Date.now(), title: String(title || "Lingo Live").slice(0, 80), teams: teams.map((t) => ({ name: t.name, emoji: t.emoji, color: t.color })) },
    state: { phase: "lobby" },
  });
  const listeners = [];
  const listen = (path, cb) => {
    const r = ref(db, `${base}/${path}`);
    onValue(r, (s) => cb(s.val()));
    listeners.push(r);
    return () => off(r);
  };
  let serverOffset = 0;
  const offRef = ref(db, ".info/serverTimeOffset");
  onValue(offRef, (s) => { serverOffset = s.val() || 0; });
  listeners.push(offRef);

  return {
    pin,
    url: `${PLAY_URL}/?pin=${pin}`,
    shortUrl: PLAY_URL.replace(/^https?:\/\//, ""),
    /** players: { uid: { name, avatar, joinedAt } } */
    onPlayers: (cb) => listen("players", (v) => cb(v || {})),
    /** Live answers for one question: { uid: { opt, at } } */
    onAnswers: (qkey, cb) => listen(`answers/${qkey}`, (v) => cb(v || {})),
    serverNow: () => Date.now() + serverOffset,
    setTeams: (map) => set(ref(db, `${base}/teamOf`), map),
    kick: (pid) => remove(ref(db, `${base}/players/${pid}`)),
    /** Open a question: phones show nOpts shapes until the host reveals. Resolves with the server start time. */
    async openQuestion({ qkey, qnum, total, nOpts, limitMs, kindLabel }) {
      await update(ref(db, `${base}/state`), { phase: "question", qkey, qnum, total, nOpts, limitMs, kindLabel, startedAt: serverTimestamp(), answer: null });
      const s = await get(ref(db, `${base}/state/startedAt`));
      return s.val();
    },
    reveal: ({ answer, results }) => update(ref(db, base), { "state/phase": "reveal", "state/answer": answer, results }),
    clearResults: () => remove(ref(db, `${base}/results`)),
    setPhase: (phase, extra = {}) => update(ref(db, `${base}/state`), { phase, ...extra }),
    async close() {
      listeners.forEach((r) => off(r));
      await remove(ref(db, base)).catch(() => {});
    },
  };
}
