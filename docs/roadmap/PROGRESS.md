# Progress — lessons & live games roadmap

**Branch:** `main` (feature/lessons-experience merged and deleted 2026-10-17; new phases: branch off main) · **Plan:** `PLAN.md` · **How to resume:** `RESUME.md` · **Spend:** `BUDGET.md`

**Next:** nothing queued. **Since 3.5.0 (2026-10-20) the desktop app updates itself:** a push to `main` that changes `desktop/renderer/**` reaches installed apps on its own (keep `main` green); a new exe is needed only for shell changes, via `npm run release` — see CLAUDE.md → Shipping and RESUME.md → "Shipping changes to teachers". Current version: **v3.5.3** (Save window, Remake that obeys, any class with any book, rail sidebar; before it v3.5.2: ChatGPT exercise remake fix; section below). Teachers on 3.4.0 or older must install 3.5.0 once by hand.

## A truer, smarter worksheet quality check (2026-10-21, from the user; pages only)
- **Truthful coverage** (`studio/quality-check.js`): a word counts as tested only when a line makes students write or choose it — it is the answer (any form: introduce → introduced, or a listed derivative), or it is printed on the line AND in testsWords (matching, odd one out). Whole words only: "room" no longer counts for bedroom / living room, "time" no longer for "spend time", a testsWords claim the line doesn't show doesn't count. Synonyms, opposites and derivatives belong to their headword's family, so "challenge" and "challenging (derivative)" are one chip, not two.
- **Room in the Dictation** (`dictationRoom`): lines that only repeat a word tested elsewhere (or test none) + places each exercise can still add. The panel says whether the missing words fit, or how many won't and what to change in Step 3; the AI coverage fixer is told exactly which lines it may rewrite / add, keeps a reply only if it covers more words without new problems, and isn't run when there is no room.
- **Long sentences** are now line issues (“Dictation 1 · line 5: too long to dictate (16 words; about 7 suits this class)”), fixable by “Rewrite lines with AI”, never “May need a full rewrite”. Words are counted as heard: a gap or a set of bracket choices anywhere in the line is one word (mid-line choices used to count as 3–5 words). Limit = class max × 1.35; matching / odd-one-out / categories / letter puzzles are skipped. After generation they are fixed line by line, not by a second full generation.
- **A Lingo line copied from the Dictation** is a line issue on the Lingo line (was “full rewrite”).
- **Panel:** an honest intro (“N things to fix before you print” / “Ready to print. These would make it better”), groups in order Lines to fix · Whole exercise · Not in the Dictation yet (amber = practised in Lingo, red = on neither sheet) · Too long to dictate · Quick tidy-ups; each line says where it is and a click shows it on the sheet; teacher wording for the common reasons. Word coverage chips say where each word is tested; Fix everything reports “Fixed X of Y”.
- Tests: 534 green (`tests/quality-check.test.mjs`, 9), smoke green.

## Fix: the Greek field shows in Step 2 of Worksheets (2026-10-21, from the user)
- With the Greek switch on, the Greek cell of every word row was drawn but invisible: `styles/lesson.css` (loaded for the whole app) had a bare `.greek { display: none }` for the lesson player, and the row's cell is `.wr-f.greek`. The lesson rules are now scoped to `.lesson` (same behaviour inside lessons).
- Tests: 525 green (`tests/lessons.test.mjs` +1: no unscoped `.greek` selector in lesson.css).

## Fix: a unit test's book and unit print once (2026-10-21, from the user)
- The header of a unit test showed “Primary Path 2 · Unit 4” under the title and again on the right (book, unit). The test builder had copied the unit label into the subtitle. Now a unit test keeps that label in `meta.label` (the library still shows it) and its subtitle is empty unless the teacher writes one; a topic test is unchanged.
- Saved unit tests are fixed when they open (`relabelDoc`): a subtitle that starts “Primary Path N · Unit …” moves to the label; any other subtitle, including one the teacher wrote, stays.
- Tests: 524 green (`tests/paper-layout.test.mjs` +1).

## Fix: instructions name the real options (2026-10-21, from the user)
- A grammar part with four options said “Choose the right answer: a, b or c.” (and «…a, b ή c.»): the instructions were fixed per task, and the AI's own instruction can say it too. `fitChoiceLetters` / `sectionRubric` (doc-model.js) rebuild the letter list from the part's real number of options (a, b or c · a, b, c or d · …; English “or”, Greek “ή”): when a part is built or rebuilt (`normalizeSection`, so edits too), when a saved test opens (`relabelDoc`), on the paper and in Word. Seven tasks named letters (L-MC, L-GIST, R-MC, R-REPLY, R-SIGNS, R-MCCLOZE, G-MC). The task names “Listen/Read and choose a, b or c” became “Listen/Read and choose the answer”.
- Tests: 523 green, smoke green.

## A customisable paper header (2026-10-21, from the user; pages only)
- **Header** switches for every paper (`studio/paper-header.js`): school name, title, subtitle, the teacher's own line (text), book, unit number, unit title, pages, class, (tests) version, time, total points, and each student-box field (Name, Class, Date, Score — all off = no box; the old “Name & score box” switch still hides it). Presets: Everything / Simple / Minimal. One renderer for all (`worksheetHeaderHtml` with `facts`), the worksheet Word header and the test Word header read the same switches; no empty right column when book/unit/class are all off; the score box shows the test's total.
- **Where:** tests and dictations — a Header button in the page-control row (`js/header-dialog.js`; saved in `doc.meta.layout.header`, remembered for the next test/dictation via `spec.page`); worksheets — “Header: school, title, unit, class…” in the inspector (`state.preview.header`, all three sheets, carried in `meta.layout.header` for print/PDF/Word). The paper changes as the teacher clicks.
- Tests: 522 green (`tests/paper-layout.test.mjs` +1), smoke green.

