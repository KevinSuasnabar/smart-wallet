import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { CreateWalletRequestSchema } from '@smart-wallet/shared-types';
import type { CreateWalletDTO } from '@smart-wallet/shared-types';
import { withAuth, withErrorHandler, validateBody } from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';
import { created } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';
import { formatCentsForResponse } from '../../shared/boundary/index.js';

/**
 * POST /wallets — create a new wallet for the authenticated user.
 *
 * Middleware chain: withErrorHandler → withAuth → handler
 * withAuth injects userId from JWT claims (prod) or X-Mock-User-Id header (offline).
 *
 * REQ-WAL-01, NFR-ESM-01
 */
const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const validation = validateBody(CreateWalletRequestSchema, event.raw);
  if (!validation.ok) return validation.response;

  const input: CreateWalletDTO = validation.data;

  const result = await container.createWallet({
    userId: event.userId,
    name: input.name,
    currency: input.currency,
  });

  if (!result.ok) return domainErrorToResponse(result.error);

  const wallet = result.value;

  return created({
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
