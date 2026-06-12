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
