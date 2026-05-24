import { useCallback, useMemo, useRef, useState } from 'react';
import type { FormEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MediaItem, User } from '../../shared/services/types';
import {
	artworkUrlForMedia as homeArtworkUrlForMedia,
	consolidateShowSearchResults,
	seededHash,
	toFeaturedDedupKey,
	toProgressMap,
	toProgressPercent,
	toRandomizedItems,
	toRepresentativeTimestamp,
	toSeasonEpisodeLabel,
} from '../services/homePageUtils';
import { pickRandomItem, toLibrarySearchPath, toRandomDetailsCandidates } from '../../library/services/librarySearchUtils';
import { PhonePageHeader } from '../../navigation/components/PhonePageHeader';
import { PhonePageShell } from '../../navigation/components/PhonePageShell';
import { HomePhoneFeaturedHero } from '../components/HomePhoneFeaturedHero';
import { HomePhoneScrollShelf } from '../components/HomePhoneScrollShelf';
import {
	buildPhoneTaggedRows,
} from '../services/homePhonePageUtils';
import { usePhoneInstallPrompt } from '../services/usePhoneInstallPrompt';
import { useHomeFeed } from '../services/useHomeFeed';

interface HomePagePhoneProps {
	token: string;
	user: User;
	onLogout: () => void;
}

const FEATURED_SWIPE_THRESHOLD_PX = 44;

type FeaturedPanel =
	| { kind: 'install'; id: 'featured-install-panel' }
	| { kind: 'media'; id: string; item: MediaItem };

