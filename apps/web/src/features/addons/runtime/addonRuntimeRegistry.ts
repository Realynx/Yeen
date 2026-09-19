import type { RuntimeWebAddon } from '../../shared/services/types';
import type { ClientExperience } from '../../navigation/services/clientExperience';
import type {
  AddonHostRegistry,
  AddonExperienceElementTags,
  AddonExperiencePageKeys,
  RegisteredAddonMediaItemAction,
  RegisteredAddonRemoteMusicResultAction,
  RegisteredAddonMediaItemSurface,
  RegisteredAddonMediaCardSurface,
  RegisteredAddonNavigation,
  RegisteredAddonPreparationSurface,
  RegisteredAddonPlaybackStatusSurface,
  RegisteredAddonRoute,
  RegisteredAddonSettingsSurface,
  RegisteredAddonStyle,
  AddonAccessRole,
  YeenAddonIdentity,
  YeenAddonStyle,
  YeenWebAddonContext,
  YeenWebAddonContributions,
} from './addonRuntime.types';

const CUSTOM_ELEMENT_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/;
const CONTRIBUTION_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/i;
const customElementOwners = new Map<string, string>();

export function resolveAddonElementTag(
  elementTag: string,
  experienceElementTags: AddonExperienceElementTags | undefined,
  clientExperience: ClientExperience,
): string {
  return experienceElementTags?.[clientExperience] ?? elementTag;
}

export interface LoadedAddonRegistration {
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
}

export function emptyAddonHostRegistry(loading = false): AddonHostRegistry {
  return {
    routes: [],
    navigation: [],
    settingsSurfaces: [],
    mediaItemActions: [],
    remoteMusicResultActions: [],
    mediaItemSurfaces: [],
    mediaCardSurfaces: [],
    preparationSurfaces: [],
    playbackStatusSurfaces: [],
    styles: [],
    errors: [],
    loading,
  };
}

export function createAddonRegistrationContext(
  runtimeAddon: RuntimeWebAddon,
): { context: YeenWebAddonContext; registration: LoadedAddonRegistration } {
  const addon: YeenAddonIdentity = {
    id: runtimeAddon.id,
    name: runtimeAddon.name,
    version: runtimeAddon.version,
  };
  const registration: LoadedAddonRegistration = {
    routes: [],
    navigation: [],
    settingsSurfaces: [],
    mediaItemActions: [],
    remoteMusicResultActions: [],
    mediaItemSurfaces: [],
    mediaCardSurfaces: [],
    preparationSurfaces: [],
    playbackStatusSurfaces: [],
    styles: [],
  };

  function register(contributions: YeenWebAddonContributions) {
    registration.routes.push(
      ...normalizeRoutes(contributions.routes, addon),
    );
    registration.navigation.push(
      ...normalizeNavigation(contributions.navigation, addon),
    );
    registration.settingsSurfaces.push(
      ...normalizeSettingsSurfaces(contributions.settingsSurfaces, addon),
    );
    registration.mediaItemActions.push(
      ...normalizeMediaItemActions(contributions.mediaItemActions, addon),
    );
    registration.remoteMusicResultActions.push(
      ...normalizeRemoteMusicResultActions(contributions.remoteMusicResultActions, addon),
    );
    registration.mediaItemSurfaces.push(
      ...normalizeMediaItemSurfaces(contributions.mediaItemSurfaces, addon),
    );
    registration.mediaCardSurfaces.push(
      ...normalizeMediaCardSurfaces(contributions.mediaCardSurfaces, addon),
    );
    registration.preparationSurfaces.push(
      ...normalizePreparationSurfaces(contributions.preparationSurfaces, addon),
    );
    registration.playbackStatusSurfaces.push(
      ...normalizePlaybackStatusSurfaces(contributions.playbackStatusSurfaces, addon),
    );
  }

  function defineCustomElement(
    tagName: string,
    constructor: CustomElementConstructor,
  ) {
    const normalizedTag = tagName.trim().toLowerCase();
    if (!CUSTOM_ELEMENT_NAME_PATTERN.test(normalizedTag)) {
      throw new Error(`Invalid custom element name: ${tagName}`);
    }

    const existing = window.customElements.get(normalizedTag);
    if (existing) {
      if (customElementOwners.get(normalizedTag) === addon.id) {
        return;
      }
      throw new Error(`Custom element is already registered: ${normalizedTag}`);
    }

    window.customElements.define(normalizedTag, constructor);
    customElementOwners.set(normalizedTag, addon.id);
  }

  function addStyle(style: YeenAddonStyle) {
    const id = normalizeId(style.id);
    const cssText = nonEmptyString(style.cssText);
    const href = nonEmptyString(style.href);
    if (!cssText && !href) {
      throw new Error(`Add-on style ${id} needs cssText or href.`);
    }

    registration.styles.push({
      addon,
      id,
      cssText: cssText ?? undefined,
      href: href ?? undefined,
    });
  }

  return {
    context: { addon, register, defineCustomElement, addStyle },
    registration,
  };
}

