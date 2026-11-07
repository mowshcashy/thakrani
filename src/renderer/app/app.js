'use strict';
/* نافذة ذكِّرني الرئيسية: المواقيت، الأذكار، المصحف، الإعدادات */

const main = document.getElementById('main');
const nav = document.getElementById('nav');
const sideNext = document.getElementById('sideNext');

let state = null; // آخر حالة من العملية الرئيسية
let route = 'times';
let cities = [];

/* ─── أدوات ─── */
const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ar = (s) => window.ZN.toArabicDigits(s);
const clock = (t) => window.ZN.formatClock(t, state ? state.settings.timeFormat : 12);

function sw(action, checked) {
  return `<label class="switch"><input type="checkbox" data-action="${action}" ${checked ? 'checked' : ''}/><span class="track"></span><span class="thumb"></span></label>`;
}

/* ─── التنقّل ─── */
nav.addEventListener('click', (e) => {
  const b = e.target.closest('[data-route]');
  if (b) go(b.dataset.route);
});

window.goRoute = (r) => go(r);
function go(r) {
  if (route === 'tasmee' && r !== 'tasmee') window.Tasmee.leave();
  route = r;
  [...nav.querySelectorAll('button')].forEach((b) => b.classList.toggle('active', b.dataset.route === r));
  render();
}

/* ─── العرض ─── */
function render() {
  if (!state) {
    main.innerHTML = '<div class="empty">جارٍ التحميل…</div>';
    return;
  }
  if (route === 'times') renderTimes();
  else if (route === 'adhkar') renderAdhkar();
  else if (route === 'quran') renderQuran();
  else if (route === 'tasmee') window.Tasmee.render(main, { state, esc, ar, surahs });
  else if (route === 'hifz') window.Hifz.render(main, { state, esc, ar });
  else renderSettings();
}

/* ═══════════ المواقيت ═══════════ */
function iqamaInfo(p) {
  if (!p || !p.currentTs) return null;
  const ts = p.currentTs + (p.settings.iqamaOffset || 10) * 60000;
  return Date.now() >= p.currentTs && Date.now() < ts ? { ts, name: p.currentName } : null;
}

function renderTimes() {
  const p = state;
  const n = p.next;
  const iq = iqamaInfo(p);
  const rows = [];
  for (const pr of p.prayers) {
    rows.push(pr);
    if (pr.key === 'fajr' && p.sunrise) rows.push({ ...p.sunrise, isSunrise: true });
  }
  // موضع اليوم على خط السير: كل ما قبل القادمة مضى
  const nextIdx = n && !n.isTomorrow ? rows.findIndex((r) => r.key === n.key) : rows.length;
  const done = rows.length > 1 ? Math.max(0, Math.min(1, (nextIdx - 0.5) / (rows.length - 1))) : 0;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'صباح الخير' : 'مساء الخير';

  main.innerHTML = `
    <div class="page-head">
      <div class="page-eyebrow">${greet}، ${esc(window.ZN.hijriString(p.hijriDate))}</div>
      <div class="page-title">مواقيت اليوم</div>
    </div>
    <section class="hero">
      <div class="hero-top">
        <div>
          <div class="lbl">الصلاة القادمة</div>
          <div class="nm">${n ? esc(n.name) : '—'}</div>
          <div class="tm">${n ? esc(clock(n.time)) : ''}${n && n.isTomorrow ? '<small>غدًا</small>' : ''}</div>
        </div>
        <div class="hero-cd">
          <div class="cd" id="cd">${n ? window.ZN.formatCountdown(n.ts - Date.now()) : ''}</div>
          <div class="words" id="cdw">${n ? esc(window.ZN.formatCountdownWords(n.ts - Date.now())) : ''}</div>
          ${iq ? `<div class="iq">إقامة ${esc(iq.name || '')} بعد <b id="iqcd">${window.ZN.formatCountdown(iq.ts - Date.now())}</b></div>` : ''}
        </div>
      </div>
      <div class="day-line" style="--done:${(done * (100 - 100 / rows.length)).toFixed(1)}%">
        ${rows.map((pr, i) => `
          <div class="dp ${pr.isSunrise ? 'sunrise' : ''} ${i < nextIdx ? 'past' : i === nextIdx ? 'next' : ''}">
            <i></i><b>${esc(pr.name)}</b><span>${esc(clock(pr.time))}</span>
          </div>`).join('')}
      </div>
    </section>
    <div class="meta-row">
      <div>
        <div class="hijri-big">${esc(window.ZN.hijriString(p.hijriDate))}</div>
        <div class="greg-sm">${esc(window.ZN.gregorianString(p.gregorianDate))}، مواقيت أم القرى الرسمية</div>
      </div>
      <button class="city-pill" data-action="goto-settings">
        <svg viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/></svg>
        ${esc(p.city)}
      </button>
    </div>
    <div class="home-row">
      <section class="card home-wird" id="homeWird"></section>
      <section class="card home-quick">
        <div class="home-h">اختصارات</div>
        <div class="chips">
          <button class="chip" data-home="adhkar">${hour < 12 ? 'أذكار الصباح' : 'أذكار المساء'}</button>
          <button class="chip" data-home="quran">${state.settings.quranBookmark ? 'تابع القراءة من ' + esc(surahLabel(state.settings.quranBookmark.surah)) : 'افتح المصحف'}</button>
          <button class="chip" data-home="tasmee">سمّع من حفظك</button>
          <button class="chip" data-home="hifz">حفظي</button>
        </div>
      </section>
    </div>`;
  renderHomeWird();
}

