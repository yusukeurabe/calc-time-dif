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
  // Unpadded hour is intentional, matching the 0-23 labels on the timeline bars.
  assert.equal(formatTime({ hour: 0, minute: 0 }), '0:00');
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
  assert.equal(diffBadgeText('en', 'A', 'B', -5.5), 'B is 5.5 hours behind A');
  assert.equal(diffBadgeText('en', 'A', 'B', 1), 'B is 1 hour ahead of A');
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