export function mergeAddonRegistrations(
  registrations: LoadedAddonRegistration[],
): AddonHostRegistry {
  const registry = emptyAddonHostRegistry(false);
  for (const registration of registrations) {
    registry.routes.push(...registration.routes);
    registry.navigation.push(...registration.navigation);
    registry.settingsSurfaces.push(...registration.settingsSurfaces);
    registry.mediaItemActions.push(...registration.mediaItemActions);
    registry.remoteMusicResultActions.push(...registration.remoteMusicResultActions);
    registry.mediaItemSurfaces.push(...registration.mediaItemSurfaces);
    registry.mediaCardSurfaces.push(...registration.mediaCardSurfaces);
    registry.preparationSurfaces.push(...registration.preparationSurfaces);
    registry.playbackStatusSurfaces.push(...registration.playbackStatusSurfaces);
    registry.styles.push(...registration.styles);
  }

  registry.navigation.sort(byOrderThenLabel);
  registry.settingsSurfaces.sort(byOrderThenLabel);
  registry.mediaItemActions.sort(byOrderThenLabel);
  registry.remoteMusicResultActions.sort(byOrderThenLabel);
  registry.mediaItemSurfaces.sort(byOrderThenId);
  registry.mediaCardSurfaces.sort(byOrderThenId);
  registry.preparationSurfaces.sort(byOrderThenId);
  registry.playbackStatusSurfaces.sort(byOrderThenId);
  return registry;
}

function normalizeRoutes(
  contributions: YeenWebAddonContributions['routes'],
  addon: YeenAddonIdentity,
): RegisteredAddonRoute[] {
  return (contributions ?? []).map((route) => {
    const path = nonEmptyString(route.path);
    if (!path?.startsWith('/')) {
      throw new Error('Add-on route paths must start with /.');
    }

    return {
      addon,
      id: normalizeId(route.id),
      path,
      title: requireString(route.title, 'route title'),
      elementTag: normalizeCustomElementName(route.elementTag),
      experienceElementTags: normalizeExperienceElementTags(route.experienceElementTags),
      experiencePageKeys: normalizeExperiencePageKeys(route.experiencePageKeys),
      shell: route.shell === 'admin' ? 'admin' : 'content',
      adminOnly: route.adminOnly === true,
      allowedRoles: normalizeAllowedRoles(route.allowedRoles, route.adminOnly),
    };
  });
}

function normalizeNavigation(
  contributions: YeenWebAddonContributions['navigation'],
  addon: YeenAddonIdentity,
): RegisteredAddonNavigation[] {
  return (contributions ?? []).map((entry) => {
    if (
      entry.placement !== 'browse'
      && entry.placement !== 'admin'
      && entry.placement !== 'phone'
      && entry.placement !== 'profile'
    ) {
      throw new Error('Invalid add-on navigation placement.');
    }

    return {
      addon,
      id: normalizeId(entry.id),
      label: requireString(entry.label, 'navigation label'),
      to: requireAbsoluteAppPath(entry.to),
      placement: entry.placement,
      order: normalizeOrder(entry.order),
      adminOnly: entry.adminOnly === true,
      allowedRoles: normalizeAllowedRoles(entry.allowedRoles, entry.adminOnly),
    };
  });
}

