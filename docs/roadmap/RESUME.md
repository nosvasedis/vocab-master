# Resume guide — for any agent continuing this work

1. Read `docs/roadmap/PROGRESS.md` first: it says the current phase, the exact next command and any open questions for the user.
2. The full design is `docs/roadmap/PLAN.md`. Don't re-plan; continue it.
3. Work on branch `feature/lessons-experience`. End every phase or sub-phase with a checkpoint:
   - `npm test` passes and the phase's checks are done;
   - `PROGRESS.md` is updated (tick boxes, set "Next command");
   - commit `checkpoint: phase X — <summary>`.

## Setup
```bash
npm install                 # root (scripts + tests)
npm --prefix desktop install  # Electron app (only for desktop runs/builds)
```
- The web app runs with `npm start` (http://localhost:8787). The launch config is `.claude/launch.json` → "vocab-master-web".
- Tests: `npm test` (`node --test "tests/*.test.mjs"`).

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
| Packs | `node scripts/packs/build-packs.mjs` then `publish.mjs` | `build/packs/` |

(Scripts are added phase by phase; PROGRESS.md lists which exist.)

## Conventions
- Plain ES modules, no bundler. The renderer is shared by Electron (`app://`) and the web server (`proxy.js`).
- Match the existing code style: short header comment per file, `esc()` for every interpolated string, no frameworks.
- Lessons are JSON in `desktop/renderer/lessons/`. Never hand-edit `generatedBy`; set `status` to `approved` only after a human review.
