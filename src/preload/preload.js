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
  openSettings: () => ipcRenderer.invoke('settings:open'),
  pickAdhan: () => ipcRenderer.invoke('adhan:pick'),
  testAdhan: () => ipcRenderer.invoke('adhan:test'),
  quit: () => ipcRenderer.invoke('app:quit'),

  // خاص بالنافذة الخلفية
  bg: {
    ready: () => ipcRenderer.send('bg:ready'),
    onTrayRender: (cb) => ipcRenderer.on('tray:render', (_e, spec) => cb(spec)),
    sendTrayImage: (dataUrl) => ipcRenderer.send('tray:image', dataUrl),
    onAdhanPlay: (cb) => ipcRenderer.on('adhan:play', (_e, opt) => cb(opt)),
  },
});
