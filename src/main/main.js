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
const updater = require('./updater');
const adhkarReminder = require('./adhkar-reminder');
const dragger = require('./dragger');
const desktopWidgets = require('./desktop-widgets');
const asr = require('./asr'); // يسجّل بروتوكول zn-asr قبل جاهزية التطبيق
const ipc = require('./ipc');
const paths = require('./paths');

const APP_ID = 'com.moath.thakkerni';

// النوافذ الشفافة بلا إطار + تسريع العتاد = وميض/قلتشات على بعض كروت الشاشة.
// تعطيل التسريع يجعل الرسم مستقرًا (الواجهات خفيفة ولا تحتاج GPU).
app.disableHardwareAcceleration();

let isQuitting = false;
let bgReady = false;
let pendingTraySpec = null;
let audioErrorNotified = false; // إشعار واحد فقط لمشاكل الصوت في الجلسة
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

  asr.init(); // التسميع: البروتوكول والتنزيل والمحرّك
  dragger.init(); // السحب والالتصاق المشترك لكل الودجتات
  windows.createBackground();
  windows.createWidget();

  tray.initTray({
    onToggle: (bounds) => windows.toggleWidget(bounds),
    onOpenSettings: () => windows.openSettings(),
    onRefresh: () => refresh(),
    onQuit: () => quit(),
    onSetMode: (m) => applySettings({ viewMode: m }),
    onPickCity: (c) => applySettings({ city: c }),
    onToggleMini: (v) => applySettings({ miniEnabled: v }),
    onResetMini: () => windows.resetMiniPosition(),
    onCheckUpdate: () => updater.checkNow(),
    onInstallUpdate: () => updater.installNow(),
    onOpenApp: (route) => windows.openApp(route),
    onToggleWidgetKind: (kind, v) => applySettings({ widgets: { [kind]: { enabled: v } } }),
    onArrangeWidgets: () => desktopWidgets.arrange(),
  });

  // التحديث التلقائي (يعمل في النسخة المثبَّتة فقط)
  updater.init({ onStateChange: () => updateTray(state.getPayload()) });

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
    testDhikr: () => adhkarReminder.fire(),
    onAudioError: (msg) => {
      logError('audio', msg);
      if (!audioErrorNotified) {
        audioErrorNotified = true;
        notifier.notify('ذكِّرني — مشكلة في الصوت', 'تعذّر تشغيل الأذان. التفاصيل في error.log بمجلد بيانات التطبيق.');
      }
    },
  });

  state.on('update', onStateUpdate);

  applyAutoStart(store.get('autoStart'));

  // إظهار الودجت عند أول تشغيل
  windows.showWidget();

  // الودجت المصغّر الثابت (إن كان مفعّلًا)
  if (store.get('miniEnabled')) windows.showMini();
  // ودجتات سطح المكتب (تفتح المفعّل منها فقط)
  desktopWidgets.init({ onChange: () => state.recompute() });

  // تذكير الأذكار حسب إعدادات المستخدم
  adhkarReminder.apply(store.get('adhkarReminder'), () => windows.openApp('adhkar'));

  // أول تحديث للبيانات
  refresh();

  // مؤقّت العدّ/التحديث كل 15 ثانية
  setInterval(tick, 15000);
  // تحديث كامل دوري كل 3 ساعات
  setInterval(() => refresh(), 3 * 3600 * 1000);

  app.on('activate', () => windows.showWidget());

  // اختبار محرّك التسميع على ملفات صوت خام (Float32 16kHz) ثم الخروج
  if (process.env.ZN_TEST_ASR) {
    setTimeout(async () => {
      const dir = process.env.ZN_TEST_ASR;
      try {
        const t0 = Date.now();
        await asr.transcribe(new Float32Array(16000));
        console.log('ASR warm', Date.now() - t0, 'ms');
        for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.f32')).sort()) {
          const b = fs.readFileSync(path.join(dir, f));
          const a = new Float32Array(b.buffer, b.byteOffset, b.length / 4);
          const r = await asr.transcribe(a);
          console.log('ASR', f, (a.length / 16000).toFixed(1) + 's', r.ms + 'ms', r.text);
        }
      } catch (e) {
        console.log('ASR error', e.message);
      }
      app.exit(0);
    }, 1500);
  }

  // اختبار صفحة التسميع كاملة بصوت مسجّل: ZN_TEST_TASMEE="surah:from:to:file.f32;..."
  if (process.env.ZN_TEST_TASMEE) {
    setTimeout(async () => {
      const w = windows.openApp('tasmee');
      await new Promise((r) => setTimeout(r, 2500));
      for (const spec of process.env.ZN_TEST_TASMEE.split(';')) {
        if (spec === 'clear') {
          await w.webContents.executeJavaScript("localStorage.removeItem('zn-tasmee-history'); localStorage.removeItem('zn-tasmee-prefs')");
          continue;
        }
        if (spec === 'download') {
          const t0 = Date.now();
          const r = await w.webContents.executeJavaScript('window.zn.asr.download()');
          console.log('DOWNLOAD', JSON.stringify(r), Math.round((Date.now() - t0) / 1000) + 's', JSON.stringify(await asr.status()));
          continue;
        }
        if (spec === 'light') {
          await w.webContents.executeJavaScript(`window.ZN.applyTheme('light')`);
          continue;
        }
        if (spec.startsWith('page:')) {
          await w.webContents.executeJavaScript(`go('quran')`);
          await new Promise((r) => setTimeout(r, 900));
          await w.webContents.executeJavaScript(`showPage(${+spec.slice(5)})`);
          await new Promise((r) => setTimeout(r, 900));
          const img = await w.webContents.capturePage();
          fs.writeFileSync(path.join(process.env.ZN_SHOT_DIR, 'mushaf-' + spec.slice(5) + '.png'), img.toPNG());
          continue;
        }
        if (spec === 'setup') {
          const img = await w.webContents.capturePage();
          fs.writeFileSync(path.join(process.env.ZN_SHOT_DIR, 'tasmee-setup.png'), img.toPNG());
          continue;
        }
        const [s, f, t, file] = spec.split('|');
        const b64 = fs.readFileSync(file).toString('base64');
        const r = await w.webContents.executeJavaScript(`Tasmee._test(${+s},${+f},${+t},'${b64}')`);
        console.log('TASMEE', path.basename(file), JSON.stringify(r));
        if (process.env.ZN_SHOT_DIR) {
          await new Promise((r) => setTimeout(r, 700));
          const img = await w.webContents.capturePage();
          fs.writeFileSync(path.join(process.env.ZN_SHOT_DIR, 'tasmee-' + path.basename(file) + '.png'), img.toPNG());
        }
      }
      app.exit(0);
    }, 1500);
  }

  // اختبار إقلاع سريع: يبدأ ثم يخرج تلقائيًا (للتحقق فقط)
  if (process.env.ZN_SMOKE) {
    setTimeout(async () => {
      const p = state.getPayload();
      console.log('SMOKE cities=', p.cityNames.length, 'city=', p.city,
        'next=', p.next && p.next.name, p.next && p.next.time, 'online=', p.online);
      console.log('SMOKE lastError=', p.lastError);
      for (const d of require('electron').screen.getAllDisplays()) {
        console.log('SMOKE display', JSON.stringify(d.bounds), 'scale=', d.scaleFactor, 'work=', JSON.stringify(d.workArea));
      }
      {
        // تحقّق الإرساء: المسافة عن حافتي العمل السفلية واليمنى (المتوقع 12/12)
        const { screen: scr } = require('electron');
        const wgt = windows.getWidget();
        if (wgt) {
          const [wx, wy] = wgt.getPosition();
          const [ww, wh] = wgt.getSize();
          const wa = scr.getPrimaryDisplay().workArea;
          console.log('SMOKE dock right=', wa.x + wa.width - (wx + ww), 'bottom=', wa.y + wa.height - (wy + wh));
        }
      }
      if (process.env.ZN_TEST_WINDOWS) {
        // هل النوافذ ظاهرة فعلًا على الشاشة؟ (capturePage تعمل حتى لو كانت مخفية)
        const { screen: scr } = require('electron');
        const wa = scr.getPrimaryDisplay().workArea;
        console.log('SMOKE workArea=', JSON.stringify(wa));
        const check = (name, w) => {
          if (!w) return console.log(`SMOKE WIN ${name}: غير موجودة`);
          const b = w.getBounds();
          const onScreen = b.x < wa.x + wa.width && b.x + b.width > wa.x &&
                           b.y < wa.y + wa.height && b.y + b.height > wa.y;
          console.log(`SMOKE WIN ${name}: visible=${w.isVisible()} opacity=${w.getOpacity().toFixed(2)}`,
            `bounds=${b.x},${b.y} ${b.width}x${b.height}`, onScreen ? 'داخل الشاشة' : '⚠ خارج الشاشة');
        };
        for (const [k, w] of desktopWidgets.all()) check(k, w);
        check('mini', windows.getMini());
        check('widget', windows.getWidget());
      }
      if (process.env.ZN_TEST_SNAP) {
        // منطق الالتصاق نفسه: شاشة 1000×800 وودجت أخرى عند x=300
        const wa = { x: 0, y: 0, width: 1000, height: 800 };
        const other = [{ x: 300, y: 12, width: 200, height: 200 }];
        const a = dragger.snap({ x: 15, y: 30, width: 200, height: 200 }, other, wa);
        const b = dragger.snap({ x: 98, y: 20, width: 200, height: 200 }, other, wa);
        const c = dragger.snap({ x: 500, y: 500, width: 200, height: 200 }, other, wa);
        const c2 = dragger.snap({ x: -50, y: 900, width: 200, height: 200 }, other, wa);
        console.log('SMOKE SNAP edge=', JSON.stringify(a), '(المتوقع 12,12)');
        console.log('SMOKE SNAP beside=', JSON.stringify(b), '(المتوقع 88,12 — بجانبها بفراغ 12)');
        console.log('SMOKE SNAP free=', JSON.stringify(c), '(المتوقع 500,500 — بعيدة فلا التصاق)');
        console.log('SMOKE SNAP clamp=', JSON.stringify(c2), '(المتوقع 0,600 — داخل الشاشة)');
        const d = dragger.resolveOverlap({ x: 320, y: 20, width: 200, height: 200 }, other, wa);
        console.log('SMOKE SNAP drop-on-other=', JSON.stringify(d), '(المتوقع 512,20 — تنزلق لأقرب فراغ)');
      }
      if (process.env.ZN_TEST_TOGGLE) {
        // تبديل الودجت من الأيقونة: إظهار → إخفاء → إظهار (بلا فلك ولا التصاق)
        const wg = windows.getWidget();
        const seq = [];
        for (let i = 0; i < 3; i++) {
          windows.toggleWidget();
          await new Promise((r) => setTimeout(r, 700));
          seq.push(wg.isVisible() ? 'ظاهرة' : 'مخفية');
        }
        console.log('SMOKE TOGGLE', seq.join(' → '), '(المتوقع تناوب)');
      }
      if (process.env.ZN_TEST_DRIFT) {
        // اختبار الانحراف: أجبر عدة تحديثات وقِس هل يزحف الموضع
        const mw = windows.getMini();
        const wg = windows.getWidget();
        const before = { mini: mw && mw.getPosition(), widget: wg && wg.getPosition() };
        for (let i = 0; i < 8; i++) state.recompute();
        await new Promise((r) => setTimeout(r, 2500));
        const after = { mini: mw && mw.getPosition(), widget: wg && wg.getPosition() };
        const d = (a, b) => (a && b ? `${b[0] - a[0]},${b[1] - a[1]}` : 'n/a');
        console.log('SMOKE DRIFT mini=', d(before.mini, after.mini), 'widget=', d(before.widget, after.widget), '(المتوقع 0,0)');
      }
      const shotDir = process.env.ZN_SHOT_DIR;
      const fs = require('fs');
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      try {
        if (shotDir) {
          // capturePage لنافذة مخفية قد يعلّق على ويندوز → مهلة 5 ثوانٍ لكل التقاط
          const realCapture = (win) => win.webContents.capturePage();
          const capture = (win) => Promise.race([
            realCapture(win),
            new Promise((_, rej) => setTimeout(() => rej(new Error('capture timeout')), 5000)),
          ]);
          const save = async (file, win) => {
            try { fs.writeFileSync(file, (await capture(win)).toPNG()); }
            catch (e) { console.log('SMOKE shot skipped', path.basename(file), e.message); }
          };
          windows.showWidget(); // اختبار التبديل قد يتركها مخفية
          await wait(800); // دع الخط يكتمل والقياس يستقر قبل الالتقاط
          const w = windows.getWidget();
          if (w) {
            const origMode = store.get('viewMode'); // ثبّت الوضع لكل لقطة ثم أعده
            state.setSettings({ viewMode: 'next' });
            await wait(700);
            await save(path.join(shotDir, 'widget-next.png'), w);
            state.setSettings({ viewMode: 'all' });
            await wait(700);
            await save(path.join(shotDir, 'widget-all.png'), w);
            state.setSettings({ viewMode: origMode });
            await wait(400);
          }
          const mw = windows.getMini();
          if (mw) await save(path.join(shotDir, 'mini.png'), mw);

          // كل أنواع ودجتات سطح المكتب (تُفتح للفحص دون تغيير إعدادات المستخدم)
          for (const kind of desktopWidgets.ORDER) desktopWidgets.ensure(kind);
          await wait(2200);
          for (const [kind, win] of desktopWidgets.all()) {
            await save(path.join(shotDir, `w-${kind}.png`), win);
            const b = win.getBounds();
            console.log(`SMOKE widget ${kind}: ${b.width}x${b.height} @${b.x},${b.y} visible=${win.isVisible()}`);
          }
          // لا تداخل بين الودجتات بعد التموضع التلقائي
          const rects = desktopWidgets.all().map(([k, w]) => [k, w.getBounds()]);
          let overlaps = 0;
          for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
            const a = rects[i][1], c = rects[j][1];
            if (a.x < c.x + c.width && a.x + a.width > c.x && a.y < c.y + c.height && a.y + a.height > c.y) overlaps++;
          }
          console.log('SMOKE widget overlaps=', overlaps, '(المتوقع 0)');

          // نافذة التطبيق: كل صفحة
          const aw = windows.openApp('times');
          await wait(1600);
          for (const r of ['times', 'adhkar', 'quran', 'settings']) {
            aw.webContents.send('app:route', r);
            await wait(r === 'quran' ? 2200 : 1100);
            await save(path.join(shotDir, `app-${r}.png`), aw);
          }
          console.log('SMOKE shots saved to', shotDir);
        }
        if (process.env.ZN_TEST_ADHAN) {
          console.log('SMOKE playing adhan (mode=', store.get('adhanMode'), ')');
          playAdhan();
          await wait(3000);
          // مجسّ حقيقي: اقرأ حالة عنصر الصوت من النافذة الخلفية
          const bg = windows.getBackground();
          if (bg) {
            const probe = await bg.webContents.executeJavaScript(`(() => {
              const a = document.getElementById('adhan');
              return { paused: a.paused, time: a.currentTime, vol: a.volume,
                       err: a.error ? a.error.code : null, src: (a.currentSrc||'').split('/').pop() };
            })()`);
            console.log('SMOKE AUDIO', JSON.stringify(probe));
          }
        }
      } catch (e) {
        console.log('SMOKE shot error', e.message);
      }
      console.log('SMOKE OK');
      quit();
    }, process.env.ZN_SHOT_DIR ? 6000 : 9000);
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
    widgets: payload.settings.widgets || {},
    updateVersion: updater.readyVersion(),
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
  // ودجتات سطح المكتب: فتح/إغلاق/تحجيم حسب الإعدادات (الشفافية تصل للواجهات مع البثّ)
  if (patch && patch.widgets) desktopWidgets.sync();
  if (patch && patch.adhkarReminder) {
    adhkarReminder.apply(after.adhkarReminder, () => windows.openApp('adhkar'));
  }
  // مستوى الصوت يسري فورًا حتى أثناء تشغيل الأذان
  if (patch && typeof patch.adhanVolume === 'number') {
    windows.sendToBackground('adhan:volume', patch.adhanVolume);
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
  // كل خطوة معزولة: فشل واحدة لا يمنع الخروج
  try { scheduler.clear(); } catch (_) {}
  try { tray.destroy(); } catch (_) {}
  try {
    const { BrowserWindow } = require('electron');
    // destroy يتجاوز أي منع إغلاق ويحرر كل النوافذ فورًا
    BrowserWindow.getAllWindows().forEach((w) => { try { w.destroy(); } catch (_) {} });
  } catch (_) {}
  app.quit();
  // مطرقة أخيرة: إن لم يخرج خلال 1.5 ثانية (معلّق لأي سبب) اخرج قسرًا
  setTimeout(() => {
    try { app.exit(0); } catch (_) { process.exit(0); }
  }, 1500).unref();
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
