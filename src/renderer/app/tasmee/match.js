'use strict';
/*
 * match.js — مقارنة ما قرأه المستخدم بنص المصحف كلمة كلمة.
 *
 * المشكلة: المصحف عندنا بالرسم العثماني (ٱلصَّلَوٰةَ، ٱلۡكِتَٰبُ، يَٰٓأَيُّهَا)
 * ونموذج التعرّف يكتب بالإملاء الحديث (الصلاة، الكتاب، يا أيها).
 * الحل: نختزل الكلمتين إلى «هيكل» مشترك (بلا تشكيل ولا ألفات ولا همزات)
 * ثم نقارن بتسامح محسوب مع حروف العلّة فقط، لا مع الحروف الصحيحة —
 * فخطأ مثل «يلد ↔ يولد» يُقبل (اختلاف رسم)، أما «يلد ↔ يمد» فخطأ حقيقي.
 *
 * المحاذاة: برمجة ديناميكية (Needleman–Wunsch) بين كلمات المرجع وكلمات القراءة،
 * ونهاية المرجع مجانية — فالقراءة الجزئية (لم يكمل بعد) لا تُحسب أخطاء.
 *
 * يعمل في المتصفح (window.TasmeeMatch) وفي Node (module.exports) للاختبارات.
 */
(function (root) {
  // تشكيل وعلامات الضبط والوقف في الرسم العثماني
  const MARKS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF\u0640\u200C-\u200F\u06DE\u06E9]/g;

  /** تقسيم آية عثمانية إلى كلمات عرض (مع إصلاح انفصال التنوين «هُدࣰ ى»). */
  function displayWords(text) {
    return String(text)
      .replace(/([ࣰ-ًࣲ-ٍ])\s+([اى][ۖ-ۭ]*)(?=\s|$)/g, '$1$2') // التنوين المنفصل عن ألفه
      .replace(/[\u06DE\u06E9]\s*/g, '') // ۞ ۩
      .replace(/\u200F/g, '')
      .split(/\s+/)
      .filter((w) => /[\u0621-\u064A\u0671]/.test(w));
  }

  /** الهيكل: بلا تشكيل، بلا ألف/همزة، مع توحيد صور الحروف. */
  function skel(w) {
    return String(w)
      .normalize('NFC')
      .replace(MARKS, '')
      .replace(/[\u0671\u0623\u0625\u0622]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/[\u0621\u0627]/g, '')
      .replace(/[^\u0621-\u064A]/g, '')
      .replace(/(.)\1+/g, '$1'); // الشدّة: «ٱلَّيۡل» بلام واحدة و«الليل» بلامين
  }

  const WEAK = new Set(['و', 'ي', 'ه', 'ن']); // اختلافات الرسم تقع فيها غالبًا (الصلوة/الصلاة، إبرهم/إبراهيم)

  /** مسافة تحرير موزونة: إدخال/حذف حرف علّة = 0.5، غير ذلك = 1. */
  function wdist(a, b) {
    const n = a.length;
    const m = b.length;
    if (!n) return [...b].reduce((s, c) => s + (WEAK.has(c) ? 0.5 : 1), 0);
    if (!m) return [...a].reduce((s, c) => s + (WEAK.has(c) ? 0.5 : 1), 0);
    let prev = new Array(m + 1);
    let cur = new Array(m + 1);
    prev[0] = 0;
    for (let j = 1; j <= m; j++) prev[j] = prev[j - 1] + (WEAK.has(b[j - 1]) ? 0.5 : 1);
    for (let i = 1; i <= n; i++) {
      const ca = a[i - 1];
      const del = WEAK.has(ca) ? 0.5 : 1;
      cur[0] = prev[0] + del;
      for (let j = 1; j <= m; j++) {
        const cb = b[j - 1];
        const ins = WEAK.has(cb) ? 0.5 : 1;
        const sub = ca === cb ? 0 : (WEAK.has(ca) && WEAK.has(cb) ? 0.5 : 1);
        cur[j] = Math.min(prev[j] + del, cur[j - 1] + ins, prev[j - 1] + sub);
      }
      [prev, cur] = [cur, prev];
    }
    return prev[m];
  }

  /** هل الكلمتان (هيكلان) نفس الكلمة؟ */
  function same(r, h) {
    if (r === h) return true;
    if (!r || !h) return false;
    const d = wdist(r, h);
    const L = Math.max(r.length, h.length);
    if (L <= 2) return d <= 0.5 && Math.min(r.length, h.length) >= 1 && r[0] === h[0];
    if (L <= 5) return d <= 0.5;
    return d <= 1;
  }

  const VOCATIVE = new Set(['يا', 'ويا', 'فيا', 'ها']);

  /**
   * كلمات القراءة: نجمع «يا/ها» مع ما بعدها كما في الرسم العثماني (يَٰٓأَيُّهَا، هَٰٓأَنتُمۡ، يَٰقَوۡمِ).
   */
  function hypWords(text) {
    const raw = String(text || '').split(/\s+/).filter((w) => /[\u0621-\u064A\u0671]/.test(w));
    const out = [];
    for (let i = 0; i < raw.length; i++) {
      const s = skel(raw[i]);
      const bare = raw[i].replace(MARKS, '');
      if (VOCATIVE.has(bare) && i + 1 < raw.length) {
        out.push({ text: raw[i] + ' ' + raw[i + 1], sk: s + skel(raw[i + 1]) });
        i++;
      } else {
        out.push({ text: raw[i], sk: s });
      }
    }
    return out.filter((w) => w.sk);
  }

  /**
   * يحاذي القراءة مع المرجع.
   * ref: [{sk}] ، hyp: [{sk,text}]
   * يعيد لكل كلمة مرجع: {state:'ok'|'wrong'|'missed'|'pending', said?}
   * و reached: عدد كلمات المرجع التي وصلت إليها القراءة.
   */
  function align(ref, hyp) {
    const R = ref.length;
    const H = hyp.length;
    const W = H + 1;
    const D = new Float64Array((R + 1) * W);
    const B = new Uint8Array((R + 1) * W); // 1=قطري 2=حذف (كلمة مرجع فاتت) 3=إدخال (كلمة زائدة)
    const DEL = 1;
    const SUB = 1.05; // عند التعادل نفضّل «نسي كلمة ثم أكمل صح» على «أخطأ»
    const INS = 1.1; // الكلمة الزائدة (تكرار) لا تُعدّ خطأ، لكن لا نفضّلها على «نسي كلمة»
    for (let j = 1; j <= H; j++) { D[j] = j * INS; B[j] = 3; }
    for (let i = 1; i <= R; i++) {
      D[i * W] = i * DEL; B[i * W] = 2;
      const rs = ref[i - 1].sk;
      for (let j = 1; j <= H; j++) {
        const ok = same(rs, hyp[j - 1].sk);
        const dg = D[(i - 1) * W + j - 1] + (ok ? 0 : SUB);
        const dl = D[(i - 1) * W + j] + DEL;
        const is = D[i * W + j - 1] + INS;
        let best = dg, b = 1;
        if (dl < best) { best = dl; b = 2; }
        if (is < best) { best = is; b = 3; }
        D[i * W + j] = best; B[i * W + j] = b;
      }
    }
    // نهاية المرجع مجانية: أفضل نقطة توقّف بعد استهلاك كل القراءة
    let endI = 0;
    let bestCost = Infinity;
    for (let i = 0; i <= R; i++) {
      const c = D[i * W + H];
      if (c <= bestCost + 1e-9) { if (c < bestCost - 1e-9 || i > endI) endI = i; bestCost = Math.min(bestCost, c); }
    }
    const res = ref.map(() => ({ state: 'pending' }));
    const extra = [];
    const ins = []; // {at: موضع كلمة المرجع التالية، text، sk}
    let i = endI, j = H;
    while (i > 0 || j > 0) {
      const b = B[i * W + j];
      if (i > 0 && j > 0 && b === 1) {
        const ok = same(ref[i - 1].sk, hyp[j - 1].sk);
        res[i - 1] = ok ? { state: 'ok', said: hyp[j - 1].text } : { state: 'wrong', said: hyp[j - 1].text };
        i--; j--;
      } else if (i > 0 && (j === 0 || b === 2)) {
        res[i - 1] = { state: 'missed' };
        i--;
      } else {
        extra.push(hyp[j - 1].text);
        ins.push({ at: i, text: hyp[j - 1].text, sk: hyp[j - 1].sk });
        j--;
      }
    }
    return { words: res, reached: endI, extra: extra.reverse(), ins: ins.reverse(), cost: bestCost };
  }

  const api = { displayWords, skel, hypWords, same, align, wdist };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TasmeeMatch = api;
})(typeof window !== 'undefined' ? window : globalThis);
