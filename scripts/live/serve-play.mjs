#!/usr/bin/env node
/* Serves the phone page (firebase/public) on http://localhost:5055 for local testing.
   It talks to the real Firebase project, exactly like the deployed page. Usage: node scripts/live/serve-play.mjs */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../lib/env.mjs";

const DIR = path.join(ROOT, "firebase", "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
const PORT = Number(process.env.PORT || 5055);
http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const file = path.normalize(path.join(DIR, rel));
  if (!file.startsWith(DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end("Not found"); return; }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Lingo Live phone page: http://localhost:${PORT}`));
