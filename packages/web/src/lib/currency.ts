import type { Currency } from '@smart-wallet/shared-types';

export const formatCurrency = (amount: string, currency: Currency): string => {
  const num = parseFloat(amount);
  const locale = currency === 'PEN' ? 'es-PE' : 'en-US';
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(num);
};

// Signed display: income = +, expense = -
export const formatSignedAmount = (
  amount: string,
  currency: Currency,
  type: 'income' | 'expense',
): string => {
  const formatted = formatCurrency(amount, currency);
  return type === 'income' ? `+${formatted}` : `−${formatted}`;
};
