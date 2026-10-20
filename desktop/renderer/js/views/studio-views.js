/* The "Make" screens (Teacher assistant, Test Maker, Dictation), registered with the shell in one place so
 * main.js only needs a two-line hook: titles for the top bar and a render() per view. */
import { initDictation, renderDictationView } from "./dictation.js";
import { initTests, renderTestsView } from "./tests.js";
import { initAssistant, renderAssistantView } from "./assistant.js";

export const STUDIO_VIEWS = {
  assistant: { title: "Teacher assistant", sub: "Tell it what you need — a test, a dictation, a worksheet on any grammar point.", render: () => renderAssistantView() },
  tests: { title: "Test Maker", sub: "Pick a unit or a grammar point (and any words of your own), choose the skills and parts, and get a printable test with its answer key.", render: () => renderTestsView() },
  dictation: { title: "Read-aloud dictation", sub: "You (or the app) read it aloud, the class writes it down: classic, gapped, running, dictogloss or picture. The vocabulary Dictation sheet is in Worksheets → Step 3.", render: () => renderDictationView() },
};

export function initStudio() {
  initDictation();
  initTests();
  initAssistant();
}
