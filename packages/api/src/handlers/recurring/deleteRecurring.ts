import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { RecurringIdPathSchema } from '@smart-wallet/shared-types';
import type { RecurringIdPathDTO } from '@smart-wallet/shared-types';
import {
  withAuth,
  withErrorHandler,
  validatePath,
} from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';
import { noContent } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';

/**
 * DELETE /recurring/{recurringId} — hard-delete; already-materialized
 * transactions are not affected.
 */
const handler = async (
  event: AuthenticatedEvent,
): Promise<APIGatewayProxyResultV2> => {
  const pathValidation = validatePath(RecurringIdPathSchema, event.raw);
  if (!pathValidation.ok) return pathValidation.response;
  const path: RecurringIdPathDTO = pathValidation.data;

  const result = await container.deleteRecurring({
    userId: event.userId,
    recurringId: path.recurringId,
  });
  if (!result.ok) return domainErrorToResponse(result.error);

  return noContent();
};

export const main = withErrorHandler(withAuth(handler));