export function HomePagePhone({ token, user, onLogout }: HomePagePhoneProps) {
	const navigate = useNavigate();
	const [query, setQuery] = useState('');
	const {
		mediaItems,
		progressItems,
		loading,
		error,
	} = useHomeFeed(token, {
		initialErrorMessage: 'Failed to load your home feed.',
		refreshIntervalMs: 8000,
	});
	const [featuredIndex, setFeaturedIndex] = useState(0);
	const [randomSeed] = useState(() => Math.floor(Math.random() * 2_147_483_647));
	const {
		deferredInstallPrompt,
		installStatusMessage,
		showInstallPanel,
		handleInstallPwa,
	} = usePhoneInstallPrompt();
	const featuredSwipeStateRef = useRef<{ pointerId: number; startX: number } | null>(null);

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

	const progressMap = useMemo(() => toProgressMap(progressItems), [progressItems]);

	const catalogItems = useMemo(() => {
		return consolidateShowSearchResults(mediaItems).filter((item) => item.digitalMediaType === 'video');
	}, [mediaItems]);

	const continueWatching = useMemo(() => {
		return catalogItems
			.map((item) => {
				const progress = progressMap.get(item.id);
				const percent = toProgressPercent(progress);
				if (!progress || progress.completed || typeof percent !== 'number') {
					return null;
				}

				const updatedAtMs = Date.parse(progress.updatedAt);
				return {
					item,
					percent,
					lastWatchedAt: Number.isFinite(updatedAtMs) ? updatedAtMs : 0,
				};
			})
			.filter(
				(
					entry,
				): entry is { item: MediaItem; percent: number; lastWatchedAt: number } => entry !== null,
			)
			.sort((left, right) => {
				if (right.lastWatchedAt !== left.lastWatchedAt) {
					return right.lastWatchedAt - left.lastWatchedAt;
				}

				return left.item.title.localeCompare(right.item.title, undefined, {
					sensitivity: 'base',
				});
			})
			.slice(0, 8);
	}, [catalogItems, progressMap]);

	const featuredItems = useMemo(() => {
		const featured: MediaItem[] = [];
		const seenFeaturedKeys = new Set<string>();

		const randomizedCatalog = toRandomizedItems(
			catalogItems,
			randomSeed ^ 0x51ed270b,
		);

		for (const item of randomizedCatalog) {
			const dedupeKey = toFeaturedDedupKey(item);
			if (seenFeaturedKeys.has(dedupeKey)) {
				continue;
			}

			seenFeaturedKeys.add(dedupeKey);
			featured.push(item);

			if (featured.length >= 5) {
				break;
			}
		}

		return featured;
	}, [catalogItems, randomSeed]);

	const featuredPanels = useMemo(() => {
		const panels: FeaturedPanel[] = showInstallPanel
			? [{ kind: 'install', id: 'featured-install-panel' }]
			: [];

		for (const item of featuredItems) {
			panels.push({
				kind: 'media',
				id: item.id,
				item,
			});
		}

		return panels;
	}, [featuredItems, showInstallPanel]);

	const activeFeaturedIndex = featuredPanels.length > 0
		? ((featuredIndex % featuredPanels.length) + featuredPanels.length) % featuredPanels.length
		: 0;

	const activeFeaturedPanel = featuredPanels[activeFeaturedIndex] ?? null;

	const handleFeaturedPointerDown = useCallback(
		(event: ReactPointerEvent<HTMLElement>) => {
			if (featuredPanels.length <= 1) {
				return;
			}

			if (event.pointerType === 'mouse' && event.button !== 0) {
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
				return ((nextIndex % featuredPanels.length) + featuredPanels.length) % featuredPanels.length;
			});
		},
		[featuredPanels.length],
	);

	const handleFeaturedPointerCancel = useCallback((event: ReactPointerEvent<HTMLElement>) => {
		const swipeState = featuredSwipeStateRef.current;
		if (!swipeState || swipeState.pointerId !== event.pointerId) {
			return;
		}

		featuredSwipeStateRef.current = null;

		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
	}, []);

	const featuredItem = activeFeaturedPanel?.kind === 'media' ? activeFeaturedPanel.item : null;

	const featuredDescription = useMemo(() => {
		if (!featuredItem) {
			return 'Scan your library to populate your featured queue.';
		}

		if (featuredItem.description?.trim()) {
			return featuredItem.description;
		}

		return `Ready to stream from ${featuredItem.relativePath}`;
	}, [featuredItem]);

	const recentItems = useMemo(() => {
		return [...catalogItems]
			.sort((left, right) => {
				const timestampDelta = toRepresentativeTimestamp(right) - toRepresentativeTimestamp(left);
				if (timestampDelta !== 0) {
					return timestampDelta;
				}

				return left.title.localeCompare(right.title, undefined, {
					sensitivity: 'base',
				});
			})
			.slice(0, 12);
	}, [catalogItems]);

	const discoverItems = useMemo(() => {
		return toRandomizedItems(catalogItems, seededHash(`${randomSeed}:discover`)).slice(0, 12);
	}, [catalogItems, randomSeed]);

	const taggedRows = useMemo(() => {
		return buildPhoneTaggedRows(mediaItems, randomSeed);
	}, [mediaItems, randomSeed]);

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

	const featuredProgress = featuredItem ? progressMap.get(featuredItem.id) : undefined;
	const featuredPercent = toProgressPercent(featuredProgress);
	const featuredProgressLabel = typeof featuredPercent === 'number'
		? `Resume at ${Math.round(featuredPercent)}%`
		: 'Ready to start';
	const featuredBackground = featuredItem ? homeArtworkUrlForMedia(featuredItem) : null;
	const installPanelDescription = deferredInstallPrompt
		? 'Install Yeen for one-tap launch and a cleaner full-screen playback experience.'
		: 'Add Yeen to your home screen from the browser menu for app-style access.';
	const installPanelStatus = installStatusMessage
		?? (deferredInstallPrompt
			? 'Tap Install to add Yeen to your home screen.'
			: 'If no prompt appears, use Add to Home Screen in your browser options.');

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

				{error ? <p className="error-text">{error}</p> : null}
				{loading ? <p className="muted">Loading your home feed...</p> : null}

				<HomePhoneFeaturedHero
					featuredBackground={featuredBackground}
					activeIsInstallPanel={activeFeaturedPanel?.kind === 'install'}
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

				{continueWatching.length > 0 ? (
					<HomePhoneScrollShelf
						title="Continue Watching"
						ariaLabel="Continue watching titles"
						items={continueWatching.map(({ item }) => item)}
						progressMap={progressMap}
						onOpen={openPlayer}
						topRightLabelForItem={toSeasonEpisodeLabel}
					/>
				) : null}

				<HomePhoneScrollShelf
					title="Recently Added"
					ariaLabel="Recently added titles"
					items={recentItems}
					progressMap={progressMap}
					onOpen={openDetails}
				/>

				<HomePhoneScrollShelf
					title="Discover"
					ariaLabel="Discover titles"
					items={discoverItems}
					progressMap={progressMap}
					onOpen={openDetails}
				/>

				{taggedRows.map((row) => (
					<HomePhoneScrollShelf
						key={row.key}
						title={row.label}
						ariaLabel={`${row.label} titles`}
						items={row.items}
						progressMap={progressMap}
						onOpen={openDetails}
					/>
				))}
			</main>
		</PhonePageShell>
	);
}
