'use strict';
/* منطق نافذة الإعدادات */

const form = document.getElementById('form');
let settings = null;
let cities = [];

const PRAYERS = [
  ['fajr', 'الفجر'],
  ['dhuhr', 'الظهر'],
  ['asr', 'العصر'],
  ['maghrib', 'المغرب'],
  ['isha', 'العشاء'],
];

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function sw(action, checked) {
  return `<label class="switch"><input type="checkbox" data-action="${action}" ${checked ? 'checked' : ''}/><span class="track"></span><span class="thumb"></span></label>`;
}

function fileName(p) {
  if (!p) return 'الأذان المضمّن';
  return p.split(/[\\/]/).pop();
}

function buildCityOptions(selected) {
  if (!cities.length) return `<option selected>${esc(selected)}</option>`;
  const regions = cities.filter((c) => c.type === 'region').sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  return regions
    .map((region) => {
      const members = [
        region,
        ...cities
          .filter((c) => c.type !== 'region' && c.region === region.name)
          .sort((a, b) => a.name.localeCompare(b.name, 'ar')),
      ];
      const opts = members
        .map((m) =>
          `<option value="${esc(m.name)}" ${m.name === selected ? 'selected' : ''}>${esc(m.name)}${m.type === 'region' ? ' — المنطقة' : ''}</option>`
        )
        .join('');
      return `<optgroup label="${esc(region.name)}">${opts}</optgroup>`;
    })
    .join('');
}

function cityDesc(selected) {
  const entry = cities.find((c) => c.name === selected);
  if (entry && entry.type !== 'region') {
    return `محسوبة بطريقة أم القرى ومثبّتة على مواقيت ${esc(entry.region)}`;
  }
  return 'مواقيت أم القرى الرسمية';
}

function render() {
  if (!settings) return;
  const s = settings;

  const cityOptions = buildCityOptions(s.city);

  form.innerHTML = `
    <div class="section">
      <div class="section-title">العرض</div>
      <div class="group">
        <div class="row">
          <div class="ltext"><span class="label">المدينة</span><span class="desc">${cityDesc(s.city)}</span></div>
          <select data-action="city">${cityOptions}</select>
        </div>
        <div class="row">
          <div class="ltext"><span class="label">نوع العرض</span></div>
          <div class="seg">
            <button data-action="mode-next" class="${s.viewMode === 'next' ? 'active' : ''}">أقرب صلاة</button>
            <button data-action="mode-all" class="${s.viewMode === 'all' ? 'active' : ''}">كل الصلوات</button>
          </div>
        </div>
        <div class="row">
          <div class="ltext"><span class="label">تنسيق الوقت</span></div>
          <div class="seg">
            <button data-action="fmt-12" class="${s.timeFormat === 12 ? 'active' : ''}">١٢ ساعة</button>
            <button data-action="fmt-24" class="${s.timeFormat === 24 ? 'active' : ''}">٢٤ ساعة</button>
          </div>
        </div>
        <div class="row">
          <div class="ltext"><span class="label">المظهر</span></div>
          <select data-action="theme">
            <option value="auto" ${s.theme === 'auto' ? 'selected' : ''}>تلقائي (حسب النظام)</option>
            <option value="light" ${s.theme === 'light' ? 'selected' : ''}>فاتح</option>
            <option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>داكن</option>
          </select>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">التنبيهات</div>
      <div class="group">
        ${PRAYERS.map(([k, name]) => `
          <div class="row">
            <div class="ltext"><span class="label">تنبيه ${name}</span></div>
            ${sw('notif-' + k, s.notifications[k])}
          </div>`).join('')}
      </div>
    </div>

    <div class="section">
      <div class="section-title">الأذان</div>
      <div class="group">
        <div class="row">
          <div class="ltext"><span class="label">تشغيل صوت الأذان</span><span class="desc">عند دخول وقت الصلاة</span></div>
          ${sw('adhan-enabled', s.adhanEnabled)}
        </div>
        <div class="row">
          <div class="ltext"><span class="label">نوع الأذان</span><span class="desc">التكبيرات تتوقف عند الثانية ١٦</span></div>
          <div class="seg">
            <button data-action="adhan-full" class="${s.adhanMode !== 'takbeer' ? 'active' : ''}">أذان كامل</button>
            <button data-action="adhan-takbeer" class="${s.adhanMode === 'takbeer' ? 'active' : ''}">تكبيرات فقط</button>
          </div>
        </div>
        <div class="row">
          <div class="ltext"><span class="label">تشغيل الصوت عند</span><span class="desc">الأذان، الإقامة، أو كليهما</span></div>
          <div class="seg">
            <button data-action="timing-adhan" class="${s.adhanTiming === 'adhan' || !s.adhanTiming ? 'active' : ''}">الأذان</button>
            <button data-action="timing-iqama" class="${s.adhanTiming === 'iqama' ? 'active' : ''}">الإقامة</button>
            <button data-action="timing-both" class="${s.adhanTiming === 'both' ? 'active' : ''}">الاثنين</button>
          </div>
        </div>
        <div class="row">
          <div class="ltext"><span class="label">وقت الإقامة</span><span class="desc">بعد الأذان — يظهر عدّادها في الودجت</span></div>
          <div class="seg">
            ${[5, 10, 15, 20].map((m) =>
              `<button data-action="iqama-${m}" class="${(s.iqamaOffset || 10) === m ? 'active' : ''}">${window.ZN.toArabicDigits(m)} د</button>`
            ).join('')}
          </div>
        </div>
        <div class="row">
          <div class="ltext"><span class="label">مستوى الصوت</span></div>
          <input type="range" min="0" max="1" step="0.05" value="${s.adhanVolume}" data-action="adhan-volume"/>
        </div>
        <div class="row">
          <div class="ltext"><span class="label">ملف الأذان</span><span class="adhan-file">${esc(fileName(s.adhanFile))}</span></div>
          <div class="footer-actions">
            <button class="btn" data-action="adhan-test">تجربة</button>
            <button class="btn brand" data-action="adhan-pick">اختيار…</button>
          </div>
        </div>
        ${s.adhanFile ? `<div class="row"><div class="ltext"><span class="desc">استعادة المقطع الافتراضي</span></div><button class="btn" data-action="adhan-reset">افتراضي</button></div>` : ''}
      </div>
    </div>

    <div class="section">
      <div class="section-title">النظام</div>
      <div class="group">
        <div class="row">
          <div class="ltext"><span class="label">التشغيل عند بدء ويندوز</span></div>
          ${sw('autostart', s.autoStart)}
        </div>
        <div class="row">
          <div class="ltext"><span class="label">الودجت المصغّر الثابت</span><span class="desc">شريط شفاف صغير: الوقت والصلاة القادمة</span></div>
          ${sw('mini-enabled', s.miniEnabled)}
        </div>
        <div class="row">
          <div class="ltext"><span class="label">إظهار الودجت</span></div>
          <button class="btn" data-action="show-widget">إظهار</button>
        </div>
        <div class="row">
          <div class="ltext"><span class="label">إنهاء التطبيق</span><span class="desc">يوقف التنبيهات والأيقونة</span></div>
          <button class="btn" data-action="quit">خروج</button>
        </div>
      </div>
    </div>

    <div class="footer-note">
      <img class="footer-logo when-light" src="../../../assets/logos/tha-light.svg" alt=""/>
      <img class="footer-logo when-dark" src="../../../assets/logos/tha-dark.svg" alt=""/><br/>
      ذكِّرنـي · الإصدار ١٫٠ · بواسطة Moath Alwashmi<br/>
      المواقيت من التقويم الرسمي السعودي — أم القرى
    </div>`;
}

