#!/usr/bin/env node
/* Run cargo on the app shell (desktop/src-tauri) even when ~/.cargo/bin isn't on PATH yet (right after installing
 * Rust). `node scripts/cargo.mjs test` → cargo test --manifest-path src-tauri/Cargo.toml */
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DESKTOP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const [cmd = "build", ...rest] = process.argv.slice(2);
const env = { ...process.env, PATH: `${path.join(os.homedir(), ".cargo", "bin")}${path.delimiter}${process.env.PATH}` };
const r = spawnSync("cargo", [cmd, "--manifest-path", path.join(DESKTOP, "src-tauri", "Cargo.toml"), ...rest], { stdio: "inherit", env });
process.exit(r.status ?? 1);
