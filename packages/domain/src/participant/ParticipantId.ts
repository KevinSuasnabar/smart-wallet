import { ValueObject } from '../shared/ValueObject.js';
import { ok, err } from '../shared/Result.js';
import type { Result } from '../shared/Result.js';
import type { IdGenerator } from '../shared/IdGenerator.js';
import { InvalidParticipantId } from './ParticipantError.js';
import type { ParticipantError } from './ParticipantError.js';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ParticipantIdProps {
  value: string;
}

/**
 * Identity of a participant. Unlike CategoryId there is no predefined variant —
 * every participant is created by the user, so the id is always a UUID v4.
 */
export class ParticipantId extends ValueObject<ParticipantIdProps> {
  private constructor(props: ParticipantIdProps) {
    super(props);
  }

  get value(): string {
    return this.props.value;
  }

  static create(raw: string): Result<ParticipantId, ParticipantError> {
    if (!UUID_V4_REGEX.test(raw)) {
      return err(new InvalidParticipantId(`Invalid ParticipantId: "${raw}" is not a UUID v4`));
    }
    return ok(new ParticipantId({ value: raw }));
  }

  static generate(idGen: IdGenerator): ParticipantId {
    return new ParticipantId({ value: idGen.uuid() });
  }

  override toString(): string {
    return this.props.value;
  }
}
