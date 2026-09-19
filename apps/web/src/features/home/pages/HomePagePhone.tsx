import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ComponentProps,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import type { MediaItem, User } from "../../shared/services/types";
import {
  artworkUrlForMedia as homeArtworkUrlForMedia,
  toProgressPercent,
  toSeasonEpisodeLabel,
} from "../services/homePageUtils";
import {
  pickRandomItem,
  toLibrarySearchPath,
  toRandomDetailsCandidates,
} from "../../library/services/librarySearchUtils";
import { PhonePageHeader } from "../../navigation/components/PhonePageHeader";
import { PhonePageShell } from "../../navigation/components/PhonePageShell";
import { HomePhoneFeaturedHero } from "../components/HomePhoneFeaturedHero";
import { HomePhoneScrollShelf } from "../components/HomePhoneScrollShelf";
import { usePhoneInstallPrompt } from "../services/usePhoneInstallPrompt";
import { useHomeFeed } from "../services/useHomeFeed";
import { useHomeCuration } from "../services/useHomeCuration";

interface HomePagePhoneProps {
  token: string;
  user: User;
  onLogout: () => void;
}

const FEATURED_SWIPE_THRESHOLD_PX = 44;

type FeaturedPanel =
  | { kind: "install"; id: "featured-install-panel" }
  | { kind: "media"; id: string; item: MediaItem };

function HomePhoneShelves({
  continueWatching,
  recentItems,
  discoverItems,
  becauseYouWatchedItems,
  taggedRows,
  progressMap,
  openPlayer,
  openDetails,
  dismiss,
}: {
  continueWatching: Array<{ item: MediaItem }>;
  recentItems: MediaItem[];
  discoverItems: MediaItem[];
  becauseYouWatchedItems: MediaItem[];
  taggedRows: Array<{ id: string; label: string; items: MediaItem[] }>;
  progressMap: ComponentProps<typeof HomePhoneScrollShelf>["progressMap"];
  openPlayer: (id: string) => void;
  openDetails: (id: string) => void;
  dismiss: (id: string) => void;
}) {
  return (
    <>
      {continueWatching.length > 0 ? (
        <HomePhoneScrollShelf
          title="Continue Watching"
          ariaLabel="Continue watching titles"
          items={continueWatching.map(({ item }) => item)}
          progressMap={progressMap}
          onOpen={openPlayer}
          topRightLabelForItem={toSeasonEpisodeLabel}
          actionForItem={(item) => ({
            label: "Remove",
            ariaLabel: `Remove ${item.title} from Continue Watching`,
            onClick: () => dismiss(item.id),
          })}
        />
      ) : null}
      {recentItems.length > 0 ? (
        <HomePhoneScrollShelf
          title="Recently Added"
          ariaLabel="Recently added titles"
          items={recentItems}
          progressMap={progressMap}
          onOpen={openDetails}
        />
      ) : null}
      {discoverItems.length > 0 ? (
        <HomePhoneScrollShelf
          title="Discover"
          ariaLabel="Discover titles"
          items={discoverItems}
          progressMap={progressMap}
          onOpen={openDetails}
        />
      ) : null}
      {becauseYouWatchedItems.length > 0 ? (
        <HomePhoneScrollShelf
          title="Because You Watched"
          ariaLabel="Recommended from your watch history"
          items={becauseYouWatchedItems}
          progressMap={progressMap}
          onOpen={openDetails}
        />
      ) : null}
      {taggedRows.map((row) => (
        <HomePhoneScrollShelf
          key={row.id}
          title={row.label}
          ariaLabel={`${row.label} titles`}
          items={row.items}
          progressMap={progressMap}
          onOpen={openDetails}
        />
      ))}
    </>
  );
}

