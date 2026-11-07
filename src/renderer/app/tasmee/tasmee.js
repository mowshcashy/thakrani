'use strict';
/*
 * tasmee.js — التسميع: يقرأ المستخدم من حفظه والتطبيق يسمع ويقارن بالمصحف.
 *
 * المقطع (passage) يُختار بالسورة والآيات، أو بالجزء، أو بالأوجه (الصفحات)،
 * أو يأتي جاهزًا من «حفظي» (ورد اليوم / المراجعة / التحدي).
 *
 * التدفّق:
 *   [راجع قبل: المقطع ظاهر + استماع لقارئ]  →  [التسميع: الكلمات مخفية في أماكنها بالصفحة]
 *   مايكروفون 16kHz → كشف الوقفات → إعادة سماع المقطع المفتوح كاملًا بعد كل وقفة
 *   → محاذاة مع المصحف (match.js) → تنكشف الكلمات.
 *   عند الخطأ في آية: فرصة ثانية — يعيد الآية، فما صحّحه يظهر بالأخضر الفاتح.
 */
(function () {
  const M = window.TasmeeMatch;
  const MV = window.MushafView;
  const HISTORY_KEY = 'zn-tasmee-history';
  const PREFS_KEY = 'zn-tasmee-prefs';
  const MAX_PAGES = 10;
  const RECITERS = [
    ['Alafasy_128kbps', 'مشاري العفاسي'],
    ['Husary_128kbps', 'محمود خليل الحصري'],
    ['Minshawy_Murattal_128kbps', 'محمد صديق المنشاوي'],
    ['Abdurrahmaan_As-Sudais_192kbps', 'عبدالرحمن السديس'],
  ];

  let host = null;
  let ctx = null; // {state, esc, ar, surahs}
  let view = 'setup'; // setup | review | session | result
  let session = null;
  let rec = null;
  let unProgress = null;
  let modelStatus = null;
  let pendingPassage = null; // مقطع جاء من «حفظي» قبل فتح الصفحة
  let juzRanges = null;
  let player = null; // الاستماع في «راجع قبل»

  const esc = (s) => ctx.esc(s);
  const ar = (s) => ctx.ar(s);

  function loadJSON(key, def) {
    try { return JSON.parse(localStorage.getItem(key)) || def; } catch (_) { return def; }
  }
  function saveJSON(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (_) {}
  }
  const prefs = Object.assign({
    mode: 'surah', surah: 112, from: 1, to: 4, juz: 30, jfrom: 582, jto: 582, pfrom: 1, pto: 1,
    hintFirst: false, retry: true, review: true, reciter: 'Alafasy_128kbps',
  }, loadJSON(PREFS_KEY, {}));
  const savePrefs = () => saveJSON(PREFS_KEY, prefs);

  function surahMeta(n) {
    return (ctx.surahs || []).find((s) => s.n === Number(n)) || { n, name: '', ayahs: 1 };
  }
  const pagesText = (a, b) => (a === b ? `الوجه ${ar(a)}` : `الأوجه ${ar(a)}–${ar(b)}`);

  /* ───────── الدخول والخروج ───────── */
  async function render(el, c) {
    host = el;
    ctx = c;
    if (!ctx.surahs) ctx.surahs = await window.zn.surahs();
    if (!juzRanges) juzRanges = await window.zn.juzRanges();
    if (!unProgress) unProgress = window.zn.asr.onProgress(onProgress);
    if (pendingPassage) {
      const p = pendingPassage;
      pendingPassage = null;
      return begin(p);
    }
    if (view === 'session' && session) return renderSession();
    if (view === 'review' && session) return renderReview();
    if (view === 'result' && session) return renderResult();
    view = 'setup';
    return renderSetup();
  }

  function leave() {
    stopRecording();
    stopPlayer();
    if (view === 'session' || view === 'review') view = 'setup';
    window.zn.asr.release();
  }

  /** يُستدعى من «حفظي»: افتح التسميع على هذا المقطع مباشرة. */
  function start(passage) {
    pendingPassage = passage;
  }

  /* ═══════════ الإعداد ═══════════ */
  async function renderSetup() {
    modelStatus = await window.zn.asr.status();
    const hist = loadJSON(HISTORY_KEY, []).filter((h) => h.passage).slice(0, 6);
    host.innerHTML = `
      <div class="page-head">
        <div class="page-title">التسميع</div>
        <div class="page-sub">اقرأ من حفظك، والتطبيق يسمعك ويصحّح لك كلمة كلمة، بدون إنترنت</div>
      </div>
      <div class="tsm-grid">
        <div class="card tsm-setup">${modelStatus.installed ? setupFormHTML() : modelCardHTML()}</div>
        <div class="tsm-side">
          <div class="card tsm-how">
            <div class="tsm-h">الألوان</div>
            <div class="tsm-legend">
              <span><i class="lg ok"></i>صحيحة</span>
              <span><i class="lg fixed"></i>أخطأت ثم صحّحتها</span>
              <span><i class="lg bad"></i>خطأ</span>
              <span><i class="lg miss"></i>فاتتك</span>
              <span><i class="lg hint"></i>بتلميح</span>
            </div>
            <div class="tsm-note">إذا أخطأت في آية يعطيك فرصة تعيدها. يتحقق من الكلمات فقط، ولا يحكم على التجويد.</div>
          </div>
          ${hist.length ? `<div class="card tsm-hist">
            <div class="tsm-h">آخر التسميعات</div>
            ${hist.map((h, i) => `<button class="tsm-hrow" data-hist="${i}">
                <span>${esc(h.title || '')}</span>
                <span class="tsm-score ${h.score >= 90 ? 'hi' : h.score >= 70 ? 'mid' : 'lo'}">${ar(h.score)}٪</span>
              </button>`).join('')}
          </div>` : ''}
        </div>
      </div>`;
    bindSetup(hist);
  }

  function modelCardHTML() {
    const mb = Math.round(modelStatus.size / 1e6);
    const d = modelStatus.downloading;
    return `
      <div class="tsm-h">نحتاج نموذج التعرّف على التلاوة</div>
      <p class="tsm-p">ينزل مرة وحدة (${ar(mb)} ميجا تقريبًا) ويشتغل بعدها على جهازك بدون إنترنت. صوتك ما يطلع من جهازك أبدًا.</p>
      <div class="tsm-dl" id="tsmDl" ${d ? '' : 'hidden'}>
        <div class="tsm-bar"><span id="tsmBar" style="width:${d ? Math.round((100 * d.done) / d.total) : 0}%"></span></div>
        <div class="tsm-dl-t" id="tsmDlT">${d ? progressText(d) : ''}</div>
      </div>
      <div class="tsm-err" id="tsmErr" hidden></div>
      <div class="btn-row" style="margin-top:16px">
        <button class="btn brand" id="tsmDlBtn" ${d ? 'hidden' : ''}>تنزيل النموذج</button>
        <button class="btn" id="tsmCancel" ${d ? '' : 'hidden'}>إلغاء</button>
      </div>
      <div class="tsm-note" style="margin-top:14px">النموذج مفتوح المصدر من <bdi>Tarteel</bdi>، مدرَّب على تلاوة القرآن الكريم.</div>`;
  }

  function progressText(p) {
    const mb = (x) => ar((x / 1e6).toFixed(0));
    return `${mb(p.done)} من ${mb(p.total)} ميجا`;
  }

  function onProgress(p) {
    if (view !== 'setup' || !host) return;
    const bar = document.getElementById('tsmBar');
    const t = document.getElementById('tsmDlT');
    if (p.error) {
      const e = document.getElementById('tsmErr');
      if (e) { e.hidden = false; e.textContent = 'تعذّر التنزيل: ' + p.error; }
      const b = document.getElementById('tsmDlBtn');
      const c = document.getElementById('tsmCancel');
      if (b) { b.hidden = false; b.textContent = 'إعادة المحاولة'; }
      if (c) c.hidden = true;
      return;
    }
    if (p.finished) { renderSetup(); return; }
    if (bar) bar.style.width = Math.round((100 * p.done) / p.total) + '%';
    if (t) t.textContent = progressText(p);
  }

  function opts(n, sel, from = 1, label = (i) => ar(i)) {
    let o = '';
    for (let i = from; i <= n; i++) o += `<option value="${i}" ${i === sel ? 'selected' : ''}>${label(i)}</option>`;
    return o;
  }

  function setupFormHTML() {
    const m = surahMeta(prefs.surah);
    const J = juzRanges[prefs.juz - 1];
    const tab = (k, t) => `<button class="${prefs.mode === k ? 'active' : ''}" data-mode="${k}">${t}</button>`;
    let body = '';
    if (prefs.mode === 'surah') {
      body = `
        <label>السورة<select id="tsmSurah">${ctx.surahs.map((s) => `<option value="${s.n}" ${s.n === prefs.surah ? 'selected' : ''}>${ar(s.n)}. ${esc(s.name)}</option>`).join('')}</select></label>
        <div class="tsm-range">
          <label>من آية<select id="tsmFrom">${opts(m.ayahs, prefs.from)}</select></label>
          <label>إلى آية<select id="tsmTo">${opts(m.ayahs, prefs.to)}</select></label>
        </div>
        <div class="tsm-quick"><button class="tool-btn" data-t="all">السورة كاملة</button><button class="tool-btn" data-t="ten">عشر آيات</button></div>`;
    } else if (prefs.mode === 'juz') {
      body = `
        <label>الجزء<select id="tsmJuz">${opts(30, prefs.juz, 1, (i) => 'الجزء ' + ar(i))}</select></label>
        <div class="tsm-range">
          <label>من وجه<select id="tsmJFrom">${opts(J[1], prefs.jfrom, J[0])}</select></label>
          <label>إلى وجه<select id="tsmJTo">${opts(Math.min(J[1], prefs.jfrom + MAX_PAGES - 1), prefs.jto, prefs.jfrom)}</select></label>
        </div>
        <div class="tsm-note">الجزء ${ar(prefs.juz)}: الأوجه ${ar(J[0])}–${ar(J[1])}. تقدر تسمّع حتى ${ar(MAX_PAGES)} أوجه في الجلسة.</div>`;
    } else {
      body = `
        <div class="tsm-range">
          <label>من وجه<input id="tsmPFrom" type="number" min="1" max="604" value="${prefs.pfrom}" /></label>
          <label>إلى وجه<input id="tsmPTo" type="number" min="1" max="604" value="${prefs.pto}" /></label>
        </div>
        <div class="tsm-note">الوجه = صفحة من مصحف المدينة (٦٠٤ أوجه).</div>`;
    }
    return `
      <div class="tsm-h">وش تبي تسمّع؟</div>
      <div class="seg tsm-tabs">${tab('surah', 'سورة')}${tab('juz', 'جزء')}${tab('pages', 'أوجه')}</div>
      <div class="tsm-form">
        ${body}
        <div class="tsm-opts">
          ${optRow('tsmReview', 'راجع قبل التسميع', 'يعرض لك المقطع وتقدر تسمعه بصوت قارئ', prefs.review)}
          ${optRow('tsmRetry', 'فرصة ثانية عند الخطأ', 'إذا أخطأت في آية تعيدها، والمصحَّح يظهر بالأخضر الفاتح', prefs.retry)}
          ${optRow('tsmHint', 'أظهر أول كلمة من كل آية', 'تساعدك تتذكّر بداية الآية', prefs.hintFirst)}
        </div>
        <div class="tsm-err" id="tsmErr" hidden></div>
        <button class="btn brand tsm-start" id="tsmStart">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>
          ${prefs.review ? 'راجع ثم سمّع' : 'ابدأ التسميع'}
        </button>
      </div>
      <div class="tsm-foot"><button class="linklike" id="tsmRemove">حذف النموذج من الجهاز</button></div>`;
  }

  function optRow(id, t, d, on) {
    return `<div class="row tsm-opt"><div class="ltext"><div class="lbl">${t}</div><div class="desc">${d}</div></div>
      <label class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}/><span class="track"></span><span class="thumb"></span></label></div>`;
  }

  function bindSetup(hist) {
    const $ = (id) => document.getElementById(id);
    host.querySelectorAll('[data-hist]').forEach((b) => {
      b.onclick = () => { const h = hist[Number(b.dataset.hist)]; if (h && h.passage && modelStatus.installed) begin(h.passage); };
    });
    if (!modelStatus.installed) {
      $('tsmDlBtn').onclick = async () => {
        $('tsmDlBtn').hidden = true;
        $('tsmCancel').hidden = false;
        $('tsmDl').hidden = false;
        $('tsmErr').hidden = true;
        await window.zn.asr.download();
      };
      $('tsmCancel').onclick = () => window.zn.asr.cancel();
      return;
    }
    const rerender = () => { savePrefs(); renderSetup(); };
    host.querySelectorAll('[data-mode]').forEach((b) => { b.onclick = () => { prefs.mode = b.dataset.mode; rerender(); }; });
    const on = (id, fn) => { const el = $(id); if (el) el.onchange = (e) => { fn(e.target); rerender(); }; };
    on('tsmSurah', (t) => {
      prefs.surah = Number(t.value);
      const n = surahMeta(prefs.surah).ayahs;
      prefs.from = 1;
      prefs.to = Math.min(n, n <= 20 ? n : 10);
    });
    on('tsmFrom', (t) => { prefs.from = Number(t.value); if (prefs.to < prefs.from) prefs.to = prefs.from; });
    on('tsmTo', (t) => { prefs.to = Number(t.value); if (prefs.to < prefs.from) prefs.from = prefs.to; });
    on('tsmJuz', (t) => { prefs.juz = Number(t.value); prefs.jfrom = juzRanges[prefs.juz - 1][0]; prefs.jto = prefs.jfrom; });
    on('tsmJFrom', (t) => { prefs.jfrom = Number(t.value); prefs.jto = Math.max(prefs.jfrom, Math.min(prefs.jto, prefs.jfrom + MAX_PAGES - 1)); });
    on('tsmJTo', (t) => { prefs.jto = Number(t.value); });
    on('tsmPFrom', (t) => { prefs.pfrom = clampPage(t.value); prefs.pto = Math.max(prefs.pfrom, Math.min(prefs.pto, prefs.pfrom + MAX_PAGES - 1)); });
    on('tsmPTo', (t) => { prefs.pto = Math.max(prefs.pfrom, Math.min(clampPage(t.value), prefs.pfrom + MAX_PAGES - 1)); });
    const sw = (id, k) => { const el = $(id); if (el) el.onchange = () => { prefs[k] = el.checked; savePrefs(); if (k === 'review') renderSetup(); }; };
    sw('tsmReview', 'review');
    sw('tsmRetry', 'retry');
    sw('tsmHint', 'hintFirst');
    host.querySelectorAll('[data-t="all"],[data-t="ten"]').forEach((b) => {
      b.onclick = () => {
        const n = surahMeta(prefs.surah).ayahs;
        if (b.dataset.t === 'all') { prefs.from = 1; prefs.to = n; } else { prefs.to = Math.min(n, prefs.from + 9); }
        rerender();
      };
    });
    $('tsmStart').onclick = async () => begin(await passageFromPrefs());
    $('tsmRemove').onclick = async () => {
      if (!confirm('تحذف نموذج التسميع من جهازك؟ تقدر تنزّله مرة ثانية متى ما بغيت.')) return;
      await window.zn.asr.remove();
      renderSetup();
    };
  }

  const clampPage = (v) => Math.min(604, Math.max(1, parseInt(v, 10) || 1));

  async function passageFromPrefs() {
    if (prefs.mode === 'surah') {
      const a = await window.zn.pageOf(prefs.surah, prefs.from);
      const b = await window.zn.pageOf(prefs.surah, prefs.to);
      const m = surahMeta(prefs.surah);
      return {
        kind: 'free', pageFrom: a, pageTo: b,
        range: { s: prefs.surah, from: prefs.from, to: prefs.to },
        title: `سورة ${m.name}${prefs.from === 1 && prefs.to === m.ayahs ? '' : prefs.from === prefs.to ? '، آية ' + ar(prefs.from) : '، الآيات ' + ar(prefs.from) + '–' + ar(prefs.to)}`,
      };
    }
    const [a, b] = prefs.mode === 'juz' ? [prefs.jfrom, prefs.jto] : [prefs.pfrom, prefs.pto];
    return { kind: 'free', pageFrom: a, pageTo: Math.min(b, a + MAX_PAGES - 1), range: null, title: pagesText(a, b) };
  }

  /* ═══════════ تجهيز المقطع ═══════════ */
  async function begin(P) {
    if (!(await window.zn.asr.status()).installed) { view = 'setup'; return renderSetup(); }
    const pages = [];
    for (let p = P.pageFrom; p <= P.pageTo; p++) pages.push(await window.zn.pageLines(p));
    const inRange = (s, v) => !P.range || (s === P.range.s && v >= P.range.from && v <= P.range.to);
    const words = [];
    const ayahs = [];
    const index = new Map();
    for (const pg of pages) {
      for (const l of pg.lines) {
        if (!l || !l.w) continue;
        for (const [s, v, pos, t] of l.w) {
          if (!pos || !inRange(s, v)) continue;
          let a = ayahs[ayahs.length - 1];
          if (!a || a.s !== s || a.v !== v) { a = { s, v, start: words.length, end: words.length }; ayahs.push(a); }
          index.set(`${s}:${v}:${pos}`, words.length);
          words.push({ w: t, sk: M.skel(t), s, v, pos, first: pos === 1 });
          a.end = words.length;
        }
      }
    }
    if (!words.length) return;
    session = {
      P, pages, words, ayahs, index, inRange,
      committed: [], openHyp: [], busy: false,
      result: null, hints: new Set(), overrides: new Set(), fixed: new Set(),
      retry: null, retryMsg: null,
      startedAt: Date.now(), hintFirst: prefs.hintFirst, retryOn: prefs.retry,
    };
    if ((prefs.review || P.forceReview) && !P.noReview) {
      view = 'review';
      return renderReview();
    }
    return startSession();
  }

  function juzLabel(n) {
    return 'الجزء ' + ar(n);
  }

  /** يرسم صفحات المقطع بشكل المصحف؛ cls(i) يحدد صنف كل كلمة داخل المقطع. */
  function pagesHTML(S) {
    return S.pages.map((p) => MV.html(p, {
      juzName: juzLabel(p.juz),
      wordClass: (s, v, pos) => (S.inRange(s, v) ? 'w-in' : 'w-out'),
    })).join('');
  }

  function collectSpans(S, box) {
    S.spans = new Array(S.words.length);
    for (const el of box.querySelectorAll('.mw.w-in')) {
      const i = S.index.get(`${el.dataset.s}:${el.dataset.v}:${el.dataset.p}`);
      if (i != null) S.spans[i] = el;
    }
    S.ends = [...box.querySelectorAll('.mw-end')];
  }

  /* ═══════════ راجع قبل التسميع ═══════════ */
  function renderReview() {
    const S = session;
    host.innerHTML = `
      <div class="tsm-top">
        <div>
          <div class="page-title">راجع قبل التسميع</div>
          <div class="page-sub">${esc(S.P.title)}، ${ar(S.words.length)} كلمة</div>
        </div>
        <div class="tsm-actions">
          <select id="tsmReciter" title="القارئ">${RECITERS.map(([k, n]) => `<option value="${k}" ${k === prefs.reciter ? 'selected' : ''}>${n}</option>`).join('')}</select>
          <button class="tool-btn" id="tsmListen">▶ استمع</button>
          <button class="tool-btn" id="tsmBackSetup">رجوع</button>
          <button class="btn brand" id="tsmGo">جاهز، ابدأ التسميع</button>
        </div>
      </div>
      <div class="tsm-live tsm-review-bar"><span id="tsmTimer">٠٠:٠٠</span><span class="tsm-status" id="tsmStatus">اقرأ المقطع وتأمّله، وإذا جهزت ابدأ التسميع. الاستماع يحتاج إنترنت.</span></div>
      <div class="mushaf-stage tsm-board" id="tsmBoard">${pagesHTML(S)}</div>`;
    const box = document.getElementById('tsmBoard');
    MV.autoFit(box);
    const t0 = Date.now();
    const tm = setInterval(() => {
      const el = document.getElementById('tsmTimer');
      if (!el || view !== 'review') return clearInterval(tm);
      const s = Math.floor((Date.now() - t0) / 1000);
      el.textContent = ar(String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'));
    }, 1000);
    document.getElementById('tsmReciter').onchange = (e) => { prefs.reciter = e.target.value; savePrefs(); if (player) { stopPlayer(); listen(); } };
    document.getElementById('tsmListen').onclick = () => (player ? stopPlayer() : listen());
    document.getElementById('tsmBackSetup').onclick = () => { stopPlayer(); view = 'setup'; session = null; renderSetup(); };
    document.getElementById('tsmGo').onclick = () => { stopPlayer(); startSession(); };
  }

  function listen() {
    const S = session;
    const btn = document.getElementById('tsmListen');
    const queue = S.ayahs.map((a) => a);
    const audio = new Audio();
    player = { audio, i: 0 };
    if (btn) btn.textContent = '■ إيقاف';
    const mark = (a) => {
      for (const el of document.querySelectorAll('.playing')) el.classList.remove('playing');
      if (!a) return;
      const sel = `[data-s="${a.s}"][data-v="${a.v}"]`;
      const els = document.querySelectorAll('.mw' + sel + ',.mw-end' + sel);
      els.forEach((el) => el.classList.add('playing'));
      if (els[0]) els[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    const next = () => {
      if (!player || player.audio !== audio) return;
      const a = queue[player.i++];
      if (!a) { stopPlayer(); return; }
      mark(a);
      audio.src = `https://everyayah.com/data/${prefs.reciter}/${String(a.s).padStart(3, '0')}${String(a.v).padStart(3, '0')}.mp3`;
      audio.play().catch(() => {
        const st = document.getElementById('tsmStatus');
        if (st) st.textContent = 'تعذّر تشغيل الصوت، تأكد من الاتصال بالإنترنت.';
        stopPlayer();
      });
    };
    audio.onended = next;
    audio.onerror = () => {
      const st = document.getElementById('tsmStatus');
      if (st) st.textContent = 'تعذّر تحميل التلاوة، تأكد من الاتصال بالإنترنت.';
      stopPlayer();
    };
    next();
  }

  function stopPlayer() {
    if (!player) return;
    try { player.audio.pause(); } catch (_) {}
    player = null;
    for (const el of document.querySelectorAll('.playing')) el.classList.remove('playing');
    const btn = document.getElementById('tsmListen');
    if (btn) btn.textContent = '▶ استمع';
  }

  /* ═══════════ الجلسة ═══════════ */
  async function startSession() {
    const S = session;
    view = 'session';
    renderSession();
    const [eng] = await Promise.all([
      window.zn.asr.warmup(),
      startRecording().catch((e) => { showMicError(e); throw e; }),
    ]).catch(() => [null]);
    if (session !== S || view !== 'session') return;
    if (!eng || !eng.ok) {
      setStatus('تعذّر تشغيل محرّك التسميع' + (eng && eng.error ? ': ' + eng.error : ''), 'err');
      stopRecording();
      return;
    }
    setStatus('أسمعك… ابدأ القراءة', 'listen');
  }

  function renderSession() {
    const S = session;
    host.innerHTML = `
      <div class="tsm-top">
        <div>
          <div class="page-title">${esc(S.P.title)}</div>
          <div class="page-sub">${ar(S.words.length)} كلمة${S.retryOn ? '، مع فرصة ثانية عند الخطأ' : ''}</div>
        </div>
        <div class="tsm-actions">
          <button class="tool-btn" id="tsmHintBtn" title="اكشف الكلمة الجاية">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>
            تلميح
          </button>
          <button class="tool-btn" id="tsmPause">إيقاف مؤقت</button>
          <button class="btn brand" id="tsmFinish">إنهاء وعرض النتيجة</button>
        </div>
      </div>
      <div class="tsm-live">
        <div class="tsm-mic" id="tsmMic"><span></span></div>
        <div class="tsm-status" id="tsmStatus">جارٍ تجهيز المايكروفون والمحرّك…</div>
        <div class="tsm-prog"><span id="tsmProg"></span></div>
      </div>
      <div class="tsm-retry" id="tsmRetry" hidden></div>
      <div class="mushaf-stage tsm-board" id="tsmBoard">${pagesHTML(S)}</div>`;
    document.getElementById('tsmHintBtn').onclick = giveHint;
    document.getElementById('tsmPause').onclick = togglePause;
    document.getElementById('tsmFinish').onclick = finish;
    const box = document.getElementById('tsmBoard');
    collectSpans(S, box);
    MV.autoFit(box);
    paint();
    paintRetry();
    if (rec) setStatus(rec.paused ? 'متوقّف مؤقتًا' : 'أسمعك…', rec.paused ? 'idle' : 'listen');
  }

  function ayahOf(i) {
    const S = session;
    return S.ayahs.find((a) => i >= a.start && i < a.end);
  }

  function wordState(S, i) {
    const res = S.result ? S.result.words : null;
    const r = res ? res[i] : { state: 'pending' };
    const reached = S.result ? S.result.reached : 0;
    const inRetry = S.retry && i >= S.retry.a.start && i < S.retry.a.end;
    if (S.overrides.has(i)) return 'w-ok';
    if (S.fixed.has(i) || (S.selfFixed && S.selfFixed.has(i))) return 'w-fixed';
    if (r.state === 'ok' && i < reached) return S.hints.has(i) ? 'w-hint' : 'w-ok';
    if (r.state === 'wrong') return inRetry ? 'w-retry' : 'w-bad';
    if (r.state === 'missed' && i < reached) return inRetry ? 'w-retry' : 'w-miss';
    if (S.hints.has(i)) return 'w-hint';
    if (S.hintFirst && S.words[i].first) return 'w-peek';
    return view === 'result' ? 'w-miss' : 'w-hidden';
  }

  function paint() {
    const S = session;
    if (!S || !S.spans) return;
    const reached = S.result ? S.result.reached : 0;
    const res = S.result ? S.result.words : [];
    S.spans.forEach((el, i) => {
      if (!el) return;
      let cls = 'mw w-in ' + wordState(S, i);
      if (view === 'session' && i === reached && !S.retry) cls += ' w-next';
      el.className = cls;
      const r = res[i];
      el.title = r && r.state === 'wrong' && !S.fixed.has(i) && !S.overrides.has(i) ? `قلت: «${r.said}»` : '';
    });
    const prog = document.getElementById('tsmProg');
    if (prog) prog.style.width = Math.round((100 * reached) / S.words.length) + '%';
    if (view === 'session') {
      const cur = S.spans[S.retry ? S.retry.a.start : reached];
      if (cur) cur.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function paintRetry() {
    const S = session;
    const el = document.getElementById('tsmRetry');
    if (!el || !S) return;
    if (S.retry) {
      el.hidden = false;
      el.className = 'tsm-retry ask';
      el.innerHTML = `<b>فيه خطأ في الآية ${ar(S.retry.a.v)}</b> — أعد قراءتها من أولها، وما تصحّحه يتلوّن بالأخضر الفاتح.
        <button class="tool-btn" id="tsmSkip">تخطَّ</button>`;
      document.getElementById('tsmSkip').onclick = () => { S.retry.a.retried = true; S.retry = null; S.retryMsg = null; paint(); paintRetry(); };
    } else if (S.retryMsg) {
      el.hidden = false;
      el.className = 'tsm-retry ' + S.retryMsg.kind;
      el.textContent = S.retryMsg.text;
    } else {
      el.hidden = true;
    }
  }

  function setStatus(text, kind) {
    const el = document.getElementById('tsmStatus');
    const mic = document.getElementById('tsmMic');
    if (el) el.textContent = text;
    if (mic) mic.className = 'tsm-mic ' + (kind || '');
  }

  function giveHint() {
    const S = session;
    if (!S) return;
    const at = S.retry ? S.retry.a.start : S.result ? S.result.reached : 0;
    for (let i = at; i < S.words.length; i++) {
      if (!S.hints.has(i) && wordState(S, i) !== 'w-ok') { S.hints.add(i); break; }
    }
    paint();
  }

  function togglePause() {
    if (!rec) return;
    rec.paused = !rec.paused;
    const b = document.getElementById('tsmPause');
    if (b) b.textContent = rec.paused ? 'استئناف' : 'إيقاف مؤقت';
    if (rec.paused) transcribeOpen(false);
    setStatus(rec.paused ? 'متوقّف مؤقتًا' : 'أسمعك…', rec.paused ? 'idle' : 'listen');
  }

  /* ───────── تنظيف القراءة ───────── */
  const LEAD = ['أعوذ بالله من الشيطان الرجيم', 'بسم الله الرحمن الرحيم'].map((t) => M.hypWords(t).map((w) => w.sk));
  const TAIL = M.hypWords('صدق الله العظيم').map((w) => w.sk);

  function startsWith(arr, seq, at) {
    if (arr.length - at < seq.length) return false;
    for (let k = 0; k < seq.length; k++) if (!M.same(seq[k], arr[at + k].sk)) return false;
    return true;
  }

  /** يحذف الاستعاذة والبسملة في البداية (إن لم تكن من المقطع) و«صدق الله العظيم» في النهاية. */
  function cleanHyp(hyp, S) {
    let at = 0;
    const startsWithBasmala = S.words[0] && S.words[0].s === 1 && S.words[0].v === 1;
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 0; k < LEAD.length; k++) {
        if (k === 1 && startsWithBasmala) continue;
        if (startsWith(hyp, LEAD[k], at)) at += LEAD[k].length;
      }
    }
    let end = hyp.length;
    if (end - at >= TAIL.length && startsWith(hyp, TAIL, end - TAIL.length)) end -= TAIL.length;
    return hyp.slice(at, end);
  }

  function fullHyp(S) {
    return cleanHyp(S.committed.concat(S.openHyp), S);
  }

  /** بعد تثبيت آية: فيها خطأ؟ اطلب إعادتها مرة واحدة. */
  function checkRetry() {
    const S = session;
    if (!S.retryOn || S.retry || !S.result || S.finishing) return;
    // الآيات المثبّتة فقط: لو الآية ما زالت في المقطع المفتوح، صوتها لم يُحسم بعد
    const done = M.align(S.words, cleanHyp(S.committed, S)).reached;
    for (const a of S.ayahs) {
      if (a.end > done) break;
      if (a.checked) continue;
      a.checked = true;
      const errs = [];
      for (let i = a.start; i < a.end; i++) {
        const st = S.result.words[i].state;
        if ((st === 'wrong' || st === 'missed') && !S.hints.has(i)) errs.push(i);
      }
      if (errs.length && !a.retried) {
        S.retry = { a, errs };
        S.retryMsg = null;
        paintRetry();
        return;
      }
    }
  }

  /**
   * تصحيح ذاتي: قال كلمة غلط ثم صحّحها بنفسه («مالك يوم الدنيا… الدين»).
   * المحاذاة تعتبر الغلط «كلمة زائدة» قبل الصحيحة — نلوّن الصحيحة بالأخضر الفاتح.
   * التكرار لكلمات صحيحة (تردّد) لا يُحسب خطأ.
   */
  function selfFixes(S) {
    const out = new Set();
    if (!S.result || !S.result.ins) return out;
    const committedReach = M.align(S.words, cleanHyp(S.committed, S)).reached;
    for (const x of S.result.ins) {
      if (x.at >= committedReach || x.at >= S.words.length || x.sk.length < 2) continue;
      let near = false;
      for (let k = Math.max(0, x.at - 4); k < Math.min(S.words.length, x.at + 3); k++) if (M.same(S.words[k].sk, x.sk)) near = true;
      if (!near && S.result.words[x.at].state === 'ok') out.add(x.at);
    }
    return out;
  }

  function realign() {
    const S = session;
    S.result = M.align(S.words, fullHyp(S));
    S.selfFixed = selfFixes(S);
    if (S.finishing) return;
    checkRetry();
    paint();
    if (S.result.reached >= S.words.length && !S.busy && !S.retry && !(rec && rec.frames.length)) {
      setTimeout(() => { if (session === S && view === 'session' && !S.busy && !S.retry) finish(); }, 900);
    }
  }

  /**
   * محاولة الإعادة: نقارن ما قرأه الآن بالآية وحدها.
   * يعيد true إن عولجت (أو ما زالت تنتظر تكملة)، وfalse إن كان المستخدم قد تجاوزها وأكمل.
   */
  function handleRetry(hyp, n, r0, force) {
    const S = session;
    const { a, errs } = S.retry;
    const ref = S.words.slice(a.start, a.end);
    const h = cleanHyp(hyp, S);
    // تجاوز الآية وبدأ ما بعدها؟ (لا يطابق بداية الآية المطلوبة)
    const k = Math.min(2, ref.length);
    let looksLikeRetry = h.length > 0;
    for (let j = 0; j < k && j < h.length; j++) if (!M.same(ref[j].sk, h[j].sk)) looksLikeRetry = false;
    if (!looksLikeRetry) {
      a.retried = true;
      S.retry = null;
      S.retryMsg = null;
      paintRetry();
      return false;
    }
    const rr = M.align(ref, h);
    const complete = rr.reached >= ref.length || force || n * (FRAME / RATE) >= COMMIT_LEN;
    if (!complete) return true; // ينتظر بقية الآية
    let fixedNow = 0;
    for (const i of errs) if (rr.words[i - a.start].state === 'ok') { S.fixed.add(i); fixedNow++; }
    // ما قرأه بعد نهاية الآية المعادة (بدأ الآية التالية في نفس النَّفَس) لا يضيع
    const rest = (rr.ins || []).filter((x) => x.at >= ref.length).map((x) => ({ text: x.text, sk: x.sk }));
    if (rest.length) S.committed.push(...rest);
    a.retried = true;
    S.retry = null;
    S.retryMsg = fixedNow === errs.length
      ? { kind: 'good', text: `أحسنت! صحّحت الآية ${ar(a.v)} ✓ أكمل من بعدها.` }
      : { kind: 'bad', text: `ما زال في الآية ${ar(a.v)} خطأ، وانكشف لك بالأحمر. أكمل من بعدها.` };
    r0.frames.splice(0, n);
    S.openHyp = [];
    paintRetry();
    realign();
    setTimeout(() => { if (session === S && S.retryMsg && !S.retry) { S.retryMsg = null; paintRetry(); } }, 5000);
    return true;
  }

  async function transcribeOpen(force) {
    const S = session;
    if (!S) return;
    const r0 = rec || S.lastRec;
    if (!r0 || !r0.frames.length) return;
    if (S.busy) { S.dirty = true; return; }
    // سكوت فقط؟ لا نرسله: النموذج «يتخيّل» كلمات على السكوت
    const thr = Math.max(0.012, (r0.floor || 0.004) * 3.2);
    let voicedFrames = 0;
    for (const f of r0.frames) {
      let e = 0;
      for (let i = 0; i < f.length; i += 4) e += f[i] * f[i];
      if (Math.sqrt(e / (f.length / 4)) > thr) voicedFrames++;
    }
    if (voicedFrames < 3) {
      if (force || !r0.speaking) r0.frames.length = 0;
      return;
    }
    S.busy = true;
    const n = r0.frames.length;
    const audio = new Float32Array(n * FRAME);
    for (let k = 0; k < n; k++) audio.set(r0.frames[k], k * FRAME);
    if (!S.finishing) setStatus('أراجع اللي قريته…', 'busy');
    const r = await window.zn.asr.transcribe(audio);
    if (session !== S) return;
    if (r.ok) {
      const hyp = M.hypWords(r.text || '');
      if (S.test) (S.dbg = S.dbg || []).push({ n, retry: S.retry ? S.retry.a.v : null, text: r.text, reached: S.result && S.result.reached });
      if (S.retry && !S.finishing && handleRetry(hyp, n, r0, force)) {
        S.busy = false;
      } else {
        S.openHyp = hyp;
        S.result = M.align(S.words, fullHyp(S));
        // فيه خطأ في هذا المقطع؟ أعد السماع مرة بحشوة سكوت (النموذج غير ثابت عند الحواف)
        // ونأخذ الأقرب للمصحف. خطأ القارئ الحقيقي يظهر في المحاولتين فلا يُخفى.
        const base = M.align(S.words, cleanHyp(S.committed, S)).reached;
        if (S.result.words.slice(base, S.result.reached).some((x) => x.state !== 'ok')) {
          const pad = new Float32Array(audio.length + RATE);
          pad.set(audio, RATE / 2);
          const r2 = await window.zn.asr.transcribe(pad);
          if (session !== S) return;
          if (r2.ok) {
            const alt = M.hypWords(r2.text || '');
            const res2 = M.align(S.words, cleanHyp(S.committed.concat(alt), S));
            if (res2.cost < S.result.cost) { S.openHyp = alt; S.result = res2; }
          }
        }
        S.busy = false;
        const atAyahEnd = S.ayahs.some((a) => a.end === S.result.reached);
        const long = n * (FRAME / RATE) >= COMMIT_LEN;
        if (force || atAyahEnd || long) {
          S.committed.push(...S.openHyp);
          S.openHyp = [];
          r0.frames.splice(0, n); // ما وصل أثناء المعالجة يبقى بداية المقطع التالي
        }
        realign();
      }
    } else {
      S.busy = false;
      if (!S.finishing) setStatus('خطأ في التعرّف: ' + r.error, 'err');
    }
    if (S.dirty) {
      S.dirty = false;
      if (r0.frames.length) return transcribeOpen(force);
    }
    if (!S.finishing && view === 'session' && rec) setStatus(rec.paused ? 'متوقّف مؤقتًا' : 'أسمعك…', rec.paused ? 'idle' : 'listen');
  }

  /* ═══════════ النتيجة ═══════════ */
  async function finish() {
    const S = session;
    if (!S || S.finishing) return;
    S.finishing = true;
    S.retry = null;
    stopRecording();
    setStatus('أراجع آخر مقطع…', 'busy');
    const until = Date.now() + 30000;
    while (S.busy && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
    if (S.lastRec && S.lastRec.frames.length) await transcribeOpen(true);
    S.result = M.align(S.words, fullHyp(S));
    S.committed = S.committed.concat(S.openHyp);
    S.openHyp = [];
    S.selfFixed = selfFixes(S);
    if (session !== S) return;
    view = 'result';
    S.sc = score(S);
    if (!S.test) {
      saveHistory(S, S.sc);
      S.hifz = await window.zn.hifz.record({
        kind: S.P.kind, from: S.P.pageFrom, to: S.P.pageTo, score: S.sc.pct,
        mins: Math.round((Date.now() - S.startedAt) / 60000), wholePages: !S.P.range,
      });
    }
    renderResult();
  }

  function score(S) {
    const res = S.result ? S.result.words : [];
    const reached = S.result ? S.result.reached : 0;
    let ok = 0, wrong = 0, missed = 0, hinted = 0, fixed = 0;
    S.words.forEach((_, i) => {
      const r = res[i] || { state: 'pending' };
      if (S.overrides.has(i)) { ok++; return; }
      if (S.hints.has(i)) { hinted++; return; }
      if (S.fixed.has(i) || (S.selfFixed && S.selfFixed.has(i))) { fixed++; return; }
      if (r.state === 'ok' && i < reached) ok++;
      else if (r.state === 'wrong') wrong++;
      else missed++;
    });
    // المصحَّح بعد الخطأ نصف درجة: حفظته لكن تحتاج تثبيت
    const pct = Math.round((100 * (ok + fixed * 0.5)) / S.words.length);
    return { ok, wrong, missed, hinted, fixed, total: S.words.length, pct };
  }

  function renderResult() {
    const S = session;
    const sc = S.sc || score(S);
    const mins = Math.max(1, Math.round((Date.now() - S.startedAt) / 60000));
    const thr = (S.hifz && S.hifz.plan && S.hifz.plan.threshold) || 80;
    const passed = sc.pct >= thr;
    const msg = sc.pct >= 95 ? 'ما شاء الله، حفظ متقن' : sc.pct >= 80 ? 'ممتاز، بقي شوي وتضبطه' : sc.pct >= 50 ? 'جيد، يحتاج مراجعة' : 'راجع المقطع وأعد التسميع';
    const kindNote = S.P.kind === 'new'
      ? (passed ? `✓ انحسبت ${pagesText(S.P.pageFrom, S.P.pageTo)} محفوظة` : `تحتاج ${ar(thr)}٪ عشان تنحسب محفوظة، أعد التسميع`)
      : S.P.kind === 'review' ? (passed ? '✓ انحسبت مراجعة اليوم' : 'المراجعة تحتاج تثبيت، ستعود لك قريبًا')
        : S.P.kind === 'challenge' ? (sc.pct >= 90 ? '🎯 أنجزت تحدي اليوم!' : 'التحدي يحتاج ٩٠٪، جرّب مرة ثانية') : '';
    host.innerHTML = `
      <div class="tsm-top">
        <div>
          <div class="page-title">نتيجة التسميع</div>
          <div class="page-sub">${esc(S.P.title)}، ${mins === 1 ? 'دقيقة' : ar(mins) + ' دقائق'}</div>
        </div>
        <div class="tsm-actions">
          ${S.P.kind !== 'free' ? '<button class="tool-btn" id="tsmToHifz">رجوع لحفظي</button>' : '<button class="tool-btn" id="tsmBack">مقطع آخر</button>'}
          <button class="btn brand" id="tsmAgain">أعد التسميع</button>
        </div>
      </div>
      <div class="tsm-result">
        <div class="card tsm-scorecard">
          <div class="tsm-ring ${sc.pct >= 90 ? 'hi' : sc.pct >= 70 ? 'mid' : 'lo'}" style="--p:${sc.pct}">
            <div><b>${ar(sc.pct)}٪</b><span>إتقان</span></div>
          </div>
          <div class="tsm-msg">${msg}</div>
          ${kindNote ? `<div class="tsm-kind ${passed ? 'ok' : ''}">${kindNote}</div>` : ''}
          <div class="tsm-stats">
            <div><b class="ok">${ar(sc.ok)}</b><span>صحيحة</span></div>
            <div><b class="fixed">${ar(sc.fixed)}</b><span>صحّحتها</span></div>
            <div><b class="bad">${ar(sc.wrong)}</b><span>خطأ</span></div>
            <div><b class="miss">${ar(sc.missed)}</b><span>فاتتك</span></div>
            <div><b class="hint">${ar(sc.hinted)}</b><span>تلميح</span></div>
          </div>
          <div class="tsm-note">النموذج أحيانًا يسمع غلط. لو كلمة حمراء وأنت قريتها صح، اضغط عليها.</div>
        </div>
        <div class="mushaf-stage tsm-board" id="tsmBoard">${pagesHTML(S)}</div>
      </div>`;
    const box = document.getElementById('tsmBoard');
    collectSpans(S, box);
    MV.autoFit(box);
    paint();
    box.onclick = async (e) => {
      const el = e.target.closest('.w-bad,.w-miss,.w-ok');
      if (!el) return;
      const i = S.index.get(`${el.dataset.s}:${el.dataset.v}:${el.dataset.p}`);
      if (i == null) return;
      if (el.classList.contains('w-ok') && !S.overrides.has(i)) return;
      if (S.overrides.has(i)) S.overrides.delete(i); else S.overrides.add(i);
      S.sc = score(S);
      if (!S.test) {
        S.hifz = await window.zn.hifz.record({ kind: S.P.kind, from: S.P.pageFrom, to: S.P.pageTo, score: S.sc.pct, mins: 0, wholePages: !S.P.range, amend: true });
        saveHistory(S, S.sc);
      }
      renderResult();
    };
    const back = document.getElementById('tsmBack');
    if (back) back.onclick = () => { view = 'setup'; session = null; renderSetup(); };
    const toH = document.getElementById('tsmToHifz');
    if (toH) toH.onclick = () => { view = 'setup'; session = null; window.goRoute('hifz'); };
    document.getElementById('tsmAgain').onclick = () => begin(Object.assign({}, S.P, { noReview: true }));
  }

  function saveHistory(S, sc) {
    const list = loadJSON(HISTORY_KEY, []).filter((h) => h.id !== S.startedAt);
    list.unshift({ id: S.startedAt, title: S.P.title, passage: Object.assign({}, S.P, { kind: 'free', noReview: false }), score: sc.pct, at: Date.now() });
    saveJSON(HISTORY_KEY, list.slice(0, 50));
  }

  /* ═══════════ التسجيل وكشف الوقفات ═══════════ */
  const RATE = 16000;
  const FRAME = 2048; // 128ms
  const PAUSE = 0.6; // ثانية سكوت = وقفة → نعيد السماع
  const TRAIL = 1.0; // نحتفظ بثانية سكوت بعد الكلام ثم نتوقف عن التخزين
  const COMMIT_LEN = 20; // مقطع مفتوح أطول من هذا يُثبَّت عند أقرب وقفة
  const HARD_MAX = 27; // حد النموذج ٣٠ ثانية
  const PRE_ROLL = 3;

  function newRec(extra) {
    return Object.assign({ paused: false, frames: [], ring: [], speaking: false, silentFor: 99, floor: 0.004, level: 0 }, extra);
  }

  let startRecording = async function () {
    stopRecording();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const ac = new AudioContext({ sampleRate: RATE });
    const src = ac.createMediaStreamSource(stream);
    const proc = ac.createScriptProcessor(FRAME, 1, 1);
    const mute = ac.createGain();
    mute.gain.value = 0;
    src.connect(proc);
    proc.connect(mute);
    mute.connect(ac.destination);
    rec = newRec({ stream, ac, proc });
    proc.onaudioprocess = (e) => {
      if (!rec || rec.paused) return;
      onFrame(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    meterLoop();
  };

  function onFrame(f) {
    let sum = 0;
    for (let i = 0; i < f.length; i++) sum += f[i] * f[i];
    const rms = Math.sqrt(sum / f.length);
    rec.level = rms;
    rec.floor = rms < rec.floor ? rms * 0.5 + rec.floor * 0.5 : rec.floor * 0.995 + rms * 0.005;
    const voiced = rms > Math.max(0.012, rec.floor * 3.2);
    const sec = FRAME / RATE;
    if (voiced) {
      if (!rec.speaking) {
        rec.speaking = true;
        if (rec.silentFor >= TRAIL) rec.frames.push(...rec.ring);
      }
      rec.silentFor = 0;
      rec.ring = [];
      rec.frames.push(f);
    } else {
      rec.silentFor += sec;
      if (rec.silentFor < TRAIL) {
        if (rec.frames.length) rec.frames.push(f);
      } else {
        rec.ring.push(f);
        if (rec.ring.length > PRE_ROLL) rec.ring.shift();
      }
      if (rec.speaking && rec.silentFor >= PAUSE) {
        rec.speaking = false;
        transcribeOpen(false);
      }
    }
    if (rec.frames.length * sec >= HARD_MAX && session && !session.busy) transcribeOpen(true);
  }

  function meterLoop() {
    const mic = document.getElementById('tsmMic');
    if (!rec) return;
    if (mic) mic.style.setProperty('--lv', (rec.paused ? 0 : Math.min(1, rec.level * 14)).toFixed(3));
    rec.raf = requestAnimationFrame(meterLoop);
  }

  function stopRecording() {
    if (!rec) return;
    const r = rec;
    rec = null;
    if (session) session.lastRec = r;
    cancelAnimationFrame(r.raf);
    try { r.proc.disconnect(); } catch (_) {}
    try { r.stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
    try { r.ac.close(); } catch (_) {}
  }

  function showMicError(e) {
    const name = e && e.name;
    const text = name === 'NotAllowedError' || name === 'SecurityError'
      ? 'ويندوز مانع الوصول للمايكروفون. افتح إعدادات ويندوز ← الخصوصية والأمان ← الميكروفون، وفعّل «السماح لتطبيقات سطح المكتب».'
      : name === 'NotFoundError'
        ? 'ما لقيت مايكروفون موصول بالجهاز.'
        : 'تعذّر تشغيل المايكروفون: ' + ((e && e.message) || name || e);
    setStatus(text, 'err');
  }

  /** للاختبار الآلي: يغذّي صوتًا مسجّلًا بدل المايكروفون (نفس مسار كشف الوقفات). */
  async function _test(passage, b64, speed = 32) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const audio = new Float32Array(bytes.buffer);
    const realStart = startRecording;
    startRecording = async () => { rec = newRec({ proc: { disconnect() {} }, stream: { getTracks: () => [] }, ac: { close() {} } }); };
    await begin(Object.assign({ kind: 'free', noReview: true, title: 'اختبار' }, passage));
    session.test = true;
    startRecording = realStart;
    for (let k = 0; k + FRAME <= audio.length && rec; k += FRAME) {
      onFrame(audio.slice(k, k + FRAME));
      await new Promise((r) => setTimeout(r, speed));
    }
    for (let k = 0; k < 10 && rec; k++) onFrame(new Float32Array(FRAME));
    const until = Date.now() + 60000;
    while (session && view === 'session' && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 200));
      if (session && !session.busy && view === 'session') await finish();
    }
    const S = session;
    return { dbg: S && S.dbg, sc: S && S.sc, fixed: S && S.fixed.size, states: S && S.result && S.result.words.map((w) => w.state[0]).join('') };
  }

  window.Tasmee = { render, leave, start, _test, _debug: () => ({ session, rec: !!rec, view }) };
})();
