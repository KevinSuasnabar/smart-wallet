import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { CategoryIdPathSchema, type CategoryIdPathDTO } from '@smart-wallet/shared-types';
import { withAuth, withErrorHandler, validatePath } from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';
import { noContent, badRequest, notFound, conflict } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';
import {
  CategoryId,
  CannotDeletePredefined,
  InvalidCategoryId,
  CategoryHasTransactions,
} from '@smart-wallet/domain';

/**
 * DELETE /categories/{categoryId}
 *
 * Dispatches by id kind:
 * - custom (UUID v4)   → existing soft-delete flow (DeleteCustomCategory).
 * - predefined (slug)  → HidePredefinedCategory (writes a per-user hide marker).
 *
 * Both return 204 No Content on success. 409 when the category still has
 * active transactions (CategoryHasTransactions guard). 404 when a custom is
 * not found.
 *
 * Middleware chain: withErrorHandler → withAuth → handler
 */
const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const pathValidation = validatePath(CategoryIdPathSchema, event.raw);
  if (!pathValidation.ok) return pathValidation.response;
  const path: CategoryIdPathDTO = pathValidation.data;

  const idResult = CategoryId.create(path.categoryId);
  if (!idResult.ok) return domainErrorToResponse(idResult.error);

  if (idResult.value.kind === 'custom') {
    const result = await container.deleteCustomCategory({
      userId: event.userId,
      categoryId: path.categoryId,
    });

    if (!result.ok) {
      const { error } = result;
      if (error instanceof CannotDeletePredefined) {
        return badRequest('cannot_delete_predefined_category');
      }
      if (error instanceof InvalidCategoryId) {
        return notFound('category_not_found');
      }
      if (error instanceof CategoryHasTransactions) {
        return conflict('category_has_transactions');
      }
      return domainErrorToResponse(error);
    }

    return noContent();
  }

  // Predefined: hide for this user
  const result = await container.hidePredefinedCategory({
    userId: event.userId,
    predefinedCategoryId: path.categoryId,
  });

  if (!result.ok) {
    const { error } = result;
    if (error instanceof CategoryHasTransactions) {
      return conflict('category_has_transactions');
    }
    return domainErrorToResponse(error);
  }

  return noContent();
};

export const main = withErrorHandler(withAuth(handler));
