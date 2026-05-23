import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { MediaTile } from '../../components/MediaTile';
import { searchRemoteMedia, toApiErrorMessage } from '../../lib/api';
import type { MediaItem, User } from '../../lib/types';
import { pickRandomItem, toLibrarySearchPath } from '../librarySearchUtils';
import { artworkUrlForMedia } from '../mediaLibraryUtils';
import {
	defaultTagForMode,
	EXPECTED_TAGS_BY_MODE,
	providerLabelForMode,
	QUICK_TAGS_BY_MODE,
	type ExploreCatalogMode,
	type ExploreTypeFilter,
} from '../media-explore/exploreCatalog';
import {
	getExploreTypeCounts,
	getFilteredExploreItems,
	shouldUseCompactExploreGrid,
} from '../media-explore/exploreGrid';
import {
	readExploreSessionState,
	writeExploreSessionState,
	type ExploreSessionState,
} from '../media-explore/exploreSessionState';
import { PhonePageHeader } from './PhonePageHeader';
import { PhonePageShell } from './PhonePageShell';

interface MediaExplorePagePhoneProps {
	token: string;
	user: User;
	onLogout: () => void;
}

const REMOTE_PAGE_SIZE = 20;

export function MediaExplorePagePhone({ token, user, onLogout }: MediaExplorePagePhoneProps) {
	const navigate = useNavigate();

	const restoredSessionState = useMemo(() => readExploreSessionState(), []);
	const initialCatalogMode = restoredSessionState?.catalogMode ?? 'non-anime';
	const initialTagFilter = restoredSessionState?.tagFilter ?? defaultTagForMode(initialCatalogMode);
	const initialTypeFilter = restoredSessionState?.typeFilter ?? 'all';
	const initialPage = restoredSessionState?.page ?? 1;
	const initialHasMore = restoredSessionState?.hasMore ?? true;
	const initialRemoteItems = restoredSessionState?.remoteItems ?? [];

	const [catalogMode, setCatalogMode] = useState<ExploreCatalogMode>(initialCatalogMode);
	const [tagFilter, setTagFilter] = useState(initialTagFilter);
	const [typeFilter, setTypeFilter] = useState<ExploreTypeFilter>(initialTypeFilter);
	const [remoteItems, setRemoteItems] = useState<MediaItem[]>(initialRemoteItems);
	const [page, setPage] = useState(initialPage);
	const [hasMore, setHasMore] = useState(initialHasMore);
	const [loading, setLoading] = useState(
		initialTagFilter.trim().length >= 2 && initialPage <= 1,
	);
	const [loadingMore, setLoadingMore] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [query, setQuery] = useState('');

	const activeProviders = useMemo<Array<'tmdb' | 'jikan'>>(
		() => (catalogMode === 'anime' ? ['jikan'] : ['tmdb']),
		[catalogMode],
	);

	const openDetails = useCallback(
		(mediaId: string) => {
			navigate(`/details/${mediaId}`);
		},
		[navigate],
	);

	const resetExploreForTag = useCallback((nextTag: string) => {
		const cleanedTag = nextTag.trim();

		setPage(1);
		setHasMore(cleanedTag.length >= 2);
		setRemoteItems([]);
		setError(null);
		setLoading(cleanedTag.length >= 2);
		setLoadingMore(false);
	}, []);

	useEffect(() => {
		let cancelled = false;

		async function loadRemoteItems() {
			const selectedTag = tagFilter.trim();
			if (selectedTag.length < 2) {
				setRemoteItems([]);
				setHasMore(false);
				setLoading(false);
				setLoadingMore(false);
				setError(null);
				return;
			}

			if (page <= 1) {
				setLoading(true);
				setError(null);
			} else {
				setLoading(false);
				setLoadingMore(true);
			}

			try {
				const payload = await searchRemoteMedia(
					token,
					'',
					REMOTE_PAGE_SIZE,
					activeProviders,
					[selectedTag],
					true,
					page,
				);

				if (cancelled) {
					return;
				}

				setHasMore(payload.hasMore);
				setRemoteItems((previous) => {
					if (page <= 1) {
						return payload.items;
					}

					if (payload.items.length === 0) {
						return previous;
					}

					const dedupedById = new Map<string, MediaItem>();
					for (const item of previous) {
						dedupedById.set(item.id, item);
					}

					for (const item of payload.items) {
						dedupedById.set(item.id, item);
					}

					return [...dedupedById.values()];
				});
			} catch (loadError) {
				if (cancelled) {
					return;
				}

				if (page <= 1) {
					setRemoteItems([]);
				}

				setHasMore(false);
				setError(toApiErrorMessage(loadError, 'Failed to search remote media catalogs.'));
			} finally {
				if (!cancelled) {
					if (page <= 1) {
						setLoading(false);
					} else {
						setLoading(false);
						setLoadingMore(false);
					}
				}
			}
		}

		void loadRemoteItems();

		return () => {
			cancelled = true;
		};
	}, [activeProviders, page, tagFilter, token]);

	useEffect(() => {
		const snapshot: ExploreSessionState = {
			catalogMode,
			tagFilter,
			typeFilter,
			page,
			hasMore,
			remoteItems,
			scrollTop: 0,
		};

		writeExploreSessionState(snapshot);
	}, [catalogMode, hasMore, page, remoteItems, tagFilter, typeFilter]);

	const selectableTags = useMemo(() => {
		return [...EXPECTED_TAGS_BY_MODE[catalogMode]];
	}, [catalogMode]);

	const typeCounts = useMemo(() => {
		return getExploreTypeCounts(remoteItems);
	}, [remoteItems]);

	const filteredItems = useMemo(() => {
		return getFilteredExploreItems(remoteItems, typeFilter);
	}, [remoteItems, typeFilter]);

	const randomDetailsCandidates = useMemo(
		() => filteredItems,
		[filteredItems],
	);

	const useCompactResultsGrid = shouldUseCompactExploreGrid(filteredItems);

	const sectionTitle =
		catalogMode === 'anime' ? 'Anime Explorer' : 'Movie & TV Explorer';

	const sectionSubtitle = tagFilter
		? `Showing results from ${providerLabelForMode(catalogMode)} tagged "${tagFilter}".`
		: `Choose a tag to browse ${providerLabelForMode(catalogMode)} titles.`;

	function handleModeChange(nextMode: ExploreCatalogMode) {
		if (nextMode === catalogMode) {
			return;
		}

		const nextTag = QUICK_TAGS_BY_MODE[nextMode][0] ?? '';
		setCatalogMode(nextMode);
		setTypeFilter('all');
		setTagFilter(nextTag);
		resetExploreForTag(nextTag);
	}

	function handleTagSelect(nextTag: string) {
		setTagFilter(nextTag);
		setTypeFilter('all');
		resetExploreForTag(nextTag);
	}

	function handleClearTag() {
		setTagFilter('');
		setTypeFilter('all');
		resetExploreForTag('');
	}

	function resetExploreFilters() {
		const nextTag = QUICK_TAGS_BY_MODE[catalogMode][0] ?? '';
		setTypeFilter('all');
		setTagFilter(nextTag);
		resetExploreForTag(nextTag);
	}

	function handleSearch(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		navigate(toLibrarySearchPath(query));
	}

	const openRandomDetails = useCallback(() => {
		const randomCandidate = pickRandomItem(randomDetailsCandidates);
		if (!randomCandidate) {
			return;
		}

		openDetails(randomCandidate.id);
	}, [openDetails, randomDetailsCandidates]);

	return (
		<PhonePageShell pageKey="explore">
			<main className="browse-page media-library-page media-explore-page phone-explore-page">
				<PhonePageHeader
					user={user}
					onLogout={onLogout}
					query={query}
					onQueryChange={setQuery}
					onSearchSubmit={handleSearch}
					onOpenRandomDetails={openRandomDetails}
					randomDisabled={randomDetailsCandidates.length === 0}
				/>

				<section className="library-toolbar phone-explore-toolbar" aria-label="Explore controls">
					<div className="library-filters">
						<div className="library-filter-group phone-explore-catalog-group">
							<p className="library-filter-label">Catalog</p>
							<div className="library-chip-row" role="group" aria-label="Select catalog type">
								<button
									type="button"
									className={
										catalogMode === 'non-anime' ? 'library-chip is-active' : 'library-chip'
									}
									onClick={() => handleModeChange('non-anime')}
								>
									Non-Anime
								</button>
								<button
									type="button"
									className={catalogMode === 'anime' ? 'library-chip is-active' : 'library-chip'}
									onClick={() => handleModeChange('anime')}
								>
									Anime
								</button>
							</div>
						</div>

						<div className="library-filter-group phone-explore-type-group">
							<p className="library-filter-label">Type</p>
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

						<label className="library-filter-group" htmlFor="explore-phone-tag-select">
							<span className="library-filter-label">Tag</span>
							<select
								id="explore-phone-tag-select"
								className="library-select"
								value={tagFilter}
								onChange={(event) => handleTagSelect(event.target.value)}
							>
								<option value="">Select Tag</option>
								{selectableTags.map((tag) => (
									<option key={tag.toLowerCase()} value={tag}>
										{tag}
									</option>
								))}
							</select>
						</label>
					</div>

					<div className="library-stat-block phone-explore-stat-block" aria-live="polite">
						<div className="phone-explore-stat-summary">
							<span className="library-stat-value">{filteredItems.length.toLocaleString()}</span>
							<span className="library-stat-label">Titles shown</span>
						</div>
						<div className="phone-explore-stat-actions">
							{tagFilter ? (
								<button
									type="button"
									className="library-clear-button"
									onClick={handleClearTag}
								>
									Clear Tag
								</button>
							) : null}
							<button type="button" className="library-clear-button" onClick={resetExploreFilters}>
								Reset Explore
							</button>
						</div>
					</div>
				</section>

				<section className="library-section phone-explore-results">
					<div className="section-heading-row">
						<h2 className="section-title">{sectionTitle}</h2>
						<p className="section-subtitle">{sectionSubtitle}</p>
					</div>

					{error ? <p className="error-text library-feedback">{error}</p> : null}
					{loading ? <p className="muted library-feedback">Loading remote media results...</p> : null}

					{!loading && !error && filteredItems.length > 0 ? (
						<div
							className={
								useCompactResultsGrid
									? 'library-grid is-compact phone-explore-grid'
									: 'library-grid phone-explore-grid'
							}
						>
							{filteredItems.map((item) => (
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

					{!loading && !error && filteredItems.length === 0 ? (
						<article className="library-empty library-empty-remote">
							<h2>No results yet</h2>
							<p>Pick a tag to explore titles in the selected catalog.</p>
						</article>
					) : null}

					{!loading && !error && filteredItems.length > 0 && hasMore ? (
						<div className="phone-explore-load-more-wrap">
							<button
								type="button"
								className="accent-button phone-load-more-button"
								disabled={loadingMore}
								onClick={() => {
									if (loadingMore) {
										return;
									}

									setPage((previous) => previous + 1);
								}}
							>
								{loadingMore ? 'Loading...' : 'Load More'}
							</button>
						</div>
					) : null}

					{!loading && !error && filteredItems.length > 0 && !hasMore ? (
						<p className="muted library-feedback">Reached the end of this tag catalog.</p>
					) : null}
				</section>
			</main>
		</PhonePageShell>
	);
}
