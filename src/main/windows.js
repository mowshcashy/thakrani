'use strict';
/*
 * windows.js — إدارة النوافذ:
 *  - widget: الودجت العائمة (frameless / transparent / always-on-top)
 *  - settings: نافذة الإعدادات
 *  - background: نافذة مخفية لرسم أيقونة الـ tray وتشغيل الأذان
 */

const path = require('path');
const { BrowserWindow, screen } = require('electron');
const paths = require('./paths');
const store = require('./store');

const PRELOAD = path.join(__dirname, '..', 'preload', 'preload.js');

let widgetWin = null;
let settingsWin = null;
let bgWin = null;
let miniWin = null;

const DEFAULT_WIDGET_SIZE = { width: 340, height: 300 };
const DEFAULT_MINI_SIZE = { width: 210, height: 60 };

function baseWebPrefs() {
  return {
    preload: PRELOAD,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
  };
}

// تسجيل أخطاء الواجهات عند التشخيص (ZN_DEBUG)
function attachDebug(win, tag) {
  if (!process.env.ZN_DEBUG) return;
  const wc = win.webContents;
  wc.on('console-message', (_e, level, message, line, sourceId) => {
    console.log(`[${tag}] ${message}  (${sourceId}:${line})`);
  });
  wc.on('did-fail-load', (_e, code, desc, url) => {
    console.log(`[${tag}] did-fail-load ${code} ${desc} ${url}`);
  });
  wc.on('preload-error', (_e, p, err) => {
    console.log(`[${tag}] preload-error ${err && err.message}`);
  });
}

// ---------- الودجت ----------

function createWidget() {
  if (widgetWin && !widgetWin.isDestroyed()) return widgetWin;

  widgetWin = new BrowserWindow({
    width: DEFAULT_WIDGET_SIZE.width,
    height: DEFAULT_WIDGET_SIZE.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: baseWebPrefs(),
  });

  widgetWin.setAlwaysOnTop(true, 'floating');
  attachDebug(widgetWin, 'widget');
  widgetWin.loadFile(paths.rendererFile('widget', 'index.html'));

  positionWidget();

  // حفظ الموضع عند التحريك
  let moveTimer = null;
  widgetWin.on('move', () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      if (widgetWin && !widgetWin.isDestroyed()) {
        const [x, y] = widgetWin.getPosition();
        store.set({ widgetBounds: { x, y } });
      }
    }, 400);
  });

  widgetWin.on('closed', () => {
    widgetWin = null;
  });

  return widgetWin;
}

function positionWidget() {
  if (!widgetWin || widgetWin.isDestroyed()) return;
  const saved = store.get('widgetBounds');
  const [w, h] = widgetWin.getSize();
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    // تأكّد أنها ضمن حدود شاشة متاحة
    const disp = screen.getDisplayNearestPoint({ x: saved.x, y: saved.y });
    const wa = disp.workArea;
    const x = Math.min(Math.max(saved.x, wa.x), wa.x + wa.width - w);
    const y = Math.min(Math.max(saved.y, wa.y), wa.y + wa.height - h);
    widgetWin.setPosition(Math.round(x), Math.round(y));
  } else {
    const wa = screen.getPrimaryDisplay().workArea;
    widgetWin.setPosition(wa.x + wa.width - w - 16, wa.y + wa.height - h - 16);
  }
}

// إظهار نافذة بعد اكتمال تحميل محتواها فقط (يمنع الوميض الأبيض عند الإقلاع)
function showWhenReady(win, showFn) {
  if (!win || win.isDestroyed()) return;
  if (win.webContents.isLoading()) {
    win.once('ready-to-show', () => {
      if (!win.isDestroyed()) showFn();
    });
  } else {
    showFn();
  }
}

function showWidget() {
  createWidget();
  positionWidget();
  showWhenReady(widgetWin, () => {
    widgetWin.show();
    widgetWin.focus();
  });
}

function hideWidget() {
  if (widgetWin && !widgetWin.isDestroyed()) widgetWin.hide();
}

function toggleWidget() {
  if (widgetWin && !widgetWin.isDestroyed() && widgetWin.isVisible()) {
    hideWidget();
  } else {
    showWidget();
  }
}

function resizeWidget(w, h) {
  if (!widgetWin || widgetWin.isDestroyed()) return;
  const width = Math.round(w || DEFAULT_WIDGET_SIZE.width);
  const height = Math.round(h || DEFAULT_WIDGET_SIZE.height);
  const [x, y] = widgetWin.getPosition();
  const [ow, oh] = widgetWin.getSize();
  widgetWin.setSize(width, height);
  // حافظ على الركن السفلي الأيمن ثابتًا عند تغيّر الارتفاع
  widgetWin.setPosition(x + (ow - width), y + (oh - height));
}

