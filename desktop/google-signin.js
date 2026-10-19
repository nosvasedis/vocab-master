/* Vocab Master — Google sign-in for the desktop app (loopback hand-off).
 * app:// can't host Google's sign-in popup, so the main process:
 *   1. listens once on 127.0.0.1:<random port>,
 *   2. opens the system browser at the hosted sign-in page (firebase/public/signin.html) with that port
 *      and a random state value,
 *   3. accepts exactly one POST /callback whose state matches, and hands the Google ID token to the
 *      renderer, which signs in with signInWithCredential. Then the listener closes.
 * The token never touches disk or logs. Plain Node (no Electron imports), so tests can drive it.
 */
import http from "node:http";
import crypto from "node:crypto";

export const SIGNIN_URL = "https://vocab-master-live.web.app/signin.html";
const MAX_BODY = 64 * 1024;

const page = (title, text) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:system-ui,'Segoe UI',sans-serif;background:#160a45;color:#fff;display:grid;place-items:center;min-height:90vh;text-align:center">
<div><div style="font-size:64px">🦉</div><h1 style="margin:8px 0">${title}</h1><p style="font-size:18px;opacity:.8">${text}</p></div></body></html>`;

/**
 * @param {{ openExternal: (url: string) => Promise<void>|void, signinUrl?: string, timeoutMs?: number, onDone?: () => void }} opts
 */
export function createGoogleLoopback({ openExternal, signinUrl = SIGNIN_URL, timeoutMs = 5 * 60 * 1000, onDone = () => {} }) {
  let current = null;

  function finish(result) {
    if (!current) return;
    const { server, timer, resolve } = current;
    current = null;
    clearTimeout(timer);
    server.close();
    server.closeAllConnections?.();
    resolve(result);
    onDone(result);
  }

  function start() {
    if (current) finish({ ok: false, code: "google/replaced", error: "A newer sign-in started." });
    return new Promise((resolve) => {
      const state = crypto.randomBytes(24).toString("base64url");
      const server = http.createServer((req, res) => {
        if (req.method !== "POST" || req.url !== "/callback") {
          res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
          return;
        }
        let body = "";
        let tooBig = false;
        req.on("data", (c) => {
          body += c;
          if (body.length > MAX_BODY) { tooBig = true; req.destroy(); }
        });
        req.on("end", () => {
          if (tooBig) return;
          const form = new URLSearchParams(body);
          const got = Buffer.from(form.get("state") || "");
          const want = Buffer.from(state);
          const okState = got.length === want.length && crypto.timingSafeEqual(got, want);
          const idToken = form.get("id_token") || "";
          if (!okState || !idToken) {
            res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" }).end(page("That didn't work", "Start again from Vocab Master: Settings → Account."));
            return;
          }
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }).end(page("You're signed in", "You can close this tab and go back to Vocab Master."));
          finish({ ok: true, idToken });
        });
      });
      const timer = setTimeout(() => finish({ ok: false, code: "google/timeout", error: "Google sign-in timed out. Try again." }), timeoutMs);
      current = { server, timer, resolve };
      server.on("error", (err) => finish({ ok: false, code: "google/listen", error: `Couldn't start sign-in (${err.code || err.message}).` }));
      server.listen(0, "127.0.0.1", async () => {
        const { port } = server.address();
        try {
          await openExternal(`${signinUrl}?mode=loopback&port=${port}&state=${state}`);
        } catch (err) {
          finish({ ok: false, code: "google/browser", error: `Couldn't open the browser (${err?.message || err}).` });
        }
      });
    });
  }

  const cancel = () => finish({ ok: false, code: "google/cancelled", error: "Google sign-in was cancelled." });
  return { start, cancel };
}
