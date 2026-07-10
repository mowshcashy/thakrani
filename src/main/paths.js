'use strict';
/* مساعدات لتحديد مسارات الملفات في وضعي التطوير والتغليف (asar). */

const path = require('path');

// جذر المشروع: src/main → للأعلى مرتين
const ROOT = path.join(__dirname, '..', '..');

function rendererFile(...parts) {
  return path.join(__dirname, '..', 'renderer', ...parts);
}

function asset(...parts) {
  return path.join(ROOT, 'assets', ...parts);
}

/** للملفات التي يجب أن تكون خارج الأرشيف (مثل الصوت) عند التغليف. */
function assetUnpacked(...parts) {
  return asset(...parts).replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
}

module.exports = { ROOT, rendererFile, asset, assetUnpacked };
