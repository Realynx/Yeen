import { useCallback, useState } from "react";
import type { MediaItem } from "../../shared/services/types";
import { AddonMediaCardSurfaces } from "../../addons/runtime/AddonHostSlots";

interface MediaTileProps {
  media: MediaItem;
  imageUrl?: string | null;
  progressPercent?: number;
  progressKind?: "watch" | "download";
  topRightLabel?: string | null;
  layout?: "default" | "library";
  onOpen: (mediaId: string) => void;
  selectable?: boolean;
  selected?: boolean;
  onSelectionToggle?: (mediaId: string, modifiers: { shift: boolean }) => void;
}

interface AddonCardState {
  mediaId: string;
  progressPercent?: number | null;
  tone?: "default" | "accent";
  label?: string | null;
}

interface LoadedArtworkState {
  imageUrl: string | null;
  isPortrait: boolean;
  failed: boolean;
}

function resolveArtworkDisplay(
  currentImageUrl: string | null,
  loaded: LoadedArtworkState,
) {
  const matches = loaded.imageUrl === currentImageUrl;
  return {
    failed: matches && loaded.failed,
    portrait: matches && !loaded.failed && loaded.isPortrait,
  };
}

function technicalQuality(media: MediaItem): string {
  return media.width && media.height
    ? `${media.width}x${media.height}`
    : "Unknown quality";
}

function mediaTileClassName(
  selectable: boolean,
  selected: boolean,
  libraryLayout: boolean,
): string {
  return [
    "media-tile",
    selectable ? "is-selectable" : null,
    selected ? "is-selected" : null,
    libraryLayout ? "is-library-layout" : null,
  ]
    .filter((className): className is string => Boolean(className))
    .join(" ");
}

function resolveProgressDisplay(input: {
  addonState: AddonCardState | null;
  mediaId: string;
  progressPercent: number | undefined;
  progressKind: "watch" | "download" | undefined;
  topRightLabel: string | null | undefined;
}) {
  const activeAddonState =
    input.addonState?.mediaId === input.mediaId ? input.addonState : null;
  const effectiveProgress =
    activeAddonState?.progressPercent ?? input.progressPercent;
  return {
    activeAddonState,
    topRightLabel: activeAddonState?.label ?? input.topRightLabel,
    safePercent:
      typeof effectiveProgress === "number"
        ? Math.max(0, Math.min(100, effectiveProgress))
        : null,
    barClassName:
      input.progressKind === "download" || activeAddonState?.tone === "accent"
        ? "progress-bar is-download"
        : "progress-bar",
  };
}

