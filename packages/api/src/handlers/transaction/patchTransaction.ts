import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  TransactionIdPathSchema,
  UpdateTransactionRequestSchema,
} from '@smart-wallet/shared-types';
import type { TransactionIdPathDTO, UpdateTransactionDTO } from '@smart-wallet/shared-types';
import { withAuth, withErrorHandler, validateBody, validatePath } from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { updateTransactionWithEvents } from '../../application/transactionMutations.js';
import { ok as responseOk, badRequest } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';
import { formatMoneyForResponse, parseAmountForCurrency } from '../../shared/boundary/index.js';
import { computeIdempotencyHash } from '../../shared/idempotency.js';

/**
 * PATCH /wallets/{walletId}/transactions/{transactionId} — partial update of
 * a transaction.
 *
 * Mutable fields: amount, description, categoryId, occurredAt (all optional;
 * at least one required by the schema). Immutable: type, walletId, currency.
 *
 * Idempotency-Key header (optional, 1–128 chars):
 * - When present: 3-op (or 4-op when SK moves) TransactWrite via
 *   updateIdempotent(). Returns 200 with current state on replay.
 * - When absent: standard 2-op (or 3-op when SK moves) write via update().
 *
 * Hash scope is (userId, walletId, transactionId, idempotencyKey) so PATCH
 * cannot collide with POST and PATCHes on different transactions cannot
 * collide with each other.
 *
 * Middleware chain: withErrorHandler → withAuth → handler
 */
const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const pathValidation = validatePath(TransactionIdPathSchema, event.raw);
  if (!pathValidation.ok) return pathValidation.response;
  const path: TransactionIdPathDTO = pathValidation.data;

  const bodyValidation = validateBody(UpdateTransactionRequestSchema, event.raw);
  if (!bodyValidation.ok) return bodyValidation.response;
  const body: UpdateTransactionDTO = bodyValidation.data;

  // Idempotency-Key extraction (case-insensitive per HTTP spec).
  const rawHeaders = event.raw.headers ?? {};
  const idempotencyKey =
    rawHeaders['idempotency-key'] ?? rawHeaders['Idempotency-Key'] ?? rawHeaders['IDEMPOTENCY-KEY'];

  if (idempotencyKey !== undefined) {
    if (idempotencyKey.length < 1 || idempotencyKey.length > 128) {
      return badRequest('invalid_idempotency_key', {
        reason: 'Idempotency-Key must be 1–128 characters',
      });
    }
  }

  // Hash includes transactionId in scope (4th arg) so it can't collide
  // with POST hashes or with PATCH hashes on other transactions.
  const idempotencyHash =
    idempotencyKey !== undefined
      ? computeIdempotencyHash(event.userId, path.walletId, idempotencyKey, path.transactionId)
      : undefined;

  // The use case loads the wallet to know the currency. We can't construct
  // Money at the boundary because we don't know the wallet currency yet.
  // Instead: detect format-level errors here (decimal precision, sign) by
  // calling parseAmountForCurrency with a placeholder currency. The actual
  // Money VO is built inside the use case after the wallet is loaded.
  //
  // The shared-types `zDecimalString` already validates format, so a value
  // that passes Zod is structurally fine; we just need to convert it to cents.
  // We do that conversion here, treating any currency-mismatch error as the
  // use case's responsibility (currency is non-mutable so it can't mismatch
  // in practice — we just need the cents value).
  let amountCents: number | undefined;
  if (body.amount !== undefined) {
    // The currency of the conversion is just for decimal-place validation.
    // Both USD and PEN have 2 decimal places (currencyDecimals['USD'] = 2,
    // ['PEN'] = 2), so using either works. We pass 'USD' to be explicit.
    const moneyResult = parseAmountForCurrency(body.amount, 'USD');
    if (!moneyResult.ok) {
      return badRequest('invalid_amount', { reason: moneyResult.error.tag });
    }
    amountCents = moneyResult.value.amount;
  }

  const edits: {
    amountCents?: number;
    description?: string | null;
    categoryId?: string;
    occurredAt?: Date;
  } = {};
  if (amountCents !== undefined) edits.amountCents = amountCents;
  if (body.description !== undefined) {
    // Empty string clears the description; non-empty keeps the value.
    edits.description = body.description === '' ? null : body.description;
  }
  if (body.categoryId !== undefined) edits.categoryId = body.categoryId;
  if (body.occurredAt !== undefined) edits.occurredAt = new Date(body.occurredAt);

  const result = await updateTransactionWithEvents({
    userId: event.userId,
    walletId: path.walletId,
    transactionId: path.transactionId,
    edits,
    ...(idempotencyHash !== undefined ? { idempotencyHash } : {}),
  });

  if (!result.ok) return domainErrorToResponse(result.error);

  const tx = result.value.transaction;
  const responseBody = {
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

  // PATCH always 200 (whether replay or fresh write — the body is the same).
  return responseOk(responseBody);
};

export const main = withErrorHandler(withAuth(handler));
