'use strict';
/* منطق الودجت: العرض بوضعين (أقرب صلاة / كل الصلوات) + عدّ تنازلي حيّ */

const root = document.getElementById('root');
let current = null;

const ICON = {
  crescent: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 2A9.5 9.5 0 1 0 22 15.2 7.5 7.5 0 0 1 15.5 2z"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.3"/><path d="M21 3v5h-5"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V22a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 6.3 20l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15H2.9a2 2 0 1 1 0-4H3a1.7 1.7 0 0 0 1.5-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3.9V4a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 17 5.5l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11h.1a2 2 0 1 1 0 4H21z"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 4v6l3 3v2H7v-2l3-3V4H8V2h8v2z"/><path d="M11 15h2v7h-2z"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  power: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v9"/><path d="M6.2 6.4a8 8 0 1 0 11.6 0"/></svg>',
  loc: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/></svg>',
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function localHM(iso, fmt) {
  if (!iso) return '—';
  const d = new Date(iso);
  return window.ZN.formatClock(`${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`, fmt);
}

function render() {
  const p = current;
  if (!p) {
    root.innerHTML = '<div class="card"><div class="loading">جارٍ التحميل…</div></div>';
    return;
  }
  const s = p.settings;
  const fmt = s.timeFormat;
  const mode = s.viewMode;

  const header = `
    <div class="topbar drag">
      <div class="brand"><img class="brand-logo" src="../../../assets/logos/tha-dark.svg" alt=""/><span>ذكِّرنـي</span></div>
      <div class="segment no-drag">
        <button data-action="mode-next" class="${mode === 'next' ? 'active' : ''}">أقرب صلاة</button>
        <button data-action="mode-all" class="${mode === 'all' ? 'active' : ''}">كل الصلوات</button>
      </div>
      <div class="actions no-drag">
        <button class="iconbtn ${s.widgetPinned ? 'active' : ''}" data-action="pin" title="تثبيت في المقدمة">${ICON.pin}</button>
        <button class="iconbtn" data-action="settings" title="الإعدادات">${ICON.gear}</button>
        <button class="iconbtn" data-action="hide" title="إخفاء">${ICON.close}</button>
      </div>
    </div>`;

  const datebar = `
    <div class="datebar">
      <div class="dates">
        <div class="hijri">${esc(window.ZN.hijriString(p.hijriDate))}</div>
        <div class="greg">${esc(window.ZN.gregorianString(p.gregorianDate))}</div>
      </div>
      <button class="city no-drag" data-action="city" title="تغيير المدينة">${ICON.loc}<span>${esc(p.city)}</span></button>
    </div>`;

  let content = '';
  if (!p.prayers || !p.prayers.length) {
    content = '<div class="content"><div class="loading">تعذّر تحميل المواقيت — تحقّق من الاتصال.</div></div>';
  } else if (mode === 'next') {
    content = renderNext(p, fmt);
  } else {
    content = renderAll(p, fmt);
  }

  const conn = p.online ? 'online' : 'offline';
  const connText = p.online ? 'متّصل' : 'غير متّصل';
  const status = `
    <div class="statusbar">
      <button class="power no-drag" data-action="quit" title="إغلاق التطبيق نهائيًا">${ICON.power}</button>
      <span class="conn ${conn}"><span class="cdot"></span>${connText} · تحديث ${esc(localHM(p.fetchedAt, fmt))}</span>
      <button class="refresh no-drag" data-action="refresh" title="تحديث الآن">${ICON.refresh}<span>تحديث</span></button>
    </div>`;

  root.innerHTML = `<div class="card">${header}${datebar}${content}${status}</div>`;
  tickCountdown();
  resize();
}

// هل نحن في فترة ما بين الأذان والإقامة للصلاة الحالية؟
function iqamaInfo(p) {
  if (!p || !p.currentTs || !p.settings) return null;
  const offsetMs = (p.settings.iqamaOffset || 10) * 60 * 1000;
  const iqamaTs = p.currentTs + offsetMs;
  if (Date.now() >= p.currentTs && Date.now() < iqamaTs) {
    return { ts: iqamaTs, name: p.currentName };
  }
  return null;
}

function renderNext(p, fmt) {
  const n = p.next;
  if (!n) return '<div class="content"><div class="loading">—</div></div>';
  const tag = n.isTomorrow ? '<span class="tag">غدًا</span>' : '';
  const iq = iqamaInfo(p);
  const iqamaLine = iq
    ? `<div class="iqama-line" id="iqline">الإقامة بعد <b id="iqcd">${window.ZN.formatCountdown(iq.ts - Date.now())}</b></div>`
    : '';
  return `
    <div class="content">
      <div class="next-wrap">
        ${iqamaLine}
        <div class="next-label">الصلاة القادمة</div>
        <div class="next-name">${esc(n.name)}</div>
        <div class="next-time">${esc(window.ZN.formatClock(n.time, fmt))} ${tag}</div>
        <div class="countdown" id="cd">${window.ZN.formatCountdown(n.ts - Date.now())}</div>
        <div class="countdown-words" id="cdw">${esc(window.ZN.formatCountdownWords(n.ts - Date.now()))}</div>
      </div>
    </div>`;
}

function renderAll(p, fmt) {
  const rows = [];
  const nextKey = p.next && !p.next.isTomorrow ? p.next.key : null;
  const order = [];
  for (const pr of p.prayers) {
    order.push(pr);
    if (pr.key === 'fajr' && p.sunrise) order.push({ ...p.sunrise, isSunrise: true });
  }
  for (const pr of order) {
    const cls = [
      'prow',
      pr.isSunrise ? 'sunrise' : '',
      pr.key === nextKey ? 'is-next' : '',
      !pr.isSunrise && pr.key === p.currentKey && pr.key !== nextKey ? 'is-current' : '',
    ].filter(Boolean).join(' ');
    const badge = pr.key === nextKey ? '<span class="next-badge">التالية</span>' : '';
    const tomorrowBadge =
      p.next && p.next.isTomorrow && pr.key === 'fajr' ? '<span class="next-badge">غدًا</span>' : '';
    rows.push(`
      <div class="${cls}">
        <span class="pname"><span class="dot"></span>${esc(pr.name)} ${badge}${tomorrowBadge}</span>
        <span class="ptime">${esc(window.ZN.formatClock(pr.time, fmt))}</span>
      </div>`);
  }
  return `<div class="content"><div class="prayer-list">${rows.join('')}</div></div>`;
}

function tickCountdown() {
  if (!current || !current.next) return;
  const ms = current.next.ts - Date.now();
  const cd = document.getElementById('cd');
  const cdw = document.getElementById('cdw');
  if (cd) cd.textContent = window.ZN.formatCountdown(ms);
  if (cdw) cdw.textContent = window.ZN.formatCountdownWords(ms);

  // عدّاد الإقامة: حدّثه، وأعد الرسم عند بدايته أو نهايته
  const iq = iqamaInfo(current);
  const line = document.getElementById('iqline');
  if (iq && line) {
    const el = document.getElementById('iqcd');
    if (el) el.textContent = window.ZN.formatCountdown(iq.ts - Date.now());
  } else if (!!iq !== !!line) {
    render();
  }
}

function resize() {
  requestAnimationFrame(() => {
    const card = root.querySelector('.card');
    if (!card) return;
    const h = Math.ceil(card.getBoundingClientRect().height) + 32; // padding الجسم 16*2
    window.zn.resizeWidget(340, h);
  });
}

// أعد القياس بعد تحميل خط ثمانية (يغيّر أبعاد النص)
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => resize());
}

// أحداث النقر
root.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const a = btn.dataset.action;
  switch (a) {
    case 'mode-next': window.zn.setMode('next'); break;
    case 'mode-all': window.zn.setMode('all'); break;
    case 'refresh': window.zn.refresh(); break;
    case 'settings': window.zn.openSettings(); break;
    case 'hide': window.zn.hideWidget(); break;
    case 'quit': window.zn.quit(); break;
    case 'city': window.zn.openSettings(); break;
    case 'pin':
      window.zn.setSettings({ widgetPinned: !(current && current.settings.widgetPinned) });
      break;
  }
});

// اشتراك التحديثات
window.zn.onState((payload) => {
  current = payload;
  window.ZN.applyTheme(payload.settings.theme);
  render();
});

// تحديث الثيم التلقائي عند تغيّر تفضيل النظام
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (current) window.ZN.applyTheme(current.settings.theme);
  });
}

// عدّ تنازلي كل ثانية
setInterval(tickCountdown, 1000);

// التحميل الأولي
(async () => {
  current = await window.zn.getState();
  if (current) window.ZN.applyTheme(current.settings.theme);
  render();
})();
