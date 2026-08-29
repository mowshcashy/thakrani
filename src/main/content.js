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

function getQuran() {
  if (!quran) {
    try {
      quran = readJSON('quran.json');
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

module.exports = { getAdhkar, getSurahs, getSurah, searchQuran, randomDhikr };
