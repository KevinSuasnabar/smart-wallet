import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { CreateCustomCategoryRequestSchema } from '@smart-wallet/shared-types';
import type { CreateCustomCategoryDTO } from '@smart-wallet/shared-types';
import { withAuth, withErrorHandler, validateBody } from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';
import { created } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';

/**
 * POST /categories — create a new custom category for the authenticated user.
 *
 * Body: { name: string (1–32 trimmed), type: "income" | "expense" }
 * Returns 201 with the created category.
 * Middleware chain: withErrorHandler → withAuth → handler
 *
 * REQ-CAT-01, REQ-CAT-02
 */
const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const validation = validateBody(CreateCustomCategoryRequestSchema, event.raw);
  if (!validation.ok) return validation.response;

  const input: CreateCustomCategoryDTO = validation.data;

  const result = await container.createCustomCategory({
    userId: event.userId,
    name: input.name,
    type: input.type,
  });

  if (!result.ok) return domainErrorToResponse(result.error);

  const category = result.value;

  return created({
    categoryId: category.id.toString(),
    name: category.name,
    type: category.type,
    createdAt: category.createdAt.toISOString(),
  });
};

// Lambda entry point — middleware applied outside-in: error boundary wraps auth
export const main = withErrorHandler(withAuth(handler));