export function HomePagePhone({ token, user, onLogout }: HomePagePhoneProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const { mediaItems, progressItems, loading, error } = useHomeFeed(token, {
    accountId: user.id,
    initialErrorMessage: "Failed to load your home feed.",
    refreshIntervalMs: 8000,
  });
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [randomSeed] = useState(() =>
    Math.floor(Math.random() * 2_147_483_647),
  );
  const {
    deferredInstallPrompt,
    installStatusMessage,
    showInstallPanel,
    handleInstallPwa,
  } = usePhoneInstallPrompt();
  const featuredSwipeStateRef = useRef<{
    pointerId: number;
    startX: number;
  } | null>(null);

  const openDetails = useCallback(
    (mediaId: string) => {
      navigate(`/details/${mediaId}`);
    },
    [navigate],
  );

  const openPlayer = useCallback(
    (mediaId: string) => {
      navigate(`/player/${mediaId}`);
    },
    [navigate],
  );

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(toLibrarySearchPath(query));
  }

  const { feed, dismissContinueWatching } = useHomeCuration({
    userId: user.id,
    mediaItems,
    progressItems,
    randomSeed,
    experience: "phone",
  });
  const {
    progressMap,
    continueWatching,
    featuredItems,
    recentItems,
    discoverItems,
    becauseYouWatchedItems,
    taggedRows,
  } = feed;

  const featuredPanels = useMemo(() => {
    const panels: FeaturedPanel[] = showInstallPanel
      ? [{ kind: "install", id: "featured-install-panel" }]
      : [];

    for (const item of featuredItems) {
      panels.push({
        kind: "media",
        id: item.id,
        item,
      });
    }

    return panels;
  }, [featuredItems, showInstallPanel]);

  const activeFeaturedIndex =
    featuredPanels.length > 0
      ? ((featuredIndex % featuredPanels.length) + featuredPanels.length) %
        featuredPanels.length
      : 0;

  const activeFeaturedPanel = featuredPanels[activeFeaturedIndex] ?? null;

  const handleFeaturedPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (featuredPanels.length <= 1) {
        return;
      }

      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      event.currentTarget.setPointerCapture(event.pointerId);
      featuredSwipeStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
      };
    },
    [featuredPanels.length],
  );

  const handleFeaturedPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const swipeState = featuredSwipeStateRef.current;
      if (!swipeState || swipeState.pointerId !== event.pointerId) {
        return;
      }

      featuredSwipeStateRef.current = null;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      const deltaX = event.clientX - swipeState.startX;
      if (Math.abs(deltaX) < FEATURED_SWIPE_THRESHOLD_PX) {
        return;
      }

      setFeaturedIndex((current) => {
        if (featuredPanels.length <= 0) {
          return 0;
        }

        const direction = deltaX < 0 ? 1 : -1;
        const nextIndex = current + direction;
        return (
          ((nextIndex % featuredPanels.length) + featuredPanels.length) %
          featuredPanels.length
        );
      });
    },
    [featuredPanels.length],
  );

  const handleFeaturedPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const swipeState = featuredSwipeStateRef.current;
      if (!swipeState || swipeState.pointerId !== event.pointerId) {
        return;
      }

      featuredSwipeStateRef.current = null;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [],
  );

  const featuredItem =
    activeFeaturedPanel?.kind === "media" ? activeFeaturedPanel.item : null;

  const featuredDescription = useMemo(() => {
    if (!featuredItem) {
      return "Scan your library to populate your featured queue.";
    }

    if (featuredItem.description?.trim()) {
      return featuredItem.description;
    }

    return `${featuredItem.type === "show" ? "Series" : "Movie"} ready to watch from your library.`;
  }, [featuredItem]);

  const randomDetailsCandidates = useMemo(
    () => toRandomDetailsCandidates(mediaItems),
    [mediaItems],
  );

  const openRandomDetails = useCallback(() => {
    const randomCandidate = pickRandomItem(randomDetailsCandidates);
    if (!randomCandidate) {
      return;
    }

    openDetails(randomCandidate.id);
  }, [openDetails, randomDetailsCandidates]);

  const featuredProgress = featuredItem
    ? progressMap.get(featuredItem.id)
    : undefined;
  const featuredPercent = toProgressPercent(featuredProgress);
  const featuredProgressLabel =
    typeof featuredPercent === "number"
      ? `Resume at ${Math.round(featuredPercent)}%`
      : "Ready to start";
  const featuredBackground = featuredItem
    ? homeArtworkUrlForMedia(featuredItem)
    : null;
  const installPanelDescription = deferredInstallPrompt
    ? "Install Yeen for one-tap launch and a cleaner full-screen playback experience."
    : "Add Yeen to your home screen from the browser menu for app-style access.";
  const installPanelStatus =
    installStatusMessage ??
    (deferredInstallPrompt
      ? "Tap Install to add Yeen to your home screen."
      : "If no prompt appears, use Add to Home Screen in your browser options.");

  return (
    <PhonePageShell pageKey="home">
      <main className="browse-page phone-home-page">
        <PhonePageHeader
          user={user}
          onLogout={onLogout}
          query={query}
          onQueryChange={setQuery}
          onSearchSubmit={handleSearch}
          onOpenRandomDetails={openRandomDetails}
          randomDisabled={randomDetailsCandidates.length === 0}
        />

        <h1 className="visually-hidden">Home</h1>
        {error ? <p className="error-text">{error}</p> : null}
        {loading ? (
          <section
            className="phone-home-loading"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <div
              className="home-skeleton-block phone-home-loading-hero"
              aria-hidden="true"
            />
            <p>Loading your home feed...</p>
            <div className="phone-home-loading-row" aria-hidden="true">
              {Array.from({ length: 4 }, (_, index) => (
                <span
                  key={index}
                  className="home-skeleton-block phone-home-loading-tile"
                />
              ))}
            </div>
          </section>
        ) : (
          <>
            <HomePhoneFeaturedHero
              featuredBackground={featuredBackground}
              activeIsInstallPanel={activeFeaturedPanel?.kind === "install"}
              featuredItem={featuredItem}
              featuredDescription={featuredDescription}
              featuredProgressLabel={featuredProgressLabel}
              installPanelDescription={installPanelDescription}
              installPanelStatus={installPanelStatus}
              hasInstallPrompt={Boolean(deferredInstallPrompt)}
              panelDots={featuredPanels.map((panel) => ({
                id: panel.id,
                kind: panel.kind,
              }))}
              activeFeaturedIndex={activeFeaturedIndex}
              onSelectFeatured={setFeaturedIndex}
              onInstallPwa={() => {
                void handleInstallPwa();
              }}
              onOpenPlayer={openPlayer}
              onOpenDetails={openDetails}
              onPointerDown={handleFeaturedPointerDown}
              onPointerUp={handleFeaturedPointerUp}
              onPointerCancel={handleFeaturedPointerCancel}
            />

            <HomePhoneShelves
              {...{
                continueWatching,
                recentItems,
                discoverItems,
                becauseYouWatchedItems,
                taggedRows,
                progressMap,
              }}
              openPlayer={openPlayer}
              openDetails={openDetails}
              dismiss={dismissContinueWatching}
            />
          </>
        )}
      </main>
    </PhonePageShell>
  );
}
