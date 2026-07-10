'use strict';
/*
 * اختبار سريع لطبقة البيانات دون واجهة رسومية:
 *   node scripts/test-data.js [اسم المدينة]   مثال: node scripts/test-data.js الجبيل
 */

const fs = require('fs');
const path = require('path');
const svc = require('../src/main/prayer-service');

function fmtCountdown(ms) {
  if (ms == null) return '—';
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}س ${m}د`;
}

(async () => {
  const city = process.argv[2] || svc.DEFAULT_CITY;
  const cities = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'data', 'cities.json'), 'utf8'));
  const adhanMod = await import('adhan');
  const adhan = adhanMod.default || adhanMod;

  console.log('جاري الجلب من واجهة أم القرى الرسمية...');
  const data = await svc.fetchToday({ format: 24 });
  console.log('التاريخ:', data.gregorianDate.day, data.gregorianDate.nameAr, data.gregorianDate.year,
    '/', data.hijriDate.day, data.hijriDate.nameAr, data.hijriDate.year, 'هـ');
  console.log('عدد المواقع المتاحة:', cities.length);

  const resolved = svc.resolveCityTimes({ data, cities, cityName: city, adhan });
  console.log(`\n=== ${city} ${resolved.computed ? `(محسوبة ومثبّتة على ${resolved.regionName})` : '(منطقة رسمية)'} ===`);
  const sched = svc.computeSchedule(resolved.times, data.gregorianDate, new Date());
  for (const p of sched.prayers) console.log(`  ${p.name}: ${p.time}`);
  console.log(`  ${sched.sunrise.name}: ${sched.sunrise.time}`);
  console.log('الصلاة القادمة:', sched.next ? `${sched.next.name} ${sched.next.time}${sched.next.isTomorrow ? ' (غدًا)' : ''}` : '—',
    '— باقٍ', fmtCountdown(sched.msToNext));

  // مقارنة مع المنطقة الأم إن كانت محافظة
  if (resolved.computed) {
    const region = svc.resolveCityTimes({ data, cities, cityName: resolved.regionName, adhan });
    console.log(`\nفرق الدقائق عن ${resolved.regionName}:`);
    for (const k of ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']) {
      const a = resolved.times[k], b = region.times[k];
      const d = (parseInt(a.split(':')[0]) * 60 + parseInt(a.split(':')[1])) -
        (parseInt(b.split(':')[0]) * 60 + parseInt(b.split(':')[1]));
      console.log(`  ${k}: ${city} ${a}  |  ${resolved.regionName} ${b}  (${d > 0 ? '+' : ''}${d} د)`);
    }
  }
  console.log('\n✔ طبقة البيانات تعمل بنجاح.');
})().catch((e) => {
  console.error('\n✗ خطأ:', e.message);
  process.exit(1);
});
