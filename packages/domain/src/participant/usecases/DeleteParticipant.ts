import { err, ok } from '../../shared/Result.js';
import type { Result } from '../../shared/Result.js';
import type { Clock } from '../../shared/Clock.js';
import { UserId } from '../../user/UserId.js';
import type { UserError } from '../../user/UserError.js';
import { ParticipantId } from '../ParticipantId.js';
import { ParticipantNotFound } from '../ParticipantError.js';
import type { ParticipantError } from '../ParticipantError.js';
import type { ParticipantRepository } from '../ParticipantRepository.js';

export interface DeleteParticipantInput {
  userId: string;
  participantId: string;
}

export interface DeleteParticipantDeps {
  participantRepo: ParticipantRepository;
  clock: Clock;
}

export type DeleteParticipantOutput = Result<void, ParticipantError | UserError>;

/**
 * Soft-deletes a participant. Unlike categories this does NOT refuse when
 * transactions still reference it: the attribution is historical data worth
 * keeping, and there is no index to count references cheaply. The participant
 * simply stops appearing in the pickers.
 *
 * Idempotent — deleting an already-deleted participant succeeds silently.
 */
export const makeDeleteParticipant =
  (deps: DeleteParticipantDeps) =>
  async (input: DeleteParticipantInput): Promise<DeleteParticipantOutput> => {
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) return err(userIdResult.error);

    const participantIdResult = ParticipantId.create(input.participantId);
    if (!participantIdResult.ok) return err(participantIdResult.error);

    const existing = await deps.participantRepo.findById(
      userIdResult.value,
      participantIdResult.value,
    );
    if (existing === null) return err(new ParticipantNotFound());

    const deleteResult = existing.softDelete(deps.clock);
    if (!deleteResult.ok) return err(deleteResult.error);

    await deps.participantRepo.softDelete(existing);

    return ok(undefined);
  };
