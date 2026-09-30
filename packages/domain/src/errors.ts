/** A safe error contract; callers must not put secrets or private object details in messages. */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
