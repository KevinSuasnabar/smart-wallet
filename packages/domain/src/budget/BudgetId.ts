import { ValueObject } from '../shared/ValueObject.js';
import { err, ok } from '../shared/Result.js';
import type { Result } from '../shared/Result.js';
import type { IdGenerator } from '../shared/IdGenerator.js';
import { InvalidBudgetId } from './BudgetError.js';
import type { BudgetError } from './BudgetError.js';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface BudgetIdProps {
  value: string;
}

export class BudgetId extends ValueObject<BudgetIdProps> {
  private constructor(props: BudgetIdProps) {
    super(props);
  }

  get value(): string {
    return this.props.value;
  }

  static create(raw: string): Result<BudgetId, BudgetError> {
    if (!UUID_V4_REGEX.test(raw)) {
      return err(new InvalidBudgetId(`Invalid BudgetId: "${raw}" is not a UUID v4`));
    }
    return ok(new BudgetId({ value: raw }));
  }

  static generate(idGen: IdGenerator): BudgetId {
    return new BudgetId({ value: idGen.uuid() });
  }

  override toString(): string {
    return this.props.value;
  }
}
