# Kokoro (natural listening voices)

- `kokoro.web.js`: **kokoro-js 1.2.1** web build (Apache-2.0, `LICENSE-kokoro-js`), which bundles
  Transformers.js 3.x and ONNX Runtime Web (Apache-2.0 / MIT, `LICENSE-transformers-js`).
- `ort-wasm-simd-threaded.jsep.mjs` + `.wasm`: the ONNX Runtime WebAssembly engine from `@huggingface/transformers`
  (same release), served locally so nothing loads from a CDN.
- The voice model itself (**Kokoro-82M v1.0**, Apache-2.0, `onnx-community/Kokoro-82M-v1.0-ONNX`, 8-bit, about 92 MB)
  and the voice files (about 0.5 MB each) are **not** shipped: they download from Hugging Face the first time and
  stay in the browser cache (`transformers-cache`, `kokoro-voices`).

**One local patch:** the last line of `kokoro.web.js` also exports the bundled Transformers.js settings
(`Wg as transformersEnv`), so `js/voices/kokoro-worker.js` can set the number of WebAssembly threads.
Re-apply it after an update:

```
export{Ef as KokoroTTS,kf as TextSplitterStream,Mf as env,Wg as transformersEnv};
```

Threads need a cross-origin isolated page: the desktop app sends COOP/COEP headers on `app://` (`desktop/main.js`);
the web version runs single-threaded. Measured on the teacher's PC in Electron: about 0.9× real time with 4 threads,
and the first line plays while the rest is being made.