function normalizeSettingsSurfaces(
  contributions: YeenWebAddonContributions['settingsSurfaces'],
  addon: YeenAddonIdentity,
): RegisteredAddonSettingsSurface[] {
  return (contributions ?? []).map((surface) => {
    if (surface.placement !== 'user' && surface.placement !== 'system') {
      throw new Error('Invalid add-on settings placement.');
    }

    return {
      addon,
      id: normalizeId(surface.id),
      title: requireString(surface.title, 'settings surface title'),
      description: nonEmptyString(surface.description) ?? undefined,
      elementTag: normalizeCustomElementName(surface.elementTag),
      experienceElementTags: normalizeExperienceElementTags(surface.experienceElementTags),
      placement: surface.placement,
      order: normalizeOrder(surface.order),
      sectionId: surface.sectionId === undefined ? undefined : normalizeId(surface.sectionId),
      shortTitle: nonEmptyString(surface.shortTitle) ?? undefined,
      note: nonEmptyString(surface.note) ?? undefined,
      allowedRoles: normalizeAllowedRoles(surface.allowedRoles),
    };
  });
}

function normalizeMediaItemActions(
  contributions: YeenWebAddonContributions['mediaItemActions'],
  addon: YeenAddonIdentity,
): RegisteredAddonMediaItemAction[] {
  return (contributions ?? []).map((action) => ({
    addon,
    id: normalizeId(action.id),
    label: requireString(action.label, 'Media Item action label'),
    elementTag: normalizeCustomElementName(action.elementTag),
    experienceElementTags: normalizeExperienceElementTags(action.experienceElementTags),
    order: normalizeOrder(action.order),
    placement: action.placement === 'after-hero' ? 'after-hero' : 'hero-actions',
    allowedRoles: normalizeAllowedRoles(action.allowedRoles),
  }));
}

function normalizeRemoteMusicResultActions(
  contributions: YeenWebAddonContributions['remoteMusicResultActions'],
  addon: YeenAddonIdentity,
): RegisteredAddonRemoteMusicResultAction[] {
  return (contributions ?? []).map((action) => ({
    addon,
    id: normalizeId(action.id),
    label: requireString(action.label, 'remote music result action label'),
    elementTag: normalizeCustomElementName(action.elementTag),
    experienceElementTags: normalizeExperienceElementTags(action.experienceElementTags),
    order: normalizeOrder(action.order),
    placement: action.placement === 'details' ? 'details' : 'card',
    allowedRoles: normalizeAllowedRoles(action.allowedRoles),
  }));
}

function normalizeMediaItemSurfaces(
  contributions: YeenWebAddonContributions['mediaItemSurfaces'],
  addon: YeenAddonIdentity,
): RegisteredAddonMediaItemSurface[] {
  return (contributions ?? []).map((surface) => ({
    addon,
    id: normalizeId(surface.id),
    elementTag: normalizeCustomElementName(surface.elementTag),
    experienceElementTags: normalizeExperienceElementTags(surface.experienceElementTags),
    placement: 'after-hero',
    order: normalizeOrder(surface.order),
    allowedRoles: normalizeAllowedRoles(surface.allowedRoles),
  }));
}

function normalizeMediaCardSurfaces(
  contributions: YeenWebAddonContributions['mediaCardSurfaces'],
  addon: YeenAddonIdentity,
): RegisteredAddonMediaCardSurface[] {
  return (contributions ?? []).map((surface) => ({
    addon,
    id: normalizeId(surface.id),
    elementTag: normalizeCustomElementName(surface.elementTag),
    experienceElementTags: normalizeExperienceElementTags(surface.experienceElementTags),
    order: normalizeOrder(surface.order),
    allowedRoles: normalizeAllowedRoles(surface.allowedRoles),
  }));
}

function normalizePlaybackStatusSurfaces(
  contributions: YeenWebAddonContributions['playbackStatusSurfaces'],
  addon: YeenAddonIdentity,
): RegisteredAddonPlaybackStatusSurface[] {
  return (contributions ?? []).map((surface) => ({
    addon,
    id: normalizeId(surface.id),
    elementTag: normalizeCustomElementName(surface.elementTag),
    experienceElementTags: normalizeExperienceElementTags(surface.experienceElementTags),
    order: normalizeOrder(surface.order),
    allowedRoles: normalizeAllowedRoles(surface.allowedRoles),
  }));
}

