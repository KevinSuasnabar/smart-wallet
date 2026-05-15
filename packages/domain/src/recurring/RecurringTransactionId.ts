import { ValueObject } from '../shared/ValueObject.js';
import { ok, err } from '../shared/Result.js';
import type { Result } from '../shared/Result.js';
import type { IdGenerator } from '../shared/IdGenerator.js';
import { InvalidRecurringId } from './RecurringError.js';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface RecurringTransactionIdProps {
  value: string;
}

export class RecurringTransactionId extends ValueObject<RecurringTransactionIdProps> {
  private constructor(props: RecurringTransactionIdProps) {
    super(props);
  }

  get value(): string {
    return this.props.value;
  }

  static create(raw: string): Result<RecurringTransactionId, InvalidRecurringId> {
    if (!UUID_V4_REGEX.test(raw)) {
      return err(
        new InvalidRecurringId(
          `Invalid RecurringTransactionId: "${raw}" is not a UUID v4`,
        ),
      );
    }
    return ok(new RecurringTransactionId({ value: raw }));
  }

  static generate(idGen: IdGenerator): RecurringTransactionId {
    return new RecurringTransactionId({ value: idGen.uuid() });
  }

  override toString(): string {
    return this.props.value;
  }
}
