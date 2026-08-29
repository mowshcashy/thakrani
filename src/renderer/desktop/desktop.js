'use strict';
/* ودجت المواقيت لسطح المكتب — بطاقة مربّعة: الصلاة القادمة + شريط مضغوط لبقية اليوم */

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
  const nextIdx = nextKey ? p.prayers.findIndex((x) => x.key === nextKey) : p.prayers.length;

  root.innerHTML = `
    <div class="dw">
      <button class="dw-close" data-action="hide" title="إخفاء الودجت">&times;</button>

      <div class="dw-head">
        <img src="../../../assets/logos/tha-dark.svg" alt="" />
        <span class="dw-hijri">${esc(window.ZN.hijriString(p.hijriDate))}</span>
        <span class="dw-city">${esc(p.city)}</span>
      </div>

      <div class="dw-next">
        <div class="lbl">الصلاة القادمة</div>
        <div class="nm">${esc(p.next.name)}</div>
        <div class="tm">${esc(window.ZN.formatClock(p.next.time, fmt))}${p.next.isTomorrow ? ' — غدًا' : ''}</div>
        <div class="cd" id="dcd">${window.ZN.formatCountdown(p.next.ts - Date.now())}</div>
      </div>

      <div class="dw-strip">
        ${p.prayers.map((pr, i) => {
          const isNext = pr.key === nextKey;
          const passed = !isNext && i < nextIdx;
          return `<div class="dw-cell ${isNext ? 'is-next' : ''} ${passed ? 'passed' : ''}">
            <div class="n">${esc(pr.name)}</div>
            <div class="t">${esc(window.ZN.formatClock(pr.time, fmt))}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

function tick() {
  if (!current || !current.next) return;
  const el = document.getElementById('dcd');
  if (el) el.textContent = window.ZN.formatCountdown(current.next.ts - Date.now());
}

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