function surahLabel(n) {
  const x = (surahs || []).find((y) => y.n === Number(n));
  return x ? 'سورة ' + x.name : 'آخر موضع';
}

/** «تابع وردك»: مهام اليوم من خطة الحفظ كخط سير (حفظ ← مراجعة ← تحدي). */
async function renderHomeWird() {
  const box = document.getElementById('homeWird');
  if (!box) return;
  const H = await window.zn.hifz.get();
  if (!box.isConnected) return;
  if (!H.plan) {
    box.innerHTML = `<div class="home-h">تابع وردك</div>
      <p class="home-p">حدّد كم وجه تحفظ باليوم، والتطبيق يرتّب لك الحفظ والمراجعة ويذكّرك.</p>
      <button class="btn brand" data-home="hifz">ابدأ خطة الحفظ</button>`;
    return;
  }
  const t = H.today;
  const ch = H.challenges.find((c) => c.id === 'daily');
  const steps = [
    { name: 'حفظ جديد', done: !t.newPages.length || t.newPages.every((x) => t.newDone.includes(x)), sub: t.newPages.length ? 'الوجه ' + ar(t.newPages[0]) : 'لا يوجد' },
    { name: 'مراجعة', done: t.review.every((x) => t.reviewDone.includes(x)), sub: t.review.length ? ar(t.reviewDone.length) + ' من ' + ar(t.review.length) : 'لا يوجد' },
    { name: 'تحدي اليوم', done: !!(ch && ch.done), sub: ch && ch.page ? 'الوجه ' + ar(ch.page) : 'بعد أول حفظ' },
  ];
  const next = steps.findIndex((x) => !x.done);
  const doneCount = steps.filter((x) => x.done).length;
  box.innerHTML = `
    <div class="home-h">تابع وردك <span>${ar(doneCount)} من ${ar(steps.length)}</span></div>
    <div class="mini-line" style="--done:${(next < 0 ? 1 : Math.max(0, next - 0.5) / (steps.length - 1)) * 66.7}%">
      ${steps.map((x, i) => `<div class="dp ${x.done ? 'past' : i === next ? 'next' : ''}"><i></i><b>${x.name}</b><span>${x.sub}</span></div>`).join('')}
    </div>
    ${next < 0 ? '<div class="home-p ok">اكتمل وردك اليوم، تقبّل الله.</div>' : `<button class="btn brand" data-home="hifz">أكمل: ${steps[next].name}</button>`}`;
}

/* ═══════════ الأذكار ═══════════ */
let adhkarCats = null;
let adhkarIdx = 0;
const counters = {}; // "cat:item" → المتبقّي

async function renderAdhkar() {
  if (!adhkarCats) {
    main.innerHTML = '<div class="empty">جارٍ تحميل الأذكار…</div>';
    adhkarCats = await window.zn.adhkar();
  }
  if (!adhkarCats.length) {
    main.innerHTML = '<div class="empty">تعذّر تحميل الأذكار.</div>';
    return;
  }
  const cat = adhkarCats[adhkarIdx] || adhkarCats[0];
  main.innerHTML = `
    <div class="page-head">
      <div class="page-title">الأذكار</div>
      <div class="page-sub">من حصن المسلم، ${ar(adhkarCats.length)} قسمًا</div>
    </div>
    <div class="split">
      <div>
        <input class="search-box" id="azSearch" placeholder="ابحث في الأقسام…" />
        <div class="list-panel" id="azList">${azListHTML('')}</div>
      </div>
      <div id="azBody">${azBodyHTML(cat)}</div>
    </div>`;
}

function azListHTML(q) {
  const needle = q.trim();
  return adhkarCats
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => !needle || c.title.includes(needle))
    .map(({ c, i }) =>
      `<button class="list-item ${i === adhkarIdx ? 'active' : ''}" data-az="${i}">${esc(c.title)}<span class="cnt">${ar(c.items.length)}</span></button>`
    ).join('') || '<div class="empty" style="padding:24px">لا نتائج</div>';
}

