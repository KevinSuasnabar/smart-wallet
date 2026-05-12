import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { WalletIdPathSchema } from '@smart-wallet/shared-types';
import type { WalletIdPathDTO } from '@smart-wallet/shared-types';
import { withAuth, withErrorHandler, validatePath } from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';
import { ok, notFound } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';
import { formatCentsForResponse } from '../../shared/boundary/index.js';

/**
 * GET /wallets/{walletId} — retrieve a single wallet by ID.
 *
 * Returns 200 with wallet data, or 404 if not found / soft-deleted.
 * Middleware chain: withErrorHandler → withAuth → handler
 *
 * REQ-WAL-05, REQ-WAL-06
 */
const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const pathValidation = validatePath(WalletIdPathSchema, event.raw);
  if (!pathValidation.ok) return pathValidation.response;

  const path: WalletIdPathDTO = pathValidation.data;

  const result = await container.getWallet({
    userId: event.userId,
    walletId: path.walletId,
  });

  if (!result.ok) return domainErrorToResponse(result.error);

  const wallet = result.value;

  // Use case returns ok(null) when wallet is not found or soft-deleted
  if (wallet === null) return notFound('wallet_not_found');

  return ok({
    walletId: wallet.id.toString(),
    name: wallet.name,
    currency: wallet.currency,
    balance: formatCentsForResponse(wallet.balance, wallet.currency),
    createdAt: wallet.createdAt.toISOString(),
    updatedAt: wallet.updatedAt.toISOString(),
  });
};

// Lambda entry point — middleware applied outside-in: error boundary wraps auth
export const main = withErrorHandler(withAuth(handler));
