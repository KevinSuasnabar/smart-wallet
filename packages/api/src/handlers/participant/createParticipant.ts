import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { CreateParticipantRequestSchema } from '@smart-wallet/shared-types';
import type { CreateParticipantDTO } from '@smart-wallet/shared-types';
import { withAuth, withErrorHandler, validateBody } from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';
import { created } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';

/**
 * POST /participants — create a person transactions can be attributed to.
 *
 * Body: { name: string (1-32 trimmed), color: WalletColor }
 * Returns 201 with the created participant.
 *
 * Middleware chain: withErrorHandler -> withAuth -> handler
 */
const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const validation = validateBody(CreateParticipantRequestSchema, event.raw);
  if (!validation.ok) return validation.response;

  const input: CreateParticipantDTO = validation.data;

  const result = await container.createParticipant({
    userId: event.userId,
    name: input.name,
    color: input.color,
  });

  if (!result.ok) return domainErrorToResponse(result.error);

  const participant = result.value;

  return created({
    participantId: participant.id.toString(),
    name: participant.name,
    color: participant.color,
    createdAt: participant.createdAt.toISOString(),
  });
};

export const main = withErrorHandler(withAuth(handler));
