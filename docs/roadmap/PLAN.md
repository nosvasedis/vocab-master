# Vocab Master → curated lessons + live games

## Context
Today Vocab Master generates worksheets, and Lingo Arcade offers 5 projector games (flashcards, memory, spelling, quiz, taboo). The goal is a vocabulary teaching **experience**:
- curated, animated lessons for every unit of CPP1–3, with natural voice and beautiful illustrations;
- Kahoot-style live games that work with no phones (projector and teams);
- the same games with phones, which students join by QR code or PIN.

**Decisions made:**
- Lessons are pre-built with AI by a script, reviewed by the teacher, and bundled as JSON.
- Voice is pre-recorded with Gemini TTS, within a hard budget of **€3.50**.
- Illustrations come free from Cloudflare Workers AI.
- Audio and images ship as downloadable per-unit packs, so the installer grows by 0 MB.
- The phone relay is Firebase (Realtime Database plus Hosting, free tier).
- Phase 1 is the lesson player plus audio. Phase 2 is live phone mode.
- **Every phase ends with a checkpoint**, and everything is written down in the repo so another agent can continue.

**Facts from exploring the code:**
- The app is plain ES modules with no bundler. One renderer (`desktop/renderer`) serves both Electron (`app://`) and the web (`proxy.js`).
- Data is in `coursebook-data.js`: `CPP_BOOKS` (3 books × 9 units) and `CPP_WORDBANK` (~3,580 rows with `{id, bookId, unit, section, english, type, greek, example, emojis}`). Node can import it directly.
- A unit section holds 25–70 words, so each lesson teaches **8–14 focus words**.
- The arcade game contract `create(ctx) → {onKey, destroy}` and the pure helpers in `deck.js` can be reused.
- `audio.js` turns `speak()` off when sound effects are off. The CSP blocks Firebase. The servers have no MIME types for `.ogg`.
- Bug: `arcade.js:181` `firstPicture()` splits on `/s+/` instead of `/\s+/`.

## 0. Checkpoints, handoff and secrets (set up first)
- **Branch:** `feature/lessons-experience`.
  - First checkpoint commit: the pre-existing uncommitted work (the modified arcade, renderer and package files, plus `tests/` and `review-2026-10-17/`) as "WIP before lessons".
  - Not committed: `picture-samples/`, `_fixture.json` and `.claude/`.
- **`docs/roadmap/` (committed):**
  - `PLAN.md`: a copy of this plan.
  - `PROGRESS.md`: phase checklist; current phase and step; the **exact next command**; decisions taken; known issues.
  - `BUDGET.md`: generated from the ledger. Spend per provider and what's left.
  - `RESUME.md`: how a fresh agent continues: setup, `.env` keys needed, the commands for each phase, how to verify.
- **`CLAUDE.md` (new):** a short project guide. Its first line says "read `docs/roadmap/PROGRESS.md` before doing anything". It covers how to run, test and the conventions.
- **Checkpoint ritual at the end of every phase or sub-phase:**
  1. `npm test` passes and the phase's verification steps are done.
  2. `PROGRESS.md` is updated.
  3. A git commit with the message `checkpoint: phase X — <summary>`.
  4. Mid-phase, long runs (lesson drafting, audio, images) keep their own resumable state in `work/state/*.json` (committed, no secrets). An interrupted run continues exactly where it stopped.
