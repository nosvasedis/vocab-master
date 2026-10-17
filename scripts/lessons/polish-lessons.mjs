#!/usr/bin/env node
/* Deterministic polish after the AI passes:
   1. Backdrops follow the place a story caption names ("…walk across the savanna" → savanna).
   2. Any concrete noun still mentioned-but-not-shown gets a prop (word-bank emoji or an everyday map).
   Every change is validated; nothing is written if a lesson would become invalid.
   Usage: node scripts/lessons/polish-lessons.mjs [--dry-run] */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../lib/env.mjs";
import { validateLesson, visibilityIssues, BACKDROPS } from "../../desktop/renderer/lesson/schema.js";
import { allLessonFiles, getWord, writeLesson, writeCatalog, CPP_WORDBANK } from "./lib/catalog.mjs";
import { firstEmoji } from "../../desktop/renderer/arcade/deck.js";

const NOUNS = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, "content", "visual-lexicon.json"), "utf8")).nouns);
const DRY = process.argv.includes("--dry-run");

const PLACE = { rainforest: "jungle", jungle: "jungle", savanna: "savanna", cave: "cave", snow: "snow", snowy: "snow", zoo: "zoo", river: "river", lake: "river", museum: "museum", mountain: "mountain", mountains: "mountain", ocean: "underwater", underwater: "underwater", bedroom: "bedroom", library: "library", station: "station", volcano: "volcano", camp: "camp", campsite: "camp", tent: "camp", castle: "castle", market: "market", kitchen: "kitchen", classroom: "classroom", beach: "beach", forest: "forest", farm: "farm", garden: "garden", playground: "playground", village: "village", park: "park", stage: "stage", space: "space" };

const EVERYDAY = { hat: "🎩", cap: "🧢", scarf: "🧣", glove: "🧤", coat: "🧥", jacket: "🧥", shirt: "👕", dress: "👗", skirt: "👗", trousers: "👖", jeans: "👖", shoe: "👟", boot: "🥾", sock: "🧦", photo: "🖼️", picture: "🖼️", camera: "📷", phone: "📱", computer: "💻", tablet: "📱", book: "📖", notebook: "📓", pen: "🖊️", pencil: "✏️", crayon: "🖍️", ruler: "📏", bag: "🎒", backpack: "🎒", box: "📦", ball: "⚽", kite: "🪁", doll: "🪆", teddy: "🧸", car: "🚗", bus: "🚌", bike: "🚲", bicycle: "🚲", train: "🚆", plane: "✈️", boat: "⛵", ship: "🚢", truck: "🚚", tractor: "🚜", rocket: "🚀", door: "🚪", window: "🪟", table: "🪑", chair: "🪑", sofa: "🛋️", bed: "🛏️", lamp: "💡", clock: "🕰️", cup: "☕", plate: "🍽️", bowl: "🥣", spoon: "🥄", fork: "🍴", knife: "🔪", glass: "🥛", bottle: "🍼", cake: "🎂", bread: "🍞", apple: "🍎", banana: "🍌", orange: "🍊", milk: "🥛", water: "💧", juice: "🧃", egg: "🥚", cheese: "🧀", pizza: "🍕", sandwich: "🥪", soup: "🍲", tree: "🌳", flower: "🌸", grass: "🌿", leaf: "🍃", sun: "☀️", moon: "🌙", star: "⭐", cloud: "☁️", rain: "🌧️", snow: "❄️", river: "🏞️", lake: "🏞️", sea: "🌊", beach: "🏖️", mountain: "⛰️", hill: "⛰️", garden: "🌻", park: "🌳", dog: "🐶", cat: "🐱", bird: "🐦", fish: "🐟", horse: "🐴", cow: "🐄", sheep: "🐑", chicken: "🐔", duck: "🦆", rabbit: "🐰", mouse: "🐭", frog: "🐸", bee: "🐝", butterfly: "🦋", owl: "🦉", lion: "🦁", tiger: "🐯", elephant: "🐘", monkey: "🐒", bear: "🐻", house: "🏠", home: "🏠", school: "🏫", shop: "🏪", market: "🛒", street: "🛣️", road: "🛣️", bridge: "🌉", tower: "🗼", castle: "🏰", tent: "⛺", letter: "✉️", card: "💌", present: "🎁", gift: "🎁", balloon: "🎈", candle: "🕯️", umbrella: "☂️", key: "🔑", map: "🗺️", money: "💶", coin: "🪙", ticket: "🎟️", guitar: "🎸", drum: "🥁", piano: "🎹", violin: "🎻", trumpet: "🎺", flag: "🚩", poster: "🖼️", desk: "🪑", bin: "🗑️", family: "👨‍👩‍👧", party: "🎉", birthday: "🎂", food: "🍽️", toy: "🧸", animal: "🐾", room: "🚪", rock: "🪨", clothes: "👕", plant: "🪴", paint: "🎨", helmet: "⛑️", bird_: "🐦" };

