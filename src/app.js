import { CITIES, cityById } from './cities.js';
import { STRINGS, formatDateLabel, formatTime, diffBadgeText } from './i18n.js';
import {
  zonedParts, zonedTimeToUtc, offsetDiffHours, dayRelation,
  DAY_START_HOUR, DAY_END_HOUR,
} from './timezone.js';
import { Timeline } from './timeline.js';

const STORAGE_KEY = 'tz-timeline-settings';
const CELL_W = 28;

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const roundToMinute = (ms) => Math.floor(ms / 60000) * 60000;

const state = {
  cityA: 'tokyo',
  cityB: 'vancouver',
  lang: 'en',
  theme: 'dark',
  cursorUtc: roundToMinute(Date.now()),
};

const THEME_COLORS = { dark: '#131418', light: '#f6f5f1' }; // keep in sync with style.css --bg

function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (raw && cityById(raw.cityA) && cityById(raw.cityB)) {
      state.cityA = raw.cityA;
      state.cityB = raw.cityB;
    }
    if (raw && (raw.lang === 'en' || raw.lang === 'ja')) state.lang = raw.lang;
    if (raw && (raw.theme === 'dark' || raw.theme === 'light')) state.theme = raw.theme;
  } catch { /* corrupt storage -> defaults */ }
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      cityA: state.cityA, cityB: state.cityB, lang: state.lang, theme: state.theme,
    }));
  } catch { /* private mode etc. */ }
}

function fillSelect(select, selectedId) {
  const stale = select.options.length !== CITIES.length
    || select.options[0].textContent !== CITIES[0][state.lang];
  if (stale) {
    select.textContent = '';
    for (const c of CITIES) {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c[state.lang];
      select.appendChild(opt);
    }
  }
  select.value = selectedId;
}

function renderCard(card, name, tz, rel) {
  const s = STRINGS[state.lang];
  const p = zonedParts(state.cursorUtc, tz);
  const isDay = p.hour >= DAY_START_HOUR && p.hour < DAY_END_HOUR;
  card.querySelector('.meta-text').textContent = `${name} · ${formatDateLabel(state.lang, p)}`;
  const badge = card.querySelector('.day-badge');
  badge.hidden = rel === 0;
  if (rel !== 0) badge.textContent = rel < 0 ? s.prevDay : s.nextDay;
  card.querySelector('.card-time').textContent = formatTime(p);
  // SVG elements have no `hidden` IDL property, so toggle the attribute.
  card.querySelector('.icon-sun').toggleAttribute('hidden', !isDay);
  card.querySelector('.icon-moon').toggleAttribute('hidden', isDay);
}

// Cheap updates that follow every cursor move (incl. continuous drags).
function renderReadouts() {
  const a = cityById(state.cityA);
  const b = cityById(state.cityB);
  $('badge').textContent = diffBadgeText(
    state.lang, a[state.lang], b[state.lang],
    offsetDiffHours(state.cursorUtc, a.tz, b.tz),
  );
  renderCard($('card-a'), a[state.lang], a.tz, 0);
  renderCard($('card-b'), b[state.lang], b.tz, dayRelation(state.cursorUtc, a.tz, b.tz));
  const pa = zonedParts(state.cursorUtc, a.tz);
  const dateInput = $('date-input');
  if (document.activeElement !== dateInput) {
    dateInput.value = `${pa.year}-${pad(pa.month)}-${pad(pa.day)}`;
  }
  const timeInput = $('time-input');
  if (document.activeElement !== timeInput) {
    timeInput.value = `${pad(pa.hour)}:${pad(pa.minute)}`;
  }
  const cursorEl = $('tl-cursor');
  cursorEl.setAttribute(
    'aria-valuetext',
    `${a[state.lang]} ${formatDateLabel(state.lang, pa)} ${formatTime(pa)}`,
  );
  cursorEl.setAttribute('aria-valuenow', String(pa.hour * 60 + pa.minute));
  timeline.setCursor(state.cursorUtc);
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  document.querySelector('meta[name="theme-color"]').setAttribute('content', THEME_COLORS[state.theme]);
  const s = STRINGS[state.lang];
  const label = state.theme === 'dark' ? s.themeToLight : s.themeToDark;
  const btn = $('theme-toggle');
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.querySelector('.icon-sun').toggleAttribute('hidden', state.theme !== 'dark');
  btn.querySelector('.icon-moon').toggleAttribute('hidden', state.theme === 'dark');
}

