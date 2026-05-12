import { decimalStringToCents, centsToDecimalString } from '@smart-wallet/shared-types';
import type { Currency } from '@smart-wallet/shared-types';
import { Money } from '@smart-wallet/domain';
import type { Result, InvalidMoneyAmount } from '@smart-wallet/domain';

/**
 * Parse an API-supplied decimal amount string into a Money VO using the wallet's currency.
 *
 * The Zod schema already validated the shape (e.g. /^\d+\.\d{2}$/).
 * This function does the currency-aware conversion from decimal string → positive cents,
 * then delegates to Money.create() which enforces strictly-positive constraint.
 *
 * Returns ok(Money) on success, err(InvalidMoneyAmount) if amount is zero.
 *
 * REQ-MNY-03, REQ-MNY-05
 */
export function parseAmountForCurrency(
  amountDecimal: string,
  currency: Currency,
): Result<Money, InvalidMoneyAmount> {
  const cents = decimalStringToCents(amountDecimal, currency);
  return Money.create(cents, currency);
}

/**
 * Format a Money VO for an API response.
 * Money.amount is always positive (domain invariant), so the result is always positive.
 *
 * REQ-MNY-04
 */
export function formatMoneyForResponse(money: Money): string {
  return centsToDecimalString(money.amount, money.currency);
}

/**
 * Format raw cents (which may be negative for balances) as a signed decimal string for API responses.
 * Use this for wallet.balance, where balance can go negative (expenses exceed income).
 *
 * REQ-MNY-04
 */
export function formatCentsForResponse(cents: number, currency: Currency): string {
  return centsToDecimalString(cents, currency);
}
