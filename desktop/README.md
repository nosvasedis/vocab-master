# Vocab Master — Desktop App (`desktop/`)

Native Windows desktop application for **Vocab Master (Teacher Studio 3.0)** built with Electron.

## Distributables (`desktop/release/`)

Running `npm run dist` inside `desktop/` produces two ready-to-share Windows executables:

1. **`Vocab-Master-Setup-3.1.0.exe`** — Full Windows NSIS Installer:
   - Lets the user choose the installation directory
   - Creates Desktop and Start Menu shortcuts
   - Registers a standard Windows Uninstaller in *Apps & Features*
2. **`Vocab-Master-Portable-3.1.0.exe`** — Standalone Portable Executable:
   - Runs directly without installation (ideal for USB sticks or restricted school PCs)

## Architecture

- **`main.js`** — Electron main process:
  - Custom `app://` protocol serving `renderer/` with zero CORS issues
  - Direct HTTPS proxy to `api.deepseek.com` (`deepseek:chat` & `deepseek:balance`)
  - Word `.docx` generation via `app.js` (`docx:export`, `docx:save`)
  - Native A4 PDF generation via Chromium `printToPDF` (`pdf:export`)
  - One-click Full Unit Pack folder export (`pack:export`)
  - Atomic JSON persistence (`store.json`) and DPAPI-encrypted API key storage (`keychain.bin`)
- **`preload.cjs`** — Context-isolated bridge exposing `window.desktop`
- **`renderer/`** — the whole app UI, also served by `../proxy.js` for the web version:
  - `index.html` — app shell (sidebar, views, icon sprite)
  - `styles/` — `base.css` (design tokens, controls, dialogs), `app.css` (layout & views), `arcade.css` (games)
  - `js/` — `main.js` (navigation, shortcuts, boot), `state.js`, `bridge.js` (desktop/web storage & IPC), `ui.js`, `dialogs.js`, and one module per view in `js/views/`
  - `arcade/` — Lingo Arcade shell, `deck.js` helpers, Web Audio `audio.js`, `fx.js`, and one module per game in `arcade/games/`
  - `app.js` + `coursebook-data.js` — the worksheet engine (AI prompts, validation, rendering, `.docx` builders) and the Cambridge Primary Path word bank
  - `assets/fonts/` — bundled Inter, Manrope and Fredoka (OFL) so the app looks the same offline

## Commands

```bash
npm install
npm start            # Run in development
npm run smoke        # Run automated headless smoke test suite
npm run dist         # Build both NSIS Setup Installer and Portable EXE
npm run dist:setup   # Build only NSIS Setup Installer
npm run dist:portable # Build only Portable EXE
```