// Full re-render: strings, selects, timeline rebuild. Use on city/lang change.
function renderAll() {
  const s = STRINGS[state.lang];
  const a = cityById(state.cityA);
  const b = cityById(state.cityB);
  document.documentElement.lang = state.lang;
  document.title = s.title;
  $('title-text').textContent = s.title;
  $('lang-en').classList.toggle('active', state.lang === 'en');
  $('lang-ja').classList.toggle('active', state.lang === 'ja');
  $('lang-en').setAttribute('aria-pressed', String(state.lang === 'en'));
  $('lang-ja').setAttribute('aria-pressed', String(state.lang === 'ja'));
  applyTheme();
  $('swap').setAttribute('aria-label', s.swap);
  $('select-a').setAttribute('aria-label', s.cityA);
  $('select-b').setAttribute('aria-label', s.cityB);
  $('date-input').setAttribute('aria-label', s.jumpDate);
  $('tl-cursor').setAttribute('aria-label', s.cursorLabel);
  $('now-btn-label').textContent = s.now;
  $('now-marker-label').textContent = s.now;
  $('hint').textContent = s.hint;
  $('label-a').textContent = a[state.lang];
  $('label-b').textContent = b[state.lang];
  $('time-label').textContent = s.setTime(a[state.lang]);
  fillSelect($('select-a'), state.cityA);
  fillSelect($('select-b'), state.cityB);
  timeline.setConfig({ zones: [{ tz: a.tz }, { tz: b.tz }], lang: state.lang });
  timeline.setNow(Date.now());
  timeline.rebuild(state.cursorUtc);
  renderReadouts();
}

function onPick(utc) {
  state.cursorUtc = utc;
  renderReadouts();
}

function bindEvents() {
  $('select-a').addEventListener('change', (e) => {
    state.cityA = e.target.value;
    saveSettings();
    renderAll();
    timeline.scrollToTime(state.cursorUtc, false);
  });
  $('select-b').addEventListener('change', (e) => {
    state.cityB = e.target.value;
    saveSettings();
    renderAll();
    timeline.scrollToTime(state.cursorUtc, false);
  });
  $('swap').addEventListener('click', () => {
    [state.cityA, state.cityB] = [state.cityB, state.cityA];
    saveSettings();
    renderAll();
    timeline.scrollToTime(state.cursorUtc, false);
  });
  $('date-input').addEventListener('change', (e) => {
    if (!e.target.value) return;
    const [y, m, d] = e.target.value.split('-').map(Number);
    if (y < 1000) return; // partially-typed year (Chrome fires change per segment keystroke)
    const a = cityById(state.cityA);
    const p = zonedParts(state.cursorUtc, a.tz);
    state.cursorUtc = zonedTimeToUtc(
      { year: y, month: m, day: d, hour: p.hour, minute: p.minute }, a.tz,
    );
    renderReadouts();
    timeline.scrollToTime(state.cursorUtc);
  });
  $('time-input').addEventListener('change', (e) => {
    if (!e.target.value) return;
    const [h, mi] = e.target.value.split(':').map(Number);
    const a = cityById(state.cityA);
    const p = zonedParts(state.cursorUtc, a.tz);
    state.cursorUtc = zonedTimeToUtc(
      { year: p.year, month: p.month, day: p.day, hour: h, minute: mi }, a.tz,
    );
    renderReadouts();
    timeline.scrollToTime(state.cursorUtc);
  });
  $('date-input').addEventListener('blur', renderReadouts);
  $('time-input').addEventListener('blur', renderReadouts);
  $('now-btn').addEventListener('click', () => {
    state.cursorUtc = roundToMinute(Date.now());
    timeline.setNow(Date.now());
    renderReadouts();
    timeline.scrollToTime(state.cursorUtc);
  });
  $('lang-en').addEventListener('click', () => setLang('en'));
  $('lang-ja').addEventListener('click', () => setLang('ja'));
  $('theme-toggle').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    saveSettings();
    applyTheme();
  });
}

function setLang(lang) {
  if (state.lang === lang) return;
  state.lang = lang;
  saveSettings();
  renderAll();
  timeline.scrollToTime(state.cursorUtc, false);
}

// --- bootstrap ---
if (!window.Intl || !Intl.DateTimeFormat.prototype.formatToParts) {
  const u = $('unsupported');
  u.hidden = false;
  u.textContent = STRINGS.en.unsupported;
  throw new Error('Intl unsupported');
}

loadSettings();
const timeline = new Timeline($('timeline'), { cellWidth: CELL_W, onPick });
bindEvents();
renderAll();
// Center the cursor after layout settles; clientWidth can still be 0 here.
requestAnimationFrame(() => timeline.scrollToTime(state.cursorUtc, false));
setInterval(() => timeline.setNow(Date.now()), 60000);
