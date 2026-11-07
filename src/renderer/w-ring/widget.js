'use strict';
/* حلقة الصلاة القادمة: دائرة تمتلئ من الصلاة السابقة حتى القادمة */

const root = document.getElementById('root');
const C = 2 * Math.PI * 45; // محيط الدائرة (نصف القطر 45 في viewBox=100)
let p = null;

root.innerHTML = `
  <div class="glass">
    <button class="w-close" data-wclose title="إخفاء">&times;</button>
    <div class="ring">
      <svg viewBox="0 0 100 100">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#e8d6ac"/>
            <stop offset="1" stop-color="#8bf0c0"/>
          </linearGradient>
        </defs>
        <circle class="track" cx="50" cy="50" r="45"/>
        <circle class="prog" id="prog" cx="50" cy="50" r="45" stroke-dasharray="${C}" stroke-dashoffset="${C}"/>
      </svg>
    </div>
    <div class="center">
      <div class="lbl">الصلاة القادمة</div>
      <div class="nm" id="nm">…</div>
      <div class="cd" id="cd"></div>
      <div class="tm" id="tm"></div>
    </div>
  </div>`;

const $ = (id) => document.getElementById(id);

function tick() {
  if (!p || !p.next) return;
  const now = Date.now();
  const end = p.next.ts;
  // بداية الفترة: الصلاة الحالية، وإلا افترض ست ساعات (قبل الفجر)
  const start = p.currentTs && p.currentTs < end ? p.currentTs : end - 6 * 3600e3;
  const frac = Math.min(1, Math.max(0, (now - start) / (end - start)));
  $('prog').setAttribute('stroke-dashoffset', String(C * (1 - frac)));

  const s = Math.max(0, Math.floor((end - now) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  $('cd').textContent = window.ZN.toArabicDigits(h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${m} د`);
}

window.WK.onState((state) => {
  p = state;
  if (!p || !p.next) return;
  $('nm').textContent = p.next.name;
  $('tm').textContent = window.ZN.formatClock(p.next.time, p.settings.timeFormat) + (p.next.isTomorrow ? ' — غدًا' : '');
  tick();
});

setInterval(tick, 1000);
window.WK.enableDrag();
