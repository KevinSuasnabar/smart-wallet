import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  ParticipantIdPathSchema,
  UpdateParticipantRequestSchema,
  type ParticipantIdPathDTO,
  type UpdateParticipantDTO,
} from '@smart-wallet/shared-types';
import { withAuth, withErrorHandler, validateBody, validatePath } from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';
import { ok, notFound, conflict } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';
import { ParticipantNotFound, ParticipantAlreadyDeleted } from '@smart-wallet/domain';

/**
 * PATCH /participants/{participantId} — rename or recolor a participant.
 *
 * Body: { name?, color? } — at least one mutable field required.
 *
 * Middleware chain: withErrorHandler -> withAuth -> handler
 */
const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const pathValidation = validatePath(ParticipantIdPathSchema, event.raw);
  if (!pathValidation.ok) return pathValidation.response;
  const path: ParticipantIdPathDTO = pathValidation.data;

  const bodyValidation = validateBody(UpdateParticipantRequestSchema, event.raw);
  if (!bodyValidation.ok) return bodyValidation.response;
  const body: UpdateParticipantDTO = bodyValidation.data;

  const result = await container.updateParticipant({
    userId: event.userId,
    participantId: path.participantId,
    edits: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.color !== undefined ? { color: body.color } : {}),
    },
  });

  if (!result.ok) {
    const e = result.error;
    if (e instanceof ParticipantNotFound) return notFound('participant_not_found');
    if (e instanceof ParticipantAlreadyDeleted) return conflict('participant_already_deleted');
    return domainErrorToResponse(e);
  }

  const participant = result.value;

  return ok({
    participantId: participant.id.toString(),
    name: participant.name,
    color: participant.color,
    createdAt: participant.createdAt.toISOString(),
  });
};

export const main = withErrorHandler(withAuth(handler));
