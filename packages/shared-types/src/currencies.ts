import { z } from 'zod';

export const CURRENCIES = ['USD', 'PEN'] as const;

export type Currency = (typeof CURRENCIES)[number];

export const currencyDecimals: Record<Currency, number> = {
  USD: 2,
  PEN: 2,
};

export const zCurrency = z.enum(CURRENCIES);
