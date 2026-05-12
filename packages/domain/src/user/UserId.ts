import { ValueObject } from '../shared/ValueObject.js';
import { err, ok } from '../shared/Result.js';
import type { Result } from '../shared/Result.js';
import { InvalidUserId } from './UserError.js';
import type { UserError } from './UserError.js';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    if (!UUID_V4_REGEX.test(raw)) {
      return err(new InvalidUserId(`Invalid UserId: "${raw}" is not a UUID v4`));
    }
    return ok(new UserId({ value: raw }));
  }

  override toString(): string {
    return this.props.value;
  }
}