function azBodyHTML(cat) {
  return cat.items.map((it, j) => {
    const key = `${cat.id}:${j}`;
    const left = counters[key] === undefined ? it.repeat : counters[key];
    const done = left <= 0;
    return `
      <div class="dhikr ${done ? 'done' : ''}" data-k="${key}">
        <div class="dhikr-text">${esc(it.text)}</div>
        <div class="dhikr-foot">
          <button class="dhikr-count ${done ? 'done' : ''}" data-count="${key}" data-rep="${it.repeat}">
            ${done ? 'تم ✓' : ar(left)}
          </button>
          <span class="dhikr-rep">${it.repeat > 1 ? `تُقال ${ar(it.repeat)} مرات` : 'مرة واحدة'}</span>
        </div>
      </div>`;
  }).join('');
}

/* ═══════════ المصحف ═══════════ */
let surahs = null;
let curSurah = 1;
let quranMode = 'read'; // read | search

let curPage = 1;
let pageMark = null; // {s, v} آية تُميَّز بعد الانتقال (من البحث أو المتابعة)

const JUZ_NAMES = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر',
  'الحادي عشر', 'الثاني عشر', 'الثالث عشر', 'الرابع عشر', 'الخامس عشر', 'السادس عشر', 'السابع عشر', 'الثامن عشر',
  'التاسع عشر', 'العشرون', 'الحادي والعشرون', 'الثاني والعشرون', 'الثالث والعشرون', 'الرابع والعشرون',
  'الخامس والعشرون', 'السادس والعشرون', 'السابع والعشرون', 'الثامن والعشرون', 'التاسع والعشرون', 'الثلاثون'];
const QUARTERS = ['الحزب', 'ربع الحزب', 'نصف الحزب', 'ثلاثة أرباع الحزب'];

async function renderQuran() {
  if (!surahs) {
    main.innerHTML = '<div class="empty">جارٍ تحميل المصحف…</div>';
    surahs = await window.zn.surahs();
  }
  const bm = state.settings.quranBookmark;
  if (bm && !renderQuran.started) curPage = await window.zn.pageOf(bm.surah, bm.verse);
  renderQuran.started = true;
  main.innerHTML = `
    <div class="split mushaf-split">
      <div>
        <input class="search-box" id="qSearch" placeholder="ابحث في السور أو الآيات…" />
        <div class="list-panel" id="qList">${qListHTML('')}</div>
      </div>
      <div>
        <div class="quran-toolbar">
          <button class="tool-btn" data-q="prev" title="الصفحة السابقة (→)">› السابقة</button>
          <label class="page-jump">صفحة <input id="qPage" type="number" min="1" max="604" value="${curPage}" /></label>
          <button class="tool-btn" data-q="next" title="الصفحة التالية (←)">التالية ‹</button>
          <span class="tb-gap"></span>
          <label class="page-jump">الجزء <select id="qJuz">${Array.from({ length: 30 }, (_, i) => `<option value="${i + 1}">${ar(i + 1)}</option>`).join('')}</select></label>
        </div>
        <div class="mushaf-stage" id="mushaf"></div>
      </div>
    </div>`;
  await showPage(curPage);
}

function surahName(n) {
  const s = (surahs || []).find((x) => x.n === Number(n));
  return s ? s.name : '';
}

function qListHTML(q) {
  const needle = q.trim();
  return (surahs || [])
    .filter((s) => !needle || s.name.includes(needle) || String(s.n) === needle)
    .map((s) =>
      `<button class="list-item ${s.n === curSurah ? 'active' : ''}" data-surah="${s.n}">${ar(s.n)}. ${esc(s.name)}<span class="cnt">${ar(s.ayahs)}</span></button>`
    ).join('') || '<div class="empty" style="padding:24px">لا نتائج</div>';
}

/** يفتح الصفحة التي فيها الآية (وأول السورة إن لم تُحدَّد آية). */
async function showSurah(n, verse) {
  const v = Number(verse) || 1;
  pageMark = verse ? { s: Number(n), v } : null;
  await showPage(await window.zn.pageOf(Number(n), v));
}

function hizbLabel(marks) {
  if (!marks || !marks.length) return '';
  const m = marks[0];
  return `<span>${esc(QUARTERS[m.quarter])}</span><b>${ar(m.hizb)}</b>`;
}

