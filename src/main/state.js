'use strict';
/*
 * state.js — الحالة المركزية للتطبيق: البيانات، الجدول، الإعدادات.
 * EventEmitter يبثّ 'update' عند أي تغيّر ليستمع له الجميع (الودجت، الإعدادات، الـ tray، المجدول).
 */

const fs = require('fs');
const EventEmitter = require('events');
const { net } = require('electron');
const svc = require('./prayer-service');
const store = require('./store');
const paths = require('./paths');

// net.fetch من Electron: يستخدم شبكة Chromium (مخزن شهادات ويندوز + إكمال سلسلة الشهادة عبر AIA)
const netFetch = (url, opts) => net.fetch(url, opts);

class AppState extends EventEmitter {
  constructor() {
    super();
    this.data = null; // آخر استجابة (لكل المدن)
    this.schedule = null; // جدول المدينة المختارة
    this.online = false;
    this.lastError = null;
    this.cacheFile = null;
    this.cities = []; // قائمة المدن (119 موقعًا بإحداثياتها) من assets/data/cities.json
    this.adhan = null; // مكتبة حساب أم القرى (تُحمَّل مرة واحدة)
    this.resolved = null; // نتيجة حسم مواقيت المدينة المختارة
  }

  // يُستدعى مرة واحدة عند الإقلاع قبل أي حساب: يحمّل المدن ومكتبة الحساب.
  async loadStatics() {
    try {
      this.cities = JSON.parse(fs.readFileSync(paths.asset('data', 'cities.json'), 'utf8'));
    } catch (e) {
      console.error('تعذّر تحميل قائمة المدن:', e.message);
      this.cities = [];
    }
    try {
      const mod = await import('adhan');
      this.adhan = mod.default || mod;
    } catch (e) {
      console.error('تعذّر تحميل مكتبة الحساب (adhan):', e.message);
      this.adhan = null;
    }
  }

  init() {
    this.cacheFile = store.cachePath();
    const cached = svc.readCache(this.cacheFile);
    if (cached) this.data = cached;
    this.recompute();
  }

  get settings() {
    return store.getAll();
  }

  async refreshData() {
    try {
      const data = await svc.fetchToday({ format: 24, fetchImpl: netFetch });
      this.data = data;
      this.online = true;
      this.lastError = null;
      svc.writeCache(this.cacheFile, data);
    } catch (e) {
      this.online = false;
      this.lastError = e.message + (e.cause ? ` | ${e.cause.code || e.cause.message}` : '');
      if (!this.data && this.cacheFile) {
        const c = svc.readCache(this.cacheFile);
        if (c) this.data = c;
      }
    }
    this.recompute();
    return this.data;
  }

  recompute() {
    const s = store.getAll();
    if (this.data) {
      this.resolved = svc.resolveCityTimes({
        data: this.data,
        cities: this.cities,
        cityName: s.city,
        adhan: this.adhan,
      });
      this.schedule = svc.computeSchedule(
        this.resolved ? this.resolved.times : null,
        this.data.gregorianDate,
        new Date()
      );
    }
    this.emit('update', this.getPayload());
  }

  setSettings(patch) {
    store.set(patch);
    this.recompute();
    return store.getAll();
  }

  getPayload() {
    const s = store.getAll();
    const d = this.data;
    const sched = this.schedule;
    return {
      settings: s,
      gregorianDate: d ? d.gregorianDate : null,
      hijriDate: d ? d.hijriDate : null,
      cityNames: d ? svc.getCityNames(d) : [], // المناطق الـ13 من الواجهة (توافقية)
      cities: svc.buildCityList(this.cities), // كل المدن (119) مهيكلة للعرض
      city: s.city,
      cityRegion: this.resolved ? this.resolved.regionName : s.city,
      cityComputed: this.resolved ? !!this.resolved.computed : false,
      prayers: sched ? sched.prayers.map((p) => ({ key: p.key, name: p.name, time: p.time })) : [],
      sunrise: sched && sched.sunrise ? { key: 'sunrise', name: sched.sunrise.name, time: sched.sunrise.time } : null,
      currentKey: sched && sched.current ? sched.current.key : null,
      next: sched && sched.next && sched.next.date
        ? {
            key: sched.next.key,
            name: sched.next.name,
            time: sched.next.time,
            isTomorrow: !!sched.next.isTomorrow,
            ts: sched.next.date.getTime(),
          }
        : null,
      fetchedAt: d ? d.fetchedAt : null,
      online: this.online,
      stale: d ? !svc.isCacheForToday(d) : true,
      lastError: this.lastError,
    };
  }
}

module.exports = new AppState();
