# Time zone timeline 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 日本↔バンクーバー（デフォルト）の時差を、横スクロール可能な連動タイムラインで視覚的に変換できる静的ウェブアプリを作り、Vercel に公開する。

**Architecture:** フレームワークなしの静的サイト（ES Modules、ビルドなし）。純ロジック（`src/timezone.js`、Intl API ベース）と DOM 層（`src/timeline.js`, `src/app.js`）を分離し、ロジックのみ `node --test` でユニットテストする。タイムラインは「21日分の DOM を描画し、端に近づいたら範囲をずらして scrollLeft を補正する」リセンタリング方式で実質無限スクロールを実現する。

**Tech Stack:** HTML / CSS / vanilla JavaScript (ESM), Intl.DateTimeFormat, localStorage, node:test, Vercel（静的ホスティング）

**Spec:** `docs/superpowers/specs/2026-06-12-timezone-timeline-design.md`

**注意（実行環境）:** このリポジトリでは `.git` への書き込みがサンドボックスで拒否されるため、`git commit` 等は sandbox 無効の Bash で実行する必要がある。

---

## ファイル構成（最終形）

```
calc-time-dif/
├── package.json          … type:module / test スクリプト
├── .gitignore
├── index.html            … ページ骨格
├── style.css             … 全スタイル（ライトのみ）
├── src/
│   ├── timezone.js       … 純ロジック（DOM非依存・Intlベース）
│   ├── cities.js         … 都市データ（IANA ID・EN/JA名）
│   ├── i18n.js           … UI文言とフォーマッタ（EN/JA）
│   ├── timeline.js       … タイムライン描画・スクロール・カーソル（DOM）
│   └── app.js            … 状態・イベント結線・描画（エントリポイント）
└── tests/
    ├── timezone.test.js
    └── i18n.test.js
```

---

### Task 1: プロジェクト雛形

**Files:**
- Create: `package.json`
- Create: `.gitignore`

- [ ] **Step 1: Node のバージョン確認**

Run: `node --version`
Expected: v18 以上（Intl full-ICU 内蔵）。v18 未満なら停止してユーザーに報告。

- [ ] **Step 2: package.json を作成**

```json
{
  "name": "calc-time-dif",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/"
  }
}
```

- [ ] **Step 3: .gitignore を作成**

```
.DS_Store
node_modules/
.vercel
```

- [ ] **Step 4: Commit**

```bash
git add package.json .gitignore
git commit -m "chore: project scaffold (ESM, node:test)"
```

---

### Task 2: timezone.js — zonedParts / offsetMinutes

**Files:**
- Create: `src/timezone.js`
- Create: `tests/timezone.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`tests/timezone.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zonedParts, offsetMinutes } from '../src/timezone.js';

const TOKYO = 'Asia/Tokyo';
const VAN = 'America/Vancouver';

test('zonedParts: UTC 2026-06-12T02:00Z is Tokyo 11:00', () => {
  const p = zonedParts(Date.UTC(2026, 5, 12, 2, 0), TOKYO);
  assert.deepEqual(
    { y: p.year, m: p.month, d: p.day, h: p.hour, min: p.minute },
    { y: 2026, m: 6, d: 12, h: 11, min: 0 },
  );
});

test('zonedParts: midnight comes back as hour 0, not 24', () => {
  const p = zonedParts(Date.UTC(2026, 5, 11, 15, 0), TOKYO); // Tokyo 00:00
  assert.equal(p.hour, 0);
});

test('offsetMinutes: Tokyo is always UTC+9', () => {
  assert.equal(offsetMinutes(Date.UTC(2026, 0, 15), TOKYO), 540);
  assert.equal(offsetMinutes(Date.UTC(2026, 6, 15), TOKYO), 540);
});

test('offsetMinutes: Vancouver is PST (-480) in winter, PDT (-420) in summer', () => {
  assert.equal(offsetMinutes(Date.UTC(2026, 0, 15), VAN), -480);
  assert.equal(offsetMinutes(Date.UTC(2026, 6, 15), VAN), -420);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test`
Expected: FAIL（`src/timezone.js` が存在しない / ERR_MODULE_NOT_FOUND）

- [ ] **Step 3: 実装**

`src/timezone.js`:

```js
// Pure time zone logic. No DOM. All instants are UTC milliseconds.

export const HOUR = 3600000;
export const DAY_START_HOUR = 6;  // first daylight hour (inclusive)
export const DAY_END_HOUR = 18;   // first evening hour (day is [6,18))

const partFormatters = new Map();

function getPartFormatter(timeZone) {
  let f = partFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
      hourCycle: 'h23',
    });
    partFormatters.set(timeZone, f);
  }
  return f;
}

// Local wall-clock parts of a UTC instant in an IANA zone.
// -> {year, month(1-12), day, hour(0-23), minute, second}
export function zonedParts(utcMs, timeZone) {
  const out = {};
  for (const { type, value } of getPartFormatter(timeZone).formatToParts(utcMs)) {
    if (type !== 'literal') out[type] = Number(value);
  }
  if (out.hour === 24) out.hour = 0;
  return out;
}

