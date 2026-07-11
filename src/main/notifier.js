'use strict';
/*
 * notifier.js — إشعارات ويندوز عند دخول وقت الصلاة.
 * تشغيل صوت الأذان يتم في النافذة الخلفية (عبر main)، هنا الإشعار فقط.
 */

const { Notification } = require('electron');
const paths = require('./paths');

function notifyPrayer(prayer) {
  if (!Notification.isSupported()) return;
  const title = `حان الآن وقت صلاة ${prayer.name}`;
  const body = `${prayer.name} · ${prayer.time}${prayer.isTomorrow ? ' (غدًا)' : ''}\nذكِّرني — مواقيت أم القرى`;
  let icon;
  try {
    icon = paths.asset('icons', 'app.png');
  } catch (_) {
    icon = undefined;
  }
  const n = new Notification({
    title,
    body,
    icon,
    silent: true, // الصوت (الأذان) يُشغَّل بشكل منفصل
    timeoutType: 'default',
  });
  n.show();
  return n;
}

function notify(title, body) {
  if (!Notification.isSupported()) return;
  new Notification({ title, body, silent: true }).show();
}

module.exports = { notifyPrayer, notify };
