'use strict';
/*
 * build-content.js — يبني ملفات المحتوى المضمّنة (تُشغَّل يدويًا عند الحاجة فقط):
 *   assets/data/adhkar.json  — حصن المسلم كاملًا (hisnmuslim.com)
 *   assets/data/quran.json   — المصحف بالرسم العثماني (مجمع الملك فهد عبر tanzil/quran-api)
 *   assets/data/surahs.json  — بيانات السور (اسم، مكية/مدنية، عدد الآيات)
 *
 * التشغيل: node scripts/build-content.js
 */

const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'assets', 'data');
fs.mkdirSync(DATA, { recursive: true });

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function getJSON(url, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json,*/*' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const txt = (await res.text()).replace(/^﻿/, '');
      return JSON.parse(txt);
    } catch (e) {
      if (i === tries) throw e;
      await new Promise((r) => setTimeout(r, 800 * i));
    }
  }
}

/* ─────────── الأذكار ─────────── */
async function buildAdhkar() {
  console.log('⏳ جلب فهرس حصن المسلم…');
  const index = await getJSON('https://www.hisnmuslim.com/api/ar/husn_ar.json');
  const cats = index['العربية'];
  const out = [];

  for (let i = 0; i < cats.length; i++) {
    const c = cats[i];
    try {
      const data = await getJSON(c.TEXT);
      const key = Object.keys(data)[0];
      const items = (data[key] || [])
        .map((x) => ({
          text: String(x.ARABIC_TEXT || '').trim(),
          repeat: Math.max(1, parseInt(x.REPEAT, 10) || 1),
        }))
        .filter((x) => x.text);
      if (items.length) out.push({ id: c.ID, title: c.TITLE.trim(), items });
      process.stdout.write(`\r  ${i + 1}/${cats.length} — ${c.TITLE.slice(0, 30)}                    `);
    } catch (e) {
      console.warn(`\n  ⚠ تعذّر: ${c.TITLE} (${e.message})`);
    }
    await new Promise((r) => setTimeout(r, 120)); // تلطّف مع الخادم
  }

  // ترتيب مقصود: الأقسام اليومية أولًا
  const FIRST = ['أذكار الصباح والمساء', 'الأذكار بعد السلام من الصلاة', 'أذكار النوم', 'أذكار الاستيقاظ من النوم'];
  out.sort((a, b) => {
    const ia = FIRST.indexOf(a.title);
    const ib = FIRST.indexOf(b.title);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return 0;
  });

  fs.writeFileSync(path.join(DATA, 'adhkar.json'), JSON.stringify(out), 'utf8');
  const total = out.reduce((n, c) => n + c.items.length, 0);
  console.log(`\n✔ الأذكار: ${out.length} قسمًا، ${total} ذكرًا`);
}

/* ─────────── القرآن ─────────── */
async function buildQuran() {
  console.log('⏳ جلب المصحف بالرسم العثماني…');
  const q = await getJSON('https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1/editions/ara-quranuthmanihaf.json');
  const verses = q.quran || q;
  if (!Array.isArray(verses) || verses.length !== 6236) {
    throw new Error('عدد الآيات غير متوقع: ' + (verses && verses.length));
  }

  // تجميع الآيات في مصفوفة لكل سورة (أخفّ حجمًا وأسرع قراءة)
  const chapters = [];
  for (const v of verses) {
    const i = v.chapter - 1;
    if (!chapters[i]) chapters[i] = [];
    chapters[i][v.verse - 1] = v.text;
  }
  fs.writeFileSync(path.join(DATA, 'quran.json'), JSON.stringify(chapters), 'utf8');
  console.log(`✔ المصحف: ${chapters.length} سورة، ${verses.length} آية`);

  console.log('⏳ جلب بيانات السور…');
  const info = await getJSON('https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1/info.json');
  const surahs = info.chapters.map((c) => ({
    n: c.chapter,
    // المصدر يعطي الاسم مجرورًا («سُوْرَةُ الْفَاتِحَةِ») → احذف كلمة سورة والحركة الأخيرة
    name: String(c.arabicname || '')
      .replace(/^سُوْرَةُ\s*/, '')
      .trim()
      .replace(/[ً-ْ]+$/, ''),
    en: c.englishname,
    place: /mecca/i.test(c.revelation) ? 'مكية' : 'مدنية',
    ayahs: chapters[c.chapter - 1].length,
  }));
  fs.writeFileSync(path.join(DATA, 'surahs.json'), JSON.stringify(surahs), 'utf8');
  console.log(`✔ السور: ${surahs.length}`);
}

(async () => {
  const only = process.argv[2];
  if (!only || only === 'adhkar') await buildAdhkar();
  if (!only || only === 'quran') await buildQuran();
  console.log('تم.');
})().catch((e) => {
  console.error('✗ فشل:', e.message);
  process.exit(1);
});
