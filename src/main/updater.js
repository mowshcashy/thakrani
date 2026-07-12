'use strict';
/*
 * updater.js — التحديث التلقائي عبر GitHub Releases (electron-updater).
 * - يتحقق عند الإقلاع (بعد مهلة قصيرة) ثم كل ٤ ساعات.
 * - ينزّل التحديث بصمت، ويُثبَّت تلقائيًا عند إغلاق التطبيق.
 * - عند اكتمال التنزيل: إشعار + خيار «إعادة التشغيل الآن» في قائمة الأيقونة.
 */

const { app } = require('electron');
const notifier = require('./notifier');

let autoUpdater = null;
let updateReady = null; // معلومات الإصدار المنزَّل الجاهز للتثبيت
let onStateChange = null; // يُستدعى لإعادة بناء قائمة الـ tray

function init(opts = {}) {
  onStateChange = opts.onStateChange || null;

  if (!app.isPackaged) return; // لا تحديث في وضع التطوير

  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (e) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true; // يُثبَّت وحده عند الإغلاق
  autoUpdater.logger = null; // صامت؛ الأخطاء تُسجَّل في error.log عبر main

  autoUpdater.on('update-downloaded', (info) => {
    updateReady = info;
    notifier.notify(
      'تحديث جديد لذكِّرني ✨',
      `نُزِّل الإصدار ${info.version} — سيُثبَّت تلقائيًا عند إغلاق التطبيق، أو من قائمة الأيقونة: «إعادة التشغيل للتحديث».`
    );
    if (onStateChange) onStateChange();
  });

  // أخطاء الشبكة لا تهم المستخدم — تجاهل بصمت وحاول لاحقًا
  autoUpdater.on('error', () => {});

  // أول فحص بعد 30 ثانية من الإقلاع، ثم كل 4 ساعات
  setTimeout(check, 30 * 1000);
  setInterval(check, 4 * 3600 * 1000);
}

function check() {
  if (!autoUpdater) return;
  autoUpdater.checkForUpdates().catch(() => {});
}

/** فحص يدوي من قائمة الأيقونة — يخبر المستخدم بالنتيجة دائمًا. */
async function checkNow() {
  if (!autoUpdater) {
    notifier.notify('ذكِّرني', 'التحقق من التحديثات متاح في النسخة المثبَّتة فقط.');
    return;
  }
  if (updateReady) {
    notifier.notify('ذكِّرني', `الإصدار ${updateReady.version} جاهز — أعد التشغيل لتطبيقه.`);
    return;
  }
  try {
    const res = await autoUpdater.checkForUpdates();
    const remote = res && res.updateInfo && res.updateInfo.version;
    if (remote && remote !== app.getVersion()) {
      notifier.notify('ذكِّرني', `يوجد إصدار جديد ${remote} — جارٍ تنزيله في الخلفية…`);
    } else {
      notifier.notify('ذكِّرني', `أنت على أحدث إصدار (${app.getVersion()}) ✓`);
    }
  } catch (e) {
    notifier.notify('ذكِّرني', 'تعذّر التحقق من التحديثات — تحقق من اتصالك.');
  }
}

/** إعادة التشغيل الآن لتطبيق التحديث المنزَّل. */
function installNow() {
  if (autoUpdater && updateReady) {
    autoUpdater.quitAndInstall(false, true);
  }
}

function isUpdateReady() {
  return !!updateReady;
}

function readyVersion() {
  return updateReady ? updateReady.version : null;
}

module.exports = { init, check, checkNow, installNow, isUpdateReady, readyVersion };
