'use strict';
/*
 * hifz.js — خطة الحفظ والمراجعة: الورد اليومي بالأوجه (الصفحات)، المراجعة،
 * التقدّم/التأخّر عن الخطة، السلسلة اليومية، التحديات، والتذكير اليومي.
 *
 * يُحفظ في ملف مستقل (hifz.json) لا في الإعدادات: يتغيّر كثيرًا ولا يهم بقية النوافذ.
 */

const { app, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const content = require('./content');
const notifier = require('./notifier');

const TOTAL_PAGES = 604;
const DEFAULT = {
  plan: null, // {start, order:'forward'|'backward', startPage, daily, review, threshold, retry}
  reminder: { enabled: true, mode: 'prayer', prayer: 'asr', offset: 20, time: '17:00' },
  pages: {}, // "582": {m: تاريخ الحفظ, r: آخر مراجعة, s: آخر نتيجة, n: عدد المراجعات}
  log: [], // {d, t:'new'|'review'|'free'|'challenge', from, to, score, mins}
  today: null, // {d, review:[صفحات]} ثابتة طوال اليوم
};

let data = null;
let ctx = { getSchedule: () => null, openApp: () => {} };
let timer = null;

/* ─────────── التخزين ─────────── */
function file() {
  return path.join(app.getPath('userData'), 'hifz.json');
}
function load() {
  if (data) return data;
  try {
    data = Object.assign(JSON.parse(JSON.stringify(DEFAULT)), JSON.parse(fs.readFileSync(file(), 'utf8')));
  } catch (_) {
    data = JSON.parse(JSON.stringify(DEFAULT));
  }
  return data;
}
function save() {
  try {
    const tmp = file() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file()); // كتابة ذرّية: لا يتلف الملف لو انطفأ الجهاز أثناء الحفظ
  } catch (e) {
    console.error('hifz save:', e.message);
  }
}

/* ─────────── تواريخ (محلية) ─────────── */
const pad = (n) => String(n).padStart(2, '0');
function dayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
function addDays(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  return dayStr(new Date(y, m - 1, d + n));
}

/* ─────────── ترتيب الحفظ ─────────── */
/** تسلسل الصفحات حسب الخطة: من الفاتحة للأمام، أو من جزء عمّ (من الناس) ثم الأجزاء نزولًا. */
function sequence(plan) {
  const out = [];
  if (plan.order === 'backward') {
    const J = content.juzRanges();
    for (let p = 604; p >= 582; p--) out.push(p); // جزء عمّ من الناس صعودًا للنبأ
    for (let j = 28; j >= 0; j--) for (let p = J[j][0]; p <= J[j][1]; p++) out.push(p);
  } else {
    for (let p = 1; p <= TOTAL_PAGES; p++) out.push(p);
  }
  const i = plan.startPage ? out.indexOf(plan.startPage) : 0;
  return i > 0 ? out.slice(i).concat(out.slice(0, i)) : out;
}

const isMem = (p) => !!(data.pages[p] && data.pages[p].m);

/* ─────────── الحسابات ─────────── */
function today() {
  load();
  const d = dayStr();
  const plan = data.plan;
  const res = { date: d, newPages: [], newDone: [], review: [], reviewDone: [], hasPlan: !!plan };
  if (!plan) return res;

  // الحفظ الجديد: ما يلزم لمواكبة الخطة اليوم (لا نكدّس التأخير كله في يوم واحد)
  const day = Math.max(0, daysBetween(plan.start, d));
  const expected = (day + 1) * plan.daily;
  const sincePlan = Object.values(data.pages).filter((x) => x.m && x.m >= plan.start && !x.pre).length;
  const doneToday = Object.keys(data.pages).filter((p) => data.pages[p].m === d && !data.pages[p].pre).map(Number);
  const need = Math.min(Math.ceil(plan.daily), Math.max(0, Math.ceil(expected - (sincePlan - doneToday.length))));
  const seq = sequence(plan);
  const next = seq.filter((p) => !isMem(p) || data.pages[p].m === d);
  res.newPages = next.slice(0, Math.max(need, doneToday.length)).sort((a, b) => a - b);
  res.newDone = doneToday;

  // المراجعة: ثابتة طوال اليوم — الأضعف أولًا ثم الأقدم مراجعة
  if (!data.today || data.today.d !== d) {
    const cand = Object.keys(data.pages)
      .filter((p) => data.pages[p].m && data.pages[p].m < d)
      .map(Number)
      .sort((a, b) => {
        const A = data.pages[a];
        const B = data.pages[b];
        const wa = (A.s || 100) < plan.threshold ? 0 : 1;
        const wb = (B.s || 100) < plan.threshold ? 0 : 1;
        if (wa !== wb) return wa - wb;
        return (A.r || A.m).localeCompare(B.r || B.m) || a - b;
      });
    data.today = { d, review: cand.slice(0, plan.review).sort((a, b) => a - b) };
    save();
  }
  res.review = data.today.review;
  res.reviewDone = res.review.filter((p) => data.pages[p] && data.pages[p].r === d);
  return res;
}

