import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { BudgetPathSchema } from '@smart-wallet/shared-types';
import type { BudgetPathDTO } from '@smart-wallet/shared-types';
import { withAuth, withErrorHandler, validatePath } from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';
import { noContent } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';

const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const pathValidation = validatePath(BudgetPathSchema, event.raw);
  if (!pathValidation.ok) return pathValidation.response;
  const path: BudgetPathDTO = pathValidation.data;

  const result = await container.deleteBudget({
    userId: event.userId,
    budgetId: path.budgetId,
  });
  if (!result.ok) return domainErrorToResponse(result.error);

  return noContent();
};

export const main = withErrorHandler(withAuth(handler));
