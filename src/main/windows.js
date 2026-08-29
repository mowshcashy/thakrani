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
let settingsWin = null; // (لم يعد يُستخدم — الإعدادات صفحة داخل نافذة التطبيق)
let bgWin = null;
let miniWin = null;
let appWin = null;
let desktopWin = null;
let adhkarWin = null;
let adhkarAnchor = null; // ارتساء ثابت لودجت الأذكار
let adhkarProgrammatic = false;
let lastBlurHideAt = 0; // للتفريق بين «نقرة الأيقونة أغلقتها» وطلب فتح جديد
let lastWidgetShowAt = 0; // لتجاهل وميض التركيز العابر لحظة الإظهار
let miniAnchor = null; // {right, top} نقطة ارتساء ثابتة للمصغّرة (تمنع الانحراف)
let miniProgrammatic = false; // حركة سببها التطبيق لا المستخدم → لا تُحفظ

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

  // سلوك النافذة المنبثقة: النقر خارجها يخفيها — إلا إذا ثبّتها المستخدم (دبوس)
  widgetWin.on('blur', () => {
    if (store.get('widgetPinned')) return;
    // ويندوز يُطلق blur عابرًا أحيانًا أثناء show/focus نفسه → تجاهله وإلا اختفت فور ظهورها
    if (Date.now() - lastWidgetShowAt < 450) return;
    if (widgetWin && !widgetWin.isDestroyed() && widgetWin.isVisible()) {
      widgetWin.hide();
      lastBlurHideAt = Date.now();
    }
  });

  widgetWin.on('closed', () => {
    widgetWin = null;
  });

  return widgetWin;
}

/*
 * إرساء الودجت أسفل الشاشة فوق شريط المهام بجانب الساعة —
 * مثل نوافذ ويندوز المنبثقة (الطقس/الصوت). تُمرَّر حدود أيقونة الـtray
 * عند النقر عليها لتتمركز الودجت فوقها مباشرة.
 */
function positionWidget(trayBounds) {
  if (!widgetWin || widgetWin.isDestroyed()) return;
  const disp = trayBounds && Number.isFinite(trayBounds.x)
    ? screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y })
    : screen.getPrimaryDisplay();
  const wa = disp.workArea;
  const [w, h] = widgetWin.getSize();

  // أفقيًا: فوق أيقونة الساعة إن عُرفت، وإلا أقصى اليمين
  let x = wa.x + wa.width - w - 12;
  if (trayBounds && Number.isFinite(trayBounds.x)) {
    x = Math.round(trayBounds.x + (trayBounds.width || 0) / 2 - w / 2);
    x = Math.min(Math.max(x, wa.x + 8), wa.x + wa.width - w - 8);
  }
  // رأسيًا: ملاصقة لأعلى شريط المهام
  const y = wa.y + wa.height - h - 12;
  widgetWin.setPosition(Math.round(x), Math.round(y));
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

function showWidget(trayBounds) {
  createWidget();
  positionWidget(trayBounds);
  showWhenReady(widgetWin, () => {
    lastWidgetShowAt = Date.now();
    widgetWin.show();
    widgetWin.focus();
  });
}

function hideWidget() {
  if (widgetWin && !widgetWin.isDestroyed()) widgetWin.hide();
}

function toggleWidget(trayBounds) {
  if (widgetWin && !widgetWin.isDestroyed() && widgetWin.isVisible()) {
    hideWidget();
  } else {
    // نقرة الأيقونة والودجت مفتوحة: يفقدها التركيز فتختفي قبل وصول النقرة —
    // لا تعِد فتحها وإلا استحال إغلاقها من الأيقونة
    if (Date.now() - lastBlurHideAt < 450) return;
    showWidget(trayBounds);
  }
}

function resizeWidget(w, h) {
  if (!widgetWin || widgetWin.isDestroyed()) return;
  const maxH = screen.getPrimaryDisplay().workArea.height - 24;
  const width = Math.min(Math.max(Math.round(w || DEFAULT_WIDGET_SIZE.width), 260), 520);
  const height = Math.min(Math.max(Math.round(h || DEFAULT_WIDGET_SIZE.height), 180), maxH);
  const [ow, oh] = widgetWin.getSize();
  // الواجهة تقيس نفسها بعد كل رسم؛ إن لم يتغيّر المقاس فلا تلمس النافذة
  // (تحريكها بلا داعٍ هو سبب الاهتزاز/الوميض)
  if (width === ow && height === oh) return;
  const [x, y] = widgetWin.getPosition();
  // حافظ على الركن السفلي الأيمن ثابتًا (الودجت مرساة فوق شريط المهام)
  widgetWin.setBounds({ x: x + (ow - width), y: y + (oh - height), width, height });
}

