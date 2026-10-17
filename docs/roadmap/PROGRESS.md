# Progress — lessons & live games roadmap

**Branch:** `feature/lessons-experience` · **Plan:** `PLAN.md` · **How to resume:** `RESUME.md` · **Spend:** `BUDGET.md`

## Current state (2026-10-17, end of session 1)
- **Done:**
  - 81 draft lessons, all valid;
  - lesson player, Lessons view and the arcade games;
  - audio for all words and all story dialogue, plus the pilot dialogue;
  - 43 AI illustrations;
  - R2 delivery (`vocab-master-media`, public base in `content/delivery.json` and `desktop/renderer/assets/remote.json`);
  - desktop installer and portable exe rebuilt 17:18 (smoke test passes).
- **Automatic:** the scheduled task "Vocab Master: daily Lingo narration" runs daily at 10:33 local. Each run voices about one day's quota of Lingo narration, publishes it to R2, commits and pushes. Installed apps pick up the new clips through the remote manifest, with no rebuild. Narration should finish in about 3 days (≈ $2.85 of the remaining Gemini cap).
- **Voices:**
  - Lingo = designed lingo_f (Flash-Lite, standard API, chunked);
  - words = en-gb-tutor-6 (batch);
  - characters = varied role pools; studio-voice dialogue goes through OpenRouter;
  - Greek = el-gr-assistant-5 (Greek glosses not voiced yet).
- **Spend:** Gemini $0.48 of $3.60 · OpenRouter ≈ $1.05 of $3.00 · Cloudflare free tier.
- **Waiting on the user:** a teacher read-through of the lessons (all are `status: draft`; set `approved` when happy).
- **Next work for an agent (in order):**
  1. After narration completes: rebuild the app, and optionally exclude bundled `.ogg` from the installer (`desktop/package.json` files: `"!renderer/assets/audio/**/*.ogg"`), since clips stream from R2 and are cached.
  2. Per-lesson story-panel art and focus-word picture cards (`build-art.mjs`, free daily neurons).
  3. Settings toggle "Calm motion"; voice Greek glosses (`--only greek`, batch, cheap).
  4. Phase 2: live Kahoot-style games (no-phones host first, then Firebase phone mode). See PLAN §9.
- **Known:** the local router (fritz.box) cached a negative DNS answer for the brand-new r2.dev host; it expires by itself. Content was verified through Cloudflare's IP.

