import type { Result } from '../shared/Result.js';
import type { UserId } from '../user/UserId.js';
import type { Participant } from './Participant.js';
import type { ParticipantId } from './ParticipantId.js';
import type { ParticipantError } from './ParticipantError.js';

export interface ParticipantRepository {
  /** Persist a newly created Participant. */
  save(participant: Participant): Promise<void>;

  /**
   * Look up a Participant by userId and participantId.
   * Returns null when not found (or owned by another user).
   * May return a soft-deleted participant — callers must check `deletedAt`.
   */
  findById(userId: UserId, participantId: ParticipantId): Promise<Participant | null>;

  /** List all non-deleted participants for a user. */
  listByUser(userId: UserId): Promise<Participant[]>;

  /**
   * Persist edits to an existing Participant. Implementation MUST use a
   * ConditionExpression requiring the item to exist, so a vanished participant
   * surfaces as an error rather than resurrecting the row.
   */
  update(participant: Participant): Promise<void>;

  /** Persist the soft-deleted state after `participant.softDelete()`. */
  softDelete(participant: Participant): Promise<void>;

  /**
   * Validate that a participantId is usable as the attribution of a
   * transaction owned by `userId`.
   *
   * Returns ParticipantNotFound when missing or owned by someone else, and
   * ParticipantAlreadyDeleted when soft-deleted — a deleted participant can
   * stay on the transactions that already reference it, but must not be
   * selectable for new ones.
   */
  validateParticipantForUser(input: {
    userId: UserId;
    participantId: ParticipantId;
  }): Promise<Result<void, ParticipantError>>;
}
