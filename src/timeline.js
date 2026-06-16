// Timeline rendering: two aligned hour strips, date bands, cursor, now marker.
import { HOUR, hourCells, floorToZonedHour, zonedParts, parseDateKey, dateKeyOf } from './timezone.js';
import { formatDateLabel } from './i18n.js';

const RANGE_DAYS = 21;       // days of DOM rendered at once
const EDGE_DAYS = 3;         // recenter when scrolled within this of an edge
const SHIFT_DAYS = 7;        // how far to shift when recentering
const SNAP_MS = 15 * 60000;  // cursor snap step

function el(className, text) {
  const d = document.createElement('div');
  d.className = className;
  if (text !== undefined) d.textContent = text;
  return d;
}

export class Timeline {
  constructor(root, { cellWidth, onPick }) {
    this.cellWidth = cellWidth;
    this.onPick = onPick;
    this.lang = 'en';
    this.zones = []; // [{tz}, {tz}]
    this.cursorUtc = 0;
    this.nowUtc = 0;
    this.rangeStart = 0; // utc ms at x=0
    this.scroller = root.querySelector('.tl-scroller');
    this.track = root.querySelector('.tl-track');
    this.stripsEl = root.querySelector('.tl-strips');
    this.cursorEl = root.querySelector('.tl-cursor');
    this.nowEl = root.querySelector('.tl-now');
    this._bindEvents();
  }

  setConfig({ zones, lang }) {
    this.zones = zones;
    this.lang = lang;
  }

  xForUtc(utc) { return ((utc - this.rangeStart) / HOUR) * this.cellWidth; }
  utcForX(x) { return this.rangeStart + (x / this.cellWidth) * HOUR; }

  rebuild(centerUtc) {
    const anchor = floorToZonedHour(centerUtc, this.zones[0].tz);
    this._rebuildFromStart(anchor - (RANGE_DAYS / 2) * 24 * HOUR);
  }

  _rebuildFromStart(startUtc) {
    this.rangeStart = startUtc;
    const rangeEnd = startUtc + RANGE_DAYS * 24 * HOUR;
    this.track.style.width = `${this.xForUtc(rangeEnd)}px`;
    this.stripsEl.textContent = '';
    this.zones.forEach((zone, i) => {
      const strip = this._buildStrip(zone, rangeEnd);
      strip.classList.add(i === 0 ? 'tl-strip-a' : 'tl-strip-b');
      this.stripsEl.appendChild(strip);
    });
    this._positionMarkers();
  }

  _buildStrip({ tz }, rangeEnd) {
    const strip = el('tl-strip');
    const cells = hourCells(this.rangeStart, rangeEnd, tz);
    const todayKey = dateKeyOf(zonedParts(this.nowUtc, tz));
    let segStart = 0;
    cells.forEach((c, i) => {
      const cell = el(`tl-cell ${c.isDay ? 'day' : 'night'}${c.hour === 0 ? ' midnight' : ''}`);
      // The hour digit marks the start of the hour (h:00), so it sits centered
      // on the cell's left edge — the same x the cursor/now/midnight bars use.
      cell.appendChild(el('tl-hour', String(c.hour)));
      cell.style.left = `${this.xForUtc(c.utc)}px`;
      cell.style.width = `${this.cellWidth}px`;
      strip.appendChild(cell);
      if (c.hour === 0 && i > 0) {
        const line = el('tl-midnight-line');
        line.style.left = `${this.xForUtc(c.utc)}px`;
        strip.appendChild(line);
      }
      const last = i === cells.length - 1;
      if (last || cells[i + 1].dateKey !== c.dateKey) {
        const x0 = this.xForUtc(cells[segStart].utc);
        const x1 = last ? this.xForUtc(c.utc) + this.cellWidth : this.xForUtc(cells[i + 1].utc);
        const seg = el(`tl-seg${c.dateKey === todayKey ? ' today' : ''}`);
        // Sticky inner label stays readable while a multi-day segment scrolls by.
        const segLabel = document.createElement('span');
        segLabel.textContent = formatDateLabel(this.lang, parseDateKey(c.dateKey));
        seg.appendChild(segLabel);
        seg.style.left = `${x0}px`;
        seg.style.width = `${x1 - x0}px`;
        strip.appendChild(seg);
        segStart = i + 1;
      }
    });
    return strip;
  }

