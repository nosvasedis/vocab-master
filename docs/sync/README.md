# Accounts & sync

Sign in once (Google or email + password) on any computer, web or desktop, to get your classes, worksheets, settings and, if you choose, your AI keys there. Everything still works offline; changes upload when the connection comes back. The design is in [PROPOSAL.md](PROPOSAL.md), approved with Google sign-in included.

## One-time setup (Firebase project `vocab-master-live`)

1. **Email/Password**: Firebase console → Authentication → Sign-in method → Email/Password → Enable.
   - Or from `firebase/`: `npx -y firebase-tools@latest login`, then `npx -y firebase-tools@latest deploy --only auth --project vocab-master-live`.
   - `firebase.json` lists `emailPassword: true`. Deploying only switches providers on, never off.
2. **Google**: Firebase console → Authentication → Sign-in method → Google → Enable, and choose the support email shown on Google's consent screen.
   - `vocab-master-live.web.app` and `localhost` are authorised domains by default. Nothing else is needed.
3. **Deploy the database rules and the sign-in page**: `node scripts/live/build-play.mjs --deploy`.
   - This copies the Firebase SDK into `firebase/public/vendor`, then deploys hosting, database rules and auth.
   - It publishes `firebase/public/signin.html`, the Google hand-off page. The Lingo Live room rules are unchanged.
4. Optional: Authentication → Templates → Password reset, to set the sender name.

Until steps 1–3 are done, sign-in shows "This sign-in method isn't switched on…", and the rest of the app is unaffected.

## How it works

| piece | file |
|---|---|
| which keys sync, and how | `desktop/renderer/js/sync/registry.js` |
| merge rules (pure) | `js/sync/merge.js` |
| engine: change capture, outbox, merge, key vault | `js/sync/engine.js` |
| Firebase Auth + Realtime Database | `js/sync/backend-firebase.js` |
| several teachers on one computer | `js/sync/profiles.js` |
| the remembered vault key | `js/sync/vault-keys.js` |
| service used by the app | `js/sync/index.js` |
| Settings → Account & sync, merge question | `js/sync/account-ui.js`, `styles/sync.css` |
| Google sign-in, app side | `js/sync/google.js` |
| Google sign-in, desktop loopback | `desktop/google-signin.js` (IPC `google:signin`) |
| Google sign-in, hosted page | `firebase/public/signin.html`, `signin.js` |
| security rules | `firebase/database.rules.json` (`users/{uid}`) |

**Hooks into existing files (small, additive):**
- `js/main.js`: `startSync()` after `hydrateStorage()`, plus listeners that refresh prefs and the library when another computer changes them.
- `js/dialogs.js`: the Account section.
- `index.html`: the stylesheet, plus emulator hosts in `connect-src`.
- `desktop/main.js`: per-profile key-chain slots, the Google IPC, `.json` in the Save dialog, and one smoke step.
- `desktop/preload.cjs`: `googleSignIn`, `googleCancel`.

**Data:**
- Everything lives under `users/{uid}/` with three parts:
  - `index/{key}/{id} = time`: small, watched live.
  - `items/{key}/{id} = { v, t, by, del? }`: the records.
  - `vault`: the encrypted AI keys.
- Lists (worksheets, classes) sync per record, objects (settings, worksheet history) per field, and game settings as whole values.
- The later write wins per record. A deletion is a dated tombstone (kept 90 days).

**AI keys:**
- Off by default. Settings → Account → Sync my AI keys.
- Encrypted on this computer: PBKDF2-SHA256 (600k rounds) → AES-GCM-256, bound to the account's uid.
- The passphrase never leaves the computer and is never stored. Once unlocked, the derived AES key is remembered on that computer as a non-extractable CryptoKey in IndexedDB (`js/sync/vault-keys.js`), so the passphrase is typed once per computer, not after every start. Removing the teacher from the computer forgets it.
- A new computer whose account already holds keys asks for the passphrase ("Get my keys"), never for a new one. Turning key sync off on one computer turns it off on the others (their keys stay). A key that vanished while the app was closed comes back from the account instead of erasing it everywhere; "Forgot it?" never erases a key the computer doesn't have.
- Each provider's key merges on its own.
- A forgotten passphrase can't be recovered: "Forgot it?" replaces the vault with this computer's keys.

**Profiles:**
- Each teacher who signs in on a computer gets a profile. "This computer" is the profile for using the app without an account.
- Switching moves the current teacher's data into a per-profile stash (IndexedDB; on desktop the keys go to `keychain-p-<uid>-<provider>.bin`), restores the other teacher's, then reloads.
- Each profile has its own named Firebase app, so Lingo Live's anonymous sign-in is never touched.

**First sign-in with data already here:** if both this computer and the account have worksheets or classes, the app asks:
- Merge (recommended),
- or use the account's data only (a backup file is saved first).

**Backup file:**
- Settings → Account → Export / Import backup. It works without an account.
- AI keys are included only if you add a passphrase, and are encrypted like the vault.

**Transport:** WebSockets only (`forceWebSockets`). The SDK's long-polling fallback loads scripts, which the CSP blocks. Without this, one failed socket would leave sync stuck "Offline". This is global to the SDK, so Lingo Live benefits too.

## Checking it locally (no real accounts)

```bash
cd firebase && npx -y firebase-tools@latest emulators:start --only auth,database,hosting --project vocab-master-live
node scripts/sync/rules-check.mjs
```

- `rules-check.mjs` runs 16 checks of the rules on the emulator.
- Open `http://localhost:8787/?syncEmulator=1` (web only; `?syncEmulator=0` turns it off). The Account panel then says "Developer mode".
- Throwaway emulator accounts are in `scripts/sync/emulator-accounts.json`.
- `127.0.0.1:<port>` and `localhost:<port>` have separate storage, so they act as two laptops.
- `npm test` covers the merge rules, two-laptop engine scenarios, the vault, the rules file and the desktop loopback (`tests/sync.test.mjs`).
