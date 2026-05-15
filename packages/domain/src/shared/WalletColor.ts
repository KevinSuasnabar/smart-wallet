/**
 * Domain-owned WalletColor type. Declared here so the domain package has
 * zero runtime dependencies on shared-types. Structurally identical to
 * shared-types' WalletColor — TypeScript's structural type system means the
 * two types are interchangeable at compile time.
 *
 * If the palette ever diverges, the domain type wins.
 */
export const WALLET_COLORS = [
  'lime',
  'lilac',
  'cream',
  'pink',
  'mint',
  'coral',
  'navy',
] as const;

export type WalletColor = (typeof WALLET_COLORS)[number];

export const isWalletColor = (v: unknown): v is WalletColor =>
  typeof v === 'string' && (WALLET_COLORS as readonly string[]).includes(v);