function formatDuration(seconds: number): string {
  if (!seconds) {
    return "0m";
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours <= 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

function toQualityLabel(media: MediaItem): string {
  if (!media.height) {
    return "SD";
  }

  if (media.height >= 2160) {
    return "4K";
  }

  if (media.height >= 1080) {
    return "HD";
  }

  if (media.height >= 720) {
    return "720p";
  }

  return `${media.height}p`;
}

function MetadataBadges({ media }: { media: MediaItem }) {
  return (
    <>
      <span>{formatDuration(media.durationSeconds)}</span>
      <span>{toQualityLabel(media)}</span>
      {media.releaseYear ? <span>{media.releaseYear}</span> : null}
      <span>{media.extension.replace(".", "").toUpperCase()}</span>
    </>
  );
}

function TileArtwork({
  media,
  imageUrl,
  artworkFailed,
  portraitArtwork,
  onLoad,
  onError,
}: {
  media: MediaItem;
  imageUrl: string | null;
  artworkFailed: boolean;
  portraitArtwork: boolean;
  onLoad: (event: React.SyntheticEvent<HTMLImageElement>) => void;
  onError: () => void;
}) {
  if (!imageUrl || artworkFailed) {
    return (
      <>
        <div className="media-glow" />
        <span>{media.title.slice(0, 1).toUpperCase()}</span>
      </>
    );
  }
  return (
    <>
      <div
        className={
          portraitArtwork
            ? "media-thumb-backdrop is-visible"
            : "media-thumb-backdrop"
        }
        style={
          portraitArtwork
            ? { backgroundImage: `url("${imageUrl}")` }
            : undefined
        }
      />
      <img
        src={imageUrl}
        alt={media.title}
        loading="lazy"
        decoding="async"
        className={
          portraitArtwork
            ? "media-thumb-image is-portrait"
            : "media-thumb-image"
        }
        onLoad={onLoad}
        onError={onError}
      />
    </>
  );
}

function MediaTileHoverPanel({
  media,
  isLibraryLayout,
  progressPercent,
  progressLabel,
  description,
  quality,
  typeLabel,
}: {
  media: MediaItem;
  isLibraryLayout: boolean;
  progressPercent: number | null;
  progressLabel: string | null;
  description: string;
  quality: string;
  typeLabel: string;
}) {
  return (
    <div className="media-hover-panel">
      <h3 className="media-hover-title" title={media.title}>
        {media.title}
      </h3>
      {isLibraryLayout ? (
        <div
          className="media-badges media-badges-below-title"
          aria-hidden="true"
        >
          <MetadataBadges media={media} />
        </div>
      ) : (
        <div className="media-hover-body">
          <div className="media-badges" aria-hidden="true">
            <MetadataBadges media={media} />
          </div>
          {progressPercent !== null ? (
            <div className="media-progress-inline" aria-hidden="true">
              <span className="media-progress-inline-label">
                {progressLabel ?? `Watched ${Math.round(progressPercent)}%`}
              </span>
              <div className="media-progress-inline-track">
                <div style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          ) : null}
          <p className="media-hover-description">{description}</p>
          <p className="media-hover-tech">
            {quality} | {typeLabel}
          </p>
        </div>
      )}
    </div>
  );
}

export function MediaTile({
  media,
  imageUrl,
  progressPercent,
  progressKind,
  topRightLabel,
  layout = "default",
  onOpen,
  selectable = false,
  selected = false,
  onSelectionToggle,
}: MediaTileProps) {
  const [addonCardState, setAddonCardState] = useState<AddonCardState | null>(
    null,
  );
  const handleAddonCardState = useCallback(
    (state: {
      progressPercent?: number | null;
      tone?: "default" | "accent";
      label?: string | null;
    }) => {
      setAddonCardState({ mediaId: media.id, ...state });
    },
    [media.id],
  );
  const isLibraryLayout = layout === "library";
  const currentImageUrl = imageUrl ?? null;
  const quality = technicalQuality(media);
  const typeLabel = media.type === "show" ? "Series" : "Movie";

  const description =
    media.description?.trim() || `${typeLabel} from ${media.relativePath}`;

  const progressDisplay = resolveProgressDisplay({
    addonState: addonCardState,
    mediaId: media.id,
    progressPercent,
    progressKind,
    topRightLabel,
  });

  const [loadedArtworkState, setLoadedArtworkState] =
    useState<LoadedArtworkState>({
      imageUrl: null,
      isPortrait: false,
      failed: false,
    });

  const artworkDisplay = resolveArtworkDisplay(
    currentImageUrl,
    loadedArtworkState,
  );

  const tileClassName = mediaTileClassName(
    selectable,
    selected,
    isLibraryLayout,
  );

  function handleImageLoad(event: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (!naturalWidth || !naturalHeight) {
      setLoadedArtworkState({
        imageUrl: currentImageUrl,
        isPortrait: false,
        failed: true,
      });
      return;
    }

    setLoadedArtworkState({
      imageUrl: currentImageUrl,
      isPortrait: naturalHeight / naturalWidth > 1.12,
      failed: false,
    });
  }

  return (
    <button
      type="button"
      className={tileClassName}
      data-tv-focus-key={`media:${media.id}`}
      aria-pressed={selectable ? selected : undefined}
      onMouseDown={(event) => {
        // Prevent native text selection when shift-clicking tiles.
        if (selectable && event.shiftKey) {
          event.preventDefault();
        }
      }}
      onClick={(event) => {
        if (selectable) {
          onSelectionToggle?.(media.id, { shift: event.shiftKey });
        } else {
          onOpen(media.id);
        }
      }}
    >
      {selectable ? (
        <span className="media-tile-checkbox" aria-hidden="true">
          {selected ? "✓" : ""}
        </span>
      ) : null}

      <div className="media-thumb" aria-hidden="true">
        <TileArtwork
          media={media}
          imageUrl={currentImageUrl}
          artworkFailed={artworkDisplay.failed}
          portraitArtwork={artworkDisplay.portrait}
          onLoad={handleImageLoad}
          onError={() =>
            setLoadedArtworkState({
              imageUrl: currentImageUrl,
              isPortrait: false,
              failed: true,
            })
          }
        />

        <div className="media-thumb-shade" />

        <AddonMediaCardSurfaces
          mediaItem={media}
          onStateChange={handleAddonCardState}
        />

        {progressDisplay.safePercent !== null ? (
          <div className={progressDisplay.barClassName} aria-hidden="true">
            <div style={{ width: `${progressDisplay.safePercent}%` }} />
          </div>
        ) : null}

        {progressDisplay.topRightLabel ? (
          <span className="media-top-right-label" aria-hidden="true">
            {progressDisplay.topRightLabel}
          </span>
        ) : null}
      </div>

      <MediaTileHoverPanel
        media={media}
        isLibraryLayout={isLibraryLayout}
        progressPercent={progressDisplay.safePercent}
        progressLabel={progressDisplay.activeAddonState?.label ?? null}
        description={description}
        quality={quality}
        typeLabel={typeLabel}
      />
    </button>
  );
}
