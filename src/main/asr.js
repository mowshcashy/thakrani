'use strict';
/*
 * asr.js — محرّك التسميع (التعرّف على التلاوة) دون إنترنت.
 *
 * النموذج: tarteel-ai/whisper-base-ar-quran (Apache-2.0) محوَّلًا إلى ONNX ومكمَّمًا (int8)
 * بسكربت بايثون (scripts/asr/convert.py). لا يُضمَّن في المثبّت (~١٣٠ ميجا)؛ يُنزَّل
 * مرة واحدة عند أول استخدام من إصدار GitHub، ويُتحقَّق من بصمته (sha256).
 *
 * التشغيل: نافذة مخفية تُحمَّل من البروتوكول الخاص zn-asr:// مع ترويسات العزل
 * (COOP/COEP) — فيعمل WebAssembly بعدّة خيوط، أسرع بكثير من خيط واحد.
 * الواجهة ترسل الصوت (Float32 بتردد 16kHz) والمحرّك يعيد النص.
 */

const { app, protocol, ipcMain, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');

const SCHEME = 'zn-asr';
const MODEL_VERSION = 'whisper-base-ar-quran-1';
const BASE_URL = 'https://github.com/mowshcashy/thakrani/releases/download/v1.6.0/';

// [اسم الملف في الإصدار، المسار المحلي، الحجم، sha256] — يولّدها scripts/asr/manifest.js
const FILES = require('./asr-manifest.json');

protocol.registerSchemesAsPrivileged([{
  scheme: SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.woff2': 'font/woff2',
};

const RENDERER_DIR = path.join(__dirname, '..', 'renderer');

function modelDir() {
  return process.env.ZN_ASR_DIR || path.join(app.getPath('userData'), 'asr', MODEL_VERSION);
}

let engineWin = null;
let engineReady = null; // Promise
let idleTimer = null;
let jobSeq = 0;
const jobs = new Map(); // id → {resolve, reject}
let downloading = null; // {done, total, cancel}
const listeners = new Set(); // webContents تتابع التقدّم

function log(...a) {
  if (process.env.ZN_DEBUG) console.log('[asr]', ...a);
}

/* ─────────── البروتوكول ─────────── */
function registerProtocol() {
  protocol.handle(SCHEME, async (req) => {
    const u = new URL(req.url);
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    let file = null;
    if (rel.startsWith('app/')) file = path.join(RENDERER_DIR, rel.slice(4));
    else if (rel.startsWith('model/')) file = path.join(modelDir(), rel.slice(6));
    const root = rel.startsWith('app/') ? RENDERER_DIR : modelDir();
    if (!file || !path.resolve(file).startsWith(path.resolve(root))) {
      return new Response('forbidden', { status: 403 });
    }
    try {
      const buf = await fsp.readFile(file);
      log('serve', rel, buf.length);
      return new Response(buf, {
        status: 200,
        headers: {
          'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
          'cross-origin-opener-policy': 'same-origin',
          'cross-origin-embedder-policy': 'require-corp',
          'cross-origin-resource-policy': 'same-origin',
          'cache-control': 'no-store',
        },
      });
    } catch (e) {
      log('404', rel);
      return new Response('not found', { status: 404 });
    }
  });
}

/* ─────────── حالة النموذج والتنزيل ─────────── */
function totalSize() {
  return FILES.reduce((s, f) => s + f.size, 0);
}

async function isInstalled() {
  for (const f of FILES) {
    try {
      const st = await fsp.stat(path.join(modelDir(), f.path));
      if (st.size !== f.size) return false;
    } catch (_) {
      return false;
    }
  }
  return true;
}

async function status() {
  return {
    installed: await isInstalled(),
    downloading: downloading ? { done: downloading.done, total: downloading.total } : null,
    size: totalSize(),
    engine: !!engineWin,
  };
}

function emit(channel, payload) {
  for (const wc of listeners) {
    if (!wc.isDestroyed()) wc.send(channel, payload);
  }
}

async function downloadFile(f, onBytes, signal) {
  const dest = path.join(modelDir(), f.path);
  try {
    const st = await fsp.stat(dest);
    if (st.size === f.size) { onBytes(f.size); return; } // موجود مسبقًا (تنزيل سابق انقطع بعده)
  } catch (_) {}
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const tmp = dest + '.part';
  // fetch حق Node: net.fetch في Electron يرجع HTTP 400 بعد تحويل GitHub لخادم الملفات
  const res = await fetch(BASE_URL + f.name, { signal, redirect: 'follow', headers: { 'user-agent': 'Thakkerni' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${f.name}`);
  const hash = crypto.createHash('sha256');
  const out = fs.createWriteStream(tmp);
  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
      if (!out.write(Buffer.from(value))) await new Promise((r) => out.once('drain', r));
      onBytes(value.length);
    }
  } finally {
    await new Promise((r) => out.end(r));
  }
  const sum = hash.digest('hex');
  if (sum !== f.sha256) {
    await fsp.rm(tmp, { force: true });
    throw new Error('الملف وصل تالفًا، جرّب مرة ثانية');
  }
  await fsp.rename(tmp, dest);
}

async function download() {
  if (downloading) return downloading.promise;
  const ctrl = new AbortController();
  const state = { done: 0, total: totalSize(), ctrl };
  downloading = state;
  let last = 0;
  const onBytes = (n) => {
    state.done += n;
    const now = Date.now();
    if (now - last > 150 || state.done >= state.total) {
      last = now;
      emit('asr:progress', { done: state.done, total: state.total });
    }
  };
  state.promise = (async () => {
    try {
      for (const f of FILES) await downloadFile(f, onBytes, ctrl.signal);
      emit('asr:progress', { done: state.total, total: state.total, finished: true });
      return { ok: true };
    } catch (e) {
      const msg = ctrl.signal.aborted ? 'أُلغي التنزيل' : (e && e.message) || String(e);
      emit('asr:progress', { error: msg });
      return { ok: false, error: msg };
    } finally {
      downloading = null;
    }
  })();
  return state.promise;
}

function cancelDownload() {
  if (downloading) downloading.ctrl.abort();
}

async function remove() {
  closeEngine();
  await fsp.rm(modelDir(), { recursive: true, force: true });
  return status();
}

/* ─────────── المحرّك ─────────── */
function ensureEngine() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(closeEngine, 10 * 60 * 1000); // يُغلق بعد ١٠ دقائق خمول ليحرّر الذاكرة
  if (engineWin && !engineWin.isDestroyed()) return engineReady;

  engineWin = new BrowserWindow({
    show: false,
    width: 200,
    height: 200,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'asr-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  if (process.env.ZN_DEBUG) {
    engineWin.webContents.on('console-message', (_e, _l, msg) => console.log('[asr-engine]', msg));
  }
  engineReady = new Promise((resolve, reject) => {
    const onReady = (e, info) => {
      if (!engineWin || e.sender !== engineWin.webContents) return;
      ipcMain.removeListener('asr-engine:ready', onReady);
      ipcMain.removeListener('asr-engine:fatal', onFatal);
      log('engine ready', info);
      resolve(info);
    };
    const onFatal = (e, msg) => {
      if (!engineWin || e.sender !== engineWin.webContents) return;
      ipcMain.removeListener('asr-engine:ready', onReady);
      ipcMain.removeListener('asr-engine:fatal', onFatal);
      reject(new Error(msg));
      closeEngine();
    };
    ipcMain.on('asr-engine:ready', onReady);
    ipcMain.on('asr-engine:fatal', onFatal);
  });
  engineReady.catch(() => {});
  engineWin.on('closed', () => {
    engineWin = null;
    for (const [, j] of jobs) j.reject(new Error('توقّف محرّك التسميع'));
    jobs.clear();
  });
  engineWin.loadURL(`${SCHEME}://local/app/asr-engine/index.html`);
  return engineReady;
}

function closeEngine() {
  clearTimeout(idleTimer);
  if (engineWin && !engineWin.isDestroyed()) engineWin.destroy();
  engineWin = null;
  engineReady = null;
}

async function transcribe(audio) {
  if (!(await isInstalled())) throw new Error('نموذج التسميع غير منزَّل');
  await ensureEngine();
  const id = ++jobSeq;
  return new Promise((resolve, reject) => {
    jobs.set(id, { resolve, reject });
    engineWin.webContents.send('asr-engine:job', { id, audio });
  });
}

function init() {
  registerProtocol();

  ipcMain.on('asr-engine:result', (_e, { id, text, error, ms }) => {
    const j = jobs.get(id);
    if (!j) return;
    jobs.delete(id);
    if (error) j.reject(new Error(error));
    else j.resolve({ text, ms });
  });

  ipcMain.handle('asr:status', (e) => {
    listeners.add(e.sender);
    return status();
  });
  ipcMain.handle('asr:download', (e) => {
    listeners.add(e.sender);
    return download();
  });
  ipcMain.handle('asr:cancel', () => cancelDownload());
  ipcMain.handle('asr:remove', () => remove());
  ipcMain.handle('asr:warmup', async () => {
    if (!(await isInstalled())) return { ok: false };
    try {
      const info = await ensureEngine();
      return { ok: true, ...info };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle('asr:transcribe', async (_e, audio) => {
    try {
      const r = await transcribe(audio);
      return { ok: true, ...r };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle('asr:release', () => closeEngine());
}

module.exports = { init, status, download, transcribe, closeEngine, isInstalled, modelDir, MODEL_VERSION };
