# Progress — lessons & live games roadmap

**Branch:** `feature/lessons-experience` · **Plan:** `PLAN.md` · **How to resume:** `RESUME.md` · **Spend:** `BUDGET.md`

## Current state
- **Phase:** 0 → finishing (the Cloudflare token is still pending)
- **Next command:** create the Cloudflare API token (see Phase 0), then start Phase 1a: `scripts/lessons/lib/lesson-schema.mjs`
- **Waiting on the user:** nothing yet. The voice audition (Phase 1c) will need them to pick voices.

## Phase 0: foundation
- [x] Branch `feature/lessons-experience` (the earlier WIP had already been committed on main as 57a7f53)
- [x] `docs/roadmap/{PLAN,PROGRESS,RESUME}.md`, `CLAUDE.md`
- [x] `.env.local` (gitignored) with the Gemini and OpenRouter keys; `scripts/lib/env.mjs`
- [x] Spend ledger `scripts/lib/ledger.mjs`, pricing and caps in `content/pricing.json`, `tests/ledger.test.mjs`
- [x] Fixed the `firstPicture` regex (`firstEmoji` in deck.js, with a test)
- [x] Extracted `arcade/host.js` (`mountGame`); the arcade uses it
- [x] Test glob `tests/*.test.mjs`; MIME types (ogg/opus/mp3/wav/webp/jpg/zip) in `proxy.js` and `desktop/main.js`
- [x] Reduced-motion CSS: already global in `base.css`. A `calm-motion` class comes with the lesson player
- [ ] Cloudflare API token → `CF_ACCOUNT_ID`, `CF_API_TOKEN` in `.env.local`

## Phase 1a: lesson content pipeline
- [ ] `scripts/lessons/lib/lesson-schema.mjs` (validator) + `tests/lessons.test.mjs`
- [ ] `scripts/lib/ai.mjs` (OpenRouter + Gemini JSON, ledger)
- [ ] `scripts/lessons/draft-lessons.mjs`, `validate-lessons.mjs`
- [ ] Pilots drafted: CPP1-U1, CPP2-U1, CPP3-U1 (BQ, A, B)

## Phase 1b: lesson player
- [ ] Lessons view + nav; `lesson/{lesson,player,stage,mascot,motion}.js`; 7 scene types; GSAP vendored

## Phase 1c: voice
- [ ] Audition (the user picks voices) → `content/voices.json`
- [ ] `build-audio.mjs` (batch, capped) → pilots → all narration → words
- [ ] `arcade/voice.js`, `voice-index.js`; `speak()` delegation

## Phase 1d: art · 1e: packs and delivery · 1f: remaining 78 lessons
- [ ] see PLAN.md §4, §6, §10

## Phase 2: live games
- [ ] 2a no-phones host · 2b Firebase + phone client · 2c team mode / load test

## Decisions log
- 2026-10-17: Gemini TTS within a €3.50 budget (Flash for narration, Flash-Lite for words, Batch API). OpenRouter drafts the lesson text. Cloudflare provides free art (Workers AI) and pack hosting (R2). Firebase handles phones.

## Known issues
- (none yet)