## Pedagogical revision "show what you say" (2026-10-17 evening, from the user)
- **User's requirements:** everything a lesson says must be visible; lessons must be pedagogically exact; visuals calmer; a new Lingo voice recorded now; no scheduled tasks (the daily task was deleted).
- **Schema:** `props` ({emoji,label}) on story panels, hook scene/lines and quiz items. `visibilityIssues()` uses `content/visual-lexicon.json` (picturable nouns, built by `scripts/lessons/build-lexicon.mjs`), plus backdrop words and cast words. A test enforces 0 unshown mentions in every lesson. Focus-word pictures must be unique per lesson.
- **Pipeline (all re-runnable):**
  - `revise-lessons.mjs` (Claude Haiku 5.5 with a strict rubric);
  - `qa-checks.mjs` (DeepSeek V4.1 Flash, the user's choice; one right answer, topic distractors);
  - `polish-lessons.mjs` (backdrop from caption, missing props);
  - `fix-pictures.mjs` (hand-reviewed picture fixes after auditing all 810 word pictures).
  - `print-lesson.mjs <id>` prints a lesson as a readable script for review.
- **Player:**
  - labelled prop shelf that lights up with the spoken word;
  - `ctx.picFit` sizes 1–5 emoji compositions;
  - calmer motion (no endless floats or drifts; fly-ins animate an inner wrapper so characters don't jump);
  - new owl beak/mouth with `svgOrigin` pivots, and a talking flap for system voices.
- **New settings:** 16 backdrops (cave, snow, zoo, river, museum, mountain, jungle, underwater, bedroom, library, station, volcano, savanna, camp, castle, market). They have procedural scenes now; **AI art is not generated yet**, because the free Workers AI allowance was used up. Run `node scripts/art/build-art.mjs --only backdrops` after 00:00 UTC.
- **Voice:** Lingo = `en-gb-tutor-6` (also the words voice). Everything is recorded through the Gemini Batch API (`voices.json` `forceBatch`), with no daily cap. Characters use studio/library voice pools.

## Fixes after the first classroom test (2026-10-17, from the user)
- **Silent lessons and bubbles skipping:** the lessons obeyed the arcade's "read words aloud" pref, which the user had set off. Lesson narration now has its own toolbar switch (on by default; the arcade pref is restored on close). When muted, lines still pause for reading time (`narrator.readSilently`).
- **Owl bubble covered the game's Play button:** a z-index put the actors-layer bubble above the UI layer. Removed. Game intro lines are now read inside the game card.
- **Greek always visible / ΕΛ did nothing:** reveal auto-armed Greek. Greek is now hidden by default and only shown via ΕΛ / G. Games inside lessons get a Greek-free deck unless Greek is on. Memory falls back to picture mode.
- **Debugging the desktop build:** `work/debug-app` is a copy of desktop/main.js under a different app name (avoids the single-instance lock). Run it with `desktop/node_modules/.bin/electron work/debug-app --remote-debugging-port=9333`, then `node work/tmp/cdp.mjs "<js>"`. Never kill processes by window title (that closes the user's own app).

## Phase 0: foundation ✅ (checkpoint 86d6938)
- [x] Branch `feature/lessons-experience` (the earlier WIP was already committed on main as 57a7f53)
- [x] `docs/roadmap/{PLAN,PROGRESS,RESUME}.md`, `CLAUDE.md`
- [x] `.env.local` (gitignored) with the Gemini and OpenRouter keys; `scripts/lib/env.mjs`
- [x] Spend ledger `scripts/lib/ledger.mjs`, pricing and caps in `content/pricing.json`, `tests/ledger.test.mjs`
- [x] Fixed the `firstPicture` regex (`firstEmoji` in deck.js, with a test)
- [x] Extracted `arcade/host.js` (`mountGame`); the arcade uses it (checked in the browser)
- [x] Test glob `tests/*.test.mjs`; MIME types (ogg/opus/mp3/wav/webp/jpg/zip) in `proxy.js` and `desktop/main.js`
- [x] Reduced-motion CSS is already global in `base.css`. A `calm-motion` class comes with the lesson player
- [ ] Cloudflare API token (**blocked**, see Current state)

## Phase 1a: lesson content pipeline ✅ (checkpoint fcbf39b)
- [x] Schema and validator in `desktop/renderer/lesson/schema.js` (shared by app and scripts), plus `tests/lessons.test.mjs`
- [x] `scripts/lib/ai.mjs` (OpenRouter JSON mode, costs in the ledger). Models are in `content/models.json` (Claude Haiku 5.5, about $0.008 per lesson)
- [x] `scripts/lessons/draft-lessons.mjs` (validate → fix-retry ×3, seeded answer shuffle, `locked` fields kept), `validate-lessons.mjs`, `lib/{prompt,catalog}.mjs`
- [x] 9 pilots drafted (CPP1/2/3 unit 1 × BQ/A/B), $0.076 total

## Phase 1b: lesson player ✅
- [x] **Lessons view:** sidebar "Lessons" → `js/views/lessons.js`, with book tabs, a 3×3 unit grid, and Teach / Games buttons per lesson
- [x] **Player:** `lesson/player.js`
  - full-screen overlay with a scaled 1920×1080 stage;
  - keys: Space/→/PageDown, ←/PageUp, R, G, A, F, Esc;
  - scene map, class stars, finish screen;
  - `ctx.live()` guards narration chains when the teacher skips ahead
- [x] **Other modules:**
  - `lesson/stage.js`: procedural illustrated backdrops for 16 settings, with an `artUrl` hook for AI art
  - `mascot.js`: SVG owl with blink, poses and lip-sync
  - `motion.js`: the only GSAP user, with calm mode
  - `narrator.js`: recorded clip if available, else system voice with karaoke boundaries; `setClipPlayer()` hook for Phase 1c
- [x] **7 scenes** in `lesson/scenes/`. The practice scene embeds the arcade game through `mountGame`, scaled ×1.4
- [x] **Data:** `lesson/lesson.js` (catalog, joins words with the bank, deck); `arcade/audio.js` gained `speakAsync`
- [x] **GSAP 3.15.0** core vendored in `desktop/renderer/vendor/gsap/`
- [x] **Verified in the browser preview:** all 9 pilots play start to finish (37–49 steps each), with no console errors on fast forward/back
- [ ] **Later polish:** a "Calm motion" toggle in Settings (`prefs.calmMotion` is already read by `teachLesson`); a header layout for narrow windows

## Phase 1c: voice (in progress)
Follows the user-supplied Gemini 3.8 Flash TTS developer guide:
- verbatim `text`, with direction in a per-turn `speech_metadata.style`;
- inline `<tags>`, IPA in `/slashes/`, conversational mode for 2 prebuilt voices;
- Voice Design for custom voices.

**API facts learned by probing (2026-10-17):**
- Interactions API (`POST /v1beta/interactions`) reports real usage (`usage.total_output_tokens`, 25 tokens per second of audio).
- `generateContent` + `batchGenerateContent` also work for 3.8 TTS, at half price. They accept studio voices (Sulafat…) and library voices (en-gb-tutor-6…), but **not designed `voice_…` ids** and **not style**. A 2-clip batch finished in under 3 minutes; results are under `metadata.output.inlinedResponses.inlinedResponses`.
- Voice Design rejects child voices (safety policy). Child characters use youthful studio voices (Puck, Fenrir, Leda, Laomedeia).

**Done so far:**
- [x] `scripts/lib/gemini-tts.mjs` (Interactions client, voices list, ledger)
- [x] `scripts/audio/audition.mjs`: designed lingo_f, lingo_m and grandma (ids in `content/voices.json`), plus 48 clips for $0.05. Published as an Artifact: https://claude.ai/artifact/K8178vE61HfYL1ZjEndMxe (local copy: `work/audition/index.html`)
- [x] `scripts/audio/build-audio.mjs`:
  - routing: style or designed voice → standard; otherwise → batch;
  - Opus 20 kbps, silence trim, loudnorm;
  - manifest at `desktop/renderer/assets/audio/manifest.json`;
  - `--dry-run`, `--collect`, `--retake`, `--narrator <voice>`
- [x] `arcade/voice.js` + `voice-index.js`: clip player with lip-sync level, wired into the narrator and into `speak()`, so the arcade gets the recorded voice too. `tests/voice.test.mjs`
- [ ] **Waiting on the user's voice picks.** Measured cost with a studio/library narrator (batch) and style only on dialogue: pilots $0.28, all 81 lessons ≈ $2.55, words ≈ $0.22. A designed narrator forces the standard API, so 81 lessons ≈ $4.60, which is over the cap.
- [ ] After the picks, update `content/voices.json` (`cast.*`, `picked: true`), then:
  `node scripts/audio/build-audio.mjs --lessons CPP1-U1-BQ,CPP1-U1-A,CPP1-U1-B,CPP2-U1-BQ,CPP2-U1-A,CPP2-U1-B,CPP3-U1-BQ,CPP3-U1-A,CPP3-U1-B --only lessons`
  then `--collect` a few minutes later, then words (`--only words`)

## Phase 1d: art (ready to run)
- [x] `content/art-style.json` (style guide, FLUX.2 klein-4b, sizes) and `scripts/art/build-art.mjs` (resumable, tracks the free daily neuron allowance, WebP output, `assets/art/manifest.json`)
- [x] The app reads the art manifest: stage backdrops via `artUrl`, unit hero images in the Lessons view. Without the manifest it falls back to the procedural scenes.
- [x] Cloudflare token fixed and verified 2026-10-17. 16 backdrops and 27 unit heroes generated (WebP, about 1 MB total; ≈ 6.7k neurons including one full regeneration with the stricter full-bleed / no-text style). `--redo <id>` and `--redo-all` regenerate with new seeds.
- [ ] **R2 is not enabled** on the Cloudflare account (API error 10042). The user must enable R2 in the dashboard before Phase 1e packs. Until then, audio and art ship inside the app (about 20 MB).
- [ ] Next art: per-lesson story panels and focus-word picture cards (free daily allowance, resumable).
- [x] Desktop installer and portable exe rebuilt 2026-10-17 15:40 (`desktop/release/`); smoke test passes.
- [x] Daily scheduled task "vocab-master-daily-narration" (10:33 local) voices the remaining Lingo narration, commits and pushes.

## Phase 1e: delivery ✅ (simplified design)
- [x] R2 bucket with a public r2.dev URL and CORS; `scripts/packs/publish.mjs` uploads each clip as its own object (immutable cache) plus the manifest (no-cache). Resumable via `work/state/publish.json`.
- [x] `arcade/voice.js` plays clips from: the bundled file, then the offline cache (Cache Storage), then R2 (and caches it). It merges the remote manifest at start-up. The Lessons view has a "Download voices for offline" button. CSP allows `https://*.r2.dev`.
- Per-unit zip packs were replaced by per-file streaming: simpler, and new clips need no app update.

## Phase 1f: teacher review of lessons
- [ ] See PLAN.md §4, §6, §10. Remaining lessons: `node scripts/lessons/draft-lessons.mjs --all` (about $0.60)

## Phase 2: live games
- [ ] 2a no-phones host · 2b Firebase + phone client · 2c team mode / load test

## Decisions log
- 2026-10-17: Gemini TTS within a €3.50 budget (Flash for narration, Flash-Lite for words, Batch API). OpenRouter (Claude Haiku 5.5) drafts the lesson text. Cloudflare provides free art (Workers AI) and pack hosting (R2). Firebase handles phones.

## Merging main (notes from other sessions, 2026-10-17)
- `main` moved to e076a28. It changes `app.js` (autofillVocabulary takes an optional 4th options argument; inline Greek "word type = Greek" in worksheets and Word export; **don't revert that layout**), plus `vocab-quality.js`, `pictures.js`, `words.js`, and the `package.json` test script, which adds `tests/vocab-quality.test.mjs`.
- When merging, the only expected conflict is the `package.json` "test" script. Keep this branch's glob `node --test "tests/*.test.mjs"`; it already picks up `vocab-quality.test.mjs`.

## Known issues
- In Git Bash heredocs, a double backslash can collapse to a single one. Write files containing backslashes with the Write tool.
- The word bank uses "neighbor" (US) while lessons use "neighbour" (UK). The validator's stem matching tolerates this.

## Ideas parked
- OpenRouter `openai/gpt-audio-mini` (about $2.4/M audio tokens) could voice word-bank example sentences from the OpenRouter credit if the Gemini budget runs out.
- OpenRouter `google/lyria-3-clip-preview` (free preview) could make lesson jingles and background music.
