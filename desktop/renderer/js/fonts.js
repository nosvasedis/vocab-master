/* Embeds the worksheet fonts (Inter + Manrope, Latin & Greek) into standalone print/PDF
 * documents, so exported sheets look identical on any computer and printer. */
const FILES = [
  ["Inter", "inter-latin-opsz-normal.woff2", "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD", "100 900"],
  ["Inter", "inter-greek-opsz-normal.woff2", "U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF", "100 900"],
  ["Manrope", "manrope-latin-wght-normal.woff2", "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD", "200 800"],
  ["Manrope", "manrope-greek-wght-normal.woff2", "U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF", "200 800"],
];

let cached = null;

async function toDataUrl(file) {
  const res = await fetch(new URL(`../assets/fonts/${file}`, import.meta.url));
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:font/woff2;base64,${btoa(bin)}`;
}

/** @font-face rules with the fonts inlined (cached after the first call). */
export async function worksheetFontCss() {
  if (cached) return cached;
  try {
    const rules = await Promise.all(FILES.map(async ([family, file, range, weight]) =>
      `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:block;src:url(${await toDataUrl(file)}) format("woff2");unicode-range:${range};}`));
    cached = rules.join("\n");
  } catch (err) {
    console.warn("Worksheet fonts could not be embedded; falling back to system fonts.", err);
    cached = "";
  }
  return cached;
}
