# Vocab Master — Desktop App (`desktop/`)

The Windows app for **Vocab Master (Teacher Studio 4.0.0)**, built with **Tauri 2** (Rust + the WebView2 that comes with Windows).

## Distributables (`desktop/release/`)

`npm run dist` builds:

1. **`Vocab-Master-Setup-4.0.0.exe`**: the installer (per user, no admin rights). Desktop and Start Menu shortcuts, an uninstaller in *Apps & Features*, and it keeps itself up to date.
2. **`Vocab-Master-Portable-4.0.0.exe`**: one exe with the pages inside. Runs without installing (USB sticks, locked-down school PCs).
3. `Vocab-Master-Setup-4.0.0.exe.sig` + `latest.json`: what installed apps read to update themselves (signed with `~/.tauri/vocab-master-updater.key`).

## Architecture

- **`src-tauri/`**: the app shell in Rust.
  - `src/lib.rs`: the window (size and position remembered in `window.json`), the commands behind `window.desktop`, the "pages started" watchdog, update checks
  - `src/protocol.rs`: the `app` scheme (`https://app.localhost/`) serving the pages, cross-origin isolated (for the Kokoro voice threads)
  - `src/assets.rs`: the pages, embedded in the release exe (a debug build reads `renderer/` from disk)
  - `src/live.rs`: live page updates from GitHub (`live/<commit>/`, rollback when pages don't start)
  - `src/exe.rs`: app updates (tauri-plugin-updater; the portable exe gets a download link)
  - `src/store.rs` / `src/keychain.rs`: `store.json`, `prefs.json`, encrypted keys (`keychain*.bin`, Windows DPAPI + AES-GCM, the format the Electron app used, so data carries over)
  - `src/net.rs`: DeepSeek and Gemini requests; `src/chatgpt.rs`: ChatGPT plan sign-in and generation (tokens never reach the pages); `src/google.rs`: Google sign-in for sync (loopback)
  - `src/pdf.rs`: HTML → A4 PDF with WebView2's Chromium (`Page.printToPDF`); `src/files.rs`: Save windows, packs, downloads
  - `shim/desktop.js`: `window.desktop` for the pages (Word files are built in the page with `renderer/vendor/docx`); `shim/smoke.js`: the smoke test
- **`renderer/`**: the whole app UI, also served by `../proxy.js` for the web version (see the root README).
- Data folder: `%APPDATA%\Vocab Master` (or the older `%APPDATA%\Lingo Launcher` when that is where the data is). `VM_USER_DATA=<folder>` runs against another folder.

## Commands

```bash
npm install          # the Tauri CLI (Rust itself: rustup, stable; Visual Studio C++ build tools)
npm start            # run the app (debug build)
npm run smoke        # end-to-end smoke test (fresh temporary data folder)
npm test             # the shell's Rust tests (cargo test)
npm run dist         # build the installer + portable exe into release/
```
