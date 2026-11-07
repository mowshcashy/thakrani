'use strict';
/* الساعة والتاريخ: الوقت الحالي، اليوم، التاريخ الهجري والميلادي، والصلاة القادمة */

const root = document.getElementById('root');
const ar = (s) => window.ZN.toArabicDigits(s);
let p = null;

root.innerHTML = `
  <div class="glass">
    <button class="w-close" data-wclose title="إخفاء">&times;</button>
    <div class="day" id="day"></div>
    <div class="time"><span id="hm"></span><span class="sec" id="sec"></span></div>
    <div class="period" id="period"></div>
    <div class="hijri" id="hijri"></div>
    <div class="greg" id="greg"></div>
    <div class="next" id="next"></div>
  </div>`;

const $ = (id) => document.getElementById(id);
const DAY = new Intl.DateTimeFormat('ar', { weekday: 'long' });

function tick() {
  const d = new Date();
  const fmt12 = !p || p.settings.timeFormat === 12;
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  let period = '';
  if (fmt12) {
    period = h >= 12 ? 'مساءً' : 'صباحًا';
    h = h % 12 || 12;
  }
  $('hm').textContent = ar(`${fmt12 ? h : String(h).padStart(2, '0')}:${m}`);
  $('sec').textContent = ar(String(d.getSeconds()).padStart(2, '0'));
  $('period').textContent = period;
  $('day').textContent = DAY.format(d);

  if (p && p.next) {
    const s = Math.max(0, Math.floor((p.next.ts - Date.now()) / 1000));
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    $('next').textContent = `${p.next.name} بعد ${ar(hh > 0 ? `${hh}:${String(mm).padStart(2, '0')}` : `${mm} د`)}`;
  }
}

window.WK.onState((state) => {
  p = state;
  if (!p) return;
  $('hijri').textContent = window.ZN.hijriString(p.hijriDate);
  $('greg').textContent = window.ZN.gregorianString(p.gregorianDate);
  tick();
});

tick();
setInterval(tick, 1000);
window.WK.enableDrag();
