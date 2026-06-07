import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { withAuth, withErrorHandler } from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';
import { ok as responseOk } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';
import { publishMaterializedTransactionEvents } from '../../application/transactionMutations.js';

/**
 * POST /recurring/materialize — materializes every recurring transaction
 * whose `nextOccurrenceAt <= now()` for the authenticated user.
 *
 * The endpoint is idempotent server-side: each per-recurring update is
 * guarded by a `ConditionExpression nextOccurrenceAt = :expected`, so
 * concurrent requests never produce duplicate transactions.
 *
 * Returns 200 with `{ materializedCount, materializedTransactionIds }`,
 * even when `materializedCount` is 0.
 */
const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const result = await container.materializeRecurrings(event.userId);
  if (!result.ok) return domainErrorToResponse(result.error);

  await publishMaterializedTransactionEvents(event.userId, result.value.materializedTransactions);

  return responseOk({
    materializedCount: result.value.materializedCount,
    materializedTransactionIds: result.value.materializedTransactionIds,
  });
};

export const main = withErrorHandler(withAuth(handler));
