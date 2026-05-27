import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { CreateBudgetBodySchema } from '@smart-wallet/shared-types';
import type { CreateBudgetDTO } from '@smart-wallet/shared-types';
import { withAuth, withErrorHandler, validateBody } from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';
import { created } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';
import { formatCentsForResponse } from '../../shared/boundary/index.js';

const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const bodyValidation = validateBody(CreateBudgetBodySchema, event.raw);
  if (!bodyValidation.ok) return bodyValidation.response;
  const input: CreateBudgetDTO = bodyValidation.data;

  const result = await container.createBudget({
    userId: event.userId,
    type: input.type,
    ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
    limitCents: input.limitCents,
    currency: input.currency,
    ...(input.rollover !== undefined ? { rollover: input.rollover } : {}),
  });

  if (!result.ok) return domainErrorToResponse(result.error);

  const b = result.value;
  return created({
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