async function showPage(n) {
  const box = document.getElementById('mushaf');
  if (!box) return;
  const p = await window.zn.pageLines(n);
  curPage = p.page;
  quranMode = 'read';
  if (p.surahNames.length) curSurah = p.surahNames[p.surahNames.length - 1].n;
  box.innerHTML = window.MushafView.html(p, {
    juzName: 'الجزء ' + (JUZ_NAMES[p.juz - 1] || ar(p.juz)),
    hizbLabel: hizbLabel(p.marks),
    mark: pageMark,
  });
  window.MushafView.autoFit(box);

  const inp = document.getElementById('qPage');
  if (inp) inp.value = p.page;
  const js = document.getElementById('qJuz');
  if (js) js.value = String(p.juz);
  [...document.querySelectorAll('[data-surah]')].forEach((b) =>
    b.classList.toggle('active', Number(b.dataset.surah) === curSurah));
  const mk = box.querySelector('.marked');
  if (mk) mk.scrollIntoView({ block: 'center' });
  else box.scrollTop = 0;
  pageMark = null;

  // حفظ موضع القراءة (أول آية في الصفحة)
  const firstLine = p.lines.find((l) => l && l.w);
  const first = firstLine && firstLine.w[0];
  const bm = state.settings.quranBookmark;
  if (first && (!bm || bm.surah !== first[0] || bm.verse !== first[1])) {
    clearTimeout(showPage._t);
    showPage._t = setTimeout(() => patch({ quranBookmark: { surah: first[0], verse: first[1] } }), 800);
  }
}

// التقليب بالأسهم (المصحف من اليمين لليسار: السهم الأيسر = التالية)
document.addEventListener('keydown', (e) => {
  if (route !== 'quran' || quranMode !== 'read') return;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName)) return;
  if (e.key === 'ArrowLeft' || e.key === 'PageDown') { e.preventDefault(); if (curPage < 604) showPage(curPage + 1); }
  if (e.key === 'ArrowRight' || e.key === 'PageUp') { e.preventDefault(); if (curPage > 1) showPage(curPage - 1); }
});

async function runQuranSearch(q) {
  const box = document.getElementById('mushaf');
  if (!box) return;
  const res = await window.zn.searchQuran(q);
  quranMode = 'search';
  box.innerHTML = res.length
    ? `<div class="page-sub" style="margin-bottom:14px">${ar(res.length)} نتيجة لـ «${esc(q)}»</div>` +
      res.map((r) =>
        `<div class="qresult" data-go="${r.surah}:${r.verse}">
           <div class="ref">${esc(r.name)}، آية ${ar(r.verse)}</div>
           <div class="txt">${esc(r.text)}</div>
         </div>`).join('')
    : `<div class="empty">لا نتائج لـ «${esc(q)}»</div>`;
}

/* ═══════════ الإعدادات ═══════════ */
// ودجتات سطح المكتب [المفتاح، الاسم، الوصف، الأحجام] — المفاتيح تطابق desktop-widgets.js
const WIDGETS = [
  ['prayer', 'مواقيت اليوم', 'بطاقة مربّعة: الصلاة القادمة وبقية اليوم', [[260, 'صغير'], [320, 'وسط'], [400, 'كبير'], [480, 'ضخم']]],
  ['ring', 'حلقة الصلاة القادمة', 'دائرة تمتلئ كلما اقترب وقت الصلاة', [[170, 'صغير'], [220, 'وسط'], [280, 'كبير']]],
  ['clock', 'الساعة والتاريخ', 'الوقت والتاريخ الهجري والميلادي', [[190, 'صغير'], [250, 'وسط'], [320, 'كبير']]],
  ['adhkar', 'الأذكار', 'ذكر يتبدّل كل ٣٠ ثانية', [[300, 'ضيّق'], [360, 'وسط'], [440, 'عريض']]],
  ['ayah', 'آية', 'آية من المصحف تتبدّل كل ١٠ دقائق', [[300, 'ضيّق'], [380, 'وسط'], [460, 'عريض']]],
  ['tasbeeh', 'المسبحة', 'تسبيح ما بعد الصلاة ٣٣ / ٣٣ / ٣٤', [[180, 'صغير'], [230, 'وسط'], [290, 'كبير']]],
];

const PRAYER_LABELS =[['fajr', 'الفجر'], ['dhuhr', 'الظهر'], ['asr', 'العصر'], ['maghrib', 'المغرب'], ['isha', 'العشاء']];

function cityOptions(sel) {
  if (!cities.length) return `<option selected>${esc(sel)}</option>`;
  const regions = cities.filter((c) => c.type === 'region').sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  return regions.map((r) => {
    const members = [r, ...cities.filter((c) => c.type !== 'region' && c.region === r.name).sort((a, b) => a.name.localeCompare(b.name, 'ar'))];
    return `<optgroup label="${esc(r.name)}">` +
      members.map((m) => `<option value="${esc(m.name)}" ${m.name === sel ? 'selected' : ''}>${esc(m.name)}</option>`).join('') +
      '</optgroup>';
  }).join('');
}

