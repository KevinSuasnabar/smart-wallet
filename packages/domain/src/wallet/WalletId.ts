import { ValueObject } from '../shared/ValueObject.js';
import { err, ok } from '../shared/Result.js';
import type { Result } from '../shared/Result.js';
import type { IdGenerator } from '../shared/IdGenerator.js';
import { InvalidWalletId } from './WalletError.js';
import type { WalletError } from './WalletError.js';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface WalletIdProps {
  value: string;
}

export class WalletId extends ValueObject<WalletIdProps> {
  private constructor(props: WalletIdProps) {
    super(props);
  }

  get value(): string {
    return this.props.value;
  }

  static create(raw: string): Result<WalletId, WalletError> {
    if (!UUID_V4_REGEX.test(raw)) {
      return err(new InvalidWalletId(`Invalid WalletId: "${raw}" is not a UUID v4`));
    }
    return ok(new WalletId({ value: raw }));
  }

  /** Generate a new WalletId using the injected IdGenerator port. */
  static generate(idGen: IdGenerator): WalletId {
    return new WalletId({ value: idGen.uuid() });
  }

  override toString(): string {
    return this.props.value;
  }
}
