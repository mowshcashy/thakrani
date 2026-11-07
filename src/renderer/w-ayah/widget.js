'use strict';
/* آية من المصحف تتبدّل كل ١٠ دقائق، مع زر «آية أخرى» */

const root = document.getElementById('root');
const ROTATE_MS = 10 * 60 * 1000;
const ar = (s) => window.ZN.toArabicDigits(s);
let timer = null;

root.innerHTML = `
  <div class="glass" id="card">
    <button class="w-close" data-wclose title="إخفاء">&times;</button>
    <div class="head">
      <img src="../../../assets/logos/tha-dark.svg" alt="" />
      <span>آية</span>
    </div>
    <div class="text" id="text">…</div>
    <div class="foot">
      <span class="ref" id="ref"></span>
      <button class="w-btn" id="next">آية أخرى</button>
    </div>
  </div>`;

const $ = (id) => document.getElementById(id);

async function load(animate = true) {
  const a = await window.zn.randomAyah();
  if (!a) return;
  const paint = () => {
    $('text').textContent = a.text;
    $('ref').textContent = `سورة ${a.name}، آية ${ar(a.verse)}`;
    $('text').classList.remove('fade');
    window.WK.fit($('card'));
  };
  if (animate) {
    $('text').classList.add('fade');
    setTimeout(paint, 260);
  } else {
    paint();
  }
  clearTimeout(timer);
  timer = setTimeout(() => load(), ROTATE_MS);
}

$('next').addEventListener('click', () => load());

window.WK.onState(() => {});
window.WK.enableDrag();
load(false);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => window.WK.fit($('card')));