function setWidgetPinned(pinned) {
  if (!widgetWin || widgetWin.isDestroyed()) return;
  widgetWin.setAlwaysOnTop(!!pinned ? true : true, 'floating');
  // الودجت دائمًا في المقدمة؛ "التثبيت" يمنع الإخفاء التلقائي عند فقد التركيز (غير مفعّل افتراضيًا)
}

// ---------- نافذة التطبيق الرئيسية (المواقيت · الأذكار · المصحف · الإعدادات) ----------

function openApp(route) {
  if (appWin && !appWin.isDestroyed()) {
    if (appWin.isMinimized()) appWin.restore();
    appWin.show();
    appWin.focus();
    if (route) appWin.webContents.send('app:route', route);
    return appWin;
  }
  appWin = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 780,
    minHeight: 560,
    title: 'ذكِّرني',
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#0b1712',
    webPreferences: baseWebPrefs(),
  });
  appWin.removeMenu();
  attachDebug(appWin, 'app');
  appWin.loadFile(paths.rendererFile('app', 'index.html'));
  appWin.once('ready-to-show', () => {
    appWin.show();
    if (route) appWin.webContents.send('app:route', route);
  });
  appWin.on('closed', () => {
    appWin = null;
  });
  return appWin;
}

// الإعدادات صارت صفحة داخل التطبيق
function openSettings() {
  return openApp('settings');
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
    if (miniProgrammatic) return; // حركة من التطبيق (تغيّر مقاس) — لا تُحفظ ولا تغيّر الارتساء
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      if (miniWin && !miniWin.isDestroyed()) {
        const [x, y] = miniWin.getPosition();
        const [w] = miniWin.getSize();
        miniAnchor = { right: x + w, top: y }; // المستخدم سحبها → ارتساء جديد
        store.set({ miniBounds: { x, y } });
      }
    }, 400);
  });
  miniWin.on('closed', () => {
    miniWin = null;
  });
  return miniWin;
}

// يعلّم الحركة التالية بأنها برمجية (لئلا تُحفظ كموضع اختاره المستخدم)
function markMiniProgrammatic() {
  miniProgrammatic = true;
  setTimeout(() => { miniProgrammatic = false; }, 250);
}

function positionMini() {
  if (!miniWin || miniWin.isDestroyed()) return;
  const saved = store.get('miniBounds');
  const [w, h] = miniWin.getSize();
  let x;
  let y;
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    const wa = screen.getDisplayNearestPoint({ x: saved.x, y: saved.y }).workArea;
    x = Math.min(Math.max(saved.x, wa.x), wa.x + wa.width - w);
    y = Math.min(Math.max(saved.y, wa.y), wa.y + wa.height - h);
  } else {
    const wa = screen.getPrimaryDisplay().workArea;
    x = wa.x + wa.width - w - 16;
    y = wa.y + 16; // أعلى اليمين افتراضيًا
  }
  x = Math.round(x);
  y = Math.round(y);
  markMiniProgrammatic();
  miniWin.setPosition(x, y);
  miniAnchor = { right: x + w, top: y };
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
  // سقف صارم: لو أخطأ القياس يومًا فلن تتضخّم النافذة ولن تزحف عبر الشاشة
  const width = Math.min(Math.max(Math.round(w || DEFAULT_MINI_SIZE.width), 150), 460);
  const height = Math.min(Math.max(Math.round(h || DEFAULT_MINI_SIZE.height), 40), 140);
  const [ow, oh] = miniWin.getSize();
  if (width === ow && height === oh) return; // لا تغيير → لا تلمس النافذة إطلاقًا

  // احسب دائمًا من نقطة الارتساء الثابتة، لا من الموضع الحالي:
  // القراءة من الموضع الحالي كانت تراكم انحراف بكسل مع كل رسم حتى تهرب النافذة.
  if (!miniAnchor) {
    const [cx, cy] = miniWin.getPosition();
    miniAnchor = { right: cx + ow, top: cy };
  }
  let x = miniAnchor.right - width;
  let y = miniAnchor.top;
  const wa = screen.getDisplayNearestPoint({ x, y }).workArea;
  x = Math.min(Math.max(x, wa.x), wa.x + wa.width - width);
  y = Math.min(Math.max(y, wa.y), wa.y + wa.height - height);

  markMiniProgrammatic();
  miniWin.setBounds({ x: Math.round(x), y: Math.round(y), width, height });
}