// Zone's UTC offset in minutes at an instant (Tokyo = +540).
export function offsetMinutes(utcMs, timeZone) {
  const p = zonedParts(utcMs, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - utcMs) / 60000);
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: PASS（4 tests）

- [ ] **Step 5: Commit**

```bash
git add src/timezone.js tests/timezone.test.js
git commit -m "feat: zonedParts/offsetMinutes (Intl-based timezone core)"
```

---

### Task 3: timezone.js — zonedTimeToUtc（壁時計→UTC変換）

**Files:**
- Modify: `src/timezone.js`（末尾に追記）
- Modify: `tests/timezone.test.js`（末尾に追記）

- [ ] **Step 1: 失敗するテストを追記**

```js
import { zonedTimeToUtc } from '../src/timezone.js'; // 既存の import 文に追加する

test('zonedTimeToUtc: Tokyo 2026-06-12 11:00 -> 02:00 UTC', () => {
  assert.equal(
    zonedTimeToUtc({ year: 2026, month: 6, day: 12, hour: 11 }, TOKYO),
    Date.UTC(2026, 5, 12, 2),
  );
});

test('zonedTimeToUtc: roundtrips across DST in Vancouver', () => {
  // 夏 (PDT)
  const summer = zonedTimeToUtc({ year: 2026, month: 7, day: 1, hour: 12 }, VAN);
  assert.equal(summer, Date.UTC(2026, 6, 1, 19));
  // 冬 (PST)
  const winter = zonedTimeToUtc({ year: 2026, month: 1, day: 15, hour: 12 }, VAN);
  assert.equal(winter, Date.UTC(2026, 0, 15, 20));
});

test('cross-zone: Japan Fri Jun 12 11:00 = Vancouver Thu Jun 11 19:00', () => {
  const utc = zonedTimeToUtc({ year: 2026, month: 6, day: 12, hour: 11 }, TOKYO);
  const v = zonedParts(utc, VAN);
  assert.deepEqual(
    { y: v.year, m: v.month, d: v.day, h: v.hour },
    { y: 2026, m: 6, d: 11, h: 19 },
  );
});
```

- [ ] **Step 2: 失敗確認**

Run: `npm test`
Expected: 新規3テストが FAIL（zonedTimeToUtc is not exported）

- [ ] **Step 3: 実装を追記**

`src/timezone.js` 末尾:

```js
// Convert a wall-clock time in a zone to a UTC instant.
// Ambiguous times (DST fall-back) resolve to the earlier occurrence.
// Nonexistent times (spring-forward gap) resolve to a nearby instant.
export function zonedTimeToUtc(wall, timeZone) {
  const { year, month, day, hour = 0, minute = 0, second = 0 } = wall;
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  let utc = naive - offsetMinutes(naive, timeZone) * 60000;
  // One correction pass handles instants near offset transitions.
  utc = naive - offsetMinutes(utc, timeZone) * 60000;
  return utc;
}
```

- [ ] **Step 4: 成功確認**

Run: `npm test`
Expected: PASS（7 tests）

- [ ] **Step 5: Commit**

```bash
git add src/timezone.js tests/timezone.test.js
git commit -m "feat: zonedTimeToUtc wall-clock conversion"
```

---

### Task 4: timezone.js — 時刻境界ユーティリティ

**Files:**
- Modify: `src/timezone.js`（末尾に追記）
- Modify: `tests/timezone.test.js`（末尾に追記）

- [ ] **Step 1: 失敗するテストを追記**

```js
import { floorToZonedHour, startOfZonedDay, nextZonedMidnight } from '../src/timezone.js'; // import に追加

test('floorToZonedHour: floors to the local hour boundary', () => {
  const utc = Date.UTC(2026, 5, 12, 2, 45, 30); // Tokyo 11:45:30
  assert.equal(floorToZonedHour(utc, TOKYO), Date.UTC(2026, 5, 12, 2));
});

test('floorToZonedHour: works in a half-hour zone (Delhi, UTC+5:30)', () => {
  const utc = Date.UTC(2026, 5, 12, 10, 45); // Delhi 16:15
  assert.equal(floorToZonedHour(utc, 'Asia/Kolkata'), Date.UTC(2026, 5, 12, 10, 30));
});

test('startOfZonedDay / nextZonedMidnight: normal 24h day', () => {
  const noon = zonedTimeToUtc({ year: 2026, month: 6, day: 12, hour: 12 }, TOKYO);
  const start = startOfZonedDay(noon, TOKYO);
  assert.equal(start, Date.UTC(2026, 5, 11, 15)); // Tokyo Jun 12 00:00
  assert.equal(nextZonedMidnight(noon, TOKYO) - start, 24 * 3600000);
});

test('nextZonedMidnight: spring-forward day is 23h, fall-back day is 25h', () => {
  const mar8 = zonedTimeToUtc({ year: 2026, month: 3, day: 8 }, VAN);
  assert.equal(nextZonedMidnight(mar8, VAN) - mar8, 23 * 3600000);
  const nov1 = zonedTimeToUtc({ year: 2026, month: 11, day: 1 }, VAN);
  assert.equal(nextZonedMidnight(nov1, VAN) - nov1, 25 * 3600000);
});
```

