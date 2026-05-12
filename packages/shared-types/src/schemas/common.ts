import { z } from 'zod';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const zUuid = z.string().regex(UUID_V4_REGEX, 'Must be a valid UUID v4');

export const zUserId = zUuid.brand('UserId');

export const zWalletId = zUuid.brand('WalletId');

export const zTransactionId = zUuid.brand('TransactionId');

/**
 * CategoryId accepts UUID v4 values (custom categories).
 * Predefined category IDs (type:slug strings) are NOT valid here —
 * they are validated separately at the domain layer via isPredefinedCategoryId.
 * See REQ-CAT-04: path param categoryId must be UUID; predefined slugs fail at this layer.
 */
export const zCategoryId = zUuid.brand('CategoryId');

export const zIdempotencyKey = z
  .string()
  .min(1)
  .max(128)
  .brand('IdempotencyKey');
