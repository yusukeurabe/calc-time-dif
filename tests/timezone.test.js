import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zonedParts, offsetMinutes, zonedTimeToUtc } from '../src/timezone.js';

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

test('zonedTimeToUtc: Tokyo 2026-06-12 11:00 -> 02:00 UTC', () => {
  assert.equal(
    zonedTimeToUtc({ year: 2026, month: 6, day: 12, hour: 11 }, TOKYO),
    Date.UTC(2026, 5, 12, 2),
  );
});

test('zonedTimeToUtc: roundtrips across DST in Vancouver', () => {
  const summer = zonedTimeToUtc({ year: 2026, month: 7, day: 1, hour: 12 }, VAN);
  assert.equal(summer, Date.UTC(2026, 6, 1, 19));
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
