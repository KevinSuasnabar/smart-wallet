import { err, ok } from '../../shared/Result.js';
import type { Result } from '../../shared/Result.js';
import { UserId } from '../../user/UserId.js';
import type { UserError } from '../../user/UserError.js';
import type { Participant } from '../Participant.js';
import type { ParticipantRepository } from '../ParticipantRepository.js';

export interface ListParticipantsInput {
  userId: string;
}

export interface ListParticipantsDeps {
  participantRepo: ParticipantRepository;
}

export type ListParticipantsOutput = Result<Participant[], UserError>;

/**
 * Lists the account's active participants, alphabetically by name so the
 * picker order is stable across requests (DynamoDB returns them in SK order,
 * which is the UUID — meaningless to a human).
 */
export const makeListParticipants =
  (deps: ListParticipantsDeps) =>
  async (input: ListParticipantsInput): Promise<ListParticipantsOutput> => {
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) return err(userIdResult.error);

    const participants = await deps.participantRepo.listByUser(userIdResult.value);

    return ok(
      [...participants].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })),
    );
  };