function stats() {
  load();
  const d = dayStr();
  const plan = data.plan;
  const memorized = Object.keys(data.pages).filter((p) => data.pages[p].m).map(Number);
  const J = content.juzRanges();
  const juz = J.map(([a, b]) => {
    let n = 0;
    for (let p = a; p <= b; p++) if (isMem(p)) n++;
    return { from: a, to: b, done: n, total: b - a + 1 };
  });

  // السلسلة: أيام متتالية فيها تسميع ناجح (تنتهي اليوم أو أمس)
  const passDays = new Set(data.log.filter((l) => plan ? l.score >= plan.threshold : l.score >= 80).map((l) => l.d));
  let streak = 0;
  let cur = passDays.has(d) ? d : addDays(d, -1);
  while (passDays.has(cur)) { streak++; cur = addDays(cur, -1); }

  // نشاط آخر ٧ أيام (عدد الأوجه المسمَّعة)
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const day = addDays(d, -i);
    const pages = data.log.filter((l) => l.d === day).reduce((s, l) => s + (l.to - l.from + 1), 0);
    week.push({ d: day, pages });
  }

  // التقدّم والتأخّر عن الخطة (بالأوجه)
  let pace = null;
  if (plan) {
    const day = Math.max(0, daysBetween(plan.start, d));
    // المتوقع حتى أمس + ما أُنجز (اليوم لم ينتهِ بعد، فلا يُحسب تأخيرًا قبل نهايته)
    const actual = Object.values(data.pages).filter((x) => x.m && x.m >= plan.start && !x.pre).length;
    const expected = Math.max(Math.floor(day * plan.daily), Math.min(actual, Math.floor((day + 1) * plan.daily)));
    pace = { expected, actual, diff: actual - expected, daysDiff: Math.round((actual - expected) / plan.daily) };
    const left = TOTAL_PAGES - memorized.length;
    pace.finishDays = Math.ceil(left / plan.daily);
    pace.finishDate = addDays(d, pace.finishDays);
  }
  const weak = memorized.filter((p) => data.pages[p].s != null && data.pages[p].s < (plan ? plan.threshold : 80)).sort((a, b) => a - b);
  return {
    memorized: memorized.length,
    percent: Math.round((1000 * memorized.length) / TOTAL_PAGES) / 10,
    juz,
    streak,
    week,
    pace,
    weak,
    sessions: data.log.length,
    perfect: data.log.filter((l) => l.score === 100).length,
  };
}

/** صفحة التحدي اليومي: من المحفوظ، ثابتة لليوم. */
function dailyChallengePage() {
  const mem = Object.keys(data.pages).filter((p) => data.pages[p].m).map(Number).sort((a, b) => a - b);
  if (!mem.length) return null;
  const d = dayStr();
  let h = 0;
  for (const c of d) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return mem[h % mem.length];
}

