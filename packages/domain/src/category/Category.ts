import { AggregateRoot } from '../shared/AggregateRoot.js';
import { ok, err } from '../shared/Result.js';
import type { Result } from '../shared/Result.js';
import type { Clock } from '../shared/Clock.js';
import { isWalletColor } from '../shared/WalletColor.js';
import type { WalletColor } from '../shared/WalletColor.js';
import type { CategoryId } from './CategoryId.js';
import type { UserId } from '../user/UserId.js';
import type { CategoryType } from './CategoryType.js';
import type { CustomCategoryCreated } from './events/CustomCategoryCreated.js';
import { InvalidCategoryName, InvalidCategoryColor } from './CategoryError.js';
import type { CategoryError } from './CategoryError.js';

const MAX_NAME_LENGTH = 32;

export interface CategoryProps {
  userId: UserId;
  name: string;
  type: CategoryType;
  color: WalletColor;
  createdAt: Date;
  updatedAt: Date;
  /** null when active; set to a Date on soft-delete. */
  deletedAt: Date | null;
}

export interface CreateCategoryProps {
  id: CategoryId;
  userId: UserId;
  name: string;
  type: CategoryType;
  color: string;
  clock: Clock;
}

export class Category extends AggregateRoot<CategoryId> {
  private _props: CategoryProps;

  private constructor(id: CategoryId, props: CategoryProps) {
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

  get type(): CategoryType {
    return this._props.type;
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

  static create(props: CreateCategoryProps): Result<Category, CategoryError> {
    // Invariant: id must be a custom (UUID v4) category — predefined IDs are not entities
    if (props.id.kind !== 'custom') {
      return err(
        new InvalidCategoryName(
          'Category entity can only be created with a custom (UUID v4) CategoryId',
        ),
      );
    }

    const trimmedName = props.name.trim();
    if (trimmedName.length === 0 || trimmedName.length > MAX_NAME_LENGTH) {
      return err(new InvalidCategoryName());
    }

    if (!isWalletColor(props.color)) {
      return err(new InvalidCategoryColor());
    }

    const now = props.clock.now();

    const category = new Category(props.id, {
      userId: props.userId,
      name: trimmedName,
      type: props.type,
      color: props.color,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const event: CustomCategoryCreated = {
      eventName: 'CustomCategoryCreated',
      aggregateId: props.id.value,
      occurredAt: now,
      categoryId: props.id.value,
      userId: props.userId.value,
      name: trimmedName,
      type: props.type,
    };

    category.addDomainEvent(event);

    return ok(category);
  }

  // ── Rehydration ──────────────────────────────────────────────────────────

  /**
   * Reconstruct a Category from persisted storage without running create() validations.
   * ONLY for use in adapters (DynamoDB repositories). Trusts the stored data is valid.
   */
  static rehydrate(
    id: CategoryId,
    props: CategoryProps,
  ): Category {
    return new Category(id, props);
  }

  // ── Methods ───────────────────────────────────────────────────────────────

  /**
   * Soft-delete this category.
   * Idempotent: if already deleted, returns ok(undefined) without changing timestamps.
   */
  softDelete(clock: Clock): Result<void, CategoryError> {
    if (this._props.deletedAt !== null) {
      return ok(undefined);
    }
    const now = clock.now();
    this._props.deletedAt = now;
    this._props.updatedAt = now;
    return ok(undefined);
  }

  /**
   * Apply a partial edit in place. Validates each provided field with the
   * factory's validators. Rolls back to the pre-call state on any failure.
   *
   * The use case is responsible for higher-level checks (e.g., is the
   * category soft-deleted?).
   */
  applyEdits(
    edits: { name?: string; color?: string },
    clock: Clock,
  ): Result<void, CategoryError> {
    const snapshot: CategoryProps = { ...this._props };

    if (edits.name !== undefined) {
      const trimmed = edits.name.trim();
      if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) {
        return err(new InvalidCategoryName());
      }
      this._props.name = trimmed;
    }

    if (edits.color !== undefined) {
      if (!isWalletColor(edits.color)) {
        this._props = snapshot;
        return err(new InvalidCategoryColor());
      }
      this._props.color = edits.color;
    }

    this._props.updatedAt = clock.now();
    return ok(undefined);
  }
}
