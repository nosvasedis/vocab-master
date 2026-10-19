/* Sync — the AI-key vault. Keys are encrypted on this computer with a passphrase only the teacher knows:
   PBKDF2-SHA256 (600,000 rounds, random 16-byte salt) → AES-GCM-256, a fresh 12-byte IV on every save.
   Only { salt, iv, ct } is uploaded, so the database (and anyone who can read it) sees ciphertext only.
   The derived key is non-extractable and lives in memory for this session. Works in browsers and Node 20+. */

const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const VAULT_ITERATIONS = 600000;
export const MIN_PASSPHRASE = 10;

export function toB64(bytes) {
  let s = "";
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
}
export function fromB64(b64) {
  const s = atob(String(b64));
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

const random = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

/** Passphrase + salt → AES-GCM key (non-extractable). */
export async function deriveKey(passphrase, salt, iterations = VAULT_ITERATIONS) {
  const base = await subtle().importKey("raw", enc.encode(String(passphrase).normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** A key handle for one vault: remembers the salt so later saves reuse the derivation. */
export async function unlockKey(passphrase, vault = null) {
  const salt = vault?.salt ? fromB64(vault.salt) : random(16);
  const iterations = vault?.iter || VAULT_ITERATIONS;
  return { key: await deriveKey(passphrase, salt, iterations), salt: toB64(salt), iter: iterations };
}

/** Encrypt a JSON-able value. `aad` binds the ciphertext to its owner (the account uid). */
export async function seal(handle, value, aad = "") {
  const iv = random(12);
  const ct = await subtle().encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, handle.key, enc.encode(JSON.stringify(value)));
  return { v: 1, kdf: "PBKDF2-SHA256", iter: handle.iter, salt: handle.salt, iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

/** Decrypt a sealed vault. Throws { code: "bad-passphrase" } when the passphrase (or owner) is wrong. */
export async function open(handle, vault, aad = "") {
  try {
    const pt = await subtle().decrypt({ name: "AES-GCM", iv: fromB64(vault.iv), additionalData: enc.encode(aad) }, handle.key, fromB64(vault.ct));
    return JSON.parse(dec.decode(pt));
  } catch {
    throw Object.assign(new Error("That passphrase doesn't open your saved keys."), { code: "bad-passphrase" });
  }
}

/** One-shot helpers (backup files). */
export async function encryptWithPassphrase(passphrase, value, aad = "") {
  return seal(await unlockKey(passphrase), value, aad);
}
export async function decryptWithPassphrase(passphrase, vault, aad = "") {
  return open(await unlockKey(passphrase, vault), vault, aad);
}

/** Rough strength hint for the passphrase field. */
export function passphraseHint(p) {
  const s = String(p || "");
  if (s.length < MIN_PASSPHRASE) return { ok: false, text: `At least ${MIN_PASSPHRASE} characters.` };
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(s)).length;
  const words = s.trim().split(/\s+/).length;
  if (s.length >= 16 || words >= 4 || (s.length >= 12 && kinds >= 3)) return { ok: true, text: "Strong." };
  return { ok: true, text: "OK. A longer phrase (four words or more) is stronger." };
}
