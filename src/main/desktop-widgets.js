'use strict';
/*
 * desktop-widgets.js — كل ودجتات سطح المكتب في مكان واحد.
 *
 * كل نوع يعرّف صفحته وشكله (مربّع أو بعرض ثابت وارتفاع تلقائي) وأحجامه،
 * والباقي مشترك: الالتصاق أثناء السحب، البقاء ظاهرة مع «إظهار سطح المكتب»،
 * حفظ الموضع، الترتيب التلقائي، والعودة لداخل الشاشة عند تغيّر الشاشات.
 *
 * الودجت المطفأة تُغلق نافذتها كليًا (لا تُخفى) فلا تستهلك ذاكرة.
 */

const path = require('path');
const { BrowserWindow, screen, ipcMain } = require('electron');
const paths = require('./paths');
const store = require('./store');
const dragger = require('./dragger');

const PRELOAD = path.join(__dirname, '..', 'preload', 'preload.js');

// الترتيب هنا = ترتيب الرصّ في «ترتيب تلقائي»
const KINDS = {
  prayer: { page: 'desktop', shape: 'square', sizes: [260, 320, 400, 480], def: 320 },
  ring: { page: 'w-ring', shape: 'square', sizes: [170, 220, 280], def: 220 },
  clock: { page: 'w-clock', shape: 'square', sizes: [190, 250, 320], def: 250 },
  // h0: ارتفاع مبدئي قريب من المعتاد حتى يُحجز لها مكان مناسب قبل أن تقيس محتواها
  adhkar: { page: 'adhkar-widget', shape: 'auto', sizes: [300, 360, 440], def: 360, h0: 230 },
  ayah: { page: 'w-ayah', shape: 'auto', sizes: [300, 380, 460], def: 380, h0: 270 },
  tasbeeh: { page: 'w-tasbeeh', shape: 'square', sizes: [180, 230, 290], def: 230 },
};
const ORDER = Object.keys(KINDS);

const wins = {}; // kind → BrowserWindow
let onChange = null; // يُستدعى بعد تغيير إعدادات من داخل ودجت (ليتحدّث التطبيق)

/* ───────── الإعدادات ───────── */

function cfg(kind) {
  const all = store.get('widgets') || {};
  return { enabled: false, x: null, y: null, size: KINDS[kind].def, ...(all[kind] || {}) };
}

function setCfg(kind, patch) {
  store.set({ widgets: { [kind]: patch } });
}

/** العرض (أو ضلع المربّع) ضمن أحجام النوع ومساحة الشاشة. */
function widthFor(kind) {
  const k = KINDS[kind];
  const wa = screen.getPrimaryDisplay().workArea;
  const min = k.sizes[0];
  const max = Math.min(k.sizes[k.sizes.length - 1], wa.width - 40, wa.height - 40);
  const v = parseInt(cfg(kind).size, 10) || k.def;
  return Math.min(Math.max(v, min), max);
}

function kindOf(webContentsId) {
  return ORDER.find((k) => wins[k] && !wins[k].isDestroyed() && wins[k].webContents.id === webContentsId);
}

/* ───────── التموضع ───────── */

function intersects(a, b, gap) {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x &&
         a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
}

/** أول موضع فارغ: أعمدة من اليمين إلى اليسار، كل عمود من الأعلى للأسفل (مثل رصّ ودجتات ماك). */
function freeSpot(w, h, obstacles, wa) {
  const G = dragger.GAP;
  for (let x = wa.x + wa.width - G - w; x >= wa.x + G; x -= 20) {
    for (let y = wa.y + G; y + h <= wa.y + wa.height - G; y += 20) {
      const r = { x, y, width: w, height: h };
      if (!obstacles.some((o) => intersects(r, o, G - 1))) return { x, y };
    }
  }
  return { x: wa.x + wa.width - G - w, y: wa.y + G };
}

function clampInto(x, y, w, h) {
  const wa = screen.getDisplayMatching({ x, y, width: w, height: h }).workArea;
  return {
    x: Math.round(Math.min(Math.max(x, wa.x), wa.x + wa.width - w)),
    y: Math.round(Math.min(Math.max(y, wa.y), wa.y + wa.height - h)),
  };
}

function place(kind, win) {
  const c = cfg(kind);
  const [w, h] = win.getSize();
  if (Number.isFinite(c.x) && Number.isFinite(c.y)) {
    const p = clampInto(c.x, c.y, w, h);
    win.setBounds({ x: p.x, y: p.y, width: w, height: h });
    return;
  }
  const wa = screen.getPrimaryDisplay().workArea;
  const p = freeSpot(w, h, obstaclesFor(kind), wa);
  win.setBounds({ x: p.x, y: p.y, width: w, height: h });
  if (c.enabled) setCfg(kind, { x: p.x, y: p.y }); // لا نحفظ مواضع لودجتات لم يفعّلها المستخدم
}

/*
 * العوائق: كل ودجتاتنا الأخرى حتى التي لم تظهر بعد (تُفتح عدة ودجتات في
 * اللحظة نفسها، ولو تجاهلنا غير الظاهرة لتكدّست في نفس المكان)،
 * إضافة إلى بقية النوافذ المسجّلة الظاهرة مثل المصغّرة العائمة.
 */
