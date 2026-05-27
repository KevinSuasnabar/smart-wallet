import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { BudgetPathSchema, UpdateBudgetBodySchema } from '@smart-wallet/shared-types';
import type { BudgetPathDTO, UpdateBudgetDTO } from '@smart-wallet/shared-types';
import { withAuth, withErrorHandler, validatePath, validateBody } from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';
import { ok as responseOk } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';
import { formatCentsForResponse } from '../../shared/boundary/index.js';

const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const pathValidation = validatePath(BudgetPathSchema, event.raw);
  if (!pathValidation.ok) return pathValidation.response;
  const path: BudgetPathDTO = pathValidation.data;

  const bodyValidation = validateBody(UpdateBudgetBodySchema, event.raw);
  if (!bodyValidation.ok) return bodyValidation.response;
  const input: UpdateBudgetDTO = bodyValidation.data;

  const result = await container.updateBudget({
    userId: event.userId,
    budgetId: path.budgetId,
    edits: {
      ...(input.limitCents !== undefined ? { limitCents: input.limitCents } : {}),
      ...(input.rollover !== undefined ? { rollover: input.rollover } : {}),
    },
  });

  if (!result.ok) return domainErrorToResponse(result.error);

  const b = result.value;
  return responseOk({
    budgetId: b.id.toString(),
    type: b.type,
    ...(b.categoryId !== undefined ? { categoryId: b.categoryId } : {}),
    currency: b.currency,
    limit: formatCentsForResponse(b.limitCents, b.currency),
    rollover: b.rollover,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  });
};

export const main = withErrorHandler(withAuth(handler));
