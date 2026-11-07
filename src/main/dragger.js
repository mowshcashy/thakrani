'use strict';
/*
 * dragger.js — سحب الودجتات والتصاقها (snap).
 *
 * لماذا لا نستخدم -webkit-app-region: drag؟
 * على ويندوز مع النوافذ الشفافة تسبب وميضًا عند الضغط، وتبتلع أحداث المرور
 * (فلا يظهر زر الإغلاق)، ولا تسمح لنا بالتدخل أثناء السحب لعمل الالتصاق.
 *
 * الآلية: الواجهة تبلّغ «بدأ السحب» و«انتهى» فقط. العملية الرئيسية تقرأ موضع
 * المؤشر 60 مرة في الثانية وتحرّك النافذة بنفسها مع تطبيق الالتصاق — فلا
 * تضيع حركة حتى لو خرج المؤشر من النافذة بسرعة.
 */

const { ipcMain, screen, BrowserWindow } = require('electron');

const SNAP = 18; // مسافة الجذب بالبكسل
const GAP = 12; // الفراغ بين الودجتات وبينها وبين حافة الشاشة
const START_THRESHOLD = 7; // تحت هذه الحركة تُعدّ نقرة لا سحبًا (رجفة اليد أثناء النقر 2–5 بكسل)

const registry = new Map(); // webContents.id → { win, onEnd }
let active = null;

function register(win, { onEnd } = {}) {
  const id = win.webContents.id;
  registry.set(id, { win, onEnd });
  win.on('closed', () => {
    registry.delete(id);
    if (active && active.id === id) stop(false);
  });
}

/** مستطيلات بقية الودجتات الظاهرة — أهداف للالتصاق. */
function otherRects(selfId) {
  const out = [];
  for (const [id, { win }] of registry) {
    if (id === selfId || win.isDestroyed() || !win.isVisible()) continue;
    out.push(win.getBounds());
  }
  return out;
}

function visibleWindows() {
  return [...registry.values()].map((e) => e.win).filter((w) => !w.isDestroyed() && w.isVisible());
}

/** أقرب مرشّح ضمن مسافة الجذب → {value, d}، أو null إن لم يوجد. */
function nearest(value, candidates) {
  let best = null;
  for (const c of candidates) {
    const d = Math.abs(value - c);
    if (d <= SNAP && (!best || d < best.d)) best = { value: c, d };
  }
  return best;
}

/** يختار بين التصاق الحافة الأولى والثانية — الأقرب منهما، أو يبقي الموضع إن لم يوجد أيّ منهما. */
function pick(pos, size, starts, ends) {
  const s = nearest(pos, starts);
  const e = nearest(pos + size, ends);
  if (s && (!e || s.d <= e.d)) return s.value;
  if (e) return e.value - size;
  return pos;
}

/**
 * يلصق المستطيل بحواف مساحة العمل وبحواف الودجتات الأخرى.
 * يعمل على كل محور مستقلًا: يجرّب الحافة اليسرى والحافة اليمنى ويأخذ الأقرب.
 */
function snap(r, others, wa) {
  const xs = [wa.x + GAP]; // مواضع مرشّحة للحافة اليسرى
  const xe = [wa.x + wa.width - GAP]; // مواضع مرشّحة للحافة اليمنى
  const ys = [wa.y + GAP];
  const ye = [wa.y + wa.height - GAP];

  for (const o of others) {
    // تقارب رأسي → يمكن الالتصاق جنبًا إلى جنب أو محاذاة الحواف الأفقية
    const vClose = r.y < o.y + o.height + SNAP && r.y + r.height > o.y - SNAP;
    const hClose = r.x < o.x + o.width + SNAP && r.x + r.width > o.x - SNAP;
    if (vClose) {
      xs.push(o.x + o.width + GAP, o.x); // يمين الآخر / محاذاة يساره
      xe.push(o.x - GAP, o.x + o.width); // يسار الآخر / محاذاة يمينه
    }
    if (hClose) {
      ys.push(o.y + o.height + GAP, o.y); // تحت الآخر / محاذاة أعلاه
      ye.push(o.y - GAP, o.y + o.height); // فوق الآخر / محاذاة أسفله
    }
  }

  const x = pick(r.x, r.width, xs, xe);
  const y = pick(r.y, r.height, ys, ye);

  // لا تخرج عن الشاشة أبدًا
  return {
    x: Math.round(Math.min(Math.max(x, wa.x), wa.x + wa.width - r.width)),
    y: Math.round(Math.min(Math.max(y, wa.y), wa.y + wa.height - r.height)),
  };
}

