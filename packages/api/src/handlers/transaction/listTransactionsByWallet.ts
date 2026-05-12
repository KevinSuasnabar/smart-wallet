import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  WalletIdPathSchema,
  ListTransactionsByWalletQuerySchema,
} from '@smart-wallet/shared-types';
import type { WalletIdPathDTO, ListTransactionsByWalletQueryDTO } from '@smart-wallet/shared-types';
import { withAuth, withErrorHandler, validatePath, validateQuery } from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';
import { ok } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';
import { formatMoneyForResponse } from '../../shared/boundary/index.js';

/**
 * GET /wallets/{walletId}/transactions — list transactions for a specific wallet.
 *
 * Supports filtering by from/to date range, transaction type, and categoryId.
 * Middleware chain: withErrorHandler → withAuth → handler
 *
 * REQ-TXN-06, REQ-WAL-08
 */
const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const pathValidation = validatePath(WalletIdPathSchema, event.raw);
  if (!pathValidation.ok) return pathValidation.response;

  const path: WalletIdPathDTO = pathValidation.data;

  const queryValidation = validateQuery(ListTransactionsByWalletQuerySchema, event.raw);
  if (!queryValidation.ok) return queryValidation.response;

  const query: ListTransactionsByWalletQueryDTO = queryValidation.data;

  const result = await container.listTransactionsByWallet({
    userId: event.userId,
    walletId: path.walletId,
    ...(query.from !== undefined ? { from: new Date(query.from) } : {}),
    ...(query.to !== undefined ? { to: new Date(query.to) } : {}),
    ...(query.type !== undefined ? { type: query.type } : {}),
    ...(query.categoryId !== undefined ? { categoryId: query.categoryId } : {}),
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
