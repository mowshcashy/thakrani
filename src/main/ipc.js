'use strict';
/*
 * ipc.js — تسجيل معالجات IPC بين الواجهات والعملية الرئيسية.
 * الإجراءات المركّبة تُمرَّر عبر ctx من main.js.
 */

const { ipcMain, dialog } = require('electron');
const state = require('./state');
const store = require('./store');
const windows = require('./windows');
const tray = require('./tray');
const content = require('./content');

function register(ctx) {
  ipcMain.handle('state:get', () => state.getPayload());
  ipcMain.handle('settings:get', () => store.getAll());
  ipcMain.handle('settings:set', (e, patch) => ctx.applySettings(patch));

  ipcMain.handle('app:refresh', async () => {
    await ctx.refresh();
    return state.getPayload();
  });

  ipcMain.handle('widget:setMode', (e, mode) => ctx.applySettings({ viewMode: mode }));
  ipcMain.handle('widget:hide', () => windows.hideWidget());
  ipcMain.handle('widget:show', () => windows.showWidget());
  ipcMain.handle('widget:resize', (e, { w, h }) => windows.resizeWidget(w, h));
  ipcMain.handle('mini:resize', (e, { w, h }) => windows.resizeMini(w, h));
  ipcMain.handle('mini:hide', () => ctx.applySettings({ miniEnabled: false }));
  ipcMain.handle('mini:reset', () => windows.resetMiniPosition());
  ipcMain.handle('settings:open', () => windows.openSettings());
  ipcMain.handle('app:open', (e, route) => windows.openApp(route));

  // المحتوى: الأذكار والمصحف
  ipcMain.handle('adhkar:all', () => content.getAdhkar());
  ipcMain.handle('adhkar:test', () => ctx.testDhikr && ctx.testDhikr());
  ipcMain.handle('quran:surahs', () => content.getSurahs());
  ipcMain.handle('quran:surah', (e, n) => content.getSurah(n));
  ipcMain.handle('quran:search', (e, q) => content.searchQuran(q));

  // ودجت سطح المكتب
  ipcMain.handle('desktop:reset', () => windows.resetDesktopPosition());

  // ودجت الأذكار لسطح المكتب
  ipcMain.handle('adhkarw:pool', () => content.adhkarPool());
  ipcMain.handle('adhkarw:resize', (e, h) => windows.resizeAdhkarWidget(h));
  ipcMain.handle('adhkarw:hide', () => ctx.applySettings({ adhkarWidgetEnabled: false }));
  ipcMain.handle('adhkarw:reset', () => windows.resetAdhkarWidgetPosition());
  ipcMain.handle('desktop:hide', () => ctx.applySettings({ desktopEnabled: false }));

  ipcMain.handle('adhan:pick', async () => {
    const res = await dialog.showOpenDialog({
      title: 'اختر ملف الأذان',
      properties: ['openFile'],
      filters: [{ name: 'ملفات صوتية', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }],
    });
    if (res.canceled || !res.filePaths.length) return null;
    const file = res.filePaths[0];
    ctx.applySettings({ adhanFile: file });
    return file;
  });

  ipcMain.handle('adhan:test', () => ctx.playAdhan());
  ipcMain.handle('adhan:stop', () => windows.sendToBackground('adhan:stop'));
  ipcMain.handle('adhan:volume:preview', (e, v) => windows.sendToBackground('adhan:volume', v));
  ipcMain.handle('app:quit', () => ctx.quit());

  // من النافذة الخلفية
  ipcMain.on('tray:image', (e, dataUrl) => tray.setImage(dataUrl));
  ipcMain.on('bg:ready', () => ctx.onBgReady());
  ipcMain.on('adhan:error', (e, msg) => ctx.onAudioError && ctx.onAudioError(msg));
}

module.exports = { register };
