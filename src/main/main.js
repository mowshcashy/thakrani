'use strict';
/*
 * main.js — نقطة الدخول والمنسّق العام لتطبيق «ذكِّرني».
 */

const { app, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const state = require('./state');
const store = require('./store');
const windows = require('./windows');
const tray = require('./tray');
const scheduler = require('./scheduler');
const notifier = require('./notifier');
const ipc = require('./ipc');
const paths = require('./paths');

const APP_ID = 'com.moath.thakkerni';

// النوافذ الشفافة بلا إطار + تسريع العتاد = وميض/قلتشات على بعض كروت الشاشة.
// تعطيل التسريع يجعل الرسم مستقرًا (الواجهات خفيفة ولا تحتاج GPU).
app.disableHardwareAcceleration();

let isQuitting = false;
let bgReady = false;
let pendingTraySpec = null;
const firedEvents = new Map(); // "key:kind" -> ts لتفادي التكرار

// ---------- سجلّ الأعطال ----------
function logError(kind, err) {
  try {
    const line = `[${new Date().toISOString()}] ${kind}: ${(err && (err.stack || err.message)) || err}\n`;
    fs.appendFileSync(path.join(app.getPath('userData'), 'error.log'), line, 'utf8');
  } catch (_) {}
}
process.on('uncaughtException', (e) => logError('uncaughtException', e));
process.on('unhandledRejection', (e) => logError('unhandledRejection', e));

// ---------- منع تعدّد النسخ ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // نسخة أخرى تعمل — أبلغها بإظهار الودجت ثم اخرج بهدوء
  app.quit();
} else {
  app.on('second-instance', () => windows.showWidget());
  app.setAppUserModelId(APP_ID);
  app.whenReady().then(() =>
    init().catch((e) => {
      logError('init', e);
      dialog.showErrorBox('ذكِّرني', 'حدث خطأ أثناء بدء التشغيل. راجع error.log في مجلد بيانات التطبيق.');
    })
  );
}

async function init() {
  await state.loadStatics(); // تحميل قائمة المدن ومكتبة حساب أم القرى
  state.init();

  windows.createBackground();
  windows.createWidget();

  tray.initTray({
    onToggle: () => windows.toggleWidget(),
    onOpenSettings: () => windows.openSettings(),
    onRefresh: () => refresh(),
    onQuit: () => quit(),
    onSetMode: (m) => applySettings({ viewMode: m }),
    onPickCity: (c) => applySettings({ city: c }),
    onToggleMini: (v) => applySettings({ miniEnabled: v }),
  });

  ipc.register({
    applySettings,
    refresh,
    setMode: (m) => applySettings({ viewMode: m }),
    playAdhan,
    quit,
    onBgReady: () => {
      bgReady = true;
      if (pendingTraySpec) windows.sendToBackground('tray:render', pendingTraySpec);
    },
  });

  state.on('update', onStateUpdate);

  applyAutoStart(store.get('autoStart'));

  // إظهار الودجت عند أول تشغيل
  windows.showWidget();

  // الودجت المصغّر الثابت (إن كان مفعّلًا)
  if (store.get('miniEnabled')) windows.showMini();

  // أول تحديث للبيانات
  refresh();

  // مؤقّت العدّ/التحديث كل 15 ثانية
  setInterval(tick, 15000);
  // تحديث كامل دوري كل 3 ساعات
  setInterval(() => refresh(), 3 * 3600 * 1000);

  app.on('activate', () => windows.showWidget());

  // اختبار إقلاع سريع: يبدأ ثم يخرج تلقائيًا (للتحقق فقط)
  if (process.env.ZN_SMOKE) {
    setTimeout(async () => {
      const p = state.getPayload();
      console.log('SMOKE cities=', p.cityNames.length, 'city=', p.city,
        'next=', p.next && p.next.name, p.next && p.next.time, 'online=', p.online);
      console.log('SMOKE lastError=', p.lastError);
      const shotDir = process.env.ZN_SHOT_DIR;
      const fs = require('fs');
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      try {
        if (shotDir) {
          const w = windows.getWidget();
          if (w) {
            fs.writeFileSync(path.join(shotDir, 'widget-next.png'), (await w.webContents.capturePage()).toPNG());
            state.setSettings({ viewMode: 'all' });
            await wait(700);
            fs.writeFileSync(path.join(shotDir, 'widget-all.png'), (await w.webContents.capturePage()).toPNG());
            state.setSettings({ viewMode: 'next' });
          }
          const mw = windows.getMini();
          if (mw) fs.writeFileSync(path.join(shotDir, 'mini.png'), (await mw.webContents.capturePage()).toPNG());
          const sw = windows.openSettings();
          await wait(900);
          fs.writeFileSync(path.join(shotDir, 'settings.png'), (await sw.webContents.capturePage()).toPNG());
          console.log('SMOKE shots saved to', shotDir);
        }
        if (process.env.ZN_TEST_ADHAN) {
          console.log('SMOKE playing adhan (mode=', store.get('adhanMode'), ')');
          playAdhan();
          await wait(2500);
        }
      } catch (e) {
        console.log('SMOKE shot error', e.message);
      }
      console.log('SMOKE OK');
      quit();
    }, 9000);
  }
}

async function refresh() {
  await state.refreshData();
}

