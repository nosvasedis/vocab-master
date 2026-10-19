/* Settings and Help dialogs. */
import { $, esc, icon, openDialog, toast } from "./ui.js";
import { desktop, getApiKey, setApiKey, checkApiKey, getProvider, setProvider, getChatGPT, PROVIDERS } from "./bridge.js";
import { chatgptSettingsHtml, mountChatGPTSettings } from "./chatgpt-settings.js";
import { prefs, savePrefs, soundPrefs } from "./state.js";
import { configureAudio, play } from "../arcade/audio.js";
import { PICTURE_STYLES } from "./pictures.js";
import { actions } from "./actions.js";
import { accountSectionHtml, mountAccount } from "./sync/account-ui.js";

export function applyTheme() {
  const dark = prefs.theme === "dark" || (prefs.theme === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

const PROVIDER_CARDS = {
  gemini: { tag: "Free", tagTone: "success", blurb: "Free tier with a Google AI Studio key — daily limits apply." },
  deepseek: { tag: "Pay as you go", tagTone: "", blurb: "Very low cost per unit; needs a topped-up DeepSeek account." },
  chatgpt: { tag: "Your plan", tagTone: "", blurb: "Connect ChatGPT and choose a model. Uses your plan's allowance." },
};

export function openSettings({ focusKey = true } = {}) {
  let provider = getProvider();
  // Keys being edited, per provider, until Save.
  const drafts = { deepseek: getApiKey("deepseek"), gemini: getApiKey("gemini") };
  let chatgptPanel;
  openDialog({
    title: "Settings",
    subtitle: "Your AI service, appearance and data.",
    iconName: "settings",
    size: "",
    body: `
      <section class="settings-section">
        <h4>AI service</h4>
        <div class="provider-pick">
          ${["gemini", "deepseek", "chatgpt"].map((id) => `<button type="button" class="provider-opt" data-provider="${id}" aria-pressed="false">
            <span class="po-top"><strong>${esc(PROVIDERS[id].name)}</strong><span class="badge ${PROVIDER_CARDS[id].tagTone}">${esc(PROVIDER_CARDS[id].tag)}</span></span>
            <span class="po-blurb">${esc(PROVIDER_CARDS[id].blurb)}</span>
            <span class="po-state" data-provider-state="${id}"></span>
          </button>`).join("")}
        </div>
        <div id="apiKeySettings">
        <label class="label" for="setKey" id="setKeyLabel"></label>
        <div class="key-row">
          <div class="input-group">
            ${icon("key", "i-sm")}
            <input class="input" id="setKey" type="password" autocomplete="off" spellcheck="false" ${focusKey ? "autofocus" : ""} />
            <div class="input-suffix"><button type="button" class="icon-btn sm" id="setKeyEye" aria-label="Show or hide key">${icon("eye", "i-sm")}</button></div>
          </div>
          <button type="button" class="btn btn-secondary" id="setKeyTest">Test</button>
        </div>
        <div id="setKeyStatus" class="hidden"></div>
        <p class="hint" id="setKeyHint"></p>
        </div>
        ${chatgptSettingsHtml()}
      </section>
      ${accountSectionHtml()}
      <section class="settings-section">
        <h4>Worksheets</h4>
        <div class="field">
          <label class="label" for="setSchool">School name <span class="opt">optional — printed at the top of every sheet</span></label>
          <input class="input" id="setSchool" maxlength="60" placeholder="e.g. Frontistirio English Plus" value="${esc(prefs.schoolName || "")}" autocomplete="off" />
        </div>
        <div class="field">
          <label class="label" for="setPics">Pictures <span class="opt">worksheets, Word files and games</span></label>
          <select class="select" id="setPics">${Object.entries(PICTURE_STYLES).map(([id, s]) => `<option value="${id}" ${prefs.pictureStyle === id ? "selected" : ""}>${esc(s.label)} — ${esc(s.hint)}</option>`).join("")}</select>
          <p class="hint">Pictures by <a href="https://openmoji.org" target="_blank" rel="noopener">OpenMoji</a> (CC BY-SA 4.0), <a href="https://github.com/microsoft/fluentui-emoji" target="_blank" rel="noopener">Microsoft Fluent Emoji</a> (MIT) and <a href="https://lucide.dev" target="_blank" rel="noopener">Lucide</a> (ISC).</p>
        </div>
      </section>
      <section class="settings-section">
        <h4>Appearance</h4>
        <div class="theme-pick">
          ${["light", "dark", "system"].map((t) => `<button type="button" class="theme-opt${prefs.theme === t ? " active" : ""}" data-theme-opt="${t}">
            <span class="theme-swatch ${t}"><i></i><i></i></span>${t === "system" ? "Match Windows" : t[0].toUpperCase() + t.slice(1)}</button>`).join("")}
        </div>
      </section>
      <section class="settings-section">
        <h4>Sound</h4>
        <div class="field">
          <label class="label" for="setVolume">Volume <span class="opt" id="setVolumeVal">${prefs.volume ?? 80}%</span></label>
          <div class="volume-row">
            ${icon("volume-off", "i-sm")}
            <input type="range" class="range" id="setVolume" min="0" max="100" step="5" value="${prefs.volume ?? 80}" aria-label="Volume" />
            ${icon("volume", "i-sm")}
            <button type="button" class="btn btn-secondary btn-sm" id="setSoundTest" data-sound="none">${icon("play", "i-sm")}Test</button>
          </div>
        </div>
        <label class="switch"><input type="checkbox" id="setUiSounds" ${prefs.uiSounds !== false ? "checked" : ""} /><span class="track"></span><span class="sw-text">Interface sounds<small>Soft clicks, page turns and chimes while you build worksheets</small></span></label>
        <label class="switch"><input type="checkbox" id="setSfx" ${prefs.sfx ? "checked" : ""} /><span class="track"></span><span class="sw-text">Game and lesson sounds<small>Chimes for right and wrong answers, timers, fanfares and Lingo Live music</small></span></label>
        <label class="switch"><input type="checkbox" id="setTts" ${prefs.tts ? "checked" : ""} /><span class="track"></span><span class="sw-text">Read words aloud<small>The recorded voice, or the computer's English voice</small></span></label>
        <div class="field">
          <label class="label" for="setSoundQuality">Sound quality <span class="opt">for older or slower computers</span></label>
          <select class="select" id="setSoundQuality">
            ${[["auto", "Automatic — lighter sound on slower computers"], ["high", "Rich — warm echo and fuller music"], ["light", "Light — lowest CPU use, best for old PCs"]].map(([v, l]) => `<option value="${v}" ${(prefs.soundQuality || "auto") === v ? "selected" : ""}>${l}</option>`).join("")}
          </select>
        </div>
      </section>
      <section class="settings-section">
        <h4>Your data</h4>
        <p class="hint" id="setDataInfo">${desktop() ? "Units, settings and backups are saved on this computer." : "Units are saved in this browser's storage."}</p>
        ${desktop() ? `<div><button type="button" class="btn btn-secondary btn-sm" id="setDataFolder">${icon("folder", "i-sm")}Open data folder</button></div>` : ""}
      </section>`,
    foot: `<button type="button" class="btn btn-danger-ghost btn-sm" id="setKeyRemove">Remove key</button>
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
      const where = desktop() ? "encrypted on this computer" : "in this browser";
      const renderProvider = () => {
        const p = PROVIDERS[provider];
        root.querySelectorAll("[data-provider]").forEach((b) => { b.classList.toggle("active", b.dataset.provider === provider); b.setAttribute("aria-pressed", String(b.dataset.provider === provider)); });
        q("#apiKeySettings").classList.toggle("hidden", provider === "chatgpt");
        q("#chatgptSettings").classList.toggle("hidden", provider !== "chatgpt");
        q("#setKeyRemove").classList.toggle("hidden", provider === "chatgpt");
        root.querySelectorAll("[data-provider-state]").forEach((s) => {
          if (s.dataset.providerState === "chatgpt") {
            s.textContent = getChatGPT().sharing ? "Plan connected" : getChatGPT().connected ? "Plan permission needed" : "Not connected";
            s.classList.toggle("has-key", getChatGPT().sharing);
            return;
          }
          s.textContent = drafts[s.dataset.providerState] ? "Key added" : "No key yet";
          s.classList.toggle("has-key", !!drafts[s.dataset.providerState]);
        });
        if (provider === "chatgpt") return;
        q("#setKeyLabel").textContent = `${p.name} API key`;
        input.placeholder = p.placeholder;
        input.value = drafts[provider];
        q("#setKeyRemove").disabled = !drafts[provider];
        status.className = "hidden";
        q("#setKeyHint").innerHTML = provider === "gemini"
          ? `Get a key at <a href="${p.keyUrl}" target="_blank" rel="noopener">${p.keyHost}</a>. Free tier limits or your project's billing apply. Eligible Google AI Pro developer credits can cover usage when activated for that project. Stored ${where}. The app sends your word lists and exercise instructions; avoid entering student data.`
          : `Stored ${where} and only ever sent to DeepSeek. Get a key at <a href="${p.keyUrl}" target="_blank" rel="noopener">${p.keyHost}</a>.`;
      };
      root.querySelectorAll("[data-provider]").forEach((b) => b.addEventListener("click", () => {
        if (provider !== "chatgpt") drafts[provider] = input.value.trim();
        provider = b.dataset.provider;
        renderProvider();
        if (provider === "chatgpt") chatgptPanel.load();
        else input.focus();
      }));
      input.addEventListener("input", () => {
        drafts[provider] = input.value.trim();
        q("#setKeyRemove").disabled = !drafts[provider];
        root.querySelector(`[data-provider-state="${provider}"]`).textContent = drafts[provider] ? "Key added" : "No key yet";
      });
      q("#setKeyEye").addEventListener("click", () => { input.type = input.type === "password" ? "text" : "password"; });
      q("#setKeyTest").addEventListener("click", async () => {
        const k = input.value.trim();
        if (!k) { show("error", `Paste your ${PROVIDERS[provider].name} key first.`); return; }
        const btn = q("#setKeyTest");
        btn.classList.add("is-loading");
        btn.disabled = true;
        show("info", `Checking with ${PROVIDERS[provider].name}…`);
        try {
          const res = await checkApiKey(k, provider);
          show(res.tone, res.message);
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
      // Sound settings apply at once, so the teacher hears the change.
      const applySound = () => { savePrefs(); configureAudio(soundPrefs()); };
      q("#setSfx").addEventListener("change", (e) => { prefs.sfx = e.target.checked; applySound(); if (prefs.sfx) play("correct"); });
      q("#setTts").addEventListener("change", (e) => { prefs.tts = e.target.checked; applySound(); });
      q("#setUiSounds").addEventListener("change", (e) => { prefs.uiSounds = e.target.checked; applySound(); });
      q("#setSoundQuality").addEventListener("change", (e) => { prefs.soundQuality = e.target.value; applySound(); });
      const volume = q("#setVolume");
      volume.addEventListener("input", () => {
        prefs.volume = Number(volume.value);
        q("#setVolumeVal").textContent = `${prefs.volume}%`;
        applySound();
      });
      volume.addEventListener("change", () => play("select"));
      q("#setSoundTest").addEventListener("click", () => {
        if (!prefs.volume) { toast("The volume is at 0%. Slide it up to hear sounds.", "info"); return; }
        play(prefs.sfx ? "correct" : "success") || play("success") || toast("Sounds are switched off. Turn on interface or game sounds.", "info");
      });
      q("#setDataFolder")?.addEventListener("click", () => desktop()?.openDataFolder());
      if (desktop()) {
        desktop().info().then((info) => {
          const p = q("#setDataInfo");
          if (p) p.textContent = `Saved in ${info.userData}`;
        }).catch(() => {});
      }
      q("#setKeyRemove").addEventListener("click", () => {
        setApiKey("", provider);
        drafts[provider] = "";
        renderProvider();
        actions.setAiState();
        toast(`${PROVIDERS[provider].name} key removed.`, "info");
      });
      const save = () => {
        if (provider !== "chatgpt") drafts[provider] = input.value.trim();
        setApiKey(drafts.deepseek, "deepseek");
        setApiKey(drafts.gemini, "gemini");
        setProvider(provider);
        prefs.schoolName = q("#setSchool").value.trim();
        prefs.pictureStyle = q("#setPics").value;
        savePrefs();
        actions.setAiState();
        actions.settingsSaved?.();
        close();
        toast(provider === "chatgpt" ? (getChatGPT().ready ? "Settings saved — using your ChatGPT plan." : "Settings saved — connect ChatGPT and choose a model to use AI.") : drafts[provider] ? `Settings saved — using ${PROVIDERS[provider].name}.` : `Settings saved — add a ${PROVIDERS[provider].name} key to use AI.`, "ok", { ms: 3000 });
      };
      q("#setSave").addEventListener("click", save);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
      renderProvider();
      chatgptPanel = mountChatGPTSettings(root, () => { renderProvider(); actions.setAiState(); });
      if (provider === "chatgpt") chatgptPanel.load();
      mountAccount(root);
    },
    onClose() { chatgptPanel?.close(); },
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
    foot: `<span class="spacer"></span><button type="button" class="btn btn-primary" data-close>Got it</button>`,
    onMount(root, close) {
    },
  });
}