- [ ] **Step 2: 失敗確認**

Run: `npm test`
Expected: 新規4テストが FAIL

- [ ] **Step 3: 実装を追記**

```js
// UTC instant of the most recent local hour boundary at or before utcMs.
export function floorToZonedHour(utcMs, timeZone) {
  const p = zonedParts(utcMs, timeZone);
  return utcMs - p.minute * 60000 - p.second * 1000 - (utcMs % 1000);
}

// UTC instant of local midnight of the day containing utcMs.
export function startOfZonedDay(utcMs, timeZone) {
  const p = zonedParts(utcMs, timeZone);
  return zonedTimeToUtc({ year: p.year, month: p.month, day: p.day }, timeZone);
}

// UTC instant of the next local midnight strictly after utcMs.
// (start + 30h always lands inside the next local day, even on 23/25h days.)
export function nextZonedMidnight(utcMs, timeZone) {
  return startOfZonedDay(startOfZonedDay(utcMs, timeZone) + 30 * HOUR, timeZone);
}
```

- [ ] **Step 4: 成功確認**

Run: `npm test`
Expected: PASS（11 tests）

- [ ] **Step 5: Commit**

```bash
git add src/timezone.js tests/timezone.test.js
git commit -m "feat: local hour/day boundary helpers"
```

---

### Task 5: timezone.js — 時差・日付関係・時間セル生成

**Files:**
- Modify: `src/timezone.js`（末尾に追記）
- Modify: `tests/timezone.test.js`（末尾に追記）

- [ ] **Step 1: 失敗するテストを追記**

```js
import { offsetDiffHours, dayRelation, hourCells, parseDateKey, dateKeyOf } from '../src/timezone.js'; // import に追加

test('offsetDiffHours: Vancouver vs Tokyo is -16 in summer, -17 in winter', () => {
  assert.equal(offsetDiffHours(Date.UTC(2026, 6, 15), TOKYO, VAN), -16);
  assert.equal(offsetDiffHours(Date.UTC(2026, 0, 15), TOKYO, VAN), -17);
});

test('dayRelation: previous / next / same day', () => {
  const utc = zonedTimeToUtc({ year: 2026, month: 6, day: 12, hour: 11 }, TOKYO);
  assert.equal(dayRelation(utc, TOKYO, VAN), -1); // Vancouver is previous day
  assert.equal(dayRelation(utc, VAN, TOKYO), 1);
  const overlap = zonedTimeToUtc({ year: 2026, month: 6, day: 12, hour: 17 }, TOKYO);
  assert.equal(dayRelation(overlap, TOKYO, VAN), 0); // Vancouver 01:00 same date
});

test('hourCells: a normal day has 24 cells with hours 0..23', () => {
  const start = zonedTimeToUtc({ year: 2026, month: 6, day: 11 }, VAN);
  const cells = hourCells(start, nextZonedMidnight(start, VAN), VAN);
  assert.equal(cells.length, 24);
  assert.equal(cells[0].hour, 0);
  assert.equal(cells[23].hour, 23);
  assert.ok(cells.every((c) => c.dateKey === '2026-06-11'));
});

test('hourCells: DST spring-forward day has 23 cells and skips hour 2', () => {
  const start = zonedTimeToUtc({ year: 2026, month: 3, day: 8 }, VAN);
  const cells = hourCells(start, nextZonedMidnight(start, VAN), VAN);
  assert.equal(cells.length, 23);
  assert.deepEqual(cells.slice(0, 4).map((c) => c.hour), [0, 1, 3, 4]);
});

test('hourCells: DST fall-back day has 25 cells and repeats hour 1', () => {
  const start = zonedTimeToUtc({ year: 2026, month: 11, day: 1 }, VAN);
  const cells = hourCells(start, nextZonedMidnight(start, VAN), VAN);
  assert.equal(cells.length, 25);
  assert.deepEqual(cells.slice(0, 4).map((c) => c.hour), [0, 1, 1, 2]);
});

test('hourCells: day/night flags flip at 6:00 and 18:00', () => {
  const start = zonedTimeToUtc({ year: 2026, month: 6, day: 12 }, TOKYO);
  const cells = hourCells(start, start + 24 * 3600000, TOKYO);
  assert.equal(cells[5].isDay, false);
  assert.equal(cells[6].isDay, true);
  assert.equal(cells[17].isDay, true);
  assert.equal(cells[18].isDay, false);
});

test('dateKeyOf / parseDateKey roundtrip', () => {
  assert.equal(dateKeyOf({ year: 2026, month: 6, day: 1 }), '2026-06-01');
  assert.deepEqual(parseDateKey('2026-06-01'), { year: 2026, month: 6, day: 1 });
});
```

- [ ] **Step 2: 失敗確認**

