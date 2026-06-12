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
