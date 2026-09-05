import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { ParticipantIdPathSchema, type ParticipantIdPathDTO } from '@smart-wallet/shared-types';
import { withAuth, withErrorHandler, validatePath } from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';
import { noContent, notFound } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';
import { ParticipantNotFound } from '@smart-wallet/domain';

/**
 * DELETE /participants/{participantId} — soft-delete a participant.
 *
 * Transactions already attributed to it keep the reference on purpose: the
 * attribution is history worth preserving. The participant simply stops being
 * offered in the pickers.
 *
 * Middleware chain: withErrorHandler -> withAuth -> handler
 */
const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const pathValidation = validatePath(ParticipantIdPathSchema, event.raw);
  if (!pathValidation.ok) return pathValidation.response;
  const path: ParticipantIdPathDTO = pathValidation.data;

  const result = await container.deleteParticipant({
    userId: event.userId,
    participantId: path.participantId,
  });

  if (!result.ok) {
    const e = result.error;
    if (e instanceof ParticipantNotFound) return notFound('participant_not_found');
    return domainErrorToResponse(e);
  }

  return noContent();
};

export const main = withErrorHandler(withAuth(handler));
