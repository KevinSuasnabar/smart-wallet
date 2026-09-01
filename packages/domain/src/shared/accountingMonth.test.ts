import { describe, it, expect } from 'vitest';
import {
  isValidTimeZone,
  monthKeyInTimeZone,
  monthRangeInTimeZone,
} from './accountingMonth.js';

describe('monthKeyInTimeZone', () => {
  it('case 1 — America/Lima (UTC-5) boundary keys', () => {
    expect(monthKeyInTimeZone(new Date('2026-08-31T23:59:56.667Z'), 'America/Lima')).toBe(
      '2026-08',
    );
    expect(monthKeyInTimeZone(new Date('2026-09-01T00:11:41.645Z'), 'America/Lima')).toBe(
      '2026-08',
    );
    expect(monthKeyInTimeZone(new Date('2026-09-01T05:00:00.000Z'), 'America/Lima')).toBe(
      '2026-09',
    );
  });

  it('case 3 — Asia/Tokyo (UTC+9) resolves ahead of the UTC month', () => {
    expect(monthKeyInTimeZone(new Date('2026-08-31T20:00:00.000Z'), 'Asia/Tokyo')).toBe('2026-09');
  });
});

describe('monthRangeInTimeZone', () => {
  it('case 2 — America/Lima range derived from the key, `to` identical to input', () => {
    const instant = new Date('2026-09-01T00:11:41.645Z');
    const range = monthRangeInTimeZone(instant, 'America/Lima');
    expect(range.from.toISOString()).toBe('2026-08-01T05:00:00.000Z');
    expect(range.to).toBe(instant);
    expect(range.to.toISOString()).toBe('2026-09-01T00:11:41.645Z');
  });

  it('case 3 — Asia/Tokyo month start is 2026-08-31T15:00:00.000Z', () => {
    const range = monthRangeInTimeZone(new Date('2026-08-31T20:00:00.000Z'), 'Asia/Tokyo');
    expect(range.from.toISOString()).toBe('2026-08-31T15:00:00.000Z');
  });

  it('case 4 — Europe/Madrid DST ends mid-month: month start keeps the +02 offset', () => {
    // DST (CEST, +02) ends 25 Oct 2026; an instant after that is CET (+01),
    // but the October month start must still use the +02 offset in effect on 1 Oct.
    const lateInMonth = new Date('2026-10-27T12:00:00.000Z');
    const range = monthRangeInTimeZone(lateInMonth, 'Europe/Madrid');
    expect(range.from.toISOString()).toBe('2026-09-30T22:00:00.000Z');
  });

  it('case 5 — America/Lima has no DST: Jan and Jul month starts are both T05:00:00.000Z', () => {
    expect(
      monthRangeInTimeZone(
        new Date('2026-01-15T12:00:00.000Z'),
        'America/Lima',
      ).from.toISOString(),
    ).toBe('2026-01-01T05:00:00.000Z');
    expect(
      monthRangeInTimeZone(
        new Date('2026-07-15T12:00:00.000Z'),
        'America/Lima',
      ).from.toISOString(),
    ).toBe('2026-07-01T05:00:00.000Z');
  });
});

describe('isValidTimeZone', () => {
  it('case 6 — accepts real IANA names, rejects junk and blanks', () => {
    expect(isValidTimeZone('America/Lima')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Foo/Bar')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});