Run: `npm test`
Expected: 新規7テストが FAIL

- [ ] **Step 3: 実装を追記**

```js
// Signed hour difference "zoneB minus zoneA" at an instant (can be fractional).
export function offsetDiffHours(utcMs, zoneA, zoneB) {
  return (offsetMinutes(utcMs, zoneB) - offsetMinutes(utcMs, zoneA)) / 60;
}

// -1 if zoneB's local date is the day before zoneA's, +1 the day after, 0 same.
export function dayRelation(utcMs, zoneA, zoneB) {
  const a = zonedParts(utcMs, zoneA);
  const b = zonedParts(utcMs, zoneB);
  const diff = Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day);
  return Math.round(diff / 86400000);
}

export function dateKeyOf(p) {
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function parseDateKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return { year, month, day };
}

// Hour cells covering [utcStartMs, utcEndMs) in zone. One cell per existing
// local hour: {utc, hour, isDay, dateKey}. DST days yield 23/25 cells.
export function hourCells(utcStartMs, utcEndMs, timeZone) {
  const cells = [];
  for (let t = floorToZonedHour(utcStartMs, timeZone); t < utcEndMs; t += HOUR) {
    const p = zonedParts(t, timeZone);
    cells.push({
      utc: t,
      hour: p.hour,
      isDay: p.hour >= DAY_START_HOUR && p.hour < DAY_END_HOUR,
      dateKey: dateKeyOf(p),
    });
  }
  return cells;
}
```

- [ ] **Step 4: 成功確認**

Run: `npm test`
Expected: PASS（18 tests）

- [ ] **Step 5: Commit**

```bash
git add src/timezone.js tests/timezone.test.js
git commit -m "feat: offset diff, day relation, hour cell generation"
```

---

### Task 6: cities.js と i18n.js

**Files:**
- Create: `src/cities.js`
- Create: `src/i18n.js`
- Create: `tests/i18n.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`tests/i18n.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDateLabel, formatTime, diffBadgeText, STRINGS } from '../src/i18n.js';
import { CITIES, cityById } from '../src/cities.js';

test('formatDateLabel: EN and JA', () => {
  assert.equal(formatDateLabel('en', { year: 2026, month: 6, day: 12 }), 'Fri, Jun 12');
  assert.equal(formatDateLabel('ja', { year: 2026, month: 6, day: 12 }), '6月12日（金）');
});

test('formatTime: 24h, zero-padded minutes only', () => {
  assert.equal(formatTime({ hour: 9, minute: 5 }), '9:05');
  assert.equal(formatTime({ hour: 19, minute: 0 }), '19:00');
});

test('diffBadgeText: behind / ahead / same / fractional', () => {
  assert.equal(
    diffBadgeText('en', 'Japan (Tokyo)', 'Vancouver', -16),
    'Vancouver is 16 hours behind Japan (Tokyo)',
  );
  assert.equal(
    diffBadgeText('ja', '日本（東京）', 'バンクーバー', -16),
    'バンクーバーは日本（東京）より16時間遅れ',
  );
  assert.equal(diffBadgeText('en', 'A', 'B', 5.5), 'B is 5.5 hours ahead of A');
  assert.equal(diffBadgeText('en', 'A', 'B', 0), 'Both cities share the same time');
});

test('cities: defaults exist and have valid IANA zones', () => {
  assert.equal(cityById('tokyo').tz, 'Asia/Tokyo');
  assert.equal(cityById('vancouver').tz, 'America/Vancouver');
  for (const c of CITIES) {
    // throws RangeError if tz is not a valid IANA identifier
    new Intl.DateTimeFormat('en-US', { timeZone: c.tz });
    assert.ok(c.en && c.ja && c.id);
  }
});