function obstaclesFor(selfKind) {
  const own = ORDER.filter((k) => k !== selfKind && wins[k] && !wins[k].isDestroyed()).map((k) => wins[k]);
  const ownIds = new Set(ORDER.filter((k) => wins[k] && !wins[k].isDestroyed()).map((k) => wins[k].webContents.id));
  const foreign = dragger.visibleWindows().filter((w) => !ownIds.has(w.webContents.id));
  return [...own, ...foreign].map((w) => w.getBounds());
}

/* ───────── البقاء على سطح المكتب ───────── */

/*
 * «إظهار سطح المكتب» (Win+D أو زاوية شريط المهام) يصغّر كل النوافذ.
 * نعيد إظهار الودجت فورًا، ومراقب خفيف يضمن ذلك مهما كانت طريقة الإخفاء.
 */
function keepOnDesktop(kind, win) {
  const reshow = () => {
    if (win.isDestroyed() || !cfg(kind).enabled) return;
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

/** يرفعها للمقدمة لحظات حتى يراها المستخدم بعد تفعيلها (النوافذ تغطّي سطح المكتب). */
function peek(win) {
  if (!win || win.isDestroyed()) return;
  try {
    win.setAlwaysOnTop(true, 'floating');
    setTimeout(() => {
      if (!win.isDestroyed() && process.platform !== 'darwin') win.setAlwaysOnTop(false);
    }, 2500);
  } catch (_) {}
}

/* ───────── دورة حياة النافذة ───────── */

function create(kind) {
  if (wins[kind] && !wins[kind].isDestroyed()) return wins[kind];
  const k = KINDS[kind];
  const w = widthFor(kind);
  const win = new BrowserWindow({
    width: w,
    height: k.shape === 'square' ? w : (k.h0 || 220),
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: false, // ترسو على سطح المكتب خلف النوافذ
    skipTaskbar: true,
    focusable: false, // لا تسرق التركيز، ولا تظهر في Alt+Tab
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: false },
  });

  if (process.platform === 'darwin') {
    // على ماك: مستوى سطح المكتب الحقيقي
    try {
      win.setAlwaysOnTop(true, 'desktop');
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
    } catch (_) {}
  }

  if (process.env.ZN_DEBUG) {
    win.webContents.on('console-message', (_e, _l, msg, line, src) => console.log(`[w:${kind}] ${msg} (${src}:${line})`));
  }

  win.loadFile(paths.rendererFile(k.page, 'index.html'));

  // قفل المقاس: مع التكبير الكسري (مثل 101٪) يغيّر ويندوز مقاس النافذة من تلقاء
  // نفسه بعد النقل، فتكبر الودجت تدريجيًا وتتداخل. أي تغيير لم نطلبه يُرَدّ فورًا.
  win.on('resize', () => {
    if (win.isDestroyed()) return;
    const b = win.getBounds();
    const w = widthFor(kind);
    const h = k.shape === 'square' ? w : b.height;
    if (Math.abs(b.width - w) > 2 || Math.abs(b.height - h) > 2) {
      win.setBounds({ x: b.x, y: b.y, width: w, height: h });
    }
  });

  wins[kind] = win;
  place(kind, win);
  keepOnDesktop(kind, win);
  dragger.register(win, { onEnd: (x, y) => { if (cfg(kind).enabled) setCfg(kind, { x, y }); } });
  win.on('closed', () => {
    if (wins[kind] === win) delete wins[kind];
  });
  return win;
}

function show(kind, { reveal = false } = {}) {
  const win = create(kind);
  const doShow = () => {
    if (win.isDestroyed()) return;
    win.showInactive();
    if (reveal) setTimeout(() => peek(win), 250);
  };
  if (win.webContents.isLoading()) win.once('ready-to-show', doShow);
  else doShow();
  return win;
}

function close(kind) {
  const win = wins[kind];
  if (win && !win.isDestroyed()) win.destroy();
  delete wins[kind];
}

/** يطبّق حجمًا جديدًا مع تثبيت الركن العلوي الأيمن. */
function applySize(kind) {
  const win = wins[kind];
  if (!win || win.isDestroyed()) return;
  const k = KINDS[kind];
  const w = widthFor(kind);
  const b = win.getBounds();
  const h = k.shape === 'square' ? w : b.height;
  if (w === b.width && h === b.height) return;
  const p = clampInto(b.x + b.width - w, b.y, w, h);
  win.setBounds({ x: p.x, y: p.y, width: w, height: h });
  setCfg(kind, { x: p.x, y: p.y });
}

/** الودجتات ذات الارتفاع التلقائي تبلّغ ارتفاع محتواها. */
function fit(webContentsId, height) {
  const kind = kindOf(webContentsId);
  if (!kind || KINDS[kind].shape !== 'auto') return;
  const win = wins[kind];
  const wa = screen.getDisplayMatching(win.getBounds()).workArea;
  const h = Math.min(Math.max(Math.round(height || 200), 110), wa.height - 60);
  const b = win.getBounds();
  if (h === b.height) return; // بلا تغيير → لا تلمس النافذة
  const w = widthFor(kind);
  let p = clampInto(b.x, b.y, w, h);
  // كبر ارتفاعها فلمست ودجتًا أخرى؟ أزحها لأقرب فراغ ملاصق
  const moved = dragger.resolveOverlap({ x: p.x, y: p.y, width: w, height: h }, obstaclesFor(kind), wa);
  if (moved.x !== p.x || moved.y !== p.y) {
    p = moved;
    if (cfg(kind).enabled) setCfg(kind, { x: p.x, y: p.y });
  }
  win.setBounds({ x: p.x, y: p.y, width: w, height: h });
}

/** يطابق النوافذ مع الإعدادات: يفتح المفعّل، يغلق المطفأ، ويطبّق الأحجام. */
function sync() {
  for (const kind of ORDER) {
    const on = !!cfg(kind).enabled;
    const exists = wins[kind] && !wins[kind].isDestroyed();
    if (on && !exists) show(kind, { reveal: booted });
    else if (on && exists) applySize(kind);
    else if (!on && exists) close(kind);
  }
}

/** ترتيب تلقائي مرتّب لكل الودجتات الظاهرة (أعمدة من يمين الشاشة). */
function arrange() {
  const wa = screen.getPrimaryDisplay().workArea;
  const shown = ORDER.filter((k) => wins[k] && !wins[k].isDestroyed());
  const ownIds = new Set(shown.map((k) => wins[k].webContents.id));
  // عوائق ثابتة لا نحرّكها (مثل الودجت المصغّرة العائمة)
  const fixed = dragger.visibleWindows()
    .filter((w) => !ownIds.has(w.webContents.id))
    .map((w) => w.getBounds());
  const placed = [];
  for (const k of shown) {
    const win = wins[k];
    const [w, h] = win.getSize();
    const p = freeSpot(w, h, [...fixed, ...placed], wa);
    win.setBounds({ x: p.x, y: p.y, width: w, height: h });
    setCfg(k, { x: p.x, y: p.y });
    placed.push({ x: p.x, y: p.y, width: w, height: h });
    peek(win);
  }
}

function reset(kind) {
  setCfg(kind, { x: null, y: null });
  const win = wins[kind];
  if (!win || win.isDestroyed()) return;
  place(kind, win);
  peek(win);
}

function broadcast(channel, payload) {
  for (const k of ORDER) {
    const win = wins[k];
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

/* ───────── الترحيل من الإعدادات القديمة (v1.4) ───────── */

function migrate() {
  const s = store.getAll();
  if (s.widgetsMigrated) return;
  const w = {};
  if (s.desktopEnabled) {
    w.prayer = {
      enabled: true,
      size: s.desktopSize || KINDS.prayer.def,
      x: s.desktopBounds ? s.desktopBounds.x : null,
      y: s.desktopBounds ? s.desktopBounds.y : null,
    };
  }
  if (s.adhkarWidgetEnabled) {
    w.adhkar = {
      enabled: true,
      size: s.adhkarWidgetSize || KINDS.adhkar.def,
      x: s.adhkarWidgetBounds ? s.adhkarWidgetBounds.x : null,
      y: s.adhkarWidgetBounds ? s.adhkarWidgetBounds.y : null,
    };
  }
  store.set({ widgetsMigrated: true, widgets: w });
}

/* ───────── التهيئة ───────── */

let booted = false;

function init(opts = {}) {
  onChange = opts.onChange || null;
  migrate();

  ipcMain.handle('widget:fit', (e, h) => fit(e.sender.id, h));
  ipcMain.handle('widget:hideSelf', (e) => {
    const kind = kindOf(e.sender.id);
    if (!kind) return;
    setCfg(kind, { enabled: false });
    close(kind);
    if (onChange) onChange();
  });
  ipcMain.handle('widgets:arrange', () => arrange());
  ipcMain.handle('widgets:reset', (e, kind) => KINDS[kind] && reset(kind));

  // تغيّرت الشاشات (دقة، شريط مهام، فصل شاشة) → أعِد كل ودجت إلى داخل الشاشة
  const recheck = () => setTimeout(() => dragger.clampAllIntoView(), 300);
  screen.on('display-metrics-changed', recheck);
  screen.on('display-removed', recheck);
  screen.on('display-added', recheck);

  sync();
  booted = true; // بعد الإقلاع: التفعيل الجديد يُظهر الودجت أمام المستخدم لحظات
}

/** لأغراض الفحص: يفتح ودجتًا دون تغيير إعدادات المستخدم. */
function ensure(kind) {
  return show(kind);
}

module.exports = {
  KINDS,
  ORDER,
  init,
  sync,
  arrange,
  reset,
  broadcast,
  ensure,
  get: (kind) => wins[kind] || null,
  all: () => ORDER.filter((k) => wins[k] && !wins[k].isDestroyed()).map((k) => [k, wins[k]]),
};
