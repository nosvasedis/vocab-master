# Vocab Master

**Before doing anything, read `docs/roadmap/PROGRESS.md`.** It holds the current phase and the exact next step of the lessons/live-games roadmap (`docs/roadmap/PLAN.md`). `docs/roadmap/RESUME.md` explains setup, secrets, budget rules and resumable jobs.

## What this is
An AI vocabulary and worksheet studio for Greek-L1 ESL classes (A–E Senior), built on the Cambridge Primary Path 1–3 word bank (`desktop/renderer/coursebook-data.js`). It includes Lingo Arcade (projector games) and, in progress, curated animated lessons and Kahoot-style live games.

## Run / test
- Web: `npm start` → http://localhost:8787 (`proxy.js` serves `desktop/renderer`)
- Desktop: `npm run desktop`; smoke test: `npm run smoke`
- Tests: `npm test`

## Layout
- `desktop/renderer/`: the single renderer (plain ES modules, no bundler). `js/main.js` is the shell, `app.js` the engine, `arcade/` the games, `js/views/` the screens.
- `desktop/main.js`: Electron main (the `app://` protocol, IPC). `proxy.js`: the web server and AI proxy.
- `scripts/`: Node build pipelines (lessons, audio, art, packs). `content/`: pipeline config. `work/state/`: resumable job state.

## Rules
- Never commit `.env.local` or print keys. Paid API calls must go through `scripts/lib/ledger.mjs`.
- End each roadmap phase with: tests green → PROGRESS.md updated → `checkpoint:` commit on `feature/lessons-experience`.
