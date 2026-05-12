import { z } from 'zod';
import { isPredefinedCategoryId } from '../categories.js';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const zUuid = z.string().regex(UUID_V4_REGEX, 'Must be a valid UUID v4');

export const zUserId = zUuid.brand('UserId');

export const zWalletId = zUuid.brand('WalletId');

export const zTransactionId = zUuid.brand('TransactionId');

/**
 * CategoryId for PATH PARAMETERS — accepts UUID v4 only (custom categories).
 * Predefined category IDs (type:slug strings) are NOT valid here —
 * they are validated separately at the domain layer via isPredefinedCategoryId.
 * See REQ-CAT-04: path param categoryId must be UUID; predefined slugs fail at this layer.
 */
export const zCategoryId = zUuid.brand('CategoryId');

/**
 * CategoryId for REQUEST BODIES — accepts EITHER:
 * - Predefined category IDs (e.g. "income:salary", "expense:food")
 * - UUID v4 (custom categories)
 *
 * Used in AddTransactionRequestSchema where both are valid.
 * REQ-VAL-05, REQ-CAT-04
 */
export const zCategoryIdLike = z
  .string()
  .min(1)
  .refine(
    (v) => isPredefinedCategoryId(v) || UUID_V4_REGEX.test(v),
    'categoryId must be a predefined category ID (e.g. "income:salary") or a UUID v4',
  );

export const zIdempotencyKey = z
  .string()
  .min(1)
  .max(128)
  .brand('IdempotencyKey');
