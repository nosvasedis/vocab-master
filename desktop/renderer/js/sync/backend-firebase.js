/* Sync — Firebase (Auth + Realtime Database) for accounts.
   Each profile on this computer gets its own named Firebase app ("vm-sync-<slot>"), so its sign-in is
   remembered separately and never touches Lingo Live's anonymous sign-in (the default app).
   Account tree, guarded by firebase/database.rules.json (only the owner, never anonymous users):
     users/{uid}/index/{key}/{id} = t · users/{uid}/items/{key}/{id} = { v, t, by, del } · users/{uid}/vault */
import { initializeApp, getApps, deleteApp } from "../../vendor/firebase/firebase-app.js";
import {
  initializeAuth, getAuth, indexedDBLocalPersistence, browserLocalPersistence, onAuthStateChanged, connectAuthEmulator,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithCredential, GoogleAuthProvider, signOut,
} from "../../vendor/firebase/firebase-auth.js";
import { getDatabase, ref, get, update, set, onValue, connectDatabaseEmulator, goOffline, goOnline, forceWebSockets } from "../../vendor/firebase/firebase-database.js";
import { FIREBASE_CONFIG } from "../../arcade/live/net-config.js";
import { encodeSeg, decodeSeg } from "./merge.js";

/** Local Firebase emulators (developer check only: localhost web build with ?syncEmulator=1). */
export const EMULATOR = { auth: "http://127.0.0.1:9099", dbHost: "127.0.0.1", dbPort: 9000, signin: "http://127.0.0.1:5000/signin.html" };
export const SIGNIN_URL = "https://vocab-master-live.web.app/signin.html";

export function useEmulator() {
  if (typeof location === "undefined" || !/^(localhost|127\.0\.0\.1)$/.test(location.hostname) || typeof window.desktop !== "undefined") return false;
  try {
    const q = new URLSearchParams(location.search).get("syncEmulator");
    if (q === "1") localStorage.setItem("vm_sync_emulator", "1");
    if (q === "0") localStorage.removeItem("vm_sync_emulator");
    return localStorage.getItem("vm_sync_emulator") === "1";
  } catch { return false; }
}

// WebSockets only: the long-polling fallback loads <script> tags from the database host, which the app's CSP
// (script-src 'self') blocks, and once a socket has failed the SDK would keep choosing that dead fallback.
forceWebSockets();

const apps = new Map();

/** The Firebase app + auth for one profile slot. */
export function profileApp(slot) {
  if (apps.has(slot)) return apps.get(slot);
  const name = `vm-sync-${slot}`;
  const existing = getApps().find((a) => a.name === name);
  const app = existing || initializeApp(FIREBASE_CONFIG, name);
  const auth = existing ? getAuth(app) : initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  const db = getDatabase(app);
  if (!existing && useEmulator()) {
    connectAuthEmulator(auth, EMULATOR.auth, { disableWarnings: true });
    connectDatabaseEmulator(db, EMULATOR.dbHost, EMULATOR.dbPort);
  }
  const handle = { app, auth, db, slot };
  apps.set(slot, handle);
  return handle;
}

export async function dropProfileApp(slot) {
  const h = apps.get(slot);
  apps.delete(slot);
  if (h) await deleteApp(h.app).catch(() => {});
}

/** Resolves with the remembered user (or null) once auth has restored its state. */
export function restoredUser(handle) {
  return new Promise((resolve) => {
    const off = onAuthStateChanged(handle.auth, (user) => { off(); resolve(user); });
  });
}

/* ── sign-in ────────────────────────────────────────────────────── */
const FRIENDLY = {
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/missing-password": "Type your password.",
  "auth/weak-password": "Choose a password of at least 6 characters.",
  "auth/email-already-in-use": "There's already an account with this email. Sign in instead.",
  "auth/invalid-credential": "Wrong email or password.",
  "auth/wrong-password": "Wrong email or password.",
  "auth/user-not-found": "There's no account with this email yet. Create one?",
  "auth/too-many-requests": "Too many tries. Wait a minute and try again.",
  "auth/network-request-failed": "No connection to the sign-in service. Check the internet and try again.",
  "auth/operation-not-allowed": "This sign-in method isn't switched on for Vocab Master yet (Firebase console → Authentication).",
  "auth/user-disabled": "This account has been disabled.",
};
export const friendlyAuthError = (err) => FRIENDLY[err?.code] || err?.message || String(err);

export const emailSignIn = (h, email, password) => signInWithEmailAndPassword(h.auth, email.trim(), password).then((c) => c.user);
export const emailSignUp = (h, email, password) => createUserWithEmailAndPassword(h.auth, email.trim(), password).then((c) => c.user);
export const resetPassword = (h, email) => sendPasswordResetEmail(h.auth, email.trim());
export const googleSignIn = (h, idToken) => signInWithCredential(h.auth, GoogleAuthProvider.credential(idToken)).then((c) => c.user);
export const signOutProfile = (h) => signOut(h.auth);

/* ── the account's data ─────────────────────────────────────────── */
function decodeIndex(val) {
  const out = {};
  for (const [k, ids] of Object.entries(val || {})) {
    const key = decodeSeg(k);
    out[key] = {};
    for (const [id, t] of Object.entries(ids || {})) if (typeof t === "number") out[key][decodeSeg(id)] = t;
  }
  return out;
}

/**
 * Backend for the engine, bound to one signed-in user.
 * @returns engine backend plus { watch(handlers) → stop }
 */
export function accountBackend(h, uid) {
  const base = `users/${uid}`;
  const r = (p) => ref(h.db, `${base}/${p}`);
  return {
    async getIndex() {
      const snap = await get(r("index"));
      return decodeIndex(snap.val());
    },
    async getItems(list) {
      const out = [];
      const results = await Promise.all(list.map(({ key, id }) => get(r(`items/${encodeSeg(key)}/${encodeSeg(id)}`)).then((s) => ({ key, id, rec: s.val() }))));
      for (const x of results) if (x.rec) out.push(x);
      return out;
    },
    async putItems(list) {
      const patch = {};
      for (const { key, id, rec } of list) {
        const k = encodeSeg(key);
        const i = encodeSeg(id);
        patch[`items/${k}/${i}`] = rec.del ? { t: rec.t, by: rec.by || "", del: true } : { t: rec.t, by: rec.by || "", v: rec.v };
        patch[`index/${k}/${i}`] = rec.t;
      }
      patch.meta = { schema: 1, updatedAt: Date.now() };
      await update(ref(h.db, base), patch);
    },
    async getVault() {
      return (await get(r("vault"))).val();
    },
    async putVault(v) {
      await set(r("vault"), v);
    },
    /** Live updates: the index (small) and the vault's time; plus connection state and server clock. */
    watch({ onIndex, onVault, onConnected, onOffset }) {
      const offs = [
        onValue(r("index"), (s) => onIndex?.(decodeIndex(s.val())), () => {}),
        onValue(r("vault/t"), (s) => onVault?.(s.val()), () => {}),
        onValue(ref(h.db, ".info/connected"), (s) => onConnected?.(!!s.val())),
        onValue(ref(h.db, ".info/serverTimeOffset"), (s) => onOffset?.(Number(s.val()) || 0)),
      ];
      return () => offs.forEach((off) => off());
    },
    offline: () => goOffline(h.db),
    online: () => goOnline(h.db),
  };
}
