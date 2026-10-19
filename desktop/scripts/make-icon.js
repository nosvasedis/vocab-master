/* Build the Electron PNG and multi-size ICO from the generated Vocab Master mark.
 * Keeps icon generation dependency-free and preserves alpha while resizing.
 * Usage: node scripts/make-icon.js
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "build");
const SOURCE = path.join(__dirname, "..", "build", "vocab-master-mark-source.png"); // full-size original (the app ships a 256 px copy)
fs.mkdirSync(OUT, { recursive: true });

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decodePng(file) {
  const bytes = fs.readFileSync(file);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!bytes.subarray(0, 8).equals(signature)) throw new Error("Source icon is not a PNG");
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += length + 12;
  }
  if (!width || !height || bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error("Source icon must be a non-interlaced, 8-bit RGBA PNG");
  }

  const stride = width * 4;
  const scanlines = zlib.inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(height * stride);
  let input = 0;
  for (let y = 0; y < height; y++) {
    const filter = scanlines[input++];
    const row = y * stride;
    const previousRow = row - stride;
    for (let x = 0; x < stride; x++) {
      const raw = scanlines[input++];
      const left = x >= 4 ? pixels[row + x - 4] : 0;
      const above = y > 0 ? pixels[previousRow + x] : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[previousRow + x - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = Math.floor((left + above) / 2);
      else if (filter === 4) predictor = paeth(left, above, upperLeft);
      else if (filter !== 0) throw new Error("Unsupported PNG filter: " + filter);
      pixels[row + x] = (raw + predictor) & 255;
    }
  }
  return { width, height, pixels };
}

function resizeArea(source, size) {
  const { width, height, pixels } = source;
  const output = Buffer.alloc(size * size * 4);
  const scaleX = width / size;
  const scaleY = height / size;
  for (let y = 0; y < size; y++) {
    const top = y * scaleY;
    const bottom = (y + 1) * scaleY;
    for (let x = 0; x < size; x++) {
      const left = x * scaleX;
      const right = (x + 1) * scaleX;
      let red = 0, green = 0, blue = 0, alpha = 0;
      for (let sy = Math.floor(top); sy < Math.ceil(bottom); sy++) {
        const weightY = Math.max(0, Math.min(bottom, sy + 1) - Math.max(top, sy));
        for (let sx = Math.floor(left); sx < Math.ceil(right); sx++) {
          const weightX = Math.max(0, Math.min(right, sx + 1) - Math.max(left, sx));
          const weight = weightX * weightY;
          const index = (sy * width + sx) * 4;
          const a = pixels[index + 3] / 255;
          alpha += a * weight;
          red += pixels[index] * a * weight;
          green += pixels[index + 1] * a * weight;
          blue += pixels[index + 2] * a * weight;
        }
      }
      const area = scaleX * scaleY;
      const index = (y * size + x) * 4;
      if (alpha > 0) {
        output[index] = Math.round(red / alpha);
        output[index + 1] = Math.round(green / alpha);
        output[index + 2] = Math.round(blue / alpha);
      }
      output[index + 3] = Math.round(alpha / area * 255);
    }
  }
  return output;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuffer = Buffer.from(type, "ascii");
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function encodePng(rgba, size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = size * 4;
  const raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let nextOffset = 6 + entries.length * 16;
  const directory = [];
  const images = [];
  for (const { size, png } of entries) {
    const entry = Buffer.alloc(16);
    entry[0] = size === 256 ? 0 : size;
    entry[1] = size === 256 ? 0 : size;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(nextOffset, 12);
    directory.push(entry);
    images.push(png);
    nextOffset += png.length;
  }
  return Buffer.concat([header, ...directory, ...images]);
}

const source = decodePng(SOURCE);
const png512 = encodePng(resizeArea(source, 512), 512);
const icoEntries = [16, 24, 32, 48, 64, 128, 256].map((size) => ({
  size,
  png: encodePng(resizeArea(source, size), size),
}));
const iconIco = encodeIco(icoEntries);
fs.writeFileSync(path.join(OUT, "icon.png"), png512);
fs.writeFileSync(path.join(OUT, "icon.ico"), iconIco);
console.log("Icons written from " + SOURCE + " to " + OUT + " (icon.png " + png512.length + "b, icon.ico " + iconIco.length + "b)");
