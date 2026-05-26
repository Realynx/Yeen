import {
  SORT_OPTIONS,
  type MediaSortOrder,
  type MediaTypeFilter,
} from '../services/mediaLibraryUtils';
import type {
  LibraryTagCount,
  LibraryTypeCounts,
} from '../services/useMediaLibraryFilters';
import {
  ARTWORK_LABELS,
  CHAPTER_LABELS,
  FORMAT_LABELS,
  QUALITY_LABELS,
  RELEASE_YEAR_LABELS,
  RUNTIME_LABELS,
  SUBTITLE_AVAILABILITY_LABELS,
  VIDEO_CODEC_LABELS,
  WATCH_STATUS_LABELS,
  type ArtworkFilter,
  type ChapterFilter,
  type FormatFilter,
  type QualityFilter,
  type ReleaseYearFilter,
  type RuntimeFilter,
  type SubtitleAvailabilityFilter,
  type VideoCodecFilter,
  type WatchStatusFilter,
} from '../services/mediaLibraryFilterUtils';

const SORT_OPTION_LABELS = Object.fromEntries(
  SORT_OPTIONS.map((option) => [option.value, option.label]),
) as Record<MediaSortOrder, string>;

interface MediaLibraryFilterControlsProps {
  idPrefix: string;
  typeFilter: MediaTypeFilter;
  typeCounts: LibraryTypeCounts;
  tagFilter: string;
  availableTags: LibraryTagCount[];
  watchStatusFilter: WatchStatusFilter;
  subtitleAvailabilityFilter: SubtitleAvailabilityFilter;
  qualityFilter: QualityFilter;
  runtimeFilter: RuntimeFilter;
  releaseYearFilter: ReleaseYearFilter;
  artworkFilter: ArtworkFilter;
  chapterFilter: ChapterFilter;
  formatFilter: FormatFilter;
  videoCodecFilter: VideoCodecFilter;
  sortOrder: MediaSortOrder;
  setTypeFilter: (value: MediaTypeFilter) => void;
  setTagFilter: (value: string) => void;
  setWatchStatusFilter: (value: WatchStatusFilter) => void;
  setSubtitleAvailabilityFilter: (value: SubtitleAvailabilityFilter) => void;
  setQualityFilter: (value: QualityFilter) => void;
  setRuntimeFilter: (value: RuntimeFilter) => void;
  setReleaseYearFilter: (value: ReleaseYearFilter) => void;
  setArtworkFilter: (value: ArtworkFilter) => void;
  setChapterFilter: (value: ChapterFilter) => void;
  setFormatFilter: (value: FormatFilter) => void;
  setVideoCodecFilter: (value: VideoCodecFilter) => void;
  setSortOrder: (value: MediaSortOrder) => void;
}

export function MediaLibraryFilterControls({
  idPrefix,
  typeFilter,
  typeCounts,
  tagFilter,
  availableTags,
  watchStatusFilter,
  subtitleAvailabilityFilter,
  qualityFilter,
  runtimeFilter,
  releaseYearFilter,
  artworkFilter,
  chapterFilter,
  formatFilter,
  videoCodecFilter,
  sortOrder,
  setTypeFilter,
  setTagFilter,
  setWatchStatusFilter,
  setSubtitleAvailabilityFilter,
  setQualityFilter,
  setRuntimeFilter,
  setReleaseYearFilter,
  setArtworkFilter,
  setChapterFilter,
  setFormatFilter,
  setVideoCodecFilter,
  setSortOrder,
}: MediaLibraryFilterControlsProps) {
  return (
    <div className="library-filters">
      <div className="library-filter-group">
        <p className="library-filter-label">Media Type</p>
        <div className="library-chip-row" role="group" aria-label="Filter by media type">
          {(['all', 'movie', 'show'] as MediaTypeFilter[]).map((type) => (
            <button
              key={type}
              type="button"
              className={typeFilter === type ? 'library-chip is-active' : 'library-chip'}
              onClick={() => setTypeFilter(type)}
            >
              {type === 'all' ? 'All' : type === 'movie' ? 'Movies' : 'Shows'}
              <span className="library-chip-count">{typeCounts[type]}</span>
            </button>
          ))}
        </div>
      </div>

      <label className="library-filter-group" htmlFor={`${idPrefix}-tag-select`}>
        <span className="library-filter-label">Tag</span>
        <select
          id={`${idPrefix}-tag-select`}
          className="library-select"
          value={tagFilter}
          onChange={(event) => setTagFilter(event.target.value)}
        >
          <option value="">All Tags</option>
          {availableTags.map((tag) => (
            <option key={tag.label.toLowerCase()} value={tag.label}>
              {`${tag.label} (${tag.count})`}
            </option>
          ))}
        </select>
      </label>

      <div className="library-filter-group">
        <p className="library-filter-label">Watch Status</p>
        <div className="library-chip-row" role="group" aria-label="Filter by watch status">
          {(Object.keys(WATCH_STATUS_LABELS) as WatchStatusFilter[]).map((status) => (
            <button
              key={status}
              type="button"
              className={watchStatusFilter === status ? 'library-chip is-active' : 'library-chip'}
              onClick={() => setWatchStatusFilter(status)}
            >
              {WATCH_STATUS_LABELS[status]}
            </button>
          ))}
        </div>
      </div>

      <FilterSelect id={`${idPrefix}-subtitle-select`} label="Subtitles" value={subtitleAvailabilityFilter} labels={SUBTITLE_AVAILABILITY_LABELS} onChange={setSubtitleAvailabilityFilter} />
      <FilterSelect id={`${idPrefix}-quality-select`} label="Quality" value={qualityFilter} labels={QUALITY_LABELS} onChange={setQualityFilter} />
      <FilterSelect id={`${idPrefix}-runtime-select`} label="Runtime" value={runtimeFilter} labels={RUNTIME_LABELS} onChange={setRuntimeFilter} />
      <FilterSelect id={`${idPrefix}-year-select`} label="Year" value={releaseYearFilter} labels={RELEASE_YEAR_LABELS} onChange={setReleaseYearFilter} />
      <FilterSelect id={`${idPrefix}-artwork-select`} label="Artwork" value={artworkFilter} labels={ARTWORK_LABELS} onChange={setArtworkFilter} />
      <FilterSelect id={`${idPrefix}-chapters-select`} label="Chapters" value={chapterFilter} labels={CHAPTER_LABELS} onChange={setChapterFilter} />
      <FilterSelect id={`${idPrefix}-format-select`} label="Format" value={formatFilter} labels={FORMAT_LABELS} onChange={setFormatFilter} />
      <FilterSelect id={`${idPrefix}-codec-select`} label="Codec" value={videoCodecFilter} labels={VIDEO_CODEC_LABELS} onChange={setVideoCodecFilter} />
      <FilterSelect
        id={`${idPrefix}-order-select`}
        label="Order"
        value={sortOrder}
        labels={SORT_OPTION_LABELS}
        onChange={setSortOrder}
      />
    </div>
  );
}

interface FilterSelectProps<T extends string> {
  id: string;
  label: string;
  value: T;
  labels: Record<T, string>;
  onChange: (value: T) => void;
}

function FilterSelect<T extends string>({
  id,
  label,
  value,
  labels,
  onChange,
}: FilterSelectProps<T>) {
  return (
    <label className="library-filter-group" htmlFor={id}>
      <span className="library-filter-label">{label}</span>
      <select
        id={id}
        className="library-select"
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {(Object.keys(labels) as T[]).map((option) => (
          <option key={option} value={option}>
            {labels[option]}
          </option>
        ))}
      </select>
    </label>
  );
}
