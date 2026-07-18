/* ذكِّرنـي — منطق الموقع: ثيم + ساعة حيّة بطريقة أم القرى + حركات
   © MOATH ALWASHMI — MIT */

import * as adhan from './adhan/Adhan.js';
import { CITIES } from './cities.js';

/* ───────── الثيم ───────── */
const root = document.documentElement;
document.getElementById('themeBtn').addEventListener('click', () => {
  const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  try { localStorage.setItem('zn-theme', next); } catch (e) {}
});

/* ───────── أدوات ───────── */
const AR = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
const ar = (s) => String(s).replace(/[0-9]/g, (d) => AR[+d]);

const KSA_TZ = 'Asia/Riyadh';

function fmtClock12(date) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: KSA_TZ, hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(date);
  const h = parts.find((p) => p.type === 'hour').value;
  const m = parts.find((p) => p.type === 'minute').value;
  const period = parts.find((p) => p.type === 'dayPeriod').value.toLowerCase().includes('p') ? 'م' : 'ص';
  return `${ar(h)}:${ar(m)} ${period}`;
}

function countdownStr(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return ar(`${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
}

function countdownWords(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60);
  const hw = h === 1 ? 'ساعة' : h === 2 ? 'ساعتان' : 'ساعات';
  const mw = m === 1 ? 'دقيقة' : m === 2 ? 'دقيقتان' : 'دقائق';
  const seg = [];
  if (h > 0) seg.push(`${ar(h)} ${hw}`);
  seg.push(`${ar(m)} ${mw}`);
  return `باقٍ ${seg.join(' و')}`;
}

/* تاريخ اليوم بتوقيت السعودية (سنة/شهر/يوم) */
function ksaToday(offsetDays = 0) {
  const now = new Date(Date.now() + offsetDays * 864e5);
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: KSA_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const [y, m, d] = p.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/* ───────── المدن ───────── */
const sel = document.getElementById('citySel');
const regions = CITIES.filter((c) => c.t === 'r');

function buildCitySelect(selected) {
  sel.innerHTML = regions
    .map((r) => {
      const members = [r, ...CITIES.filter((c) => c.t === 'g' && c.p === r.i).sort((a, b) => a.n.localeCompare(b.n, 'ar'))];
      const opts = members
        .map((m) => `<option value="${m.n}" ${m.n === selected ? 'selected' : ''}>${m.n}</option>`)
        .join('');
      return `<optgroup label="${r.n}">${opts}</optgroup>`;
    })
    .join('');
}

let city = 'مكة المكرمة';
try { city = localStorage.getItem('zn-city') || city; } catch (e) {}
if (!CITIES.find((c) => c.n === city)) city = 'مكة المكرمة';
buildCitySelect(city);

sel.addEventListener('change', () => {
  city = sel.value;
  try { localStorage.setItem('zn-city', city); } catch (e) {}
  compute();
  tick();
});

/* ───────── الحساب (أم القرى) ───────── */
const NAMES = { fajr: 'الفجر', sunrise: 'الشروق', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
const ORDER = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

let times = null; // Date لكل وقت اليوم
let fajrTomorrow = null;

function calcFor(dayDate, entry) {
  const params = adhan.CalculationMethod.UmmAlQura();
  const pt = new adhan.PrayerTimes(new adhan.Coordinates(entry.la, entry.lo), dayDate, params);
  return { fajr: pt.fajr, sunrise: pt.sunrise, dhuhr: pt.dhuhr, asr: pt.asr, maghrib: pt.maghrib, isha: pt.isha };
}

function compute() {
  const entry = CITIES.find((c) => c.n === city) || CITIES[0];
  times = calcFor(ksaToday(0), entry);
  fajrTomorrow = calcFor(ksaToday(1), entry).fajr;
  renderArcLabels();
  renderDates();
}

function nextPrayer(nowMs) {
  for (const k of PRAYERS) {
    if (times[k].getTime() > nowMs) return { key: k, date: times[k], tomorrow: false };
  }
  return { key: 'fajr', date: fajrTomorrow, tomorrow: true };
}

/* ───────── العرض ───────── */
const el = (id) => document.getElementById(id);

function renderDates() {
  const now = new Date();
  el('hijri').textContent = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-arab', { timeZone: KSA_TZ, day: 'numeric', month: 'long', year: 'numeric' }).format(now) ;
  el('greg').textContent = new Intl.DateTimeFormat('ar-u-ca-gregory-nu-arab', { timeZone: KSA_TZ, day: 'numeric', month: 'long', year: 'numeric' }).format(now);
}

function renderArcLabels() {
  el('arcTimes').innerHTML = ORDER
    .map((k) => `<div class="arc-t" data-k="${k}"><div class="n">${NAMES[k]}</div><div class="v">${fmtClock12(times[k])}</div></div>`)
    .join('');
}

function tick() {
  if (!times) return;
  const nowMs = Date.now();
  const np = nextPrayer(nowMs);

  el('nextName').textContent = NAMES[np.key];
  el('nextTime').textContent = fmtClock12(np.date);
  el('nextBadge').textContent = np.tomorrow ? 'غدًا' : '';
  el('count').textContent = countdownStr(np.date.getTime() - nowMs);
  el('countWords').textContent = countdownWords(np.date.getTime() - nowMs);
  el('localTime').textContent = `الساعة الآن بتوقيت السعودية ${fmtClock12(new Date())}`;

  /* شريط اليوم: التعبئة بنسبة التقدّم بين الأوقات الستة */
  const stamps = ORDER.map((k) => times[k].getTime());
  let frac = 0;
  if (nowMs <= stamps[0]) frac = 0;
  else if (nowMs >= stamps[5]) frac = 1;
  else {
    for (let i = 0; i < 5; i++) {
      if (nowMs >= stamps[i] && nowMs < stamps[i + 1]) {
        frac = (i + (nowMs - stamps[i]) / (stamps[i + 1] - stamps[i])) / 5;
        break;
      }
    }
  }
  el('arcFill').style.width = `${(frac * 100).toFixed(2)}%`;
  el('arcNow').style.insetInlineStart = `${(frac * 100).toFixed(2)}%`;

  /* تمييز الأوقات */
  document.querySelectorAll('.arc-t').forEach((n) => {
    const k = n.dataset.k;
    n.classList.toggle('is-next', !np.tomorrow && k === np.key);
    n.classList.toggle('passed', times[k].getTime() < nowMs && !(k === np.key && !np.tomorrow));
  });

  /* عبَر منتصف الليل بتوقيت السعودية؟ أعد الحساب */
  if (nowMs - lastDayCheck > 60000) {
    lastDayCheck = nowMs;
    const today = ksaToday(0).getTime();
    if (today !== lastDay) { lastDay = today; compute(); }
  }
}

let lastDay = ksaToday(0).getTime();
let lastDayCheck = Date.now();

compute();
tick();
setInterval(tick, 1000);

/* ───────── رقم الإصدار من GitHub (لا يَقدُم أبدًا) ───────── */
fetch('https://api.github.com/repos/mowshcashy/thakrani/releases/latest')
  .then((r) => r.json())
  .then((r) => {
    const tag = r && r.tag_name;
    if (!tag) return;
    const el = document.getElementById('dlVer');
    if (el) el.textContent = 'الإصدار ' + ar(tag.replace(/^v/, '')).replace(/\./g, '٫');
  })
  .catch(() => {});

/* ───────── حركات الظهور ───────── */
const io = new IntersectionObserver(
  (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }),
  { threshold: 0.12 }
);
document.querySelectorAll('.reveal').forEach((n) => io.observe(n));
