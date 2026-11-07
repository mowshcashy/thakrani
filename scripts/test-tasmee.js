'use strict';
/*
 * اختبارات مطابقة التسميع (match.js) على المصحف كاملًا — بلا نموذج ولا صوت.
 *   node scripts/test-tasmee.js
 *
 * «القراءة» هنا = نص الآية نفسه بعد تحويله لإملاء مبسّط (بلا تشكيل، ٱ→ا)
 * ثم نحقن أخطاء ونتأكد أنها تُكتشف، وأن القراءة الصحيحة لا تُخطَّأ.
 */
const path = require('path');
const M = require(path.join(__dirname, '..', 'src', 'renderer', 'app', 'tasmee', 'match.js'));
const Q = require(path.join(__dirname, '..', 'assets', 'data', 'quran.json'));

let fails = 0;
function check(name, cond, extra) {
  if (!cond) { fails++; console.log('✗', name, extra || ''); }
}

// تحويل كلمة عثمانية إلى شكل قريب من مخرجات النموذج (إملائي بتشكيل بسيط)
const MARKS = /[ۖ-ࣰۭ-ࣲٰ]/g;
const simple = (w) => w.replace(MARKS, '').replace(/ٱ/g, 'ا');

let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

let total = 0, falseErr = 0, del = [0, 0], sub = [0, 0], partial = [0, 0];
const allWords = [];
Q.forEach((s) => s.forEach((v) => allWords.push(...M.displayWords(v).map(simple))));

for (let s = 0; s < Q.length; s++) {
  for (let v = 0; v < Q[s].length; v++) {
    const ref = M.displayWords(Q[s][v]).map((w) => ({ sk: M.skel(w) }));
    const hw = M.displayWords(Q[s][v]).map(simple);
    const r = M.align(ref, M.hypWords(hw.join(' ')));
    total += ref.length;
    falseErr += r.words.filter((x) => x.state !== 'ok').length;

    if (hw.length < 4 || rnd() > 0.35) continue;
    const pos = 1 + Math.floor(rnd() * (hw.length - 2));
    // حذف كلمة
    let h = hw.slice(); h.splice(pos, 1);
    let a = M.align(ref, M.hypWords(h.join(' ')));
    del[1]++; if (a.words.some((x) => x.state === 'missed')) del[0]++;
    // استبدال بكلمة مختلفة
    h = hw.slice();
    let w; do { w = allWords[Math.floor(rnd() * allWords.length)]; } while (M.same(M.skel(w), ref[pos].sk));
    h[pos] = w;
    a = M.align(ref, M.hypWords(h.join(' ')));
    sub[1]++; if (a.words[pos].state !== 'ok') sub[0]++;
    // قراءة جزئية صحيحة: لا أخطاء، والموضع صحيح
    a = M.align(ref, M.hypWords(hw.slice(0, pos + 1).join(' ')));
    partial[1]++; if (a.reached === pos + 1 && a.words.slice(0, pos + 1).every((x) => x.state === 'ok')) partial[0]++;
  }
}

const pct = (x) => (100 * x[0] / x[1]).toFixed(1) + '%';
console.log(`كلمات المصحف: ${total} — أخطاء وهمية: ${falseErr} (${(100 * falseErr / total).toFixed(2)}%)`);
console.log(`اكتشاف الحذف: ${pct(del)}  اكتشاف الاستبدال: ${pct(sub)}  القراءة الجزئية: ${pct(partial)}`);
check('أخطاء وهمية < 0.2%', falseErr / total < 0.002);
check('اكتشاف الحذف ≥ 99%', del[0] / del[1] >= 0.99);
check('اكتشاف الاستبدال ≥ 99%', sub[0] / sub[1] >= 0.99);
check('القراءة الجزئية ≥ 99%', partial[0] / partial[1] >= 0.99);

// حالات محددة
const ikhlas = Q[111].flatMap((v) => M.displayWords(v)).map((w) => ({ sk: M.skel(w) }));
check('يا أيها تُجمع', M.hypWords('يا أيها الناس').length === 2);
check('الليل = ٱلَّيۡلِ', M.same(M.skel('ٱلَّيۡلِ'), M.skel('الليل')));
check('الصلاة = ٱلصَّلَوٰةَ', M.same(M.skel('ٱلصَّلَوٰةَ'), M.skel('الصلاة')));
check('يلد ≠ يمد', !M.same(M.skel('يَلِدۡ'), M.skel('يمد')));
const skip = M.align(ikhlas, M.hypWords('قل هو الله أحد الله الصمد ولم يكن له كفوا أحد'));
check('آية محذوفة كاملة تُكتشف', skip.words.slice(6, 10).every((x) => x.state === 'missed'), skip.words.map((x) => x.state[0]).join(''));

if (fails) { console.log(`\n${fails} اختبار فشل`); process.exit(1); }
console.log('\nكل اختبارات التسميع نجحت ✓');
