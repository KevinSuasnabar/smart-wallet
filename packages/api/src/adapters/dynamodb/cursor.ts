/**
 * Pagination cursor codec.
 *
 * DynamoDB returns `LastEvaluatedKey` as a plain object when more pages are available.
 * We encode it as a base64url string for transport and decode it back for the next query.
 */

export const encodeCursor = (
  lastEvaluatedKey: Record<string, unknown> | undefined,
): string | undefined => {
  if (lastEvaluatedKey === undefined) return undefined;
  return Buffer.from(JSON.stringify(lastEvaluatedKey), 'utf8').toString('base64url');
};

export const decodeCursor = (
  cursor: string | undefined,
): Record<string, unknown> | undefined => {
  if (cursor === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return undefined;
  } catch {
    // Invalid cursor — silently start from beginning
    return undefined;
  }
};
