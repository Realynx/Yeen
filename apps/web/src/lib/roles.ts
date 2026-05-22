import type { User } from './types';

export type AccountRole = User['role'];

export function isAdminRole(role: AccountRole): boolean {
  return role === 'admin';
}

export function canAccessTorrentTools(role: AccountRole): boolean {
  return role === 'admin' || role === 'sailer';
}

export function roleLabel(role: AccountRole): string {
  if (role === 'admin') {
    return 'Administrator';
  }

  if (role === 'sailer') {
    return 'Sailer';
  }

  return 'Standard User';
}
