import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { RecurringIdPathSchema } from '@smart-wallet/shared-types';
import type { RecurringIdPathDTO } from '@smart-wallet/shared-types';
import {
  withAuth,
  withErrorHandler,
  validatePath,
} from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';
import { ok as responseOk } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';
import { formatMoneyForResponse } from '../../shared/boundary/index.js';

/**
 * GET /recurring/{recurringId} — single recurring transaction.
 * Returns 404 RecurringNotFound when missing or not owned by the user.
 */
const handler = async (
  event: AuthenticatedEvent,
): Promise<APIGatewayProxyResultV2> => {
  const pathValidation = validatePath(RecurringIdPathSchema, event.raw);
  if (!pathValidation.ok) return pathValidation.response;
  const path: RecurringIdPathDTO = pathValidation.data;

  const result = await container.getRecurring({
    userId: event.userId,
    recurringId: path.recurringId,
  });
  if (!result.ok) return domainErrorToResponse(result.error);

  const r = result.value.recurring;
  return responseOk({
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
  });
};

export const main = withErrorHandler(withAuth(handler));