/** يعيد المصغّرة إلى ركنها الافتراضي (أعلى اليمين) — لو ضاعت أو خرجت عن الشاشة. */
function resetMiniPosition() {
  store.set({ miniBounds: null });
  miniAnchor = null;
  if (!miniWin || miniWin.isDestroyed()) {
    showMini();
    return;
  }
  positionMini();
  if (!miniWin.isVisible()) miniWin.showInactive();
}

// يطبّق حالة التفعيل (إنشاء/إظهار أو إخفاء)
function setMiniEnabled(enabled) {
  if (enabled) {
    showMini();
  } else {
    hideMini();
  }
}

// ---------- ودجت سطح المكتب (على طريقة ماك: بطاقة ترسو على الخلفية) ----------

const DEFAULT_DESKTOP_SIZE = { width: 340, height: 400 };

/*
 * «إظهار سطح المكتب» (Win+D أو زر زاوية شريط المهام) يُصغّر كل النوافذ.
 * ودجت سطح المكتب يجب أن تبقى ظاهرة — نعيد إظهارها فورًا، ومراقب دوري
 * يضمن ظهورها مهما كانت الطريقة التي أخفتها بها.
 */
function keepOnDesktop(win, isEnabled) {
  const reshow = () => {
    if (!win || win.isDestroyed() || !isEnabled()) return;
    try {
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.showInactive();
    } catch (_) {}
  };
  win.on('minimize', () => setTimeout(reshow, 60));
  win.on('hide', () => setTimeout(reshow, 60));
  const iv = setInterval(reshow, 1500);
  win.on('closed', () => clearInterval(iv));
}

function createDesktop() {
  if (desktopWin && !desktopWin.isDestroyed()) return desktopWin;
  const side = desktopSide();
  desktopWin = new BrowserWindow({
    width: side,
    height: side, // مربّعة
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    // ليست فوق النوافذ: ترسو على سطح المكتب وتختفي خلف ما تعمل عليه
    alwaysOnTop: false,
    skipTaskbar: true,
    focusable: false, // لا تسرق التركيز ولا تظهر في Alt+Tab
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: baseWebPrefs(),
  });

  // على ماك: مستوى «سطح المكتب» الحقيقي (خلف كل شيء تمامًا)
  if (process.platform === 'darwin') {
    try {
      desktopWin.setAlwaysOnTop(true, 'desktop');
      desktopWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
    } catch (_) {}
  }

  attachDebug(desktopWin, 'desktop');
  desktopWin.loadFile(paths.rendererFile('desktop', 'index.html'));
  try { desktopWin.setOpacity(clampOpacity(store.get('desktopOpacity'))); } catch (_) {}
  positionDesktop();
  keepOnDesktop(desktopWin, () => store.get('desktopEnabled'));

  let moveTimer = null;
  desktopWin.on('move', () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      if (desktopWin && !desktopWin.isDestroyed()) {
        const [x, y] = desktopWin.getPosition();
        store.set({ desktopBounds: { x, y } });
      }
    }, 400);
  });
  desktopWin.on('closed', () => {
    desktopWin = null;
  });
  return desktopWin;
}

function positionDesktop() {
  if (!desktopWin || desktopWin.isDestroyed()) return;
  const saved = store.get('desktopBounds');
  const [w, h] = desktopWin.getSize();
  let x;
  let y;
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    const wa = screen.getDisplayNearestPoint({ x: saved.x, y: saved.y }).workArea;
    x = Math.min(Math.max(saved.x, wa.x), wa.x + wa.width - w);
    y = Math.min(Math.max(saved.y, wa.y), wa.y + wa.height - h);
  } else {
    const wa = screen.getPrimaryDisplay().workArea;
    x = wa.x + wa.width - w - 40; // يمين سطح المكتب بمسافة مريحة
    y = wa.y + 40;
  }
  desktopWin.setPosition(Math.round(x), Math.round(y));
}

