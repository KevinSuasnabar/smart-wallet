import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { ListTransactionsByCategoryQuerySchema } from '@smart-wallet/shared-types';
import type { ListTransactionsByCategoryQueryDTO } from '@smart-wallet/shared-types';
import { withAuth, withErrorHandler, validateQuery } from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';
import { ok } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';
import { formatMoneyForResponse } from '../../shared/boundary/index.js';

/**
 * GET /transactions?categoryId=... — list transactions for the authenticated user
 * filtered by category (predefined or custom).
 *
 * `categoryId` query param is REQUIRED. Responds with paginated transaction list
 * sorted by occurredAt descending (DynamoDB GSI1 sort key order).
 *
 * Middleware chain: withErrorHandler → withAuth → handler
 *
 * REQ-TXN-07
 */
const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const queryValidation = validateQuery(ListTransactionsByCategoryQuerySchema, event.raw);
  if (!queryValidation.ok) return queryValidation.response;

  const query: ListTransactionsByCategoryQueryDTO = queryValidation.data;

  const result = await container.listTransactionsByCategory({
    userId: event.userId,
    categoryId: query.categoryId,
    ...(query.from !== undefined ? { from: new Date(query.from) } : {}),
    ...(query.to !== undefined ? { to: new Date(query.to) } : {}),
    limit: query.limit,
    ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
  });

  if (!result.ok) return domainErrorToResponse(result.error);

  const { items, nextCursor } = result.value;

  return ok({
    items: items.map((transaction) => ({
      transactionId: transaction.id.toString(),
      walletId: transaction.walletId.toString(),
      type: transaction.type,
      amount: formatMoneyForResponse(transaction.amount),
      currency: transaction.amount.currency,
      categoryId: transaction.categoryId,
      occurredAt: transaction.occurredAt.toISOString(),
      createdAt: transaction.createdAt.toISOString(),
      ...(transaction.description !== null ? { description: transaction.description } : {}),
    })),
    ...(nextCursor !== undefined ? { nextCursor } : {}),
  });
};

// Lambda entry point — middleware applied outside-in: error boundary wraps auth
export const main = withErrorHandler(withAuth(handler));