function renderSettings() {
  const s = state.settings;
  const rem = s.adhkarReminder || {};
  const fileName = s.adhanFile ? s.adhanFile.split(/[\\/]/).pop() : 'الأذان المضمّن';
  const entry = cities.find((c) => c.name === s.city);
  const cityDesc = entry && entry.type !== 'region'
    ? `محسوبة بطريقة أم القرى ومثبّتة على مواقيت ${esc(entry.region)}`
    : 'مواقيت أم القرى الرسمية';

  main.innerHTML = `
    <div class="page-head"><div class="page-title">الإعدادات</div></div>

    <div class="sec">
      <div class="sec-t">المواقيت والعرض</div>
      <div class="group">
        <div class="row">
          <div class="ltext"><span class="lbl">المدينة</span><span class="desc">${cityDesc}</span></div>
          <select data-action="city">${cityOptions(s.city)}</select>
        </div>
        <div class="row">
          <div class="ltext"><span class="lbl">تنسيق الوقت</span></div>
          <div class="seg">
            <button data-action="fmt-12" class="${s.timeFormat === 12 ? 'active' : ''}">١٢ ساعة</button>
            <button data-action="fmt-24" class="${s.timeFormat === 24 ? 'active' : ''}">٢٤ ساعة</button>
          </div>
        </div>
        <div class="row">
          <div class="ltext"><span class="lbl">المظهر</span></div>
          <select data-action="theme">
            <option value="auto" ${s.theme === 'auto' ? 'selected' : ''}>تلقائي (حسب النظام)</option>
            <option value="light" ${s.theme === 'light' ? 'selected' : ''}>فاتح</option>
            <option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>داكن</option>
          </select>
        </div>
      </div>
    </div>

    <div class="sec">
      <div class="sec-t">الودجت</div>
      <div class="group">
        <div class="row">
          <div class="ltext"><span class="lbl">نوع عرض الودجت</span></div>
          <div class="seg">
            <button data-action="mode-next" class="${s.viewMode === 'next' ? 'active' : ''}">أقرب صلاة</button>
            <button data-action="mode-all" class="${s.viewMode === 'all' ? 'active' : ''}">كل الصلوات</button>
          </div>
        </div>
        <div class="row">
          <div class="ltext"><span class="lbl">الودجت المصغّرة العائمة</span><span class="desc">شريط شفاف فوق النوافذ</span></div>
          ${sw('mini-enabled', s.miniEnabled)}
        </div>
      </div>
    </div>

    <div class="sec">
      <div class="sec-t">ودجتات سطح المكتب</div>
      <div class="page-sub" style="margin:0 2px 10px">تجلس على سطح المكتب خلف نوافذك (Win+D لرؤيتها). اسحبها بالماوس وتلتصق بحواف الشاشة وببعضها.</div>
      <div class="group">
        ${WIDGETS.map(([kind, name, desc, sizes]) => {
          const c = (s.widgets && s.widgets[kind]) || {};
          const cur = c.size || sizes[1][0];
          const controls = c.enabled
            ? `<div class="seg">${sizes.map(([v, nm]) =>
                `<button data-action="wsize" data-kind="${kind}" data-size="${v}" class="${cur === v ? 'active' : ''}">${nm}</button>`).join('')}</div>
               <button class="btn" data-action="wreset" data-kind="${kind}" title="انقلها لمكان فارغ">↺</button>`
            : '';
          return `
          <div class="row">
            <div class="ltext"><span class="lbl">${name}</span><span class="desc">${desc}</span></div>
            <div class="btn-row" style="align-items:center">${controls}${sw('wtoggle-' + kind, c.enabled)}</div>
          </div>`;
        }).join('')}
        <div class="row">
          <div class="ltext"><span class="lbl">كثافة الزجاج</span><span class="desc">كلما قلّت صارت الخلفية أشف — والنص يبقى واضحًا</span></div>
          <input type="range" min="0.35" max="1" step="0.05" value="${s.desktopOpacity || 0.92}" data-action="desktop-opacity"/>
        </div>
        <div class="row">
          <div class="ltext"><span class="lbl">ترتيب تلقائي</span><span class="desc">يرصّ كل الودجتات الظاهرة بشكل مرتّب في يمين الشاشة</span></div>
          <div class="btn-row">
            <button class="btn brand" data-action="warrange">رتّبها</button>
            <button class="btn" data-action="reset-mini">إعادة المصغّرة</button>
          </div>
        </div>
      </div>
    </div>

    <div class="sec">
      <div class="sec-t">تذكير الأذكار</div>
      <div class="group">
        <div class="row">
          <div class="ltext"><span class="lbl">تذكير دوري بالأذكار</span><span class="desc">إشعار بذكر، وبالنقر تُفتح صفحة الأذكار</span></div>
          ${sw('rem-enabled', rem.enabled)}
        </div>
        <div class="row">
          <div class="ltext"><span class="lbl">كل كم؟</span></div>
          <select data-action="rem-every">
            ${[15, 30, 60, 120, 180, 360].map((m) =>
              `<option value="${m}" ${Number(rem.everyMinutes) === m ? 'selected' : ''}>${m < 60 ? `${ar(m)} دقيقة` : `${ar(m / 60)} ${m === 60 ? 'ساعة' : m === 120 ? 'ساعتين' : 'ساعات'}`}</option>`
            ).join('')}
          </select>
        </div>
        <div class="row">
          <div class="ltext"><span class="lbl">ساعات الهدوء</span><span class="desc">لا تصل تذكيرات خلالها</span></div>
          <div class="btn-row">
            <select data-action="rem-from">${hoursOptions(rem.quietFrom)}</select>
            <span style="align-self:center;color:var(--text-soft);font-size:12px">إلى</span>
            <select data-action="rem-to">${hoursOptions(rem.quietTo)}</select>
          </div>
        </div>
        <div class="row">
          <div class="ltext"><span class="lbl">تجربة التذكير</span></div>
          <button class="btn" data-action="rem-test">أرسل الآن</button>
        </div>
      </div>
    </div>

    <div class="sec">
      <div class="sec-t">التنبيهات والأذان</div>
      <div class="group">
        ${PRAYER_LABELS.map(([k, nm]) => `
          <div class="row">
            <div class="ltext"><span class="lbl">تنبيه ${nm}</span></div>
            ${sw('notif-' + k, s.notifications[k])}
          </div>`).join('')}
        <div class="row">
          <div class="ltext"><span class="lbl">تشغيل صوت الأذان</span></div>
          ${sw('adhan-enabled', s.adhanEnabled)}
        </div>
        <div class="row">
          <div class="ltext"><span class="lbl">نوع الأذان</span><span class="desc">التكبيرات تتوقف عند الثانية ١٦</span></div>
          <div class="seg">
            <button data-action="adhan-full" class="${s.adhanMode !== 'takbeer' ? 'active' : ''}">أذان كامل</button>
            <button data-action="adhan-takbeer" class="${s.adhanMode === 'takbeer' ? 'active' : ''}">تكبيرات</button>
          </div>
        </div>
        <div class="row">
          <div class="ltext"><span class="lbl">تشغيل الصوت عند</span></div>
          <div class="seg">
            <button data-action="timing-adhan" class="${!s.adhanTiming || s.adhanTiming === 'adhan' ? 'active' : ''}">الأذان</button>
            <button data-action="timing-iqama" class="${s.adhanTiming === 'iqama' ? 'active' : ''}">الإقامة</button>
            <button data-action="timing-both" class="${s.adhanTiming === 'both' ? 'active' : ''}">الاثنين</button>
          </div>
        </div>
        <div class="row">
          <div class="ltext"><span class="lbl">وقت الإقامة بعد الأذان</span></div>
          <div class="seg">
            ${[5, 10, 15, 20].map((m) => `<button data-action="iqama-${m}" class="${(s.iqamaOffset || 10) === m ? 'active' : ''}">${ar(m)} د</button>`).join('')}
          </div>
        </div>
        <div class="row">
          <div class="ltext"><span class="lbl">مستوى الصوت</span></div>
          <input type="range" min="0" max="1" step="0.05" value="${s.adhanVolume}" data-action="adhan-volume"/>
        </div>
        <div class="row">
          <div class="ltext"><span class="lbl">ملف الأذان</span><span class="file-name">${esc(fileName)}</span></div>
          <div class="btn-row">
            <button class="btn" data-action="adhan-test">تجربة</button>
            <button class="btn" data-action="adhan-stop">إيقاف</button>
            <button class="btn brand" data-action="adhan-pick">اختيار…</button>
            ${s.adhanFile ? '<button class="btn" data-action="adhan-reset">افتراضي</button>' : ''}
          </div>
        </div>
      </div>
    </div>

    <div class="sec">
      <div class="sec-t">النظام</div>
      <div class="group">
        <div class="row">
          <div class="ltext"><span class="lbl">التشغيل عند بدء ويندوز</span></div>
          ${sw('autostart', s.autoStart)}
        </div>
        <div class="row">
          <div class="ltext"><span class="lbl">إنهاء التطبيق</span><span class="desc">يوقف التنبيهات والأيقونة</span></div>
          <button class="btn" data-action="quit">خروج</button>
        </div>
      </div>
    </div>

    <div class="foot-note">
      ذكِّرنـي، بواسطة MOATH ALWASHMI، رخصة MIT<br>
      المواقيت من التقويم الرسمي السعودي «أم القرى»، الأذكار من حصن المسلم، المصحف بالرسم العثماني
    </div>`;
}