## Shorter test papers; text size, spacing and examples controls (2026-10-21, from the user; pages only)
- **5 pages with big gaps:** every test part had `break-inside: avoid-page` (from the worksheet `.ex-block`), so a part that didn't fit jumped whole to the next page. Test and dictation parts now run on (`.studio-sheet .ex-block { break-inside: auto }`); a question, a text, a word box, a matching list, picture cards and a heading with what follows stay together. Also: six or more short meanings print in two columns (`match-defs.two-col`), tighter part spacing, and multiple-choice questions keep their a/b/c options neatly UNDER the question (the teacher prefers it to options on the same line) with less space inside the question (line-height 1.5, 12 mm instead of 14). Measured on a 6-part C Senior test with 8 questions a part: 5 pages → 3 at standard size (Smaller 3, Larger 4, Largest 5).
- **Text size** for every paper (`studio/text-size.js`: A− / A / A+ / A++ = zoom 0.9–1.25 on the sheet's content, so pictures and lines grow too; Word sizes scale with `scaledSize`): worksheets (inspector, next to Spacing; `state.preview.textSize`, `meta.textSize`), tests and dictations (a control row under the paper toolbar, saved in `doc.meta.layout` and remembered as the maker's next default `spec.page`).
- **Spacing** (Compact / Standard / Roomy, the worksheet density) now for tests and dictations too.
- **Examples** switch on tests: hides the solved question 0 on the student paper, version B and Word (an order task keeps its first event; the teacher's pack keeps them).
- Tests: `tests/paper-layout.test.mjs` (4). 521 green, smoke green.

## Add questions and lines (2026-10-21, from the user; pages only)
- **Test paper:** every part with questions ends with **＋ Add a question** (student paper; B is made from A), and the hover bar has **＋ Add after**. The dialog: **✨ Lingo writes it** — how many (1–5), where (start / after question N / end), which unit words (the ones this part hasn't used first), how hard (easier / like the others / harder), a wish; or **✎ I'll write it** — the editor's fields for the part's answer type. Lingo's questions: placeholders hold the places, `fixItemsPrompt` writes exactly those items (new, never a copy, a detail of the text/script no other question asks about), one retry, otherwise everything is put back. The part is checked again (numbers, match letters, points, minutes), Step 3 follows, Undo. Up to 12 questions a part.
- **Worksheets:** the line hover bar has **＋ Add after**: ✨ Lingo writes 1–3 new lines (words, a wish; each starts as a copy and is remade as a NEW line, its answer joins the word box), or ⧉ a copy that opens for editing. Undo.
- Tests: 517 green (insert + the Lingo add sequence), smoke green.

## Exactly the questions asked for; Delete a question; five new exercises (2026-10-21, from the user; pages only)
- **Bug: an 8-question listening came back with 5.** The task briefs capped the size (L-PIC "a short dialogue (6–10 turns)", L-MATCH "5–7 different people"), reading texts had a fixed length whatever the number of questions, and picture parts got only 16 picture words. Now: briefs scale with the items; every script part asks for at least `scriptLines` lines; generated texts grow with the questions (`partTextWords`, ~12 words a question); a ready-made text too short for the questions is said in the plan note (`textCapacity`) and the prompt; picture words = 3 per question (≥16). A part that still comes back short gets **one automatic second try** for just those parts, kept only if it has more questions (`topUpShortParts`); "Write it again" retries a short part once too.
- **Dictation:** a retry when sentences are missing (the better reply is kept); before making it, a note when picture words or book sentences can’t fill the count (`countNote`). Worksheets already validate every exercise and retry.
- **Old tests with empty letters after H** are repaired when opened (`relabelDoc`: match meanings, order boxes, picture-dictation pictures); the Word export no longer upper-cases a missing letter.
- **Delete a question** (test paper hover bar: ✎ Edit · ✨ Remake · 🗑 Delete): the part is rebuilt (numbers, match letters, word box, points, total, minutes), Step 3 gets the new count, Undo puts it back; a part keeps at least one question. **Worksheets:** lines have 🗑 Delete too (renumbers, its answer leaves the word box/list, answer key follows, Undo).
- **Five new exercises** (research: `docs/research/exercise-design.md`): Listen for the main idea (L-GIST), Choose the right reply (R-REPLY), Signs and messages (R-SIGNS, boxed notice on the paper), Read and choose the word (R-MCCLOZE), Look and tick or cross (V-TICK, picture + word, never sent to the yes/no key checker). Used in the Word check, Grammar check, Listening & speaking and Exam practice templates where they suit the class.
- Tests: `tests/test-maker-counts.test.mjs` (7). 515 green, smoke green.

## Fix: a match part with 8+ questions broke the test paper (2026-10-20, from the user)
- "Cannot read properties of undefined (reading 'toUpperCase')" and a blank paper: match parts (V-MATCH, L-MATCH) letter their meanings from `LETTERS`, which had only a–h, so 8 questions + the example had no 9th letter. `LETTERS` now runs a–z; the renderers no longer upper-case a missing letter; and `safePaperHtml` shows a note on the paper (the document stays saved) instead of a blank page if drawing ever fails. Regression test: every task × class × 3/8/12 questions, version B, teacher's pack, Word.

## Every screen has its own selection; Close; test templates (2026-10-20, from the user; pages only)
- **No borrowing between screens.** Test Maker and Dictation lost "My word list" (Worksheets → Step 2): a coursebook unit, or (tests) a grammar point or topic, plus own words. Each picker remembers its own choice (`storeKey`: `vm_tests_source_v1`, `vm_dictation_source_v1`, synced) and never reads the Worksheets class, book or words; their class defaults come from their own settings (B Senior at first). Old tests made from the list reopen as their book + unit (or as own words). The assistant has its own memory of the class/book/unit it last used (`vm_assistant_last_v1`) instead of the Worksheets one, and no "My word list (Step 2)" chip. Lessons remember their own book tab (`vm_lessons_book_v1`). Home's ideas and texts no longer name the Worksheets unit. The top bar's class / book / words chips are gone (each maker's header shows its own choice).
- **Lingo Arcade:** from the sidebar or Home it opens with its own remembered words and opens "Choose your words" when it has none (`openArcade({ standalone })`); a worksheet's "Play games" (`worksheetGames`, `data-action="ws-games"`) and a lesson use exactly their words (the remembered pick no longer replaces them).
- **Close:** the maker header shows ✓ Saved · Delete · **Close** for an open item (Close → toast with "Open again"); Worksheets shows **Start over** for a word list that isn't worksheets yet. "New test" / "New dictation" in the result outlines are gone (one way to close). Header tips open downwards (`data-tip-pos="bottom"` / new `bottom-end`) — above, the top bar covered them; part rows no longer clip their tips (no `overflow: hidden`).
- **Test templates (Step 2):** "How long, and what kind of test": Short / A lesson / Long, each with three templates (`TEMPLATES` in test-builder.js: Quick quiz, Word check, Grammar check · Unit test, Reading & writing, Listening & speaking · All 4 skills, End-of-term test, Exam practice). `templateParts` picks tasks that suit the class, never one task twice, none needing pictures when pictures are off; cards show the parts (skill icons) and minutes for the class; the class change keeps the template (`spec.template`). Tests: `tests/test-maker-templates.test.mjs` (4).
- Tests: 507 green, smoke green.

## One way to open, close and delete everything + Test Maker parts redesign (2026-10-20, from the user; pages only)
- **Bug:** deleting a test (Library, Home or the Test Maker's own list) left it open in the Test Maker, and the next edit saved it back; the same for dictations and worksheet units (a deleted unit's sheets stayed open and were re-saved as a new unit). Home's dictation rows only went to the screen without opening the dictation.
- **`js/made.js`** (new) owns what each maker has open and the only open / close / delete path: `registerMaker(kind, { openId, open, close, reveal, busy, unsaved })` for `unit` (main.js), `test` (tests.js) and `dictation` (dictation.js); `openMade`, `closeMade`, `deleteMade` (confirm, closes the open item first, **Undo** puts it back and reopens it), `reconcile` (an item deleted on another computer is closed, with a note). `recentDocs` / `saveDoc` moved here (studio-common re-exports them); a late save of a deleted doc is refused. Library, Home, the makers' recent lists and sync (`vm-sync-changed`) all go through it.
- **Same in every maker:** the header ends with ✓ Saved · Delete · New test / New dictation / New unit (`makerActsHtml`); the open item is marked "Open" in the Library, the makers' lists and Home ("open now"). The open test and dictation come back after a restart like the worksheet unit (`vm_open_docs_v1`, local-only, per profile). Part rewrites, fixes and question remakes that finish after their test was closed are dropped (`ts.epoch`, test-edit checks). Dictation "Make it again" replaces the dictation instead of adding a copy.
- **Test Maker Step 3:** one column of part rows, all the same height closed: number + skill, the exercise (opens the library), its kind, a one-line summary (questions, difficulty, chosen text, every setting, the wish) and the points; "Settings" opens one part at a time — what the children do with the paper preview and "Trains" beside all its settings. Above: a bar of each part's share of the points (click opens the part) and the recognise/recall/create mix. A new part opens ready to tune.
- Tests: 503 green, smoke green.

## Test Maker exercise library + unit reading texts (2026-10-20, branch `claude/test-maker-exercise-revamp-4vlf82`, from the user; pages only)
- **Exercise library** (`js/views/task-library.js`): "Change the exercise" / "Add a part" open a dialog with skill tabs and a card per task: kind badge (recognise / recall / create), class fit, Lingo's pick, what the children do, a small paper preview, what it trains, "Only for X Senior" filter. 37 tasks (`studio/tasks.js`, +19: L-MATCH, L-NOTES, R-WHO, R-QA, R-ORDER, R-WORDS, V-SPELL, V-DEF, V-COLLOC, V-FORM, G-QUEST, G-CLOZE, G-TRANS, W-SENT, W-EMAIL, W-STORY, W-OPINION, S-STORY, S-DISCUSS) with `kind`, `fit`, `knobs`, `blurb`, `sample`, `trains`; per-class defaults and second picks.
- **Part cards** (tests.js parts step): the exercise as a button with badges and preview, difficulty slider for every task, setting chips (text length/type, recording, plays, options, hints, support) stored in `part.opts` (`partOpts` fills class defaults), and a "This test" recognise/recall/create mix bar.
- **Reading texts** (`studio/reading-texts.js`): 81 curated texts (fact, story, everyday) for every unit of CPP 1–3; reading parts get the unit's text automatically (`fitTexts`), the teacher can switch or let Lingo write one; a given text is used verbatim on the paper and kept by rewrites.
- Paper/Word: R-ORDER boxes and letters, hints, W-SENT lines. Research notes: `docs/research/exercise-design.md` → "Test Maker exercise library".
- **Word families for every class** (follow-up): V-FORM fits A–E; the prompt gets a per-class ladder (`FAMILY_LADDER` in test-builder.js) and a "Word help" setting prints the base word inside the answer (`familyHint`, default A–C).
- Tests: `tests/test-maker-library.test.mjs` new; 502 green.

## 3.5.3 — Remake that obeys, the Save window, any class with any book, a rail sidebar (2026-10-20, from the user)
- **Remake obeys the wish** (`studio/remake.js`): the wish becomes rules built from the question itself — the word it is built on (what all the options share, e.g. "medicine"), its forms to avoid, the situation words, words the other questions use, new words to pick from — and checks on the reply (still uses the word, nearly the same, not shorter, same wrong options, missing a required word). A reply that ignores the wish goes back with the reason (retry hint), up to 3 tries; otherwise nothing changes and the teacher is told why. Same for Worksheets lines (`remakeWorksheetItem`). Root cause of "always the same word": the vague chip text plus "answers come only from these words" on grammar parts — that rule now applies only to V-PIC, V-BANK, V-MC, R-GAP, L-GAP.
- **Write it again / Rewrite part / Make it again / Rewrite Dictation or Lingo only** now tell the AI the old version to move away from (and the teacher's wish first); a part that comes back nearly the same is sent back once (`partSimilarity`).
- **Save window** (shell): `will-download` no longer cancels the download; Electron shows the Save window (`item.setSaveDialogOptions`), "Saved …" appears only once the file is written, with Show in folder.
- **Any class with any book**: the assistant keeps the book the teacher named (the AI's guess from the class no longer replaces it; the prompt says any class may use any book); a missing class comes from the class open in the app; Worksheets keeps the chosen class when the book changes; Test Maker keeps a class the teacher once chose (`levelChosen`) and otherwise says when it follows the book; book cards say "Usually B Senior"; the unit context tells the AI to write for the class.
- **Chrome**: no "Play games" in the header (Lingo Arcade is in the sidebar); the header shows the screen's coloured icon, name and an Ask Lingo button. The sidebar is a 76px rail that slides out over the page on hover (pin button or Ctrl+B keeps it open, `prefs.sidebarPinned`); narrow windows always use the rail. The edit tip is one quiet line in the paper toolbar.
- Tests: 491 green (`tests/remake.test.mjs` new), smoke green.

## 3.5.2 — ChatGPT exercise remakes (2026-10-20, from the user)
- Reproduced the misleading connection error with a synthetic GPT-6 Luna test-part rewrite: the live route rejected JSON-object mode because the input message did not mention JSON, even though the separate instructions did.
- The shared ChatGPT adapter now adds the JSON output instruction to the input for every generation and remake. HTTP errors retain the server message or direct-admission detail; stream errors retain their message too. Model choice, account storage, and worksheet logic are unchanged.
- Added regression coverage for a real test-part prompt and for HTTP errors without an error code, including direct-admission failures. All 480 tests pass; desktop and packaged smoke checks pass. The corrected runtime completed a live synthetic five-question GPT-6 Luna rewrite without changing saved exercises or the connection.
- Version 3.5.2 in both packages and lockfiles, with updated README download names. Distribute the shell fix through a versioned Setup/Portable release with latest.yml and the installer blockmap; portable users download the new executable.

## After 3.5.1 — edit everything, remake one question, page tags, Worksheets as a stepped maker (2026-10-20, from the user; pages only, reaches apps by live update)
- **Test Maker** (renamed from "Unit test"). Step 5: everything on the paper is clickable and editable (title, instructions + Greek, text, word box, words-and-meanings, each question and the example, writing task, speaking cards, listening script and how often it plays; on the teacher’s pack: scripts, speaking script, model answer) — `js/views/test-edit.js`. A hovered question shows **✎ Edit / ✨ Remake** (Lingo rewrites only that question, with a wish, quick chips or "Surprise me"); a part heading has **✨ Rewrite part** (with a wish). Every change re-checks the part (`reviseSection` in test-builder.js, which keeps the pictures and the Greek rubric) and has Undo in its toast.
- **Worksheets**: each line on the sheets also has **✨ Remake** (`remakeWorksheetItem` in app.js). The four steps are now one maker like Test Maker and Dictation (warm orange): a header with the brand, a summary and step pills (Class & unit · Words · Exercises · Your sheets), New unit in the header, page headings, the footer shows "Step n of 4" and what is ready. The sidebar has one Worksheets item (no sub-steps).
- **Page tags**: word chips show a very small coursebook page (Worksheets pool, Test/Dictation pickers, assistant plan, game deck picker); `unitWords` now carries `page`.
- Fixed: the exercise plan’s two columns overflowed; saved Test Maker settings with an unknown task no longer break the screen.
- Tests: 484 green (`tests/studio-smarts.test.mjs` +4), smoke green.

## 3.5.1 — class memory, a Library of everything, smarter tests (2026-10-20, from the user)
- **Updates:** "Restart now" relaunches (portable copies restart from their real exe; a `--relaunch` copy waits for the single-instance lock). Page updates apply in place (`applyPending` + reload, no restart). A floating card announces ready updates ("Update now" / "Restart to update" / "Download") and "Vocab Master is up to date" after one.
- **Busy popup** rebuilt (`busy-*` classes; the old `.sb-step` clashed with the sidebar badge): owl, step checklist, progress bar.
- **Speaking parts:** warm-up + speaking cards (title, student instruction, key words) for students; questions, follow-ups and a model answer for the teacher; new S-ROLE role-play (Student A/B); 4-row rubric. In the paper, the pack and Word.
- **Outline problems** are spelled out per part, with "Fix question N": the AI rewrites only those items (`problemTargets`, `fixItemsPrompt`, `applyItemFixes` in test-builder.js); a part missing its text/script/cards is written again whole.
- **Distractors:** `DISTRACTOR_RULE` (same word class, real Greek-learner errors, never mix grammar points) and a per-part **difficulty slider** (1–5, `PART_LEVELS`) for choice and word parts.
- **Word lists** fold at 40 ("Show all N words"); × on a chip removes it (switches to Selected words), tapping re-adds.
- **Library** (renamed from "Saved units") lists worksheets, unit tests and read-aloud dictations, with tabs, search, class filter, open/delete; backups include tests and dictations; up to 300 docs kept (synced item by item).
- **Save dialog** titles and file types per kind ("Save listening track", WAV, in Music; Word/PDF in Documents).
- **Class memory** (`studio/class-memory.js`, opt-in, `vm_class_memory_v1`, synced): per class, every word met in saved worksheets, dictations and tests; Leitner-style review (gaps 7/14/28/56 days, never-tested first). Test and dictation Step 1 show "Review earlier words" chips; the assistant understands "revise earlier words / επανάληψη" (`plan.review`) and asks consent once; prompts get a CLASS MEMORY brief.
- **Listening audio** stays a per-computer cache (IndexedDB `vm-voices`): natural voices remake for free; the saved test keeps the script, so nothing is lost. Not synced across computers (would need cloud file storage).
- Tests: `tests/studio-smarts.test.mjs` (9). 477 green, smoke green.

## 3.5.0 — a smarter assistant (which words), and the app updates itself (2026-10-20, from the user)
- **Assistant: which words.** It used to take each unit's key words whatever the teacher said, and the plan didn't show the words at all.
  - `studio/word-choice.js` (pure): `findWordChoice` reads all / key / "15 words", "a few" / a mix / "only …" / "all except …", plus the parts of the unit ("Lesson A", "and the workbook", "not the Big Question"; a part named alone = all its words). English and Greek.
  - Lists end where the request goes on (`cutList`, also used for own words).
  - `chooseUnitWords` gives the words themselves: key words first, spread over the unit; never more than asked.
  - **Bug fixed:** `selectSmartCoursebookWords(list, 0)` returns everything. A number filled by key words alone sent every word to the dictation; now `spread()` guards it, with a regression test.
- **Assistant, more:**
  - skills left out ("no listening", «χωρίς ακρόαση»); questions per part ("5 questions each"); pictures on/off; a title ("called …");
  - length from minutes; "from the book sentences" = a read-aloud dictation written by the coursebook.
  - The AI fallback prompt returns `vocab` / `addWords` / `items` / `pictures` / `title` / `writer`, validated in `mergeAiPlan`. Worksheets default to "Fits the class" (SMART_PICK).
- **Plan card — Which words?:**
  - Key words / All / A number (stepper) / A mix / I'll choose (and Fits the class for worksheets).
  - The unit's parts with counts; the chosen words (key words amber, × leaves one out, "Left out: … ↺" puts it back); own words (add / Enter / paste).
  - Plus Questions in each part, Who writes the sentences (dictation), Title and Pictures.
- **Hand-off:**
  - Tests and dictations get exactly the shown words: plain key / all stay live choices; anything finer goes as a pick, and words not in the unit become own words.
  - Worksheets get those words in Step 2; a word-list plan with own words adds them.
- **Live updates** (`desktop/live-update.js`):
  - `scripts/live-base.cjs` (predist) writes `renderer/live-base.json` (gitignored): the commit and every page file's Git blob fingerprint.
  - The installed app asks GitHub's API for `main`'s newest commit and file tree (2 requests; repo is public). It builds `userData/live/<commit>/`:
    - all code copied from the installed app or downloaded;
    - changed assets downloaded and each verified against its blob SHA-1;
    - voice clips never (they aren't in Git).
  - `app://` serves the live copy (deleted files 404), and so does the Word engine (`loadEngine`).
  - Used from the next start, or at once via Restart.
  - Safety:
    - the pages must call `updates:alive` within 45 s, or (crash, failed load) they are set aside as bad and the app restarts on the last good pages;
    - two starts without alive also revert;
    - a new exe clears live pages;
    - `renderer/live-requires.json` "shell" above `SHELL_API` waits for a new exe;
    - updates over 150 MB wait for a new exe.
  - Checks 20 s after start, then every 3 h; Settings switch "Update automatically".
- **Exe updates** (`desktop/exe-update.js`): electron-updater with the GitHub provider (publish config; `dist` uses `--publish never` and makes `latest.yml`). It downloads in the background and installs on restart or quit. The portable exe gets a "version X is available — Download" toast.
- **UI** (`js/updates.js`):
  - toasts: "Vocab Master was updated — <commit message>" once, "An update is ready … Restart now", "Version X is ready — Restart to install";
  - Settings → Updates card (up to date / checking / downloading % / ready / needs a new app / offline), with Check now, Restart, Download, Update automatically, and the version + pages date;
  - Help → Check for updates.
- **Releasing an exe** is now `npm run release` (`scripts/release.mjs`): checks main is clean and pushed and the tag is new, then tests, dist, package check, packaged smoke, `gh release create` with Setup, Portable, `latest.yml` and the blockmap. No CI build: voice clips aren't in Git, so only this PC can build a full exe. RESUME.md "Shipping changes to teachers" explains which changes need what.
- **Checks:**
  - `npm test` (new `tests/word-choice.test.mjs` 6, `tests/live-update.test.mjs` 7, with a fake GitHub: update, gaps from the installed app, deletions, path escape, rollback after 2 bad starts, revert, new exe, tampered download, needs-app, auto off).
  - Real GitHub, with a temporary branch (`live-update-test`, deleted afterwards):
    - Node run: 1.8 s, only the changed files downloaded, the changed title served.
    - Electron run 1 → update ready; run 2 → the window loaded the updated title, alive cleared the trial.
    - A broken-page commit → after 45 s "live: reverting … the pages did not start", marked bad, restarted on the last good pages.
  - Browser: assistant word panel, interactions and every hand-off (test, dictation, worksheets — the browser's own Step 2 list restored); Settings → Updates in all its states (stubbed bridge).
- **Released with `npm run release`:** GitHub release **v3.5.0** is Latest (tag on 6c070c9): Setup, Portable, `latest.yml`, blockmap. Package verified, packaged smoke passed; the packaged app (separate data folder) logged "live: current" and "exe: current" against GitHub.
- **Not tried:** a real exe-to-exe auto-update (needs a release newer than the installed one; the first will be 3.5.0 → the next version). 3.4.0 and older have no updater: teachers install 3.5.0 once by hand.

## 3.4.0 — the teacher's own words, mixed in everywhere (2026-10-20, from the user)
- **Asked:** a teacher picks a unit (and some of its words) but also wants to test other words of their own, in every feature.
- **Audit:**
  - Worksheets already allowed it (Step 2 is free typing over the pool).
  - Unit test, Read-aloud dictation, the arcade (and so Lingo Live) and the assistant did not.
  - The arcade could play book words *or* the worksheet's words, never both, and nothing outside the books.
- **`studio/own-words.js` (pure):**
  - `parseOwnWords`: commas / semicolons / new lines; optional Greek as "word - ελληνικά", "word = …", "word (…)"; list bullets and numbers stripped.
  - `addOwnWords`, `ownWordEntry`: the coursebook's type, Greek and example from any book; the teacher's Greek wins; `own: true`.
  - `mergeOwnWords`: no repeats.
- **Unit test & dictation (shared picker, `studio-common.js`):**
  - An "Add your own words" box in all three sources (a unit, my word list, a grammar point or topic). Add / Enter / paste a list; chips with ×; "Remove all"; a word already in the unit's list shows faded and counts once.
  - `value().focus` = source words + own words; the labels read "… + 3 own words".
- **Tests:**
  - The prompt names the teacher's own words.
  - A topic test can be built around words alone (`planProblems`), and the prompt's vocabulary parts test them.
  - Saved tests remember which words were own (`focusWords[].own`) and reopen with them.
  - The topic picture message now says "needs 3+ words with pictures (add them under the topic)".
- **Dictation:** coursebook-sentence dictations put own words first (`bookSentences`). The ready card names own words the books have no sentence for, and suggests the AI.
- **Arcade:**
  - "Choose your words" has an "Add your own words" box and "＋ My worksheet words", which adds the worksheet's words to a book pick; "Only my worksheet words" keeps the old behaviour.
  - Decks = book rows (trusted pictures) + own words (looked up in the bank, illustrated picture when there is one).
  - `vm_arcade_pick` is now `{ ids, own }` (old arrays still read); saved decks keep `own`; `describeDeck` / `ownNotPicked` in `deck-source.js`.
- **Assistant:** `findOwnWords` reads "… plus the words crater, lava and ash cloud", "also test: island, coast", "extra words: penguin - πιγκουίνος", «… και τις λέξεις …» (not "the words of unit 4"). The words go to the test / dictation as own words and to Worksheets → Step 2 (topic worksheets: in the brief). The plan summary lists them.
- **Version 3.4.0** (root + desktop package.json and locks, READMEs; the README tour mentions own words).
- **Released:** GitHub release **v3.4.0** is Latest (tag on 60ec07e) with the Setup and Portable exes (190 MB each, same bytes as desktop/release/; package verified; the unpacked app passes `--smoke`).
- **Checks:** `npm test` 455 pass (new `tests/own-words.test.mjs`, 6 tests). Tried in the web app:
  - unit + own words (add, Enter, paste a list, remove, duplicate shown once), topic with words, the ready card;
  - a coursebook dictation with an own word from another unit (first) and one not in the books (named);
  - the arcade (book unit + 2 own words → 147, played, remembered after reopening);
  - the assistant ("… plus the words crater, skateboard and ash cloud" → the test's own words).

## GitHub release v3.3.0 published (2026-10-20, from the user)
- Releases had stopped at v2.0.0 (2026-10-16); 3.0–3.3 were never published. **v3.3.0** is now the Latest release (https://github.com/nosvasedis/vocab-master/releases/tag/v3.3.0), tag on `main` 4b7e9ec, with `Vocab-Master-Setup-3.3.0.exe` and `Vocab-Master-Portable-3.3.0.exe` (same bytes as `desktop/release/`, built from fb73205; only docs changed after). The notes cover everything since 2.0. README heading says 3.3; its download link (releases/latest) now gets 3.3.0.
- **For the next release:** bump the version (root + desktop package.json), `npm run dist`, then `gh release create vX.Y.Z desktop/release/Vocab-Master-Setup-X.Y.Z.exe desktop/release/Vocab-Master-Portable-X.Y.Z.exe --latest`.

## Unit test & Read-aloud dictation as full-screen step-by-step makers (2026-10-20, from the user)
- **Asked:** "a fuller screen experience, step by step, more aligned with the Worksheets stuff but better and nicer; dictation and Unit test visually distinct". This replaces the two-column builder and the compact picker below.
- **Wizard shell** (`wizardNav`, `createWizard` in `studio-common.js`; `.mk-*` in `studio.css`):
  - A sticky tinted header with the maker's badge and a summary line, plus clickable step pills (number → tick once passed; "Your test" stays locked until there is one).
  - One full-width page per step, and a sticky bar: Back · plan warnings or the size of the test · Next / Write.
  - The last step is the paper, with an outline column beside it.
- **Identity:**
  - Unit test: indigo → sky with a dot-grid header.
  - Dictation: emerald → teal with a sound-wave header.
  - The pills, chosen cards, Next button and voice bar follow each maker's colour (`--mk`, `--mk-2`).
- **Source picker** (both makers):
  - Three cards: a coursebook unit / my word list / a grammar point or topic (tests only).
  - The Worksheets book covers and unit tiles (9 in a row, with titles), and a "Several units" switch (tests).
  - A unit panel with the parts of the unit, the words to test and the chosen words as chips.
  - "My word list" shows its words and a "Change the list" button (goes to Worksheets → Step 2).
- **Unit test steps:**
  1. Content (source + Grammar card + "What the texts are about" card, recent tests).
  2. Class (Worksheets level cards and class details) and length (three cards) with difficulty.
  3. Parts (two-column part cards, add tiles).
  4. Finish (title, versions, switches + a sticky "Ready to write" summary whose rows jump to their step, and Write my test).
  5. Your test (outline with "Write it again" per part, Change the parts, New test; toolbar, listening, problems, paper).
  - Writing moves to step 5 with Lingo's overlay; a failed first try goes back to Finish. A test opened from Home or the recent list opens on step 5.
- **Dictation steps:**
  1. Words.
  2. Style (big cards with "Great for A–B…").
  3. Class & the sentences (level cards, sentence settings in two columns, Grammar and Theme cards, greyed when the coursebook writes the sentences).
  4. Finish (who writes, reading, switches + "Ready to make").
  5. Your dictation (outline with the sentences, Make it again, Another style, New dictation; Read it aloud in the toolbar).
- **Checks:** `npm test` 449 pass; `npm run smoke` passes. Tried in the web app at 1440 and 1024 px, light and dark:
  - every step of both makers, Back/Next, pills, ticks and the locked result;
  - trash a part, "Several units";
  - a sample test opened on step 5 (outline, toolbar, problems);
  - a real coursebook-sentence gapped dictation made end to end.
- **Not tried:** writing a test or an AI dictation with a real AI key (no key in the preview browser).
- The 3.3.0 installer and portable exe are rebuilt with it (package verified; the unpacked app passes `--smoke`).

## Compact, step-by-step source picker (Unit test + Read-aloud dictation) (2026-10-20, from the user, replaced by the section above)
- **Seen:** Step 1 was a wall of chips, and unit 9 wrapped onto its own line.
- **Source picker** (`createSourcePicker` in `studio-common.js`):
  - A quiet segmented bar: A unit · My words · Grammar/topic.
  - Unit mode is a card of four lines (Book · Unit · Parts · Words). Each line shows what's chosen; tapping one opens only its options (`pickRow`, `.pk-*` in `studio.css`).
  - Picking moves on: a new book opens Unit; one unit, Key words or All closes the line.
  - Units are a fixed 9-column grid; parts are 2 columns.
  - Tests: a tap switches unit, and **Several units** turns on adding (restored tests with 2+ units start with it on).
  - The word summary is clamped to 2 lines.
- **Unit test Step 1:** Grammar and Texts are two more lines under the source. Their closed value says what applies ("The unit's grammar", "Unit 7 · Why is free time important? · a school trip") and updates while typing. Only one line is open across Step 1; a topic test opens Grammar.
- **Dictation step 3:** the "Grammar & a theme" fold is now the same two lines. With coursebook sentences they say "Not used".
- **Checks:** `npm test` 449 pass; `npm run smoke` passes. Tried in the web app at 1440 px, light and dark, on both screens: book → unit → close, several units on and off, parts and words, grammar typing, one line open at a time, and dictation with AI or book sentences.
- The 3.3.0 installer and portable exe are rebuilt with it (package verified; the unpacked app passes `--smoke`).

## Unit test: parts can be deleted again; Step 1 decides grammar, texts and parts (2026-10-20, from the user)
- **Bug:** the trash can (and the move arrows) on a part did nothing. The parts click handler took the step `<section data-step="3">` for a stepper button and threw. Now it only matches `[data-stepper] [data-step]` (same guard in `dictation.js`).
- **Why the revamp:** "Grammar, a theme & the title (optional)" sat in Step 2 whatever Step 1 said, so a topic test asked for its topic twice, a coursebook unit was offered a free theme and a generic grammar menu next to its own, and stale prefs leaked a theme into topic tests.
- **Step 1 "What does the test cover?"** (`renderFocus` in `js/views/tests.js`): under the source picker, the grammar and the texts change with the source.
  - *Coursebook unit*, or *My word list* from the coursebook: grammar defaults to **The unit's grammar** (from the book's example sentences; choosing a chip only puts the focus on it). The texts are shown as the unit's Big Question, with an optional setting.
  - *My word list* with no unit: **What the class knows** by default, plus "What are the texts about?".
  - *A grammar point or topic*: the Step 1 text is the topic and the chips are the grammar to test (either one is enough). There's no second theme field.
- **Title** moved to Final touches. When it's empty, the placeholder shows the title the test will get (`defaultTitle`). It is cleared on a unit change and on New test, and editing it renames an open test.
- **Parts follow the source** (`taskBlock`, `taskForSource`, `fitPartsToSource` in `studio/test-builder.js`):
  - Picture tasks need 3+ words with pictures; the Big Question talk needs a unit. Tasks that don't fit are greyed out in the menu with the reason.
  - Added parts get a task that works, and a source change swaps blocked parts (with a toast).
  - `planNotes`: a soft note when a one-word-answer part has more questions than chosen words.
- **Prompt:** a topic test's topic is the Step 1 text only. Without a unit, the grammar line asks for what the class knows (not "the unit's example sentences").
- **Other:**
  - Opening a saved test (recent list or Home) sets Step 1 back to its book, units, sections and exact words (or its topic) and leaves its parts as written.
  - A class change keeps the grammar, theme, difficulty and switches.
  - The picker's `onChange` now gets `{ byUser }`.
- **Checks:** `npm test` 449 pass (3 new in `tests/studio.test.mjs`). Tried in the web app:
  - trash, move, add;
  - word list → topic → unit, with blocked tasks swapped and greyed;
  - grammar and title, the title reset on a unit change;
  - a saved test reopened with Step 1 restored and no part changed;
  - title rename and trash on an open test;
  - Dictation steppers.
- `npm run smoke` passes. `desktop/node_modules` was missing (gone with the worktree cleanup); reinstalled with `npm --prefix desktop ci`. The 3.3.0 installer and portable exe are rebuilt (package verified; the unpacked app passes `--smoke`).

## Fix: Step 2 words no longer preselected (2026-10-20, from the user)
- Opening the app without a draft and pressing **New** used to fill Step 2 with a smart pick (`loadPoolWords` in `main.js`). Now a new unit starts empty; words load only when the teacher picks a book / unit / section / Load option in Step 1, or presses **Load unit words** in Step 2's banner (it reads "Reset to unit words" once there are words). Changing the class no longer fills an empty list. `npm test` 446 pass; checked in the web app (New, reload, class change, Load). The 3.3.0 installer and portable exe are rebuilt with it (package verified, the unpacked app passes `--smoke`). Cleanup: the merged worktrees and local branches are removed.

## Studio redesign: Home, Unit test, assistant, sidebar, arcade words, word targets (2026-10-20, branch feature/studio-redesign, from the user)
- **Home screen** (`js/views/home.js`, `styles/home.css`): the app now opens on Home. A greeting (English + Greek, by time of day), "Ask Lingo" (sends the request straight to the assistant, `askAssistant()`), three ideas from the current unit, the four makers as cards, "Pick up where you left off" (the worksheet unit with its 4 steps, plus recent tests, dictations and saved units by date; a saved test opens in the Unit test screen via `openSavedTest()`), and "In class" (lessons, arcade, projector, saved units). A warning card when no AI is connected. The old Step 1 welcome card is always hidden now.
- **Sidebar:** "Home" at the top; the CREATE group (4 worksheet steps + New unit) is one **Worksheets** item under MAKE that opens the step the teacher was last on and unfolds the steps while they are in the flow (`lastFlow` in main.js). `go()` falls back to Home for unknown views; `#btnNew` lives inside the group (Ctrl+N unchanged).
- **Unit test** (`tests.js`, `studio.css` "Unit test builder"): sticky header with the unit and class; numbered steps on a rail; class as five colour tiles; length cards with icons; grammar / theme / title folded into "Grammar, a theme & the title" (count badge); parts as cards coloured by skill (listening blue, reading green, vocabulary violet, grammar amber, writing rose, speaking teal) with steppers and a points pill; dashed "Add a part" tiles; switches as a list; a sticky footer with points · parts · minutes and **Write my test** always visible. Paper side: dotted canvas, sticky glass toolbar, joined export group, **New test** button; the empty state is a hero, four feature cards and a gallery of recent tests (the left-column recent list is gone). All element ids kept.
- **Teacher assistant** (`assistant.js`, `studio.css` "Teacher assistant"): intro is a centred greeting with a gradient headline over a soft aurora, six starter cards by kind, and one large composer (auto-growing, glows when ready). In a conversation: glass chat with the composer docked, "Lingo" name on its messages, answer buttons that animate in; the plan appears only once there is one, as a ticket with a colour header by kind (summary sentence, class badge), kind tiles, class colour tiles and a sticky "Create it now" footer.
- **Arcade:** "Choose your words" is remembered (`vm_arcade_pick`, classified in `js/sync/registry.js`); the arcade reopens with the same words until the teacher picks again or goes back to the words it was opened with. The bottom "Words in your deck" strip is removed (and its leave-out / undo code).
- **Word targets per class** (`WORD_TARGETS` in state.js): A 10–12, B 12–15, C 16–18, D 18–20, E 20+ (`targetText()`; the meter never says "over" for E). "Smart pick" now loads the top of the class range (`SMART_PICK`: 12 / 15 / 18 / 20 / 22) and reloads when the class changes (toast with Undo). The Load menu: Smart pick (fits the class), 10, 12, 15, 18, 20, 24, All. The assistant's freeform worksheet brief uses the same target. `defaultVocab` in CLASS_PROFILES aligned (it is not read anywhere).
- **Checks:** `npm test` 446 pass; `npm run smoke` passes. Tried in the web app (light and dark): Home, the Worksheets group, Unit test (empty, saved test open), assistant (intro → plan), Step 1 targets (A 12, C 18, E 22, B 15 words), arcade pick kept after Exit and reopen.
- **Not done:** the Dictation screen still has the old layout (same shared `.st-card` styles); exes not rebuilt.

## Read-aloud dictation redesign (2026-10-20, branch feature/dictation-redesign off feature/studio-redesign, not merged)
- The dictation screen now uses the Unit test builder design (`.tb`): sticky header with a summary, numbered step rail, class colour tiles, two-column style cards, source cards, switch list, sticky footer with the size and `#dcGenerate`, glass toolbar, hero + recent-dictations gallery (replaces the left recent list). All element ids and behaviours kept; new `#dcNew`.
- Checked in the web app (light, 1440 px; free coursebook dictation made). Not checked: dark mode, `npm test`, `npm run smoke` (stopped early, usage).

## 3.3.0 — natural and studio listening voices (2026-10-20, branch feature/natural-listening-voices, from the user)
- **Why:** test listenings and read-aloud dictations used the computer's speechSynthesis voices, which sound robotic.
- **Three engines** (`studio/voice-cast.js` `ENGINES`; the teacher picks one in Settings → Sound → Listening voices, or on the listening bar / reading-voice bar; saved as `prefs.listeningVoices`, default `natural`):
  - **Natural** — Kokoro-82M (Apache-2.0) in a module worker (`js/voices/kokoro-worker.js`), vendored web build in `vendor/kokoro/` (see its README: one-line patch exporting `transformersEnv`). The 8-bit model (≈92 MB) downloads once from Hugging Face and stays in the browser cache; free and offline afterwards.
  - **Studio** — Gemini 3.8 Flash TTS through the Interactions API with the teacher's own Gemini key (`studio/gemini-voice.js`, same request format as `scripts/lib/gemini-tts.mjs`). A dialogue of ≤2 speakers is one conversational request (real turn-taking); delivery notes per class level. Measured: 34 s of dialogue = $0.0078, so about 1.5 ¢ per test. Without a Gemini key it falls back to Natural.
  - **Computer** — the old `studio/tts.js`, also the last fallback if anything fails, so a lesson never stops.
- **Speed (measured on the teacher's PC):** browser tab single-threaded ≈ 0.5× real time; Electron with 4 threads ≈ 0.9× (first sentence of 4.2 s made in 5.5 s incl. warm-up); WebGPU needs the 326 MB model, so not used. Playback starts with the first line while the rest is made; every clip is cached in IndexedDB (`vm-voices`, newest ~1,500 kept), and the natural clips of a test are made in the background when it opens, so class playback is instant.
- **Casting:** speakers by role from their names (girl / boy / woman / man; Mrs, Dad, Grandma, Teacher…), never two speakers on one voice. Natural: af_heart / af_bella (girls), am_puck / am_fenrir (boys), bf_emma (women, the dictation reader), bm_george (men). Studio: Leda / Laomedeia, Puck / Fenrir, Kore / Aoede, Charon / Orus. Natural speed by class (A 0.84 … E 1.0), slower for the dictation's second reading.
- **Audio files:** each test track can be saved as a WAV (both plays, 4 s apart, levelled) from the listening bar (`studio/audio-track.js`: WAV encode/decode, trimming, levelling, layout).
- **Desktop:** `app://` now sends `cross-origin-opener-policy: same-origin` + `cross-origin-embedder-policy: credentialless` (threads for WebAssembly; R2 pictures still load, the app opens no popups). CSP: `'wasm-unsafe-eval'` and the Hugging Face hosts. `.wasm` MIME in both servers. The Gemini bridges (proxy.js, main.js) also forward `/v1beta/interactions`.
- **Checks:** `npm test` (new `tests/voices.test.mjs`, 6 tests); `npm run smoke` now also checks isolation, the WebAssembly engine and the voice worker; `electron desktop --smoke --voices` downloads the model and speaks one sentence (opt-in, needs the internet). Tried in the web app: the Unit 4 test plays with natural voices (9 lines made and played in 30 s), a 56 s WAV saves, the dictation reads 24 readings with highlighting, Settings shows the choice. Studio voices tried through `node scripts/studio/try-voices.mjs` and through the web server's route. Samples to compare: `work/studio/listening-1-natural.wav`, `work/studio/listening-1-studio.wav`.
- **Not done / ideas:** studio voices were not tried inside the app with a real Gemini key (no key saved in the browser profile); MP3 instead of WAV for smaller files; a "voice per character" picker; mirroring the model on R2 if Hugging Face is blocked on a school network.

## Sync fixes: stuck uploads, "Permission denied", the AI-keys switch (2026-10-20, branch fix/sync-uploads, merged; from the user)
- **Seen:** a new account stuck at "19 changes waiting to upload" with "Permission denied", and turning on "Sync my AI keys" broke the Settings window's layout.
- **Cause of the refusal:** the live database still runs the Lingo-Live-only rules. `users/{uid}` (firebase/database.rules.json) was never deployed (the "waiting on the user" step below). With the committed rules on the emulator, the same flow syncs (3 classes + the key vault).
- **Uploads (`engine.js`):** a refused write is retried record by record, so one bad record (over the 4 MB / id limits, or breaking a rule) no longer holds every other change back; refused records stay on the computer, are named in the status ("1 item couldn't upload (Saved worksheets)…"), and are retried when they change or on "Sync now". A refused read (`watch` errors were swallowed) now shows as a sync problem instead of a silent hang. Errors are in plain words (`friendlySyncError`).
- **Layout:** `.switch` had no positioning box, so its hidden checkbox was placed against the whole dialog; focusing it scrolled the dialog itself (head gone, footer mid-window). `.switch { position: relative }` (base.css).
- **Messages** in Account & sync now appear next to the button pressed (main actions, AI keys, backup…), not under "Backup file", and aren't repeated when the status line already says it.
- **Checks:** `npm test` 440 pass (4 new in `tests/sync.test.mjs`). Checked in the web app against the local emulators: sign-up, key sync on, the dialog no longer scrolls, refused uploads (rules switched off on the emulator) show the plain message and "3 changes waiting", and they upload by themselves once the rules allow it. `check/ai-key-3.2.0` is merged into `main` (2026-10-20); the 3.2.0 installer and portable exe are rebuilt (`desktop/release/`, package verified, packaged-app smoke passes).

## 3.2.0 checked with a real DeepSeek key (2026-10-20, branch check/ai-key-3.2.0, from the user)
- **Checked in the web app** (the teacher pasted the key in Settings) and with `try-studio.mjs --provider deepseek`. Spend about $0.04 (balance $2.49 → $2.45); the script calls are in the ledger (new `deepseek` provider, $0.10 cap, prices in `content/pricing.json`).
- **Worksheet, CPP2 Unit 4, B Senior:** default run correct (3 × 5 items, all 15 words, bracket answers mixed). Fine-tune 7 items / longer / a bit harder / +2: 7 items each, longer sentences, 3 options instead of 2, no warnings. "Rewrite Dictation only" with "a bit easier" really was easier. Unit 5: put-away toast, fresh generation, no Unit 4 word anywhere. Word-bank pictures: all 15 real pictures load.
- **Unit test, CPP2 Unit 4, all 4 skills, A + B:** generates, both listening tracks play (one computer voice per speaker), key and marking scheme correct, 31 real pictures in each version, Word (student + teacher) and the PDF print document build.
- **Read-aloud dictation:** AI, gapped, 8 sentences, Past Simple (typed as own grammar): short B Senior sentences, gaps right, the player reads slowly, twice, with punctuation (on by default for B).
- **Assistant:** E-class Present Simple vs Present Continuous test (local, then made); "a dictation for unit 4" asks "Which dictation do you mean?" and both answers work; "κάνε μου ένα τεστ για την ενότητα 3" → test plan locally; "something fun for my D class tomorrow" → one small AI call.
- **Fixed (each with a regression test):**
  - Unit tests: Yes/No (true/false) keys contradicted the script ("no" for things Anna said). The prompt now says how a "no" statement is written, asks for an `evidence` quote per statement (a quote not in the text is flagged), and a second small call (`keyCheckPrompt` / `applyKeyCheck`, ≈ $0.0002) re-answers every statement from the text alone; a disagreement corrects the key and asks the teacher to look. It caught one in the app run.
  - Unit tests: "Put the words in order" jumbles that don't hold the answer's words ("a" for "an") are rebuilt from the answer (`repairOrderItem`).
  - Unit tests: a matching part's example had no meaning in the list or letter, and **Word export crashed** (HTTP 500). The example's meaning is now lettered with the others (also in version B).
  - Unit tests: prompt rules "never reuse a sentence from another part" (an E-class test repeated four sentences) and "facts must be true".
  - Worksheets: Fine-tune "+2 extra words" gave 17 words for 7 gaps (D01 lets the AI list every unit word). `fitTunedWordBank`: the exercise's answers plus exactly N extras (D01, L01, L05), and the prompt says so.
  - Assistant: a bare "a dictation for unit 4" went to the AI, which guessed read-aloud; now it always asks. In an ongoing chat it also starts a new plan instead of refining a test plan.
- **AI slips seen, not fixable by rules:** in the easier rewrite one definition fitted "savanna" but was keyed "climate"; "a hot ___ in Africa" fits two words. The quality check can't see meaning; teachers should glance at the key.
- **Checks:** `npm test` 436 pass; `npm run smoke` passes. The exes were not rebuilt.

## 3.2.0 — one Dictation sheet, a read-aloud dictation, worksheet fine-tuning (2026-10-19, from the user)
- **Two dictations, now told apart.** The worksheet's **Dictation sheet** (vocabulary exercises D01–D28 that come with the Lingo Launcher) keeps its name. The studio tool from the worksheets branch is now **Read-aloud dictation** (sidebar, view title, saved-doc titles, assistant). Step 3 links to it, and its subtitle points back to the Dictation sheet.
- **Assistant:** `studio/assistant.js` `findKind` reads "read aloud / dictogloss / running dictation…" as read-aloud and "dictation sheet / vocabulary dictation / worksheet / Lingo Launcher" as worksheets. A bare "dictation" with sentences or a grammar focus means read-aloud; otherwise it asks "Which dictation do you mean?" with both as chips. A dictation style word no longer turns "worksheets with pictures" into a picture dictation. The AI fallback prompt explains the difference.
- **Fine-tune (Step 3, both Smart mix and Hand-pick):** items in each exercise (3–8, or the class default), sentence length (shorter −2 / for the class / longer +3 words), difficulty (a bit easier / just right / a bit harder) and 0–3 extra words in word banks. In `app.js`: `normalizeTune`, `tunedProfile`, `buildTuneBlock`. The tune rides on the plan (`plan.tune` → `data.generationPlan.tune`), so the system prompt, distribution, answer-balance and type blocks, `validateWorksheet` and the coverage fixer all use the same numbers. Changing it never reshuffles the mix. Rewrite-only uses the tune the teacher has now. Saved in drafts and restored with a saved unit (`state.ex.tune`). Tests: `tests/worksheet-tune.test.mjs` (7).
- **Production:** version 3.2.0 (root and desktop package.json, locks, READMEs). The README tour now covers fine-tuning, the Make tools, the current arcade and Account & sync. `scripts/verify-package.mjs` also checks `google-signin.js`.

## Merged into main: worksheets studio, arcade showtime, accounts & sync (2026-10-19, from the user)
- The three parallel branches below (`claude/worksheets-tests-assistant-f232e3`, `claude/arcade-visual-revamp-b8b7d5`, `claude/profiles-sync-01bd26`) are merged into `main`. Conflicts were only additive (PROGRESS.md, the stylesheet links in `index.html`, the smoke condition in `desktop/main.js`).
- The six storage keys the other branches added are now classified in `js/sync/registry.js` (the sync test enforces it). Synced: `vm_studio_docs_v1` (tests and dictations, list), `vm_arcade_decks` (saved decks, list), `vm_arcade_played` (object), `vm_dictation_prefs_v1`, `vm_tests_prefs_v1`, `vm_dp_filters` (values).
- **Checks:** `npm test` 424 pass; `npm run smoke` passes (picker, pages, six title screens, account).
- **Still waiting on the user:** enable Email/Password and Google sign-in in the Firebase console, then `node scripts/live/build-play.mjs --deploy` (see `docs/sync/README.md`). Not yet tried with a real AI key inside the new studio screens.

## Worksheets fixed, Dictation maker, Unit tests, Teacher assistant (2026-10-19, branch claude/worksheets-tests-assistant-f232e3, from the user)
- **Bug: old words leaking into new generations.** Causes found and fixed:
  - "Rewrite only the Dictation / Lingo practice" sent the *old* vocabulary table (and old sheet) to the AI next to the new word list. Now (`freshIfWordsChanged` in app.js) a changed list always means a full, fresh generation; the Exercises step says so and hides the partial buttons.
  - Choosing another book/unit kept the old worksheets open and the next generation **overwrote the old unit's library entry**. Now the open sheets are put away (still in Saved units) with a toast, and a new unit gets its own entry. Preview edits of stale sheets keep their own word list in the library.
  - The vocabulary table is rebuilt from the teacher's rows (exact words and order; stray AI words dropped, missing ones restored). This also removed a costly full retry when the AI returned the wrong number of rows.
  - Prompts list the only allowed answers (headwords + listed family/synonyms/opposites) and the inflection rule ("two ________" → "uncles"); validation flags answers that aren't unit words (`studio/word-scope.js`, any inflected form).
- **Bug: all-True / all-False keys.** T/F, Yes/No and A/B exercises get pre-balanced answer orders in the prompt; a lopsided key is repaired with one small line-fix call instead of a whole new worksheet; A/B keys are mixed locally by swapping the sentences; bracket choices are spread evenly over a/b/c (`studio/answer-balance.js`). The old "shuffle" made the answer *never first*, i.e. always second in two-option items — fixed.
- **Other bugs:** DeepSeek calls used `http://localhost:8787` even when the web app ran on another port (now same-origin).
- **Exercise design (research in `docs/research/exercise-design.md`):** D25 is Cambridge "look and write" with the app's real word-bank pictures (never emoji; offered only with 3+ pictured words); new picture style "Word-bank pictures" for the word table; optional Greek help line under every task line (default on for A–C Senior); YLE-style rubrics. Pictures go into Word as PNG and into PDF as data URLs (`studio/pic-assets.js`).
- **Dictation maker (sidebar → Make → Dictation):** classic, gapped, running (with wall strips to cut out), dictogloss, picture. Controls: words (Step 2 list or book → unit → sections → key words/all/pick), class (defaults per level), sentence count / text length, length (short / for the class / long, shows the word range), unit words per sentence, gaps per sentence, difficulty (slightly easier / just right / slightly harder), grammar focus chips + own, topic, read 1–3×, say the punctuation, Greek rubric, pictures. Sentences: free offline **book sentences** (the coursebook's own examples) or one small AI request. Read-aloud player (computer voices, slower for younger classes). Student sheet, teacher copy, print / PDF / Word, recent dictations.
- **Unit test builder (Make → Unit test):** one or more units (or any topic), sections, focus words (★ lesson key words by default); class; Quick quiz / Unit test / Full 4-skills presets; editable parts (skill, YLE-style task from 22 types, items, points, writing word count, a note per part; add / remove / reorder); difficulty; grammar; context; title; A + B versions; Greek rubrics; pictures; student box. One AI request with the whole unit context (`studio/unit-context.js`: words by Big Question / Lesson A / Lesson B / Workbook, readings, example sentences, lesson key words and story lines). Any part can be rewritten alone; click any question to edit it. Listening scripts are read by the computer's voices, one per speaker (`studio/tts.js`). Teacher's pack: marking scheme, answer key, scripts, model answers, writing/speaking rubrics. Print / PDF / Word.
- **Teacher assistant (Make → Teacher assistant):** chat with suggestion chips; clear requests ("test for Unit 4", "Present Simple vs Present Continuous test for E class", "τεστ για την ενότητα 5") are understood locally for free; fuzzy ones use one tiny AI call; at most two tap-to-answer questions; an editable plan card (kind, class, coursebook/topic/word list, units, skills, style, count, grammar, difficulty, versions, Greek); **Make it** builds it in the test / dictation makers, or loads the unit's words (or a freeform brief) for worksheets.
- **Friendliness pass (from the user):** Lingo the owl greets the teacher in the assistant ("Hi! I'm Lingo…", with a Greek line), is the assistant's face in the chat, and stands in every empty state with 1-2-3 steps; while the AI writes, a "Lingo is writing your test…" card shows reassuring steps and a progress bar. Plain-language headings ("Which unit?", "How will you dictate?", "The parts of your test", "Final touches"), labelled Print / PDF / Word buttons, "questions" and "points" instead of "items"/"pts", "Write it again" instead of "Rewrite", "Create it now" / "Let me fine-tune it first" in the assistant, book names as on the setup screen ("Primary Path 2"). Grammar names are written the ELT way everywhere — menus, chips, prompts and anything typed or understood ("Present Simple vs Present Continuous", "Second Conditional"; `grammarLabel()` in `studio/levels.js`, tested). Suggestion chips wrap on narrow windows.
- **Also fixed:** Step 1's "Workbook" source pill rendered as a huge full-width column because the arcade's Word Board uses a global `.wb` class; the pill now keeps its own layout (`app.css`). The arcade class itself is untouched (arcade session's area).
- **Code:** pure modules in `desktop/renderer/studio/` (levels, tasks, unit-context, doc-model, doc-render, doc-docx, dictation, test-builder, assistant, answer-balance, word-scope; browser-only tts, pic-assets); views `js/views/{dictation,tests,assistant,studio-common,studio-views}.js`; `styles/studio.css`. Shell edits are small: 3 sidebar items, 3 view sections and a CSS link in index.html; a 4-line hook in main.js; `type: "studio"` Word export in proxy.js and desktop/main.js.
- **New localStorage keys:** `vm_studio_docs_v1` (recent tests/dictations, teacher content), `vm_dictation_prefs_v1`, `vm_tests_prefs_v1` (settings). The profiles-sync branch needs to classify them in `js/sync/registry.js` when merged.
- **AI cost:** a full 10-part test ≈ 2.5k in / 3k out tokens (≈ $0.0015 on Gemini Flash-Lite, a little more on DeepSeek); a dictation ≈ $0.0002; an assistant reading ≈ $0.0001. `node scripts/studio/try-studio.mjs [--dry-run]` runs the real prompts through the ledger ($0.003 spent while tuning). `content/pricing.json` gained `gemini-2.5-flash-lite` text prices.
- **Checks:** `npm test` 389 pass (new: `worksheet-scope`, `worksheet-pictures`, `studio`); `npm run smoke` passes. Verified in the web app with a mock AI provider: picture cards, Greek help line, balance notes, stale/unit-change flow, dictation (book sentences), unit test (generate, version B, add/remove/move part, rewrite one part, edit a question, teacher's pack, listening bar), assistant (local understanding, question chips, plan card → test and dictation hand-off).
- **Not done / next:** Not tried with a real key inside the app (only via the script). Listening audio is live speech, not a downloadable file (a Gemini TTS export would be a follow-up). No smoke step for the new screens yet (the profiles session also edits the smoke flow). The installer was not rebuilt.

## Arcade showtime: turn fix, finer word picking, avatars, a visual revamp (2026-10-19, branch claude/arcade-visual-revamp-b8b7d5, from the user; merged)
- **Bug fixed: in Top Answers (Teams) the first team opened every round.** After a steal the turn moved back to it. The round rules now live in a pure `createFeudFlow(turns, boards)` (`games/feud.js`): each round is opened by the next team in turn, whoever stole the last one (`passTo`); the thief's member has had their go; "Reveal all" mid-steal leaves the bank with the team that built it. Players mode no longer skips a child between rounds. Regression tests: `tests/feud.test.mjs` (they fail against the old rotation).
- **Same bug in every game:** each game used to start with team 1 (and the first child). `createPlay({ startTeam, after })`: every new game starts with the next team, and in Players mode carries on after whoever was up when the last game ended. Other games' turn logic checked: Word Board, Spell Bee, Memory (a match keeps the turn, as in the rules), Hot Seat and Quiz rotate correctly. `players.js` now exports `turnApi(play)`, the turn API without drawing; the arcade wraps it.
- **Choose your words** (`deck-picker.js`, pure helpers in `deck-source.js`, `tests/deckpicker.test.mjs`):
  - **By page:** "pp. 34–41" (or "34, 36, 40") of the Student's Book, the Workbook or both, across units and sections, with a live count and "Units 2–3 · pp. 34–41".
  - **Quick picks:** unit key words, whole unit, 🧗 tricky words, 🔁 review of Units 1–N (12, the current unit weighted), 🎲 12 from the book, and **saved decks** (💾 "Save this deck", name it, load or delete it later; `vm_arcade_decks`).
  - **More filters** (remembered in `vm_dp_filters`): level (easy / medium / tricky, `wordLevel`: syllables, length, phrases, book), length (short / medium / long), single words only, 🔊 with a recording (`hasVoiceFor`), 🕘 hide words played this week (the arcade logs each game's words in `vm_arcade_played`; the cart can also leave them out).
- **Avatars and crests** (`avatars.js`, `avatar-picker.js`, `tests/avatars.test.mjs`): 40 characters (the 16 Lingo Live animals plus 24 from the picture set: puppy, elephant, shark, dinosaur, robot, monster, astronaut, pirate, fairy…) in 12 colours. Tap a child's face in "Who's playing?" for the picker (shelves, "taken by" marks, ‹ › through the class, 🎲 Surprise me); 🎲 Surprise avatars gives the whole class different ones. Tap a team's crest for mascot (team pictures or any avatar), colour, badge shape (shield / circle / star / hexagon) and name. Shown everywhere: top bar, turn banners, spinner, leaderboard, title screens, round cards, podiums, Word Board tiles, Hot Seat, Lingo Live teams. Saved with the class as **optional** fields (`players[i].avatar`, `players[i].color`, `teamCrests[]`); old classes look as before. Note for the sync session in the shared notes folder.
- **Showtime** (`showtime.js`, sounds in `sounds.js`, CSS at the end of `styles/arcade.css`): every game (not Lingo Live, which has its lobby) opens on an animated **title screen** (rays, bouncing title, three "how to play" steps, the teams face to face / the players' avatars / the whole class, Let's play = Space); Play again uses **3 · 2 · 1 · Go!** instead. **Round cards** (Top Answers rounds, double/triple, Steal!, Word Board double, Hot Seat time's up), a **"Your turn" banner** whenever the turn passes, **sparks** on right answers, shakes on wrong ones, star and ribbon confetti. New end screen: drumroll, the podium rises from last place to first, the winner's crown, fanfare; Whole class: the trophy and the class points counting up. Per game: Top Answers boards deal in tile by tile (found tiles no longer re-flip on every redraw); Memory deals from the middle; Spell Bee letters rain down once per word; Word Board questions grow out of their tile; Hot Seat counts in; Flashcards show the rest of the deck under the card and pop the know/learn counts; hub sections rise in. All CSS/WAAPI transforms, no libraries or network; `prefers-reduced-motion` turns it off. New sounds: intro, swoosh, count, go, turn, drumroll, fanfare, reveal, sparkle.
- **Checks:** `npm test` 367 pass (1 skipped, as before); smoke passes and now also checks the six title screens and the page picker (run with the main checkout's Electron: `desktop/node_modules/electron/dist/electron.exe desktop --smoke`, since worktrees have no node_modules). Played every game in Whole class, Players and Teams in the web app (1366×768).
- **Left / ideas:** Lingo Live keeps its own lobby and podium (only its team mascots changed). Avatars on the phones' page are still the 16 animals. A teacher review of the `wordLevel` levels on real classes.

## Accounts & sync (2026-10-19, branch claude/profiles-sync-01bd26, from the user; merged)
- **What:** sign in with Google or email + password (web and desktop). Classes, worksheets, worksheet history, settings and game settings sync between computers, offline-first. AI keys sync only if turned on, end-to-end encrypted with a passphrase. Several teachers per computer (switch in Settings). A backup file export/import works without an account. Design: `docs/sync/PROPOSAL.md`; how it works and setup: `docs/sync/README.md`.
- **Code:**
  - New: `desktop/renderer/js/sync/` (registry, merge, engine, crypto, backend-firebase, profiles, google, account-ui, index), `styles/sync.css`, `desktop/google-signin.js` (desktop Google loopback), `firebase/public/signin.html` + `signin.js` (hosted Google hand-off page), rules for `users/{uid}` in `firebase/database.rules.json`.
  - Small hooks: `js/main.js` (`startSync`), `js/dialogs.js` (Account section), `index.html` (CSS, emulator hosts in the CSP), `desktop/main.js` (per-profile key-chain slots, `google:signin` IPC, `.json` saves, smoke step), `preload.cjs`.
- **Sync rules:**
  - Last write wins per record (lists) or per field (objects), with dated tombstones.
  - localStorage stays the source of truth; sync watches its writes, so the rest of the app is untouched.
  - New `vm_*`/`lingo_*` keys must be classified in `registry.js` (a test enforces it).
- **Found and fixed while checking:** the Firebase SDK's long-polling fallback is blocked by the CSP. After one failed WebSocket, sync stayed "Offline" for good. The fix, `forceWebSockets()`, is SDK-wide and also helps Lingo Live.
- **Checks:**
  - `npm test`: 369 pass (adds `tests/sync.test.mjs`, 18 tests).
  - `npm run smoke` passes (now opens Settings → Account).
  - `node scripts/sync/rules-check.mjs`: 16/16 on the emulator.
  - In the browser preview on the Auth + Database emulators: first sign-in Merge prompt, merge of two laptops, live add and delete, vault (wrong passphrase refused, right one brings the key; only ciphertext in the DB), Google token sign-in (emulator token) with profile switch and restore, sign-out with removal, signed-out state, backup round trip.
- **Waiting on the user:** enable Email/Password and Google in the Firebase console, then `node scripts/live/build-play.mjs --deploy` (rules + sign-in page). See `docs/sync/README.md`.
- **Not verified:** the real Google popup (the preview pane opens popups in the same tab; emulator tokens were used instead), the desktop browser→loopback round trip against the real hosted page (covered by a unit test of the loopback), and sign-in on the real project (no real accounts created).

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
