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

// Plan 090: typed HTTP error for the central error handler. `details` may
// carry internal information (absolute paths, stack context) — it is logged
// server-side and never sent to the client.
export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

// Plan 090: user-visible error messages must never embed operator filesystem
// paths or long internal tokens.
export function sanitizeUserMessage(text: string): string {
  return String(text || '')
    .replace(/[^\s]*[/\\](?:home|Users|tmp)[/\\][^\s]*/g, '[path]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[REDACTED]');
}
