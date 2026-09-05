import { err } from '../../shared/Result.js';
import type { Result } from '../../shared/Result.js';
import type { Clock } from '../../shared/Clock.js';
import type { IdGenerator } from '../../shared/IdGenerator.js';
import { UserId } from '../../user/UserId.js';
import type { UserError } from '../../user/UserError.js';
import { Participant } from '../Participant.js';
import { ParticipantId } from '../ParticipantId.js';
import type { ParticipantRepository } from '../ParticipantRepository.js';
import type { ParticipantError } from '../ParticipantError.js';

export interface CreateParticipantInput {
  /** Raw userId string from JWT — validated here before use. */
  userId: string;
  name: string;
  /** Raw color string — validated by Participant.create against the palette. */
  color: string;
}

export interface CreateParticipantDeps {
  participantRepo: ParticipantRepository;
  idGen: IdGenerator;
  clock: Clock;
}

export type CreateParticipantOutput = Result<Participant, ParticipantError | UserError>;

export const makeCreateParticipant =
  (deps: CreateParticipantDeps) =>
  async (input: CreateParticipantInput): Promise<CreateParticipantOutput> => {
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) return err(userIdResult.error);

    const participantResult = Participant.create({
      id: ParticipantId.generate(deps.idGen),
      userId: userIdResult.value,
      name: input.name,
      color: input.color,
      clock: deps.clock,
    });

    if (!participantResult.ok) return participantResult;

    await deps.participantRepo.save(participantResult.value);

    return participantResult;
  };
