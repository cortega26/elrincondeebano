export type StatusCode =
  | 'OK'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INTERNAL_ERROR';

export interface AppError {
  code: StatusCode;
  message: string;
  details?: unknown;
}

export class DomainError extends Error {
  public readonly code: StatusCode;
  public readonly details?: unknown;

  constructor(code: StatusCode, message: string, details?: unknown) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}
