import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import type { User } from "../../shared/services/types";
import { useMediaStorageSummary } from "../../library/services/useMediaStorageSummary";
import {
  artworkUrlForMedia,
  toProgressPercent,
} from "../services/homePageUtils";
import { HomeFeaturedHero } from "../components/HomeFeaturedHero";
import { HomeContinueWatchingSection } from "../components/HomeContinueWatchingSection";
import { HomeDiscoverSections } from "../components/HomeDiscoverSections";
import { HomeFooter } from "../components/HomeFooter";
import { HomeLoadingSkeleton } from "../components/HomeLoadingSkeleton";
import { HomeMediaShelfRow } from "../components/HomeMediaShelfRow";
import { HomeTopNav } from "../components/HomeTopNav";
import { toLibrarySearchPath } from "../../library/services/librarySearchUtils";
import { useHomeFeed } from "../services/useHomeFeed";
import { useHomeCuration } from "../services/useHomeCuration";

interface HomePageProps {
  token: string;
  user: User;
  onLogout: () => void;
}

export function HomePage({ token, user, onLogout }: HomePageProps) {
  const navigate = useNavigate();
  const {
    summary: storageSummary,
    loading: storageSummaryLoading,
    error: storageSummaryError,
  } = useMediaStorageSummary(token);

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

  const [query, setQuery] = useState("");
  const [randomRowSeed] = useState(() =>
    Math.floor(Math.random() * 2_147_483_647),
  );
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [pauseFeaturedRotation, setPauseFeaturedRotation] = useState(false);
  const { mediaItems, progressItems, loading, error } = useHomeFeed(token, {
    accountId: user.id,
    initialErrorMessage: "Failed to load media library.",
    refreshIntervalMs: 5000,
  });

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(toLibrarySearchPath(query));
  }

  const { feed, dismissContinueWatching } = useHomeCuration({
    userId: user.id,
    mediaItems,
    progressItems,
    randomSeed: randomRowSeed,
    experience: "desktop",
  });
  const {
    progressMap,
    continueWatching,
    featuredItems,
    recentItems,
    discoverItems,
    becauseYouWatchedItems,
    taggedRows,
    randomDetailsCandidates,
  } = feed;
  const hasContinueWatching = continueWatching.length > 0;

  const activeFeaturedIndex =
    featuredItems.length > 0
      ? ((featuredIndex % featuredItems.length) + featuredItems.length) %
        featuredItems.length
      : 0;

  const featuredItem = featuredItems[activeFeaturedIndex] ?? null;

  const showNextFeatured = useCallback(() => {
    setFeaturedIndex((current) => {
      if (featuredItems.length <= 1) {
        return current;
      }

      return (current + 1) % featuredItems.length;
    });
  }, [featuredItems.length]);

  const showPreviousFeatured = useCallback(() => {
    setFeaturedIndex((current) => {
      if (featuredItems.length <= 1) {
        return current;
      }

      return (current - 1 + featuredItems.length) % featuredItems.length;
    });
  }, [featuredItems.length]);

  useEffect(() => {
    if (featuredItems.length <= 1 || pauseFeaturedRotation) {
      return;
    }

    const intervalId = window.setInterval(() => {
      showNextFeatured();
    }, 8000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [featuredItems.length, pauseFeaturedRotation, showNextFeatured]);

  const featuredDescription = useMemo(() => {
    if (!featuredItem) {
      return "Open settings and run a media scan to begin building your home shelf.";
    }

    if (featuredItem.description?.trim()) {
      return featuredItem.description;
    }

    const typeLabel =
      featuredItem.type === "movie"
        ? "Movie"
        : featuredItem.type === "show"
          ? "Series"
          : "Media";

    return `${typeLabel} ready to watch from your library.`;
  }, [featuredItem]);

  const heroBackgroundImage = useMemo(() => {
    if (!featuredItem) {
      return null;
    }

    return artworkUrlForMedia(featuredItem);
  }, [featuredItem]);

  const firstName = useMemo(() => {
    const name = user.name.trim().split(/\s+/)[0] ?? "";
    return name || "you";
  }, [user.name]);

  const featuredProgress = featuredItem
    ? progressMap.get(featuredItem.id)
    : undefined;

  const featuredPercent = toProgressPercent(featuredProgress);

  const hasRandomDetailsCandidate = randomDetailsCandidates.length > 0;
  const showInitialHomeSkeleton = loading;

  const openRandomDetails = useCallback(() => {
    if (randomDetailsCandidates.length === 0) {
      return;
    }

    const randomIndex = Math.floor(
      Math.random() * randomDetailsCandidates.length,
    );
    openDetails(randomDetailsCandidates[randomIndex].id);
  }, [openDetails, randomDetailsCandidates]);

  return (
    <main className="browse-page home-page">
      <HomeTopNav
        query={query}
        onQueryChange={setQuery}
        onSearchSubmit={handleSearch}
        onOpenRandomDetails={openRandomDetails}
        hasRandomDetailsCandidate={hasRandomDetailsCandidate}
        user={user}
        onLogout={onLogout}
      />

      {error ? <p className="error-text">{error}</p> : null}
      {showInitialHomeSkeleton ? (
        <HomeLoadingSkeleton />
      ) : (
        <>
          <HomeFeaturedHero
            heroBackgroundImage={heroBackgroundImage}
            featuredItems={featuredItems}
            featuredItem={featuredItem}
            activeFeaturedIndex={activeFeaturedIndex}
            featuredDescription={featuredDescription}
            featuredPercent={featuredPercent}
            featuredPlayLabel={
              typeof featuredPercent === "number"
                ? `Resume ${Math.round(featuredPercent)}%`
                : "Play"
            }
            onShowPrevious={showPreviousFeatured}
            onShowNext={showNextFeatured}
            onSelectFeatured={setFeaturedIndex}
            onPlay={openPlayer}
            onOpenDetails={openDetails}
            onManageLibrary={() => navigate("/settings")}
            onHeroInteractionChange={setPauseFeaturedRotation}
          />

          {hasContinueWatching ? (
            <HomeContinueWatchingSection
              firstName={firstName}
              continueWatching={continueWatching}
              onOpenPlayer={openPlayer}
              onDismiss={dismissContinueWatching}
            />
          ) : null}

          {recentItems.length > 0 ? (
            <HomeMediaShelfRow
              className={
                hasContinueWatching
                  ? "browse-section"
                  : "browse-section is-first-row"
              }
              id="row-new"
              title="New on Yeen"
              items={recentItems}
              progressMap={progressMap}
              onOpen={openDetails}
            />
          ) : null}
          {becauseYouWatchedItems.length > 0 ? (
            <HomeMediaShelfRow
              className="browse-section"
              id="row-because-you-watched"
              title="Because You Watched"
              items={becauseYouWatchedItems}
              progressMap={progressMap}
              onOpen={openDetails}
            />
          ) : null}

          <HomeDiscoverSections
            discoverItems={discoverItems}
            movieRowsByTag={taggedRows}
            progressMap={progressMap}
            onOpenDetails={openDetails}
          />
        </>
      )}

      <HomeFooter
        storageSummary={storageSummary}
        storageSummaryLoading={storageSummaryLoading}
        storageSummaryError={storageSummaryError}
      />
    </main>
  );
}
