/* Settings and Help dialogs. */
import { $, esc, icon, openDialog, toast } from "./ui.js";
import { desktop, getApiKey, setApiKey, checkApiKey } from "./bridge.js";
import { prefs, savePrefs } from "./state.js";
import { actions } from "./actions.js";

export function applyTheme() {
  const dark = prefs.theme === "dark" || (prefs.theme === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function openSettings({ focusKey = true } = {}) {
  const key = getApiKey();
  openDialog({
    title: "Settings",
    subtitle: "Your AI key, appearance and data.",
    iconName: "settings",
    size: "",
    body: `
      <section class="settings-section">
        <h4>DeepSeek API key</h4>
        <div class="key-row">
          <div class="input-group">
            ${icon("key", "i-sm")}
            <input class="input" id="setKey" type="password" placeholder="sk-…" value="${esc(key)}" autocomplete="off" spellcheck="false" ${focusKey ? "autofocus" : ""} />
            <div class="input-suffix"><button type="button" class="icon-btn sm" id="setKeyEye" aria-label="Show or hide key">${icon("eye", "i-sm")}</button></div>
          </div>
          <button type="button" class="btn btn-secondary" id="setKeyTest">Test</button>
        </div>
        <div id="setKeyStatus" class="hidden"></div>
        <p class="hint">Stored ${desktop() ? "encrypted on this computer" : "in this browser"} and only ever sent to DeepSeek. Get a key at <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener">platform.deepseek.com</a>.</p>
      </section>
      <section class="settings-section">
        <h4>Appearance</h4>
        <div class="theme-pick">
          ${["light", "dark", "system"].map((t) => `<button type="button" class="theme-opt${prefs.theme === t ? " active" : ""}" data-theme-opt="${t}">
            <span class="theme-swatch ${t}"><i></i><i></i></span>${t === "system" ? "Match Windows" : t[0].toUpperCase() + t.slice(1)}</button>`).join("")}
        </div>
      </section>
      <section class="settings-section">
        <h4>Classroom games</h4>
        <label class="switch"><input type="checkbox" id="setSfx" ${prefs.sfx ? "checked" : ""} /><span class="track"></span><span class="sw-text">Sound effects<small>Chimes for right and wrong answers</small></span></label>
        <label class="switch"><input type="checkbox" id="setTts" ${prefs.tts ? "checked" : ""} /><span class="track"></span><span class="sw-text">Read words aloud<small>Uses the computer's English voice</small></span></label>
      </section>
      <section class="settings-section">
        <h4>Your data</h4>
        <p class="hint" id="setDataInfo">${desktop() ? "Units, settings and backups are saved on this computer." : "Units are saved in this browser's storage."}</p>
        ${desktop() ? `<div><button type="button" class="btn btn-secondary btn-sm" id="setDataFolder">${icon("folder", "i-sm")}Open data folder</button></div>` : ""}
      </section>`,
    foot: `<button type="button" class="btn btn-danger-ghost btn-sm" id="setKeyRemove" ${key ? "" : "disabled"}>Remove key</button>
      <span class="spacer"></span>
      <button type="button" class="btn btn-secondary" data-close>Close</button>
      <button type="button" class="btn btn-primary" id="setSave">Save</button>`,
    onMount(root, close) {
      const q = (s) => root.querySelector(s);
      const input = q("#setKey");
      const status = q("#setKeyStatus");
      const show = (cls, text) => {
        status.className = `key-status ${cls}`;
        status.innerHTML = `${icon(cls === "ok" ? "check-circle" : cls === "info" ? "info" : "alert", "i-sm")}<span>${esc(text)}</span>`;
      };
      q("#setKeyEye").addEventListener("click", () => { input.type = input.type === "password" ? "text" : "password"; });
      q("#setKeyTest").addEventListener("click", async () => {
        const k = input.value.trim();
        if (!k) { show("error", "Paste your key first — it starts with sk-."); return; }
        const btn = q("#setKeyTest");
        btn.classList.add("is-loading");
        btn.disabled = true;
        show("info", "Checking with DeepSeek…");
        try {
          const res = await checkApiKey(k);
          if (res.status === 200) {
            const body = JSON.parse(res.body || "{}");
            const info = (body.balance_infos || [])[0];
            const bal = info ? ` Balance: ${info.total_balance} ${info.currency}.` : "";
            if (body.is_available === false) show("warn", `The key works, but the balance is empty — top up to generate.${bal}`);
            else show("ok", `The key works.${bal}`);
          } else if (res.status === 401) show("error", "DeepSeek rejected this key — check you copied all of it.");
          else if (res.status === 502) show("error", "Couldn't reach DeepSeek — check your internet connection.");
          else show("error", `DeepSeek answered with an error (${res.status}).`);
        } catch (e) {
          show("error", e.message || String(e));
        } finally {
          btn.classList.remove("is-loading");
          btn.disabled = false;
        }
      });
      root.querySelectorAll("[data-theme-opt]").forEach((b) => b.addEventListener("click", () => {
        prefs.theme = b.dataset.themeOpt;
        savePrefs();
        applyTheme();
        root.querySelectorAll("[data-theme-opt]").forEach((x) => x.classList.toggle("active", x === b));
      }));
      q("#setSfx").addEventListener("change", (e) => { prefs.sfx = e.target.checked; savePrefs(); });
      q("#setTts").addEventListener("change", (e) => { prefs.tts = e.target.checked; savePrefs(); });
      q("#setDataFolder")?.addEventListener("click", () => desktop()?.openDataFolder());
      if (desktop()) {
        desktop().info().then((info) => {
          const p = q("#setDataInfo");
          if (p) p.textContent = `Saved in ${info.userData}`;
        }).catch(() => {});
      }
      q("#setKeyRemove").addEventListener("click", () => {
        setApiKey("");
        input.value = "";
        actions.setAiState();
        toast("API key removed.", "info");
        q("#setKeyRemove").disabled = true;
      });
      const save = () => {
        setApiKey(input.value);
        actions.setAiState();
        close();
        toast(input.value.trim() ? "Settings saved." : "Settings saved — add a key any time to use AI.", "ok", { ms: 2600 });
      };
      q("#setSave").addEventListener("click", save);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
    },
  });
}

export function openHelp() {
  const card = (ic, title, text) => `<div class="help-card"><span class="hc-ico">${icon(ic)}</span><div><h4>${title}</h4><p>${text}</p></div></div>`;
  const sc = (label, keys) => `<div><span>${label}</span><span>${keys.map((k) => `<kbd>${k}</kbd>`).join("")}</span></div>`;
  openDialog({
    title: "How Vocab Master works",
    subtitle: "Four steps from coursebook page to printed worksheets.",
    iconName: "graduation",
    size: "wide",
    body: `
      <div class="help-grid">
        ${card("book-open", "1 · Unit setup", "Pick the class level (A–E Senior) and a Cambridge Primary Path unit — the official words load instantly. Any other coursebook works too.")}
        ${card("list", "2 · Vocabulary", "Review the words. <strong>Fill everything with AI</strong> adds phrases, emojis and word families. Paste a list, drag to reorder, or describe the unit instead.")}
        ${card("layers", "3 · Exercises", "Use the smart mix or hand-pick formats. AI writes a Lingo Launcher study sheet, a Dictation test and an answer key.")}
        ${card("file", "4 · Preview & export", "Click any line on the sheet to edit it. Export Word + PDF, print, project it, or open the Lingo Arcade games.")}
      </div>
      <div class="settings-section">
        <h4>Keyboard shortcuts</h4>
        <div class="shortcut-list">
          ${sc("New unit", ["Ctrl", "N"])}
          ${sc("Print current sheet", ["Ctrl", "P"])}
          ${sc("Next step / generate", ["Ctrl", "Enter"])}
          ${sc("Go to step 1–4", ["Alt", "1–4"])}
          ${sc("Next word (word list)", ["Enter"])}
          ${sc("Move word up / down", ["Alt", "↑↓"])}
          ${sc("This guide", ["?"])}
          ${sc("Close a window", ["Esc"])}
        </div>
      </div>`,
    foot: `<button type="button" class="btn btn-ghost" id="helpSample">${icon("graduation", "i-sm")}Open the sample unit</button><span class="spacer"></span><button type="button" class="btn btn-primary" data-close>Got it</button>`,
    onMount(root, close) {
      root.querySelector("#helpSample").addEventListener("click", () => { close(); actions.loadSample(); });
    },
  });
}
