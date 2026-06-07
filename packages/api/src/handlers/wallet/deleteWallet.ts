import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { WalletIdPathSchema } from '@smart-wallet/shared-types';
import type { WalletIdPathDTO } from '@smart-wallet/shared-types';
import { withAuth, withErrorHandler, validatePath } from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { deleteWalletWithEvents } from '../../application/transactionMutations.js';
import { noContent, notFound } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';
import { WalletNotFound } from '@smart-wallet/domain';

/**
 * DELETE /wallets/{walletId} — hard-delete the wallet AND every transaction
 * belonging to it via chunked TransactWriteItems. Returns 204 on success,
 * 404 if the wallet does not exist (also covers concurrent deletion).
 *
 * Middleware chain: withErrorHandler → withAuth → handler
 */
const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const pathValidation = validatePath(WalletIdPathSchema, event.raw);
  if (!pathValidation.ok) return pathValidation.response;
  const path: WalletIdPathDTO = pathValidation.data;

  const result = await deleteWalletWithEvents({
    userId: event.userId,
    walletId: path.walletId,
  });

  if (!result.ok) {
    const e = result.error;
    if (e instanceof WalletNotFound) return notFound('wallet_not_found');
    return domainErrorToResponse(e);
  }

  return noContent();
};

export const main = withErrorHandler(withAuth(handler));