function start(id) {
  const entry = registry.get(id);
  if (!entry || entry.win.isDestroyed()) return;
  stop(false);
  const { win } = entry;
  const cursor0 = screen.getCursorScreenPoint();
  const [x0, y0] = win.getPosition();
  const [w, h] = win.getSize();
  const others = otherRects(id);
  active = { id, win, moved: false, timer: null, safety: null };

  active.timer = setInterval(() => {
    if (!active || win.isDestroyed()) return stop(false);
    const c = screen.getCursorScreenPoint();
    const dx = c.x - cursor0.x;
    const dy = c.y - cursor0.y;
    if (!active.moved && Math.abs(dx) + Math.abs(dy) < START_THRESHOLD) return;
    active.moved = true;
    const wa = screen.getDisplayNearestPoint(c).workArea;
    const p = snap({ x: x0 + dx, y: y0 + dy, width: w, height: h }, others, wa);
    const [cx, cy] = win.getPosition();
    // setBounds بالمقاس الأصلي: setPosition وحده يغيّر المقاس مع التكبير الكسري (101٪…)
    if (p.x !== cx || p.y !== cy) win.setBounds({ x: p.x, y: p.y, width: w, height: h });
  }, 16);

  // حماية: لو ضاع حدث «الإفلات» لا يبقى السحب معلّقًا
  active.safety = setTimeout(() => stop(true), 30000);
}

function overlaps(a, b, gap = 0) {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x &&
         a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
}

/**
 * أُفلتت فوق ودجت أخرى؟ انقلها لأقرب مكان فارغ ملاصق (يمين/يسار/فوق/تحت)
 * بدل أن تبقى متراكبة. يعيد الموضع كما هو إن لم يكن هناك تداخل.
 */
function resolveOverlap(r, others, wa) {
  if (!others.some((o) => overlaps(r, o))) return { x: r.x, y: r.y };
  const inside = (p) => p.x >= wa.x && p.y >= wa.y &&
    p.x + r.width <= wa.x + wa.width && p.y + r.height <= wa.y + wa.height;
  const free = (p) => !others.some((o) => overlaps({ ...r, x: p.x, y: p.y }, o, GAP - 1));
  const cands = [];
  for (const o of others) {
    cands.push(
      { x: o.x - GAP - r.width, y: r.y }, { x: o.x + o.width + GAP, y: r.y },
      { x: r.x, y: o.y - GAP - r.height }, { x: r.x, y: o.y + o.height + GAP },
    );
  }
  let best = null;
  for (const p of cands) {
    if (!inside(p) || !free(p)) continue;
    const d = Math.hypot(p.x - r.x, p.y - r.y);
    if (!best || d < best.d) best = { ...p, d };
  }
  return best ? { x: Math.round(best.x), y: Math.round(best.y) } : { x: r.x, y: r.y };
}

function stop(save = true) {
  if (!active) return;
  const { id, win, moved, timer, safety } = active;
  clearInterval(timer);
  clearTimeout(safety);
  active = null;
  if (!save || !moved || win.isDestroyed()) return;

  // إعادة ترتيب عند الإفلات: لا تبقى فوق ودجت أخرى
  const b = win.getBounds();
  const wa = screen.getDisplayMatching(b).workArea;
  const p = resolveOverlap(b, otherRects(id), wa);
  if (p.x !== b.x || p.y !== b.y) win.setBounds({ x: p.x, y: p.y, width: b.width, height: b.height });

  const entry = registry.get(id);
  if (entry && entry.onEnd) entry.onEnd(p.x, p.y);
}

function init() {
  ipcMain.on('wdrag:start', (e) => start(e.sender.id));
  ipcMain.on('wdrag:end', (e) => {
    if (active && active.id === e.sender.id) stop(true);
  });
}

/** يعيد كل نافذة مسجّلة إلى داخل الشاشة (بعد تغيير الدقة أو فصل شاشة). */
function clampAllIntoView(onMoved) {
  for (const [, { win, onEnd }] of registry) {
    if (win.isDestroyed()) continue;
    const b = win.getBounds();
    const wa = screen.getDisplayMatching(b).workArea;
    const x = Math.min(Math.max(b.x, wa.x), wa.x + wa.width - b.width);
    const y = Math.min(Math.max(b.y, wa.y), wa.y + wa.height - b.height);
    if (x !== b.x || y !== b.y) {
      win.setBounds({ x: Math.round(x), y: Math.round(y), width: b.width, height: b.height });
      if (onEnd) onEnd(Math.round(x), Math.round(y));
      if (onMoved) onMoved(win);
    }
  }
}

module.exports = { init, register, snap, resolveOverlap, otherRects, visibleWindows, clampAllIntoView, GAP };
