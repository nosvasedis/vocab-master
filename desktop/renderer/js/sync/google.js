/* Sync — Google sign-in. The app's own page can't run Google's popup (app:// on desktop isn't an
   authorised domain, and the CSP blocks Google's scripts), so a small hosted page does it:
   firebase/public/signin.html on vocab-master-live.web.app signs in with Google and hands back only the
   Google ID token, which the app exchanges with signInWithCredential.
   - Web (localhost:8787): the page opens in a popup and posts the token back to this exact origin.
   - Desktop: the main process opens the system browser and receives the token on a one-time
     127.0.0.1 loopback port (desktop/main.js, google:signin), checked with a random state value. */
import { SIGNIN_URL, EMULATOR, useEmulator } from "./backend-firebase.js";

const randomState = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");

export function cancelGoogle() {
  window.desktop?.googleCancel?.();
}

/** Resolves with a Google ID token, or throws (cancelled, closed, timed out). */
export async function googleIdToken() {
  const d = window.desktop;
  if (d?.googleSignIn) {
    const res = await d.googleSignIn();
    if (!res?.ok) throw Object.assign(new Error(res?.error || "Google sign-in didn't finish."), { code: res?.code || "google/failed" });
    return res.idToken;
  }
  const page = useEmulator() ? EMULATOR.signin : SIGNIN_URL;
  const pageOrigin = new URL(page).origin;
  const state = randomState();
  const url = `${page}?mode=web&origin=${encodeURIComponent(location.origin)}&state=${state}${useEmulator() ? "&emulator=1" : ""}`;
  const popup = window.open(url, "vm-google-signin", "popup,width=480,height=640");
  if (!popup) throw Object.assign(new Error("The sign-in window was blocked. Allow pop-ups for this page and try again."), { code: "google/popup-blocked" });
  return new Promise((resolve, reject) => {
    const done = (fn, v) => { window.removeEventListener("message", onMessage); clearInterval(watch); clearTimeout(timer); fn(v); };
    const onMessage = (e) => {
      if (e.origin !== pageOrigin || e.data?.type !== "vm-google-signin" || e.data.state !== state) return;
      if (e.data.idToken) done(resolve, e.data.idToken);
      else done(reject, Object.assign(new Error(e.data.error || "Google sign-in didn't finish."), { code: "google/failed" }));
    };
    window.addEventListener("message", onMessage);
    const watch = setInterval(() => { if (popup.closed) done(reject, Object.assign(new Error("Google sign-in was closed."), { code: "google/closed" })); }, 600);
    const timer = setTimeout(() => { try { popup.close(); } catch { /* ignore */ } done(reject, Object.assign(new Error("Google sign-in timed out."), { code: "google/timeout" })); }, 5 * 60 * 1000);
  });
}
