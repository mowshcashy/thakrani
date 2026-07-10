'use strict';
/*
 * scheduler.js — جدولة إطلاق حدث عند دخول وقت كل صلاة من صلوات اليوم.
 * يعيد الجدولة عند كل تحديث للبيانات؛ المؤقّتات المنقضية تُلغى ولا تُكرَّر.
 */

let timers = [];

function clear() {
  timers.forEach((t) => clearTimeout(t));
  timers = [];
}

/**
 * @param {object} schedule ناتج computeSchedule
 * @param {(prayer)=>void} onPrayer يُستدعى عند دخول وقت الصلاة
 */
function reschedule(schedule, onPrayer) {
  clear();
  if (!schedule || !Array.isArray(schedule.prayers)) return;
  const now = Date.now();
  const DAY = 24 * 3600 * 1000;
  for (const p of schedule.prayers) {
    if (!p.date) continue;
    const delay = p.date.getTime() - now;
    if (delay > 500 && delay < DAY) {
      timers.push(setTimeout(() => onPrayer(p), delay));
    }
  }
}

module.exports = { reschedule, clear };
