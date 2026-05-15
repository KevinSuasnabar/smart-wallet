import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { CreateRecurringRequestSchema } from '@smart-wallet/shared-types';
import type { CreateRecurringDTO } from '@smart-wallet/shared-types';
import {
  withAuth,
  withErrorHandler,
  validateBody,
} from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';
import { created, badRequest } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';
import {
  parseAmountForCurrency,
  formatMoneyForResponse,
} from '../../shared/boundary/index.js';

/**
 * POST /recurring — create a monthly recurring transaction.
 *
 * The body includes `walletId` and `currency` is read from the wallet by the
 * use case (boundary parses the decimal `amount` first to detect format
 * errors). Returns 201 with the created recurring.
 */
const handler = async (
  event: AuthenticatedEvent,
): Promise<APIGatewayProxyResultV2> => {
  const bodyValidation = validateBody(
    CreateRecurringRequestSchema,
    event.raw,
  );
  if (!bodyValidation.ok) return bodyValidation.response;
  const input: CreateRecurringDTO = bodyValidation.data;

  // The recurring's currency is determined by the wallet (not the body).
  // We parse the decimal amount here just to detect format errors; the
  // resulting cents are the same regardless of the source currency tag
  // because USD and PEN both have 2-decimal precision. The use case then
  // builds Money with the wallet's actual currency.
  const moneyResult = parseAmountForCurrency(input.amount, 'USD');
  if (!moneyResult.ok) {
    return badRequest('invalid_amount', { reason: moneyResult.error.tag });
  }
  const amountCents = moneyResult.value.amount;

  const result = await container.createRecurring({
    userId: event.userId,
    walletId: input.walletId,
    type: input.type,
    amountCents,
    categoryId: input.categoryId,
    description: input.description ?? null,
    dayOfMonth: input.dayOfMonth,
  });

  if (!result.ok) return domainErrorToResponse(result.error);

  const r = result.value.recurring;
  return created({
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
