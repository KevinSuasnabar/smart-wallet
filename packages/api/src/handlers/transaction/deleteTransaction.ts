import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { TransactionIdPathSchema } from '@smart-wallet/shared-types';
import type { TransactionIdPathDTO } from '@smart-wallet/shared-types';
import { withAuth, withErrorHandler, validatePath } from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';
import { noContent, badRequest } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';

/**
 * DELETE /wallets/{walletId}/transactions/{transactionId} — hard-delete a
 * transaction and reverse its impact on the wallet balance atomically.
 *
 * Idempotency:
 * - DELETE is naturally idempotent at the HTTP level: the second call returns
 *   404 because the row is gone. We do NOT write an IdempotencyRecord.
 * - The Idempotency-Key header is accepted (length-validated) for client
 *   compatibility but ignored server-side.
 *
 * Middleware chain: withErrorHandler → withAuth → handler
 */
const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const pathValidation = validatePath(TransactionIdPathSchema, event.raw);
  if (!pathValidation.ok) return pathValidation.response;
  const path: TransactionIdPathDTO = pathValidation.data;

  // Accept-but-ignore Idempotency-Key; still validate length so a malformed
  // header is caught at the boundary.
  const rawHeaders = event.raw.headers ?? {};
  const idempotencyKey =
    rawHeaders['idempotency-key'] ??
    rawHeaders['Idempotency-Key'] ??
    rawHeaders['IDEMPOTENCY-KEY'];
  if (idempotencyKey !== undefined) {
    if (idempotencyKey.length < 1 || idempotencyKey.length > 128) {
      return badRequest('invalid_idempotency_key', {
        reason: 'Idempotency-Key must be 1–128 characters',
      });
    }
  }

  const result = await container.deleteTransaction({
    userId: event.userId,
    walletId: path.walletId,
    transactionId: path.transactionId,
  });

  if (!result.ok) return domainErrorToResponse(result.error);

  return noContent();
};

export const main = withErrorHandler(withAuth(handler));
