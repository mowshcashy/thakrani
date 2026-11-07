'use strict';
/*
 * المسبحة: تسبيح ما بعد الصلاة — سبحان الله ٣٣، الحمد لله ٣٣، الله أكبر ٣٤ (المجموع ١٠٠).
 * العدد يُحفظ محليًا فلا يضيع لو أُغلق التطبيق.
 */

const root = document.getElementById('root');
const ar = (s) => window.ZN.toArabicDigits(s);
const STAGES = [
  { text: 'سبحان الله', n: 33 },
  { text: 'الحمد لله', n: 33 },
  { text: 'الله أكبر', n: 34 },
];
const KEY = 'zn-tasbeeh';

let total = 0;
try { total = Math.max(0, parseInt(localStorage.getItem(KEY), 10) || 0); } catch (_) {}

root.innerHTML = `
  <div class="glass">
    <button class="w-close" data-wclose title="إخفاء">&times;</button>
    <div class="phrase" id="phrase"></div>
    <button class="tap" id="tap" title="اضغط للتسبيح"></button>
    <div class="meta">
      <span id="total"></span>
      <button class="w-btn" id="reset">تصفير</button>
    </div>
  </div>`;

const $ = (id) => document.getElementById(id);

function stageOf(t) {
  let acc = 0;
  for (const s of STAGES) {
    if (t < acc + s.n) return { stage: s, inStage: t - acc };
    acc += s.n;
  }
  return null; // اكتمل المئة
}

function paint() {
  const st = stageOf(total);
  if (st) {
    $('phrase').textContent = st.stage.text;
    $('tap').textContent = ar(st.inStage);
  } else {
    $('phrase').textContent = 'تقبّل الله ✓';
    $('tap').textContent = ar(100);
  }
  $('total').textContent = `${ar(total)} / ${ar(100)}`;
  try { localStorage.setItem(KEY, String(total)); } catch (_) {}
}

$('tap').addEventListener('click', () => {
  if (total >= 100) total = 0; // بعد الإكمال: نقرة تبدأ دورة جديدة
  else total += 1;
  const t = $('tap');
  t.classList.remove('pulse');
  void t.offsetWidth; // أعد تشغيل الحركة
  if (stageOf(total) === null || (stageOf(total) && stageOf(total).inStage === 0)) t.classList.add('pulse');
  paint();
});

$('reset').addEventListener('click', () => {
  total = 0;
  paint();
});

window.WK.onState(() => {});
window.WK.enableDrag();
paint();