- **Secrets:**
  - Your Gemini, OpenRouter and Cloudflare keys go in `.env.local` at the repo root. It is **gitignored and never committed or bundled into the app**. Scripts load it via `scripts/lib/env.mjs`.
  - `RESUME.md` names the variables (`GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `CF_ACCOUNT_ID`, `CF_API_TOKEN`), not their values.
  - You pasted the keys in chat, so **rotate them after the project**.
  - **Cloudflare token (you've given permission for me to create it):**
    - In Phase 0, I open `dash.cloudflare.com/profile/api-tokens` in the built-in browser.
    - If the dashboard asks you to sign in, you sign in yourself; I never type passwords.
    - I create a custom token named "vocab-master-build" with **Account → Workers AI: Edit and Workers R2 Storage: Edit only**, on your account only, with a 1-year expiry.
    - I save the token value and account ID straight into `.env.local` and don't repeat them in chat.
    - Fallback if the dashboard flow fails: `npx wrangler login` (you click Allow), and the scripts go through wrangler instead.

## 1. Budget and providers
| Need | Provider | Cost |
|---|---|---|
| Lesson text drafting (81 lessons) | **OpenRouter**, a cheap strong model (e.g. DeepSeek V4 Flash or Gemini Flash via OpenRouter); configurable | ≈ $0.50–2 total. The script reads the key's remaining credit at start and stops at a cap you set |
| Narration and dialogue voice (emotion matters) | **Gemini 3.8 Flash TTS**, Batch API | ~4 h ≈ 360k audio tokens ≈ $1.62 |
| Word voice (~3,600 words) | **Gemini 3.8 Flash-Lite TTS**, Batch API | ~1 h ≈ $0.27 |
| Text input to TTS (style prompts and text) | Gemini | ≈ $0.15–0.25 |
| Example sentences for the rest of the word bank (~3.4 h) | Flash-Lite Batch, **only if budget remains**. Otherwise the system voice. Optionally free Cloudflare MeloTTS, if it passes the audition | ≈ $0.92 or €0 |
| Illustrations | **Cloudflare Workers AI free tier** (10k neurons/day): `flux-2-klein-4b` ≈ 95 images/day or `flux-1-schnell` ≈ 170/day | €0, spread over days |
| Pack hosting | **Cloudflare R2**: 10 GB free, free egress | €0 |
| Phone relay | Firebase Spark | €0 |

**Hard cap:** Gemini spending is capped at **$3.60 (≈ €3.30)**, leaving a safety buffer.
- `scripts/lib/ledger.mjs` records the **actual** `usageMetadata` token counts after every call and batch.
- It prices them with a table in `content/pricing.json`.
- It refuses any job whose estimate would cross the cap.
- Work runs in priority order: audition → pilot lessons → all lesson narration → words → leftover examples.
- If the key turns out to be on the free tier, TTS is free but rate-limited (and has no Batch API). The script detects this and runs slowly but at €0.
- Rates double on 1 Jan 2027, so the paid voice runs must finish before then.

## 2. Lesson content (bundled JSON)
- Each unit gets **3 lessons**: Big Question, Part A and Part B, so 81 lessons in total.
  - Each lesson is a file such as `desktop/renderer/lessons/CPP1/U1-A.json`.
  - A catalog lists them all: `lessons/index.json`.
- The schema (v1) holds:
  - `id, bookId, unit, section, title, bigQuestion, profile, durationMin, status (draft|reviewed|approved), locked[], generatedBy`
  - `cast` (the mascot "Lingo" and characters, each with a voice and a persona style)
  - `focusWords[] {wordId, emoji override, art?, kidDefinition, examples, distractors, greekHint}`
  - `extensionWords[]`, `scenes[]`
- Every line is `{id, text, who?, style?}` with a stable id. Audio keys use the form `l:<lesson>:<scene>:<line>`.
- Scene types (each press of Next advances one step):

| type | what happens |
|---|---|
| `hook` | Illustrated backdrop and characters, narration, then a question to the class |
| `reveal` | For each word: the picture pops in, the word is spoken, an example is shown with the word highlighted, then a pause for the class to repeat it. Greek is shown on tap, after the word, or never |
| `story` | Illustrated comic panels with speech bubbles and phrase-by-phrase karaoke highlighting |
| `check` | Pick the picture / fill the gap / true-false / odd one out / listen. Each runs think, then commit, then reveal, then explain. These items also feed the Phase 2 quiz |
| `practice` | Mounts an existing arcade game with the lesson's words |
| `speak` | Oracy prompt, sentence frames, partner timer, model answer, with scaffolds per level |
| `recap` | Word parade, badge, confetti, exit ticket |

- The per-word emoji override and `art` fix bad word-bank emojis without editing the official data.

## 3. Generator and review (`scripts/lessons/`)
- `scripts/lib/ai.mjs` calls OpenRouter (default) or Gemini in JSON mode, with retry and cost tracking in the ledger.
- `lib/lesson-schema.mjs` is a pure validator shared by the script, the tests and the app's draft badge. It checks:
  - every word id exists and belongs to the right book, unit and section;
  - each focus word appears in the story or an example and in at least one check item;
  - the answer is among the options, distractors share its part of speech, and no Greek answer leaks into the prompt;
  - sentence length suits the level, and practice games have enough words (`minWords`);
  - approved lessons have every audio clip and image they need.
- `draft-lessons.mjs --book --unit --section [--force]`:
  - asks the model to pick focus words by id;
  - retries up to 3 times, feeding the validation errors back;
  - never overwrites reviewed lessons or `locked` fields;
  - records its progress in `work/state/lessons.json`.
- **Review loop:** draft → `git diff` → teacher edits and previews in the app (with a "Show drafts" toggle) → `approved` → `npm test`.
- **Pilots first:** CPP1-U1, CPP2-U1 and CPP3-U1.

## 4. Illustrations (free, Cloudflare Workers AI)
- `scripts/art/build-art.mjs` calls Workers AI over REST (`CF_ACCOUNT_ID`, `CF_API_TOKEN`).
  - One **style bible** (`content/art-style.json`) is prepended to every prompt, for example "flat vector children's-book illustration, soft pastel palette, rounded shapes, no text".
  - Fixed seeds keep the look consistent.
- **What it draws, in priority order:**
  1. About 12 generic backdrops (home, school, park, city, beach, forest, kitchen, space…).
  2. One hero scene per unit (27).
  3. Story-panel backdrops per lesson.
  4. Focus-word picture cards (~1,000), taking about 10 days of free quota.
- **Budget:** it tracks the neurons it uses per day, stops at about 9,500, and resumes the next day from `work/state/art.json`.
- **Output:** WebP at 1024² for backdrops and 512² for cards, quality ~70 (about 40–80 KB each), going into the unit packs.
- **Review:** `review-art.mjs` builds a contact sheet. You click to reject an image, and a later run redraws it with a new seed.
- **Fallback:** emoji and the existing picture packs, so a missing image never breaks anything.
- **The mascot "Lingo" stays a hand-built inline SVG** so it can animate (poses and lip-sync).

## 5. Natural voice (Gemini TTS)
- **Step 0: voice audition, costing about $0.05.** `scripts/audio/audition.mjs` voices about 25 hard samples and writes `work/audition/index.html` for you to listen to.
  - Samples: single words, sentences, a 2-voice dialogue, a Greek gloss.
  - Engines: Flash vs Flash-Lite, plus free MeloTTS for comparison.
  - **You pick** the voices and which engine does what. The choices are saved in `content/voices.json`.
- **`scripts/audio/build-audio.mjs`:**
  - Each line gets a style direction by type:
    - `word`: clear, warm, slightly slower, as if introducing it.
    - `example`: natural classroom pace.
    - `narration`: storyteller.
    - `dialogue`: the character's persona; 2-speaker requests.
    - `ui`: upbeat.
  - One clip per request, sent through the Batch API. Story lines are voiced **phrase by phrase**, which also drives the karaoke.
  - Encoding: ffmpeg-static (a dev dependency only) trims silence, normalises loudness, and encodes Opus at 16 kbps mono.
  - Each file is named `sha1(model|voice|style|text)`, so unchanged lines are never re-voiced, and every job goes through the ledger cap.
  - Flags: `--only`, `--dry-run` (prints clip count, **€ estimate** and MB), `--prune`, `--retake <key>`.
  - QA: automatic duration-vs-text checks. `review.mjs` builds a listening page per lesson where one click marks a clip for retake.
- **Runtime: `arcade/voice.js` (new).** It loads the manifest and provides `playClip(key)` (its own gain and analyser nodes, ignoring the sound-effects toggle, with an LRU cache), `preload`, `stopVoice`, `hasClip` and `ensurePack(unit)`. The pure lookup logic lives in `arcade/voice-index.js`.
- **`audio.js speak()`:** it looks the text up in the manifest and plays the clip. Otherwise it falls back to speechSynthesis. **All 5 existing games get the new voice without any changes.**

## 6. Packs and delivery (0 MB added to the installer)
- **Packs:** `scripts/packs/build-packs.mjs` writes one zip per unit (`CPP1-U1.zip`, audio plus images, about 3–6 MB), plus `core.zip` (UI phrases and backdrops) and a `manifest.json` (`{entries:{key:{f,d,pack}}, text:{norm:key}}`).
- **Upload:** `publish.mjs` uploads them to **Cloudflare R2**, with public access, CORS and immutable cache headers. The R2 MCP connection can create the bucket. GitHub Releases is the fallback.
- **Desktop:**
  - The first time a unit opens, IPC `voice:ensurePack` downloads its pack and unzips it with JSZip (already a dependency) into `userData/packs/`.
  - `app://…/packs/*` serves the files, with a path-traversal guard.
  - Settings has a **"Download all for offline (~100–150 MB)"** button with a progress bar.
- **Web:** files stream from R2 into the Cache Storage API, and the same button pre-fills the cache.
- **Pre-fetch:** opening the Lessons home fetches the packs for the selected unit in the background.
- **Offline with no pack yet:** the system voice and emoji are used. Nothing breaks.

## 7. Lesson player (`desktop/renderer/lesson/`)
- **`lesson.js`:** `openLesson(id)` opens a full-screen overlay in `#overlayRoot`. It ensures the unit's pack is there and preloads the next 2 scenes.
- **`player.js`:** the `{scene, step}` sequencer.
  - Space, → and PageDown go forward; ←, PageUp go back (so presentation clickers work).
  - R replays the audio, G toggles Greek, P pauses, F goes full screen, Esc exits.
  - A dot map at the bottom jumps between scenes. An `onStep` event lets the Phase 2 host follow along.
- **`scenes/*.js`:** each exports `mount(ctx, scene) → {steps, step(i), destroy}`.
- **`stage.js`:** a 1920×1080 virtual canvas scaled to the projector, with parallax layers (AI backdrops plus emoji/picture props).
- **`mascot.js`:** the SVG owl "Lingo" with poses. Its mouth moves with the narration volume.
- **Animation:** vendored GSAP 3 core ESM (`vendor/gsap/`; free, no bundler needed). All of it goes through `lesson/motion.js`.
  - "Calm motion" and `prefers-reduced-motion` both jump straight to end states.
  - Also add a reduced-motion block to `arcade.css`.
- **Arcade reuse:** move the ctx building in `startGame()` into `arcade/host.js` as `mountGame(def, {stage, deck, teams, picture, onFinish})`. Both the arcade and `scenes/practice.js` then use it.

## 8. UI integration
- **`index.html`:** a **Lessons** sidebar item above Lingo Arcade, a view section for it, `styles/lesson.css`, and (in Phase 2) the CSP change.
- **`js/main.js`:**
  - `VIEW_META.lessons` and rendering of the view;
  - the keydown guard also checks `isLessonOpen()`;
  - `openLesson` exposed on `actions` and `window.__VM__`;
  - fix for `firstPicture`.
- **`js/views/lessons.js`:**
  - book tabs and a 3×3 unit grid showing the hero art, title and Big Question;
  - per unit, 3 lesson chips with a draft/approved badge;
  - per lesson, three buttons: **Teach**, **Games with these words** (`openArcade` with a deck built by `buildArcadeDeck`), **Live quiz** (Phase 2).
- **Settings (`dialogs.js`):** Calm motion; Voice (studio / system); Download all for offline; Live server config.

## 9. Phase 2: Kahoot-style live games
- **`live/host.js`:** the projector screens.
  - Lobby with QR code and PIN, question, answer histogram, leaderboard, podium.
  - Built on a transport interface.
  - Questions come from lesson `check` items or from `buildDetectiveQuestions(deck)`.
- **`NullTransport` (no-phones mode), built first:** think → commit → reveal, students hold up A/B/C/D cards, and the teacher taps the teams that got it right.
- **`FirebaseTransport`:**
  - The Firebase ESM SDK is vendored by `scripts/vendor-firebase.mjs`.
  - Anonymous auth, presence via `onDisconnect`, server timestamps.
- **Scoring (`live/scoring.js`, pure):** `1000 × (1 − 0.5·t/T)` plus a streak bonus. A team's score is the average of its members.
- **Phone client (`desktop/renderer/play/`):**
  - About 30 KB, deployed to **Firebase Hosting**.
  - Flow: QR `?pin=` → nickname and avatar → 4 coloured shapes → locked in → result and rank.
  - QR codes come from Nayuki's generator, vendored.
- **RTDB layout** under `rooms/{pin}/`:
  - `meta`, `state`
  - `questions`, with no answers included
  - `reveal`, `players`
  - `scores`, written by the host only
  - `answers`, write-once and accepted only during the question phase
  - `roomIndex` is used to sweep stale rooms.
- **Rules:** `firebase/database.rules.json`.
- **Room lifecycle:** rooms expire after 3 h and are deleted when the game ends.
- **CSP:** widen `connect-src` in `index.html` to the Firebase domains.
- **Modes:** Classic, Team, No phones. Later, a lesson's `check` scenes can be pushed to phones.

## 10. Phases and checkpoints
| Phase | Work | Checkpoint = done when |
|---|---|---|
| 0 | Branch, WIP commit, `docs/roadmap/*`, `CLAUDE.md`, `.env.local` plus env loader, ledger; fix `firstPicture`; reduced-motion CSS; extract `arcade/host.js`; test glob `tests/`; MIME types | Arcade unchanged, tests green, `RESUME.md` complete |
| 1a | Schema, validator, AI client, generator; 3 pilot lessons drafted (OpenRouter) | `npm test` validates the pilots; spend recorded |
| 1b | Lessons view, player, 7 scenes, stage, mascot, `motion.js` (emoji art, system voice) | Pilots playable end to end in the browser preview |
| 1c | Voice audition → **you pick** → pilot audio, then all lesson narration, then words (Batch, capped); `voice.js`; `speak()` delegation | Pilots voiced; arcade uses the new voice; ledger ≤ cap |
| 1d | Art pipeline: backdrops and unit heroes, then pilot story panels (free daily quota) | Pilots illustrated; contact sheet reviewed |
| 1e | Packs, R2 publish, pack download (desktop and web), offline button | Installer size unchanged; offline test passes |
| 1f | Draft and review the remaining 78 lessons; audio within the leftover budget; art over the following days | All approved; packs published |
| 2a | Live host plus no-phones mode | Quiz from any deck or lesson |
| 2b | Firebase, rules, SDK, play page, QR | 30 phones play |
| 2c | Team mode, reconnection, check scenes on phones, load test | Classroom pilot |
| 3+ | New games, review queue, progress tracking | — |

## Critical files
- **New:**
  - `docs/roadmap/{PLAN,PROGRESS,BUDGET,RESUME}.md`, `CLAUDE.md`, `.env.local` (gitignored)
  - `scripts/lib/{env,ai,ledger}.mjs`
  - `scripts/lessons/**`, `scripts/audio/{audition,build-audio,review}.mjs`, `scripts/art/{build-art,review-art}.mjs`, `scripts/packs/{build-packs,publish}.mjs`
  - `content/{voices,pricing,art-style,pronunciations,ui-phrases}.json`, `work/state/*.json`
  - `desktop/renderer/lesson/**`, `js/views/lessons.js`, `styles/lesson.css`, `lessons/**`
  - `arcade/{host,voice,voice-index}.js`, `vendor/{gsap,qrcode}`
  - Phase 2: `live/**`, `play/**`, `firebase/`, `firebase.json`
- **Modified:**
  - `arcade/arcade.js`, `arcade/audio.js`
  - `js/main.js`, `index.html`, `js/dialogs.js`
  - `desktop/main.js` (MIME types, `packs/` route, `voice:ensurePack` IPC, smoke test)
  - `desktop/preload.cjs`, `js/bridge.js`
  - `proxy.js`, root `package.json`, `.gitignore`

## Verification
- **`npm test` (`node --test tests/`):**
  - lessons pass the validator and the catalog matches the files;
  - voice-index normalisation and lookup;
  - ledger cap enforcement (a job over the cap is refused);
  - the deck emoji fix;
  - Phase 2: scoring and the phase reducer.
- **Electron `--smoke`:** open Lessons, open `CPP1-U1-BQ`, advance 3 steps, check the manifest loads, the pack unpacks into userData, and a clip is served as `audio/ogg`.
- **Browser preview (`vocab-master-web`):**
  - play a pilot end to end;
  - check the console for errors;
  - test at 1920×1080 and 1366×768;
  - test with reduced motion on;
  - test offline before and after "download all".
- **Before every paid run:** `--dry-run` shows the € estimate, and `BUDGET.md` is updated afterwards.

## Risks
- **Budget is tight (€3.50):**
  - The ledger cap and priority order guarantee that the most valuable audio (lesson narration and words) is made first.
  - Word-bank example sentences may stay on the system voice unless money is left over.
  - The OpenRouter balance is unknown until the first script run; the script reads it and asks before spending.
- **Single words and TTS:** this is the weak spot for every engine. Mitigations: a word style prompt, the audition, pronunciation overrides, duration QA, retakes. Approved clips are frozen by their hash.
- **Free art quota:** about 95–170 images per day means the full focus-word card set takes about 1–2 weeks of daily runs (resumable). Backdrops and heroes come first, and emoji stay as the fallback.
- **AI art consistency:** handled with the style bible, fixed seeds and the contact-sheet review. No text in images.
- **Firebase free tier:** 100 simultaneous connections. School networks may block Firebase, so no-phones mode is always available.
- **iPad/Safari and Ogg Opus:** add an `.m4a` variant if iPads are used.
- **Minors' privacy:** nicknames only, no stored history, rooms deleted when the game ends.
