import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  CategoryIdPathSchema,
  UpdateCategoryRequestSchema,
  PREDEFINED_CATEGORIES,
  type CategoryIdPathDTO,
  type UpdateCategoryDTO,
} from '@smart-wallet/shared-types';
import { withAuth, withErrorHandler, validateBody, validatePath } from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';
import { ok as responseOk, created, badRequest, notFound, conflict } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';
import {
  CategoryId,
  InvalidCategoryId,
  CategoryAlreadyDeleted,
  CategoryAlreadyHidden,
} from '@smart-wallet/domain';

const PREDEFINED_BY_ID: ReadonlyMap<
  string,
  (typeof PREDEFINED_CATEGORIES)[number]
> = new Map(PREDEFINED_CATEGORIES.map((c) => [c.categoryId as string, c]));

/**
 * PATCH /categories/{categoryId}
 *
 * Dispatches by id kind:
 *  - custom (UUID v4)  → UpdateCustomCategory. Returns 200 with the updated custom.
 *  - predefined (slug) → ForkPredefinedCategory. Returns 201 with the NEW custom
 *    that replaces the predefined for this user (different id).
 *
 * Body: { name?, color? } — at least one mutable field required.
 *
 * Middleware chain: withErrorHandler → withAuth → handler
 */
const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const pathValidation = validatePath(CategoryIdPathSchema, event.raw);
  if (!pathValidation.ok) return pathValidation.response;
  const path: CategoryIdPathDTO = pathValidation.data;

  const bodyValidation = validateBody(UpdateCategoryRequestSchema, event.raw);
  if (!bodyValidation.ok) return bodyValidation.response;
  const body: UpdateCategoryDTO = bodyValidation.data;

  const idResult = CategoryId.create(path.categoryId);
  if (!idResult.ok) return domainErrorToResponse(idResult.error);

  const edits = {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.color !== undefined ? { color: body.color } : {}),
  };

  if (idResult.value.kind === 'custom') {
    const result = await container.updateCustomCategory({
      userId: event.userId,
      categoryId: path.categoryId,
      edits,
    });

    if (!result.ok) {
      const e = result.error;
      if (e instanceof InvalidCategoryId) return notFound('category_not_found');
      if (e instanceof CategoryAlreadyDeleted) return conflict('category_already_deleted');
      return domainErrorToResponse(e);
    }

    const c = result.value;
    return responseOk({
      categoryId: c.id.toString(),
      name: c.name,
      type: c.type,
      color: c.color,
      createdAt: c.createdAt.toISOString(),
    });
  }

  // Predefined: fork. The handler resolves the catalog descriptor here so
  // the domain stays free of shared-types.
  const descriptor = PREDEFINED_BY_ID.get(path.categoryId);
  if (descriptor === undefined) {
    // Should not happen — the Zod schema rejects unknown predefined ids in
    // theory, but the regex is permissive (accepts any `(income|expense):[a-z]+`).
    return badRequest('unknown_predefined_category');
  }

  const result = await container.forkPredefinedCategory({
    userId: event.userId,
    predefinedCategoryId: path.categoryId,
    predefinedDescriptor: {
      name: descriptor.name,
      type: descriptor.type,
      color: descriptor.color,
    },
    edits,
  });

  if (!result.ok) {
    const e = result.error;
    if (e instanceof CategoryAlreadyHidden) return conflict('category_already_hidden');
    return domainErrorToResponse(e);
  }

  const c = result.value;
  return created({
    categoryId: c.id.toString(),
    name: c.name,
    type: c.type,
    color: c.color,
    createdAt: c.createdAt.toISOString(),
  });
};

export const main = withErrorHandler(withAuth(handler));
