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
  quranPage: (n) => ipcRenderer.invoke('quran:page', n),
  pageOf: (s, v) => ipcRenderer.invoke('quran:pageOf', s, v),
  pageLines: (n) => ipcRenderer.invoke('quran:lines', n),
  juzRanges: () => ipcRenderer.invoke('quran:juzRanges'),

  // خطة الحفظ
  hifz: {
    get: () => ipcRenderer.invoke('hifz:get'),
    setPlan: (plan, preJuz) => ipcRenderer.invoke('hifz:setPlan', plan, preJuz),
    setReminder: (r) => ipcRenderer.invoke('hifz:setReminder', r),
    record: (e) => ipcRenderer.invoke('hifz:record', e),
    setPages: (pages, m) => ipcRenderer.invoke('hifz:setPages', pages, m),
    reset: () => ipcRenderer.invoke('hifz:reset'),
    testReminder: () => ipcRenderer.invoke('hifz:testReminder'),
  },

  // التسميع (نموذج التعرّف على التلاوة)
  asr: {
    status: () => ipcRenderer.invoke('asr:status'),
    download: () => ipcRenderer.invoke('asr:download'),
    cancel: () => ipcRenderer.invoke('asr:cancel'),
    remove: () => ipcRenderer.invoke('asr:remove'),
    warmup: () => ipcRenderer.invoke('asr:warmup'),
    transcribe: (audio) => ipcRenderer.invoke('asr:transcribe', audio),
    release: () => ipcRenderer.invoke('asr:release'),
    onProgress: (cb) => {
      const l = (_e, p) => cb(p);
      ipcRenderer.on('asr:progress', l);
      return () => ipcRenderer.removeListener('asr:progress', l);
    },
  },

  // ودجتات سطح المكتب (مشتركة لكل الأنواع)
  drag: {
    start: () => ipcRenderer.send('wdrag:start'),
    end: () => ipcRenderer.send('wdrag:end'),
  },
  widgetFit: (h) => ipcRenderer.invoke('widget:fit', h),
  widgetHide: () => ipcRenderer.invoke('widget:hideSelf'),
  widgetsArrange: () => ipcRenderer.invoke('widgets:arrange'),
  widgetReset: (kind) => ipcRenderer.invoke('widgets:reset', kind),
  adhkarPool: () => ipcRenderer.invoke('adhkarw:pool'),
  randomAyah: () => ipcRenderer.invoke('quran:randomAyah'),
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
