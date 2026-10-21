/* Lingo Live — question builder (pure, DOM-free; tested in Node).
   Turns any arcade deck into a varied, picture-rich Kahoot-style question set. */
import { shuffle, maskWordInText, distractorsFor, firstEmoji, gapOptions } from "../deck.js";

export const SHAPES = ["tri", "dia", "cir", "sq"]; // ▲ ◆ ● ■ — red, blue, yellow, green

const KIND_LABEL = {
  pic2word: "What's this?",
  word2pic: "Find the picture",
  gap: "Fill the gap",
  listen: "Listen!",
  greek: "In English, please!",
  truefalse: "True or false?",
};

/** A short gapped sentence for a word (example first, then collocation), or "". */
export function gapSentence(w) {
  const ex = String(w.example || "");
  if (ex && ex.length <= 110) {
    const g = maskWordInText(ex, w.english, "_____");
    if (g) return g;
  }
  const c = String(w.collocation || "");
  if (c && c.toLowerCase() !== w.english.toLowerCase()) return maskWordInText(c, w.english, "_____") || "";
  return "";
}

const pic = (w) => firstEmoji(w.emojis);

/** The text the gap sentence was made from (example, else collocation). */
function gapSource(w) {
  const ex = String(w.example || "");
  return ex && ex.length <= 110 && maskWordInText(ex, w.english, "_____") ? ex : String(w.collocation || "");
}

/** Which question kinds can this word support? */
function kindsFor(w, deck, { greek }) {
  const withPics = deck.filter((d) => pic(d));
  const kinds = [];
  if (pic(w)) kinds.push("pic2word");
  if (pic(w) && withPics.length >= 4 && new Set(withPics.map(pic)).size >= 4) kinds.push("word2pic");
  if (gapSentence(w)) kinds.push("gap");
  kinds.push("listen");
  if (greek && w.greek) kinds.push("greek");
  if (pic(w) && withPics.length >= 2) kinds.push("truefalse");
  return kinds;
}