function tick() {
  const p = state.getPayload();
  if (p.stale) {
    // تغيّر اليوم (بتوقيت السعودية) → أعد الجلب
    refresh();
  } else {
    state.recompute();
  }
}

function onStateUpdate(payload) {
  // 1) بثّ للواجهات
  windows.broadcast('state:update', payload);

  // 2) إعادة جدولة التنبيهات (أذان + إقامة)
  scheduler.reschedule(state.schedule, payload.settings.iqamaOffset, onPrayerEvent);

  // 3) تحديث الـ tray (أيقونة + تلميح + قائمة)
  updateTray(payload);
}

/**
 * يُستدعى عند دخول وقت الصلاة (kind='adhan') وعند وقت الإقامة (kind='iqama').
 * إعداد adhanTiming يحدد متى يُشغَّل الصوت: عند الأذان، عند الإقامة، أو كليهما.
 */
function onPrayerEvent(prayer, kind) {
  const stamp = prayer.date ? prayer.date.getTime() : 0;
  const dedupeKey = `${prayer.key}:${kind}`;
  if (firedEvents.get(dedupeKey) === stamp) return; // سبق إطلاقه
  firedEvents.set(dedupeKey, stamp);

  const s = store.getAll();
  const notifyOn = s.notifications && s.notifications[prayer.key];
  const timing = s.adhanTiming || 'adhan';
  const soundNow = s.adhanEnabled && (timing === 'both' || timing === kind);

  if (kind === 'adhan') {
    if (notifyOn) notifier.notifyPrayer(prayer);
    if (soundNow) playAdhan('adhan');
  } else {
    if (notifyOn) notifier.notifyIqama(prayer, s.iqamaOffset);
    if (soundNow) playAdhan('iqama');
  }
  // إعادة الحساب لتحديث الواجهات (الانتقال للصلاة التالية / عدّاد الإقامة)
  state.recompute();
}

/**
 * تشغيل الصوت. عند الإقامة يُستخدم مقطع التكبيرات القصير دائمًا
 * (الإقامة ليست أذانًا كاملًا)، وعند الأذان حسب اختيار المستخدم.
 */
function playAdhan(kind = 'adhan') {
  const s = store.getAll();
  const takbeer = kind === 'iqama' || s.adhanMode === 'takbeer';
  const file =
    kind === 'iqama'
      ? paths.assetUnpacked('audio', 'adhan-takbeer.mp3')
      : s.adhanFile || paths.assetUnpacked('audio', takbeer ? 'adhan-takbeer.mp3' : 'adhan-full.mp3');
  windows.sendToBackground('adhan:play', {
    file,
    volume: s.adhanVolume,
    maxMs: takbeer ? 16000 : 0, // «تكبيرات فقط» يوقف الصوت عند الثانية 16
  });
}

// ---------- الـ tray ----------

function formatCountdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}`;
  return `${m}د`;
}

function updateTray(payload) {
  const spec = buildTraySpec(payload);
  pendingTraySpec = spec;
  if (bgReady) windows.sendToBackground('tray:render', spec);

  // التلميح
  if (payload.next) {
    const remain = formatCountdown(payload.next.ts - Date.now());
    tray.setTooltip(
      `الصلاة القادمة: ${payload.next.name} ${payload.next.time}${payload.next.isTomorrow ? ' (غدًا)' : ''}\n` +
        `المتبقّي: ${remain} — ${payload.city}`
    );
  } else {
    tray.setTooltip('ذكِّرني — مواقيت الصلاة');
  }

  // القائمة
  tray.rebuildMenu({
    cities: payload.cities,
    currentCity: payload.city,
    viewMode: payload.settings.viewMode,
    miniEnabled: payload.settings.miniEnabled,
  });
}

function buildTraySpec(payload) {
  const theme = payload.settings.theme;
  if (!payload.next) {
    return { name: 'ذكِّرني', text: '', theme };
  }
  const remainMs = payload.next.ts - Date.now();
  return {
    name: payload.next.name,
    text: formatCountdown(remainMs),
    theme,
  };
}

// ---------- الإعدادات ----------

function applySettings(patch) {
  const before = store.getAll();
  const after = state.setSettings(patch); // يعيد الحساب ويبثّ
  if (patch && typeof patch.autoStart === 'boolean' && patch.autoStart !== before.autoStart) {
    applyAutoStart(patch.autoStart);
  }
  if (patch && typeof patch.widgetPinned === 'boolean') {
    windows.setWidgetPinned(patch.widgetPinned);
  }
  if (patch && typeof patch.miniEnabled === 'boolean') {
    windows.setMiniEnabled(patch.miniEnabled);
  }
  return after;
}

function applyAutoStart(enabled) {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return;
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      path: process.execPath,
      args: [],
    });
  } catch (e) {
    console.error('تعذّر ضبط التشغيل التلقائي:', e.message);
  }
}

// ---------- الخروج ----------

function quit() {
  isQuitting = true;
  tray.destroy();
  app.quit();
}

app.on('before-quit', () => {
  isQuitting = true;
});

// تطبيق tray: لا نُغلق عند إغلاق كل النوافذ
app.on('window-all-closed', (e) => {
  if (!isQuitting) {
    // أبقِ التطبيق يعمل في منطقة الإشعارات
  } else {
    app.quit();
  }
});
