// Generate Idempotency-Key once per form lifecycle.
// Used by transaction form via useMemo(generateIdempotencyKey, [])
export const generateIdempotencyKey = (): string => crypto.randomUUID();
