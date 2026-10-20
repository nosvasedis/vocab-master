/* Start-up splash (a classic script, loaded in <head> before anything else).
 * 1. Sets the saved theme before the first paint, so a dark-mode teacher never sees a white flash. The desktop
 *    app's page keeps a copy of the settings in localStorage from the last run (js/bridge.js hydrateStorage).
 * 2. window.__splash — the boot (js/main.js) reports its steps and says when the app is ready:
 *      __splash.step("Syncing your account…", 40)   __splash.done()
 *    The splash (index.html #splash) stays at least a moment so it never just flickers, fades out, and is removed.
 *    If the boot never says done (an error), it leaves by itself so the page underneath is never hidden for good. */
(function () {
  var html = document.documentElement;
  try {
    var prefs = JSON.parse(localStorage.getItem("vm_prefs_v2") || "null") || {};
    var theme = prefs.theme || "system";
    var dark = theme === "dark" || (theme === "system" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    html.setAttribute("data-theme", dark ? "dark" : "light");
  } catch (e) { /* no saved settings yet: the page's default */ }
  html.classList.add("booting");

  var started = Date.now();
  var MIN_MS = 650;      // long enough to read as a splash, not a flicker
  var LEAVE_MS = 520;    // matches the fade-out in index.html
  var FAILSAFE_MS = 25000;
  var finished = false;
  var shown = 6;

  function el(id) { return document.getElementById(id); }

  function step(text, pct) {
    if (finished) return;
    var status = el("splashStatus");
    if (status && text) status.textContent = text;
    var bar = el("splashBar");
    if (bar && typeof pct === "number") {
      shown = Math.max(shown, Math.min(96, pct));
      bar.style.width = shown + "%";
    }
  }

  function done() {
    if (finished) return;
    finished = true;
    var wait = Math.max(0, MIN_MS - (Date.now() - started));
    setTimeout(function () {
      var splash = el("splash");
      var bar = el("splashBar");
      if (bar) bar.style.width = "100%";
      html.classList.remove("booting");
      if (!splash) return;
      splash.classList.add("out");
      splash.setAttribute("aria-busy", "false");
      setTimeout(function () { if (splash.parentNode) splash.parentNode.removeChild(splash); }, LEAVE_MS);
    }, wait);
  }

  window.__splash = { step: step, done: done };
  setTimeout(done, FAILSAFE_MS);
})();