function challenges(st) {
  const d = dayStr();
  const weekPages = st.week.reduce((s, x) => s + x.pages, 0);
  const daily = dailyChallengePage();
  const list = [
    { id: 'daily', icon: '🎯', title: 'تحدي اليوم', desc: daily ? `سمّع صفحة ${daily} من محفوظك بدقة ٩٠٪ أو أكثر` : 'احفظ أول صفحة ليفتح لك التحدي',
      progress: data.log.some((l) => l.d === d && l.t === 'challenge' && l.score >= 90) ? 1 : 0, page: daily, daily: true },
    { id: 'streak7', icon: '🔥', title: 'أسبوع بلا انقطاع', desc: 'سمّع كل يوم ٧ أيام متتالية', progress: Math.min(1, st.streak / 7) },
    { id: 'week10', icon: '📖', title: 'عشرة أوجه في أسبوع', desc: 'سمّع ١٠ أوجه خلال آخر ٧ أيام', progress: Math.min(1, weekPages / 10) },
    { id: 'perfect', icon: '💎', title: 'تسميع بلا خطأ', desc: 'سمّع وجهًا كاملًا بنسبة ١٠٠٪', progress: st.perfect > 0 ? 1 : 0 },
    { id: 'amma', icon: '🌙', title: 'ختم جزء عمّ', desc: 'احفظ صفحات جزء عمّ كلها (٢٣ وجهًا)', progress: st.juz[29].done / st.juz[29].total },
    { id: 'juz', icon: '🏅', title: 'أول جزء كامل', desc: 'أتمّ حفظ أي جزء', progress: Math.max(...st.juz.map((j) => j.done / j.total)) },
    { id: 'streak30', icon: '⭐', title: 'شهر من المثابرة', desc: '٣٠ يومًا متتالية من التسميع', progress: Math.min(1, st.streak / 30) },
    { id: 'quarter', icon: '🕌', title: 'ربع القرآن', desc: 'احفظ ١٥١ وجهًا', progress: Math.min(1, st.memorized / 151) },
  ];
  return list.map((c) => ({ ...c, done: c.progress >= 1 }));
}

function summary() {
  load();
  const st = stats();
  return {
    plan: data.plan,
    reminder: data.reminder,
    today: today(),
    stats: st,
    challenges: challenges(st),
    juzRanges: content.juzRanges(),
    pages: data.pages,
    recent: data.log.slice(-12).reverse(),
    nextReminder: timer ? timer.at : null,
  };
}

/* ─────────── التعديل ─────────── */
function setPlan(plan, preJuz) {
  load();
  data.plan = plan
    ? {
        start: plan.start || dayStr(),
        order: plan.order === 'backward' ? 'backward' : 'forward',
        startPage: Number(plan.startPage) || 0,
        daily: Math.max(0.5, Math.min(5, Number(plan.daily) || 1)),
        review: Math.max(0, Math.min(40, Number(plan.review) || 5)),
        threshold: Math.max(50, Math.min(100, Number(plan.threshold) || 80)),
        retry: plan.retry !== false,
      }
    : null;
  // أجزاء محفوظة مسبقًا: تُعلَّم محفوظة (لا تُحسب من تقدّم الخطة)
  if (Array.isArray(preJuz)) {
    const J = content.juzRanges();
    const d = addDays(dayStr(), -1);
    for (const j of preJuz) {
      const r = J[j - 1];
      if (!r) continue;
      for (let p = r[0]; p <= r[1]; p++) if (!isMem(p)) data.pages[p] = { m: d, r: d, pre: true, n: 0 };
    }
  }
  data.today = null;
  save();
  arm();
  return summary();
}

function setReminder(r) {
  load();
  data.reminder = Object.assign({}, data.reminder, r || {});
  save();
  arm();
  return summary();
}

/** نتيجة تسميع: تحدّث حالة الصفحات والسجل. */
function record(e) {
  load();
  const d = dayStr();
  const from = Math.max(1, Number(e.from) || 1);
  const to = Math.min(TOTAL_PAGES, Math.max(from, Number(e.to) || from));
  const score = Math.max(0, Math.min(100, Math.round(Number(e.score) || 0)));
  const thr = data.plan ? data.plan.threshold : 80;
  const kind = ['new', 'review', 'challenge', 'free'].includes(e.kind) ? e.kind : 'free';
  // تعديل نتيجة الجلسة الأخيرة (المستخدم صحّح كلمة سمعها النموذج غلط) بدل سجل جديد
  const last = data.log[data.log.length - 1];
  if (e.amend && last && last.d === d && last.from === from && last.to === to) last.score = score;
  else data.log.push({ d, t: kind, from, to, score, mins: Number(e.mins) || 0 });
  if (data.log.length > 3000) data.log = data.log.slice(-3000);
  if (e.wholePages !== false) {
    for (let p = from; p <= to; p++) {
      const cur = data.pages[p];
      if (kind === 'new') {
        if (score >= thr) data.pages[p] = { m: (cur && cur.m) || d, r: d, s: score, n: ((cur && cur.n) || 0) + 1, pre: cur && cur.m ? cur.pre : undefined };
      } else if (cur && cur.m) {
        cur.r = d;
        cur.s = score;
        cur.n = (cur.n || 0) + 1;
      }
    }
  }
  save();
  arm();
  return summary();
}

