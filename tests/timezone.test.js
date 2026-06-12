import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zonedParts, offsetMinutes, zonedTimeToUtc, floorToZonedHour, startOfZonedDay, nextZonedMidnight, offsetDiffHours, dayRelation, hourCells, parseDateKey, dateKeyOf } from '../src/timezone.js';

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
