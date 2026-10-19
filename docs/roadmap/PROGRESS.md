# Progress — lessons & live games roadmap

**Branch:** `main` (feature/lessons-experience merged and deleted 2026-10-17; new phases: branch off main) · **Plan:** `PLAN.md` · **How to resume:** `RESUME.md` · **Spend:** `BUDGET.md`

## Slimmer exes (2026-10-19, from the user): 193 MB → 177 MB
- `npm run dist` now builds through `desktop/electron-builder.config.cjs` (package.json "build" + two extras): Chromium UI languages limited to en-US, en-GB and el (−10 MB), and voice clips the manifest no longer points to are left out (933 superseded takes, −8 MB; they stay on disk for the audio job's state).
- `voice.js`: the bundled manifest now wins over the R2 one, so an older remote manifest can't point a line at a superseded take; R2 only adds lines the build doesn't ship.
- Logo `assets/vocab-master-mark.png` is a 256 px copy (730 KB → 48 KB); the full-size original is `desktop/build/vocab-master-mark-source.png` (used by `make-icon.js`).
- Already efficient, left as is: pictures (lossy WebP 512 px, ~17 KB each), voice (Opus mono ~20 kbps). Checked: all 7,557 used clips are packed; packaged-app smoke passes.

## 3.1.0 — arcade "Choose your words", revamped hub, Lingo Live music (2026-10-19, branch feature/arcade-deck-revamp, from the user)
- **Choose your words** (`arcade/deck-picker.js` + pure `arcade/deck-source.js`, `tests/deckpicker.test.mjs`): a full-screen picker inside the arcade. Book (1–3) → Unit (title, word count) → the unit's printed sections (Big Question, Lesson A, Lesson B, Workbook, Extras, with page ranges). Each section: "★ key words" (the ten words its animated lesson teaches, read from the lesson files), "All N", or single words. Filters (nouns, verbs, describing words, phrases, only with a picture), word search across all books, "Keep 12 at random", "My worksheet words". Picks can span units and books; a live panel shows the count, a plain-English name ("Primary Path 1 · Unit 3 (A, B)"), a removable breakdown, and which games each size unlocks. Main hands the arcade `buildDeck` so picked words get the same trusted pictures as worksheet words.
- **Hub:** deck card (animated count, word mix, scrolling picture ribbon, Choose words), "Ready-made lesson" (Flashcards → Memory → Spell Bee → Word Board → Top Answers; the finish screen offers "Next: …"), games grouped as Meet the words / Practise / Speak & show off, each card showing the skills it trains and what it's best for, gentle tilt and bobbing art. The word list lets a teacher leave one word out (✕, with Undo).
- **Lingo Live music** (`arcade/live/music.js`): an original game-show "thinking" theme in four keys (a new one each question) that builds while the clock runs — bass and kick, then a marimba arpeggio, then claps and a hook, then a hurry layer with a rising whoosh in the last 5 s; a filter opens as time passes (`setBuildup`). A rising sting when everyone has answered. Checked by rendering offline: no errors, energy rises per layer.
- **Version 3.1.0** (root + desktop package.json, READMEs). Checks: `npm test` 352 pass; smoke passes (adds the picker: CPP3 Unit 2 whole unit → deck of that size and name).

## Top Answers: 322 boards, rounds, a lit-up look (2026-10-19, branch feature/top-answers-variety, from the user)
- **Boards:** every unit now has 10–13 boards (was 3), 322 in all, in many styles — "Name…", "What do you…?", "Where do you…?", "Name something that is red/big/noisy…" — written for the book's level. Each board has a topic emoji; each answer an emoji icon. Built with `node scripts/lessons/build-feud.mjs --target 12 --count 9` (resumable; `--count N` adds N more per unit). Cost $0.12; OpenRouter now has about $0.04 left under its cap.
- **A game = 6 rounds:** from the deck's unit(s) first, then other units of the same book. No repeated prompt, no two in a row on one topic. Round 5 is double points, round 6 triple (`roundMultiplier`); the board glows blue/pink and scores show the multiplied value.
- **New in play:** 💡 Hint (first letter and length of the top answer left), round dots, "100 children surveyed" marquee with a topic medallion, glossy tiles, answers revealed at the end look dimmer than ones the class said.
- **Pictures:** generated and imported all 116 missing answer illustrations. `node scripts/lessons/list-feud-pictures.mjs` now reports zero missing; the app manifest maps each answer to its new `w-<slug>.webp` asset.
- **Checks:** `npm test` 347 pass; smoke passes (Top Answers shows 6 tiles).

## Word Board + Top Answers replace Quiz Show in the arcade (2026-10-19, branch feature/word-board-top-answers, from the user)
- **Why:** Quiz Show was nearly the same game as Lingo Live (four answers, pick one). The arcade now has two new kinds of game. Quiz Show stays only for the 9 lessons whose Practice step uses it (`hub: false`).
- **Word Board (`games/board.js` + pure `board-questions.js`):**
  - A Jeopardy-style grid of question kinds × points: Pictures, Fill the gap, Spell it (teacher-judged, letters flip in), Listen, and Greek → English when Greek is shown.
  - Rows are worth 100–500. High rows are harder: wrong answers share the part of speech and first letter, and gaps have no picture clue.
  - One hidden ⭐ double. Whoever is up (class, player, or team member) picks a tile; arrow keys and Enter work too.
- **Top Answers (`games/feud.js`):**
  - Family-Feud-style: "Name an animal on a farm…" with six ranked answers and survey points, each with its picture and recorded word.
  - The teacher types what the class says (or taps a tile they heard). Matching accepts alternatives (mum → mother), plurals and other forms.
  - **Teams:** members take turns guessing (`teams.nextMember()`). The team builds a round bank; three strikes let the next team steal with one guess.
  - **Players:** each answer scores for the child who said it, and turns go round. **Whole class:** answers go straight to the class score.
- **Boards:** `desktop/renderer/lessons/feud.json`, 3 boards per unit for all 27 units, built by `node scripts/lessons/build-feud.mjs`.
  - DeepSeek Flash through the ledger, about $0.002 per unit; the whole set cost $0.10 including retries. It is resumable (`--force` rebuilds a unit).
  - Answers are linked to word-bank ids, so pictures and voice match.
  - The game picks the unit whose words the deck uses most.
  - Note: the model reasons before answering, so the script uses `reasoning.effort: low` and a 7,000-token limit (2,500 cut replies off).
- **Tests:** `tests/boardgames.test.mjs` covers board shape, gap forms, answer matching and the boards file. The smoke test plays both games and expects 7 arcade cards.

## Arcade: players, teams of members, saved classes; Lingo Live fixes (2026-10-19, branches fix/live-pictures-voice + feature/arcade-players, from the user)
- **Bugs fixed:**
  - Lingo Live used the browser voice when the voice toggle was off. Forced lines (Listen questions, Listen again) now always use the recording (`voice.js` speak delegate).
  - Pictures were blank in Lingo Live, the deck list and "Which picture is…?". Word-bank pictures came only from R2, which some networks can't reach (r2.dev is also rate-limited). All 2,828 pictures now ship with the app (`assets/pics/bank/`, about 36 MB, committed). A picture that fails tries R2, then shows the word's emoji.
  - Gap answers lost their ending ("I have two ___" offered "uncle"). `deck.js` `surfaceForm` / `inflectLike` / `gapOptions` give the form the sentence needs ("uncles") and the same ending to the wrong answers ("aunts"). Used by Quiz Show and Lingo Live.
- **Who's playing (`arcade/players.js`, pure, `tests/players.test.mjs`):**
  - Three modes: **Whole class** (one score), **Players** (each child scores), and **Teams** (2–4 teams of named members; teams alternate and members take turns inside their team; team score plus each member's points; uneven teams are fine).
  - Fair rotation: everyone present answers once before anyone repeats.
  - The 🎲 spinner picks among those who haven't answered yet; the teacher can also hand the turn to anyone from the 🏆 leaderboard.
  - Children marked "away today" are skipped (not saved).
  - Saved classes in localStorage (`vm_classes`: first names, team assignment, team names). They stay on this computer only. You can paste a whole class list, shuffle teams, tap a name to move it to another team, and delete a class with a two-tap confirm.
  - Games read the same `teams` API, extended with `mode`, `player()`, `turnHtml()`, `groups` and an optional `onTurn()` hook. Banners show "🦊 Maria · 🚀 Rockets".
  - Taboo: one hot-seat round per child (up to 12) in Players mode.
  - Lingo Live: answer cards use `groups` (teams, or the class in Players mode); phones are per child as before.
  - End screens: the player podium plus the rest of the ranking, or the team podium plus "Stars of the game".

## Current state (2026-10-17 night, end of session 2)
- **Done:**
  - 81 lessons revised under the "show what you say" rules (draft status, all valid; 0 unshown mentions, enforced by test).
  - **All 8,650 voice lines recorded**: Lingo, words, examples, definitions and dialogue, through the Gemini Batch API. Gap-fill prompts are voiced with "blank" (`spoken()` in build-audio), so the answer is never spoken.
  - Clips published to R2.
  - Desktop installer and portable exe rebuilt after the voice work. Run `npm run dist`; it now ends with `scripts/verify-package.mjs`.
  - `main` (worksheet fixes up to 03ec78e) merged into this branch.
- **Build rule (learned the hard way):** never run `npm run dist` while anything writes into `desktop/renderer` (e.g. `build-audio --collect`). A file changing during packing shifts the app.asar offsets and ships a scrambled app. `verify-package.mjs` byte-compares the archive with the source and fails the build.
- **Voices:** Lingo and words = `en-gb-tutor-6`. Characters = studio/library role pools. Greek = `el-gr-assistant-5` (Greek glosses not voiced yet). No scheduled tasks.
- **Spend:** Gemini $2.84 of $3.60 · OpenRouter ≈ $2.70 of $3.00 · Cloudflare free tier.
- **Word-bank emojis:** `CPP_WORDBANK.emojis` is mostly generic filler (✨ on 200+ words). Trust one only when ≤2 words share it (`trustedBankEmoji` in app.js; the same rule in `lesson.js` and `polish-lessons.mjs`). Quiz options outside the focus words take a picture from `lesson.pictures`.
- **Waiting on the user:** a teacher read-through of the lessons (all `status: draft`; set `approved` when happy).
- **Next work for an agent (in order):**
  1. After 00:00 UTC: `node scripts/art/build-art.mjs --only backdrops` (AI art for the 16 new backdrops, free allowance). Then `npm run dist`.
  2. Optional: exclude bundled `.ogg` from the installer (`"!renderer/assets/audio/**/*.ogg"` in desktop/package.json files), since clips stream from R2 with an offline cache. The installer is about 137 MB now.
  3. Per-lesson story-panel art and focus-word picture cards (`build-art.mjs`, free daily neurons).
  4. Phase 2c: classroom pilot of Lingo Live phones (see Phase 2b below).
- **Known:** the local router (fritz.box) may cache a negative DNS answer for the r2.dev host; bundled clips still play.

## Story characters at real size, bigger game pictures, new Lessons header (2026-10-18, merged into main, from the user)
- **Problem:** every character picture is normalised the same way (the figure fills about 77 % of its height, with about 11 % empty below the feet). So children, adults, giants and squirrels were all equally tall, about 240 px on the 1080 px stage, and they floated above the ground.
- **Story characters (`lesson/scenes/story.js`):**
  - `figureOf()` gives real-world heights by role, taken from the picture id (`@c-timmy-child` → child): child 500 px, elder 600, grown-ups 640, giant 780, donkey 440, hound 330, hare 290, rooster 250, squirrel 210, bee 190 (flies, with its name tag).
  - `import-pictures.mjs` measures each character's figure box into `manifest.figures` (`[top, bottom, width]`). The picture is sized so the figure is exactly that height, and the feet stand on the ground line.
  - Panels with 4 characters now have slots; the 4th used to get `left: undefined%`.
- **Speech bubbles:** they live on the stage and are placed by scoring several spots (above the head, centred or slid sideways; beside the head, high, mid or low). The score keeps them clear of the caption, the stage edges, other characters' faces and bodies, and the speaker. Crowded panels get narrower bubbles. Word pops avoid the visible figure (`.st-hit`) and open bubbles.
- **Games:** memory picture tiles fill the card. Illustrated pictures are larger in flashcards (back), spelling, taboo, quiz clues and the Lingo Live word card.
- **Lessons header:** rebuilt for the finished product:
  - no "81 approved" counter;
  - a kicker, headline, short description and three "how to teach" steps;
  - Mia, Grandma Eleni and Leo standing on a hill;
  - one offline-voices button that turns green when every voice is saved.
- **Tests:** `tests/pics.test.mjs` also checks that every character's height fits the stage and that children < adults < giants.

## Lingo redesigned: a truly animated owl (2026-10-18, merged into main, from the user)
- **Ask:** the old SVG owl felt plain. A more beautiful, expressive, animated Lingo; voice and speech bubbles unchanged.
- **Drawing (`lesson/lingo-art.js`):** hand-built SVG in the picture set's soft flat-vector style (indigo outline, gentle gradients): big head with a lilac face disc, amber eyes with two highlights, feather brows, ear tufts, scalloped belly, feathered wings, feet, graduation cap with a swinging tassel. No image files. Ids get a per-drawing suffix, so several Lingos can share a page. `lingoBadge()` is the head alone; it replaces 🦉 in the lesson top bar and the Lessons page kicker.
- **Rig (`lesson/mascot.js`, same API: `createMascot(host)` → `el`, `setPose`, `level`, `destroy`, plus a `pose` getter):** transform and opacity only, every part its own group with a fixed pivot.
  - Life: breathing, blinks (sometimes double), glances, small head tilts, tassel sway, wing flutters, tuft twitches. Timers are randomised, so two Lingos never blink together.
  - Poses (`POSES`, rig values eased in, plus a short loop for some): idle, talk (explaining gestures), wave, cheer (hops with flapping wings), think (wing tap), point, and new happy, surprised, proud, listening (wing to the ear), encouraging. Unknown names fall back to idle.
  - Voice: `level(v)` opens the beak and mouth with one of five mouth shapes picked per syllable; the head bobs a little with the voice. The beak opens to whichever is wider, the pose's expression or the voice.
  - Calm motion / reduced motion: no life loops or pose loops; poses jump to their end state; lip-sync still works (set, not tweened).
- **Scenes:** the speaking timer shows "listening", the badge "proud", the word wall "happy", the game intro "encouraging", time-up "happy". `ctx.say` keeps an expressive pose (cheer, happy, proud, point, encouraging, surprised) while Lingo talks; otherwise he talks and settles back afterwards (a wave calms to happy). A stale line never overrides a newer scene's pose.
- **Tests:** `tests/mascot.test.mjs` (every `setPose("…")` in the renderer exists; the drawing has every rigged part; ids unique and defined; no external images). 327 tests green, `npm run smoke` passes. Checked in the browser preview: all poses, lip-sync, calm mode, CPP1-U1-A scenes.
- **Merged** into `main` on 2026-10-18. **Not done:** not seen on a real weak laptop or a projector. The installer was not rebuilt.

## Picture set in the app ✅ (2026-10-18, branch feature/picture-set-import)
- **Pictures:** all 2,828 are drawn (Codex, Gemini and Cursor). Gemini did the visual QA. Originals are in `art-brief/pictures/done/` (gitignored, 1.6 GB).
- **Delivery (decided with the user):**
  - Phases 0–3 (lesson words, characters, story props, avatars and mascots; 1,043 WebP, 18 MB) are bundled in `desktop/renderer/assets/pics/`.
  - Phases 4–5 (the rest of the word bank; 1,785 WebP, 33 MB) live in `assets/pics/bank/`, which is gitignored and excluded from the build. They are uploaded to R2 `pics/` with `node scripts/packs/publish.mjs --pics`.
  - `import-pictures.mjs` does this split on every run and lists the R2 files in `manifest.remote`.
  - The installer is about 165 MB, up from 146.
- **How it works (`js/pics.js`):**
  - A picture travels through the existing emoji fields as a token `@<id>` (e.g. `@w-house`), and the shared `picture()` in main.js renders it as `<img class="vpic">` (1.15em, so it sizes like an emoji). Every picture style shows illustrations except "No pictures".
  - Lessons: focus words, distractors, story characters (per lesson and cast key) and story props (noun stems) use it.
  - Arcade decks: `buildArcadeDeck` swaps in the token.
  - Lingo Live projector: phone avatars and team mascots are drawn by `avatarPic` / `teamPic`. Phones still show emoji.
  - A picture that can't load hides (`.vpic-off`). The CSP allows `img-src https://*.r2.dev`.
- **Not illustrated yet:** worksheets and Word export still use the emoji or picture style. Word needs PNG/JPG, not WebP.
- **Tests:** `tests/pics.test.mjs` checks that every focus word has a bundled picture, every story character has one, and every manifest file is bundled or listed for R2.
- **Tools kept:** `scripts/art/gemini-pictures.mjs` and `gemini-batch-sheets.mjs`, both through the ledger. Don't use the Antigravity `art-worker.mjs`: it bypassed the ledger.
- **Image spend:** gemini-images $0.74, in the ledger.

## Audio language for the whole app (2026-10-18, branch feature/audio-language, from the user)
- **Ask:** sounds everywhere they help (not the lesson recorder), beautiful, and working on strong and weak machines alike.
- **Palette (`arcade/sounds.js`):** 42 synth recipes, no audio files: soft mallets and FM glass bells in C major, airy noise for motion, warm knocks instead of harsh buzzes. Interface sounds are under 150 ms and quiet; game sounds are louder for projector speakers.
- **Engine (`arcade/audio.js`, same exports as before plus `play`, `claimed`, `sharedContext`, `setVoiceActive`, `setMusicActive`, `soundStats`):**
  - One AudioContext for effects, Lingo Live music and the recorded voice (voice.js used to open its own).
  - After the first click every recipe is pre-rendered (OfflineAudioContext, in idle time, 4 at a time, ~2 s) into a buffer; a sound is then one buffer source. Until then it plays live.
  - Quality: "auto" (default) goes light on ≤2 cores / ≤2 GB or when an offline render is slow; "light" = 22 kHz, no reverb, no compressor, 4 voices max, thinner Live music. Settings → Sound quality overrides it.
  - Per-sound rate limits, a voice cap (oldest stops first), effects dip to 50% while any voice talks, the context sleeps after 30 s of silence or when hidden and wakes on the next sound.
- **Where sounds play:**
  - Studio (`js/sound-ui.js`, one delegated listener): every button/tab/switch/select/drag; `data-sound="name|none"` overrides. Specific moments win over the generic click via `claimed()`: page navigation (forward/back), dialog open/close, toasts by type, confirm-delete, AI start/done/error, theme light/dark, print, projector (open, reveal pop, reveal all).
  - Arcade: enter/exit, hub hover, back to hub, team switch, +/− points; existing game sounds use the new palette. Live music shares the noise buffer (it used to allocate one per hi-hat).
  - Lessons: enter/exit, back, scene map, toolbar toggles, a faint bubble per word pop, a sparkle per star.
- **Settings → Sound:** volume slider with Test, Interface sounds, Game and lesson sounds, Read words aloud, Sound quality. New prefs: `uiSounds`, `volume` (0–100), `soundQuality`.
- **Tests:** `tests/sound.test.mjs` (every recipe on a mock context: valid automation, inside its declared length, node budget; every `play("…")`/`sfx.…()`/`data-sound` name in the renderer exists). Verified in the browser (warm-up, settings, quiz, Live music flag, lesson ducking, sleep/wake) and `npm run smoke`.
- **Not done:** not merged into `main` (ask first). Not heard on a real weak PC or classroom speakers; levels were balanced by measured peak/RMS.

## One picture per word; pops keep up with fast speech (2026-10-18, from the user)
- **Bug:** 392 focus words had rebus pictures (community 🧑🧑🏘, instrument 🎸🎻🥁). They wrapped and overflowed in the word pops, the reveal circle and the Lessons unit cards (a duplicate icon spilled under the hero). 🏘 without U+FE0F also drew as a black glyph.
- **Fix:** `onePicture()` (`lesson/wordmatch.js`) keeps the first emoji and adds U+FE0F to text-style emoji. It's used for lesson words, props and unit heroes. The data was rewritten by `scripts/lessons/one-picture.mjs` with hand-chosen pictures from `scripts/lessons/word-pictures.mjs`; pictures stay distinct within each lesson. A test fails on any multi-emoji picture.
- **Fast speech:** when the voice reaches a new pictured word, the current pop finishes 4× faster and the new word pops next. Words the voice already passed are dropped instead of queueing (`wordpop.js`).

## Picture set brief: illustrations replace emoji (2026-10-18, branch feature/picture-set)
- **Why:** emoji are ambiguous. 169 groups of lesson words share one emoji (sing/chant 🎤; 🏃 = gym, race, escape, compete…).
- **Brief for Codex/ChatGPT:** `art-brief/pictures/PROMPT.md`, plus `jobs.json`/`jobs.csv` (2,828 jobs), `batches/` (73 paste-ready batches), `lookalikes.md` and `characters.md`. Built by `scripts/art/picture-jobs.mjs` from the lessons and word bank; fixed character looks are in `scripts/art/character-looks.mjs`.
- **Phases:**

  | phase | content | images |
  |---|---|---|
  | 0 | anchors | 12 |
  | 1 | characters + lesson words | 781 |
  | 2 | story props | 230 |
  | 3 | avatars and team mascots | 20 |
  | 4 | word-bank nouns | 994 |
  | 5 | word-bank verbs, adjectives and phrases | 791 |

- **Tools:**
  - `check-pictures.mjs` reports progress and validates size/transparency, writing `art-brief/pictures/PROGRESS.md`.
  - `picture-sheet.mjs` makes contact sheets.
  - `import-pictures.mjs` writes 512 px WebP with alpha to `desktop/renderer/assets/pics/` and `manifest.json` (`words` by "english|type", `nouns` by stem for props, `characters` by "lesson|castKey", `ui`).
- **Next, when pictures arrive:**
  - Wire the manifest into the app: lesson word cards, word pops (`ctx.picFit`), story actors, and arcade/Lingo Live (`picture()`), falling back to emoji when a picture is missing.
  - Consider streaming the pictures from R2 like the audio (the full set is about 60 MB).

## Word pops replace the prop boxes (2026-10-17 night, from the user)
- **Why:** the labelled prop cards looked like a worksheet, and many icons were rebus combinations (🧠🟰🧠, 🌱➡️🌳), abstract words (brave, beginning) or simply wrong (tune 🔧, wardrobe 🚪).
- **Now (`lesson/wordpop.js`, `lesson/wordmatch.js`):** a pictured word carries a small picture right after it ("my hat 🎩"). When the karaoke reaches the word, the picture zooms up next to the text with a soft glow, holds, and flies back. Tap a pictured word to pop it again. Calm motion makes it pulse instead.
  - `pickSpot` chooses above, below, left or right so a pop never covers quiz answers, faces or Lingo.
  - New words also pop their lesson picture in story, warm-up and quiz explanations, but only nouns, and at most 2 pictures per line.
- **Props data** cleaned by `scripts/lessons/clean-props.mjs` (hand-chosen pictures in `prop-pictures.mjs`): a prop exists only for a concrete noun the line mentions that the backdrop or a character doesn't already show. 3,080 → 1,608 props, all reviewed. `content/visual-lexicon.json` was extended (objects, animals, roles) and abstract words were removed.
- **Matching:** `schema.stem` now handles houses/boxes/buses, cookies/movies and possessives.
- **Tests (`tests/wordpop.test.mjs`):** every prop in every lesson attaches to a word it is shown with; pops avoid answers and faces.

## Phase 2b: phones for Lingo Live ✅ (2026-10-17 night)
- **Firebase project** `vocab-master-live` (Spark, free) on the user's Google account nvasedis@gmail.com.
  - Realtime Database `vocab-master-live-default-rtdb` in **europe-west1**.
  - Anonymous Auth.
  - Hosting at **https://vocab-master-live.web.app** (the phone page).
  - Config is in `firebase/` (firebase.json, .firebaserc, database.rules.json, public/).
- **Rules** (`firebase/database.rules.json`): rooms can't be listed. A player writes only their own `players/{uid}` (nickname ≤16 characters, avatar) and one answer per open question (write-once, only while `state.phase === "question"` and `state.qkey` matches, server timestamp). Everything else is host-only.
- **Host** (`arcade/live/net.js`, used by `games/live.js` when the lobby is switched to "📱 Phones"):
  - 6-digit PIN, QR code (vendored `vendor/qrcode`), player wall, tap twice to remove a player.
  - Balanced teams (`assignTeams`), live answer counter, auto-reveal when everyone has answered.
  - Answer histogram, fastest player, team points = average of the team's players (`scorePhoneRound`), player leaderboard and podium for the whole class.
  - Results are pushed to every phone; the room is deleted when the show ends.
- **Phone page** (`firebase/public/index.html, play.js, play.css`): PIN (or `?pin=` from the QR) → nickname + animal → lobby → shapes only → locked → right/wrong + points + rank → final rank. Reloading the page keeps the same player (local persistence).
- **SDK:** Firebase JS 12.19.0 ESM vendored in `desktop/renderer/vendor/firebase` (imports rewritten to local). The CSP allows the `*.firebasedatabase.app`, identitytoolkit and securetoken hosts.
- **Deploy:** `node scripts/live/build-play.mjs --deploy` (copies the SDK + net-config into firebase/public/vendor, then deploys hosting + rules).
- **Test locally:** launch config "lingo-live-phone" (`scripts/live/serve-play.mjs`, :5055). Bots: `node scripts/live/bots.mjs <pin> 5`.
- **Clear leftover rooms:** in Git Bash run `MSYS_NO_PATHCONV=1 npx firebase-tools database:remove /rooms --force --project vocab-master-live`. Only do this when no game is running.
- **Verified 2026-10-17:** desktop host plus a phone page plus 5 bots played a full 5-question show (live counter, auto-reveal, histogram, averages, leaderboard, podium, phone results, room deleted).
- **Next (2c):** a classroom pilot. Possible extras: lesson check items pushed to phones, a reconnection banner on the host, a player-count limit (free plan: 100 simultaneous connections).

## Arcade revamp + Lingo Live (Phase 2a) ✅ (2026-10-17 night)
- **Greek:** one switch for the whole arcade (ΕΛ button / G key, saved in `vm_arcade_greek`, **off by default**). Greek UI carries class `gk`, hidden by CSS unless the host has `.show-greek`. Games get `ctx.greek()` and may implement `onGreek(on)`. Games that type letters set `capturesLetters` so G stays a letter.
- **Game fixes:** Flashcards "Picture first" (picture, gapped sentence, or Greek when on). Memory: Picture / Sentence / Greek, with Greek only when on. Spell Bee and Quiz clues never carry Greek (`greekClue` shown separately). Word types written in full (`typeName`). Hub cards fixed.
- **Lingo Live** (`arcade/games/live.js`, featured first in the hub): Kahoot-style show on a fixed 1600×900 canvas.
  - Lobby with music → 3-2-1 → intro → question (shape tiles ▲◆●■, countdown and time bar) → reveal (learn-it card, recorded voice only) → leaderboard → podium.
  - No-phones answering: teams raise shape cards or 1–4 fingers; the teacher taps the team emoji on the chosen tile (keys: 1–4 pick a team, A–D answer, Space reveals or continues).
  - Speed scoring (500–1000 plus a streak bonus, `live/scoring.js`), questions from any deck (`live/questions.js`: what is this, find the picture, gap, listen, true/false, Greek only when on), synthesized music (`live/music.js`).
  - Tests in `tests/live.test.mjs`; the smoke test plays into the first question.
- **Next (Phase 2b, needs the user):** phones. Students join with a PIN or QR on Firebase Realtime Database + Hosting (free Spark plan). Needs a Firebase project on the user's Google account (they approve creating it). The live game's `record(team, opt)` is the hook: a transport would call it per player and aggregate per team, or switch to per-player scores.

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

## Phase 1c: voice ✅ (all 8,650 lines, batch, 2026-10-17)
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
- [x] 2a no-phones host (Lingo Live) · [x] 2b Firebase + phone client · [ ] 2c classroom pilot / load test

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
