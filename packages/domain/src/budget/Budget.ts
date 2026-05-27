import { AggregateRoot } from '../shared/AggregateRoot.js';
import { ok, err } from '../shared/Result.js';
import type { Result } from '../shared/Result.js';
import type { Currency } from '../shared/Currency.js';
import type { BudgetId } from './BudgetId.js';
import type { UserId } from '../user/UserId.js';
import { BudgetValidationError } from './BudgetError.js';
import type { BudgetError } from './BudgetError.js';

export type BudgetType = 'per_category' | 'global';

const VALID_CURRENCIES: readonly Currency[] = ['USD', 'PEN'];

export interface BudgetProps {
  userId: UserId;
  type: BudgetType;
  categoryId: string | undefined;
  limitCents: number;
  currency: Currency;
  rollover: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBudgetProps {
  budgetId: BudgetId;
  userId: UserId;
  type: string;
  categoryId?: string;
  limitCents: number;
  currency: string;
  rollover?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class Budget extends AggregateRoot<BudgetId> {
  private _props: BudgetProps;

  private constructor(id: BudgetId, props: BudgetProps) {
    super(id);
    this._props = props;
  }

  get userId(): UserId {
    return this._props.userId;
  }
  get type(): BudgetType {
    return this._props.type;
  }
  get categoryId(): string | undefined {
    return this._props.categoryId;
  }
  get limitCents(): number {
    return this._props.limitCents;
  }
  get currency(): Currency {
    return this._props.currency;
  }
  get rollover(): boolean {
    return this._props.rollover;
  }
  get createdAt(): Date {
    return this._props.createdAt;
  }
  get updatedAt(): Date {
    return this._props.updatedAt;
  }

  static create(props: CreateBudgetProps): Result<Budget, BudgetError> {
    if (!Number.isInteger(props.limitCents) || props.limitCents <= 0) {
      return err(new BudgetValidationError('limitCents must be a positive integer'));
    }

    if (!(VALID_CURRENCIES as readonly string[]).includes(props.currency)) {
      return err(new BudgetValidationError('currency must be USD or PEN'));
    }

    if (props.type !== 'per_category' && props.type !== 'global') {
      return err(new BudgetValidationError('type must be per_category or global'));
    }

    if (props.type === 'per_category' && !props.categoryId) {
      return err(new BudgetValidationError('per_category budget requires a categoryId'));
    }

    if (props.type === 'global' && props.categoryId) {
      return err(new BudgetValidationError('global budget must not have a categoryId'));
    }

    return ok(
      new Budget(props.budgetId, {
        userId: props.userId,
        type: props.type,
        categoryId: props.categoryId,
        limitCents: props.limitCents,
        currency: props.currency as Currency,
        rollover: props.rollover ?? false,
        createdAt: props.createdAt,
        updatedAt: props.updatedAt,
      }),
    );
  }

  static rehydrate(id: BudgetId, props: BudgetProps): Budget {
    return new Budget(id, props);
  }

  applyEdits(
    edits: { limitCents?: number; rollover?: boolean },
    updatedAt: Date,
  ): Result<void, BudgetError> {
    if (edits.limitCents !== undefined) {
      if (!Number.isInteger(edits.limitCents) || edits.limitCents <= 0) {
        return err(new BudgetValidationError('limitCents must be a positive integer'));
      }
      this._props.limitCents = edits.limitCents;
    }
    if (edits.rollover !== undefined) {
      this._props.rollover = edits.rollover;
    }
    this._props.updatedAt = updatedAt;
    return ok(undefined);
  }
}
