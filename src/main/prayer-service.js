'use strict';
/*
 * prayer-service.js
 * طبقة البيانات: تجلب مواقيت الصلاة من واجهة موقع أم القرى الرسمية
 * وتحسب الصلاة القادمة والعد التنازلي. لا تعتمد على Electron حتى تكون قابلة
 * للاختبار بشكل مستقل عبر Node.
 *
 * المصدر: نفس واجهة البيانات التي يعرضها موقع أم القرى الرسمي لزوّاره
 */

const fs = require('fs');

const API_BASE = 'https://umqserv.kacst.gov.sa/api/v1/Prayer';

// توقيت السعودية ثابت (UTC+3، بلا توقيت صيفي)
const KSA_OFFSET = '+03:00';

// الصلوات المستهدفة للعد التنازلي والتنبيهات (الشروق للعرض فقط)
const PRAYER_ORDER = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

const PRAYER_NAMES_AR = {
  fajr: 'الفجر',
  sunrise: 'الشروق',
  dhuhr: 'الظهر',
  asr: 'العصر',
  maghrib: 'المغرب',
  isha: 'العشاء',
};

const DEFAULT_CITY = 'مكة المكرمة';

/**
 * يجلب مواقيت اليوم لكل المدن من الواجهة الرسمية ويعيدها بشكل موحّد.
 * @param {{format?: 12|24, timeoutMs?: number, fetchImpl?: Function}} [opts]
 *   fetchImpl: تُمرَّر net.fetch من Electron (تستخدم مخزن شهادات ويندوز وتُكمل سلسلة الشهادة).
 */
