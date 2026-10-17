# Vocab Master — Teacher Studio 3.0 🎓

**AI-Powered Vocabulary ("Lingo Launcher") & Assessment ("Dictation") Worksheet Architect for ESL Teachers (A–E Senior / CEFR Early A1 to B1).**

Vocab Master helps English teachers create pedagogically balanced, print-ready A4 study sheets, dictation quizzes, and teacher answer keys in minutes — tailored specifically to Greek ESL class levels (`A Senior` through `E Senior`).

---

## 📥 Download & Install (For Teachers)

You can install or run **Vocab Master** on any Windows PC (Windows 10/11 64-bit) — **no Node.js, Python, or command-line setup required**:

1. Go to the [**GitHub Releases**](../../releases/latest) page.
2. Choose either download option:
   - **💿 `Vocab-Master-Setup-3.0.0.exe` (Recommended Installer)**: Standard Windows setup wizard. Installs **Vocab Master** with a Desktop shortcut, Start Menu entry, and uninstaller.
   - **🧳 `Vocab-Master-Portable-3.0.0.exe` (Zero-Install Portable)**: Single-file standalone executable. Run it directly from your Downloads folder or a USB flash drive.
3. On first launch, click **Sample unit** in the top bar to explore a complete unit right away, or open **Settings** (bottom of the sidebar) to paste your [DeepSeek API key](https://platform.deepseek.com/api_keys) (stored encrypted on your PC via Windows DPAPI).

---

## ✨ A tour of the app

Vocab Master is a calm, four-step studio with a sidebar that always shows where you are, a light and a dark theme, and everything saved automatically — including your unfinished draft, so closing the app never loses work.

### 1 · Unit setup
- **Class level cards (A–E Senior)** with CEFR level, Greek school grades, sentence-length limit and a recommended word count.
- **Cambridge Primary Path 1–3 word bank (3,769 entries).** Pick a book and a unit, tap a section (Big Question, A/B reading…) or type any pages — the unit is detected from the page numbers and the official Student's Book, Workbook and 2nd-edition words load instantly, with Greek meanings.
- **Word pool:** tap words in or out, filter by source, hide basic sight words, or reload a smart pick. Every automatic change can be undone from the notification.
- **Any other coursebook** works too: type the title, unit and (optional) pages.

### 2 · Vocabulary
- An editable word list with part of speech, Greek, emojis, a natural phrase and the word family (derivatives, synonyms, opposites). Choose which fields appear on the worksheet with one click.
- **Fill everything with AI** completes empty fields at the right level; the ✨ on a row rewrites just that word. Part of speech and Greek act as "sense locks" (e.g. *seal* the verb, not the animal).
- **Paste a list** from Word, PDFs or notes — numbered lines, `word (v.) - Greek | phrase > derivative ≈ synonym ≠ opposite`, or plain comma lists.
- Drag to reorder (or <kbd>Alt</kbd> + <kbd>↑</kbd>/<kbd>↓</kbd>), <kbd>Enter</kbd> for the next word, duplicate warnings, and a progress meter towards the recommended word count.
- Prefer prose? **Describe the unit** and the AI chooses the words.

### 3 · Exercises
- **Smart mix** balances recognition, productive and analysis exercises for the level (shuffle until you like it), or **hand-pick** from 25 Dictation and 10 Lingo Launcher formats with presets and skill filters. Formats that need synonyms/opposites/derivatives tell you what to turn on.
- **Generate** writes the Lingo Launcher study sheet, the Dictation test and the answer key — every unit word is guaranteed to be tested. You can rewrite only the Dictation or only the Lingo practice later.

### 4 · Preview & export
- A true **A4 preview** (identical to the PDF). Click any word box or exercise line to edit it in a side panel with live checking; add or delete lines with undo.
- **Quality check** with one-click quick fixes or AI rewrites, and a **word coverage** map.
- Export the **full unit pack** (Word + PDF for all three sheets), or the current sheet as Word, PDF or print. Toggle the student name header, answer preview and spacing.
- **Duplicate** a unit to adapt it for another class.

### 🖥️ Projector mode
Full-screen worksheet for the interactive whiteboard. Tap a line — or press <kbd>Space</kbd> — to reveal answers one by one; zoom for the back row.

### 🎮 Lingo Arcade — five smartboard games
Whole class or 2–4 named teams with a live scoreboard (tap a team's score to adjust it), synthesized sound effects and English read-aloud.
- **Flashcards** — giant 3D cards, English-first or Greek-first, swipe or press <kbd>1</kbd>/<kbd>2</kbd> to sort into "still learning" and "I know it", then practise just the tricky ones.
- **Memory Match** — numbered tiles students can call out; match words with Greek, emojis or phrases. A match keeps the turn.
- **Spell Bee** — hear the word, read the clue, build it from letter tiles or type it; hints cost points.
- **Quiz Show** — gap, meaning and word-family questions with a countdown, streak bonus and a 50:50 per team.
- **Hot Seat** — timed taboo rounds: describe the word without the forbidden ones; the board tallies each team's round.

### 🗂️ Library & backups
Every generated or edited unit is saved automatically. Search by book, unit or word, filter by level, open or edit, and **back up / restore** your whole library as one file.

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
