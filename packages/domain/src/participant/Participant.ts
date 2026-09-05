import { AggregateRoot } from '../shared/AggregateRoot.js';
import { ok, err } from '../shared/Result.js';
import type { Result } from '../shared/Result.js';
import type { Clock } from '../shared/Clock.js';
import { isWalletColor } from '../shared/WalletColor.js';
import type { WalletColor } from '../shared/WalletColor.js';
import type { UserId } from '../user/UserId.js';
import type { ParticipantId } from './ParticipantId.js';
import { InvalidParticipantName, InvalidParticipantColor } from './ParticipantError.js';
import type { ParticipantError } from './ParticipantError.js';

const MAX_NAME_LENGTH = 32;

export interface ParticipantProps {
  userId: UserId;
  name: string;
  color: WalletColor;
  createdAt: Date;
  updatedAt: Date;
  /** null when active; set to a Date on soft-delete. */
  deletedAt: Date | null;
}

export interface CreateParticipantProps {
  id: ParticipantId;
  userId: UserId;
  name: string;
  color: string;
  clock: Clock;
}

/**
 * A person a transaction can be attributed to, owned by one user account.
 *
 * Soft-deleted rather than hard-deleted: transactions keep a `participantId`
 * reference, and erasing the row would leave those transactions pointing at
 * nothing. A deleted participant disappears from the pickers but still
 * resolves to a name on the transactions that already reference it.
 */
export class Participant extends AggregateRoot<ParticipantId> {
  private _props: ParticipantProps;

  private constructor(id: ParticipantId, props: ParticipantProps) {
    super(id);
    this._props = props;
  }

  // ── Accessors ────────────────────────────────────────────────────────────

  get userId(): UserId {
    return this._props.userId;
  }

  get name(): string {
    return this._props.name;
  }

  get color(): WalletColor {
    return this._props.color;
  }

  get createdAt(): Date {
    return this._props.createdAt;
  }

  get updatedAt(): Date {
    return this._props.updatedAt;
  }

  get deletedAt(): Date | null {
    return this._props.deletedAt;
  }

  // ── Factory ───────────────────────────────────────────────────────────────

  static create(props: CreateParticipantProps): Result<Participant, ParticipantError> {
    const trimmedName = props.name.trim();
    if (trimmedName.length === 0 || trimmedName.length > MAX_NAME_LENGTH) {
      return err(new InvalidParticipantName());
    }

    if (!isWalletColor(props.color)) {
      return err(new InvalidParticipantColor());
    }

    const now = props.clock.now();

    return ok(
      new Participant(props.id, {
        userId: props.userId,
        name: trimmedName,
        color: props.color,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }),
    );
  }

  // ── Rehydration ──────────────────────────────────────────────────────────

  /**
   * Reconstruct a Participant from persisted storage without running create()
   * validations. ONLY for use in adapters (DynamoDB repositories).
   */
  static rehydrate(id: ParticipantId, props: ParticipantProps): Participant {
    return new Participant(id, props);
  }

  // ── Methods ───────────────────────────────────────────────────────────────

  /**
   * Soft-delete this participant.
   * Idempotent: if already deleted, returns ok(undefined) without touching timestamps.
   */
  softDelete(clock: Clock): Result<void, ParticipantError> {
    if (this._props.deletedAt !== null) {
      return ok(undefined);
    }
    const now = clock.now();
    this._props.deletedAt = now;
    this._props.updatedAt = now;
    return ok(undefined);
  }

  /**
   * Apply a partial edit in place, validating each provided field with the
   * factory's validators. Rolls back to the pre-call state on any failure.
   */
  applyEdits(
    edits: { name?: string; color?: string },
    clock: Clock,
  ): Result<void, ParticipantError> {
    const snapshot: ParticipantProps = { ...this._props };

    if (edits.name !== undefined) {
      const trimmed = edits.name.trim();
      if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) {
        return err(new InvalidParticipantName());
      }
      this._props.name = trimmed;
    }

    if (edits.color !== undefined) {
      if (!isWalletColor(edits.color)) {
        this._props = snapshot;
        return err(new InvalidParticipantColor());
      }
      this._props.color = edits.color;
    }

    this._props.updatedAt = clock.now();
    return ok(undefined);
  }
}
