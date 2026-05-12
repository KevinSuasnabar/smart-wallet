import { ValueObject } from '../shared/ValueObject.js';
import { ok, err } from '../shared/Result.js';
import type { Result } from '../shared/Result.js';
import type { IdGenerator } from '../shared/IdGenerator.js';
import { InvalidCategoryId } from './CategoryError.js';
import type { CategoryError } from './CategoryError.js';
import { isPredefinedCategoryId } from './predefinedIds.js';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Discriminates between predefined ("type:slug") and custom (UUID v4) category IDs. */
export type CategoryIdKind = 'predefined' | 'custom';

interface CategoryIdProps {
  value: string;
  kind: CategoryIdKind;
}

export class CategoryId extends ValueObject<CategoryIdProps> {
  private constructor(props: CategoryIdProps) {
    super(props);
  }

  get value(): string {
    return this.props.value;
  }

  /**
   * Whether this is a predefined ("type:slug") or custom (UUID v4) category ID.
   */
  get kind(): CategoryIdKind {
    return this.props.kind;
  }

  /**
   * Parse and validate a raw category ID string.
   *
   * Valid forms:
   * - Custom: UUID v4 (e.g. `"550e8400-e29b-41d4-a716-446655440000"`)
   * - Predefined: `"income:<slug>"` or `"expense:<slug>"` from the known set
   *   (e.g. `"income:salary"`, `"expense:food"`)
   */
  static create(raw: string): Result<CategoryId, CategoryError> {
    if (UUID_V4_REGEX.test(raw)) {
      return ok(new CategoryId({ value: raw, kind: 'custom' }));
    }

    if (isPredefinedCategoryId(raw)) {
      return ok(new CategoryId({ value: raw, kind: 'predefined' }));
    }

    return err(
      new InvalidCategoryId(
        `Invalid CategoryId: "${raw}" is neither a UUID v4 nor a known predefined category ID`,
      ),
    );
  }

  /**
   * Generate a new custom CategoryId using the injected IdGenerator port.
   * The returned ID will always have kind = 'custom'.
   */
  static generateCustom(idGen: IdGenerator): CategoryId {
    return new CategoryId({ value: idGen.uuid(), kind: 'custom' });
  }

  override toString(): string {
    return this.props.value;
  }
}
