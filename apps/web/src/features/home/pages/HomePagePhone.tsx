import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { MediaTile } from '../../library/components/MediaTile';
import type { MediaItem, User } from '../../shared/services/types';
import {
	artworkUrlForMedia as homeArtworkUrlForMedia,
	MAX_TAG_ROW_ITEMS,
	consolidateShowSearchResults,
	normalizeHomeMovieTagKey,
	normalizeTags,
	seededHash,
	shouldReplaceTagRowRepresentative,
	toFeaturedDedupKey,
	toHomeMovieTagLabel,
	toProgressMap,
	toProgressPercent,
	toRandomizedItems,
	toRepresentativeTimestamp,
	toSeasonEpisodeLabel,
	toTagRowMediaKey,
} from '../services/homePageUtils';
import { pickRandomItem, toLibrarySearchPath, toRandomDetailsCandidates } from '../../library/services/librarySearchUtils';
import { artworkUrlForMedia as libraryArtworkUrlForMedia } from '../../library/services/mediaLibraryUtils';
import { PhonePageHeader } from '../../navigation/components/PhonePageHeader';
import { PhonePageShell } from '../../navigation/components/PhonePageShell';
import { useHomeFeed } from '../services/useHomeFeed';

interface HomePagePhoneProps {
	token: string;
	user: User;
	onLogout: () => void;
}

const FEATURED_SWIPE_THRESHOLD_PX = 44;
const PHONE_TAG_ROW_LIMIT = 6;
const PHONE_MIN_TAG_ROW_ITEMS = 3;

interface BeforeInstallPromptEvent extends Event {
	prompt: () => Promise<void>;
	userChoice: Promise<{
		outcome: 'accepted' | 'dismissed';
		platform: string;
	}>;
}

function isStandaloneDisplayMode(target: Window): boolean {
	const displayModeStandalone = target.matchMedia('(display-mode: standalone)').matches;
	const navigatorWithStandalone = target.navigator as Navigator & { standalone?: boolean };
	return displayModeStandalone || navigatorWithStandalone.standalone === true;
}

function isLikelyPhoneDevice(target: Window): boolean {
	const userAgent = target.navigator.userAgent.toLowerCase();
	const isMobileAgent = /android|iphone|ipad|ipod|mobile/.test(userAgent);
	const coarsePointer = target.matchMedia('(pointer: coarse)').matches;
	return isMobileAgent || coarsePointer;
}

