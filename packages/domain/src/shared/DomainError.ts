export abstract class DomainError extends Error {
  abstract readonly tag: string;
  abstract readonly httpStatus: 400 | 404 | 409;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Serialised shape for transport — api package maps DomainError to this. */
export interface DomainErrorJSON {
  tag: string;
  message: string;
  httpStatus: 400 | 404 | 409;
}
