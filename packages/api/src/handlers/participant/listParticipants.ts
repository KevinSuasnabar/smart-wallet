import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { withAuth, withErrorHandler } from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';
import { ok } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';

/**
 * GET /participants — list the account's active participants.
 *
 * Soft-deleted participants are excluded: they stay attached to the
 * transactions that already reference them, but must not be selectable again.
 *
 * Middleware chain: withErrorHandler -> withAuth -> handler
 */
const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const result = await container.listParticipants({ userId: event.userId });

  if (!result.ok) return domainErrorToResponse(result.error);

  return ok({
    items: result.value.map((participant) => ({
      participantId: participant.id.toString(),
      name: participant.name,
      color: participant.color,
      createdAt: participant.createdAt.toISOString(),
    })),
  });
};

export const main = withErrorHandler(withAuth(handler));
