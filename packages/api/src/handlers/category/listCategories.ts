import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { withAuth, withErrorHandler } from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';
import { ok } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';

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
    predefined: predefined.map((cat) => ({
      categoryId: cat.id,
      name: cat.slug,
      type: cat.type,
    })),
    custom: custom.map((cat) => ({
      categoryId: cat.id.toString(),
      name: cat.name,
      type: cat.type,
      createdAt: cat.createdAt.toISOString(),
    })),
  });
};

// Lambda entry point — middleware applied outside-in: error boundary wraps auth
export const main = withErrorHandler(withAuth(handler));
