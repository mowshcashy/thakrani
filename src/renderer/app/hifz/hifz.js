'use strict';
/*
 * hifz.js — صفحة «حفظي»: خطة الحفظ بالأوجه، ورد اليوم، المراجعة، التقدّم والتأخّر،
 * السلسلة، التحديات، خريطة الأجزاء، والتذكير اليومي بعد صلاة يختارها المستخدم.
 * البيانات والحسابات في العملية الرئيسية (src/main/hifz.js).
 */
(function () {
  let host = null;
  let ctx = null;
  let H = null; // ملخّص من العملية الرئيسية
  let editing = false;
  let draft = null;
  const names = new Map(); // صفحة → أسماء السور

  const esc = (s) => ctx.esc(s);
  const ar = (s) => ctx.ar(s);
  const PRAYERS = [['fajr', 'الفجر'], ['dhuhr', 'الظهر'], ['asr', 'العصر'], ['maghrib', 'المغرب'], ['isha', 'العشاء']];
  const pagesWord = (n) => (n === 1 ? 'وجه' : n === 2 ? 'وجهان' : n <= 10 ? 'أوجه' : 'وجهًا');
  const amount = (n) => (n === 0.5 ? 'نصف وجه' : n === 1 ? 'وجه' : n === 2 ? 'وجهان' : `${ar(n)} ${pagesWord(n)}`);
  const pagesText = (a, b) => (a === b ? `الوجه ${ar(a)}` : `الأوجه ${ar(a)}–${ar(b)}`);

  function hijri(dateStr) {
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(y, m - 1, d));
    } catch (_) {
      return dateStr;
    }
  }

  async function surahsOn(p) {
    if (!names.has(p)) {
      const pg = await window.zn.quranPage(p);
      names.set(p, pg.surahNames.map((x) => x.name).join('، '));
    }
    return names.get(p);
  }

  async function render(el, c) {
    host = el;
    ctx = c;
    H = await window.zn.hifz.get();
    if (!H.plan || editing) return renderWizard();
    return renderDash();
  }

  /* ═══════════ إعداد الخطة ═══════════ */
  function renderWizard() {
    const p = H.plan || {};
    const r = H.reminder || {};
    draft = draft || {
      order: p.order || 'backward', startPage: p.startPage || 0, daily: p.daily || 1, review: p.review != null ? p.review : 5,
      threshold: p.threshold || 80, retry: p.retry !== false, pre: [],
      rem: { enabled: r.enabled !== false, mode: r.mode || 'prayer', prayer: r.prayer || 'asr', offset: r.offset != null ? r.offset : 20, time: r.time || '17:00' },
    };
    const d = draft;
    const seg = (key, val, items, fmt = (x) => x) =>
      `<div class="seg">${items.map(([v, t]) => `<button data-set="${key}" data-val="${v}" class="${String(fmt(d[key])) === String(v) ? 'active' : ''}">${t}</button>`).join('')}</div>`;
    const memorizedJuz = H.stats.juz.map((j, i) => (j.done === j.total ? i + 1 : 0)).filter(Boolean);
    host.innerHTML = `
      <div class="page-head">
        <div class="page-title">${H.plan ? 'تعديل خطة الحفظ' : 'ابدأ خطة حفظك'}</div>
        <div class="page-sub">حدّد وردك اليومي بالأوجه، والتطبيق يرتّب لك الحفظ والمراجعة ويذكّرك كل يوم</div>
      </div>
      <div class="hz-wizard">
        <div class="group">
          <div class="row"><div class="ltext"><div class="lbl">من وين تبدأ؟</div><div class="desc">الترتيب اللي تمشي عليه في الحفظ</div></div>
            ${seg('order', d.order, [['backward', 'من جزء عمّ'], ['forward', 'من الفاتحة']])}</div>
          <div class="row"><div class="ltext"><div class="lbl">ابدأ من وجه معيّن</div><div class="desc">اتركه فاضي لو تبدأ من أول الترتيب</div></div>
            <input class="hz-num" id="hzStart" type="number" min="1" max="604" placeholder="—" value="${d.startPage || ''}" /></div>
          <div class="row"><div class="ltext"><div class="lbl">كم تحفظ باليوم؟</div><div class="desc">الوجه = صفحة من مصحف المدينة</div></div>
            ${seg('daily', d.daily, [[0.5, 'نصف وجه'], [1, 'وجه'], [2, 'وجهين'], [3, '٣ أوجه']])}</div>
          <div class="row"><div class="ltext"><div class="lbl">كم تراجع باليوم؟</div><div class="desc">من محفوظك، الأضعف والأقدم أولًا</div></div>
            ${seg('review', d.review, [[2, '٢'], [5, '٥'], [10, '١٠'], [20, 'جزء']])}</div>
          <div class="row"><div class="ltext"><div class="lbl">متى ينحسب الوجه محفوظ؟</div><div class="desc">نسبة الإتقان المطلوبة في التسميع</div></div>
            ${seg('threshold', d.threshold, [[70, '٧٠٪'], [80, '٨٠٪'], [90, '٩٠٪']])}</div>
        </div>

        <div class="sec-t" style="margin-top:18px">محفوظ عندك من قبل؟</div>
        <div class="hz-juzpick">${Array.from({ length: 30 }, (_, i) => {
          const j = i + 1;
          const on = d.pre.includes(j) || memorizedJuz.includes(j);
          return `<button data-pre="${j}" class="${on ? 'on' : ''}" ${memorizedJuz.includes(j) ? 'disabled' : ''}>${ar(j)}</button>`;
        }).join('')}</div>
        <div class="tsm-note">اختر الأجزاء اللي تحفظها، تدخل في المراجعة من أول يوم.</div>

        <div class="sec-t" style="margin-top:18px">التذكير اليومي</div>
        <div class="group">
          <div class="row"><div class="ltext"><div class="lbl">ذكّرني بوردي كل يوم</div></div>
            <label class="switch"><input type="checkbox" id="hzRemOn" ${d.rem.enabled ? 'checked' : ''}/><span class="track"></span><span class="thumb"></span></label></div>
          <div class="row"><div class="ltext"><div class="lbl">متى؟</div></div>
            <div class="hz-when">
              <div class="seg">
                <button data-rem-mode="prayer" class="${d.rem.mode === 'prayer' ? 'active' : ''}">بعد صلاة</button>
                <button data-rem-mode="time" class="${d.rem.mode === 'time' ? 'active' : ''}">وقت محدد</button>
              </div>
              ${d.rem.mode === 'prayer'
                ? `<select id="hzRemPrayer">${PRAYERS.map(([k, n]) => `<option value="${k}" ${k === d.rem.prayer ? 'selected' : ''}>${n}</option>`).join('')}</select>
                   <select id="hzRemOff">${[0, 10, 20, 30, 45, 60].map((m) => `<option value="${m}" ${m === Number(d.rem.offset) ? 'selected' : ''}>${m ? 'بعدها بـ' + ar(m) + ' د' : 'وقت الأذان'}</option>`).join('')}</select>`
                : `<input type="time" id="hzRemTime" value="${d.rem.time}" />`}
            </div></div>
        </div>

        <div class="btn-row" style="margin-top:20px">
          <button class="btn brand hz-go" id="hzSave">${H.plan ? 'احفظ التعديل' : 'ابدأ الخطة'}</button>
          ${H.plan ? '<button class="btn" id="hzCancel">إلغاء</button>' : ''}
        </div>
        ${H.plan ? '<div class="tsm-foot" style="text-align:start"><button class="linklike" id="hzReset">حذف الخطة وكل التقدّم</button></div>' : ''}
      </div>`;
    host.querySelectorAll('[data-set]').forEach((b) => {
      b.onclick = () => { const k = b.dataset.set; const v = b.dataset.val; d[k] = k === 'order' ? v : Number(v); renderWizard(); };
    });
    host.querySelectorAll('[data-pre]').forEach((b) => {
      b.onclick = () => { const j = Number(b.dataset.pre); d.pre = d.pre.includes(j) ? d.pre.filter((x) => x !== j) : d.pre.concat(j); b.classList.toggle('on'); };
    });
    host.querySelectorAll('[data-rem-mode]').forEach((b) => { b.onclick = () => { d.rem.mode = b.dataset.remMode; renderWizard(); }; });
    const $ = (id) => document.getElementById(id);
    $('hzStart').onchange = (e) => { d.startPage = Math.min(604, Math.max(0, parseInt(e.target.value, 10) || 0)); };
    $('hzRemOn').onchange = (e) => { d.rem.enabled = e.target.checked; };
    if ($('hzRemPrayer')) $('hzRemPrayer').onchange = (e) => { d.rem.prayer = e.target.value; };
    if ($('hzRemOff')) $('hzRemOff').onchange = (e) => { d.rem.offset = Number(e.target.value); };
    if ($('hzRemTime')) $('hzRemTime').onchange = (e) => { d.rem.time = e.target.value; };
    $('hzSave').onclick = async () => {
      await window.zn.hifz.setReminder(d.rem);
      H = await window.zn.hifz.setPlan({
        start: H.plan ? H.plan.start : undefined, order: d.order, startPage: d.startPage, daily: d.daily,
        review: d.review, threshold: d.threshold, retry: d.retry,
      }, d.pre);
      editing = false;
      draft = null;
      renderDash();
    };
    if ($('hzCancel')) $('hzCancel').onclick = () => { editing = false; draft = null; renderDash(); };
    if ($('hzReset')) $('hzReset').onclick = async () => {
      if (!confirm('تحذف الخطة وكل التقدّم المحفوظ؟ ما تقدر ترجعه.')) return;
      H = await window.zn.hifz.reset();
      editing = false;
      draft = null;
      renderWizard();
    };
  }

  /* ═══════════ لوحة الحفظ ═══════════ */
  async function renderDash() {
    const t = H.today;
    const st = H.stats;
    const pace = st.pace;
    const newLeft = t.newPages.filter((p) => !t.newDone.includes(p));
    const revLeft = t.review.filter((p) => !t.reviewDone.includes(p));
    const allDone = !newLeft.length && !revLeft.length;
    const newNames = t.newPages.length ? await surahsOn(t.newPages[0]) : '';

    let paceHTML = '<span class="hz-pace on">على الخطة تمامًا</span>';
    if (pace && pace.diff > 0) paceHTML = `<span class="hz-pace ahead">متقدّم ${ar(pace.diff)} ${pagesWord(pace.diff)}</span>`;
    if (pace && pace.diff < 0) paceHTML = `<span class="hz-pace behind">متأخر ${ar(-pace.diff)} ${pagesWord(-pace.diff)} (${ar(Math.max(1, -pace.daysDiff))} ${-pace.daysDiff > 2 && -pace.daysDiff <= 10 ? 'أيام' : 'يوم'})</span>`;
    const maxWeek = Math.max(1, ...st.week.map((w) => w.pages));
    const dayName = (d) => {
      const [y, m, dd] = d.split('-').map(Number);
      return new Date(y, m - 1, dd).toLocaleDateString('ar-SA', { weekday: 'short' });
    };
    const rem = H.reminder;
    const remText = !rem.enabled ? 'التذكير متوقف'
      : rem.mode === 'time' ? `يذكّرك كل يوم الساعة ${ar(rem.time)}`
        : `يذكّرك ${Number(rem.offset) ? 'بعد ' + ar(rem.offset) + ' دقيقة من' : 'عند'} أذان ${(PRAYERS.find((p) => p[0] === rem.prayer) || [0, ''])[1]}`;

    host.innerHTML = `
      <div class="tsm-top">
        <div>
          <div class="page-title">حفظي</div>
          <div class="page-sub">وردك اليومي: ${amount(H.plan.daily)} حفظ، و${amount(H.plan.review)} مراجعة. ${esc(remText)}.</div>
        </div>
        <div class="tsm-actions"><button class="tool-btn" id="hzEdit">تعديل الخطة</button></div>
      </div>

      <div class="hz-grid">
        <div class="card hz-today ${allDone ? 'done' : ''}">
          <div class="tsm-h">وردك اليوم ${allDone ? '<span class="hz-done">✓ اكتمل</span>' : ''}</div>
          <div class="hz-task">
            <div class="hz-task-h"><span class="hz-tag new">حفظ جديد</span>
              ${t.newPages.length ? `<b>${pagesText(t.newPages[0], t.newPages[t.newPages.length - 1])}</b><small>${esc(newNames)}</small>` : '<b>ما عليك حفظ جديد اليوم</b><small>أنت سابق الخطة، استغلها في المراجعة</small>'}
            </div>
            ${newLeft.length ? `<div class="btn-row"><button class="btn brand" id="hzNew">احفظ وسمّع</button></div>` : t.newPages.length ? '<div class="hz-ok">✓ تم</div>' : ''}
          </div>
          <div class="hz-task">
            <div class="hz-task-h"><span class="hz-tag rev">مراجعة</span>
              ${t.review.length ? `<b>${ar(t.review.length)} ${pagesWord(t.review.length)}</b><small>اضغط على الوجه لتسميعه</small>` : '<b>لا مراجعة بعد</b><small>تبدأ بعد أول وجه تحفظه</small>'}
            </div>
            ${revLeft.length ? `<div class="btn-row"><button class="btn brand" id="hzRev">ابدأ المراجعة</button></div>` : t.review.length ? '<div class="hz-ok">✓ تم</div>' : ''}
          </div>
          ${t.review.length ? `<div class="hz-chips">${t.review.map((p) => `<button data-rev="${p}" class="${t.reviewDone.includes(p) ? 'done' : ''}">${ar(p)}</button>`).join('')}</div>` : ''}
        </div>

        <div class="card hz-stats">
          <div class="hz-big"><b>${ar(st.memorized)}</b><span>${pagesWord(st.memorized)} محفوظة · ${ar(st.percent)}٪ من المصحف</span></div>
          <div class="hz-bar"><span style="width:${st.percent}%"></span></div>
          <div class="hz-kpis">
            <div><b>🔥 ${ar(st.streak)}</b><span>${st.streak === 1 ? 'يوم' : 'أيام'} متتالية</span></div>
            <div>${paceHTML}<span>عن خطتك</span></div>
          </div>
          ${pace ? `<div class="tsm-note">بهذا المعدّل تختم بإذن الله في ${esc(hijri(pace.finishDate))} (بعد ${ar(pace.finishDays)} يوم).</div>` : ''}
          <div class="hz-week">${st.week.map((w) => `<div title="${ar(w.pages)}"><i style="height:${Math.round((100 * w.pages) / maxWeek)}%"></i><span>${dayName(w.d)}</span></div>`).join('')}</div>
        </div>
      </div>

      ${st.weak.length ? `<div class="sec-t" style="margin-top:20px">تحتاج تثبيت</div>
        <div class="hz-chips weak">${st.weak.map((p) => `<button data-rev="${p}"><b>${ar(p)}</b> <small>${ar(H.pages[p].s)}٪</small></button>`).join('')}</div>` : ''}

      <div class="sec-t" style="margin-top:20px">التحديات</div>
      <div class="hz-chal">${H.challenges.map((c) => `
        <div class="card hz-ch ${c.done ? 'done' : ''}">
          <div class="hz-ch-i">${c.icon}</div>
          <div class="hz-ch-b">
            <div class="hz-ch-t">${esc(c.title)} ${c.done ? '<span class="hz-done">✓</span>' : ''}</div>
            <div class="hz-ch-d">${esc(ar(c.desc))}</div>
            <div class="hz-bar sm"><span style="width:${Math.round(c.progress * 100)}%"></span></div>
            ${c.daily && c.page && !c.done ? `<button class="tool-btn" data-chal="${c.page}">ابدأ التحدي</button>` : ''}
          </div>
        </div>`).join('')}
      </div>

      <div class="sec-t" style="margin-top:20px">خريطة الأجزاء</div>
      <div class="hz-juz">${st.juz.map((j, i) => {
        const pct = Math.round((100 * j.done) / j.total);
        return `<button class="hz-j ${pct === 100 ? 'full' : pct ? 'part' : ''}" data-juz="${i + 1}" title="الأوجه ${ar(j.from)}–${ar(j.to)}">
          <i style="height:${pct}%"></i><b>${ar(i + 1)}</b><span>${ar(pct)}٪</span></button>`;
      }).join('')}</div>
      <div class="tsm-note">اضغط على جزء لتسميع أوجهه.</div>

      ${H.recent.length ? `<div class="sec-t" style="margin-top:20px">آخر الجلسات</div>
        <div class="card hz-recent">${H.recent.map((l) => `<div><span>${l.t === 'new' ? 'حفظ' : l.t === 'review' ? 'مراجعة' : l.t === 'challenge' ? 'تحدي' : 'تسميع'} · ${pagesText(l.from, l.to)}</span>
          <span class="tsm-score ${l.score >= 90 ? 'hi' : l.score >= 70 ? 'mid' : 'lo'}">${ar(l.score)}٪</span></div>`).join('')}</div>` : ''}
    `;
    bindDash(newLeft, revLeft);
  }

  function go(passage) {
    window.Tasmee.start(passage);
    window.goRoute('tasmee');
  }

  function bindDash(newLeft, revLeft) {
    const $ = (id) => document.getElementById(id);
    $('hzEdit').onclick = () => { editing = true; draft = null; renderWizard(); };
    if ($('hzNew')) $('hzNew').onclick = () => {
      const a = newLeft[0];
      const b = newLeft[newLeft.length - 1];
      go({ kind: 'new', pageFrom: a, pageTo: b, range: null, title: 'حفظ اليوم: ' + pagesText(a, b), forceReview: true });
    };
    if ($('hzRev')) $('hzRev').onclick = () => {
      const p = revLeft[0];
      go({ kind: 'review', pageFrom: p, pageTo: p, range: null, title: 'مراجعة: ' + pagesText(p, p) });
    };
    host.querySelectorAll('[data-rev]').forEach((b) => {
      b.onclick = () => { const p = Number(b.dataset.rev); go({ kind: 'review', pageFrom: p, pageTo: p, range: null, title: 'مراجعة: ' + pagesText(p, p) }); };
    });
    host.querySelectorAll('[data-chal]').forEach((b) => {
      b.onclick = () => { const p = Number(b.dataset.chal); go({ kind: 'challenge', pageFrom: p, pageTo: p, range: null, title: 'تحدي اليوم: ' + pagesText(p, p), noReview: true }); };
    });
    host.querySelectorAll('[data-juz]').forEach((b) => {
      b.onclick = () => {
        const j = H.stats.juz[Number(b.dataset.juz) - 1];
        // أول وجه غير محفوظ في الجزء، وإلا أوله
        let p = j.from;
        for (let k = j.from; k <= j.to; k++) if (!(H.pages[k] && H.pages[k].m)) { p = k; break; }
        go({ kind: H.pages[p] && H.pages[p].m ? 'review' : 'free', pageFrom: p, pageTo: p, range: null, title: `الجزء ${ar(b.dataset.juz)}: ${pagesText(p, p)}` });
      };
    });
  }

  window.Hifz = { render };
})();
