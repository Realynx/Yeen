import type { RuntimeRestartMode } from './types-addons';
import type { CoreUpdateStatus } from './types-updates';
import { jsonBody, request } from './api-core';

export function getCoreUpdateStatus(token: string) {
  return request<CoreUpdateStatus>('/admin/core-updates/status', {}, token);
}

export function checkForCoreUpdate(token: string) {
  return request<CoreUpdateStatus>(
    '/admin/core-updates/check',
    { method: 'POST' },
    token,
  );
}

export function applyCoreUpdate(token: string, mode: RuntimeRestartMode) {
  return request<CoreUpdateStatus>(
    '/admin/core-updates/apply',
    { method: 'POST', body: jsonBody({ mode }) },
    token,
  );
}
