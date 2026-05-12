import { DomainError } from '../shared/DomainError.js';

export class InvalidUserId extends DomainError {
  readonly tag = 'domain.user.invalid_id' as const;
  readonly httpStatus = 400 as const;

  constructor(message = 'Invalid user identifier') {
    super(message);
  }
}

export type UserError = InvalidUserId;
