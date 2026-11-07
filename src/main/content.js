'use strict';
/*
 * content.js — تحميل المحتوى المضمّن عند الطلب فقط (الأذكار والمصحف).
 * الملفات كبيرة نسبيًا، فلا تُقرأ إلا عند فتح صفحتها، ثم تبقى في الذاكرة.
 */

const fs = require('fs');
const paths = require('./paths');

let adhkar = null;
let quran = null;
let surahs = null;

function readJSON(name) {
  return JSON.parse(fs.readFileSync(paths.asset('data', name), 'utf8'));
}

function getAdhkar() {
  if (!adhkar) {
    try {
      adhkar = readJSON('adhkar.json');
    } catch (e) {
      console.error('تعذّر تحميل الأذكار:', e.message);
      adhkar = [];
    }
  }
  return adhkar;
}

function getSurahs() {
  if (!surahs) {
    try {
      surahs = readJSON('surahs.json');
    } catch (e) {
      console.error('تعذّر تحميل بيانات السور:', e.message);
      surahs = [];
    }
  }
  return surahs;
}

/**
 * إصلاح خلل في نص المصدر: مسافة بين التنوين وألفه («وُدࣰّ ا» ← «وُدࣰّا»)
 * فتظهر ألف يتيمة. يُصلَح عند التحميل دون تعديل ملف البيانات.
 */
const TANWEEN_GAP = /([\u08F0-\u08F2\u064B-\u064D][\u0610-\u061A\u064B-\u065F\u0670]*)\s+([\u0627\u0649][\u06D6-\u06ED\u0610-\u061A\u064B-\u065F\u0670]*)(?=\s|$)/g;
function fixVerse(t) {
  return String(t).replace(TANWEEN_GAP, '$1$2');
}

function getQuran() {
  if (!quran) {
    try {
      quran = readJSON('quran.json').map((sura) => sura.map(fixVerse));
    } catch (e) {
      console.error('تعذّر تحميل المصحف:', e.message);
      quran = [];
    }
  }
  return quran;
}

/** آيات سورة واحدة (رقم السورة من 1 إلى 114). */
function getSurah(n) {
  const q = getQuran();
  const idx = Number(n) - 1;
  const meta = getSurahs()[idx];
  if (!q[idx] || !meta) return null;
  return { ...meta, verses: q[idx] };
}

/** بحث في نص المصحف (تجاهل التشكيل). النتائج محدودة للأداء. */
function searchQuran(query, limit = 60) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const strip = (s) => s.replace(/[ً-ْٰۖ-ۭـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
  const needle = strip(q);
  const all = getQuran();
  const meta = getSurahs();
  const out = [];
  for (let s = 0; s < all.length && out.length < limit; s++) {
    const verses = all[s];
    for (let v = 0; v < verses.length && out.length < limit; v++) {
      if (strip(verses[v]).includes(needle)) {
        out.push({ surah: s + 1, name: meta[s] ? meta[s].name : '', verse: v + 1, text: verses[v] });
      }
    }
  }
  return out;
}

/** ذكر عشوائي قصير — لإشعارات التذكير. */
function randomDhikr() {
  const cats = getAdhkar();
  if (!cats.length) return null;
  // فضّل الأقسام العامة القصيرة (التسبيح والاستغفار) لتناسب الإشعار
  const preferred = cats.filter((c) => /الاستغفار|التسبيح|الباقيات|أنواع الخير/.test(c.title));
  const pool = preferred.length ? preferred : cats;
  const cat = pool[Math.floor(Math.random() * pool.length)];
  const short = cat.items.filter((i) => i.text.length <= 160);
  const items = short.length ? short : cat.items;
  const item = items[Math.floor(Math.random() * items.length)];
  return item ? { title: cat.title, text: item.text, repeat: item.repeat } : null;
}

/** مجموعة أذكار قصيرة مناسبة لودجت سطح المكتب (نص معقول الطول). */
let pool = null;
function adhkarPool() {
  if (pool) return pool;
  const out = [];
  for (const c of getAdhkar()) {
    for (const it of c.items) {
      const t = it.text.trim();
      if (t.length >= 12 && t.length <= 240) out.push({ title: c.title, text: t, repeat: it.repeat });
    }
  }
  // خلط ثابت لتنوّع العرض
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  pool = out;
  return pool;
}

/** آية عشوائية بطول مناسب لودجت سطح المكتب. */
function randomAyah() {
  const q = getQuran();
  const meta = getSurahs();
  if (!q.length) return null;
  for (let tries = 0; tries < 60; tries++) {
    const s = Math.floor(Math.random() * q.length);
    const v = Math.floor(Math.random() * q[s].length);
    const text = q[s][v];
    if (text && text.length >= 25 && text.length <= 230) {
      return { surah: s + 1, name: meta[s] ? meta[s].name : '', verse: v + 1, text };
    }
  }
  return { surah: 1, name: meta[0] ? meta[0].name : 'الفاتحة', verse: 2, text: q[0][1] };
}

/* ─────────── صفحات مصحف المدينة (٦٠٤ صفحة) ─────────── */
let mushaf = null;
function getMushaf() {
  if (!mushaf) {
    try {
      mushaf = readJSON('mushaf.json');
    } catch (e) {
      console.error('تعذّر تحميل بيانات الصفحات:', e.message);
      mushaf = { pages: [[1, 1]], juz: [[1, 1]], hizbQuarters: [[1, 1]] };
    }
  }
  return mushaf;
}

const cmp = (a, b) => (a[0] - b[0]) || (a[1] - b[1]);

/** آخر عنصر في القائمة يبدأ عند (s,v) أو قبلها → رقمه (يبدأ من 1). */
function indexAt(list, s, v) {
  let lo = 0;
  let hi = list.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cmp(list[mid], [s, v]) <= 0) lo = mid; else hi = mid - 1;
  }
  return lo + 1;
}