function hoursOptions(sel) {
  let out = '';
  for (let h = 0; h < 24; h++) {
    const v = `${String(h).padStart(2, '0')}:00`;
    out += `<option value="${v}" ${sel === v ? 'selected' : ''}>${window.ZN.formatClock(v, state.settings.timeFormat)}</option>`;
  }
  return out;
}

/* ═══════════ الأحداث ═══════════ */
async function patch(p) {
  await window.zn.setSettings(p);
}

main.addEventListener('click', async (e) => {
  const home = e.target.closest('[data-home]');
  if (home) return go(home.dataset.home);
  const el = e.target.closest('[data-action],[data-az],[data-surah],[data-count],[data-q],[data-go]');
  if (!el) return;

  // الأذكار: اختيار قسم
  if (el.dataset.az !== undefined) {
    adhkarIdx = Number(el.dataset.az);
    document.getElementById('azBody').innerHTML = azBodyHTML(adhkarCats[adhkarIdx]);
    [...document.querySelectorAll('[data-az]')].forEach((b) => b.classList.toggle('active', b === el));
    return;
  }
  // الأذكار: العدّاد
  if (el.dataset.count) {
    const key = el.dataset.count;
    const rep = Number(el.dataset.rep);
    const cur = counters[key] === undefined ? rep : counters[key];
    const left = Math.max(0, cur - 1);
    counters[key] = left;
    const card = el.closest('.dhikr');
    el.textContent = left <= 0 ? 'تم ✓' : ar(left);
    el.classList.toggle('done', left <= 0);
    if (card) card.classList.toggle('done', left <= 0);
    return;
  }
  // المصحف: اختيار سورة
  if (el.dataset.surah) {
    await showSurah(el.dataset.surah);
    return;
  }
  // المصحف: نتيجة بحث
  if (el.dataset.go) {
    const [sn, vn] = el.dataset.go.split(':').map(Number);
    const qs = document.getElementById('qSearch');
    if (qs) qs.value = '';
    await showSurah(sn, vn);
    return;
  }
  // المصحف: أدوات
  if (el.dataset.q) {
    const q = el.dataset.q;
    const size = state.settings.quranFontSize || 30;
    if (q === 'font+') return patch({ quranFontSize: Math.min(56, size + 3) });
    if (q === 'font-') return patch({ quranFontSize: Math.max(20, size - 3) });
    if (q === 'prev' && curPage > 1) return showPage(curPage - 1);
    if (q === 'next' && curPage < 604) return showPage(curPage + 1);
    return;
  }

  const a = el.dataset.action;
  if (a === 'goto-settings') return go('settings');
  if (a === 'mode-next') return patch({ viewMode: 'next' });
  if (a === 'mode-all') return patch({ viewMode: 'all' });
  if (a === 'fmt-12') return patch({ timeFormat: 12 });
  if (a === 'fmt-24') return patch({ timeFormat: 24 });
  if (a === 'adhan-full') return patch({ adhanMode: 'full' });
  if (a === 'adhan-takbeer') return patch({ adhanMode: 'takbeer' });
  if (a === 'timing-adhan') return patch({ adhanTiming: 'adhan' });
  if (a === 'timing-iqama') return patch({ adhanTiming: 'iqama' });
  if (a === 'timing-both') return patch({ adhanTiming: 'both' });
  if (a && a.startsWith('iqama-')) return patch({ iqamaOffset: parseInt(a.slice(6), 10) });
  if (a === 'adhan-test') return window.zn.testAdhan();
  if (a === 'adhan-stop') return window.zn.stopAdhan();
  if (a === 'adhan-reset') return patch({ adhanFile: null });
  if (a === 'adhan-pick') { await window.zn.pickAdhan(); return; }
  if (a === 'rem-test') return window.zn.testDhikr();
  if (a === 'reset-mini') return window.zn.resetMini();
  if (a === 'wsize') return patch({ widgets: { [el.dataset.kind]: { size: parseInt(el.dataset.size, 10) } } });
  if (a === 'wreset') return window.zn.widgetReset(el.dataset.kind);
  if (a === 'warrange') return window.zn.widgetsArrange();
  if (a === 'quit') return window.zn.quit();
});

