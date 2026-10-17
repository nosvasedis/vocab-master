// Build the picture packs bundled with Vocab Master: { key → SVG inner markup }, keyed by emoji code points
// (lower-case hex joined by "-", without FE0F and skin-tone modifiers).
//
// Usage (in an empty folder):
//   npm i openmoji @iconify-json/fluent-emoji-high-contrast lucide-static emojibase-data
//   node build-picture-packs.mjs <path-to>/desktop/renderer/assets/pictures
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
const SKIN = /^1f3f[b-f]$/;
const keyOfHex = (hex) => hex.toLowerCase().split(/[-_ ]/).filter((c) => c && c !== "fe0f" && !SKIN.test(c)).join("-");
const minify = (s) => s
  .replace(/<\?xml[^>]*>/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<title>[\s\S]*?<\/title>/g, "")
  .replace(/\s+id="[^"]*"/g, "").replace(/>\s+</g, "><").replace(/\s{2,}/g, " ").trim();
const inner = (svg) => minify(svg).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
const write = (name, obj) => {
  const file = path.join(OUT, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(obj));
  console.log(name, Object.keys(obj.icons).length, "icons,", (fs.statSync(file).size / 1e6).toFixed(2), "MB");
};

// ── OpenMoji (black outline) — 72×72 ──
{
  const dir = "node_modules/openmoji/black/svg";
  const icons = {};
  for (const f of fs.readdirSync(dir)) {
    const hex = f.replace(/\.svg$/, "");
    if (hex.split("-").some((c) => SKIN.test(c.toLowerCase()))) continue;
    const key = keyOfHex(hex);
    if (!key || icons[key]) continue;
    // Black lines follow the surrounding text colour (black on paper, white on dark game screens).
    icons[key] = inner(fs.readFileSync(path.join(dir, f), "utf8")).replace(/"#000(000)?"/gi, "\"currentColor\"");
  }
  write("openmoji", { viewBox: "0 0 72 72", license: "OpenMoji — CC BY-SA 4.0 — openmoji.org", icons });
}

// ── Fluent Emoji High Contrast (Microsoft) — 32×32 ──
{
  const set = require("@iconify-json/fluent-emoji-high-contrast/icons.json");
  const chars = require("@iconify-json/fluent-emoji-high-contrast/chars.json");
  const icons = {};
  for (const [hex, name] of Object.entries(chars)) {
    const key = keyOfHex(hex);
    const icon = set.icons[name] || set.icons[set.aliases?.[name]?.parent];
    if (!key || !icon || icons[key]) continue;
    icons[key] = minify(icon.body);
  }
  write("fluent", { viewBox: `0 0 ${set.width || 32} ${set.height || 32}`, license: "Fluent Emoji — MIT — Microsoft", icons });
}

// ── Lucide line icons — matched to emojis by name (24×24, stroke icons) ──
{
  const tags = require("lucide-static/tags.json");
  const emojis = require("emojibase-data/en/data.json");
  const lucideNames = Object.keys(tags);
  const words = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const STOP = new Set(["with", "and", "of", "the", "a", "face", "button", "symbol", "sign", "mark"]);
  const icons = {};
  const matches = {};
  for (const e of emojis) {
    if (!e.label || e.group === 2 /* skin tones */) continue;
    const key = keyOfHex(e.hexcode);
    if (!key || key.includes("-1f3f")) continue;
    const label = e.label.toLowerCase();
    if (/^(regional indicator|flag|keycap)/.test(label)) continue;
    const labelWords = words(label).filter((w) => !STOP.has(w));
    let best = null;
    let bestScore = 0;
    for (const name of lucideNames) {
      const nameWords = name.split("-");
      let score = 0;
      if (name === label.replace(/\s+/g, "-")) score = 100;
      else if (name.replace(/-/g, "") === labelWords.join("")) score = 90;
      // Every word of the icon name must be in the label, and a one-word icon must be the label's only content word
      // (so "hot dog" never becomes a dog).
      else if (nameWords.every((w) => labelWords.includes(w)) && (nameWords.length > 1 || labelWords.length === 1)) score = 40 + nameWords.length * 5;
      if (score > bestScore || (score === bestScore && score && name.length < best.length)) { best = name; bestScore = score; }
    }
    if (best && bestScore >= 40) {
      icons[key] = inner(fs.readFileSync(`node_modules/lucide-static/icons/${best}.svg`, "utf8"));
      matches[e.emoji] = `${label} → ${best}`;
    }
  }
  write("lucide", { viewBox: "0 0 24 24", stroke: true, license: "Lucide — ISC — lucide.dev", icons });
  fs.writeFileSync(path.join(process.cwd(), "lucide-matches.txt"), Object.entries(matches).map(([e, m]) => `${e}  ${m}`).join("\n"));
}

// Licences, for the About screen and to satisfy attribution terms.
fs.writeFileSync(path.join(OUT, "LICENSES.txt"), [
  "OpenMoji — the open-source emoji and icon project. License: CC BY-SA 4.0. https://openmoji.org",
  "Fluent Emoji (High Contrast) — Microsoft. License: MIT. https://github.com/microsoft/fluentui-emoji",
  "Lucide icons — License: ISC. https://lucide.dev",
].join("\n") + "\n");
