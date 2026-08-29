'use strict';
/* ودجت سطح المكتب: بطاقة ثابتة على سطح المكتب — كل مواقيت اليوم + العدّ التنازلي */

const root = document.getElementById('root');
let current = null;
let lastSignature = null;

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function signature(p) {
  if (!p || !p.next) return 'empty';
  return [
    p.settings.timeFormat, p.settings.theme, p.city,
    p.next.key, p.next.isTomorrow, p.currentKey,
    p.prayers.map((x) => x.time).join(','),
    p.hijriDate && p.hijriDate.day,
  ].join('|');
}

function render() {
  const p = current;
  if (!p || !p.next) {
    root.innerHTML = '<div class="dw loading">جارٍ التحميل…</div>';
    return;
  }
  const fmt = p.settings.timeFormat;
  const nextKey = p.next.isTomorrow ? null : p.next.key;
  const rows = [];
  for (const pr of p.prayers) {
    rows.push(pr);
    if (pr.key === 'fajr' && p.sunrise) rows.push({ ...p.sunrise, isSunrise: true });
  }
  // ما قبل الصلاة القادمة في ترتيب اليوم = انقضى (يشمل الشروق)
  const nextIdx = nextKey ? rows.findIndex((r) => r.key === nextKey && !r.isSunrise) : rows.length;

  root.innerHTML = `
    <div class="dw">
      <div class="dw-head">
        <img src="../../../assets/logos/tha-dark.svg" alt="" />
        <span class="dw-brand">ذكِّرنـي</span>
        <span class="dw-city">${esc(p.city)}</span>
      </div>

      <div class="dw-dates">
        <div class="dw-hijri">${esc(window.ZN.hijriString(p.hijriDate))}</div>
        <div class="dw-greg">${esc(window.ZN.gregorianString(p.gregorianDate))}</div>
      </div>

      <div class="dw-next">
        <div class="lbl">الصلاة القادمة</div>
        <div class="nm">${esc(p.next.name)}</div>
        <div class="tm">${esc(window.ZN.formatClock(p.next.time, fmt))}${p.next.isTomorrow ? ' — غدًا' : ''}</div>
        <div class="cd" id="dcd">${window.ZN.formatCountdown(p.next.ts - Date.now())}</div>
      </div>

      <div class="dw-list">
        ${rows.map((pr, i) => {
          const isNext = pr.key === nextKey && !pr.isSunrise;
          const passed = !isNext && i < nextIdx;
          return `<div class="dw-row ${isNext ? 'is-next' : ''} ${passed ? 'passed' : ''}">
            <span class="n">${esc(pr.name)}</span>
            <span class="t">${esc(window.ZN.formatClock(pr.time, fmt))}</span>
          </div>`;
        }).join('')}
      </div>

      <div class="dw-foot">
        <span>مواقيت أم القرى</span>
        <button class="dw-close" data-action="hide" title="إخفاء ودجت سطح المكتب">&times;</button>
      </div>
    </div>`;
  resize();
}

function tick() {
  if (!current || !current.next) return;
  const el = document.getElementById('dcd');
  if (el) el.textContent = window.ZN.formatCountdown(current.next.ts - Date.now());
}

// اضبط ارتفاع النافذة على ارتفاع البطاقة الفعلي (وإلا انقصّت من الأسفل)
function resize() {
  requestAnimationFrame(() => {
    const card = root.querySelector('.dw');
    if (!card) return;
    const h = Math.ceil(card.getBoundingClientRect().height) + 20; // حشوة الجسم 10×2
    window.zn.resizeDesktop(340, h);
  });
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => resize());

root.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (b && b.dataset.action === 'hide') window.zn.hideDesktop();
});

window.zn.onState((p) => {
  current = p;
  window.ZN.applyTheme(p.settings.theme);
  const sig = signature(p);
  if (sig === lastSignature) { tick(); return; }
  lastSignature = sig;
  render();
});

setInterval(tick, 1000);

(async () => {
  current = await window.zn.getState();
  if (current) {
    window.ZN.applyTheme(current.settings.theme);
    lastSignature = signature(current);
  }
  render();
})();
