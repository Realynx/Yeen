import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { NavLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { User } from '../../shared/services/types';
import { AdminNav } from '../../navigation/components/AdminNav';
import { PhonePageHeader } from '../../navigation/components/PhonePageHeader';
import { PhonePageShell } from '../../navigation/components/PhonePageShell';
import { TvPageShell } from '../../navigation/components/TvPageShell';
import { MediaHomeButton } from '../../navigation/components/MediaHomeButton';
import { ProfileMenu } from '../../navigation/components/ProfileMenu';
import { useRandomMediaDetailsNavigation } from '../../navigation/hooks/useRandomMediaDetailsNavigation';
import { toLibrarySearchPath } from '../../library/services/librarySearchUtils';
import { SettingsCategorySection } from '../../settings/components/system-settings-categories/SettingsCategorySection';
import { AddonSurfaceHost } from './AddonSurfaceHost';
import { useAddonHost } from './AddonHostContext';
import type {
  AddonNavigationPlacement,
  AddonSettingsPlacement,
  RegisteredAddonRoute,
  AddonMediaCardStateEventDetail,
} from './addonRuntime.types';
import { canAccessAddonContribution } from './addonRuntimeAccess';

interface AddonNavigationEntriesProps {
  placement: AddonNavigationPlacement;
  user: User;
  phone?: boolean;
}

export function AddonNavigationEntries({
  placement,
  user,
  phone = false,
}: AddonNavigationEntriesProps) {
  const { navigation } = useAddonHost();
  return navigation
    .filter((entry) =>
      entry.placement === placement
      && canAccessAddonContribution(user.role, entry),
    )
    .map((entry) => (
      <NavLink
        key={`${entry.addon.id}:${entry.id}`}
        className={({ isActive }) => {
          if (phone) {
            return isActive
              ? 'phone-bottom-nav-link is-active'
              : 'phone-bottom-nav-link';
          }
          return isActive ? 'browse-link active' : 'browse-link';
        }}
        to={entry.to}
      >
        {phone ? (
          <span className="phone-bottom-nav-icon addon-phone-nav-icon" aria-hidden="true">
            +
          </span>
        ) : null}
        <span className={phone ? 'phone-bottom-nav-label' : undefined}>
          {entry.label}
        </span>
      </NavLink>
    ));
}

export function AddonSettingsSurfaces({
  placement,
  categorized = false,
  expandedSections,
  onToggleSection,
}: {
  placement: AddonSettingsPlacement;
  categorized?: boolean;
  expandedSections?: Record<string, boolean>;
  onToggleSection?: (sectionId: string) => void;
}) {
  const { settingsSurfaces, user } = useAddonHost();
  const surfaces = settingsSurfaces.filter(
    (surface) => surface.placement === placement
      && canAccessAddonContribution(user.role, surface),
  );
  if (surfaces.length === 0) {
    return null;
  }

  if (categorized) {
    return (
      <div className="addon-settings-categories">
        {surfaces.map((surface) => {
          const sectionId = surface.sectionId
            ?? `addon-${surface.addon.id}-${surface.id}`;
          return (
            <SettingsCategorySection
              key={`${surface.addon.id}:${surface.id}`}
              id={sectionId}
              kicker={surface.addon.name}
              title={surface.title}
              description={surface.description ?? 'Settings provided by an installed add-on.'}
              badge="Add-on"
              isOpen={expandedSections?.[sectionId] === true}
              onToggle={() => onToggleSection?.(sectionId)}
            >
              <AddonSurfaceHost
                addon={surface.addon}
                elementTag={surface.elementTag}
                experienceElementTags={surface.experienceElementTags}
                surface={`settings:${placement}:${surface.id}`}
              />
            </SettingsCategorySection>
          );
        })}
      </div>
    );
  }

  return (
    <div className="addon-settings-surfaces">
      {surfaces.map((surface) => (
        <article
          className="settings-surface settings-surface-full addon-host-surface"
          key={`${surface.addon.id}:${surface.id}`}
        >
          <header className="addon-host-surface-header">
            <div>
              <p className="settings-section-kicker">{surface.addon.name}</p>
              <h2>{surface.title}</h2>
            </div>
            <span className="settings-pill">Add-on</span>
          </header>
          {surface.description ? <p className="muted">{surface.description}</p> : null}
          <AddonSurfaceHost
            addon={surface.addon}
            elementTag={surface.elementTag}
            experienceElementTags={surface.experienceElementTags}
            surface={`settings:${placement}:${surface.id}`}
          />
        </article>
      ))}
    </div>
  );
}

export function AddonMediaItemActions({
  mediaItem,
  placement = 'hero-actions',
}: {
  mediaItem: unknown;
  placement?: 'hero-actions' | 'after-hero';
}) {
  const { mediaItemActions, user } = useAddonHost();
  const visibleActions = mediaItemActions.filter((action) =>
    (action.placement ?? 'hero-actions') === placement
      && canAccessAddonContribution(user.role, action),
  );
  if (visibleActions.length === 0) {
    return null;
  }

  return (
    <section className="addon-media-item-actions" aria-label="Add-on actions">
      {visibleActions.map((action) => (
        <AddonSurfaceHost
          key={`${action.addon.id}:${action.id}`}
          addon={action.addon}
          elementTag={action.elementTag}
          experienceElementTags={action.experienceElementTags}
          surface={`media-item-action:${action.id}`}
          mediaItem={mediaItem}
        />
      ))}
    </section>
  );
}

export function AddonRemoteMusicResultActions({
  remoteMusicResult,
  placement = 'card',
}: {
  remoteMusicResult: unknown;
  placement?: 'card' | 'details';
}) {
  const { remoteMusicResultActions, user } = useAddonHost();
  const visibleActions = remoteMusicResultActions.filter((action) =>
    (action.placement ?? 'card') === placement
      && canAccessAddonContribution(user.role, action),
  );
  if (visibleActions.length === 0) {
    return null;
  }

  return (
    <div className="addon-remote-music-result-actions" aria-label="Add-on music actions">
      {visibleActions.map((action) => (
        <AddonSurfaceHost
          key={`${action.addon.id}:${action.id}`}
          addon={action.addon}
          elementTag={action.elementTag}
          experienceElementTags={action.experienceElementTags}
          surface={`remote-music-result-action:${action.id}`}
          remoteMusicResult={remoteMusicResult}
        />
      ))}
    </div>
  );
}

export function AddonMediaItemSurfaces({ mediaItem }: { mediaItem: unknown }) {
  const { mediaItemSurfaces, user } = useAddonHost();
  const visibleSurfaces = mediaItemSurfaces.filter((surface) =>
    surface.placement === 'after-hero'
      && canAccessAddonContribution(user.role, surface),
  );
  if (visibleSurfaces.length === 0) {
    return null;
  }

  return (
    <div className="addon-media-item-surfaces">
      {visibleSurfaces.map((surface) => (
        <AddonSurfaceHost
          key={`${surface.addon.id}:${surface.id}`}
          addon={surface.addon}
          elementTag={surface.elementTag}
          experienceElementTags={surface.experienceElementTags}
          surface={`media-item:${surface.placement}:${surface.id}`}
          mediaItem={mediaItem}
        />
      ))}
    </div>
  );
}

export function AddonMediaCardSurfaces({
  mediaItem,
  onStateChange,
}: {
  mediaItem: unknown;
  onStateChange?: (state: AddonMediaCardStateEventDetail) => void;
}) {
  const { mediaCardSurfaces, user } = useAddonHost();
  const visibleSurfaces = mediaCardSurfaces.filter((surface) =>
    canAccessAddonContribution(user.role, surface),
  );
  if (visibleSurfaces.length === 0) {
    return null;
  }

  return (
    <span className="addon-media-card-surfaces" aria-hidden="true">
      {visibleSurfaces.map((surface) => (
        <AddonSurfaceHost
          key={`${surface.addon.id}:${surface.id}`}
          addon={surface.addon}
          elementTag={surface.elementTag}
          experienceElementTags={surface.experienceElementTags}
          surface={`media-card:${surface.id}`}
          mediaItem={mediaItem}
          onMediaCardState={onStateChange}
        />
      ))}
    </span>
  );
}

export function AddonPlaybackStatusSurfaces({
  preparation,
}: {
  preparation: unknown;
}) {
  const { playbackStatusSurfaces, user } = useAddonHost();
  const visibleSurfaces = playbackStatusSurfaces.filter((surface) =>
    canAccessAddonContribution(user.role, surface),
  );
  if (visibleSurfaces.length === 0) {
    return null;
  }

  return (
    <section className="addon-playback-status-surfaces" aria-label="Add-on playback status">
      {visibleSurfaces.map((surface) => (
        <AddonSurfaceHost
          key={`${surface.addon.id}:${surface.id}`}
          addon={surface.addon}
          elementTag={surface.elementTag}
          experienceElementTags={surface.experienceElementTags}
          surface={`playback-status:${surface.id}`}
          preparation={preparation}
        />
      ))}
    </section>
  );
}

export function AddonPreparationBoundary({
  headerContent,
  children,
}: {
  headerContent?: ReactNode;
  children: ReactNode;
}) {
  const { mediaId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const { preparationSurfaces, user, clientExperience, onLogout } = useAddonHost();
  const activeSurface = preparationSurfaces.find((surface) =>
    canAccessAddonContribution(user.role, surface)
      && Boolean(surface.queryParameter)
      && Boolean(searchParams.get(surface.queryParameter!)?.trim()),
  );

  if (!activeSurface) {
    return children;
  }

  const triggerValue = searchParams.get(activeSurface.queryParameter!)?.trim() ?? '';
  const preparation = {
    mediaId,
    triggerValue,
    queryParameters: Object.fromEntries(searchParams.entries()),
  };
  const pageClassName = clientExperience === 'phone'
    ? 'player-page prepare-stream-page phone-player-page addon-preparation-page'
    : 'player-page prepare-stream-page addon-preparation-page';

  return (
    <main className={pageClassName}>
      {headerContent ?? (
        <header className="top-nav" data-tv-focus-zone="top-nav">
          <div className="top-nav-left" data-tv-focus-lane-id="top-nav-links">
            <p className="brand-mark">YEEN</p>
            <p className="page-nav-title">Preparing playback</p>
          </div>
          <div className="top-nav-right" data-tv-focus-lane-id="top-nav-actions">
            <MediaHomeButton />
            <ProfileMenu user={user} onLogout={onLogout} />
          </div>
        </header>
      )}
      <AddonSurfaceHost
        addon={activeSurface.addon}
        elementTag={activeSurface.elementTag}
        experienceElementTags={activeSurface.experienceElementTags}
        surface={`preparation-page:${activeSurface.id}`}
        preparation={preparation}
      />
    </main>
  );
}

export function AddonRouteSurface({ route }: { route: RegisteredAddonRoute }) {
  const { accessToken, clientExperience, onLogout, user } = useAddonHost();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const experiencePageKey = route.experiencePageKeys?.[clientExperience] ?? route.id;
  const { openRandomDetails, randomDetailsDisabled } =
    useRandomMediaDetailsNavigation(accessToken, clientExperience === 'phone');

  useEffect(() => {
    document.title = `${route.title} - Yeen`;
  }, [route.title]);

  const surface = (
    <AddonSurfaceHost
      addon={route.addon}
      elementTag={route.elementTag}
      experienceElementTags={route.experienceElementTags}
      surface={`route:${route.id}`}
      className="addon-route-surface"
      route={{ path: route.path, title: route.title }}
    />
  );

  if (route.shell !== 'admin') {
    return <main className="browse-page addon-route-page">{surface}</main>;
  }

  if (clientExperience === 'phone') {
    function handleSearch(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      navigate(toLibrarySearchPath(query));
    }

    return (
      <PhonePageShell pageKey={experiencePageKey}>
        <main className={`browse-page admin-page settings-page-v2 phone-addon-route-page phone-${experiencePageKey}-page`}>
          <PhonePageHeader
            user={user}
            onLogout={onLogout}
            query={query}
            onQueryChange={setQuery}
            onSearchSubmit={handleSearch}
            onOpenRandomDetails={openRandomDetails}
            randomDisabled={randomDetailsDisabled}
          />
          <section className="settings-content-grid">{surface}</section>
        </main>
      </PhonePageShell>
    );
  }

  const adminPage = (
    <main className="browse-page admin-page settings-page-v2 addon-admin-route-page">
      <AdminNav user={user} onLogout={onLogout} />
      <section className="settings-content-grid" data-tv-focus-zone="shelf">
        {surface}
      </section>
    </main>
  );

  return clientExperience === 'tv'
    ? <TvPageShell pageKey={experiencePageKey}>{adminPage}</TvPageShell>
    : adminPage;
}

export function AddonProfileNavigationEntries({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const { navigation, user } = useAddonHost();
  const navigate = useNavigate();
  return navigation
    .filter((entry) => entry.placement === 'profile'
      && canAccessAddonContribution(user.role, entry))
    .map((entry) => (
      <button
        key={`${entry.addon.id}:${entry.id}`}
        className="profile-dropdown-item"
        type="button"
        role="menuitem"
        onClick={() => {
          onNavigate?.();
          navigate(entry.to);
        }}
      >
        {entry.label}
      </button>
    ));
}
