import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { TransactionIdPathSchema } from '@smart-wallet/shared-types';
import type { TransactionIdPathDTO } from '@smart-wallet/shared-types';
import { withAuth, withErrorHandler, validatePath } from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';
import { ok as responseOk } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';
import { formatMoneyForResponse } from '../../shared/boundary/index.js';

/**
 * GET /wallets/{walletId}/transactions/{transactionId} — fetch a single
 * transaction.
 *
 * Returns 200 with the transaction body or 404 (`TransactionNotFound`) when
 * the transaction does not exist, is not owned by the caller, or belongs to
 * a different wallet.
 *
 * Middleware chain: withErrorHandler → withAuth → handler
 */
const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const pathValidation = validatePath(TransactionIdPathSchema, event.raw);
  if (!pathValidation.ok) return pathValidation.response;

  const path: TransactionIdPathDTO = pathValidation.data;

  const result = await container.getTransaction({
    userId: event.userId,
    walletId: path.walletId,
    transactionId: path.transactionId,
  });

  if (!result.ok) return domainErrorToResponse(result.error);

  const tx = result.value;

  const body = {
    transactionId: tx.id.toString(),
    walletId: tx.walletId.toString(),
    type: tx.type,
    amount: formatMoneyForResponse(tx.amount),
    currency: tx.amount.currency,
    categoryId: tx.categoryId,
    occurredAt: tx.occurredAt.toISOString(),
    createdAt: tx.createdAt.toISOString(),
    ...(tx.description !== null ? { description: tx.description } : {}),
  };

  return responseOk(body);
};

export const main = withErrorHandler(withAuth(handler));
