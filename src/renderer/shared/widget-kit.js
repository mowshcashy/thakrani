'use strict';
/*
 * widget-kit.js — أدوات مشتركة لكل الودجتات (window.WK).
 *
 * السحب: بدل -webkit-app-region (وميض عند الضغط + يبتلع المرور والنقرات)
 * نبلّغ العملية الرئيسية ببداية السحب ونهايته فقط، وهي تحرّك النافذة وتُلصقها.
 * الضغط على زر أو حقل لا يبدأ سحبًا، والنقرة دون تحريك لا تحرّك شيئًا.
 */
(function () {
  const WK = {};

  WK.enableDrag = function (el) {
    el = el || document.documentElement;
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('button, input, select, textarea, a, [data-nodrag]')) return;
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      document.documentElement.classList.add('is-dragging');
      window.zn.drag.start();
      let ended = false;
      const end = () => {
        if (ended) return;
        ended = true;
        document.documentElement.classList.remove('is-dragging');
        window.zn.drag.end();
        el.removeEventListener('pointerup', end);
        el.removeEventListener('pointercancel', end);
        el.removeEventListener('lostpointercapture', end);
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('lostpointercapture', end);
    });
    // القائمة اليمنى للنظام لا معنى لها في ودجت
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  };

  /** كثافة الزجاج والثيم من الإعدادات — النص يبقى معتمًا مهما خفّت الخلفية. */
  WK.applyGlass = function (p) {
    if (!p || !p.settings) return;
    const v = Number(p.settings.desktopOpacity);
    document.documentElement.style.setProperty('--glass', Number.isFinite(v) ? Math.min(1, Math.max(0.35, v)) : 0.92);
    if (window.ZN) window.ZN.applyTheme(p.settings.theme);
  };

  /** للودجتات ذات الارتفاع التلقائي: يبلّغ ارتفاع البطاقة بعد الرسم. */
  WK.fit = function (el, pad = 0) {
    requestAnimationFrame(() => {
      if (!el) return;
      window.zn.widgetFit(Math.ceil(el.getBoundingClientRect().height) + pad);
    });
  };

  WK.hide = () => window.zn.widgetHide();

  WK.esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /** اشتراك موحّد: الحالة الأولى + التحديثات، مع تطبيق الزجاج تلقائيًا. */
  WK.onState = function (cb) {
    window.zn.onState((p) => { WK.applyGlass(p); cb(p); });
    window.zn.getState().then((p) => { WK.applyGlass(p); cb(p); }).catch(() => {});
  };

  // زر الإغلاق في أي ودجت: data-wclose
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-wclose]')) WK.hide();
  });

  window.WK = WK;
})();
