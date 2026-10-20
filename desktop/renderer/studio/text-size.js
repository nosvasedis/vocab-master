/* Text size for every paper (tests, dictations, worksheets): a zoom on the sheet's content, so pictures, boxes
 * and writing lines grow with the words while the page stays A4. Pure — the renderers and Word export read it. */
export const TEXT_SIZES = {
  small: { label: "A−", name: "Smaller", zoom: 0.9 },
  standard: { label: "A", name: "Standard", zoom: 1 },
  large: { label: "A+", name: "Larger", zoom: 1.12 },
  xlarge: { label: "A++", name: "Largest", zoom: 1.25 },
};
export const textSizeKey = (v) => (TEXT_SIZES[v] ? v : "standard");
export const textZoom = (v) => TEXT_SIZES[textSizeKey(v)].zoom;
/** Word sizes are half-points: a run of 22 (11 pt) at "Larger" is 25. */
export const scaledSize = (size, v) => Math.round(size * textZoom(v));
export const TEXT_SIZE_CSS = Object.entries(TEXT_SIZES)
  .filter(([k]) => k !== "standard")
  .map(([k, v]) => `.worksheet.text-${k} > * { zoom: ${v.zoom}; }`)
  .join("\n");
/** Spacing choices (the worksheet "density"). */
export const SPACINGS = [["compact", "Compact"], ["standard", "Standard"], ["comfortable", "Roomy"]];