function showDesktop() {
  createDesktop();
  positionDesktop();
  showWhenReady(desktopWin, () => desktopWin.showInactive());
}

function hideDesktop() {
  if (desktopWin && !desktopWin.isDestroyed()) desktopWin.hide();
}

function setDesktopEnabled(enabled) {
  if (enabled) showDesktop();
  else hideDesktop();
}

function clampOpacity(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0.35, n)) : 0.92;
}

/** طول ضلع المربّع كما اختاره المستخدم (محصور ضمن حدود معقولة والشاشة). */
function desktopSide() {
  const wa = screen.getPrimaryDisplay().workArea;
  const raw = parseInt(store.get('desktopSize'), 10) || 320;
  return Math.min(Math.max(raw, 220), Math.min(560, wa.height - 60));
}

/** يطبّق حجم المربّع الجديد مع إبقاء الركن العلوي الأيمن ثابتًا. */
function applyDesktopSize() {
  if (!desktopWin || desktopWin.isDestroyed()) return;
  const side = desktopSide();
  const [ow, oh] = desktopWin.getSize();
  if (side === ow && side === oh) return;
  const wa = screen.getPrimaryDisplay().workArea;
  const [x, y] = desktopWin.getPosition();
  const nx = Math.min(Math.max(x + (ow - side), wa.x), wa.x + wa.width - side);
  const ny = Math.min(Math.max(y, wa.y), wa.y + wa.height - side);
  desktopWin.setBounds({ x: Math.round(nx), y: Math.round(ny), width: side, height: side });
}

function applyDesktopOpacity() {
  if (!desktopWin || desktopWin.isDestroyed()) return;
  try { desktopWin.setOpacity(clampOpacity(store.get('desktopOpacity'))); } catch (_) {}
}

function resetDesktopPosition() {
  store.set({ desktopBounds: null });
  if (!desktopWin || desktopWin.isDestroyed()) {
    showDesktop();
    return;
  }
  positionDesktop();
  if (!desktopWin.isVisible()) desktopWin.showInactive();
}

// ---------- ودجت الأذكار لسطح المكتب ----------

function adhkarWidth() {
  const wa = screen.getPrimaryDisplay().workArea;
  const raw = parseInt(store.get('adhkarWidgetSize'), 10) || 360;
  return Math.min(Math.max(raw, 260), Math.min(560, wa.width - 60));
}

function createAdhkarWidget() {
  if (adhkarWin && !adhkarWin.isDestroyed()) return adhkarWin;
  adhkarWin = new BrowserWindow({
    width: adhkarWidth(),
    height: 220,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: false, // ترسو على سطح المكتب مثل أختها
    skipTaskbar: true,
    focusable: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: baseWebPrefs(),
  });
  if (process.platform === 'darwin') {
    try {
      adhkarWin.setAlwaysOnTop(true, 'desktop');
      adhkarWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
    } catch (_) {}
  }
  attachDebug(adhkarWin, 'adhkar-widget');
  adhkarWin.loadFile(paths.rendererFile('adhkar-widget', 'index.html'));
  try { adhkarWin.setOpacity(clampOpacity(store.get('desktopOpacity'))); } catch (_) {}
  positionAdhkarWidget();
  keepOnDesktop(adhkarWin, () => store.get('adhkarWidgetEnabled'));

  let moveTimer = null;
  adhkarWin.on('move', () => {
    if (adhkarProgrammatic) return;
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      if (adhkarWin && !adhkarWin.isDestroyed()) {
        const [x, y] = adhkarWin.getPosition();
        const [w] = adhkarWin.getSize();
        adhkarAnchor = { right: x + w, top: y };
        store.set({ adhkarWidgetBounds: { x, y } });
      }
    }, 400);
  });
  adhkarWin.on('closed', () => {
    adhkarWin = null;
  });
  return adhkarWin;
}

function markAdhkarProgrammatic() {
  adhkarProgrammatic = true;
  setTimeout(() => { adhkarProgrammatic = false; }, 250);
}

