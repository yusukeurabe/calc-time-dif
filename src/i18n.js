// UI strings and formatters. lang is 'en' | 'ja'.

const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const STRINGS = {
  en: {
    title: 'Time zone timeline',
    now: 'Now',
    swap: 'Swap cities',
    hint: 'Swipe sideways to move through days · drag the handle or tap to pick a time',
    setTime: (city) => `Set time in ${city}`,
    cityA: 'City A',
    cityB: 'City B',
    jumpDate: 'Jump to date',
    cursorLabel: 'Timeline cursor',
    prevDay: 'Previous day',
    nextDay: 'Next day',
    behind: (b, n, a) => `${b} is ${n} ${n === '1' ? 'hour' : 'hours'} behind ${a}`,
    ahead: (b, n, a) => `${b} is ${n} ${n === '1' ? 'hour' : 'hours'} ahead of ${a}`,
    same: () => 'Both cities share the same time',
    unsupported: 'Sorry, your browser is not supported.',
  },
  ja: {
    title: '時差タイムライン',
    now: '現在',
    swap: '都市を入れ替え',
    hint: '横にスワイプで日付を移動 · つまみをドラッグ／タップで時刻を選択',
    setTime: (city) => `${city}の時刻を直接指定`,
    cityA: '都市A',
    cityB: '都市B',
    jumpDate: '日付へジャンプ',
    cursorLabel: 'タイムラインカーソル',
    prevDay: '前日',
    nextDay: '翌日',
    behind: (b, n, a) => `${b}は${a}より${n}時間遅れ`,
    ahead: (b, n, a) => `${b}は${a}より${n}時間進み`,
    same: () => '2都市は同じ時刻です',
    unsupported: 'お使いのブラウザは対応していません。',
  },
};

export function formatDateLabel(lang, { year, month, day }) {
  const wd = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (lang === 'ja') return `${month}月${day}日（${WEEKDAYS_JA[wd]}）`;
  return `${WEEKDAYS_EN[wd]}, ${MONTHS_EN[month - 1]} ${day}`;
}

export function formatTime({ hour, minute }) {
  return `${hour}:${String(minute).padStart(2, '0')}`;
}

function formatHours(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function diffBadgeText(lang, cityAName, cityBName, diffHours) {
  const s = STRINGS[lang];
  if (diffHours === 0) return s.same();
  const n = formatHours(Math.abs(diffHours));
  return diffHours < 0 ? s.behind(cityBName, n, cityAName) : s.ahead(cityBName, n, cityAName);
}
