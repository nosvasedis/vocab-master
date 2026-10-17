# Progress — lessons & live games roadmap

**Branch:** `feature/lessons-experience` · **Plan:** `PLAN.md` · **How to resume:** `RESUME.md` · **Spend:** `BUDGET.md`

## Current state
- **Phase:** 1a done → 1b (lesson player) next
- **Next step:** build `desktop/renderer/lesson/{lesson,player,stage,mascot,motion}.js`, `lesson/scenes/*.js` and `js/views/lessons.js` (PLAN §7–8). Preview with `npm start` (launch config "vocab-master-web").
- **Waiting on the user:**
  - **Cloudflare API token:** not created, because the agent's permission system blocked the dashboard. The user can create it (Account → Workers AI: Edit + Workers R2 Storage: Edit) and paste `CF_ACCOUNT_ID` / `CF_API_TOKEN` into `.env.local`, or allow the action. Only needed for Phase 1d/1e.
  - **Pilot review:** the 9 pilot lessons are `status: draft` and need a human read-through before `approved`.
  - **Voice audition (Phase 1c):** the user picks the voices.

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

## Phase 1b: lesson player
- [ ] Lessons view and nav item; `lesson/{lesson,player,stage,mascot,motion}.js`; 7 scene types; GSAP vendored; calm motion

## Phase 1c: voice
- [ ] Audition (the user picks voices) → `content/voices.json`
- [ ] `build-audio.mjs` (batch, capped) → pilots → all narration → words
- [ ] `arcade/voice.js`, `voice-index.js`; `speak()` delegation

## Phase 1d: art · 1e: packs and delivery · 1f: remaining 72 lessons
- [ ] See PLAN.md §4, §6, §10. Remaining lessons: `node scripts/lessons/draft-lessons.mjs --all` (about $0.60)

## Phase 2: live games
- [ ] 2a no-phones host · 2b Firebase + phone client · 2c team mode / load test

## Decisions log
- 2026-10-17: Gemini TTS within a €3.50 budget (Flash for narration, Flash-Lite for words, Batch API). OpenRouter (Claude Haiku 5.5) drafts the lesson text. Cloudflare provides free art (Workers AI) and pack hosting (R2). Firebase handles phones.

## Known issues
- In Git Bash heredocs, a double backslash can collapse to a single one. Write files containing backslashes with the Write tool.
- The word bank uses "neighbor" (US) while lessons use "neighbour" (UK). The validator's stem matching tolerates this.

## Ideas parked
- OpenRouter `openai/gpt-audio-mini` (about $2.4/M audio tokens) could voice word-bank example sentences from the OpenRouter credit if the Gemini budget runs out.
- OpenRouter `google/lyria-3-clip-preview` (free preview) could make lesson jingles and background music.
