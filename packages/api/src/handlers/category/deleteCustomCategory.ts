import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { CategoryIdPathSchema } from '@smart-wallet/shared-types';
import type { CategoryIdPathDTO } from '@smart-wallet/shared-types';
import { withAuth, withErrorHandler, validatePath } from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';
import { noContent, badRequest, notFound, conflict } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';
import {
  CannotDeletePredefined,
  InvalidCategoryId,
  CategoryHasTransactions,
} from '@smart-wallet/domain';

/**
 * DELETE /categories/{categoryId} — soft-delete a custom category.
 *
 * Path param `categoryId` MUST be a UUID v4. Predefined category IDs (type:slug format)
 * fail Zod validation here and return 400, satisfying REQ-CAT-04.
 *
 * Error mapping:
 * - CannotDeletePredefined  → 400 (predefined IDs that somehow pass path validation)
 * - InvalidCategoryId       → 404 (category not found or not owned by user)
 * - Other domain errors     → domainErrorToResponse (uses httpStatus + tag)
 *
 * Returns 204 No Content on success.
 * Middleware chain: withErrorHandler → withAuth → handler
 *
 * REQ-DEL-01, REQ-CAT-03, REQ-CAT-04
 */
const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const pathValidation = validatePath(CategoryIdPathSchema, event.raw);
  if (!pathValidation.ok) return pathValidation.response;

  const path: CategoryIdPathDTO = pathValidation.data;

  const result = await container.deleteCustomCategory({
    userId: event.userId,
    categoryId: path.categoryId,
  });

  if (!result.ok) {
    const { error } = result;

    // CannotDeletePredefined: attempting to delete a predefined category
    // (belt-and-suspenders — path schema already blocks type:slug IDs)
    if (error instanceof CannotDeletePredefined) {
      return badRequest('cannot_delete_predefined_category');
    }

    // InvalidCategoryId from the use case signals "not found" semantics
    if (error instanceof InvalidCategoryId) {
      return notFound('category_not_found');
    }

    // The category has at least one active transaction; deletion is blocked
    if (error instanceof CategoryHasTransactions) {
      return conflict('category_has_transactions');
    }

    return domainErrorToResponse(error);
  }

  return noContent();
};

// Lambda entry point — middleware applied outside-in: error boundary wraps auth
export const main = withErrorHandler(withAuth(handler));
