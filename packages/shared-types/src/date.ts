import { z } from 'zod';

/**
 * Validates that a string is a valid ISO8601 datetime.
 * No range constraint here — range validation is applied
 * by the transaction schema (occurredAt: [now-5y, now+1d]).
 */
export const zIso8601 = z
  .string()
  .refine(
    (val) => !isNaN(Date.parse(val)),
    { message: 'Must be a valid ISO8601 datetime string' },
  );
