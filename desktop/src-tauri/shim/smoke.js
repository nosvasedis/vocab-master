/* The smoke test (`Vocab Master.exe --smoke`, `npm run smoke`): drives the real pages end to end, the same checks
 * the Electron app ran, and reports to the shell (smoke_report), which checks the saved files and exits 0 / 1.
 * __FIXTURE__ is replaced with desktop/smoke-fixture.json. */
(async () => {
  const report = (results) => window.__TAURI_INTERNALS__.invoke("smoke_report", { results });
  const results = {};
  try {
    results.protocolOk = document.readyState === "complete" && typeof window.desktop !== "undefined" && location.hostname === "app.localhost";
    // bootApp() is async (hydrates storage): wait up to 10 s for the engine.
    results.engineOk = await (async () => {
      for (let i = 0; i < 100; i++) {
        if (window.__LINGO_ENGINE__ && typeof window.__LINGO_ENGINE__.validateWorksheet === "function") return true;
        await new Promise((r) => setTimeout(r, 100));
      }
      return false;
    })();
    results.title = document.title;
    results.info = await window.desktop.info();

    // Drive the real UI end-to-end: a fixture unit, live editors, projector, coursebook auto-pick, arcade games.
    results.editorFlow = await (async () => {
      const dbg = {};
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const key = (k) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
      for (let i = 0; i < 100 && !window.__VM__; i++) await wait(100);
      const VM = window.__VM__;
      const E = window.__LINGO_ENGINE__;

      // A complete unit opens straight into the preview with editable lines and word boxes.
      const FIXTURE = __FIXTURE__;
      VM.openUnit(FIXTURE);
      await wait(300);
      const paper = document.getElementById("paper").shadowRoot;
      dbg.view = VM.state.view;
      dbg.items = paper.querySelectorAll(".ex-item.editable").length;
      dbg.vocabCells = paper.querySelectorAll("td.editable-vocab").length;
      if (!dbg.items || dbg.vocabCells !== 8) return { ...dbg, fail: "preview" };

      // Edit a line in the side-sheet editor and check it is saved to the library.
      paper.querySelector(".ex-item.editable").click();
      await wait(250);
      const prompt = document.getElementById("ie_prompt");
      dbg.editorOpen = !!prompt;
      if (!prompt) return { ...dbg, fail: "item-editor" };
      const edited = "The ____ child smiled happily at the smoke test.";
      prompt.value = edited;
      prompt.dispatchEvent(new Event("input", { bubbles: true }));
      await wait(350);
      document.querySelector(".dialog [data-save]").click();
      await wait(400);
      dbg.saved = (E.getAllSavedSessions() || []).some((s) => JSON.stringify(s.data).includes(edited));
      dbg.dialogsAfter = document.querySelectorAll(".dialog-backdrop:not(.closing)").length;

      // Word box editor opens and closes.
      paper.querySelector("td.editable-vocab").click();
      await wait(250);
      dbg.vocabEditor = !!document.getElementById("ve_english");
      document.querySelector(".dialog [data-close]")?.click();
      await wait(300);

      // Projector mode opens and Esc closes it.
      VM.openProjector();
      await wait(250);
      dbg.projector = !!document.querySelector(".projector");
      key("Escape");
      await wait(300);
      dbg.projectorClosed = !document.querySelector(".projector");

      // Engine checks: bulk parser, Word via window.desktop (built in the page now), coursebook word bank.
      dbg.bulk = E.parseBulkVocabularyText("1. explore (v.) - εξερευνώ | explore a cave > explorer (n.) ≈ discover\n2. brave (adj.) - γενναίος").length;
      const docx = await window.desktop.exportDocx({ type: "lingo", data: FIXTURE.data });
      dbg.docxOk = !!(docx && docx.ok && docx.base64 && docx.base64.length > 1000 && atob(docx.base64.slice(0, 8)).startsWith("PK"));
      if (!dbg.docxOk) dbg.docxError = docx?.error || "";
      const cpp1 = E.queryCoursebookWords({ bookId: "CPP1", unit: 1, includeSb: true, includeWb: true });
      const cpp2 = E.queryCoursebookWords({ bookId: "CPP2", unit: 5, includeSb: true, includeWb: false });
      const cpp3 = E.queryCoursebookWords({ bookId: "CPP3", pageRange: "118-120", includeSb: true, includeWb: true, wbScope: "unit" });
      // 3549 official rows since the 2026-10-22 audit (one entry per word per section). The bank's own families,
      // opposites and synonyms are curated now (tests/wordbank.test.mjs checks them); old AI enrichment must not come back.
      dbg.cbOk = cpp1.counts.total > 50 && cpp1.counts.wb > 5 && cpp2.counts.wb === 0 && cpp3.unit === 6 && cpp3.counts.wb > 10
        && E.CPP_WORDBANK.filter((e) => !e.origin).length === 3549 && !E.CPP_WORDBANK.some((e) => e.source === "enriched" || e.isBasic);

      // Setup: choose Primary Path 2, type pages 74–76 → unit 4 is inferred and its words load.
      VM.go("setup");
      await wait(200);
      document.querySelector('#sourceSeg [data-value="cpp"]').click();
      await wait(150);
      document.querySelector('[data-book="CPP2"]').click();
      await wait(200);
      const pages = document.getElementById("cppPages");
      pages.value = "74-76";
      pages.dispatchEvent(new Event("input", { bubbles: true }));
      await wait(800);
      dbg.inferredUnit = VM.state.cpp.unit;
      dbg.autoWords = VM.state.words.filter((w) => w.english.trim()).length;
      dbg.poolChips = document.querySelectorAll("#poolChips .word-chip").length;

      // Arcade: every game renders its board.
      VM.openGames();
      await wait(250);
      dbg.gameCards = document.querySelectorAll(".game-card").length;
      // "Choose your words": book → unit → whole unit → play with exactly those words.
      document.querySelector(".hhd-pick").click(); await wait(400);
      dbg.picker = !!document.querySelector(".dp");
      document.querySelector('.dp [data-book="CPP3"]').click(); await wait(150);
      document.querySelector('.dp [data-unit="2"]').click(); await wait(400);
      // By page: pp. 34–41 of Book 3 finds words across the unit's sections.
      const typePages = (v) => { const i = document.getElementById("dpPages"); i.value = v; i.dispatchEvent(new Event("input", { bubbles: true })); };
      typePages("34-41"); await wait(150);
      dbg.pages = /[0-9]+ words/.test(document.querySelector(".dp [data-pages-add]").textContent);
      typePages(""); await wait(100);
      document.querySelector(".dp [data-unit-all]").click(); await wait(150);
      const pickedN = Number(document.getElementById("dpCount").textContent);
      document.querySelector(".dp [data-apply]").click(); await wait(500);
      dbg.pickedDeck = pickedN > 50 && Math.abs(Number(document.querySelector(".hhd-count b").dataset.countup) - pickedN) <= 3 && /Primary Path 3 · Unit 2/.test(document.querySelector(".hhd-info b").textContent);
      // Every game but Lingo Live opens on its title screen; Start mounts the game.
      dbg.titles = 0;
      const play = async (id) => {
        document.querySelector("[data-hub]").click(); await wait(120); document.querySelector(`[data-game="${id}"]`).click(); await wait(250);
        if (id !== "live") { dbg.titles += document.querySelector(".sx-title") ? 1 : 0; document.querySelector("[data-st-go]")?.click(); await wait(550); }
      };
      await play("flashcards"); dbg.fc = !!document.querySelector(".fc-card");
      await play("memory"); dbg.mem = document.querySelectorAll(".mm-tile").length;
      await play("spelling"); dbg.spell = document.querySelectorAll(".sp-tile").length;
      await play("board"); dbg.quiz = document.querySelectorAll(".wb-tile").length;
      await play("feud"); await wait(2400); dbg.feud = document.querySelectorAll(".fd-slot").length; // after the "Round 1" card
      await play("taboo"); document.querySelector("[data-start]")?.click(); await wait(3300); dbg.taboo = document.querySelectorAll(".ts-no").length; // after 3 · 2 · 1
      // Lingo Live: lobby, then 3-2-1 and the first question with its answer tiles.
      await play("live"); dbg.liveLobby = !!document.querySelector(".lv-lobby");
      document.querySelector("[data-start]")?.click(); await wait(5400); dbg.liveOpts = document.querySelectorAll(".lv-opt").length;
      key("Escape"); await wait(100); key("Escape"); await wait(400);
      dbg.arcadeClosed = !document.querySelector(".arcade");

      // Settings → Account & sync renders (signed out, sign-in and backup buttons present).
      document.getElementById("btnSettings")?.click(); await wait(500);
      dbg.account = !!document.querySelector('#syncSection [data-ac="google"]') && !!document.querySelector('#syncSection [data-ac="export"]');
      key("Escape"); await wait(300);

      // Leave no trace in History.
      (E.getAllSavedSessions() || []).forEach((s) => E.deleteSavedSession(s.id));

      const ok = dbg.view === "preview" && dbg.saved && dbg.dialogsAfter === 0 && dbg.vocabEditor
        && dbg.projector && dbg.projectorClosed && dbg.bulk === 2 && dbg.docxOk && dbg.cbOk
        && dbg.inferredUnit === 4 && dbg.autoWords >= 10 && dbg.poolChips >= 10
        && dbg.gameCards === 7 && dbg.picker && dbg.pages && dbg.titles === 6 && dbg.pickedDeck && dbg.liveLobby && dbg.liveOpts >= 2 && dbg.fc && dbg.mem >= 12 && dbg.spell >= 2 && dbg.quiz >= 9 && dbg.feud >= 5 && dbg.taboo >= 1 && dbg.arcadeClosed;
      return { ...dbg, fail: !ok ? "ui-flow" : !dbg.account ? "account" : "" };
    })().catch((e) => ({ fail: "exception", error: String(e?.stack || e) }));
    results.editorOk = results.editorFlow?.fail === "";

    // Natural voices: the page is cross-origin isolated (threads), the voice worker starts and the WebAssembly
    // engine compiles under the CSP. No model download here: the smoke test must work offline.
    results.voices = await (async () => {
      const out = { isolated: self.crossOriginIsolated === true, wasm: false, worker: false };
      try { await WebAssembly.compileStreaming(fetch("vendor/kokoro/ort-wasm-simd-threaded.jsep.wasm")); out.wasm = true; } catch (e) { out.wasmError = String(e.message || e); }
      try {
        out.worker = await new Promise((resolve) => {
          const w = new Worker("js/voices/kokoro-worker.js", { type: "module" });
          const t = setTimeout(() => { w.terminate(); resolve(true); }, 2500); // loaded with no error
          w.onerror = (e) => { clearTimeout(t); out.workerError = String(e.message || "worker error"); resolve(false); };
        });
      } catch (e) { out.workerError = String(e.message || e); }
      return out;
    })();
    results.voicesOk = results.voices.isolated && results.voices.wasm && results.voices.worker;

    // A test pack through the same page helpers the Test Maker uses: Word + PDF of a paper and a WAV track,
    // written by savePack into one folder; the shell checks each file by its first bytes.
    results.pack = await (async () => {
      try {
        const sc = await import("/js/views/studio-common.js");
        const tb = await import("/studio/test-builder.js");
        const dr = await import("/studio/doc-render.js");
        const at = await import("/studio/audio-track.js");
        const doc = tb.buildTestDoc(tb.testDefaults("B_SENIOR"), { title: "Smoke Test", sections: [] }, { meta: { bookTitle: "Cambridge Primary Path 2", unit: 4 } });
        const tone = new Float32Array(2400).map((_, i) => Math.sin(i / 8) * 0.2);
        const files = [
          await sc.packWord(doc, "student", "Test, CPP2, Unit 4"),
          await sc.packPdf(dr.renderStudentPaper(doc, {}), "Smoke Test", "Test, CPP2, Unit 4"),
          await sc.packWord(doc, "teacher", "Test (teacher's pack), CPP2, Unit 4"),
          sc.packBytes(at.encodeWav(tone), "Listening track 1, CPP2, Unit 4.wav"),
        ];
        return await window.desktop.savePack({ folderName: "Test pack, CPP2, Unit 4", files });
      } catch (e) { return { ok: false, error: String(e.message || e) }; }
    })();

    // Opt-in (`--smoke --voices`, needs the internet once): download the natural voices and speak one sentence.
    if (__VOICES__) {
      results.voicesFull = await (async () => {
        const t0 = performance.now();
        const w = new Worker("js/voices/kokoro-worker.js", { type: "module" });
        const out = await new Promise((resolve) => {
          const r = { threads: 0 };
          w.onmessage = ({ data }) => {
            if (data.type === "ready") { r.threads = data.threads; r.loadMs = Math.round(performance.now() - t0); w.postMessage({ type: "speak", id: 1, text: "Hi, Tom! Did you see the volcano film in class today?", voice: "af_heart", speed: 0.9 }); r.t1 = performance.now(); }
            if (data.type === "audio") { r.seconds = +(data.samples.length / data.rate).toFixed(2); r.speakMs = Math.round(performance.now() - r.t1); delete r.t1; resolve(r); }
            if (data.type === "error") resolve({ ...r, error: data.message });
          };
          w.postMessage({ type: "load" });
          setTimeout(() => resolve({ ...r, error: "timeout" }), 240000);
        });
        w.terminate();
        return out;
      })();
      results.voicesOk = results.voicesOk && !results.voicesFull.error && results.voicesFull.seconds > 1;
    }
  } catch (e) {
    results.error = String(e?.stack || e);
  }
  await report(results);
})();