async function fetchToday(opts = {}) {
  const format = opts.format === 12 ? 12 : 24;
  const timeoutMs = opts.timeoutMs || 15000;
  const doFetch = opts.fetchImpl || fetch;
  const url = `${API_BASE}/GetTodayPrayersForCities?lang=ar&format=${format}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let raw;
  try {
    const res = await doFetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'ar,en;q=0.8',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Origin': 'https://www.ummulqura.org.sa',
        'Referer': 'https://www.ummulqura.org.sa/',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    raw = await res.json();
  } finally {
    clearTimeout(timer);
  }
  return normalize(raw);
}

/** يحوّل استجابة الـ API إلى شكل داخلي ثابت. */
function normalize(raw) {
  const cities = (raw.prayers || []).map((p) => ({
    city: p.city,
    times: {
      fajr: p.fajr,
      sunrise: p.sunrise,
      dhuhr: p.dhuhr,
      asr: p.asr,
      maghrib: p.maghrib,
      isha: p.isha,
      eid: p.eid,
    },
  }));
  return {
    fetchedAt: new Date().toISOString(),
    gregorianDate: raw.gregorianDate || null,
    hijriDate: raw.hijriDate || null,
    cities,
  };
}

/** أسماء المدن المتاحة (كما يوفرها الموقع). */
function getCityNames(data) {
  if (!data || !Array.isArray(data.cities)) return [];
  return data.cities.map((c) => c.city);
}

/** يعيد مواقيت مدينة بالاسم، أو أول مدينة إن لم تُوجد، أو null. */
function getCityTimes(data, cityName) {
  if (!data || !Array.isArray(data.cities) || data.cities.length === 0) return null;
  const found =
    data.cities.find((c) => c.city === cityName) ||
    data.cities.find((c) => normalizeAr(c.city) === normalizeAr(cityName || ''));
  return (found || data.cities[0]).times;
}

function normalizeAr(s) {
  return String(s).replace(/[ً-ْـ]/g, '').trim();
}

/**
 * يبني كائن Date لوقت صلاة بتوقيت السعودية.
 * @param {{year:number,month:number,day:number}} greg
 * @param {string} hhmm مثل "18:47"
 */
function buildPrayerDate(greg, hhmm) {
  if (!greg || !hhmm) return null;
  const [h, m] = String(hhmm).split(':').map((x) => parseInt(x, 10));
  const iso = `${pad(greg.year)}-${pad(greg.month)}-${pad(greg.day)}T${pad(h)}:${pad(m)}:00${KSA_OFFSET}`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/** يعيد كائن التاريخ الميلادي لليوم التالي بناءً على تاريخ اليوم. */
function nextGregorian(greg) {
  const d = new Date(Date.UTC(greg.year, greg.month - 1, greg.day + 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * يحسب جدول اليوم، الصلاة الحالية، والصلاة القادمة مع الوقت المتبقّي.
 * @param {object} times مواقيت المدينة المحسومة {fajr,sunrise,dhuhr,asr,maghrib,isha}
 * @param {{year,month,day}} greg التاريخ الميلادي (بتوقيت السعودية)
 * @param {Date} [now]
 */
function computeSchedule(times, greg, now = new Date()) {
  if (!times || !greg) {
    return { prayers: [], sunrise: null, current: null, next: null, msToNext: null };
  }

  const prayers = PRAYER_ORDER.map((key) => ({
    key,
    name: PRAYER_NAMES_AR[key],
    time: times[key],
    date: buildPrayerDate(greg, times[key]),
  })).filter((p) => p.date);

  const sunrise = {
    key: 'sunrise',
    name: PRAYER_NAMES_AR.sunrise,
    time: times.sunrise,
    date: buildPrayerDate(greg, times.sunrise),
  };

  const nowMs = now.getTime();

  // الصلاة القادمة اليوم
  let next = prayers.find((p) => p.date.getTime() > nowMs) || null;
  let isTomorrow = false;

  if (!next) {
    // مضى العشاء → القادم فجر الغد (تقريبيًا بوقت فجر اليوم، يُصحَّح عند تحديث منتصف الليل)
    const tGreg = nextGregorian(greg);
    next = {
      key: 'fajr',
      name: PRAYER_NAMES_AR.fajr,
      time: times.fajr,
      date: buildPrayerDate(tGreg, times.fajr),
    };
    isTomorrow = true;
  }
  if (next) next.isTomorrow = isTomorrow;

  // الصلاة الحالية (آخر صلاة مضت اليوم) لأغراض التمييز
  let current = null;
  for (const p of prayers) {
    if (p.date.getTime() <= nowMs) current = p;
  }

  const msToNext = next && next.date ? next.date.getTime() - nowMs : null;

  return { prayers, sunrise, current, next, msToNext };
}

// ---------- اختيار المدينة والحساب حسب الإحداثيات ----------
// المناطق الـ13 تؤخذ مواقيتها كما هي من واجهة أم القرى (مطابقة للموقع).
// المحافظات تُحسب بطريقة أم القرى من إحداثياتها، «مثبَّتة» على مواقيت منطقتها
// الرسمية بحيث لا يُضاف إلا الفارق الجغرافي الحقيقي (بضع دقائق).

const TIME_KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

function findCityEntry(cities, name) {
  if (!Array.isArray(cities)) return null;
  return (
    cities.find((c) => c.name_ar === name) ||
    cities.find((c) => normalizeAr(c.name_ar) === normalizeAr(name || '')) ||
    null
  );
}

function getRegionEntry(cities, entry) {
  if (!entry) return null;
  if (entry.type === 'region' || entry.parent_id == null) return entry;
  return cities.find((c) => c.id === entry.parent_id) || entry;
}

function toMin(hhmm) {
  const [h, m] = String(hhmm).split(':').map((x) => parseInt(x, 10));
  return h * 60 + m;
}

function minToHHMM(min) {
  let x = Math.round(min);
  x = ((x % 1440) + 1440) % 1440;
  return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`;
}

