import { ValueObject } from '../shared/ValueObject.js';
import { ok, err } from '../shared/Result.js';
import type { Result } from '../shared/Result.js';
import type { IdGenerator } from '../shared/IdGenerator.js';
import { InvalidTransactionId } from './TransactionError.js';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface TransactionIdProps {
  value: string;
}

export class TransactionId extends ValueObject<TransactionIdProps> {
  private constructor(props: TransactionIdProps) {
    super(props);
  }

  get value(): string {
    return this.props.value;
  }

  static create(raw: string): Result<TransactionId, InvalidTransactionId> {
    if (!UUID_V4_REGEX.test(raw)) {
      return err(new InvalidTransactionId(`Invalid TransactionId: "${raw}" is not a UUID v4`));
    }
    return ok(new TransactionId({ value: raw }));
  }

  /** Generate a new TransactionId using the injected IdGenerator port. */
  static generate(idGen: IdGenerator): TransactionId {
    return new TransactionId({ value: idGen.uuid() });
  }

  override toString(): string {
    return this.props.value;
  }
}
