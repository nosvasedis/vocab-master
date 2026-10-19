/* The "Make" screens (Teacher assistant, Unit test, Dictation), registered with the shell in one place so
 * main.js only needs a two-line hook: titles for the top bar and a render() per view. */
import { initDictation, renderDictationView } from "./dictation.js";
import { initTests, renderTestsView } from "./tests.js";
import { initAssistant, renderAssistantView } from "./assistant.js";

export const STUDIO_VIEWS = {
  assistant: { title: "Teacher assistant", sub: "Tell it what you need — a unit test, a dictation, a worksheet on any grammar point.", render: () => renderAssistantView() },
  tests: { title: "Unit test", sub: "Pick a unit, choose the skills and parts, and get a printable test with its answer key.", render: () => renderTestsView() },
  dictation: { title: "Dictation", sub: "Five dictation styles, set for your class — print it, or let the app read it aloud.", render: () => renderDictationView() },
};

export function initStudio() {
  initDictation();
  initTests();
  initAssistant();
}
