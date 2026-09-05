import { err, ok } from '../../shared/Result.js';
import type { Result } from '../../shared/Result.js';
import type { Clock } from '../../shared/Clock.js';
import { UserId } from '../../user/UserId.js';
import type { UserError } from '../../user/UserError.js';
import { ParticipantId } from '../ParticipantId.js';
import type { Participant } from '../Participant.js';
import { ParticipantNotFound, ParticipantAlreadyDeleted } from '../ParticipantError.js';
import type { ParticipantError } from '../ParticipantError.js';
import type { ParticipantRepository } from '../ParticipantRepository.js';

export interface UpdateParticipantInput {
  userId: string;
  participantId: string;
  edits: {
    name?: string;
    color?: string;
  };
}

export interface UpdateParticipantDeps {
  participantRepo: ParticipantRepository;
  clock: Clock;
}

export type UpdateParticipantOutput = Result<Participant, ParticipantError | UserError>;

export const makeUpdateParticipant =
  (deps: UpdateParticipantDeps) =>
  async (input: UpdateParticipantInput): Promise<UpdateParticipantOutput> => {
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) return err(userIdResult.error);

    const participantIdResult = ParticipantId.create(input.participantId);
    if (!participantIdResult.ok) return err(participantIdResult.error);

    const existing = await deps.participantRepo.findById(
      userIdResult.value,
      participantIdResult.value,
    );
    if (existing === null) return err(new ParticipantNotFound());
    if (existing.deletedAt !== null) return err(new ParticipantAlreadyDeleted());

    const applyResult = existing.applyEdits(input.edits, deps.clock);
    if (!applyResult.ok) return err(applyResult.error);

    await deps.participantRepo.update(existing);

    return ok(existing);
  };
