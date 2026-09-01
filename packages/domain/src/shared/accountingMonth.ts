/**
 * Accounting-month helper — the single definition of "the month" for a given
 * IANA timezone. Shared by the dashboard read path (`GetMonthlyDashboard`) and
 * the DynamoDB aggregate write bucket (`DynamoDBMonthlyAggregateRepository`),
 * always with the one configured `APP_TIMEZONE`.
 *
 * Pure: no I/O, no injected port. `Intl` is part of the standard library and
 * the calculation is deterministic, so `sw-hexagonal` does not require a port.
 */

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

const formatterFor = (timeZone: string): Intl.DateTimeFormat => {
  const cached = formatterCache.get(timeZone);
  if (cached !== undefined) return cached;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    calendar: 'gregory',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
};

/**
 * Wall-clock reading of `instant` in `timeZone`, via `formatToParts` so the
 * result is locale-independent (never a localized string that needs parsing).
 */
const wallClockOf = (instant: Date, timeZone: string): WallClock => {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const valueOf = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);
    return part === undefined ? 0 : Number(part.value);
  };
  const hour = valueOf('hour');
  return {
    year: valueOf('year'),
    month: valueOf('month'),
    day: valueOf('day'),
    hour: hour === 24 ? 0 : hour,
    minute: valueOf('minute'),
    second: valueOf('second'),
  };
};

/** The wall-clock reading re-read as if its fields were UTC. */
const asUtcMs = (wall: WallClock): number =>
  Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);

/** Offset (ms east of UTC) in effect at `instant` in `timeZone`. */
const offsetMsAt = (instant: Date, timeZone: string): number =>
  asUtcMs(wallClockOf(instant, timeZone)) - instant.getTime();

/**
 * UTC instant whose `timeZone` wall clock equals `wallUtcMs` (the target wall
 * clock, read as if it were UTC). Two passes: the first uses the offset near
 * the target wall clock, the second uses the offset *at* the resulting
 * instant, so a DST change later in the month cannot shift the month start.
 */
const instantFromWallClock = (wallUtcMs: number, timeZone: string): Date => {
  const guess = wallUtcMs - offsetMsAt(new Date(wallUtcMs), timeZone);
  return new Date(wallUtcMs - offsetMsAt(new Date(guess), timeZone));
};

/** Whether `Intl` accepts `timeZone` as an IANA zone name. */
export const isValidTimeZone = (timeZone: string | undefined | null): boolean => {
  if (typeof timeZone !== 'string' || timeZone.trim() === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
};

/**
 * `"YYYY-MM"` for the month `instant` falls in, using the `timeZone` wall
 * clock. Four-digit year, two-digit zero-padded month via explicit `padStart`
 * (not a locale-formatted string) so the value is safe to use verbatim as a
 * DynamoDB sort-key component.
 */
export const monthKeyInTimeZone = (instant: Date, timeZone: string): string => {
  const wall = wallClockOf(instant, timeZone);
  return `${String(wall.year).padStart(4, '0')}-${String(wall.month).padStart(2, '0')}`;
};

/**
 * `{ from, to }` for the month `instant` falls in. `from` is the first instant
 * of that month key in `timeZone`; `to` is `instant` itself, so the range is
 * always capped at the passed clock reading ("this month" never runs past now).
 */
export const monthRangeInTimeZone = (
  instant: Date,
  timeZone: string,
): { from: Date; to: Date } => {
  const key = monthKeyInTimeZone(instant, timeZone);
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  return {
    from: instantFromWallClock(Date.UTC(year, month - 1, 1, 0, 0, 0), timeZone),
    to: instant,
  };
};
