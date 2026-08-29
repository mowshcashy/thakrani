'use strict';
/*
 * store.js — حفظ/قراءة إعدادات المستخدم في ملف JSON داخل userData.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  city: 'مكة المكرمة',
  viewMode: 'next', // 'next' = أقرب صلاة | 'all' = كل الصلوات
  timeFormat: 12, // 12 أو 24
  theme: 'auto', // 'auto' | 'light' | 'dark'
  notifications: {
    fajr: true,
    dhuhr: true,
    asr: true,
    maghrib: true,
    isha: true,
  },
  adhanEnabled: true,
  adhanFile: null, // null = الأذان المضمّن
  adhanMode: 'full', // 'full' = أذان كامل | 'takbeer' = تكبيرات فقط (≤16 ث)
  adhanTiming: 'adhan', // متى يُشغَّل الصوت: 'adhan' | 'iqama' | 'both'
  iqamaOffset: 10, // دقائق بعد الأذان: 5 | 10 | 15 | 20
  adhanVolume: 1.0,
  autoStart: true,
  widgetBounds: null, // {x, y} آخر موضع للودجت
  widgetPinned: false,
  miniEnabled: true, // الودجت المصغّر الثابت الشفاف
  miniBounds: null, // {x, y} آخر موضع للودجت المصغّر

  // ودجت سطح المكتب للمواقيت (بطاقة مربّعة ترسو على سطح المكتب مثل ماك)
  desktopEnabled: false,
  desktopBounds: null,
  desktopSize: 320, // طول ضلع المربّع: 260 | 320 | 400 | 480
  desktopOpacity: 0.92,

  // ودجت الأذكار لسطح المكتب (تتبدّل كل 30 ثانية)
  adhkarWidgetEnabled: false,
  adhkarWidgetBounds: null,
  adhkarWidgetSize: 360, // العرض: 300 | 360 | 440

  // تذكير الأذكار
  adhkarReminder: {
    enabled: false,
    everyMinutes: 60, // 15 | 30 | 60 | 120 | 180 | 360
    quietFrom: '23:00',
    quietTo: '06:00',
  },

  // المصحف
  quranFontSize: 30,
  quranBookmark: null, // {surah, verse}
};

let cachedSettings = null;

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function cachePath() {
  return path.join(app.getPath('userData'), 'prayer-cache.json');
}

function deepMerge(base, patch) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base && typeof base[k] === 'object') {
      out[k] = deepMerge(base[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function load() {
  if (cachedSettings) return cachedSettings;
  let onDisk = {};
  try {
    onDisk = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
  } catch (_) {
    onDisk = {};
  }
  cachedSettings = deepMerge(DEFAULTS, onDisk);
  return cachedSettings;
}

function getAll() {
  return deepMerge({}, load());
}

function get(key) {
  return load()[key];
}

function set(patch) {
  cachedSettings = deepMerge(load(), patch);
  try {
    fs.writeFileSync(settingsPath(), JSON.stringify(cachedSettings, null, 2), 'utf8');
  } catch (e) {
    console.error('تعذّر حفظ الإعدادات:', e.message);
  }
  return cachedSettings;
}

module.exports = { DEFAULTS, getAll, get, set, settingsPath, cachePath };
