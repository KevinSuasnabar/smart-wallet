import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  WalletIdPathSchema,
  UpdateWalletRequestSchema,
} from '@smart-wallet/shared-types';
import type {
  WalletIdPathDTO,
  UpdateWalletDTO,
} from '@smart-wallet/shared-types';
import { withAuth, withErrorHandler, validateBody, validatePath } from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';
import { ok as responseOk, notFound, conflict } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';
import { formatCentsForResponse } from '../../shared/boundary/index.js';
import { WalletNotFound, WalletCurrencyLocked } from '@smart-wallet/domain';

/**
 * PATCH /wallets/{walletId} — partial update.
 *
 * Mutable fields: name, currency. Currency can be changed only when the
 * wallet has no active transactions (the use case probes for that and
 * returns WalletCurrencyLocked → 409).
 *
 * Middleware chain: withErrorHandler → withAuth → handler
 */
const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const pathValidation = validatePath(WalletIdPathSchema, event.raw);
  if (!pathValidation.ok) return pathValidation.response;
  const path: WalletIdPathDTO = pathValidation.data;

  const bodyValidation = validateBody(UpdateWalletRequestSchema, event.raw);
  if (!bodyValidation.ok) return bodyValidation.response;
  const body: UpdateWalletDTO = bodyValidation.data;

  const edits: { name?: string; currency?: string; color?: string } = {};
  if (body.name !== undefined) edits.name = body.name;
  if (body.currency !== undefined) edits.currency = body.currency;
  if (body.color !== undefined) edits.color = body.color;

  const result = await container.updateWallet({
    userId: event.userId,
    walletId: path.walletId,
    edits,
  });

  if (!result.ok) {
    const e = result.error;
    if (e instanceof WalletNotFound) return notFound('wallet_not_found');
    if (e instanceof WalletCurrencyLocked) return conflict('wallet_currency_locked');
    return domainErrorToResponse(e);
  }

  const w = result.value;
  return responseOk({
    walletId: w.id.toString(),
    name: w.name,
    currency: w.currency,
    color: w.color,
    balance: formatCentsForResponse(w.balance, w.currency),
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  });
};

export const main = withErrorHandler(withAuth(handler));
