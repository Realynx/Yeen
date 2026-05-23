import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MediaTile } from '../../components/MediaTile';
import {
	searchRemoteMedia,
	toApiErrorMessage,
} from '../../lib/api';
import type { MediaItem, User } from '../../lib/types';
import {
	LIBRARY_SEARCH_QUERY_PARAM,
	normalizeLibrarySearchTerm,
	pickRandomItem,
	toLibrarySearchPath,
	toRandomDetailsCandidates,
} from '../librarySearchUtils';
import {
	SORT_OPTIONS,
	artworkUrlForMedia,
	normalizeTags,
	sortMediaItems,
	toLibraryItems,
	toLibraryType,
	toProgressMap,
	toProgressPercent,
	type MediaSortOrder,
	type MediaTypeFilter,
} from '../mediaLibraryUtils';
import { useMediaLibrary } from '../useMediaLibrary';
import { PhonePageHeader } from './PhonePageHeader';
import { PhonePageShell } from './PhonePageShell';

interface MediaLibraryPagePhoneProps {
	token: string;
	user: User;
	onLogout: () => void;
}

interface SearchDraftState {
	routeTerm: string;
	draft: string;
}

export function MediaLibraryPagePhone({ token, user, onLogout }: MediaLibraryPagePhoneProps) {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const routeSearchTerm = normalizeLibrarySearchTerm(
		searchParams.get(LIBRARY_SEARCH_QUERY_PARAM),
	);

	const [searchDraftState, setSearchDraftState] = useState<SearchDraftState>(() => ({
		routeTerm: routeSearchTerm,
		draft: routeSearchTerm,
	}));
	const [typeFilter, setTypeFilter] = useState<MediaTypeFilter>('all');
	const [tagFilter, setTagFilter] = useState('');
	const [sortOrder, setSortOrder] = useState<MediaSortOrder>('updated-desc');

	const {
		mediaItems,
		progressItems,
		downloadProgressItems,
		loading,
		error,
		activeSearch,
	} = useMediaLibrary(token, routeSearchTerm);

	const [remoteItems, setRemoteItems] = useState<MediaItem[]>([]);
	const [remoteLoading, setRemoteLoading] = useState(false);
	const [remoteError, setRemoteError] = useState<string | null>(null);

	const query = searchDraftState.routeTerm === routeSearchTerm
		? searchDraftState.draft
		: routeSearchTerm;

	const setQuery = useCallback(
		(value: string) => {
			setSearchDraftState({
				routeTerm: routeSearchTerm,
				draft: value,
			});
		},
		[routeSearchTerm],
	);

	const openDetails = useCallback((mediaId: string) => {
		navigate(`/details/${mediaId}`);
	}, [navigate]);

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

	function handleSearch(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		navigate(toLibrarySearchPath(query));
	}

	function handleClearSearch() {
		setQuery('');
		setTagFilter('');
		navigate('/library');
	}

	function handleResetFilters() {
		setTypeFilter('all');
		setTagFilter('');
		setSortOrder('updated-desc');
	}

	const libraryItems = useMemo(
		() => toLibraryItems(mediaItems),
		[mediaItems],
	);

	const typeCounts = useMemo(() => {
		let movie = 0;
		let show = 0;

		for (const item of libraryItems) {
			if (toLibraryType(item) === 'movie') movie += 1;
			if (toLibraryType(item) === 'show') show += 1;
		}

		return { all: libraryItems.length, movie, show };
	}, [libraryItems]);

	const availableTags = useMemo(() => {
		const counts = new Map<string, { label: string; count: number }>();

		for (const item of libraryItems) {
			for (const tag of normalizeTags(item.tags)) {
				const key = tag.toLowerCase();
				const existing = counts.get(key);

				if (existing) {
					existing.count += 1;
					continue;
				}

				counts.set(key, { label: tag, count: 1 });
			}
		}

		return [...counts.values()].sort((left, right) => {
			if (left.count !== right.count) {
				return right.count - left.count;
			}

			return left.label.localeCompare(right.label, undefined, {
				sensitivity: 'base',
			});
		});
	}, [libraryItems]);

	const filteredItems = useMemo(() => {
		const byType =
			typeFilter === 'all'
				? libraryItems
				: libraryItems.filter((item) => toLibraryType(item) === typeFilter);

		const normalizedTagFilter = tagFilter.trim().toLowerCase();
		const byTag = normalizedTagFilter
			? byType.filter((item) =>
					item.tags.some((tag) => tag.trim().toLowerCase() === normalizedTagFilter),
				)
			: byType;

		return sortMediaItems(byTag, sortOrder);
	}, [libraryItems, sortOrder, tagFilter, typeFilter]);

	const useCompactResultsGrid = filteredItems.length > 0 && filteredItems.length < 6;
	const useCompactRemoteGrid = remoteItems.length > 0 && remoteItems.length < 6;

	const progressMap = useMemo(() => toProgressMap(progressItems), [progressItems]);
	const downloadProgressMap = useMemo(() => {
		const map = new Map<string, number>();

		for (const entry of downloadProgressItems) {
			const normalizedPercent = Math.min(100, Math.max(0, entry.progressPercent));
			map.set(entry.mediaId, normalizedPercent);
		}

		return map;
	}, [downloadProgressItems]);

	useEffect(() => {
		let cancelled = false;

		async function loadRemoteResults() {
			const searchTerm = activeSearch?.trim() ?? '';

			if (!searchTerm) {
				setRemoteItems([]);
				setRemoteLoading(false);
				setRemoteError(null);
				return;
			}

			setRemoteLoading(true);
			setRemoteError(null);

			try {
				const payload = await searchRemoteMedia(token, searchTerm, 24);
				if (!cancelled) {
					setRemoteItems(payload.items);
				}
			} catch (loadError) {
				if (!cancelled) {
					setRemoteItems([]);
					setRemoteError(
						toApiErrorMessage(loadError, 'Failed to search remote media catalogs.'),
					);
				}
			} finally {
				if (!cancelled) {
					setRemoteLoading(false);
				}
			}
		}

		void loadRemoteResults();

		return () => {
			cancelled = true;
		};
	}, [activeSearch, token]);

	const activeSearchLabel = useMemo(() => {
		const searchLabel = activeSearch ? `matches for "${activeSearch}"` : null;
		const tagLabel = tagFilter ? `tag "${tagFilter}"` : null;

		if (searchLabel && tagLabel) return `Showing ${searchLabel} with ${tagLabel}`;
		if (searchLabel) return `Showing ${searchLabel}`;
		if (tagLabel) return `Showing items with ${tagLabel}`;
		return 'Showing all indexed media';
	}, [activeSearch, tagFilter]);

	return (
		<PhonePageShell pageKey="library">
			<main className="browse-page media-library-page phone-library-page">
				<PhonePageHeader
					user={user}
					onLogout={onLogout}
					query={query}
					onQueryChange={setQuery}
					onSearchSubmit={handleSearch}
					onOpenRandomDetails={openRandomDetails}
					randomDisabled={randomDetailsCandidates.length === 0}
				/>

				<section className="library-toolbar phone-library-toolbar" aria-label="Library filters">
					<div className="library-filters">
						<div className="library-filter-group">
							<p className="library-filter-label">Media Type</p>
							<div className="library-chip-row" role="group" aria-label="Filter by media type">
								<button
									type="button"
									className={typeFilter === 'all' ? 'library-chip is-active' : 'library-chip'}
									onClick={() => setTypeFilter('all')}
								>
									All
									<span className="library-chip-count">{typeCounts.all}</span>
								</button>
								<button
									type="button"
									className={typeFilter === 'movie' ? 'library-chip is-active' : 'library-chip'}
									onClick={() => setTypeFilter('movie')}
								>
									Movies
									<span className="library-chip-count">{typeCounts.movie}</span>
								</button>
								<button
									type="button"
									className={typeFilter === 'show' ? 'library-chip is-active' : 'library-chip'}
									onClick={() => setTypeFilter('show')}
								>
									Shows
									<span className="library-chip-count">{typeCounts.show}</span>
								</button>
							</div>
						</div>

						<label className="library-filter-group" htmlFor="library-phone-tag-select">
							<span className="library-filter-label">Tag</span>
							<select
								id="library-phone-tag-select"
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

						<label className="library-filter-group" htmlFor="library-phone-order-select">
							<span className="library-filter-label">Order</span>
							<select
								id="library-phone-order-select"
								className="library-select"
								value={sortOrder}
								onChange={(event) => setSortOrder(event.target.value as MediaSortOrder)}
							>
								{SORT_OPTIONS.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
						</label>
					</div>

					<div className="library-stat-block phone-library-stat-block" aria-live="polite">
						<div className="phone-library-stat-summary">
							<span className="library-stat-value">{filteredItems.length.toLocaleString()}</span>
							<span className="library-stat-label">Titles shown</span>
						</div>
						<div className="phone-library-stat-actions">
							{activeSearch || tagFilter ? (
								<button
									type="button"
									className="library-clear-button"
									onClick={handleClearSearch}
								>
									Clear Filters
								</button>
							) : null}
							<button
								type="button"
								className="library-clear-button"
								onClick={handleResetFilters}
							>
								Reset
							</button>
						</div>
					</div>
				</section>

				{error ? <p className="error-text library-feedback">{error}</p> : null}
				{loading ? <p className="muted library-feedback">Loading media library...</p> : null}

				<section className="browse-section library-results phone-library-results">
					<div className="section-heading-row">
						<h2 className="section-title">All Media</h2>
						<p className="section-subtitle">{activeSearchLabel}</p>
					</div>

					{filteredItems.length > 0 ? (
						<div
							className={
								useCompactResultsGrid
									? 'library-grid is-compact phone-library-grid'
									: 'library-grid phone-library-grid'
							}
						>
							{filteredItems.map((item) => {
								const downloadProgressPercent = downloadProgressMap.get(item.id);
								const watchedProgressPercent = toProgressPercent(progressMap.get(item.id));

								return (
									<MediaTile
										key={item.id}
										media={item}
										imageUrl={artworkUrlForMedia(item)}
										progressPercent={downloadProgressPercent ?? watchedProgressPercent}
										progressKind={downloadProgressPercent !== undefined ? 'download' : 'watch'}
										layout="library"
										onOpen={openDetails}
									/>
								);
							})}
						</div>
					) : (
						<article className="library-empty">
							<h2>No titles match this filter</h2>
							<p>Try switching media type, tag, or order.</p>
							<div className="library-empty-actions">
								<button
									type="button"
									className="ghost-button"
									onClick={handleResetFilters}
								>
									Reset Filters
								</button>
								{activeSearch || tagFilter ? (
									<button
										type="button"
										className="ghost-button"
										onClick={handleClearSearch}
									>
										Clear Filters
									</button>
								) : null}
							</div>
						</article>
					)}
				</section>

				{activeSearch ? (
					<section className="browse-section library-results library-remote-results phone-library-results">
						<div className="section-heading-row">
							<h2 className="section-title">Outside Your Library</h2>
							<p className="section-subtitle">
								Matching titles from TMDB and Jikan that are not indexed locally.
							</p>
						</div>

						{remoteError ? <p className="error-text library-feedback">{remoteError}</p> : null}
						{remoteLoading ? (
							<p className="muted library-feedback">Searching external media catalogs...</p>
						) : null}

						{!remoteLoading && !remoteError && remoteItems.length > 0 ? (
							<div
								className={
									useCompactRemoteGrid
										? 'library-grid is-compact phone-library-grid'
										: 'library-grid phone-library-grid'
								}
							>
								{remoteItems.map((item) => (
									<MediaTile
										key={item.id}
										media={item}
										imageUrl={artworkUrlForMedia(item)}
										layout="library"
										onOpen={openDetails}
									/>
								))}
							</div>
						) : null}

						{!remoteLoading && !remoteError && remoteItems.length === 0 ? (
							<article className="library-empty library-empty-remote">
								<h2>No external matches yet</h2>
								<p>Try a broader title or fewer filters to discover media outside your local index.</p>
							</article>
						) : null}
					</section>
				) : null}
			</main>
		</PhonePageShell>
	);
}
