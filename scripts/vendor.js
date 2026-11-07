'use strict';
/*
 * vendor.js — يجلب ملفي transformers.js المستخدمين في محرّك التسميع من npm
 * (إصدار ثابت + تحقّق sha256) إلى src/renderer/vendor/transformers/.
 *
 * لماذا لا يُحفظان في المستودع؟ الملف المضغوط فيه أسماء نماذج يظنّها فاحص
 * الأسرار في GitHub «مفاتيح API» فيرفض الدفع. وهكذا أيضًا لا نثبّت الحزمة كاملة
 * (تسحب onnxruntime-node بحجم ~٣٠٠ ميجا) — نأخذ ملفين فقط من أرشيفها.
 *
 *   node scripts/vendor.js   (يعمل تلقائيًا ضمن npm run assets)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const PKG = '@huggingface/transformers@4.3.2';
const FILES = {
  'transformers.min.js': '8b5a3171f8876bab2b1820a7d65eb87628e3d30bb5ea85b9dd398e76eb34decb',
  'ort-wasm-simd-threaded.jsep.mjs': 'c2f80e915e9df63289788a99d434d8c4e00e64e9c1f030f4b80b022458dd2c99',
};
const OUT = path.join(__dirname, '..', 'src', 'renderer', 'vendor', 'transformers');

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const ok = (name) => fs.existsSync(path.join(OUT, name)) && sha(path.join(OUT, name)) === FILES[name];

if (Object.keys(FILES).every(ok)) {
  console.log('vendor: transformers.js موجودة ✓');
  process.exit(0);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zn-vendor-'));
try {
  const tgz = execSync(`npm pack ${PKG} --silent`, { cwd: tmp, encoding: 'utf8' }).trim().split(/\r?\n/).pop();
  execSync(`tar -xzf "${tgz}"`, { cwd: tmp });
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, hash] of Object.entries(FILES)) {
    const src = path.join(tmp, 'package', 'dist', name);
    if (sha(src) !== hash) throw new Error(`بصمة ${name} لا تطابق — توقّف`);
    fs.copyFileSync(src, path.join(OUT, name));
  }
  fs.copyFileSync(path.join(tmp, 'package', 'LICENSE'), path.join(OUT, 'LICENSE'));
  console.log('vendor: نُزّلت transformers.js ✓');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
