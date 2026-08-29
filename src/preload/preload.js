'use strict';
/*
 * preload.js — جسر آمن (contextBridge) بين الواجهات والعملية الرئيسية.
 * يُحمَّل في كل النوافذ (الودجت، الإعدادات، النافذة الخلفية).
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zn', {
  // بيانات وحالة
  getState: () => ipcRenderer.invoke('state:get'),
  onState: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('state:update', listener);
    return () => ipcRenderer.removeListener('state:update', listener);
  },

  // إعدادات
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),

  // إجراءات
  refresh: () => ipcRenderer.invoke('app:refresh'),
  setMode: (mode) => ipcRenderer.invoke('widget:setMode', mode),
  hideWidget: () => ipcRenderer.invoke('widget:hide'),
  showWidget: () => ipcRenderer.invoke('widget:show'),
  resizeWidget: (w, h) => ipcRenderer.invoke('widget:resize', { w, h }),
  resizeMini: (w, h) => ipcRenderer.invoke('mini:resize', { w, h }),
  hideMini: () => ipcRenderer.invoke('mini:hide'),
  resetMini: () => ipcRenderer.invoke('mini:reset'),
  openSettings: () => ipcRenderer.invoke('settings:open'),
  openApp: (route) => ipcRenderer.invoke('app:open', route),
  onRoute: (cb) => ipcRenderer.on('app:route', (_e, r) => cb(r)),

  // الأذكار والمصحف
  adhkar: () => ipcRenderer.invoke('adhkar:all'),
  testDhikr: () => ipcRenderer.invoke('adhkar:test'),
  surahs: () => ipcRenderer.invoke('quran:surahs'),
  surah: (n) => ipcRenderer.invoke('quran:surah', n),
  searchQuran: (q) => ipcRenderer.invoke('quran:search', q),

  // ودجت سطح المكتب
  resetDesktop: () => ipcRenderer.invoke('desktop:reset'),
  hideDesktop: () => ipcRenderer.invoke('desktop:hide'),
  resizeDesktop: (w, h) => ipcRenderer.invoke('desktop:resize', { w, h }),
  pickAdhan: () => ipcRenderer.invoke('adhan:pick'),
  testAdhan: () => ipcRenderer.invoke('adhan:test'),
  quit: () => ipcRenderer.invoke('app:quit'),

  stopAdhan: () => ipcRenderer.invoke('adhan:stop'),
  previewVolume: (v) => ipcRenderer.invoke('adhan:volume:preview', v),

  // خاص بالنافذة الخلفية
  bg: {
    ready: () => ipcRenderer.send('bg:ready'),
    onTrayRender: (cb) => ipcRenderer.on('tray:render', (_e, spec) => cb(spec)),
    sendTrayImage: (dataUrl) => ipcRenderer.send('tray:image', dataUrl),
    onAdhanPlay: (cb) => ipcRenderer.on('adhan:play', (_e, opt) => cb(opt)),
    onAdhanStop: (cb) => ipcRenderer.on('adhan:stop', () => cb()),
    onAdhanVolume: (cb) => ipcRenderer.on('adhan:volume', (_e, v) => cb(v)),
    sendAudioError: (msg) => ipcRenderer.send('adhan:error', msg),
  },
});
