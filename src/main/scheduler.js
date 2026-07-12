'use strict';
/*
 * scheduler.js — جدولة حدثين لكل صلاة من صلوات اليوم:
 *   - 'adhan' عند دخول الوقت
 *   - 'iqama' بعده بالدقائق المحددة في الإعدادات
 * يعيد الجدولة عند كل تحديث للبيانات؛ المؤقّتات القديمة تُلغى.
 */

let timers = [];

function clear() {
  timers.forEach((t) => clearTimeout(t));
  timers = [];
}

/**
 * @param {object} schedule ناتج computeSchedule
 * @param {number} iqamaOffsetMin دقائق الإقامة بعد الأذان (5/10/15/20)
 * @param {(prayer, kind: 'adhan'|'iqama')=>void} onEvent
 */
function reschedule(schedule, iqamaOffsetMin, onEvent) {
  clear();
  if (!schedule || !Array.isArray(schedule.prayers)) return;
  const now = Date.now();
  const DAY = 24 * 3600 * 1000;
  const offsetMs = Math.max(1, iqamaOffsetMin || 10) * 60 * 1000;

  for (const p of schedule.prayers) {
    if (!p.date) continue;
    const adhanDelay = p.date.getTime() - now;
    if (adhanDelay > 500 && adhanDelay < DAY) {
      timers.push(setTimeout(() => onEvent(p, 'adhan'), adhanDelay));
    }
    const iqamaDelay = adhanDelay + offsetMs;
    if (iqamaDelay > 500 && iqamaDelay < DAY) {
      timers.push(setTimeout(() => onEvent(p, 'iqama'), iqamaDelay));
    }
  }
}

module.exports = { reschedule, clear };
