# Vocab Master — Teacher Studio 3.5.3 🎓

**AI-Powered Vocabulary ("Lingo Launcher") & Assessment ("Dictation") Worksheet Architect for ESL Teachers (A–E Senior / CEFR Early A1 to B1).**

Vocab Master helps English teachers create pedagogically balanced, print-ready A4 study sheets, dictation quizzes, and teacher answer keys in minutes — tailored specifically to Greek ESL class levels (`A Senior` through `E Senior`).

---

## 📥 Download & Install (For Teachers)

You can install or run **Vocab Master** on any Windows PC (Windows 10/11 64-bit) — **no Node.js, Python, or command-line setup required**:

1. Go to the [**GitHub Releases**](../../releases/latest) page.
2. Choose either download option:
   - **💿 `Vocab-Master-Setup-3.5.3.exe` (Recommended Installer)**: Standard Windows setup wizard. Installs **Vocab Master** with a Desktop shortcut, Start Menu entry, and uninstaller — and **keeps itself up to date**.
   - **🧳 `Vocab-Master-Portable-3.5.3.exe` (Zero-Install Portable)**: Single-file standalone executable. Run it directly from your Downloads folder or a USB flash drive.
3. On first launch, open **Settings** (bottom of the sidebar). Choose **Google Gemini** or **DeepSeek** and paste your API key, or choose **ChatGPT** → **Continue with ChatGPT** to use an eligible ChatGPT Plus or Pro plan without an API key. For ChatGPT, allow plan usage in your browser, choose a model, then Save. Luna is selected first when available. Desktop credentials are stored encrypted on your PC via Windows DPAPI.

### 🔄 Updates — automatic
Install once with the Setup exe and Vocab Master keeps itself up to date:
- **New pages arrive by themselves.** Most improvements are changes to the app's pages; the app fetches only the changed files from GitHub in the background (a few seconds, checked against their fingerprints) and uses them from the next start — or at once with **Restart now**. Your units, tests and settings are never touched.
- **New versions of the app** (rare) download in the background and install when you restart.
- **Settings → Updates** shows what you have, with **Check now** and an *Update automatically* switch; **Help → Check for updates** does the same.
- If an update ever fails to start, the app sets it aside and opens the version that worked.
- The portable exe updates its pages too; for a new version of the app it shows a download link.

---

## ✨ A tour of the app

Vocab Master is a calm, four-step studio with a sidebar that always shows where you are, a light and a dark theme, and everything saved automatically — including your unfinished draft, so closing the app never loses work.

### 1 · Unit setup
- **Class level cards (A–E Senior)** with CEFR level, Greek school grades, sentence-length limit and a recommended word count.
- **Cambridge Primary Path 1–3 (2nd Edition) word bank — the 3,554 rows of the official wordlists, plus 29 official Key Words from Cambridge's 2nd-edition Scope and Sequence that the lists lack.** Units show their official Big Question and reading titles. Pick a book and a unit, tap a section (Big Question, A, B) or type any pages — the unit is detected from the page numbers and the official Student's Book and Workbook words load instantly, with their Greek meanings and example sentences.
- **Word pool:** tap words in or out, filter Student's Book / Workbook, or reload a smart pick spread across the whole unit. Every automatic change can be undone from the notification.
- **Any other coursebook** works too: type the title, unit and (optional) pages.

### 2 · Vocabulary
- An editable word list with part of speech, Greek, emojis, a natural phrase and the word family (derivatives, synonyms, opposites). Choose which fields appear on the worksheet with one click.
- **Fill everything with AI** completes empty fields at the right level; the ✨ on a row rewrites just that word. Part of speech and Greek act as "sense locks" (e.g. *seal* the verb, not the animal).
- **Paste a list** from Word, PDFs or notes — numbered lines, `word (v.) - Greek | phrase > derivative ≈ synonym ≠ opposite`, or plain comma lists.
- Drag to reorder (or <kbd>Alt</kbd> + <kbd>↑</kbd>/<kbd>↓</kbd>), <kbd>Enter</kbd> for the next word, duplicate warnings, and a progress meter towards the recommended word count.
- Prefer prose? **Describe the unit** and the AI chooses the words.