test('STRINGS: en and ja expose the same keys', () => {
  assert.deepEqual(Object.keys(STRINGS.en).sort(), Object.keys(STRINGS.ja).sort());
});
```

- [ ] **Step 2: 失敗確認**

Run: `npm test`
Expected: i18n.test.js が FAIL（モジュールが存在しない）

- [ ] **Step 3: cities.js を実装**

`src/cities.js`:

```js
// Built-in city list. tz = IANA time zone ID.
export const CITIES = [
  { id: 'tokyo', tz: 'Asia/Tokyo', en: 'Japan (Tokyo)', ja: '日本（東京）' },
  { id: 'vancouver', tz: 'America/Vancouver', en: 'Vancouver', ja: 'バンクーバー' },
  { id: 'losangeles', tz: 'America/Los_Angeles', en: 'Los Angeles', ja: 'ロサンゼルス' },
  { id: 'sanfrancisco', tz: 'America/Los_Angeles', en: 'San Francisco', ja: 'サンフランシスコ' },
  { id: 'denver', tz: 'America/Denver', en: 'Denver', ja: 'デンバー' },
  { id: 'chicago', tz: 'America/Chicago', en: 'Chicago', ja: 'シカゴ' },
  { id: 'newyork', tz: 'America/New_York', en: 'New York', ja: 'ニューヨーク' },
  { id: 'toronto', tz: 'America/Toronto', en: 'Toronto', ja: 'トロント' },
  { id: 'honolulu', tz: 'Pacific/Honolulu', en: 'Honolulu', ja: 'ホノルル' },
  { id: 'london', tz: 'Europe/London', en: 'London', ja: 'ロンドン' },
  { id: 'paris', tz: 'Europe/Paris', en: 'Paris', ja: 'パリ' },
  { id: 'berlin', tz: 'Europe/Berlin', en: 'Berlin', ja: 'ベルリン' },
  { id: 'madrid', tz: 'Europe/Madrid', en: 'Madrid', ja: 'マドリード' },
  { id: 'dubai', tz: 'Asia/Dubai', en: 'Dubai', ja: 'ドバイ' },
  { id: 'delhi', tz: 'Asia/Kolkata', en: 'Delhi', ja: 'デリー' },
  { id: 'bangkok', tz: 'Asia/Bangkok', en: 'Bangkok', ja: 'バンコク' },
  { id: 'singapore', tz: 'Asia/Singapore', en: 'Singapore', ja: 'シンガポール' },
  { id: 'hongkong', tz: 'Asia/Hong_Kong', en: 'Hong Kong', ja: '香港' },
  { id: 'shanghai', tz: 'Asia/Shanghai', en: 'Shanghai', ja: '上海' },
  { id: 'seoul', tz: 'Asia/Seoul', en: 'Seoul', ja: 'ソウル' },
  { id: 'taipei', tz: 'Asia/Taipei', en: 'Taipei', ja: '台北' },
  { id: 'sydney', tz: 'Australia/Sydney', en: 'Sydney', ja: 'シドニー' },
  { id: 'auckland', tz: 'Pacific/Auckland', en: 'Auckland', ja: 'オークランド' },
];