function pageOf(s, v) {
  return indexAt(getMushaf().pages, Number(s), Number(v) || 1);
}

/** صفحة كاملة: الآيات مع رأس كل سورة تبدأ فيها، والجزء، وعلامات الأحزاب. */
function getPage(n) {
  const m = getMushaf();
  const q = getQuran();
  const meta = getSurahs();
  const page = Math.min(Math.max(1, Number(n) || 1), m.pages.length);
  const [s0, v0] = m.pages[page - 1];
  const end = m.pages[page] || [115, 1];
  const verses = [];
  let s = s0;
  let v = v0;
  while (cmp([s, v], end) < 0 && q[s - 1]) {
    verses.push({ s, v, text: q[s - 1][v - 1] });
    v++;
    if (v > q[s - 1].length) { s++; v = 1; }
  }
  // أرباع الأحزاب التي تبدأ في هذه الصفحة
  const marks = [];
  m.hizbQuarters.forEach((h, i) => {
    if (cmp(h, [s0, v0]) >= 0 && cmp(h, end) < 0) marks.push({ s: h[0], v: h[1], quarter: i % 4, hizb: Math.floor(i / 4) + 1 });
  });
  const first = verses[0] || { s: s0, v: v0 };
  return {
    page,
    total: m.pages.length,
    juz: indexAt(m.juz, first.s, first.v),
    surahNames: [...new Set(verses.map((x) => x.s))].map((n2) => ({ n: n2, name: meta[n2 - 1] ? meta[n2 - 1].name : '' })),
    verses,
    marks,
  };
}


/* ─────────── أسطر مصحف المدينة (١٥ سطرًا، خط مجمع الملك فهد) ─────────── */
let lines = null;
function getLines() {
  if (!lines) {
    try {
      lines = readJSON('mushaf-lines.json').pages;
    } catch (e) {
      console.error('تعذّر تحميل أسطر المصحف:', e.message);
      lines = [];
    }
  }
  return lines;
}

/**
 * صفحة بأسطرها كما في المصحف المطبوع.
 * كل سطر: {w:[[سورة, آية, رقم الكلمة (0 = علامة نهاية الآية), النص], …]} أو {h: سورة} رأس سورة أو {b:1} بسملة أو {e:1} فارغ.
 */
function getPageLines(n) {
  const all = getLines();
  const page = Math.min(Math.max(1, Number(n) || 1), all.length || 1);
  const base = getPage(page); // الجزء والحزب وأسماء السور
  const meta = getSurahs();
  const ls = (all[page - 1] || []).map((l) => (l && l.h ? { ...l, name: meta[l.h - 1] ? meta[l.h - 1].name : '' } : l));
  return { page, total: all.length, juz: base.juz, marks: base.marks, surahNames: base.surahNames, lines: ls };
}

/** صفحات كل جزء في مصحف المدينة: [[من، إلى] × 30] (٢٠ صفحة لكل جزء، الأول ٢١ والأخير ٢٣). */
function juzRanges() {
  return Array.from({ length: 30 }, (_, i) => (i === 0 ? [1, 21] : i === 29 ? [582, 604] : [2 + 20 * i, 21 + 20 * i]));
}

module.exports = { getAdhkar, getSurahs, getSurah, searchQuran, randomDhikr, adhkarPool, randomAyah, getPage, pageOf, getPageLines, juzRanges };