### 3 · Exercises
- **Smart mix** balances recognition, productive and analysis exercises for the level (shuffle until you like it), or **hand-pick** from 25 Dictation and 10 Lingo Launcher formats with presets and skill filters. Formats that need synonyms/opposites/derivatives tell you what to turn on.
- **Fine-tune** the worksheet for this class: items in each exercise, sentence length (shorter / for the class / longer), difficulty (a bit easier / just right / a bit harder) and extra words in the word banks. Changing it never reshuffles your exercise mix.
- **Generate** writes the Lingo Launcher study sheet, the Dictation sheet and the answer key — every unit word is guaranteed to be tested, True/False and A/B keys are always mixed, and picture exercises use the app's own illustrations. You can rewrite only the Dictation or only the Lingo practice later. A changed word list always means a fresh, full generation, so words from an earlier unit never leak in.

### 4 · Preview & export
- **Ink-saving black-and-white design** — outlines and type only, no filled areas; fonts are embedded so PDFs look the same on any PC.
- **Per-sheet switches:** student name box, score per exercise, footer with page numbers, a “shared sheet — answer in your notebook” note (on by default for Dictation, which classes reuse), and your school name (Settings).
- A true **A4 preview** (identical to the PDF). Click any word box or exercise line to edit it in a side panel with live checking; add or delete lines with undo.
- **Quality check** with one-click quick fixes or AI rewrites, and a **word coverage** map.
- Export the **full unit pack** (Word + PDF for all three sheets), or the current sheet as Word, PDF or print. Toggle the student name header, answer preview and spacing.
- **Duplicate** a unit to adapt it for another class.

### 🧑‍🏫 Make: assistant, unit tests, read-aloud dictation
- **Teacher assistant** — say what you need ("a test for Unit 4", "Present Simple vs Present Continuous for E class", "τεστ για την ενότητα 5"). It understands which words you mean — *all the words*, *the key words*, *15 words*, *a mix*, *the Lesson A words and the workbook*, *only volcano, lava and ash*, *all except crater*, *plus the words …* — and more (*no listening*, *5 questions each*, *without pictures*, *called "Revision"*, *from the book sentences*). It asks at most two quick questions and shows an editable plan with the exact words (leave one out, add your own, switch to a number or a mix) before it builds anything. It also tells the two dictations apart: the **Dictation sheet** (vocabulary exercises, with the Lingo Launcher) or a **read-aloud dictation**.
- **Unit test** — a printable all-round test for one or more units: listening (short new dialogues, a different voice for each speaker, saved as audio files too), reading, vocabulary, grammar, writing and speaking, with points, timing, versions A and B, Greek instructions on or off, and a teacher's pack with the answer key and marking scheme. Start from a coursebook unit, your word list, or a grammar point or topic — and **add your own words** (from another unit, another book, or anywhere; with the Greek if you like) to be tested alongside.
- **Read-aloud dictation** — you (or the app) read, the class writes: classic, gapped, running (with wall strips), dictogloss or picture. Choose sentence count and length, unit words per sentence, gaps, difficulty and grammar focus; free sentences from the coursebook or one small AI request. Your own words can be mixed in with the unit's.
- **Listening voices** — tests and dictations are read by **Natural voices** (Kokoro, an open voice model that runs on the computer: free, offline after a one-time ~90 MB download), **Studio voices** (Google Gemini with your own Gemini key, the most lifelike, about 1 cent per minute of speech) or the computer's own voices. Every listening is made once and kept, so it plays at once in class; any track can be saved as a WAV.

### 🖼️ Pictures
Each word’s emoji can be drawn in four looks — **colour emoji**, **outline drawings** (OpenMoji, lightest on toner), **bold outline** (Microsoft Fluent high contrast) or **line icons** (Lucide, with outline drawings where Lucide has no match) — or switched off. One choice in the Preview’s Layout panel or in Settings applies to worksheets, PDFs, Word files and the games. Credits: OpenMoji (CC BY-SA 4.0), Fluent Emoji (MIT), Lucide (ISC).

