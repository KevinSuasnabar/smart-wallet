import { ValueObject } from '../shared/ValueObject.js';
import { err, ok } from '../shared/Result.js';
import type { Result } from '../shared/Result.js';
import { InvalidUserId } from './UserError.js';
import type { UserError } from './UserError.js';

// Accepts any RFC 4122 UUID variant (v1-v8). Cognito generates UUID v7 (time-ordered)
// for user sub claims, not v4. Wallet/Transaction/Category IDs are generated via
// crypto.randomUUID() which always produces v4, so they keep stricter v4 validators.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface UserIdProps {
  value: string;
}

export class UserId extends ValueObject<UserIdProps> {
  private constructor(props: UserIdProps) {
    super(props);
  }

  get value(): string {
    return this.props.value;
  }

  static create(raw: string): Result<UserId, UserError> {
    if (!UUID_REGEX.test(raw)) {
      return err(new InvalidUserId(`Invalid UserId: "${raw}" is not a valid UUID`));
    }
    return ok(new UserId({ value: raw }));
  }

  override toString(): string {
    return this.props.value;
  }
}
