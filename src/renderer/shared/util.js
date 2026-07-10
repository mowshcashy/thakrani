'use strict';
/* أدوات مشتركة للواجهات (تُحمَّل كسكربت عادي، تُعرّف window.ZN) */

(function () {
  const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

  function toArabicDigits(s) {
    return String(s).replace(/[0-9]/g, (d) => AR_DIGITS[+d]);
  }

  // "18:47" → حسب التنسيق (12/24) بأرقام عربية + ص/م
  function formatClock(hhmm, timeFormat) {
    if (!hhmm) return '';
    const [hStr, mStr] = String(hhmm).split(':');
    let h = parseInt(hStr, 10);
    const m = mStr;
    if (timeFormat === 12) {
      const period = h >= 12 ? 'م' : 'ص';
      let h12 = h % 12;
      if (h12 === 0) h12 = 12;
      return `${toArabicDigits(h12)}:${toArabicDigits(m)} ${period}`;
    }
    return `${toArabicDigits(String(h).padStart(2, '0'))}:${toArabicDigits(m)}`;
  }

  // عدّ تنازلي "H:MM:SS" بأرقام عربية
  function formatCountdown(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const parts = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return toArabicDigits(parts);
  }

  // نص ودّي: "باقٍ ٥ ساعات و٣٢ دقيقة"
  function formatCountdownWords(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const hw = h === 0 ? '' : h === 1 ? 'ساعة' : h === 2 ? 'ساعتان' : h <= 10 ? 'ساعات' : 'ساعة';
    const mw = m === 1 ? 'دقيقة' : m === 2 ? 'دقيقتان' : m <= 10 ? 'دقائق' : 'دقيقة';
    const segs = [];
    if (h > 0) segs.push(`${toArabicDigits(h)} ${hw}`);
    segs.push(`${toArabicDigits(m)} ${mw}`);
    return segs.join(' و');
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    let dark;
    if (theme === 'dark') dark = true;
    else if (theme === 'light') dark = false;
    else dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('theme-dark', !!dark);
  }

  function hijriString(hijri) {
    if (!hijri) return '';
    return `${toArabicDigits(hijri.day)} ${hijri.nameAr || hijri.name || ''} ${toArabicDigits(hijri.year)}هـ`;
  }

  function gregorianString(greg) {
    if (!greg) return '';
    return `${toArabicDigits(greg.day)} ${greg.nameAr || greg.name || ''} ${toArabicDigits(greg.year)}م`;
  }

  window.ZN = {
    toArabicDigits,
    formatClock,
    formatCountdown,
    formatCountdownWords,
    applyTheme,
    hijriString,
    gregorianString,
  };
})();
