'use strict';
/*
 * tray.js — أيقونة منطقة الإشعارات (بجانب الساعة) + قائمة السياق.
 * الصورة ديناميكية: تُرسم في النافذة الخلفية وتُمرَّر عبر IPC.
 */

const { Tray, Menu, nativeImage } = require('electron');
const paths = require('./paths');

let tray = null;
let handlers = {};

function initialImage() {
  // نبدأ بأيقونة أساسية إن وُجدت، وإلا صورة فارغة (تُستبدل فورًا بالرسم الديناميكي).
  try {
    const img = nativeImage.createFromPath(paths.asset('icons', 'tray-base.png'));
    if (!img.isEmpty()) return img;
  } catch (_) {}
  try {
    const img = nativeImage.createFromPath(paths.asset('icons', 'app.png'));
    if (!img.isEmpty()) return img.resize({ width: 22, height: 22 });
  } catch (_) {}
  return nativeImage.createEmpty();
}

function initTray(h) {
  handlers = h || {};
  if (tray) return tray;
  tray = new Tray(initialImage());
  tray.setToolTip('ذكِّرني — مواقيت الصلاة');
  tray.on('click', () => handlers.onToggle && handlers.onToggle());
  tray.on('double-click', () => handlers.onToggle && handlers.onToggle());
  return tray;
}

function setImage(dataUrl) {
  if (!tray) return;
  try {
    const img = nativeImage.createFromDataURL(dataUrl);
    if (!img.isEmpty()) tray.setImage(img);
  } catch (_) {}
}

function setTooltip(text) {
  if (tray) tray.setToolTip(text);
}

function rebuildMenu({ cities = [], currentCity, viewMode, miniEnabled } = {}) {
  if (!tray) return;

  // تجميع المدن ضمن مناطقها (قائمة فرعية لكل منطقة)
  const regions = cities.filter((c) => c.type === 'region');
  const cityMenu = regions.map((region) => {
    const members = [
      region,
      ...cities.filter((c) => c.type !== 'region' && c.region === region.name),
    ];
    return {
      label: region.name,
      submenu: members.map((m) => ({
        label: m.type === 'region' ? `${m.name} (المنطقة)` : m.name,
        type: 'radio',
        checked: m.name === currentCity,
        click: () => handlers.onPickCity && handlers.onPickCity(m.name),
      })),
    };
  });

  const template = [
    { label: 'إظهار / إخفاء الودجت', click: () => handlers.onToggle && handlers.onToggle() },
    {
      label: 'نوع العرض',
      submenu: [
        {
          label: 'أقرب صلاة',
          type: 'radio',
          checked: viewMode === 'next',
          click: () => handlers.onSetMode && handlers.onSetMode('next'),
        },
        {
          label: 'كل الصلوات',
          type: 'radio',
          checked: viewMode === 'all',
          click: () => handlers.onSetMode && handlers.onSetMode('all'),
        },
      ],
    },
    cityMenu.length
      ? { label: 'المدينة', submenu: cityMenu }
      : { label: 'المدينة', enabled: false },
    {
      label: 'الودجت المصغّر الثابت',
      type: 'checkbox',
      checked: !!miniEnabled,
      click: () => handlers.onToggleMini && handlers.onToggleMini(!miniEnabled),
    },
    { type: 'separator' },
    { label: 'تحديث الآن', click: () => handlers.onRefresh && handlers.onRefresh() },
    { label: 'الإعدادات…', click: () => handlers.onOpenSettings && handlers.onOpenSettings() },
    { type: 'separator' },
    { label: 'خروج', click: () => handlers.onQuit && handlers.onQuit() },
  ];

  tray.setContextMenu(Menu.buildFromTemplate(template));
}

function destroy() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

module.exports = { initTray, setImage, setTooltip, rebuildMenu, destroy };
