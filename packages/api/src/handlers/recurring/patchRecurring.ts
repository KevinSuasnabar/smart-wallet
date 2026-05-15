import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  RecurringIdPathSchema,
  UpdateRecurringRequestSchema,
} from '@smart-wallet/shared-types';
import type {
  RecurringIdPathDTO,
  UpdateRecurringDTO,
} from '@smart-wallet/shared-types';
import {
  withAuth,
  withErrorHandler,
  validateBody,
  validatePath,
} from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';
import { ok as responseOk, badRequest } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';
import {
  parseAmountForCurrency,
  formatMoneyForResponse,
} from '../../shared/boundary/index.js';

/**
 * PATCH /recurring/{recurringId} — partial update.
 * Editable: amount, categoryId, description (null clears), dayOfMonth.
 * Walled off: walletId, type, currency, cadence.
 */
const handler = async (
  event: AuthenticatedEvent,
): Promise<APIGatewayProxyResultV2> => {
  const pathValidation = validatePath(RecurringIdPathSchema, event.raw);
  if (!pathValidation.ok) return pathValidation.response;
  const path: RecurringIdPathDTO = pathValidation.data;

  const bodyValidation = validateBody(
    UpdateRecurringRequestSchema,
    event.raw,
  );
  if (!bodyValidation.ok) return bodyValidation.response;
  const body: UpdateRecurringDTO = bodyValidation.data;

  // Decimal → cents. Format errors caught here; precision is identical for
  // USD and PEN (both 2-decimal), so the currency tag is a placeholder.
  let amountCents: number | undefined;
  if (body.amount !== undefined) {
    const moneyResult = parseAmountForCurrency(body.amount, 'USD');
    if (!moneyResult.ok) {
      return badRequest('invalid_amount', { reason: moneyResult.error.tag });
    }
    amountCents = moneyResult.value.amount;
  }

  const result = await container.updateRecurring({
    userId: event.userId,
    recurringId: path.recurringId,
    ...(amountCents !== undefined ? { amountCents } : {}),
    ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
    ...(body.description !== undefined ? { description: body.description } : {}),
    ...(body.dayOfMonth !== undefined ? { dayOfMonth: body.dayOfMonth } : {}),
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