  setCursor(utc) { this.cursorUtc = utc; this._positionMarkers(); }
  setNow(utc) {
    const prev = this.nowUtc;
    this.nowUtc = utc;
    if (this.zones.length && this.rangeStart) {
      const flipped = this.zones.some(
        ({ tz }) => dateKeyOf(zonedParts(prev, tz)) !== dateKeyOf(zonedParts(utc, tz)),
      );
      if (flipped) {
        this._rebuildFromStart(this.rangeStart);
        return;
      }
    }
    this._positionMarkers();
  }

  _positionMarkers() {
    if (!this.rangeStart) return;
    const trackW = RANGE_DAYS * 24 * this.cellWidth;
    for (const [marker, utc] of [[this.cursorEl, this.cursorUtc], [this.nowEl, this.nowUtc]]) {
      const x = this.xForUtc(utc);
      marker.style.visibility = x < 0 || x > trackW ? 'hidden' : '';
      marker.style.left = `${x}px`;
    }
  }

  scrollToTime(utc, smooth = true) {
    const rangeEnd = this.rangeStart + RANGE_DAYS * 24 * HOUR;
    const pad = (this.scroller.clientWidth / (2 * this.cellWidth)) * HOUR;
    const margin = EDGE_DAYS * 24 * HOUR + pad;
    let rebuilt = false;
    if (utc < this.rangeStart + margin || utc > rangeEnd - margin) {
      this.rebuild(utc);
      rebuilt = true;
    }
    const left = Math.max(0, this.xForUtc(utc) - this.scroller.clientWidth / 2);
    this.scroller.scrollTo({ left, behavior: smooth && !rebuilt ? 'smooth' : 'auto' });
  }

  _pickAtX(x) {
    const utc = Math.round(this.utcForX(x) / SNAP_MS) * SNAP_MS;
    this.onPick(utc);
  }

  _bindEvents() {
    // Tap (pointer travelled < 8px) picks a time; horizontal pan scrolls natively.
    this.track.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.tl-cursor')) return;
      this._tap = { x: e.clientX, y: e.clientY };
    });
    this.track.addEventListener('pointerup', (e) => {
      if (!this._tap || e.target.closest('.tl-cursor')) { this._tap = null; return; }
      const moved = Math.abs(e.clientX - this._tap.x) + Math.abs(e.clientY - this._tap.y);
      this._tap = null;
      if (moved < 8) {
        const rect = this.track.getBoundingClientRect();
        this._pickAtX(e.clientX - rect.left);
      }
    });
    this.track.addEventListener('pointercancel', () => { this._tap = null; });
    // Dragging the cursor handle.
    this.cursorEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.cursorEl.focus({ preventScroll: true });
      this.cursorEl.setPointerCapture(e.pointerId);
      this._dragging = true;
    });
    this.cursorEl.addEventListener('pointermove', (e) => {
      if (!this._dragging) return;
      const rect = this.track.getBoundingClientRect();
      this._pickAtX(e.clientX - rect.left);
    });
    this.cursorEl.addEventListener('pointerup', () => { this._dragging = false; });
    this.cursorEl.addEventListener('pointercancel', () => { this._dragging = false; });
    // Keyboard: arrow keys nudge the pick by one snap step.
    this.cursorEl.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.onPick(Math.ceil(this.cursorUtc / SNAP_MS) * SNAP_MS - SNAP_MS);
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.onPick(Math.floor(this.cursorUtc / SNAP_MS) * SNAP_MS + SNAP_MS);
      }
    });
    // Infinite scroll via recentering, deferred to scroll idle so a
    // programmatic scrollLeft write never kills touch fling momentum.
    this.scroller.addEventListener('scroll', () => {
      clearTimeout(this._scrollIdleTimer);
      this._scrollIdleTimer = setTimeout(() => this._maybeRecenter(), 150);
    });
  }

  _maybeRecenter() {
    const edgePx = EDGE_DAYS * 24 * this.cellWidth;
    const max = this.track.offsetWidth - this.scroller.clientWidth;
    const sl = this.scroller.scrollLeft;
    let shiftDays = 0;
    if (sl < edgePx) shiftDays = -SHIFT_DAYS;
    else if (sl > max - edgePx) shiftDays = SHIFT_DAYS;
    if (!shiftDays) return;
    this._rebuildFromStart(this.rangeStart + shiftDays * 24 * HOUR);
    this.scroller.scrollLeft = sl - shiftDays * 24 * this.cellWidth;
  }
}
