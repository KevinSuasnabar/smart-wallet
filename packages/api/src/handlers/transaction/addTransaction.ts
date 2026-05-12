import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { AddTransactionRequestSchema, WalletIdPathSchema } from '@smart-wallet/shared-types';
import type { AddTransactionDTO, WalletIdPathDTO } from '@smart-wallet/shared-types';
import { withAuth, withErrorHandler, validateBody, validatePath } from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';
import { created, badRequest } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';
import { parseAmountForCurrency, formatMoneyForResponse } from '../../shared/boundary/index.js';

/**
 * POST /wallets/{walletId}/transactions — add a new transaction to a wallet.
 *
 * Strategy (C3 — MVP pragmatic):
 * - Request body includes `currency` field matching the wallet's locked currency.
 * - Handler converts the decimal amount string to cents here at the boundary.
 * - Use case validates that input.currency === wallet.currency (CurrencyMismatch on mismatch).
 *
 * Idempotency-Key header is read but not yet wired (Slice 11 / T-10-03).
 *
 * Middleware chain: withErrorHandler → withAuth → handler
 *
 * REQ-TXN-01, REQ-TXN-03, REQ-TXN-04, REQ-TXN-05, REQ-TXN-08
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

  const result = await container.addTransaction({
    userId: event.userId,
    walletId: path.walletId,
    type: input.type,
    amountCents: money.amount,
    currency: input.currency,
    categoryId: input.categoryId,
    description: input.description ?? null,
    occurredAt: new Date(input.occurredAt),
  });

  if (!result.ok) return domainErrorToResponse(result.error);

  const transaction = result.value;

  // Always 201 for now; Slice 11 (T-10-03) wires idempotency replay → 200
  return created({
    transactionId: transaction.id.toString(),
    walletId: transaction.walletId.toString(),
    type: transaction.type,
    amount: formatMoneyForResponse(transaction.amount),
    currency: transaction.amount.currency,
    categoryId: transaction.categoryId,
    occurredAt: transaction.occurredAt.toISOString(),
    createdAt: transaction.createdAt.toISOString(),
    ...(transaction.description !== null ? { description: transaction.description } : {}),
  });
};

// Lambda entry point — middleware applied outside-in: error boundary wraps auth
export const main = withErrorHandler(withAuth(handler));
