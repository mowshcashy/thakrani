/*
 * engine.js — يشغّل نموذج التلاوة (Whisper) عبر transformers.js + onnxruntime-web.
 * يُحمَّل من zn-asr://local/app/… مع عزل المصدر، فيعمل WASM بعدّة خيوط.
 */
import { pipeline, env } from '../vendor/transformers/transformers.min.js';

const MODEL_ROOT = new URL('../../model/', location.href).href; // zn-asr://local/model/

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = MODEL_ROOT;
env.useBrowserCache = false;

const wasm = env.backends.onnx.wasm;
wasm.wasmPaths = {
  mjs: new URL('../vendor/transformers/ort-wasm-simd-threaded.jsep.mjs', location.href).href,
  wasm: MODEL_ROOT + 'ort/ort-wasm-simd-threaded.jsep.wasm',
};
const cores = navigator.hardwareConcurrency || 4;
wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(8, cores - 1)) : 1;
wasm.proxy = false;

let asr = null;
const queue = [];
let busy = false;

async function load() {
  const t0 = performance.now();
  asr = await pipeline('automatic-speech-recognition', 'whisper', { dtype: 'q8', device: 'wasm' });
  // إحماء: أول تشغيل أبطأ (تهيئة الذاكرة) — نجريه هنا لا على أول آية
  await asr(new Float32Array(16000), { language: 'arabic', task: 'transcribe' });
  return { loadMs: Math.round(performance.now() - t0), threads: wasm.numThreads, isolated: self.crossOriginIsolated };
}

async function pump() {
  if (busy || !queue.length) return;
  busy = true;
  const { id, audio } = queue.shift();
  try {
    const t0 = performance.now();
    const out = await asr(audio, { language: 'arabic', task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 });
    window.engine.result({ id, text: (out && out.text) || '', ms: Math.round(performance.now() - t0) });
  } catch (e) {
    window.engine.result({ id, error: String((e && e.message) || e) });
  } finally {
    busy = false;
    pump();
  }
}

window.engine.onJob((job) => {
  queue.push(job);
  pump();
});

load().then(
  (info) => window.engine.ready(info),
  (e) => window.engine.fatal(String((e && e.message) || e))
);
