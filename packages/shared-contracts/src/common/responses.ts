import type { ApiErrorPayload } from './errors.js';

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorPayload;
}

export type ApiResult<T> = ApiSuccessResponse<T> | ApiErrorResponse;