export function cityById(id) {
  return CITIES.find((c) => c.id === id);
}
```

- [ ] **Step 4: i18n.js を実装**

`src/i18n.js`:

```js
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
    setTime: 'Set time in',
    prevDay: 'Previous day',
    nextDay: 'Next day',
    behind: (b, n, a) => `${b} is ${n} hours behind ${a}`,
    ahead: (b, n, a) => `${b} is ${n} hours ahead of ${a}`,
    same: () => 'Both cities share the same time',
    unsupported: 'Sorry, your browser is not supported.',
  },
  ja: {
    title: '時差タイムライン',
    now: '現在',
    swap: '都市を入れ替え',
    hint: '横にスワイプで日付を移動 · つまみをドラッグ／タップで時刻を選択',
    setTime: '時刻を直接指定:',
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
```

- [ ] **Step 5: 成功確認**

Run: `npm test`
Expected: PASS（全テスト。timezone 18 + i18n 5）

- [ ] **Step 6: Commit**

```bash
git add src/cities.js src/i18n.js tests/i18n.test.js
git commit -m "feat: city catalogue and EN/JA i18n strings"
```

---

### Task 7: index.html と style.css（静的骨格）

**Files:**
- Create: `index.html`
- Create: `style.css`

- [ ] **Step 1: index.html を作成**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Time zone timeline</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<main class="app">
  <header class="topbar">
    <h1 id="title-text">Time zone timeline</h1>
    <div class="top-right">
      <span id="badge" class="badge"></span>
      <div class="lang-toggle" role="group" aria-label="Language">
        <button id="lang-en" type="button" class="active">EN</button>
        <button id="lang-ja" type="button">日本語</button>
      </div>
    </div>
  </header>

  <p id="unsupported" class="unsupported" hidden></p>

  <section class="controls">
    <select id="select-a" aria-label="City A"></select>
    <button id="swap" type="button" aria-label="Swap cities">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h14M13 4l4 4-4 4M21 16H7M11 12l-4 4 4 4"/></svg>
    </button>
    <select id="select-b" aria-label="City B"></select>
    <input id="date-input" type="date" aria-label="Jump to date">
    <button id="now-btn" type="button"><span id="now-btn-label">Now</span></button>
  </section>

  <section class="timeline" id="timeline">
    <div class="tl-scroller">
      <div class="tl-track">
        <div class="tl-strips"></div>
        <div class="tl-now" aria-hidden="true"><span class="tl-now-label" id="now-marker-label">Now</span></div>
        <div class="tl-cursor" id="tl-cursor"><span class="tl-cursor-handle"></span></div>
      </div>
    </div>
    <div class="tl-label" id="label-a"></div>
    <div class="tl-label" id="label-b"></div>
    <p class="hint" id="hint"></p>
  </section>

  <section class="cards">
    <div class="card" id="card-a">
      <p class="card-meta"><span class="meta-text"></span><span class="day-badge" hidden></span></p>
      <p class="card-time-row">
        <svg class="icon-sun" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#BA7517" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/></svg>
        <svg class="icon-moon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#534AB7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" hidden><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>
        <span class="card-time"></span>
      </p>
    </div>
    <div class="card" id="card-b">
      <p class="card-meta"><span class="meta-text"></span><span class="day-badge" hidden></span></p>
      <p class="card-time-row">
        <svg class="icon-sun" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#BA7517" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/></svg>
        <svg class="icon-moon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#534AB7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" hidden><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>
        <span class="card-time"></span>
      </p>
    </div>
  </section>

  <section class="direct-input">
    <label id="time-label" for="time-input"></label>
    <input id="time-input" type="time">
  </section>
</main>
<script type="module" src="src/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: style.css を作成**

```css
:root {
  --bg: #f6f5f1;
  --surface: #ffffff;
  --text: #1f1e1c;
  --muted: #6b6a66;
  --border: #e3e1da;
  --day: #fac775;
  --day-text: #412402;
  --night: #afa9ec;
  --night-text: #26215c;
  --accent: #185fa5;
  --accent-bg: #e6f1fb;
  --accent-border: #b5d4f4;
  --warn-bg: #faeeda;
  --warn-text: #854f0b;
  --now: #1d9e75;
  --radius: 12px;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif;
}

.app { max-width: 880px; margin: 0 auto; padding: 16px 16px 40px; }

.topbar {
  display: flex; align-items: center; justify-content: space-between;
  flex-wrap: wrap; gap: 8px; margin-bottom: 14px;
}
.topbar h1 { font-size: 20px; font-weight: 600; margin: 0; }

.top-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

.badge {
  background: var(--accent-bg); color: var(--accent);
  font-size: 13px; padding: 4px 12px; border-radius: 8px;
}

.lang-toggle { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.lang-toggle button {
  border: none; background: var(--surface); color: var(--muted);
  font-size: 12px; padding: 5px 10px; cursor: pointer;
}
.lang-toggle button.active { background: var(--accent-bg); color: var(--accent); font-weight: 600; }

.unsupported { background: var(--warn-bg); color: var(--warn-text); padding: 12px; border-radius: 8px; }

.controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
.controls select { flex: 1; min-width: 130px; }
.controls select, .controls input, .controls button {
  font: inherit; font-size: 14px; padding: 7px 10px;
  border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text);
}
.controls button { cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.controls button:hover { background: var(--bg); }

.timeline {
  position: relative; background: var(--surface);
  border: 1px solid var(--border); border-radius: var(--radius);
  padding: 10px 0 6px; margin-bottom: 14px;
}
.tl-scroller { overflow-x: auto; }
.tl-track { position: relative; height: 168px; }
.tl-strips { position: absolute; inset: 0; }

.tl-strip { position: absolute; left: 0; right: 0; height: 54px; }
.tl-strip:first-child { top: 22px; }
.tl-strip:last-child { top: 104px; }

.tl-cell {
  position: absolute; top: 0; height: 32px;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; user-select: none;
}
.tl-cell.day { background: var(--day); color: var(--day-text); }
.tl-cell.night { background: var(--night); color: var(--night-text); }
.tl-cell.midnight { font-weight: 700; }

.tl-seg {
  position: absolute; top: 32px; height: 22px;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden;
  background: var(--bg); color: var(--muted); border: 1px solid var(--border);
}
.tl-seg.today { background: var(--accent-bg); color: var(--accent); border-color: var(--accent-border); }

.tl-midnight-line {
  position: absolute; top: -4px; height: 62px; width: 2px;
  background: var(--text); z-index: 2;
}
.tl-midnight-line::after {
  content: "0:00"; position: absolute; top: -14px; left: -12px;
  font-size: 11px; color: var(--muted);
}

.tl-cursor {
  position: absolute; top: 22px; height: 136px; width: 2px;
  background: var(--text); z-index: 4; cursor: grab; touch-action: none;
}
.tl-cursor::before { content: ""; position: absolute; left: -11px; top: -14px; width: 24px; height: 100%; }
.tl-cursor-handle {
  position: absolute; top: -9px; left: -6px; width: 14px; height: 14px;
  border-radius: 50%; background: var(--text);
}

.tl-now {
  position: absolute; top: 20px; height: 140px; width: 0;
  border-left: 2px dashed var(--now); z-index: 3; pointer-events: none;
}
.tl-now-label { position: absolute; top: -16px; left: -12px; font-size: 11px; color: var(--now); white-space: nowrap; }

.tl-label {
  position: absolute; left: 12px; z-index: 5; pointer-events: none;
  font-size: 12px; font-weight: 600;
  background: rgba(255, 255, 255, 0.88); padding: 1px 7px; border-radius: 6px;
}
#label-a { top: 14px; }
#label-b { top: 96px; }

.hint { font-size: 12px; color: var(--muted); text-align: center; margin: 10px 8px 4px; }

.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; margin-bottom: 14px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 18px; }
.card-meta { font-size: 13px; color: var(--muted); margin: 0 0 6px; display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.day-badge { background: var(--warn-bg); color: var(--warn-text); font-size: 11px; padding: 2px 8px; border-radius: 8px; }
.card-time-row { display: flex; align-items: center; gap: 8px; margin: 0; }
.card-time { font-size: 30px; font-weight: 600; }

.direct-input { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.direct-input label { font-size: 13px; color: var(--muted); }
.direct-input input {
  font: inherit; font-size: 14px; padding: 7px 10px;
  border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text);
}

[hidden] { display: none !important; }
```

- [ ] **Step 3: ローカルで表示確認**

Run: `python3 -m http.server 8765` をバックグラウンドで起動し、ブラウザ（または Claude のプレビュー/Playwright ツール）で `http://localhost:8765` を開く。
Expected: スタイル適用済みの骨格が表示される（タイムラインはまだ空。コンソールに app.js の 404 エラーが出るのは次タスクで解消されるため許容）。

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit -m "feat: static page skeleton and styles"
```

---

### Task 8: timeline.js（タイムライン描画・カーソル・リセンタリング）

**Files:**
- Create: `src/timeline.js`

挙動の要点:
- 21日分の DOM を一括描画。スクロールが端から3日以内に来たら範囲を7日ずらし、`scrollLeft` を同量補正（見た目は連続＝実質無限スクロール）
- x座標は「UTC ミリ秒からの線形変換」: `x = (utc - rangeStart) / HOUR * cellWidth`。これにより両都市のバーの整列・30分オフセット都市・DSTのズレがすべて自動で正しくなる
- タップ（移動距離 8px 未満の pointerup）で時刻選択、カーソルはハンドルをドラッグ。横スワイプはネイティブスクロールに任せる
- 選択は15分単位にスナップ

- [ ] **Step 1: 実装**

`src/timeline.js`:

```js
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
    for (const zone of this.zones) this.stripsEl.appendChild(this._buildStrip(zone, rangeEnd));
    this._positionMarkers();
  }

  _buildStrip({ tz }, rangeEnd) {
    const strip = el('tl-strip');
    const cells = hourCells(this.rangeStart, rangeEnd, tz);
    const todayKey = dateKeyOf(zonedParts(this.nowUtc, tz));
    let segStart = 0;
    cells.forEach((c, i) => {
      const cell = el(
        `tl-cell ${c.isDay ? 'day' : 'night'}${c.hour === 0 ? ' midnight' : ''}`,
        String(c.hour),
      );
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
        const seg = el(
          `tl-seg${c.dateKey === todayKey ? ' today' : ''}`,
          formatDateLabel(this.lang, parseDateKey(c.dateKey)),
        );
        seg.style.left = `${x0}px`;
        seg.style.width = `${x1 - x0}px`;
        strip.appendChild(seg);
        segStart = i + 1;
      }
    });
    return strip;
  }

  setCursor(utc) { this.cursorUtc = utc; this._positionMarkers(); }
  setNow(utc) { this.nowUtc = utc; this._positionMarkers(); }

  _positionMarkers() {
    this.cursorEl.style.left = `${this.xForUtc(this.cursorUtc)}px`;
    this.nowEl.style.left = `${this.xForUtc(this.nowUtc)}px`;
  }

  scrollToTime(utc, smooth = true) {
    const rangeEnd = this.rangeStart + RANGE_DAYS * 24 * HOUR;
    const margin = EDGE_DAYS * 24 * HOUR;
    if (utc < this.rangeStart + margin || utc > rangeEnd - margin) this.rebuild(utc);
    const left = Math.max(0, this.xForUtc(utc) - this.scroller.clientWidth / 2);
    this.scroller.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
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
      if (!this._tap) return;
      const moved = Math.abs(e.clientX - this._tap.x) + Math.abs(e.clientY - this._tap.y);
      this._tap = null;
      if (moved < 8) {
        const rect = this.track.getBoundingClientRect();
        this._pickAtX(e.clientX - rect.left);
      }
    });
    // Dragging the cursor handle.
    this.cursorEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
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
    // Infinite scroll via recentering.
    this.scroller.addEventListener('scroll', () => this._maybeRecenter());
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
```

- [ ] **Step 2: 構文チェック**

Run: `node --check src/timeline.js`
Expected: エラーなし

- [ ] **Step 3: Commit**

```bash
git add src/timeline.js
git commit -m "feat: timeline rendering with recentering infinite scroll"
```

---

### Task 9: app.js（状態・イベント結線・i18n適用・localStorage）

**Files:**
- Create: `src/app.js`

- [ ] **Step 1: 実装**

`src/app.js`:

```js
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
  cursorUtc: roundToMinute(Date.now()),
};

