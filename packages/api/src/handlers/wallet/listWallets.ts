import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { ListWalletsQuerySchema } from '@smart-wallet/shared-types';
import type { ListWalletsQueryDTO } from '@smart-wallet/shared-types';
import { withAuth, withErrorHandler, validateQuery } from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';
import { ok } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';
import { formatCentsForResponse } from '../../shared/boundary/index.js';

/**
 * GET /wallets — list all wallets for the authenticated user.
 *
 * Middleware chain: withErrorHandler → withAuth → handler
 *
 * REQ-WAL-04, REQ-WAL-08
 */
const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const validation = validateQuery(ListWalletsQuerySchema, event.raw);
  if (!validation.ok) return validation.response;

  const query: ListWalletsQueryDTO = validation.data;

  const result = await container.listWallets({
    userId: event.userId,
    limit: query.limit,
    ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
  });

  if (!result.ok) return domainErrorToResponse(result.error);

  const { items, nextCursor } = result.value;

  return ok({
    items: items.map((wallet) => ({
      walletId: wallet.id.toString(),
      name: wallet.name,
      currency: wallet.currency,
      balance: formatCentsForResponse(wallet.balance, wallet.currency),
      createdAt: wallet.createdAt.toISOString(),
      updatedAt: wallet.updatedAt.toISOString(),
    })),
    ...(nextCursor !== undefined ? { nextCursor } : {}),
  });
};

// Lambda entry point — middleware applied outside-in: error boundary wraps auth
export const main = withErrorHandler(withAuth(handler));
