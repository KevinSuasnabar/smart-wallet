// Pure date math used by the RecurringTransaction aggregate. All inputs and
// outputs are UTC — recurrings are interpreted in UTC for MVP simplicity.

const daysInMonth = (year: number, monthZeroBased: number): number =>
  new Date(Date.UTC(year, monthZeroBased + 1, 0)).getUTCDate();

const effectiveDay = (
  year: number,
  monthZeroBased: number,
  dayOfMonth: number,
): number => Math.min(dayOfMonth, daysInMonth(year, monthZeroBased));

/**
 * Returns the first calendar date ≥ `anchor` whose day matches `dayOfMonth`
 * (clamping Feb 30 → Feb 28/29 etc.). Time-of-day is normalized to 00:00:00.000 UTC.
 *
 * Examples (with dayOfMonth = 28):
 *  - anchor = 2026-05-15 → 2026-05-28
 *  - anchor = 2026-05-29 → 2026-06-28
 *  - anchor = 2027-02-10, dayOfMonth = 31 → 2027-02-28 (Feb has 28 days)
 */
export const nextDayOfMonthOnOrAfter = (
  anchor: Date,
  dayOfMonth: number,
): Date => {
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth();
  const todayDay = anchor.getUTCDate();
  const thisMonthEffective = effectiveDay(y, m, dayOfMonth);

  if (todayDay <= thisMonthEffective) {
    return new Date(Date.UTC(y, m, thisMonthEffective, 0, 0, 0, 0));
  }

  // Roll to next month.
  const ny = m === 11 ? y + 1 : y;
  const nm = m === 11 ? 0 : m + 1;
  const nextEffective = effectiveDay(ny, nm, dayOfMonth);
  return new Date(Date.UTC(ny, nm, nextEffective, 0, 0, 0, 0));
};

/**
 * Adds exactly one calendar month to `date`, preserving the day-of-month
 * when possible and clamping to the last day of the target month otherwise.
 */
export const addOneMonth = (date: Date): Date => {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  const ny = m === 11 ? y + 1 : y;
  const nm = m === 11 ? 0 : m + 1;
  const clampedDay = Math.min(d, daysInMonth(ny, nm));
  return new Date(Date.UTC(ny, nm, clampedDay, 0, 0, 0, 0));
};