function positionAdhkarWidget() {
  if (!adhkarWin || adhkarWin.isDestroyed()) return;
  const saved = store.get('adhkarWidgetBounds');
  const [w, h] = adhkarWin.getSize();
  let x;
  let y;
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    const wa = screen.getDisplayNearestPoint({ x: saved.x, y: saved.y }).workArea;
    x = Math.min(Math.max(saved.x, wa.x), wa.x + wa.width - w);
    y = Math.min(Math.max(saved.y, wa.y), wa.y + wa.height - h);
  } else {
    const wa = screen.getPrimaryDisplay().workArea;
    x = wa.x + wa.width - w - 40;
    y = wa.y + 40 + desktopSide() + 20; // أسفل ودجت المواقيت
    if (y + h > wa.y + wa.height) y = wa.y + 40;
  }
  x = Math.round(x);
  y = Math.round(y);
  markAdhkarProgrammatic();
  adhkarWin.setPosition(x, y);
  adhkarAnchor = { right: x + w, top: y };
}

/** ارتفاع الودجت يتبع طول الذكر — بارتساء ثابت كي لا تزحف. */
function resizeAdhkarWidget(h) {
  if (!adhkarWin || adhkarWin.isDestroyed()) return;
  const wa = screen.getPrimaryDisplay().workArea;
  const width = adhkarWidth();
  const height = Math.min(Math.max(Math.round(h || 220), 140), wa.height - 60);
  const [ow, oh] = adhkarWin.getSize();
  if (width === ow && height === oh) return;
  if (!adhkarAnchor) {
    const [cx, cy] = adhkarWin.getPosition();
    adhkarAnchor = { right: cx + ow, top: cy };
  }
  let x = adhkarAnchor.right - width;
  let y = adhkarAnchor.top;
  x = Math.min(Math.max(x, wa.x), wa.x + wa.width - width);
  y = Math.min(Math.max(y, wa.y), wa.y + wa.height - height);
  markAdhkarProgrammatic();
  adhkarWin.setBounds({ x: Math.round(x), y: Math.round(y), width, height });
}

function showAdhkarWidget() {
  createAdhkarWidget();
  positionAdhkarWidget();
  showWhenReady(adhkarWin, () => adhkarWin.showInactive());
}

function hideAdhkarWidget() {
  if (adhkarWin && !adhkarWin.isDestroyed()) adhkarWin.hide();
}

function setAdhkarWidgetEnabled(enabled) {
  if (enabled) showAdhkarWidget();
  else hideAdhkarWidget();
}

function resetAdhkarWidgetPosition() {
  store.set({ adhkarWidgetBounds: null });
  adhkarAnchor = null;
  if (!adhkarWin || adhkarWin.isDestroyed()) {
    showAdhkarWidget();
    return;
  }
  positionAdhkarWidget();
  if (!adhkarWin.isVisible()) adhkarWin.showInactive();
}

function applyAdhkarWidgetSize() {
  if (!adhkarWin || adhkarWin.isDestroyed()) return;
  const [, h] = adhkarWin.getSize();
  resizeAdhkarWidget(h);
  try { adhkarWin.setOpacity(clampOpacity(store.get('desktopOpacity'))); } catch (_) {}
}

// ---------- النافذة الخلفية (أيقونة tray + أذان) ----------

function createBackground() {
  if (bgWin && !bgWin.isDestroyed()) return bgWin;
  bgWin = new BrowserWindow({
    width: 200,
    height: 200,
    show: false,
    webPreferences: {
      ...baseWebPrefs(),
      // نافذة الصوت: اسمح بالتشغيل دون إيماءة مستخدم ولا تخنقها وهي مخفية
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false,
    },
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
  for (const win of [widgetWin, bgWin, miniWin, appWin, desktopWin, adhkarWin]) {
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
  openApp,
  showDesktop,
  hideDesktop,
  setDesktopEnabled,
  resetDesktopPosition,
  applyDesktopSize,
  applyDesktopOpacity,
  showAdhkarWidget,
  hideAdhkarWidget,
  setAdhkarWidgetEnabled,
  resetAdhkarWidgetPosition,
  resizeAdhkarWidget,
  applyAdhkarWidgetSize,
  createBackground,
  createMini,
  showMini,
  hideMini,
  resizeMini,
  resetMiniPosition,
  setMiniEnabled,
  broadcast,
  sendToBackground,
  getWidget: () => widgetWin,
  getSettings: () => appWin,
  getBackground: () => bgWin,
  getMini: () => miniWin,
  getApp: () => appWin,
  getDesktop: () => desktopWin,
  getAdhkarWidget: () => adhkarWin,
};
