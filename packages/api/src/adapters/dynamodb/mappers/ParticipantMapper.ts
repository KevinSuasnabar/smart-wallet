import { Participant, ParticipantId, UserId, ok, err, isWalletColor } from '@smart-wallet/domain';
import type { ParticipantError, Result, ParticipantProps, WalletColor } from '@smart-wallet/domain';
import { InvalidParticipantId } from '@smart-wallet/domain';
import { userPK, participantSK } from '../keyBuilders.js';

// ── DynamoDB item shape ────────────────────────────────────────────────────
// Participants live in the same single table as everything else, partitioned
// by USER#<userId>. No GSI is needed: they are only ever read as "all
// participants of this account".

export interface ParticipantItem {
  PK: string;
  SK: string;
  entityType: 'Participant';
  participantId: string;
  userId: string;
  name: string;
  color: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  /** Omitted from item when active (null in domain). */
  deletedAt?: string; // ISO 8601
}

// ── Participant (domain) → ParticipantItem (DDB) ──────────────────────────

export const participantToItem = (participant: Participant): ParticipantItem => ({
  PK: userPK(participant.userId.toString()),
  SK: participantSK(participant.id.toString()),
  entityType: 'Participant',
  participantId: participant.id.toString(),
  userId: participant.userId.toString(),
  name: participant.name,
  color: participant.color,
  createdAt: participant.createdAt.toISOString(),
  updatedAt: participant.updatedAt.toISOString(),
  // exactOptionalPropertyTypes: only set deletedAt when non-null
  ...(participant.deletedAt !== null ? { deletedAt: participant.deletedAt.toISOString() } : {}),
});

// ── ParticipantItem (DDB) → Participant (domain) ──────────────────────────

export const itemToParticipant = (
  item: ParticipantItem,
): Result<Participant, ParticipantError> => {
  const participantIdResult = ParticipantId.create(item.participantId);
  if (!participantIdResult.ok) {
    return err(new InvalidParticipantId(`Stored participantId is invalid: ${item.participantId}`));
  }

  const userIdResult = UserId.create(item.userId);
  if (!userIdResult.ok) {
    return err(new InvalidParticipantId(`Stored userId is invalid: ${item.userId}`));
  }

  // A stored color outside the palette would only come from a hand-edited item;
  // fall back rather than dropping the participant out of the list entirely.
  const color: WalletColor = isWalletColor(item.color) ? item.color : 'lilac';

  const props: ParticipantProps = {
    userId: userIdResult.value,
    name: item.name,
    color,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
    deletedAt: item.deletedAt !== undefined ? new Date(item.deletedAt) : null,
  };

  return ok(Participant.rehydrate(participantIdResult.value, props));
};
