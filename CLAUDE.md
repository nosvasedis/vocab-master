# Vocab Master

**Before doing anything, read `docs/roadmap/PROGRESS.md`.** It holds the current phase and the exact next step of the lessons/live-games roadmap (`docs/roadmap/PLAN.md`). `docs/roadmap/RESUME.md` explains setup, secrets, budget rules and resumable jobs.

## What this is
An AI vocabulary and worksheet studio for Greek-L1 ESL classes (A–E Senior), built on the Cambridge Primary Path 1–3 word bank (`desktop/renderer/coursebook-data.js`). It includes Lingo Arcade (projector games) and, in progress, curated animated lessons and Kahoot-style live games.

## Run / test
- Web: `npm start` → http://localhost:8787 (`proxy.js` serves `desktop/renderer`)
- Desktop: `npm run desktop`; smoke test: `npm run smoke`
- Tests: `npm test`

## Layout
- `desktop/renderer/`: the single renderer (plain ES modules, no bundler). `js/main.js` is the shell, `app.js` the engine, `arcade/` the games, `js/views/` the screens, `js/voices/` the listening voices (Kokoro worker, Gemini studio voices; pure parts in `studio/`).
- `desktop/main.js`: Electron main (the `app://` protocol, IPC); `desktop/live-update.js` + `exe-update.js`: self-updating; `scripts/release.mjs`: `npm run release`. `proxy.js`: the web server and AI proxy.
- `scripts/`: Node build pipelines (lessons, audio, art, packs). `content/`: pipeline config. `work/state/`: resumable job state.

## Shipping (since 3.5.0 the app updates itself — details in `docs/roadmap/RESUME.md` → "Shipping changes to teachers")
- **`main` is production.** Every push to `main` that touches `desktop/renderer/**` reaches teachers' installed apps by itself (`desktop/live-update.js`: they fetch the changed files from GitHub and use them from their next start). So only push to `main` after `npm test` (and `npm run smoke` for anything that affects start-up) is green; put experiments on a branch.
- **No exe rebuild for page changes.** A new exe is needed only for shell changes: `desktop/main.js`, `preload.cjs`, `live-update.js`, `exe-update.js`, Electron/dependencies, or voice clips (`assets/audio/*.ogg` are not in Git). Then: bump `version` in `package.json` and `desktop/package.json` (and the exe names in both READMEs), commit, push, run `npm run release [-- --notes file.md]` (tests, build, package check, packaged smoke, GitHub release with `latest.yml` — installed copies update themselves). Never publish a release by hand without `latest.yml`.
- If new pages rely on new shell features (IPC, preload), raise `SHELL_API` in `desktop/live-update.js` **and** `desktop/renderer/live-requires.json` together, and release a new exe — older apps then wait for it instead of loading pages they can't run.
- The renderer must keep calling `window.desktop.updates.alive()` at start (`js/updates.js` → `initUpdates()` in `js/main.js`): without it the app treats the pages as broken and rolls back.

## Rules
- Never commit `.env.local` or print keys. Paid API calls must go through `scripts/lib/ledger.mjs`.
- End each roadmap phase with: tests green → PROGRESS.md updated → `checkpoint:` commit. The lessons work was merged into `main` on 2026-10-17; start new phases on a fresh branch off `main` and ask before merging.
