'use strict';
/* الودجت المصغّر الثابت الشفاف: الوقت الحالي + الصلاة القادمة + العدّ التنازلي */

const root = document.getElementById('root');
let current = null;
let lastSignature = null; // بصمة المحتوى الثابت — لتفادي إعادة رسم بلا تغيير

const CRESCENT =
  '<img class="crescent" src="../../../assets/logos/tha-dark.svg" alt=""/>';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function nowClock() {
  const fmt = current && current.settings ? current.settings.timeFormat : 24;
  const d = new Date();
  return window.ZN.formatClock(`${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`, fmt);
}

function render() {
  const p = current;
  lastSignature = signature(p);
  if (!p || !p.next) {
    root.innerHTML = `<div class="mini loading drag">جارٍ التحميل…</div>`;
    resize();
    return;
  }
  const fmt = p.settings.timeFormat;
  const tag = p.next.isTomorrow ? '<span class="tag">غدًا</span>' : '';
  root.innerHTML = `
    <div class="mini drag">
      ${CRESCENT}
      <div class="mcol">
        <div class="mprayer">${esc(p.next.name)}<span class="mtime">${esc(window.ZN.formatClock(p.next.time, fmt))}</span>${tag}</div>
        <div class="msub"><span class="mcd" id="mcd">${window.ZN.formatCountdown(p.next.ts - Date.now())}</span></div>
      </div>
      <div class="mclock" id="mclock">${esc(nowClock())}</div>
      <button class="mclose no-drag" data-action="hide" title="إخفاء">&times;</button>
    </div>`;
  resize();
}

function tick() {
  if (!current || !current.next) return;
  const cd = document.getElementById('mcd');
  const clk = document.getElementById('mclock');
  if (cd) cd.textContent = window.ZN.formatCountdown(current.next.ts - Date.now());
  if (clk) clk.textContent = nowClock();
}

function resize() {
  requestAnimationFrame(() => {
    const el = root.querySelector('.mini');
    if (!el) return;
    // +12 حشوة الجسم (6×2) + 4 هامش أمان ضد فروق القياس
    const w = Math.ceil(el.getBoundingClientRect().width) + 16;
    const h = Math.ceil(el.getBoundingClientRect().height) + 12;
    window.zn.resizeMini(w, h);
  });
}

// خط ثمانية يغيّر عرض النص بعد تحميله — أعد القياس عندها وإلا انقصّ المحتوى
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => resize());
}

root.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (btn && btn.dataset.action === 'hide') window.zn.hideMini();
});

/* بصمة البنية فقط — العدّاد والساعة يُحدَّثان نصيًا كل ثانية بلا إعادة بناء.
   إعادة البناء تستدعي قياسًا وتغيير مقاس النافذة، وهو ما كان يُقلقل موضعها. */
function signature(p) {
  if (!p || !p.next) return 'empty';
  return [p.settings.timeFormat, p.settings.theme, p.next.key, p.next.time, p.next.isTomorrow].join('|');
}

window.zn.onState((payload) => {
  current = payload;
  window.ZN.applyTheme(payload.settings.theme);
  const sig = signature(payload);
  if (sig === lastSignature) {
    tick(); // لا تغيير بنيوي — حدّث الأرقام فقط
    return;
  }
  render();
});

if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (current) window.ZN.applyTheme(current.settings.theme);
  });
}

setInterval(tick, 1000);

(async () => {
  current = await window.zn.getState();
  if (current) window.ZN.applyTheme(current.settings.theme);
  render();
})();