### 🤖 AI services
Choose in **Settings**:

- **Google Gemini**: free tier with a Google AI Studio key, or your project's billing/eligible developer credits. Daily limits apply; the app tries Flash and Flash-Lite models.
- **DeepSeek**: pay-as-you-go with a topped-up API account.
- **ChatGPT**: sign in with an eligible Plus or Pro account and allow ChatGPT plan usage. Choose from the models available to that account; Luna is the initial choice when available. Your choice is saved per connection. A missing model requires a new choice; the app never silently switches to a different ChatGPT model. **Manage usage** opens ChatGPT's usage settings. Account and model changes take effect immediately; Save selects the AI service.

ChatGPT uses the official public OAuth and Responses API flow for local apps. It does not read your ChatGPT conversations. Desktop tokens stay encrypted in the main process and never enter the renderer, browser storage, or backups. In the local web edition, tokens remain in server memory; restarting the server requires sign-in again. The integration is subject to OpenAI's preview availability and plan limits. See [ChatGPT integration](docs/chatgpt.md).

### 🖥️ Projector mode
Full-screen worksheet for the interactive whiteboard. Tap a line — or press <kbd>Space</kbd> — to reveal answers one by one; zoom for the back row.

### 🎮 Lingo Arcade — smartboard games
Play as the whole class, as named players, or as 2–4 teams of members, with saved classes, avatars and team crests, fair turns (everyone answers before anyone repeats), animated title, round and finish screens, sound effects and recorded voices. **Choose your words** by book, unit, section or page range (pp. 34–41), with filters, quick picks and saved decks — plus **your own words** (or your worksheet's words) mixed in with the book's.
- **Flashcards** — giant 3D cards, English-first or Greek-first; sort into "still learning" and "I know it", then practise just the tricky ones.
- **Memory Match** — numbered tiles students can call out; match words with Greek, pictures or phrases.
- **Spell Bee** — hear the word, read the clue, build it from letter tiles or type it.
- **Word Board** — a Jeopardy-style grid of pictures, gaps, spelling and listening questions worth 100–500.
- **Top Answers** — "Name an animal on a farm…": a survey board with six ranked answers, six rounds, steals and double/triple rounds.
- **Hot Seat** — timed taboo rounds: describe the word without the forbidden ones.
- **Lingo Live** — a quiz the class plays on phones, with live music and a podium.

### 🗂️ Library & backups
Every generated or edited unit is saved automatically. Search by book, unit or word, filter by level, open or edit, and **back up / restore** your whole library as one file.

### 👤 Account & sync
Sign in (Settings → Account) with Google or email to use your classes, worksheets, tests, dictations, saved decks and settings on another computer. It works offline and syncs when you're back online. AI keys sync only if you turn it on, end-to-end encrypted with a passphrase only you know. Several teachers can share one computer, and a backup file works without an account.

### ⌨️ Shortcuts
<kbd>Ctrl</kbd>+<kbd>N</kbd> new unit · <kbd>Ctrl</kbd>+<kbd>P</kbd> print · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> next step / save an edit · <kbd>Alt</kbd>+<kbd>1–4</kbd> jump to a step · <kbd>?</kbd> guide · <kbd>Esc</kbd> close

---

## 🛠️ Running from Source (Developers)

### Desktop App (Electron)
```bash
cd desktop
npm install
npm start          # Launch the Electron desktop app
npm run smoke      # Run automated end-to-end smoke tests
npm run dist       # Build Windows Setup Installer (.exe) + Portable (.exe) in desktop/release/
```

### Local Web App (Node.js Proxy)
```bash
npm install
npm start          # Serves desktop/renderer on http://localhost:8787/ (or double-click start.bat)
```

---

## 📄 License
MIT License
