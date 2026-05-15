import { ok, err } from '../shared/Result.js';
import type { Result } from '../shared/Result.js';
import type { Clock } from '../shared/Clock.js';
import type { UserId } from '../user/UserId.js';
import { InvalidCategoryId } from './CategoryError.js';
import type { CategoryError } from './CategoryError.js';

/**
 * Set of valid predefined ids. Kept in the domain to avoid an import from
 * shared-types — same independence policy as `Currency` and `WalletColor`.
 * Structurally identical to `PREDEFINED_CATEGORY_IDS` in shared-types.
 */
const PREDEFINED_IDS = [
  'income:salary',
  'income:freelance',
  'income:investment',
  'income:gift',
  'income:other',
  'expense:food',
  'expense:transport',
  'expense:rent',
  'expense:utilities',
  'expense:entertainment',
  'expense:health',
  'expense:education',
  'expense:shopping',
  'expense:other',
] as const;

/**
 * A per-user marker that hides a predefined category from this user's list.
 * Persisted as its own item in DynamoDB under the user's partition.
 *
 * "Hide" is distinct from "delete": the predefined still exists globally for
 * other users; this marker only affects which entries appear in the current
 * user's `GET /categories` response.
 */
export class HiddenPredefinedCategory {
  private constructor(
    public readonly userId: UserId,
    public readonly predefinedCategoryId: string,
    public readonly createdAt: Date,
  ) {}

  static create(props: {
    userId: UserId;
    predefinedCategoryId: string;
    clock: Clock;
  }): Result<HiddenPredefinedCategory, CategoryError> {
    if (!(PREDEFINED_IDS as readonly string[]).includes(props.predefinedCategoryId)) {
      return err(new InvalidCategoryId('Unknown predefined category id'));
    }
    return ok(
      new HiddenPredefinedCategory(
        props.userId,
        props.predefinedCategoryId,
        props.clock.now(),
      ),
    );
  }

  static rehydrate(props: {
    userId: UserId;
    predefinedCategoryId: string;
    createdAt: Date;
  }): HiddenPredefinedCategory {
    return new HiddenPredefinedCategory(
      props.userId,
      props.predefinedCategoryId,
      props.createdAt,
    );
  }
}
