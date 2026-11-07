'use strict';
/*
 * tasmee.js — صفحة التسميع: يقرأ المستخدم من حفظه، والتطبيق يسمع ويقارن بالمصحف.
 *
 * التدفّق:
 *   مايكروفون → AudioContext بتردد 16kHz → كشف السكتات (بين الآيات عادةً)
 *   → كل مقطع يُرسل لمحرّك التعرّف (asr.js) → النص يُضاف للقراءة
 *   → محاذاة القراءة كاملة مع المقطع المختار (match.js) → كشف الكلمات تدريجيًا.
 */
(function () {
  const M = window.TasmeeMatch;
  const HISTORY_KEY = 'zn-tasmee-history';
  const PREFS_KEY = 'zn-tasmee-prefs';
  const MAX_AYAHS = 60;

  let host = null; // عنصر الصفحة
  let ctx = null; // {state, esc, ar, surahs}
  let view = 'setup'; // setup | session | result
  let session = null;
  let rec = null; // التسجيل الجاري
  let unProgress = null;

  const esc = (s) => ctx.esc(s);
  const ar = (s) => ctx.ar(s);

  /* ───────── تفضيلات وسجل ───────── */
  function loadJSON(key, def) {
    try { return JSON.parse(localStorage.getItem(key)) || def; } catch (_) { return def; }
  }
  function saveJSON(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (_) {}
  }
  const prefs = Object.assign({ surah: 112, from: 1, to: 4, hintFirst: false }, loadJSON(PREFS_KEY, {}));

  function surahMeta(n) {
    return (ctx.surahs || []).find((s) => s.n === Number(n)) || { n, name: '', ayahs: 1 };
  }

  /* ───────── الدخول والخروج ───────── */
  async function render(el, c) {
    host = el;
    ctx = c;
    if (!ctx.surahs) ctx.surahs = await window.zn.surahs();
    if (!unProgress) unProgress = window.zn.asr.onProgress(onProgress);
    if (view === 'session' && session) return renderSession();
    if (view === 'result' && session) return renderResult();
    view = 'setup';
    return renderSetup();
  }

  function leave() {
    stopRecording();
    if (view === 'session') view = 'setup';
    window.zn.asr.release();
  }

  /* ═══════════ شاشة الإعداد ═══════════ */
  let modelStatus = null;

  async function renderSetup() {
    modelStatus = await window.zn.asr.status();
    const m = surahMeta(prefs.surah);
    const hist = loadJSON(HISTORY_KEY, []).slice(0, 6);

    host.innerHTML = `
      <div class="page-head">
        <div class="page-title">التسميع</div>
        <div class="page-sub">اقرأ من حفظك، والتطبيق يسمعك ويصحّح لك كلمة كلمة — بدون إنترنت</div>
      </div>
      <div class="tsm-grid">
        <div class="card tsm-setup">
          ${modelStatus.installed ? setupFormHTML(m) : modelCardHTML()}
        </div>
        <div class="tsm-side">
          <div class="card tsm-how">
            <div class="tsm-h">كيف يشتغل؟</div>
            <ol>
              <li>اختر السورة والآيات اللي تبي تسمّعها.</li>
              <li>اضغط «ابدأ» واقرأ بصوت واضح، والنص مخفي.</li>
              <li>كل ما وقفت بين الآيات، تنكشف الكلمات: <b class="ok">الصح بالأخضر</b> و<b class="bad">الخطأ بالأحمر</b>.</li>
              <li>علِقت؟ اضغط «تلميح» تنكشف لك الكلمة الجاية.</li>
            </ol>
            <div class="tsm-note">يتحقق من الكلمات فقط، ولا يحكم على أحكام التجويد.</div>
          </div>
          ${hist.length ? `<div class="card tsm-hist">
            <div class="tsm-h">آخر التسميعات</div>
            ${hist.map((h) => `<button class="tsm-hrow" data-t="again" data-s="${h.surah}" data-f="${h.from}" data-to="${h.to}">
                <span>${esc(surahMeta(h.surah).name)} <small>${h.from === h.to ? 'آية ' + ar(h.from) : ar(h.from) + ' إلى ' + ar(h.to)}</small></span>
                <span class="tsm-score ${h.score >= 90 ? 'hi' : h.score >= 70 ? 'mid' : 'lo'}">${ar(h.score)}٪</span>
              </button>`).join('')}
          </div>` : ''}
        </div>
      </div>`;
    bindSetup();
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

  function setupFormHTML(m) {
    const opts = ctx.surahs.map((s) => `<option value="${s.n}" ${s.n === prefs.surah ? 'selected' : ''}>${ar(s.n)}. ${esc(s.name)}</option>`).join('');
    const ay = (sel) => Array.from({ length: m.ayahs }, (_, i) => `<option value="${i + 1}" ${i + 1 === sel ? 'selected' : ''}>${ar(i + 1)}</option>`).join('');
    return `
      <div class="tsm-h">وش تبي تسمّع؟</div>
      <div class="tsm-form">
        <label>السورة<select id="tsmSurah">${opts}</select></label>
        <div class="tsm-range">
          <label>من آية<select id="tsmFrom">${ay(prefs.from)}</select></label>
          <label>إلى آية<select id="tsmTo">${ay(prefs.to)}</select></label>
        </div>
        <div class="tsm-quick">
          <button class="tool-btn" data-t="all">السورة كاملة</button>
          <button class="tool-btn" data-t="ten">عشر آيات</button>
        </div>
        <div class="row tsm-opt">
          <div class="ltext"><div class="lbl">أظهر أول كلمة من كل آية</div><div class="desc">تساعدك تتذكّر بداية الآية</div></div>
          <label class="switch"><input type="checkbox" id="tsmHint" ${prefs.hintFirst ? 'checked' : ''}/><span class="track"></span><span class="thumb"></span></label>
        </div>
        <div class="tsm-err" id="tsmErr" hidden></div>
        <button class="btn brand tsm-start" id="tsmStart">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>
          ابدأ التسميع
        </button>
      </div>
      <div class="tsm-foot"><button class="linklike" id="tsmRemove">حذف النموذج من الجهاز</button></div>`;
  }

  function clampRange() {
    const m = surahMeta(prefs.surah);
    prefs.from = Math.min(Math.max(1, prefs.from), m.ayahs);
    prefs.to = Math.min(Math.max(prefs.from, prefs.to), m.ayahs, prefs.from + MAX_AYAHS - 1);
  }

  function bindSetup() {
    const $ = (id) => document.getElementById(id);
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
    $('tsmSurah').onchange = (e) => {
      prefs.surah = Number(e.target.value);
      const n = surahMeta(prefs.surah).ayahs;
      prefs.from = 1;
      prefs.to = Math.min(n, n <= 20 ? n : 10);
      saveJSON(PREFS_KEY, prefs);
      renderSetup();
    };
    $('tsmFrom').onchange = (e) => {
      prefs.from = Number(e.target.value);
      if (prefs.to < prefs.from) prefs.to = prefs.from;
      clampRange();
      saveJSON(PREFS_KEY, prefs);
      renderSetup();
    };
    $('tsmTo').onchange = (e) => {
      prefs.to = Number(e.target.value);
      if (prefs.to < prefs.from) prefs.from = prefs.to;
      clampRange();
      saveJSON(PREFS_KEY, prefs);
      renderSetup();
    };
    $('tsmHint').onchange = (e) => { prefs.hintFirst = e.target.checked; saveJSON(PREFS_KEY, prefs); };
    host.querySelectorAll('[data-t="all"],[data-t="ten"]').forEach((b) => {
      b.onclick = () => {
        const n = surahMeta(prefs.surah).ayahs;
        if (b.dataset.t === 'all') { prefs.from = 1; prefs.to = n; } else { prefs.to = prefs.from + 9; }
        clampRange();
        saveJSON(PREFS_KEY, prefs);
        renderSetup();
      };
    });
    $('tsmStart').onclick = () => startSession(prefs.surah, prefs.from, prefs.to);
    $('tsmRemove').onclick = async () => {
      if (!confirm('تحذف نموذج التسميع من جهازك؟ تقدر تنزّله مرة ثانية متى ما بغيت.')) return;
      await window.zn.asr.remove();
      renderSetup();
    };
    bindHistory();
  }

  function bindHistory() {
    host.querySelectorAll('[data-t="again"]').forEach((b) => {
      b.onclick = () => {
        if (!modelStatus || !modelStatus.installed) return;
        prefs.surah = Number(b.dataset.s);
        prefs.from = Number(b.dataset.f);
        prefs.to = Number(b.dataset.to);
        saveJSON(PREFS_KEY, prefs);
        startSession(prefs.surah, prefs.from, prefs.to);
      };
    });
  }

  /* ═══════════ الجلسة ═══════════ */
  async function startSession(surah, from, to) {
    const s = await window.zn.surah(surah);
    if (!s) return;
    const words = [];
    const ayahs = [];
    for (let v = from; v <= to; v++) {
      const dw = M.displayWords(s.verses[v - 1]);
      ayahs.push({ v, start: words.length, end: words.length + dw.length });
      dw.forEach((w, k) => words.push({ w, sk: M.skel(w), v, first: k === 0 }));
    }
    session = {
      surah, from, to, name: s.name, words, ayahs,
      committed: [], // كلمات مثبَّتة
      openHyp: [], // قراءة المقطع المفتوح (تتحدّث بعد كل وقفة)
      busy: false,
      result: null,
      hints: new Set(),
      overrides: new Set(),
      startedAt: Date.now(),
      hintFirst: prefs.hintFirst,
      engine: 'loading',
    };
    view = 'session';
    renderSession();
    // جهّز المحرّك والمايكروفون معًا
    const [eng] = await Promise.all([
      window.zn.asr.warmup(),
      startRecording().catch((e) => { showMicError(e); throw e; }),
    ]).catch(() => [null]);
    if (!session || view !== 'session') return;
    if (!eng || !eng.ok) {
      setStatus('تعذّر تشغيل محرّك التسميع' + (eng && eng.error ? ': ' + eng.error : ''), 'err');
      stopRecording();
      return;
    }
    session.engine = 'ready';
    setStatus('أسمعك… ابدأ القراءة', 'listen');
  }

  function renderSession() {
    const S = session;
    host.innerHTML = `
      <div class="tsm-top">
        <div>
          <div class="page-title">سورة ${esc(S.name)}</div>
          <div class="page-sub">${rangeText(S)}، ${ar(S.words.length)} كلمة</div>
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
      <div class="mushaf tsm-board">
        <div class="ayat" id="tsmText" style="font-size:${(ctx.state.settings.quranFontSize || 30)}px"></div>
      </div>`;
    document.getElementById('tsmHintBtn').onclick = giveHint;
    document.getElementById('tsmPause').onclick = togglePause;
    document.getElementById('tsmFinish').onclick = finish;
    paint();
    if (rec) setStatus(rec.paused ? 'متوقّف مؤقتًا' : 'أسمعك…', rec.paused ? 'idle' : 'listen');
  }

  /** يرسم الكلمات حسب نتيجة المحاذاة الحالية. */
  function paint() {
    const S = session;
    const box = document.getElementById('tsmText');
    if (!box || !S) return;
    const res = S.result ? S.result.words : S.words.map(() => ({ state: 'pending' }));
    const reached = S.result ? S.result.reached : 0;
    let html = '';
    for (const a of S.ayahs) {
      for (let i = a.start; i < a.end; i++) {
        html += wordHTML(S, i, res[i], i < reached) + ' ';
      }
      html += `<span class="ayah-num">${ar(a.v)}</span> `;
    }
    box.innerHTML = html;
    const prog = document.getElementById('tsmProg');
    if (prog) prog.style.width = Math.round((100 * reached) / S.words.length) + '%';
    // تابع موضع القراءة
    const cur = box.querySelector('.w-next');
    if (cur) cur.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function wordHTML(S, i, r, reachedIt) {
    const w = S.words[i];
    const hinted = S.hints.has(i);
    let cls = 'w';
    let title = '';
    if (S.overrides.has(i)) cls += ' w-ok';
    else if (r.state === 'ok' && reachedIt) cls += hinted ? ' w-hint' : ' w-ok';
    else if (r.state === 'wrong') { cls += ' w-bad'; title = `قلت: «${r.said}»`; }
    else if (r.state === 'missed' && reachedIt) { cls += ' w-miss'; title = 'ما قرأتها'; }
    else if (hinted) cls += ' w-hint';
    else if (S.hintFirst && w.first) cls += ' w-peek';
    else cls += ' w-hidden';
    if (S.result && i === S.result.reached && view === 'session') cls += ' w-next';
    if (!S.result && i === 0 && view === 'session') cls += ' w-next';
    return `<span class="${cls}" data-i="${i}"${title ? ` title="${esc(title)}"` : ''}>${esc(w.w)}</span>`;
  }

  function rangeText(S) {
    return S.from === S.to ? `آية ${ar(S.from)}` : `من آية ${ar(S.from)} إلى ${ar(S.to)}`;
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
    const at = S.result ? S.result.reached : 0;
    // أول كلمة لم تُكشف بعد من موضع القراءة
    for (let i = at; i < S.words.length; i++) {
      if (!S.hints.has(i)) { S.hints.add(i); break; }
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
    const refStartsWithBasmala = S.surah === 1 && S.from === 1;
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 0; k < LEAD.length; k++) {
        if (k === 1 && refStartsWithBasmala) continue;
        if (startsWith(hyp, LEAD[k], at)) at += LEAD[k].length;
      }
    }
    let end = hyp.length;
    if (end - at >= TAIL.length && startsWith(hyp, TAIL, end - TAIL.length)) end -= TAIL.length;
    return hyp.slice(at, end);
  }

  /** القراءة كاملة = المثبَّت + المقطع المفتوح (يُعاد سماعه بعد كل وقفة). */
  function fullHyp(S) {
    return cleanHyp(S.committed.concat(S.openHyp), S);
  }

  function realign() {
    const S = session;
    S.result = M.align(S.words, fullHyp(S));
    if (S.finishing) return;
    paint();
    if (S.result.reached >= S.words.length && !S.busy && !(rec && rec.frames.length)) {
      // اكتمل المقطع
      setTimeout(() => { if (session === S && view === 'session' && !S.busy) finish(); }, 900);
    }
  }

  /**
   * يعيد سماع المقطع المفتوح كله (من آخر نقطة تثبيت حتى الآن).
   * السبب: النموذج مدرَّب على آيات كاملة؛ لو قطّعنا الآية عند وقفات القارئ
   * يخطئ في الكلمات عند الحدود. فنعطيه السياق كاملًا كل مرة، ونثبّت النتيجة
   * فقط عندما تبلغ القراءة نهاية آية (أو يطول المقطع).
   */
  async function transcribeOpen(force) {
    const S = session;
    if (!S) return;
    const r0 = rec || S.lastRec;
    if (!r0 || !r0.frames.length) return;
    if (S.busy) { S.dirty = true; return; }
    // سكوت فقط (ذيل بعد آخر آية)؟ لا نرسله: النموذج «يتخيّل» كلمات على السكوت
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
      S.openHyp = M.hypWords(r.text || '');
      S.result = M.align(S.words, fullHyp(S));
      // فيه خطأ في هذا المقطع؟ أعد السماع مرة بحشوة سكوت (النموذج غير ثابت عند الحواف)
      // ونأخذ الأقرب للمصحف. الخطأ الحقيقي من القارئ يظهر في المحاولتين فلا يُخفى.
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
    stopRecording();
    setStatus('أراجع آخر مقطع…', 'busy');
    const until = Date.now() + 30000;
    while (S.busy && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
    if (S.lastRec && S.lastRec.frames.length) await transcribeOpen(true);
    S.result = M.align(S.words, fullHyp(S));
    if (session !== S) return;
    view = 'result';
    renderResult();
  }

  function score(S) {
    const res = S.result ? S.result.words : [];
    const reached = S.result ? S.result.reached : 0;
    let ok = 0, wrong = 0, missed = 0, hinted = 0;
    S.words.forEach((_, i) => {
      const r = res[i] || { state: 'pending' };
      if (S.overrides.has(i)) { ok++; return; }
      if (S.hints.has(i)) { hinted++; return; }
      if (r.state === 'ok' && i < reached) ok++;
      else if (r.state === 'wrong') wrong++;
      else missed++; // لم تُقرأ أو فاتت
    });
    return { ok, wrong, missed, hinted, total: S.words.length, pct: Math.round((100 * ok) / S.words.length) };
  }

  function renderResult() {
    const S = session;
    const sc = score(S);
    const mins = Math.max(1, Math.round((Date.now() - S.startedAt) / 60000));
    if (!S.test) saveHistory(S, sc);
    const msg = sc.pct >= 95 ? 'ما شاء الله، حفظ متقن' : sc.pct >= 80 ? 'ممتاز، بقي شوي وتضبطه' : sc.pct >= 50 ? 'جيد، يحتاج مراجعة' : 'راجع المقطع وأعد التسميع';
    host.innerHTML = `
      <div class="tsm-top">
        <div>
          <div class="page-title">نتيجة التسميع</div>
          <div class="page-sub">سورة ${esc(S.name)}، ${rangeText(S)}، ${mins === 1 ? 'دقيقة' : ar(mins) + ' دقائق'}</div>
        </div>
        <div class="tsm-actions">
          <button class="tool-btn" id="tsmBack">مقطع آخر</button>
          <button class="btn brand" id="tsmAgain">أعد التسميع</button>
        </div>
      </div>
      <div class="tsm-result">
        <div class="card tsm-scorecard">
          <div class="tsm-ring ${sc.pct >= 90 ? 'hi' : sc.pct >= 70 ? 'mid' : 'lo'}" style="--p:${sc.pct}">
            <div><b>${ar(sc.pct)}٪</b><span>إتقان</span></div>
          </div>
          <div class="tsm-msg">${msg}</div>
          <div class="tsm-stats">
            <div><b class="ok">${ar(sc.ok)}</b><span>صحيحة</span></div>
            <div><b class="bad">${ar(sc.wrong)}</b><span>خطأ</span></div>
            <div><b class="miss">${ar(sc.missed)}</b><span>فاتتك</span></div>
            <div><b class="hint">${ar(sc.hinted)}</b><span>بتلميح</span></div>
          </div>
          <div class="tsm-note">النموذج أحيانًا يسمع غلط. لو كلمة حمراء وأنت قريتها صح، اضغط عليها.</div>
        </div>
        <div class="mushaf tsm-board">
          <div class="ayat" id="tsmText" style="font-size:${(ctx.state.settings.quranFontSize || 30)}px"></div>
        </div>
      </div>`;
    paint();
    const box = document.getElementById('tsmText');
    box.onclick = (e) => {
      const el = e.target.closest('.w-bad,.w-miss,.w-ok[data-i]');
      if (!el) return;
      const i = Number(el.dataset.i);
      if (el.classList.contains('w-ok') && !S.overrides.has(i)) return;
      if (S.overrides.has(i)) S.overrides.delete(i); else S.overrides.add(i);
      renderResult();
    };
    document.getElementById('tsmBack').onclick = () => { view = 'setup'; session = null; renderSetup(); };
    document.getElementById('tsmAgain').onclick = () => startSession(S.surah, S.from, S.to);
  }

  function saveHistory(S, sc) {
    const list = loadJSON(HISTORY_KEY, []).filter((h) => h.id !== S.startedAt);
    list.unshift({ id: S.startedAt, surah: S.surah, from: S.from, to: S.to, score: sc.pct, at: Date.now() });
    saveJSON(HISTORY_KEY, list.slice(0, 50));
  }

  /* ═══════════ التسجيل وكشف السكتات ═══════════ */
  const RATE = 16000;
  const FRAME = 2048; // 128ms
  const PAUSE = 0.6; // ثانية سكوت = وقفة → نعيد السماع
  const TRAIL = 1.0; // نحتفظ بثانية سكوت بعد الكلام ثم نتوقف عن التخزين
  const COMMIT_LEN = 20; // مقطع مفتوح أطول من هذا يُثبَّت عند أقرب وقفة
  const HARD_MAX = 27; // حد النموذج ٣٠ ثانية
  const PRE_ROLL = 3; // إطارات قبل بداية الكلام

  function newRec(extra) {
    return Object.assign({
      paused: false,
      frames: [], // صوت المقطع المفتوح (منذ آخر تثبيت)
      ring: [], // آخر الإطارات قبل الكلام
      speaking: false, silentFor: 99, floor: 0.004, level: 0,
    }, extra);
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
    // أرضية الضجيج: تهبط بسرعة وترتفع ببطء
    rec.floor = rms < rec.floor ? rms * 0.5 + rec.floor * 0.5 : rec.floor * 0.995 + rms * 0.005;
    const voiced = rms > Math.max(0.012, rec.floor * 3.2);
    const sec = FRAME / RATE;

    if (voiced) {
      if (!rec.speaking) {
        rec.speaking = true;
        // كنا متوقفين عن التخزين (سكوت طويل): أضف ما قبل الكلام مباشرة
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
    // حماية من تجاوز حد النموذج دون وقفة: ثبّت ما سُمع
    if (rec.frames.length * sec >= HARD_MAX && session && !session.busy) transcribeOpen(true);
  }

  function meterLoop() {
    const mic = document.getElementById('tsmMic');
    if (!rec) return;
    if (mic) {
      const v = rec.paused ? 0 : Math.min(1, rec.level * 14);
      mic.style.setProperty('--lv', v.toFixed(3));
    }
    rec.raf = requestAnimationFrame(meterLoop);
  }

  function stopRecording() {
    if (!rec) return;
    const r = rec;
    rec = null;
    if (session) session.lastRec = r; // آخر مقطع يُعالج في finish()
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

  /** للاختبار الآلي فقط: يغذّي صوتًا مسجّلًا بدل المايكروفون (نفس مسار كشف السكتات). */
  async function _test(surah, from, to, b64, speed = 32) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const audio = new Float32Array(bytes.buffer);
    const realStart = startRecording;
    startRecording = async () => {
      rec = newRec({ proc: { disconnect() {} }, stream: { getTracks: () => [] }, ac: { close() {} } });
    };
    await startSession(surah, from, to);
    session.test = true;
    startRecording = realStart;
    for (let k = 0; k + FRAME <= audio.length && rec; k += FRAME) {
      onFrame(audio.slice(k, k + FRAME));
      await new Promise((r) => setTimeout(r, speed)); // افتراضيًا أسرع من الزمن الحقيقي ٤ مرات
    }
    // سكوت ختامي
    for (let k = 0; k < 10 && rec; k++) onFrame(new Float32Array(FRAME));
    const until = Date.now() + 60000;
    while (session && view === 'session' && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 200));
      if (session && !session.busy && view === 'session') await finish();
    }
    const sc = session ? score(session) : null;
    return { sc, hyp: session && session.committed.map((w) => w.text).join(' '),
      states: session && session.result && session.result.words.map((w) => w.state[0]).join('') };
  }

  window.Tasmee = { render, leave, _test, _debug: () => ({ session, rec: !!rec, view }) };
})();
