'use strict';
/* الودجت المصغّر الثابت الشفاف: الوقت الحالي + الصلاة القادمة + العدّ التنازلي */

const root = document.getElementById('root');
let current = null;

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
    const w = Math.ceil(el.getBoundingClientRect().width) + 12;
    const h = Math.ceil(el.getBoundingClientRect().height) + 12;
    window.zn.resizeMini(w, h);
  });
}

root.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (btn && btn.dataset.action === 'hide') window.zn.hideMini();
});

window.zn.onState((payload) => {
  current = payload;
  window.ZN.applyTheme(payload.settings.theme);
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
