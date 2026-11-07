'use strict';
/*
 * يولّد src/main/asr-manifest.json من مجلد حزمة النموذج (ناتج convert.py):
 *   node scripts/asr/manifest.js <مجلد-الحزمة>
 * ثم تُرفع الملفات إلى إصدار GitHub بأسمائها في الحقل name:
 *   node scripts/asr/manifest.js <مجلد-الحزمة> --upload v1.6.0
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const dir = process.argv[2];
if (!dir) { console.error('usage: manifest.js <pack-dir> [--upload <tag>]'); process.exit(1); }

function walk(d, base = '') {
  const out = [];
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) out.push(...walk(path.join(d, e.name), rel));
    else out.push(rel);
  }
  return out;
}

const files = walk(dir).sort().map((rel) => {
  const buf = fs.readFileSync(path.join(dir, rel));
  return {
    name: 'asr-' + rel.replace(/\//g, '-'),
    path: rel,
    size: buf.length,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
  };
});

const out = path.join(__dirname, '..', '..', 'src', 'main', 'asr-manifest.json');
fs.writeFileSync(out, JSON.stringify(files, null, 2) + '\n');
console.log('wrote', out, files.length, 'files', (files.reduce((s, f) => s + f.size, 0) / 1e6).toFixed(1), 'MB');

const up = process.argv.indexOf('--upload');
if (up > 0) {
  const tag = process.argv[up + 1];
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'asr-up-'));
  const args = ['release', 'upload', tag, '--clobber', '--repo', 'mowshcashy/thakrani'];
  for (const f of files) {
    const p = path.join(tmp, f.name);
    fs.copyFileSync(path.join(dir, f.path), p);
    args.push(p);
  }
  execFileSync('gh', args, { stdio: 'inherit' });
  fs.rmSync(tmp, { recursive: true, force: true });
}
