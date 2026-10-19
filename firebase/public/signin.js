/* Vocab Master — Google sign-in hand-off (opened by the app; see desktop/renderer/js/sync/google.js).
   Signs in with Google on this authorised domain, then gives the app the Google ID token only:
   - mode=web:      postMessage to the opener, and only to a localhost origin given in ?origin=
   - mode=loopback: a form POST to http://127.0.0.1:<port>/callback (the desktop app listens there once)
   Both carry the app's random ?state=, which the app checks. Nothing is stored on this page:
   it uses its own Firebase app with in-memory sign-in, so Lingo Live phones on this domain are untouched. */
import { initializeApp } from "./vendor/firebase-app.js";
import { initializeAuth, inMemoryPersistence, browserPopupRedirectResolver, GoogleAuthProvider, signInWithPopup, signOut, connectAuthEmulator } from "./vendor/firebase-auth.js";
import { FIREBASE_CONFIG } from "./vendor/net-config.js";

const q = new URLSearchParams(location.search);
const mode = q.get("mode");
const state = q.get("state") || "";
const origin = q.get("origin") || "";
const port = Number(q.get("port"));
const $ = (id) => document.getElementById(id);

const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{2,5})?$/;
const valid = /^[A-Za-z0-9_-]{16,128}$/.test(state)
  && ((mode === "web" && LOCAL_ORIGIN.test(origin) && window.opener)
    || (mode === "loopback" && Number.isInteger(port) && port >= 1024 && port <= 65535));

function fail(text) {
  $("err").textContent = text;
  $("err").hidden = false;
}

function deliver(idToken) {
  if (mode === "web") {
    window.opener.postMessage({ type: "vm-google-signin", state, idToken }, origin);
    $("card").innerHTML = `<h1>Signed in</h1><p class="ok">You can go back to Vocab Master.</p>`;
    setTimeout(() => window.close(), 400);
    return;
  }
  const form = Object.assign(document.createElement("form"), { method: "POST", action: `http://127.0.0.1:${port}/callback` });
  for (const [name, value] of Object.entries({ state, id_token: idToken })) {
    form.appendChild(Object.assign(document.createElement("input"), { type: "hidden", name, value }));
  }
  document.body.appendChild(form);
  form.submit();
}

if (!valid) {
  $("lead").textContent = "Open this page from Vocab Master: Settings → Account → Continue with Google.";
  $("go").hidden = true;
} else {
  const app = initializeApp(FIREBASE_CONFIG, "signin");
  const auth = initializeAuth(app, { persistence: inMemoryPersistence, popupRedirectResolver: browserPopupRedirectResolver });
  if (q.get("emulator") === "1" && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const go = $("go");
  go.disabled = false;
  go.addEventListener("click", async () => {
    go.disabled = true;
    $("err").hidden = true;
    try {
      const result = await signInWithPopup(auth, provider);
      const idToken = GoogleAuthProvider.credentialFromResult(result)?.idToken;
      await signOut(auth).catch(() => {});
      if (!idToken) throw new Error("Google didn't return a sign-in token. Try again.");
      deliver(idToken);
    } catch (err) {
      go.disabled = false;
      if (err?.code === "auth/popup-closed-by-user" || err?.code === "auth/cancelled-popup-request") return;
      if (err?.code === "auth/popup-blocked") fail("Your browser blocked the Google window. Allow pop-ups for this page and press the button again.");
      else if (err?.code === "auth/operation-not-allowed") fail("Google sign-in isn't switched on for Vocab Master yet (Firebase console → Authentication → Sign-in method → Google).");
      else fail(err?.message || String(err));
    }
  });
}
