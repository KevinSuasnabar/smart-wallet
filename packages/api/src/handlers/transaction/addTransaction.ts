import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { AddTransactionRequestSchema, WalletIdPathSchema } from '@smart-wallet/shared-types';
import type { AddTransactionDTO, WalletIdPathDTO } from '@smart-wallet/shared-types';
import { withAuth, withErrorHandler, validateBody, validatePath } from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { addTransactionWithEvents } from '../../application/transactionMutations.js';
import { ok as responseOk, created, badRequest } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';
import { parseAmountForCurrency, formatMoneyForResponse } from '../../shared/boundary/index.js';
import { computeIdempotencyHash } from '../../shared/idempotency.js';

/**
 * POST /wallets/{walletId}/transactions — add a new transaction to a wallet.
 *
 * Strategy (C3 — MVP pragmatic):
 * - Request body includes `currency` field matching the wallet's locked currency.
 * - Handler converts the decimal amount string to cents here at the boundary.
 * - Use case validates that input.currency === wallet.currency (CurrencyMismatch on mismatch).
 *
 * Idempotency-Key header (optional, 1–128 chars):
 * - When present: 3-op TransactWrite via addIdempotent(). Returns 201 on first call, 200 on replay.
 * - When absent: 2-op TransactWrite via add(). Always returns 201.
 *
 * Middleware chain: withErrorHandler → withAuth → handler
 *
 * REQ-TXN-01, REQ-TXN-03, REQ-TXN-04, REQ-TXN-05, REQ-TXN-08,
 * REQ-IDEM-01, REQ-IDEM-02, REQ-IDEM-03
 */
const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const pathValidation = validatePath(WalletIdPathSchema, event.raw);
  if (!pathValidation.ok) return pathValidation.response;

  const path: WalletIdPathDTO = pathValidation.data;

  const bodyValidation = validateBody(AddTransactionRequestSchema, event.raw);
  if (!bodyValidation.ok) return bodyValidation.response;

  const input: AddTransactionDTO = bodyValidation.data;

  // Convert decimal amount string → Money VO using the request's currency.
  // parseAmountForCurrency enforces strictly-positive cents (zero amount → 400).
  const moneyResult = parseAmountForCurrency(input.amount, input.currency);
  if (!moneyResult.ok) {
    return badRequest('invalid_amount', { reason: moneyResult.error.tag });
  }

  const money = moneyResult.value;

  // Extract Idempotency-Key header — case-insensitive per HTTP spec.
  // API Gateway preserves original header casing in event.raw.headers.
  const rawHeaders = event.raw.headers ?? {};
  const idempotencyKey =
    rawHeaders['idempotency-key'] ?? rawHeaders['Idempotency-Key'] ?? rawHeaders['IDEMPOTENCY-KEY'];

  // Validate idempotency key length when present (1–128 opaque chars per REQ-IDEM-01).
  if (idempotencyKey !== undefined) {
    if (idempotencyKey.length < 1 || idempotencyKey.length > 128) {
      return badRequest('invalid_idempotency_key', {
        reason: 'Idempotency-Key must be 1–128 characters',
      });
    }
  }

  // Compute SHA-256 hash at the handler boundary (api layer).
  // The domain and use case never touch Node's crypto module.
  const idempotencyHash =
    idempotencyKey !== undefined
      ? computeIdempotencyHash(event.userId, path.walletId, idempotencyKey)
      : undefined;

  const result = await addTransactionWithEvents({
    userId: event.userId,
    walletId: path.walletId,
    type: input.type,
    amountCents: money.amount,
    currency: input.currency,
    categoryId: input.categoryId,
    description: input.description ?? null,
    occurredAt: new Date(input.occurredAt),
    ...(idempotencyHash !== undefined ? { idempotencyHash } : {}),
  });

  if (!result.ok) return domainErrorToResponse(result.error);

  const { transaction, replay } = result.value;

  const body = {
    transactionId: transaction.id.toString(),
    walletId: transaction.walletId.toString(),
    type: transaction.type,
    amount: formatMoneyForResponse(transaction.amount),
    currency: transaction.amount.currency,
    categoryId: transaction.categoryId,
    occurredAt: transaction.occurredAt.toISOString(),
    createdAt: transaction.createdAt.toISOString(),
    ...(transaction.description !== null ? { description: transaction.description } : {}),
  };

  // Return 200 on idempotent replay (same transaction), 201 on creation.
  return replay ? responseOk(body) : created(body);
};

// Lambda entry point — middleware applied outside-in: error boundary wraps auth
export const main = withErrorHandler(withAuth(handler));
