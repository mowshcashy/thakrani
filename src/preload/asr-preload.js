'use strict';
/* جسر نافذة محرّك التسميع المخفية (asr-engine) مع العملية الرئيسية. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('engine', {
  onJob: (cb) => ipcRenderer.on('asr-engine:job', (_e, job) => cb(job)),
  result: (r) => ipcRenderer.send('asr-engine:result', r),
  ready: (info) => ipcRenderer.send('asr-engine:ready', info),
  fatal: (msg) => ipcRenderer.send('asr-engine:fatal', msg),
});