main.addEventListener('change', (e) => {
  if (e.target.id === 'qJuz') {
    window.zn.juzRanges().then((J) => showPage(J[Number(e.target.value) - 1][0]));
    return;
  }
  if (e.target.id === 'qPage') {
    const n = Math.min(604, Math.max(1, parseInt(e.target.value, 10) || 1));
    showPage(n);
    return;
  }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'city') return patch({ city: el.value });
  if (a === 'theme') return patch({ theme: el.value });
  if (a === 'adhan-volume') return patch({ adhanVolume: parseFloat(el.value) });
  if (a === 'adhan-enabled') return patch({ adhanEnabled: el.checked });
  if (a === 'autostart') return patch({ autoStart: el.checked });
  if (a === 'mini-enabled') return patch({ miniEnabled: el.checked });
  if (a && a.startsWith('wtoggle-')) return patch({ widgets: { [a.slice(8)]: { enabled: el.checked } } });
  if (a === 'desktop-opacity') return patch({ desktopOpacity: parseFloat(el.value) });
  if (a === 'rem-enabled') return patch({ adhkarReminder: { enabled: el.checked } });
  if (a === 'rem-every') return patch({ adhkarReminder: { everyMinutes: parseInt(el.value, 10) } });
  if (a === 'rem-from') return patch({ adhkarReminder: { quietFrom: el.value } });
  if (a === 'rem-to') return patch({ adhkarReminder: { quietTo: el.value } });
  if (a && a.startsWith('notif-')) return patch({ notifications: { [a.slice(6)]: el.checked } });
});

