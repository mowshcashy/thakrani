'use strict';
/*
 * make-assets.js — يولّد الأصول اللازمة:
 *   - assets/audio/adhan.wav  (نغمة تذكير افتراضية مُركّبة — قابلة للاستبدال بأذان حقيقي من الإعدادات)
 *   - assets/icons/app.png, tray-base.png, app.ico  (من شعار SVG — يتطلّب sharp + png-to-ico)
 *
 * توليد الصوت لا يحتاج أي تبعية؛ توليد الأيقونات يُتخطّى بأمان إن تعذّر تحميل sharp.
 */

const fs = require('fs');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'assets');
const AUDIO = path.join(ASSETS, 'audio');
const ICONS = path.join(ASSETS, 'icons');

fs.mkdirSync(AUDIO, { recursive: true });
fs.mkdirSync(ICONS, { recursive: true });

// ---------------- الصوت ----------------

function writeWav(filePath, samples, sampleRate = 44100) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), o);
    o += 2;
  }
  fs.writeFileSync(filePath, buf);
}

function note(freq, dur, sampleRate, gain = 0.5) {
  const n = Math.floor(dur * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const vib = 1 + 0.006 * Math.sin(2 * Math.PI * 5.5 * t); // اهتزاز خفيف
    const f = freq * vib;
    let s =
      Math.sin(2 * Math.PI * f * t) * 0.6 +
      Math.sin(2 * Math.PI * 2 * f * t) * 0.22 +
      Math.sin(2 * Math.PI * 3 * f * t) * 0.1;
    const attack = Math.min(1, t / 0.06);
    const release = Math.min(1, (dur - t) / 0.3);
    const env = Math.max(0, Math.min(attack, release));
    out[i] = s * env * gain;
  }
  return out;
}

function generateAdhan() {
  const sr = 44100;
  // لحن هادئ من مقام قريب من البياتي (تذكير وقور، وليس تسجيل أذان حقيقي)
  const seq = [
    [392.0, 0.55], // Sol
    [440.0, 0.55], // La
    [392.0, 0.6],
    [349.23, 0.9], // Fa
    [0, 0.25],
    [392.0, 0.5],
    [523.25, 0.7], // Do
    [466.16, 0.5], // Sib
    [440.0, 0.55],
    [392.0, 1.1],
    [0, 0.3],
    [293.66, 1.2], // Re (استقرار)
  ];
  const chunks = [];
  for (const [f, d] of seq) {
    if (f === 0) chunks.push(new Float32Array(Math.floor(d * sr)));
    else chunks.push(note(f, d, sr, 0.5));
  }
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Float32Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  // تطبيع لطيف
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) {
    const g = 0.9 / peak;
    for (let i = 0; i < out.length; i++) out[i] *= g;
  }
  writeWav(path.join(AUDIO, 'adhan.wav'), out, sr);
  console.log('✔ تم توليد الصوت: assets/audio/adhan.wav');
}

// ---------------- الأيقونات ----------------

// خلفية خضراء متدرّجة بزوايا مستديرة + شعار «ذكِّرني» الأبيض (Tha)
const BG_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0e6b45"/>
      <stop offset="1" stop-color="#073a26"/>
    </linearGradient>
  </defs>
  <rect x="8" y="8" width="240" height="240" rx="56" fill="url(#bg)"/>
</svg>`;

async function generateIcons() {
  const sharp = require('sharp');
  const pngToIco = require('png-to-ico');
  const LOGOS = path.join(ASSETS, 'logos');

  // شعار أبيض بعرض 176px فوق خلفية 256px
  const logoW = 176;
  const logoH = Math.round(logoW * (304.82 / 325.23));
  const logoPng = await sharp(path.join(LOGOS, 'tha-dark.svg'), { density: 300 })
    .resize(logoW, logoH)
    .png()
    .toBuffer();

  const master = await sharp(Buffer.from(BG_SVG))
    .resize(256, 256)
    .composite([{ input: logoPng, left: Math.round((256 - logoW) / 2), top: Math.round((256 - logoH) / 2) }])
    .png()
    .toBuffer();

  await sharp(master).png().toFile(path.join(ICONS, 'app.png'));
  await sharp(master).resize(64, 64).png().toFile(path.join(ICONS, 'tray-base.png'));

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const bufs = await Promise.all(
    sizes.map((s) => sharp(master).resize(s, s).png().toBuffer())
  );
  const ico = await pngToIco(bufs);
  fs.writeFileSync(path.join(ICONS, 'app.ico'), ico);
  console.log('✔ تم توليد الأيقونات من شعار Tha: app.png, tray-base.png, app.ico');
}

(async () => {
  // الأذان الحقيقي (adhan-full.mp3 / adhan-takbeer.mp3) مضمّن كأصل ثابت.
  // نولّد نغمة احتياطية adhan.wav فقط إن لم يوجد أي أذان مضمّن.
  if (!fs.existsSync(path.join(AUDIO, 'adhan-full.mp3'))) generateAdhan();
  try {
    await generateIcons();
  } catch (e) {
    console.warn('⚠ تم تخطّي توليد الأيقونات (تأكّد من تثبيت sharp):', e.message);
  }
})();
