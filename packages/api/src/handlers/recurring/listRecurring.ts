import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  withAuth,
  withErrorHandler,
} from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';
import { ok as responseOk } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';
import { formatMoneyForResponse } from '../../shared/boundary/index.js';

/**
 * GET /recurring — list all recurring transactions for the authenticated
 * user, sorted ASC by nextOccurrenceAt.
 */
const handler = async (
  event: AuthenticatedEvent,
): Promise<APIGatewayProxyResultV2> => {
  const result = await container.listRecurring(event.userId);
  if (!result.ok) return domainErrorToResponse(result.error);

  const items = result.value.items.map((r) => ({
    recurringId: r.id.toString(),
    walletId: r.walletId.toString(),
    type: r.type,
    amount: formatMoneyForResponse(r.amount),
    currency: r.amount.currency,
    categoryId: r.categoryId,
    description: r.description,
    cadence: r.cadence,
    dayOfMonth: r.dayOfMonth,
    nextOccurrenceAt: r.nextOccurrenceAt.toISOString(),
    lastMaterializedAt: r.lastMaterializedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  return responseOk({ items });
};

export const main = withErrorHandler(withAuth(handler));