// Word-bank emojis are mostly generic fillers (✨ sits on 200+ words); trust one only if ≤2 words share it.
const bankUsage = new Map();
for (const w of CPP_WORDBANK) if (w.emojis) bankUsage.set(w.emojis, (bankUsage.get(w.emojis) || new Set()).add(w.english.toLowerCase()));
const bankEmoji = new Map();
for (const w of CPP_WORDBANK) {
  const k = w.english.toLowerCase();
  if (!bankEmoji.has(k) && firstEmoji(w.emojis) && bankUsage.get(w.emojis).size <= 2) bankEmoji.set(k, firstEmoji(w.emojis));
}
const emojiFor = (noun) => EVERYDAY[noun] || bankEmoji.get(noun) || EVERYDAY[noun.replace(/s$/, "")] || bankEmoji.get(noun.replace(/s$/, "")) || null;

function locate(lesson, where) {
  const [sceneId, partId] = where.split("/");
  const scene = lesson.scenes.find((s) => s.id === sceneId);
  if (!scene) return null;
  if (scene.type === "story") return scene.panels.find((p) => p.id === partId);
  if (scene.type === "hook") return scene; // scene-level props cover every hook line
  if (scene.type === "check") return scene.items.find((i) => i.id === partId);
  return null;
}

let changedLessons = 0;
let backdropFixes = 0;
let propsAdded = 0;
const unresolved = [];
for (const file of allLessonFiles()) {
  const lesson = JSON.parse(fs.readFileSync(file, "utf8"));
  const before = JSON.stringify(lesson);
  for (const s of lesson.scenes) for (const p of s.panels || []) {
    const words = (p.caption?.text || "").toLowerCase().match(/[a-z]+/g) || [];
    const place = words.map((w) => PLACE[w]).find(Boolean);
    if (place && BACKDROPS.includes(place) && p.backdrop !== place) { p.backdrop = place; backdropFixes++; }
  }
  for (const v of visibilityIssues(lesson, NOUNS)) {
    const target = locate(lesson, v.where);
    const emoji = emojiFor(v.noun);
    if (!target || !emoji) { unresolved.push(`${lesson.id} ${v.where} "${v.noun}"`); continue; }
    target.props = target.props || [];
    if (target.props.length >= 8 || target.props.some((p) => p.label.toLowerCase() === v.noun)) continue;
    target.props.push({ emoji, label: v.noun });
    propsAdded++;
  }
  if (JSON.stringify(lesson) === before) continue;
  const { errors } = validateLesson(lesson, getWord, {});
  if (errors.length) { unresolved.push(`${lesson.id}: not written (${errors[0]})`); continue; }
  changedLessons++;
  if (!DRY) writeLesson(lesson);
}
if (!DRY) writeCatalog();
console.log(`${changedLessons} lesson(s) polished · ${backdropFixes} backdrop fixes · ${propsAdded} props added${DRY ? " (dry run)" : ""}`);
if (unresolved.length) console.log(`Unresolved (${unresolved.length}):\n  ${unresolved.join("\n  ")}`);