function setPages(pages, memorized) {
  load();
  const d = dayStr();
  for (const p of pages || []) {
    if (memorized) data.pages[p] = data.pages[p] && data.pages[p].m ? data.pages[p] : { m: addDays(d, -1), r: addDays(d, -1), pre: true, n: 0 };
    else delete data.pages[p];
  }
  data.today = null;
  save();
  return summary();
}

function reset() {
  data = JSON.parse(JSON.stringify(DEFAULT));
  save();
  arm();
  return summary();
}

/* ─────────── التذكير اليومي ─────────── */
function reminderTime(dayOffset) {
  const r = data.reminder;
  const base = new Date();
  base.setDate(base.getDate() + dayOffset);
  if (r.mode === 'time') {
    const [h, m] = String(r.time || '17:00').split(':').map(Number);
    base.setHours(h || 0, m || 0, 0, 0);
    return base;
  }
  const sched = ctx.getSchedule();
  const pr = sched && sched.prayers && sched.prayers.find((p) => p.key === r.prayer);
  if (!pr || !pr.date) return null;
  const t = new Date(pr.date.getTime() + (Number(r.offset) || 0) * 60000);
  t.setDate(t.getDate() + dayOffset); // الغد تقريبي — يُعاد الحساب عند تحديث المواقيت
  return t;
}

function arm() {
  if (timer) clearTimeout(timer.id);
  timer = null;
  load();
  if (!data.plan || !data.reminder.enabled) return;
  let at = reminderTime(0);
  if (!at) return;
  if (at.getTime() <= Date.now() + 5000) at = reminderTime(1);
  if (!at) return;
  const ms = Math.min(at.getTime() - Date.now(), 2 ** 31 - 1);
  timer = { at: at.getTime(), id: setTimeout(fire, ms) };
}

function fire() {
  timer = null;
  const t = today();
  const leftNew = t.newPages.filter((p) => !t.newDone.includes(p));
  const leftRev = t.review.filter((p) => !t.reviewDone.includes(p));
  if (leftNew.length || leftRev.length) {
    const parts = [];
    if (leftNew.length) parts.push(`حفظ ${leftNew.length === 1 ? 'الوجه ' + leftNew[0] : 'الأوجه ' + leftNew[0] + '–' + leftNew[leftNew.length - 1]}`);
    if (leftRev.length) parts.push(`مراجعة ${leftRev.length} ${leftRev.length <= 10 && leftRev.length > 2 ? 'أوجه' : 'وجه'}`);
    const n = notifier.notify('ذكِّرني — وردك اليوم', parts.join(' · ') + '\nاضغط لتبدأ');
    if (n) n.on('click', () => ctx.openApp('hifz'));
  }
  setTimeout(arm, 60000);
}

function init(c) {
  ctx = Object.assign(ctx, c || {});
  load();
  ipcMain.handle('hifz:get', () => summary());
  ipcMain.handle('hifz:setPlan', (_e, plan, preJuz) => setPlan(plan, preJuz));
  ipcMain.handle('hifz:setReminder', (_e, r) => setReminder(r));
  ipcMain.handle('hifz:record', (_e, entry) => record(entry));
  ipcMain.handle('hifz:setPages', (_e, pages, m) => setPages(pages, m));
  ipcMain.handle('hifz:reset', () => reset());
  ipcMain.handle('hifz:testReminder', () => fire());
  arm();
}

module.exports = { init, arm, summary, record, setPlan, _sequence: sequence };
