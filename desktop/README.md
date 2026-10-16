# Vocab Master — Desktop App (`desktop/`)

Native Windows desktop application for **Vocab Master (Teacher Studio 2.0)** built with Electron.

## Distributables (`desktop/release/`)

Running `npm run dist` inside `desktop/` produces two ready-to-share Windows executables:

1. **`Vocab-Master-Setup-2.0.0.exe`** — Full Windows NSIS Installer:
   - Lets the user choose the installation directory
   - Creates Desktop and Start Menu shortcuts
   - Registers a standard Windows Uninstaller in *Apps & Features*
2. **`Vocab-Master-Portable-2.0.0.exe`** — Standalone Portable Executable:
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
- **`renderer/`** — Teacher Studio 2.0 UI (`index.html`, `styles.css`, `renderer.js`, and shared `app.js`)

## Commands

```bash
npm install
npm start            # Run in development
npm run smoke        # Run automated headless smoke test suite
npm run dist         # Build both NSIS Setup Installer and Portable EXE
npm run dist:setup   # Build only NSIS Setup Installer
npm run dist:portable # Build only Portable EXE
```
