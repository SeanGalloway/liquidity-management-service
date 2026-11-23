import 'server-only';

export const ERROR_STATUS = {
  VALIDATION_FAILED: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  IDEMPOTENCY_CONFLICT: 409,
  ALREADY_INITIALIZED: 409,
  NOT_INITIALIZED: 409,
  INSUFFICIENT_FUNDS: 409,
  NO_MARKET_DATA: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'DomainError';
  }

  get status() {
    return ERROR_STATUS[this.code];
  }
}
