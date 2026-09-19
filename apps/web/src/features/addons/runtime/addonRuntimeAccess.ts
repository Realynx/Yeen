import type { User } from '../../shared/services/types';
import type { AddonAccessRole, YeenAddonRoleCriteria } from './addonRuntime.types';

type StoredAccountRole = User['role'];

export function addonAccessRoleForStoredRole(
  role: StoredAccountRole,
): AddonAccessRole {
  if (role === 'admin') return 'administrator';
  if (role === 'sailer') return 'downloader';
  return 'standard';
}

export function canAccessAddonContribution(
  role: StoredAccountRole,
  contribution: YeenAddonRoleCriteria & { adminOnly?: boolean },
): boolean {
  const allowedRoles = contribution.allowedRoles
    ?? (contribution.adminOnly ? ['administrator'] : undefined);
  return allowedRoles === undefined
    || allowedRoles.includes(addonAccessRoleForStoredRole(role));
}
