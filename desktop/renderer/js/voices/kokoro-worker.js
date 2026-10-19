/* Vocab Master — natural voices worker: Kokoro-82M (Apache-2.0) speaking on this computer.
 * Runs off the main thread so the app stays smooth. The model (about 90 MB, 8-bit) downloads once from
 * Hugging Face and is kept in the browser cache; each voice (≈0.5 MB) is cached on first use.
 * Messages in:  { type: "load" } · { type: "speak", id, text, voice, speed }
 * Messages out: { type: "progress", loaded, total } · { type: "ready", threads } · { type: "audio", id, samples, rate } · { type: "error", id?, message } */
import { KokoroTTS, env, transformersEnv } from "../../vendor/kokoro/kokoro.web.js";

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
env.wasmPaths = new URL("../../vendor/kokoro/", import.meta.url).href;
// Several threads only when the page is cross-origin isolated (the desktop app); 4 was the fastest in tests.
const threads = self.crossOriginIsolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) : 1;
transformersEnv.backends.onnx.wasm.numThreads = threads;

let loading = null;
const files = new Map(); // file → { loaded, total }

function load() {
  loading ||= KokoroTTS.from_pretrained(MODEL, {
    dtype: "q8",
    device: "wasm",
    progress_callback: (p) => {
      if (p.status !== "progress" || !p.total) return;
      files.set(p.file, { loaded: p.loaded, total: p.total });
      let loaded = 0, total = 0;
      for (const f of files.values()) { loaded += f.loaded; total += f.total; }
      postMessage({ type: "progress", loaded, total });
    },
  }).then((tts) => { postMessage({ type: "ready", threads }); return tts; })
    .catch((e) => { loading = null; throw e; });
  return loading;
}

// One sentence at a time, in order: the engine is single-file and the player wants the first lines first.
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  if (data?.type === "load") {
    load().catch((e) => postMessage({ type: "error", message: String(e?.message || e) }));
    return;
  }
  if (data?.type !== "speak") return;
  queue = queue.then(async () => {
    try {
      const tts = await load();
      const out = await tts.generate(data.text, { voice: data.voice, speed: data.speed || 1 });
      const samples = out.audio instanceof Float32Array ? out.audio : new Float32Array(out.audio);
      postMessage({ type: "audio", id: data.id, samples, rate: out.sampling_rate }, [samples.buffer]);
    } catch (e) {
      postMessage({ type: "error", id: data.id, message: String(e?.message || e) });
    }
  });
};