/** مواقيت أم القرى بالدقائق منذ منتصف الليل بتوقيت السعودية لإحداثيات معيّنة. */
function calcKsaMinutes(adhan, lat, lng, greg) {
  const date = new Date(greg.year, greg.month - 1, greg.day);
  const params = adhan.CalculationMethod.UmmAlQura();
  const pt = new adhan.PrayerTimes(new adhan.Coordinates(lat, lng), date, params);
  const km = (d) =>
    toMin(d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit' }));
  return {
    fajr: km(pt.fajr),
    sunrise: km(pt.sunrise),
    dhuhr: km(pt.dhuhr),
    asr: km(pt.asr),
    maghrib: km(pt.maghrib),
    isha: km(pt.isha),
  };
}

/**
 * يحسم مواقيت المدينة المختارة.
 * @returns {{times:object, cityName:string, regionName:string, type:string, computed:boolean}}
 */
function resolveCityTimes({ data, cities, cityName, adhan }) {
  const apiRegionTimes = getCityTimes(data, cityName); // إن كانت منطقة موجودة بالواجهة
  const greg = data && data.gregorianDate;
  const entry = findCityEntry(cities, cityName);

  // منطقة رسمية: استخدم مواقيت الواجهة مباشرة
  if (apiRegionTimes && (!entry || entry.type === 'region')) {
    return { times: { ...apiRegionTimes }, cityName, regionName: cityName, type: 'region', computed: false };
  }

  // محافظة: ثبّتها على منطقتها
  if (entry && greg && adhan) {
    const region = getRegionEntry(cities, entry);
    const regionTimes = getCityTimes(data, region.name_ar);
    if (regionTimes) {
      const rc = calcKsaMinutes(adhan, region.latitude, region.longitude, greg);
      const cc = calcKsaMinutes(adhan, entry.latitude, entry.longitude, greg);
      const times = {};
      for (const k of TIME_KEYS) {
        times[k] = minToHHMM(toMin(regionTimes[k]) + (cc[k] - rc[k]));
      }
      // عيد الفطر/الأضحى: يتبع فارق الشروق
      if (regionTimes.eid) times.eid = minToHHMM(toMin(regionTimes.eid) + (cc.sunrise - rc.sunrise));
      return {
        times,
        cityName,
        regionName: region.name_ar,
        type: 'governorate',
        computed: true,
      };
    }
  }

  // احتياط: أول منطقة متاحة
  const fallback = getCityTimes(data, cityName);
  return { times: fallback ? { ...fallback } : null, cityName, regionName: cityName, type: 'region', computed: false };
}

/** قائمة المدن المهيكلة للعرض (مناطق مع محافظاتها). */
function buildCityList(cities) {
  if (!Array.isArray(cities)) return [];
  const regions = cities.filter((c) => c.type === 'region');
  return cities
    .map((c) => ({
      name: c.name_ar,
      type: c.type,
      region: c.type === 'region'
        ? c.name_ar
        : (regions.find((r) => r.id === c.parent_id) || {}).name_ar || '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}

// ---------- الكاش ----------

function readCache(filePath) {
  try {
    const txt = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(txt);
  } catch (_) {
    return null;
  }
}

function writeCache(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
    return true;
  } catch (_) {
    return false;
  }
}

/** هل الكاش يخص تاريخ اليوم (بتوقيت السعودية)؟ */
function isCacheForToday(cache) {
  if (!cache || !cache.gregorianDate) return false;
  const g = cache.gregorianDate;
  const nowKsa = ksaDateParts(new Date());
  return g.year === nowKsa.year && g.month === nowKsa.month && g.day === nowKsa.day;
}

/** أجزاء التاريخ الحالي بتوقيت السعودية. */
function ksaDateParts(date) {
  // نضيف 3 ساعات إلى UTC للحصول على تاريخ السعودية
  const ksa = new Date(date.getTime() + 3 * 3600 * 1000);
  return { year: ksa.getUTCFullYear(), month: ksa.getUTCMonth() + 1, day: ksa.getUTCDate() };
}

module.exports = {
  API_BASE,
  PRAYER_ORDER,
  PRAYER_NAMES_AR,
  DEFAULT_CITY,
  fetchToday,
  normalize,
  getCityNames,
  getCityTimes,
  buildPrayerDate,
  computeSchedule,
  findCityEntry,
  getRegionEntry,
  calcKsaMinutes,
  resolveCityTimes,
  buildCityList,
  readCache,
  writeCache,
  isCacheForToday,
  ksaDateParts,
};
