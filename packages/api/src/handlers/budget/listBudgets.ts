import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { withAuth, withErrorHandler } from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';
import { ok as responseOk } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';
import { formatCentsForResponse } from '../../shared/boundary/index.js';

const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const result = await container.listBudgets({ userId: event.userId });
  if (!result.ok) return domainErrorToResponse(result.error);

  const items = result.value.map(({ budget: b, spentCents, effectiveLimitCents }) => ({
    budgetId: b.id.toString(),
    type: b.type,
    ...(b.categoryId !== undefined ? { categoryId: b.categoryId } : {}),
    currency: b.currency,
    limit: formatCentsForResponse(b.limitCents, b.currency),
    spent: formatCentsForResponse(spentCents, b.currency),
    effectiveLimit: formatCentsForResponse(effectiveLimitCents, b.currency),
    rollover: b.rollover,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  }));

  return responseOk({ items });
};

export const main = withErrorHandler(withAuth(handler));
