import type { User } from '../../shared/services/types';

import type { ClientExperience } from '../../navigation/services/clientExperience';

export type AddonNavigationPlacement = 'browse' | 'admin' | 'phone' | 'profile';
export type AddonSettingsPlacement = 'user' | 'system';
export type AddonAccessRole = 'administrator' | 'downloader' | 'standard';

export interface YeenAddonRoleCriteria {
  allowedRoles?: AddonAccessRole[];
}

export interface YeenAddonIdentity {
  id: string;
  name: string;
  version: string;
}

export type AddonExperienceElementTags = Partial<Record<ClientExperience, string>>;
export type AddonExperiencePageKeys = Partial<Record<ClientExperience, string>>;

export interface YeenAddonRouteContribution extends YeenAddonRoleCriteria {
  id: string;
  path: string;
  title: string;
  elementTag: string;
  experienceElementTags?: AddonExperienceElementTags;
  experiencePageKeys?: AddonExperiencePageKeys;
  shell?: 'content' | 'admin';
  adminOnly?: boolean;
}

export interface YeenAddonNavigationContribution extends YeenAddonRoleCriteria {
  id: string;
  label: string;
  to: string;
  placement: AddonNavigationPlacement;
  order?: number;
  adminOnly?: boolean;
}

export interface YeenAddonSettingsSurfaceContribution extends YeenAddonRoleCriteria {
  id: string;
  title: string;
  description?: string;
  elementTag: string;
  experienceElementTags?: AddonExperienceElementTags;
  placement: AddonSettingsPlacement;
  order?: number;
  sectionId?: string;
  shortTitle?: string;
  note?: string;
}

export interface YeenAddonMediaItemActionContribution extends YeenAddonRoleCriteria {
  id: string;
  label: string;
  elementTag: string;
  experienceElementTags?: AddonExperienceElementTags;
  order?: number;
  placement?: 'hero-actions' | 'after-hero';
}

export interface YeenAddonRemoteMusicResultActionContribution extends YeenAddonRoleCriteria {
  id: string;
  label: string;
  elementTag: string;
  experienceElementTags?: AddonExperienceElementTags;
  order?: number;
  placement?: 'card' | 'details';
}

export interface YeenAddonMediaItemSurfaceContribution extends YeenAddonRoleCriteria {
  id: string;
  elementTag: string;
  experienceElementTags?: AddonExperienceElementTags;
  placement: 'after-hero';
  order?: number;
}

export interface YeenAddonMediaCardSurfaceContribution extends YeenAddonRoleCriteria {
  id: string;
  elementTag: string;
  experienceElementTags?: AddonExperienceElementTags;
  order?: number;
}

export interface YeenAddonPreparationSurfaceContribution extends YeenAddonRoleCriteria {
  id: string;
  elementTag: string;
  experienceElementTags?: AddonExperienceElementTags;
  order?: number;
  queryParameter?: string;
}

export interface YeenAddonPlaybackStatusSurfaceContribution extends YeenAddonRoleCriteria {
  id: string;
  elementTag: string;
  experienceElementTags?: AddonExperienceElementTags;
  order?: number;
}

export interface YeenWebAddonContributions {
  routes?: YeenAddonRouteContribution[];
  navigation?: YeenAddonNavigationContribution[];
  settingsSurfaces?: YeenAddonSettingsSurfaceContribution[];
  mediaItemActions?: YeenAddonMediaItemActionContribution[];
  remoteMusicResultActions?: YeenAddonRemoteMusicResultActionContribution[];
  mediaItemSurfaces?: YeenAddonMediaItemSurfaceContribution[];
  mediaCardSurfaces?: YeenAddonMediaCardSurfaceContribution[];
  preparationSurfaces?: YeenAddonPreparationSurfaceContribution[];
  playbackStatusSurfaces?: YeenAddonPlaybackStatusSurfaceContribution[];
}

export interface YeenAddonStyle {
  id: string;
  cssText?: string;
  href?: string;
}

export interface YeenWebAddonContext {
  readonly addon: YeenAddonIdentity;
  register: (contributions: YeenWebAddonContributions) => void;
  defineCustomElement: (
    tagName: string,
    constructor: CustomElementConstructor,
  ) => void;
  addStyle: (style: YeenAddonStyle) => void;
}

export interface RegisteredAddonRoute extends YeenAddonRouteContribution {
  addon: YeenAddonIdentity;
}

export interface RegisteredAddonNavigation
  extends YeenAddonNavigationContribution {
  addon: YeenAddonIdentity;
}

export interface RegisteredAddonSettingsSurface
  extends YeenAddonSettingsSurfaceContribution {
  addon: YeenAddonIdentity;
}

export interface RegisteredAddonMediaItemAction
  extends YeenAddonMediaItemActionContribution {
  addon: YeenAddonIdentity;
}

export interface RegisteredAddonRemoteMusicResultAction
  extends YeenAddonRemoteMusicResultActionContribution {
  addon: YeenAddonIdentity;
}

export interface RegisteredAddonMediaItemSurface
  extends YeenAddonMediaItemSurfaceContribution {
  addon: YeenAddonIdentity;
}

export interface RegisteredAddonMediaCardSurface
  extends YeenAddonMediaCardSurfaceContribution {
  addon: YeenAddonIdentity;
}

export interface RegisteredAddonPreparationSurface
  extends YeenAddonPreparationSurfaceContribution {
  addon: YeenAddonIdentity;
}

export interface RegisteredAddonPlaybackStatusSurface
  extends YeenAddonPlaybackStatusSurfaceContribution {
  addon: YeenAddonIdentity;
}

export interface RegisteredAddonStyle extends YeenAddonStyle {
  addon: YeenAddonIdentity;
}

export interface AddonHostRegistry {
  routes: RegisteredAddonRoute[];
  navigation: RegisteredAddonNavigation[];
  settingsSurfaces: RegisteredAddonSettingsSurface[];
  mediaItemActions: RegisteredAddonMediaItemAction[];
  remoteMusicResultActions: RegisteredAddonRemoteMusicResultAction[];
  mediaItemSurfaces: RegisteredAddonMediaItemSurface[];
  mediaCardSurfaces: RegisteredAddonMediaCardSurface[];
  preparationSurfaces: RegisteredAddonPreparationSurface[];
  playbackStatusSurfaces: RegisteredAddonPlaybackStatusSurface[];
  styles: RegisteredAddonStyle[];
  errors: Array<{ addonId: string; message: string }>;
  loading: boolean;
}

export interface AddonSurfaceElementContext {
  accessToken: string;
  user: User;
  addonId: string;
  surface: string;
  clientExperience: ClientExperience;
  mediaItem?: unknown;
  remoteMusicResult?: unknown;
  preparation?: unknown;
  route?: {
    path: string;
    title: string;
  };
}

export interface AddonNavigateEventDetail {
  to: string;
  replace?: boolean;
}

export interface AddonMediaCardStateEventDetail {
  progressPercent?: number | null;
  tone?: 'default' | 'accent';
  label?: string | null;
}