function normalizeQueryParameter(value: string): string {
  const normalized = value?.trim() ?? '';
  if (!/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(normalized)) {
    throw new Error(`Invalid add-on query parameter: ${value}`);
  }
  return normalized;
}

function normalizePreparationSurfaces(
  contributions: YeenWebAddonContributions['preparationSurfaces'],
  addon: YeenAddonIdentity,
): RegisteredAddonPreparationSurface[] {
  return (contributions ?? []).map((surface) => ({
    addon,
    id: normalizeId(surface.id),
    elementTag: normalizeCustomElementName(surface.elementTag),
    experienceElementTags: normalizeExperienceElementTags(surface.experienceElementTags),
    order: normalizeOrder(surface.order),
    queryParameter: surface.queryParameter === undefined
      ? undefined
      : normalizeQueryParameter(surface.queryParameter),
    allowedRoles: normalizeAllowedRoles(surface.allowedRoles),
  }));
}

function normalizeExperienceElementTags(
  value: AddonExperienceElementTags | undefined,
): AddonExperienceElementTags | undefined {
  if (!value) {
    return undefined;
  }
  return (['desktop', 'phone', 'tv'] as const).reduce<AddonExperienceElementTags>(
    (normalized, experience) => {
      const tagName = value[experience];
      if (tagName !== undefined) {
        normalized[experience] = normalizeCustomElementName(tagName);
      }
      return normalized;
    },
    {},
  );
}

function normalizeExperiencePageKeys(
  value: AddonExperiencePageKeys | undefined,
): AddonExperiencePageKeys | undefined {
  if (!value) {
    return undefined;
  }
  return (['desktop', 'phone', 'tv'] as const).reduce<AddonExperiencePageKeys>((normalized, experience) => {
    const pageKey = value[experience];
    if (pageKey !== undefined) {
      normalized[experience] = normalizeId(pageKey);
    }
    return normalized;
  }, {});
}

function normalizeAllowedRoles(
  value: AddonAccessRole[] | undefined,
  legacyAdminOnly = false,
): AddonAccessRole[] | undefined {
  if (value === undefined) {
    return legacyAdminOnly ? ['administrator'] : undefined;
  }
  const supported = new Set<AddonAccessRole>([
    'administrator',
    'downloader',
    'standard',
  ]);
  if (!Array.isArray(value) || value.some((role) => !supported.has(role))) {
    throw new Error('Invalid add-on allowed role.');
  }
  return [...new Set(value)];
}

function normalizeId(value: string): string {
  const id = value?.trim() ?? '';
  if (!CONTRIBUTION_ID_PATTERN.test(id)) {
    throw new Error(`Invalid add-on contribution id: ${value}`);
  }
  return id;
}

function normalizeCustomElementName(value: string): string {
  const tagName = value?.trim().toLowerCase() ?? '';
  if (!CUSTOM_ELEMENT_NAME_PATTERN.test(tagName)) {
    throw new Error(`Invalid add-on custom element name: ${value}`);
  }
  return tagName;
}

function requireAbsoluteAppPath(value: string): string {
  const path = nonEmptyString(value);
  if (!path?.startsWith('/')) {
    throw new Error('Add-on navigation paths must start with /.');
  }
  return path;
}

function requireString(value: string, label: string): string {
  const normalized = nonEmptyString(value);
  if (!normalized) {
    throw new Error(`Missing add-on ${label}.`);
  }
  return normalized;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeOrder(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 100;
}

function byOrderThenLabel(
  left: { order?: number; label?: string; title?: string },
  right: { order?: number; label?: string; title?: string },
) {
  return (left.order ?? 100) - (right.order ?? 100)
    || (left.label ?? left.title ?? '').localeCompare(
      right.label ?? right.title ?? '',
    );
}

function byOrderThenId(
  left: { order?: number; id: string },
  right: { order?: number; id: string },
) {
  return (left.order ?? 100) - (right.order ?? 100)
    || left.id.localeCompare(right.id);
}