function addMediaQueryChangeListener(query: MediaQueryList, listener: () => void) {
	if (typeof query.addEventListener === 'function') {
		query.addEventListener('change', listener);
		return () => {
			query.removeEventListener('change', listener);
		};
	}

	query.addListener(listener);
	return () => {
		query.removeListener(listener);
	};
}

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
	const [deferredInstallPrompt, setDeferredInstallPrompt] =
		useState<BeforeInstallPromptEvent | null>(null);
	const [installStatusMessage, setInstallStatusMessage] = useState<string | null>(null);
	const [showInstallPanel, setShowInstallPanel] = useState(() => {
		if (typeof window === 'undefined') {
			return false;
		}

		return isLikelyPhoneDevice(window) && !isStandaloneDisplayMode(window);
	});
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

	useEffect(() => {
		if (typeof window === 'undefined') {
			return;
		}

		const displayModeQuery = window.matchMedia('(display-mode: standalone)');

		const syncInstallPanelState = () => {
			const shouldShow = isLikelyPhoneDevice(window) && !isStandaloneDisplayMode(window);
			setShowInstallPanel(shouldShow);
			if (!shouldShow) {
				setDeferredInstallPrompt(null);
				setInstallStatusMessage(null);
			}
		};

		const handleBeforeInstallPrompt = (event: Event) => {
			event.preventDefault();
			setDeferredInstallPrompt(event as BeforeInstallPromptEvent);
			setInstallStatusMessage(null);
			syncInstallPanelState();
		};

		const handleAppInstalled = () => {
			setDeferredInstallPrompt(null);
			setInstallStatusMessage(null);
			syncInstallPanelState();
		};

		syncInstallPanelState();
		window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
		window.addEventListener('appinstalled', handleAppInstalled);
		window.addEventListener('resize', syncInstallPanelState);
		const removeDisplayModeListener = addMediaQueryChangeListener(
			displayModeQuery,
			syncInstallPanelState,
		);

		return () => {
			window.removeEventListener(
				'beforeinstallprompt',
				handleBeforeInstallPrompt as EventListener,
			);
			window.removeEventListener('appinstalled', handleAppInstalled);
			window.removeEventListener('resize', syncInstallPanelState);
			removeDisplayModeListener();
		};
	}, []);

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

	const handleInstallPwa = useCallback(async () => {
		if (deferredInstallPrompt) {
			try {
				await deferredInstallPrompt.prompt();
				const choiceResult = await deferredInstallPrompt.userChoice;

				if (choiceResult.outcome === 'accepted') {
					setInstallStatusMessage('Install started. Launch Yeen from your home screen.');
				} else {
					setInstallStatusMessage('Install dismissed. You can try again anytime.');
				}
			} catch {
				setInstallStatusMessage(
					'Install prompt unavailable. Use your browser menu and tap Add to Home Screen.',
				);
			} finally {
				setDeferredInstallPrompt(null);
			}

			return;
		}

		setInstallStatusMessage('Use your browser menu and tap Add to Home Screen to install Yeen.');
	}, [deferredInstallPrompt]);

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
		const rows = new Map<
			string,
			{
				key: string;
				label: string;
				itemByMediaKey: Map<string, MediaItem>;
			}
		>();

		for (const item of mediaItems) {
			if (item.digitalMediaType !== 'video') {
				continue;
			}

			const tags = normalizeTags(item.tags);
			for (const tag of tags) {
				const key = normalizeHomeMovieTagKey(tag);
				const label = toHomeMovieTagLabel(tag);
				const mediaKey = toTagRowMediaKey(item);
				const existing = rows.get(key);

				if (!existing) {
					rows.set(key, {
						key,
						label,
						itemByMediaKey: new Map<string, MediaItem>([[mediaKey, item]]),
					});
					continue;
				}

				const existingItem = existing.itemByMediaKey.get(mediaKey);
				if (!existingItem) {
					existing.itemByMediaKey.set(mediaKey, item);
					continue;
				}

				if (shouldReplaceTagRowRepresentative(existingItem, item)) {
					existing.itemByMediaKey.set(mediaKey, item);
				}
			}
		}

		const orderedRows = [...rows.values()].sort((left, right) => {
			if (right.itemByMediaKey.size !== left.itemByMediaKey.size) {
				return right.itemByMediaKey.size - left.itemByMediaKey.size;
			}

			return left.label.localeCompare(right.label, undefined, {
				sensitivity: 'base',
			});
		});

		const usedTagRowMediaKeys = new Set<string>();
		const builtRows: Array<{ key: string; label: string; items: MediaItem[] }> = [];

		for (const row of orderedRows) {
			const randomizedItems = toRandomizedItems(
				[...row.itemByMediaKey.values()],
				seededHash(`${randomSeed}:tag:${row.key}`),
			);

			const rowItems: MediaItem[] = [];
			const rowMediaKeys = new Set<string>();
			for (const item of randomizedItems) {
				const mediaKey = toTagRowMediaKey(item);
				if (usedTagRowMediaKeys.has(mediaKey) || rowMediaKeys.has(mediaKey)) {
					continue;
				}

				rowMediaKeys.add(mediaKey);
				rowItems.push(item);

				if (rowItems.length >= MAX_TAG_ROW_ITEMS) {
					break;
				}
			}

			if (rowItems.length < PHONE_MIN_TAG_ROW_ITEMS) {
				continue;
			}

			for (const mediaKey of rowMediaKeys) {
				usedTagRowMediaKeys.add(mediaKey);
			}

			builtRows.push({
				key: row.key,
				label: row.label,
				items: rowItems,
			});

			if (builtRows.length >= PHONE_TAG_ROW_LIMIT) {
				break;
			}
		}

		return builtRows;
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

				<section
					className="phone-featured-hero"
					onPointerDown={handleFeaturedPointerDown}
					onPointerUp={handleFeaturedPointerUp}
					onPointerCancel={handleFeaturedPointerCancel}
					style={
						featuredBackground
							? ({ ['--phone-featured-image' as string]: `url("${featuredBackground}")` })
							: undefined
					}
				>
					<div className="phone-featured-overlay" aria-hidden="true" />

					{activeFeaturedPanel?.kind === 'install' ? (
						<div className="phone-featured-content">
							<p className="eyebrow">Install App</p>
							<h2>Install Yeen on your phone</h2>
							<p className="muted">{installPanelDescription}</p>

							<div className="phone-featured-actions">
								<button
									type="button"
									className="accent-button"
									onClick={() => {
										void handleInstallPwa();
									}}
								>
									{deferredInstallPrompt ? 'Install Yeen' : 'How to Install'}
								</button>
							</div>

							<p className="phone-featured-progress">{installPanelStatus}</p>

							{featuredPanels.length > 1 ? (
								<div className="phone-featured-pagination" role="group" aria-label="Featured items">
									{featuredPanels.map((panel, index) => {
										const isActive = index === activeFeaturedIndex;

										return (
											<button
												key={panel.id}
												type="button"
												className={isActive ? 'phone-featured-dot is-active' : 'phone-featured-dot'}
												onClick={() => setFeaturedIndex(index)}
												aria-label={panel.kind === 'install' ? 'Show install panel' : `Show featured item ${index + 1}`}
												aria-pressed={isActive}
											/>
										);
									})}
								</div>
							) : null}
						</div>
					) : featuredItem ? (
						<div className="phone-featured-content">
							<p className="eyebrow">Featured Pick</p>
							<h2>{featuredItem.title}</h2>
							<p className="muted">{featuredDescription}</p>

							<div className="phone-featured-actions">
								<button
									type="button"
									className="accent-button"
									onClick={() => openPlayer(featuredItem.id)}
								>
									Play
								</button>
								<button
									type="button"
									className="ghost-button"
									onClick={() => openDetails(featuredItem.id)}
								>
									Details
								</button>
							</div>

							<p className="phone-featured-progress">{featuredProgressLabel}</p>

							{featuredPanels.length > 1 ? (
								<div className="phone-featured-pagination" role="group" aria-label="Featured items">
									{featuredPanels.map((panel, index) => {
										const isActive = index === activeFeaturedIndex;

										return (
											<button
												key={panel.id}
												type="button"
												className={isActive ? 'phone-featured-dot is-active' : 'phone-featured-dot'}
												onClick={() => setFeaturedIndex(index)}
												aria-label={panel.kind === 'install' ? 'Show install panel' : `Show featured item ${index + 1}`}
												aria-pressed={isActive}
											/>
										);
									})}
								</div>
							) : null}
						</div>
					) : (
						<div className="phone-featured-content">
							<p className="eyebrow">Featured Pick</p>
							<h2>Nothing queued yet</h2>
							<p className="muted">Run a library scan in settings to start surfacing titles here.</p>
						</div>
					)}
				</section>

				{continueWatching.length > 0 ? (
					<section className="browse-section phone-home-section">
						<div className="section-heading-row">
							<h2 className="section-title">Continue Watching</h2>
						</div>

						<div className="phone-home-scroll-row" role="list" aria-label="Continue watching titles">
							{continueWatching.map(({ item, percent }) => (
									<div key={item.id} className="phone-home-scroll-item" role="listitem">
										<MediaTile
											media={item}
											imageUrl={libraryArtworkUrlForMedia(item)}
											progressPercent={percent}
											topRightLabel={toSeasonEpisodeLabel(item)}
											layout="library"
											onOpen={openPlayer}
										/>
									</div>
							))}
						</div>
					</section>
				) : null}

				<section className="browse-section phone-home-section">
					<div className="section-heading-row">
						<h2 className="section-title">Recently Added</h2>
					</div>

					<div className="phone-home-scroll-row" role="list" aria-label="Recently added titles">
						{recentItems.map((item) => (
								<div key={item.id} className="phone-home-scroll-item" role="listitem">
									<MediaTile
										media={item}
										imageUrl={libraryArtworkUrlForMedia(item)}
										progressPercent={toProgressPercent(progressMap.get(item.id))}
										layout="library"
										onOpen={openDetails}
									/>
								</div>
						))}
					</div>
				</section>

				<section className="browse-section phone-home-section">
					<div className="section-heading-row">
						<h2 className="section-title">Discover</h2>
					</div>

					<div className="phone-home-scroll-row" role="list" aria-label="Discover titles">
						{discoverItems.map((item) => (
								<div key={item.id} className="phone-home-scroll-item" role="listitem">
									<MediaTile
										media={item}
										imageUrl={libraryArtworkUrlForMedia(item)}
										progressPercent={toProgressPercent(progressMap.get(item.id))}
										layout="library"
										onOpen={openDetails}
									/>
								</div>
						))}
					</div>
				</section>

				{taggedRows.map((row) => (
					<section key={row.key} className="browse-section phone-home-section">
						<div className="section-heading-row">
							<h2 className="section-title">{row.label}</h2>
						</div>

						<div className="phone-home-scroll-row" role="list" aria-label={`${row.label} titles`}>
							{row.items.map((item) => (
								<div key={item.id} className="phone-home-scroll-item" role="listitem">
									<MediaTile
										media={item}
										imageUrl={libraryArtworkUrlForMedia(item)}
										progressPercent={toProgressPercent(progressMap.get(item.id))}
										layout="library"
										onOpen={openDetails}
									/>
								</div>
							))}
						</div>
					</section>
				))}
			</main>
		</PhonePageShell>
	);
}
