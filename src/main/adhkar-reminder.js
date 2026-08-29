'use strict';
/*
 * adhkar-reminder.js — تذكير دوري بالأذكار.
 * المستخدم يحدد الفاصل الزمني وساعات الهدوء؛ الإشعار يعرض ذكرًا وبالنقر يفتح صفحة الأذكار.
 */

const content = require('./content');
const notifier = require('./notifier');

let timer = null;
let onOpen = null;

function clear() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** هل نحن ضمن ساعات الهدوء؟ (from/to بصيغة "HH:MM"، يدعم العبور عبر منتصف الليل) */
function inQuietHours(cfg, now = new Date()) {
  if (!cfg || !cfg.quietFrom || !cfg.quietTo) return false;
  const toMin = (s) => {
    const [h, m] = String(s).split(':').map((x) => parseInt(x, 10));
    return (h || 0) * 60 + (m || 0);
  };
  const cur = now.getHours() * 60 + now.getMinutes();
  const from = toMin(cfg.quietFrom);
  const to = toMin(cfg.quietTo);
  if (from === to) return false;
  return from < to ? cur >= from && cur < to : cur >= from || cur < to;
}

function fire() {
  const d = content.randomDhikr();
  if (!d) return;
  const body = d.text.length > 180 ? d.text.slice(0, 177) + '…' : d.text;
  const n = notifier.notify('ذكِّرني — ' + d.title, body);
  if (n && onOpen) n.on('click', () => onOpen());
}

/**
 * @param {{enabled:boolean, everyMinutes:number, quietFrom?:string, quietTo?:string}} cfg
 * @param {Function} openAdhkar يُستدعى عند النقر على الإشعار
 */
function apply(cfg, openAdhkar) {
  clear();
  onOpen = openAdhkar || null;
  if (!cfg || !cfg.enabled) return;
  const minutes = Math.max(5, Math.min(720, parseInt(cfg.everyMinutes, 10) || 60));
  timer = setInterval(() => {
    if (!inQuietHours(cfg)) fire();
  }, minutes * 60 * 1000);
}

module.exports = { apply, clear, fire, inQuietHours };