main.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.action === 'adhan-volume') return window.zn.previewVolume(parseFloat(el.value));
  if (el.id === 'azSearch') {
    document.getElementById('azList').innerHTML = azListHTML(el.value);
    return;
  }
  if (el.id === 'qSearch') {
    const v = el.value.trim();
    document.getElementById('qList').innerHTML = qListHTML(v);
    clearTimeout(el._t);
    // بحث في نص المصحف عند كتابة كلمة حقيقية
    el._t = setTimeout(() => {
      if (v.length >= 3 && !/^\d+$/.test(v)) runQuranSearch(v);
      else if (!v && quranMode === 'search') showPage(curPage);
    }, 350);
  }
});

/* ═══════════ العدّادات الحيّة ═══════════ */
function tick() {
  if (!state || !state.next) return;
  const cd = document.getElementById('cd');
  const cdw = document.getElementById('cdw');
  const ms = state.next.ts - Date.now();
  if (cd) cd.textContent = window.ZN.formatCountdown(ms);
  if (cdw) cdw.textContent = window.ZN.formatCountdownWords(ms);
  const iq = iqamaInfo(state);
  const iqcd = document.getElementById('iqcd');
  if (iq && iqcd) iqcd.textContent = window.ZN.formatCountdown(iq.ts - Date.now());
  // بطاقة الشريط الجانبي
  sideNext.innerHTML = `<div>القادمة</div>
    <div class="n">${esc(state.next.name)}</div>
    <div class="cd">${window.ZN.formatCountdown(ms)}</div>`;
}
setInterval(tick, 1000);

/* ═══════════ الحالة ═══════════ */
function apply(p, isFirst) {
  const prev = state;
  state = p;
  cities = p.cities && p.cities.length ? p.cities : cities;
  window.ZN.applyTheme(p.settings.theme);
  // أعِد الرسم فقط عند تغيّر يهم الصفحة الحالية
  const structural = !prev ||
    prev.settings.theme !== p.settings.theme ||
    prev.settings.timeFormat !== p.settings.timeFormat ||
    prev.city !== p.city ||
    JSON.stringify(prev.settings) !== JSON.stringify(p.settings) ||
    (prev.next && p.next && prev.next.key !== p.next.key) ||
    prev.currentKey !== p.currentKey;
  if (isFirst || structural) {
    // التسميع: لا نعيد الرسم أبدًا أثناء الجلسة (يضيع التسجيل)
    if ((route === 'tasmee' || route === 'hifz') && prev) { tick(); return; }
    // في المصحف: أعِد الرسم فقط إن تغيّر حجم الخط أو الثيم (لئلا نفقد موضع القراءة)
    if (route === 'quran' && prev) {
      const sizeChanged = prev.settings.quranFontSize !== p.settings.quranFontSize;
      const themeChanged = prev.settings.theme !== p.settings.theme;

      if (!themeChanged) { tick(); return; }
    }
    render();
  }
  tick();
}

window.zn.onState((p) => apply(p, false));
window.zn.onRoute((r) => go(r));

(async () => {
  const p = await window.zn.getState();
  surahs = await window.zn.surahs(); // لأسماء السور في الاختصارات
  apply(p, true);
})();
