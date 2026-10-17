/* Lingo Live — phone mode settings. The Firebase web config is public by design (access is enforced by
   firebase/database.rules.json). Shared by the projector host and the phone page (copied there by
   scripts/live/build-play.mjs). */
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCOcbkE4rDyuPNdF_nL0Kj-IKMoN9iFVO0",
  authDomain: "vocab-master-live.firebaseapp.com",
  databaseURL: "https://vocab-master-live-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "vocab-master-live",
  appId: "1:469061856866:web:e5c1f5d915f17449876b3b",
};

/** Where students go (the QR code adds ?pin=…). */
export const PLAY_URL = "https://vocab-master-live.web.app";

/** Shapes and their colours, shared by projector and phones. */
export const SHAPE_COLORS = { tri: "#e8364f", dia: "#2f6fe4", cir: "#f2a900", sq: "#1aa260" };

/** Avatars a student can pick (friendly animals). */
export const AVATARS = ["🦊", "🐼", "🐯", "🦁", "🐸", "🐵", "🐨", "🐰", "🐻", "🐧", "🦄", "🐙", "🐢", "🦉", "🐝", "🐬"];
