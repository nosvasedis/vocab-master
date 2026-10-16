# Vocab Master — Teacher Studio 2.0 🎓

**AI-Powered Vocabulary ("Lingo Launcher") & Assessment ("Dictation") Worksheet Architect for ESL Teachers (A–E Senior / CEFR Early A1 to B1).**

Vocab Master helps English teachers create pedagogically balanced, print-ready A4 study sheets, dictation quizzes, and teacher answer keys in minutes — tailored specifically to Greek ESL class levels (`A Senior` through `E Senior`).

---

## 📥 Download & Install (For Teachers)

You can install or run **Vocab Master** on any Windows PC (Windows 10/11 64-bit) — **no Node.js, Python, or command-line setup required**:

1. Go to the [**GitHub Releases**](../../releases/latest) page.
2. Choose either download option:
   - **💿 `Vocab-Master-Setup-2.0.0.exe` (Recommended Installer)**: Standard Windows setup wizard. Installs **Vocab Master** with a Desktop shortcut, Start Menu entry, and uninstaller.
   - **🧳 `Vocab-Master-Portable-2.0.0.exe` (Zero-Install Portable)**: Single-file standalone executable. Run it directly from your Downloads folder or a USB flash drive.
3. On first launch, click **🎓 Sample Unit** in the top bar to explore a complete unit right away, or click **⚙️ Settings** to paste your [DeepSeek API key](https://platform.deepseek.com/api_keys) (stored encrypted on your PC via Windows DPAPI).

---

## ✨ What's New in Teacher Studio 2.0

### 1. Unit & Class Level Architect (Step 1)
- **Interactive Class Level Cards (`A Senior` – `E Senior`)**: Visual cards displaying CEFR level (`Early A1` to `B1`), Greek school grade equivalents (`Γ' Δημοτικού` to `Α'–Β' Γυμνασίου`), age ranges, and strict sentence-length caps.
- **25+ Coursebook Presets & Recent Books Chips**: Instant autocomplete and 1-click chips for popular coursebooks (*Cambridge Primary Paths*, *Super Minds*, *Prepare*, *Eyes Open*, *Think*, *Go Getter*, *Burlington*, etc.).
- **`+1` Next Unit Button & Zero-Key Sample Unit**: Increment units in one click, or load a pre-built C Senior unit without an API key.

### 2. Smart Vocabulary Studio (Step 2)
- **📥 Bulk Paste / Smart Import**: Paste word lists directly from PDFs, Word documents, or notes (`1. compete (v.) - συναγωνίζομαι | compete in a race > competition (n.) ≈ contest ≠ give up`). Automatically parses English headwords, parts of speech, Greek meanings, emojis, collocations, derivatives, synonyms, and antonyms.
- **🎛️ Batch Field Toggles**: Enable or disable `Type`, `Greek`, `Emojis`, `Collocation`, `Derivatives`, `Synonyms`, or `Antonyms` across all vocabulary cards simultaneously.
- **AI Sense-Locked Autofill**: Fill all words or individual cards with AI. Providing a part of speech (`v.`) or Greek meaning (`σφραγίζω`) locks the exact word sense.
- **Fast Teacher Workflow**: Press `Enter` in any English word input to jump to the next card (or create a new row), reorder words (`↑`/`↓`), sort `A–Z`, clean empty rows, or switch between **Compact** and **Detailed** views. Live duplicate detection highlights repeated words.

### 3. Pedagogical Exercise Architect (Step 3)
- **35 Exercise Formats**: 25 Dictation types (`D01`–`D25`) and 10 Lingo Launcher practice types (`L01`–`L10`), each tagged with its cognitive skill (`Recognition`, `Productive`, `Analysis`) and a concrete student-facing example.
- **Teaching Presets & Skill Filters**: Choose **Smart Pedagogical Mix** (with customizable exercise counts) or **Custom Exercise Menu** with 1-click presets (*⚖️ Balanced*, *🎯 Recognition*, *✍️ Productive*, *🎓 Exam Prep*, *🌳 Word Families*).

### 4. Live Worksheet Editor, Classroom Projector & Full Pack Export (Step 4)
- **Click-to-Edit Everything**:
  - Click any **Vocabulary Table Cell** on the Lingo Launcher sheet to edit its English headword, part of speech, Greek meaning, emojis, collocation, or word family live.
  - Click any **Exercise Line** on Lingo Launcher or Dictation to edit its prompt, answer, stem clue, tested words, or word bank, with live validation, `+ Add line below`, and `🗑️ Delete line`.
- **3 Preview Tabs & Teacher Formatting Controls**:
  - Preview `🚀 Lingo Launcher`, `📝 Dictation`, and `📋 Answer Key` directly.
  - Toggle **👁️ Show Answers Inline**, **📝 Student Name/Date/Class/Score Header**, and **Page Spacing Density** (`Compact`, `Standard A4`, `Comfortable`).
- **🖥️ Classroom / Interactive Whiteboard Mode**: Full-screen, high-contrast projection view with zoom controls (`A−` / `A+`) where clicking any exercise line reveals or hides its answer one by one during class review.
- **📦 One-Click Export Full Unit Pack**: Choose a folder once to export all 6 files (`Lingo Launcher`, `Dictation`, and `Answer Key` in both editable `.docx` Word format and print-ready A4 `.pdf`).

### 5. Searchable Library & JSON Backups
- Every generated or edited unit is auto-saved to **History**.
- Search by book/unit, filter by class level, **Duplicate** units for another class, or **Export / Restore JSON Backups** to move your library between computers.

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
npm start          # Starts local server on http://localhost:8787/ (or double-click start.bat)
```

---

## 📄 License
MIT License