function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (raw && cityById(raw.cityA) && cityById(raw.cityB)) {
      state.cityA = raw.cityA;
      state.cityB = raw.cityB;
    }
    if (raw && (raw.lang === 'en' || raw.lang === 'ja')) state.lang = raw.lang;
  } catch { /* corrupt storage -> defaults */ }
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      cityA: state.cityA, cityB: state.cityB, lang: state.lang,
    }));
  } catch { /* private mode etc. */ }
}

function fillSelect(select, selectedId) {
  select.textContent = '';
  for (const c of CITIES) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c[state.lang];
    select.appendChild(opt);
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
  card.querySelector('.icon-sun').hidden = !isDay;
  card.querySelector('.icon-moon').hidden = isDay;
}

// Cheap updates that follow every cursor move.
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
  $('date-input').value = `${pa.year}-${pad(pa.month)}-${pad(pa.day)}`;
  $('time-input').value = `${pad(pa.hour)}:${pad(pa.minute)}`;
  timeline.setCursor(state.cursorUtc);
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
  $('swap').setAttribute('aria-label', s.swap);
  $('now-btn-label').textContent = s.now;
  $('now-marker-label').textContent = s.now;
  $('hint').textContent = s.hint;
  $('label-a').textContent = a[state.lang];
  $('label-b').textContent = b[state.lang];
  $('time-label').textContent = `${s.setTime} ${a[state.lang]}`;
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
  $('now-btn').addEventListener('click', () => {
    state.cursorUtc = roundToMinute(Date.now());
    timeline.setNow(Date.now());
    renderReadouts();
    timeline.scrollToTime(state.cursorUtc);
  });
  $('lang-en').addEventListener('click', () => setLang('en'));
  $('lang-ja').addEventListener('click', () => setLang('ja'));
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
timeline.scrollToTime(state.cursorUtc, false);
setInterval(() => timeline.setNow(Date.now()), 60000);
```

- [ ] **Step 2: 構文チェックとテスト**

Run: `node --check src/app.js && npm test`
Expected: 構文エラーなし、全テスト PASS

- [ ] **Step 3: Commit**

```bash
git add src/app.js
git commit -m "feat: app state, controls, i18n wiring, persistence"
```

---

### Task 10: ブラウザでの動作確認と修正

**Files:**
- Modify: 不具合に応じて該当ファイル

- [ ] **Step 1: ローカルサーバー起動**

Run: `python3 -m http.server 8765`（バックグラウンド）

- [ ] **Step 2: ブラウザで以下のチェックリストを確認**

Claude のブラウザ系ツール（Claude Preview / Playwright MCP）でスクリーンショットを取りながら確認する:

1. 初期表示: 日本↔バンクーバー、カーソル＝現在時刻、Now マーカー表示、英語UI
2. バーのマス: 上=日本(0..23連続)、下=バンクーバー(16時間遅れの数字)、同じX位置で正しく対応
3. 日付帯: 曜日+日付、0時位置に黒線+`0:00`、今日のセグメントが青ハイライト
4. 横スクロール: 左右に何日分もスクロールでき、端に到達しても途切れない（リセンタリング動作）
5. タップ/クリックで時刻選択、カーソルハンドルのドラッグで連続選択（15分刻み）
6. 結果カード: 両都市の日付・曜日・時刻・昼夜アイコン・Previous/Next day バッジ
7. 時差バッジ: "Vancouver is 16 hours behind Japan (Tokyo)"
8. date 入力で日付ジャンプ（カーソルの時刻は維持）、time 入力で時刻変更
9. Now ボタンで現在時刻に復帰（スクロール+カーソル）
10. 都市変更・入れ替え・EN/JA切替、リロード後に選択が復元される（localStorage）
11. ウィンドウ幅を 390px 相当に縮めてレイアウト崩れがないこと
12. 冬の日付（例: 2026-12-15）にジャンプ → バッジが 17 hours behind に変わる

- [ ] **Step 3: 発見した不具合を修正**

修正のたびに `npm test` を実行し、該当ファイルをコミットする。
（見た目の微調整—ラベル位置・マーカーの高さの px 調整—はこのタスクで行う）

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix: polish after manual browser verification"
```