function setWidgetPinned(pinned) {
  if (!widgetWin || widgetWin.isDestroyed()) return;
  widgetWin.setAlwaysOnTop(!!pinned ? true : true, 'floating');
  // الودجت دائمًا في المقدمة؛ "التثبيت" يمنع الإخفاء التلقائي عند فقد التركيز (غير مفعّل افتراضيًا)
}

// ---------- الإعدادات ----------

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return settingsWin;
  }
  settingsWin = new BrowserWindow({
    width: 460,
    height: 640,
    resizable: false,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    title: 'إعدادات ذكِّرني',
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#0b3d2e',
    webPreferences: baseWebPrefs(),
  });
  settingsWin.removeMenu();
  attachDebug(settingsWin, 'settings');
  settingsWin.loadFile(paths.rendererFile('settings', 'index.html'));
  settingsWin.once('ready-to-show', () => settingsWin.show());
  settingsWin.on('closed', () => {
    settingsWin = null;
  });
  return settingsWin;
}

// ---------- الودجت المصغّر الثابت الشفاف ----------

function createMini() {
  if (miniWin && !miniWin.isDestroyed()) return miniWin;
  miniWin = new BrowserWindow({
    width: DEFAULT_MINI_SIZE.width,
    height: DEFAULT_MINI_SIZE.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false, // ثابت لا يسرق التركيز
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: baseWebPrefs(),
  });
  miniWin.setAlwaysOnTop(true, 'floating');
  attachDebug(miniWin, 'mini');
  miniWin.loadFile(paths.rendererFile('mini', 'index.html'));
  positionMini();

  let moveTimer = null;
  miniWin.on('move', () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      if (miniWin && !miniWin.isDestroyed()) {
        const [x, y] = miniWin.getPosition();
        store.set({ miniBounds: { x, y } });
      }
    }, 400);
  });
  miniWin.on('closed', () => {
    miniWin = null;
  });
  return miniWin;
}

function positionMini() {
  if (!miniWin || miniWin.isDestroyed()) return;
  const saved = store.get('miniBounds');
  const [w, h] = miniWin.getSize();
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    const disp = screen.getDisplayNearestPoint({ x: saved.x, y: saved.y });
    const wa = disp.workArea;
    const x = Math.min(Math.max(saved.x, wa.x), wa.x + wa.width - w);
    const y = Math.min(Math.max(saved.y, wa.y), wa.y + wa.height - h);
    miniWin.setPosition(Math.round(x), Math.round(y));
  } else {
    const wa = screen.getPrimaryDisplay().workArea;
    miniWin.setPosition(wa.x + wa.width - w - 16, wa.y + 16); // أعلى اليمين افتراضيًا
  }
}

function showMini() {
  createMini();
  positionMini();
  showWhenReady(miniWin, () => miniWin.showInactive()); // إظهار دون سرقة التركيز
}

function hideMini() {
  if (miniWin && !miniWin.isDestroyed()) miniWin.hide();
}

function resizeMini(w, h) {
  if (!miniWin || miniWin.isDestroyed()) return;
  const [x, y] = miniWin.getPosition();
  const [ow] = miniWin.getSize();
  const width = Math.round(w || DEFAULT_MINI_SIZE.width);
  const height = Math.round(h || DEFAULT_MINI_SIZE.height);
  miniWin.setSize(width, height);
  miniWin.setPosition(x + (ow - width), y); // ثبّت الحافة اليمنى
}

// يطبّق حالة التفعيل (إنشاء/إظهار أو إخفاء)
function setMiniEnabled(enabled) {
  if (enabled) {
    showMini();
  } else {
    hideMini();
  }
}

// ---------- النافذة الخلفية (أيقونة tray + أذان) ----------

function createBackground() {
  if (bgWin && !bgWin.isDestroyed()) return bgWin;
  bgWin = new BrowserWindow({
    width: 200,
    height: 200,
    show: false,
    webPreferences: baseWebPrefs(),
  });
  attachDebug(bgWin, 'bg');
  bgWin.loadFile(paths.rendererFile('tray-render', 'index.html'));
  bgWin.on('closed', () => {
    bgWin = null;
  });
  return bgWin;
}

// ---------- بثّ عام ----------

function broadcast(channel, payload) {
  for (const win of [widgetWin, settingsWin, bgWin, miniWin]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

function sendToBackground(channel, payload) {
  if (bgWin && !bgWin.isDestroyed()) bgWin.webContents.send(channel, payload);
}

module.exports = {
  createWidget,
  showWidget,
  hideWidget,
  toggleWidget,
  resizeWidget,
  setWidgetPinned,
  openSettings,
  createBackground,
  createMini,
  showMini,
  hideMini,
  resizeMini,
  setMiniEnabled,
  broadcast,
  sendToBackground,
  getWidget: () => widgetWin,
  getSettings: () => settingsWin,
  getBackground: () => bgWin,
  getMini: () => miniWin,
};
