import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { withAuth, withErrorHandler } from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';
import { ok as responseOk } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';

const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const result = await container.listBudgets({ userId: event.userId });
  if (!result.ok) return domainErrorToResponse(result.error);

  const items = result.value.map(({ budget: b, spentCents, effectiveLimitCents }) => ({
    budgetId: b.id.toString(),
    type: b.type,
    ...(b.categoryId !== undefined ? { categoryId: b.categoryId } : {}),
    currency: b.currency,
    limitCents: b.limitCents,
    spentCents,
    effectiveLimitCents,
    rollover: b.rollover,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  }));

  return responseOk({ items });
};

export const main = withErrorHandler(withAuth(handler));
