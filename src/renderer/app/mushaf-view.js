'use strict';
/*
 * mushaf-view.js — يرسم صفحة من مصحف المدينة كما هي: ١٥ سطرًا بنفس توزيع الكلمات
 * في المصحف المطبوع، بخط مجمع الملك فهد (KFGQPC Hafs).
 *
 * يُستخدم في: المصحف، و«راجع قبل التسميع»، والتسميع نفسه (الكلمات تُخفى في أماكنها).
 *
 *   MushafView.html(page, { wordClass(s, v, pos) → 'cls', juzName, hizbLabel, mark:{s,v} })
 *   MushafView.fit(container)   — يضبط حجم الخط ليملأ كل سطر عرض الصفحة بلا فيضان
 */
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ar = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
  const BASMALA = 'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ';

  function html(p, opts = {}) {
    const wc = opts.wordClass || (() => '');
    const mark = opts.mark;
    const special = p.page <= 2; // الفاتحة وأول البقرة: أسطر قصيرة في الوسط
    let lines = '';
    for (const l of p.lines) {
      if (!l || l.e) { lines += '<div class="ml ml-empty"></div>'; continue; }
      if (l.h) { lines += `<div class="ml ml-h"><span>سورة ${esc(l.name || '')}</span></div>`; continue; }
      if (l.b) { lines += `<div class="ml ml-b">${BASMALA}</div>`; continue; }
      let words = '';
      for (const [s, v, pos, t] of l.w) {
        const m = mark && mark.s === s && mark.v === v ? ' marked' : '';
        if (pos === 0) words += `<span class="mw-end${m}" data-s="${s}" data-v="${v}">${esc(t)}</span>`;
        else words += `<span class="mw ${wc(s, v, pos)}${m}" data-s="${s}" data-v="${v}" data-p="${pos}">${esc(t)}</span>`;
      }
      lines += `<div class="ml">${words}</div>`;
    }
    const names = p.surahNames || [];
    const head = names.length ? names[names.length - 1].name : '';
    const hizb = opts.hizbLabel ? `<div class="mp-hizb">${opts.hizbLabel}</div>` : '';
    return `
      <div class="mpage ${special ? 'special' : ''} ${p.page % 2 ? 'odd' : 'even'}">
        ${hizb}
        <div class="mp-frame">
          <div class="mp-in">
            <div class="mp-head"><span>سورة ${esc(head)}</span><span>${esc(opts.juzName || '')}</span></div>
            <div class="mp-lines">${lines}</div>
            <div class="mp-foot"><span>${ar(p.page)}</span></div>
          </div>
        </div>
      </div>`;
  }

  /**
   * يحسب حجم الخط بحيث يتسع أطول سطر لعرض الصفحة، ثم يوزّع الكلمات على العرض كاملًا
   * (مثل المطبوع). يعاد استدعاؤه عند تغيّر عرض النافذة.
   */
  function fit(root) {
    for (const page of root.querySelectorAll('.mpage')) {
      const box = page.querySelector('.mp-lines');
      if (!box) continue;
      const W = box.clientWidth;
      if (!W) continue;
      box.style.setProperty('--fs', '20px');
      box.classList.add('measuring');
      let max = 0;
      for (const l of box.querySelectorAll('.ml:not(.ml-h):not(.ml-b):not(.ml-empty)')) max = Math.max(max, l.scrollWidth);
      box.classList.remove('measuring');
      const scale = page.classList.contains('special') ? 0.62 : 0.985;
      const fs = max ? Math.min(60, (20 * W * scale) / max) : 24;
      box.style.setProperty('--fs', fs.toFixed(2) + 'px');
    }
  }

  let ro = null;
  function autoFit(root) {
    fit(root);
    if (ro) ro.disconnect();
    let lastW = root.clientWidth;
    ro = new ResizeObserver(() => {
      // نعيد الضبط فقط عند تغيّر العرض (تغيّر الارتفاع سببه الضبط نفسه)
      if (root.clientWidth === lastW) return;
      lastW = root.clientWidth;
      requestAnimationFrame(() => fit(root));
    });
    ro.observe(root);
    // الخط قد يكتمل تحميله بعد الرسم الأول
    if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => fit(root));
  }

  window.MushafView = { html, fit, autoFit, BASMALA };
})();