function wordOptions(target, deck, avoidText = "", gapText = "") {
  // Never offer a wrong answer that already appears in the sentence on screen.
  const avoid = String(avoidText).toLowerCase();
  const inSentence = (w) => avoid.split(/[^a-z'-]+/).includes(w.english.toLowerCase());
  const pool = avoid ? deck.filter((w) => w.english === target.english || !inSentence(w)) : deck;
  const wrong = distractorsFor(target, pool, 3);
  // In a gap the answer is the word as the sentence needs it ("uncles"), and the wrong answers match ("aunts").
  const { answer, options } = gapText ? gapOptions(target, wrong, gapText) : { answer: target.english, options: [target.english, ...wrong] };
  const opts = shuffle(options);
  return { options: opts.map((t) => ({ text: t })), answer: opts.indexOf(answer) };
}

function pictureOptions(target, deck) {
  const seen = new Set([pic(target)]);
  const others = [];
  for (const w of shuffle(deck)) {
    if (others.length >= 3) break;
    const p = pic(w);
    if (!p || w.english === target.english || seen.has(p)) continue;
    seen.add(p);
    others.push(w);
  }
  const all = shuffle([target, ...others]);
  return { options: all.map((w) => ({ pic: pic(w), text: "", word: w.english })), answer: all.indexOf(target) };
}

/**
 * Build `count` questions. Kinds rotate so no two neighbours share a kind when it can be helped,
 * and every word is used before any word repeats.
 * @returns {{ id, kind, kindLabel, prompt, promptLang?, picture?, options: {text, pic?}[], answer: number, word: object, sayAnswer: string, sayPrompt?: string }[]}
 */
export function buildLiveQuestions(deck = [], { count = 10, greek = false } = {}) {
  const words = deck.filter((w) => w && w.english);
  if (words.length < 4) return [];
  const order = [];
  while (order.length < count) order.push(...shuffle(words));
  const rotation = shuffle(["pic2word", "gap", "word2pic", "listen", "truefalse", "greek"]);
  const out = [];
  let last = "";
  for (let i = 0; i < count; i++) {
    const w = order[i];
    const can = kindsFor(w, words, { greek });
    // Prefer the next kind in the rotation that this word supports and that differs from the last one.
    let kind = null;
    for (let k = 0; k < rotation.length; k++) {
      const cand = rotation[(i + k) % rotation.length];
      if (can.includes(cand) && cand !== last) { kind = cand; break; }
    }
    kind = kind || can.find((c) => c !== last) || can[0];
    last = kind;
    out.push(make(kind, w, words, i));
  }
  return out;
}

const CHECK_LABEL = { pickPicture: "Find the picture", listen: "Listen!", gap: "Fill the gap", trueFalse: "True or false?", oddOneOut: "Odd one out" };
const CHECK_KIND = { pickPicture: "word2pic", listen: "listen", gap: "gap", trueFalse: "truefalse", oddOneOut: "odd" };

/**
 * A lesson's check items as Lingo Live questions, in the lesson's order, so the class can answer them on phones.
 * @param {object[]} items check scene items (lesson JSON)
 * @param {(id: string) => ({ english: string, greek?: string, emoji?: string, example?: string } | null)} wordOf
 */
export function fromLessonChecks(items = [], wordOf = () => null) {
  const out = [];
  for (const it of items) {
    const opts = it.options || [];
    if (!CHECK_KIND[it.kind] || opts.length < 2 || !Number.isInteger(it.answer) || it.answer >= opts.length) continue;
    const isWord = it.kind === "pickPicture" || it.kind === "listen";
    const words = isWord ? opts.map((o) => wordOf(o)) : [];
    if (isWord && words.some((w) => !w)) continue;
    const focus = (it.wordId && wordOf(it.wordId)) || (isWord ? words[it.answer] : null);
    const word = focus ? { english: focus.english, greek: focus.greek || "", emojis: focus.emoji || focus.emojis || "", example: focus.example || "" } : null;
    let kind = CHECK_KIND[it.kind];
    let options;
    if (it.kind === "pickPicture") {
      const pics = words.map((w) => onePic(w.emoji || w.emojis));
      // Pictures only when every option has its own; otherwise the words.
      options = pics.every(Boolean) && new Set(pics).size === pics.length ? words.map((w, k) => ({ pic: pics[k], text: "", word: w.english })) : words.map((w) => ({ text: w.english }));
    } else if (it.kind === "listen") options = words.map((w) => ({ text: w.english }));
    else options = opts.map((o) => ({ text: String(o) }));
    const prompt = it.kind === "listen" ? "Which word do you hear?" : String(it.prompt?.text || "").replace(/_{2,}/g, "_____");
    const answerText = isWord ? words[it.answer].english : String(opts[it.answer]);
    out.push({
      id: `lc-${it.id || out.length + 1}`,
      kind,
      kindLabel: CHECK_LABEL[it.kind],
      prompt,
      picture: it.kind === "trueFalse" ? onePic(it.props?.[0]?.emoji) : "",
      options,
      answer: it.answer,
      answerText,
      word,
      explain: String(it.explain?.text || ""),
      sayAnswer: answerText,
      ...(it.kind === "listen" ? { sayPrompt: answerText } : {}),
      fromLesson: true,
    });
  }
  return out;
}
const onePic = (e) => firstEmoji(String(e || "")) || "";

function make(kind, w, deck, i) {
  const base = { id: `lq${i + 1}`, kind, kindLabel: KIND_LABEL[kind], word: w, sayAnswer: w.english };
  if (kind === "pic2word") return { ...base, prompt: "What's this?", picture: pic(w), ...wordOptions(w, deck) };
  if (kind === "word2pic") return { ...base, prompt: `Which picture is “${w.english}”?`, ...pictureOptions(w, deck) };
  if (kind === "gap") { const prompt = gapSentence(w); return { ...base, prompt, picture: "", sayPrompt: w.example || "", ...wordOptions(w, deck, prompt, gapSource(w)) }; }
  if (kind === "greek") return { ...base, prompt: w.greek, promptLang: "el", ...wordOptions(w, deck) };
  if (kind === "truefalse") {
    const truth = Math.random() < 0.5;
    const other = shuffle(deck.filter((d) => pic(d) && pic(d) !== pic(w) && d.english !== w.english))[0];
    const shown = truth || !other ? w : other;
    return {
      ...base,
      prompt: `This is “${w.english}”.`,
      picture: pic(shown),
      options: [{ text: "True" }, { text: "False" }],
      answer: shown === w ? 0 : 1,
    };
  }
  // listen
  return { ...base, prompt: "Which word do you hear?", sayPrompt: w.english, ...wordOptions(w, deck) };
}
