# Resume guide — for any agent continuing this work

1. Read `docs/roadmap/PROGRESS.md` first: it says the current phase, the exact next command and any open questions for the user.
2. The full design is `docs/roadmap/PLAN.md`. Don't re-plan; continue it.
3. Work on a fresh branch off `main` (feature/lessons-experience was merged into main on 2026-10-17). End every phase or sub-phase with a checkpoint:
   - `npm test` passes and the phase's checks are done;
   - `PROGRESS.md` is updated (tick boxes, set "Next command");
   - commit `checkpoint: phase X — <summary>`.

## Setup
```bash
npm install                 # root (scripts + tests)
npm --prefix desktop install  # Tauri CLI (desktop runs/builds also need Rust: rustup, stable)
```
- The web app runs with `npm start` (http://localhost:8787). The launch config is `.claude/launch.json` → "vocab-master-web".
- Tests: `npm test` (`node --test "tests/*.test.mjs"`) for the pages; `npm run test:shell` (`cargo test`) for the app shell.

## Secrets (`.env.local` at the repo root, gitignored)
| Variable | Used by | Notes |
|---|---|---|
| `GEMINI_API_KEY` | voice audition and audio builds | spend cap $3.60 (≈ €3.30) in `content/pricing.json` |
| `OPENROUTER_API_KEY` | lesson drafting | spend cap $2.00 |
| `CF_ACCOUNT_ID`, `CF_API_TOKEN` | art (Workers AI, free 10k neurons/day), R2 packs | token scope: Workers AI Edit + Workers R2 Storage Edit |

Never print, commit or bundle these. Scripts load them through `scripts/lib/env.mjs`.

## Money rules
- Every paid call goes through `scripts/lib/ledger.mjs`: it records the real usage in `work/state/ledger.json`, regenerates `docs/roadmap/BUDGET.md`, and refuses jobs that would cross a cap.
- Run every paid script with `--dry-run` first and check the estimate.
- Priority when money is short: voice audition → pilot lessons → all lesson narration → word-bank words → word-bank example sentences (only with leftovers; otherwise system voice).
- Gemini prices double on 2027-01-01. Finish the paid voice runs before then.

## Long-running jobs are resumable
State lives in `work/state/*.json` (committed). Re-running the same command continues where it stopped.
| Job | Command | State file |
|---|---|---|
| Lesson drafts | `node scripts/lessons/draft-lessons.mjs --book CPP1 --unit 1` | `work/state/lessons.json` |
| Validate lessons | `node scripts/lessons/validate-lessons.mjs` | — |
| Voice audition | `node scripts/audio/audition.mjs` | `work/audition/` (listen to `index.html`) |
| Audio build | `node scripts/audio/build-audio.mjs --dry-run` then without `--dry-run` | `work/state/audio.json` |
| Art (daily free quota) | `node scripts/art/build-art.mjs` | `work/state/art.json` |
| Publish clips to R2 | `node scripts/packs/publish.mjs` | `work/state/publish.json` |
| Desktop build | `npm run dist` then `npm run smoke` | `desktop/release/` |

(Scripts are added phase by phase; PROGRESS.md lists which exist.)

## Shipping changes to teachers
- **Pages (almost everything: `desktop/renderer/**`)**: commit and push to `main`. Installed apps fetch the changed files from GitHub within ~3 hours or at their next start (`desktop/src-tauri/src/live.rs`) and use them from the following start. No exe needed. Voice clips (`assets/audio/*.ogg`, not in Git) are the exception.
- **The app shell** (`desktop/src-tauri/**`: Rust, `shim/desktop.js` = `window.desktop`, Tauri/crate versions, voice clips): bump the version in `package.json` and `desktop/package.json` (and the README file names), commit, push, then `npm run release` (page + shell tests, build that checks the pages didn't change while embedded, the built app's smoke test, GitHub release with the Setup/Portable exes and signed `latest.json` — installed Setup copies update themselves). Releases are signed with the updater key `~/.tauri/vocab-master-updater.key` (never commit it; back it up — without it installed apps can't take new versions; its public half is in `tauri.conf.json`). If new pages need the new shell, raise `SHELL_API` in `desktop/src-tauri/src/live.rs` **and** `desktop/renderer/live-requires.json` together: older apps then wait for the new exe instead of loading pages they can't run.
- Test live updates without touching real data: `VM_USER_DATA=<temp folder> VM_LIVE=1 VM_LIVE_BRANCH=<branch> npm --prefix desktop start`, then Settings → Updates → Check now. `VM_DEBUG_PORT=9333` (debug builds only) opens the DevTools protocol so a script can drive the window.

## Conventions
- Plain ES modules, no bundler. The renderer is shared by the Tauri app (`app` scheme, `https://app.localhost/`) and the web server (`proxy.js`).
- Match the existing code style: short header comment per file, `esc()` for every interpolated string, no frameworks.
- Lessons are JSON in `desktop/renderer/lessons/`. Never hand-edit `generatedBy`; set `status` to `approved` only after a human review.
