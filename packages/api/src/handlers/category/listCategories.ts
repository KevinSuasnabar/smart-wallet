import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { PREDEFINED_CATEGORIES } from '@smart-wallet/shared-types';
import { withAuth, withErrorHandler } from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';
import { ok } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';

// Static lookup: predefined id → catalog entry (with neutro name + color).
// Typed with string keys so callers can look up arbitrary id strings without
// narrowing first; the get() returns undefined for non-predefined ids.
const PREDEFINED_BY_ID: ReadonlyMap<
  string,
  (typeof PREDEFINED_CATEGORIES)[number]
> = new Map(PREDEFINED_CATEGORIES.map((c) => [c.categoryId as string, c]));

/**
 * GET /categories — list predefined and custom categories for the authenticated user.
 *
 * Returns:
 * - `predefined`: static list of 14 built-in categories (5 income + 9 expense),
 *   each with id, name, type (no createdAt — they are not stored in DynamoDB).
 * - `custom`: user-created categories with id, name, type, and createdAt.
 *
 * No query/body validation needed — input is only the authenticated userId.
 * Middleware chain: withErrorHandler → withAuth → handler
 *
 * REQ-CAT-06, REQ-CAT-07
 */
const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const result = await container.listCategories({ userId: event.userId });

  if (!result.ok) return domainErrorToResponse(result.error);

  const { predefined, custom } = result.value;

  return ok({
    predefined: predefined.map((cat) => {
      const catalog = PREDEFINED_BY_ID.get(cat.id);
      return {
        categoryId: cat.id,
        // Catalog provides Spanish-neutro name + color. The use case only
        // gives us the id/slug/type — we resolve display fields here so the
        // domain stays free of i18n concerns.
        name: catalog?.name ?? cat.slug,
        type: cat.type,
        color: catalog?.color ?? (cat.type === 'income' ? 'mint' : 'coral'),
      };
    }),
    custom: custom.map((cat) => ({
      categoryId: cat.id.toString(),
      name: cat.name,
      type: cat.type,
      color: cat.color,
      createdAt: cat.createdAt.toISOString(),
    })),
  });
};

// Lambda entry point — middleware applied outside-in: error boundary wraps auth
export const main = withErrorHandler(withAuth(handler));