async function patch(p) {
  settings = await window.zn.setSettings(p);
  render();
}

form.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'mode-next') return patch({ viewMode: 'next' });
  if (a === 'mode-all') return patch({ viewMode: 'all' });
  if (a === 'fmt-12') return patch({ timeFormat: 12 });
  if (a === 'fmt-24') return patch({ timeFormat: 24 });
  if (a === 'adhan-full') return patch({ adhanMode: 'full' });
  if (a === 'adhan-takbeer') return patch({ adhanMode: 'takbeer' });
  if (a === 'timing-adhan') return patch({ adhanTiming: 'adhan' });
  if (a === 'timing-iqama') return patch({ adhanTiming: 'iqama' });
  if (a === 'timing-both') return patch({ adhanTiming: 'both' });
  if (a.startsWith('iqama-')) return patch({ iqamaOffset: parseInt(a.slice(6), 10) });
  if (a === 'adhan-test') return window.zn.testAdhan();
  if (a === 'adhan-pick') {
    const f = await window.zn.pickAdhan();
    if (f) { settings = await window.zn.getSettings(); render(); }
    return;
  }
  if (a === 'adhan-reset') return patch({ adhanFile: null });
  if (a === 'show-widget') return window.zn.showWidget();
  if (a === 'quit') return window.zn.quit();
});

form.addEventListener('change', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'city') return patch({ city: el.value });
  if (a === 'theme') return patch({ theme: el.value });
  if (a === 'adhan-volume') return patch({ adhanVolume: parseFloat(el.value) });
  if (a === 'adhan-enabled') return patch({ adhanEnabled: el.checked });
  if (a === 'autostart') return patch({ autoStart: el.checked });
  if (a === 'mini-enabled') return patch({ miniEnabled: el.checked });
  if (a.startsWith('notif-')) {
    const key = a.slice('notif-'.length);
    return patch({ notifications: { [key]: el.checked } });
  }
});

// اشتراك لتحديث قائمة المدن والقيم
window.zn.onState((p) => {
  cities = p.cities && p.cities.length ? p.cities : cities;
  settings = p.settings;
  window.ZN.applyTheme(settings.theme);
  render();
});

(async () => {
  const st = await window.zn.getState();
  settings = st ? st.settings : await window.zn.getSettings();
  cities = st && st.cities ? st.cities : [];
  window.ZN.applyTheme(settings.theme);
  render();
})();
