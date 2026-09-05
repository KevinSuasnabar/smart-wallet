import { DomainError } from '../shared/DomainError.js';

// ── Participant-domain error classes (flat — no namespaces per ESLint rule) ──

export class InvalidParticipantId extends DomainError {
  readonly tag = 'domain.participant.invalid_id' as const;
  readonly httpStatus = 400 as const;

  constructor(message = 'Participant ID must be a UUID v4') {
    super(message);
  }
}

export class InvalidParticipantName extends DomainError {
  readonly tag = 'domain.participant.invalid_name' as const;
  readonly httpStatus = 400 as const;

  constructor(message = 'Participant name must be 1–32 non-empty characters') {
    super(message);
  }
}

export class InvalidParticipantColor extends DomainError {
  readonly tag = 'domain.participant.invalid_color' as const;
  readonly httpStatus = 400 as const;

  constructor(message = 'Participant color must be one of the predefined palette values') {
    super(message);
  }
}

export class ParticipantNotFound extends DomainError {
  readonly tag = 'domain.participant.not_found' as const;
  readonly httpStatus = 404 as const;

  constructor(message = 'Participant not found') {
    super(message);
  }
}

/** Attempted to use or re-edit a soft-deleted participant. */
export class ParticipantAlreadyDeleted extends DomainError {
  readonly tag = 'domain.participant.already_deleted' as const;
  readonly httpStatus = 409 as const;

  constructor(message = 'Participant has already been deleted') {
    super(message);
  }
}

export type ParticipantError =
  | InvalidParticipantId
  | InvalidParticipantName
  | InvalidParticipantColor
  | ParticipantNotFound
  | ParticipantAlreadyDeleted;
