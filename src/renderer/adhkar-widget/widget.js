'use strict';
/* ودجت الأذكار لسطح المكتب: ذكر يتبدّل كل ٣٠ ثانية، مع زرَّي السابق والتالي */

const root = document.getElementById('root');
const ROTATE_MS = 30000;

let pool = [];
let idx = 0;
let elapsed = 0; // ملّي ثانية منذ آخر تبديل
let paused = false;

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function shell() {
  root.innerHTML = `
    <div class="aw">
      <div class="aw-head">
        <img src="../../../assets/logos/tha-dark.svg" alt="" />
        <span class="aw-cat" id="cat">…</span>
        <button class="aw-close" data-a="hide" title="إخفاء الودجت">&times;</button>
      </div>
      <div class="aw-text" id="text">جارٍ التحميل…</div>
      <div class="aw-rep" id="rep"></div>
      <div class="aw-foot">
        <button class="aw-btn" data-a="prev">السابق</button>
        <button class="aw-btn" data-a="next">التالي</button>
        <span class="aw-bar"><i id="bar"></i></span>
      </div>
    </div>`;
}

function show(i, animate = true) {
  if (!pool.length) return;
  idx = ((i % pool.length) + pool.length) % pool.length;
  const d = pool[idx];
  const txt = document.getElementById('text');
  const cat = document.getElementById('cat');
  const rep = document.getElementById('rep');

  const paint = () => {
    txt.textContent = d.text;
    cat.textContent = d.title;
    rep.textContent = d.repeat > 1 ? `تُقال ${window.ZN.toArabicDigits(d.repeat)} مرات` : '';
    txt.classList.remove('fade');
    fit();
  };

  if (animate) {
    txt.classList.add('fade');
    setTimeout(paint, 260); // تلاشٍ ناعم بين الأذكار
  } else {
    paint();
  }
  elapsed = 0;
}

// ارتفاع النافذة يتبع طول الذكر
function fit() {
  requestAnimationFrame(() => {
    const card = root.querySelector('.aw');
    if (!card) return;
    window.zn.resizeAdhkarWidget(Math.ceil(card.getBoundingClientRect().height) + 20);
  });
}

root.addEventListener('click', (e) => {
  const b = e.target.closest('[data-a]');
  if (!b) return;
  const a = b.dataset.a;
  if (a === 'hide') return window.zn.hideAdhkarWidget();
  if (a === 'next') return show(idx + 1);
  if (a === 'prev') return show(idx - 1);
});

// أوقف التبديل مؤقتًا أثناء القراءة (مرور المؤشر) — أدبٌ مع القارئ
root.addEventListener('mouseenter', () => { paused = true; }, true);
root.addEventListener('mouseleave', () => { paused = false; }, true);

// عدّاد التبديل + شريط التقدّم
setInterval(() => {
  if (!pool.length) return;
  if (!paused) elapsed += 250;
  const bar = document.getElementById('bar');
  if (bar) bar.style.width = Math.min(100, (elapsed / ROTATE_MS) * 100).toFixed(1) + '%';
  if (elapsed >= ROTATE_MS) show(idx + 1);
}, 250);

// كثافة الزجاج والثيم من الإعدادات (النص يبقى واضحًا مهما خفّت الخلفية)
function applyGlass(p) {
  if (!p || !p.settings) return;
  const v = Number(p.settings.desktopOpacity);
  document.documentElement.style.setProperty('--glass', Number.isFinite(v) ? Math.min(1, Math.max(0.35, v)) : 0.92);
  window.ZN.applyTheme(p.settings.theme);
}
window.zn.onState(applyGlass);

(async () => {
  shell();
  window.zn.getState().then(applyGlass).catch(() => {});
  pool = (await window.zn.adhkarPool()) || [];
  if (!pool.length) {
    root.innerHTML = '<div class="aw loading">تعذّر تحميل الأذكار.</div>';
    return;
  }
  show(0, false);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
})();