---

### Task 11: Vercel へデプロイ

**Files:** なし（外部操作）

- [ ] **Step 1: デプロイ**

Vercel MCP の `deploy_to_vercel` ツールを使用する（ToolSearch で `select:` 読み込みが必要）。プロジェクト名は `calc-time-dif`。静的サイトなのでビルド設定は不要。

- [ ] **Step 2: 公開URLの動作確認**

デプロイ結果のURLをブラウザで開き、Task 10 のチェック 1〜2 を再確認。

- [ ] **Step 3: ユーザーへURLを報告**

---

## Self-Review（実施済み）

- **Spec coverage:** 仕様書 §2.1〜2.6（ヘッダー/コントロール/タイムライン/カード/直接入力/レスポンシブ）→ Task 7-9。§3 都市リスト → Task 6。§4 技術構成 → Task 1, 7-9, 11。§5 状態・DST → Task 2-5, 9。§6 エラー処理 → Task 9（localStorage try-catch, Intl チェック）。§7 テスト → Task 2-6。§9 実装順序どおり。
- **Placeholder scan:** TBD/TODO なし。全コードブロックは完全なコード。
- **Type consistency:** `zonedParts` の戻り値（year/month/day/hour/minute/second）、`hourCells` のセル形状（utc/hour/isDay/dateKey）、`Timeline` の公開メソッド（setConfig/rebuild/setCursor/setNow/scrollToTime）、i18n の関数シグネチャはタスク間で一致していることを確認済み。
