/* Picture styles: the emoji chosen for each word can be drawn as colour emoji (default),
 * OpenMoji outlines, Fluent high-contrast, or Lucide line icons — or left out.
 * Packs live in assets/pictures/*.json ({ viewBox, icons: { key → SVG inner markup } })
 * and load only when a style needs them. */
import { configurePictures, pictureKey } from "../app.js";

export const PICTURE_STYLES = {
  emoji: { label: "Colour emoji", hint: "Today’s colourful emojis" },
  openmoji: { label: "Outline drawings", hint: "OpenMoji · light lines, least ink" },
  fluent: { label: "Bold outline", hint: "Fluent · strong black shapes" },
  lucide: { label: "Line icons", hint: "Lucide · app-style icons (others drawn as outlines)" },
  none: { label: "No pictures", hint: "Words only" },
};

const packs = {};
const loading = {};

async function loadPack(name) {
  if (packs[name]) return packs[name];
  loading[name] ||= fetch(new URL(`../assets/pictures/${name}.json`, import.meta.url))
    .then((r) => r.json())
    .then((p) => { packs[name] = p; return p; })
    .catch((err) => { console.warn(`Picture pack ${name} failed to load`, err); delete loading[name]; return null; });
  return loading[name];
}

/** Load whatever a style needs (Lucide falls back to OpenMoji for words it has no icon for). */
export async function ensurePictureStyle(style) {
  if (style === "openmoji" || style === "lucide") await loadPack("openmoji");
  if (style === "fluent") await loadPack("fluent");
  if (style === "lucide") await loadPack("lucide");
}

function lookup(pack, key) {
  if (!pack) return null;
  return pack.icons[key] || pack.icons[key.split("-")[0]] || null;
}

/** SVG markup for one emoji in a style, or null when the style has no drawing for it. */
export function pictureSvg(emoji, style) {
  const key = pictureKey(emoji);
  if (!key) return null;
  let pack = null;
  let body = null;
  if (style === "lucide") {
    pack = packs.lucide;
    body = lookup(pack, key);
    if (!body) { pack = packs.openmoji; body = lookup(pack, key); }
  } else if (style === "openmoji" || style === "fluent") {
    pack = packs[style];
    body = lookup(pack, key);
  }
  if (!body) return null;
  const strokeAttrs = pack.stroke ? ` fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"` : "";
  return `<svg class="pic" viewBox="${pack.viewBox}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${emoji}"${strokeAttrs}>${body}</svg>`;
}

// Hand the renderer to the worksheet engine (worksheets, preview, projector, PDF).
configurePictures({ svg: pictureSvg });

/**
 * Rasterise the pictures a worksheet uses to PNG (for Word files, which can't show SVG).
 * Returns { key → base64 PNG }.
 */
export async function rasterisePictures(emojis, style, px = 96) {
  await ensurePictureStyle(style);
  const out = {};
  for (const emoji of new Set(emojis)) {
    const key = pictureKey(emoji);
    const svg = pictureSvg(emoji, style);
    if (!key || !svg || out[key]) continue;
    const sized = svg.replace("<svg ", `<svg width="${px}" height="${px}" color="#111" `);
    try {
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = px;
      canvas.height = px;
      canvas.getContext("2d").drawImage(img, 0, 0, px, px);
      out[key] = canvas.toDataURL("image/png").split(",")[1];
    } catch { /* skip pictures that fail to draw */ }
  }
  return out;
}

/**
 * Loads the picture packs and returns a test "can every drawn style show this emoji?".
 * Emojis missing from a pack silently vanish from worksheets in that style, so the AI is told
 * to pick another. Resolves to null (no check) when the packs cannot be read.
 */
export async function emojiDrawableCheck() {
  const [openmoji, fluent] = await Promise.all([loadPack("openmoji"), loadPack("fluent")]);
  if (!openmoji || !fluent) return null;
  return (emoji) => {
    const key = pictureKey(emoji);
    return !!key && !!lookup(openmoji, key) && !!lookup(fluent, key);
  };
}
