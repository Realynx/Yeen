export type ErrorCode =
  | 'AUTH_INVALID_TOKEN'
  | 'AUTH_FORBIDDEN'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'MEDIA_NOT_FOUND'
  | 'SUBTITLE_NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'EXTERNAL_SERVICE_ERROR'
  | 'RATE_LIMITED'
  | 'UNKNOWN_ERROR';

export interface ApiErrorPayload {
  code: ErrorCode;
  message: string;
  details?: Record<string, string[] | string>;
}
