import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { TorrentControlPanel } from '../components/TorrentControlPanel';
import { listMedia } from '../../shared/services/api';
import { canAccessTorrentTools, isAdminRole } from '../../auth/services/roles';
import type { MediaItem, User } from '../../shared/services/types';
import {
	LIBRARY_SEARCH_QUERY_PARAM,
	normalizeLibrarySearchTerm,
	pickRandomItem,
	toLibrarySearchPath,
	toRandomDetailsCandidates,
} from '../../library/services/librarySearchUtils';
import { useSystemSettings } from '../services/useSystemSettings';
import { PhonePageHeader } from '../../navigation/components/PhonePageHeader';
import { PhonePageShell } from '../../navigation/components/PhonePageShell';
import './settingsStyles';

interface DownloadControlPagePhoneProps {
	token: string;
	user: User;
	onLogout: () => void;
}

interface SearchDraftState {
	routeTerm: string;
	draft: string;
}

export function DownloadControlPagePhone({
	token,
	user,
	onLogout,
}: DownloadControlPagePhoneProps) {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const routeSearchTerm = normalizeLibrarySearchTerm(
		searchParams.get(LIBRARY_SEARCH_QUERY_PARAM),
	);

	const [searchDraftState, setSearchDraftState] = useState<SearchDraftState>(() => ({
		routeTerm: routeSearchTerm,
		draft: routeSearchTerm,
	}));
	const [randomDetailsCandidates, setRandomDetailsCandidates] = useState<MediaItem[]>([]);

	const isAdmin = isAdminRole(user.role);
	const hasTorrentAccess = canAccessTorrentTools(user.role);
	const systemSettingsState = useSystemSettings(token, isAdmin);

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

	useEffect(() => {
		let cancelled = false;

		async function loadRandomDetailsCandidates() {
			try {
				const mediaItems = await listMedia(token);
				if (cancelled) {
					return;
				}

				setRandomDetailsCandidates(toRandomDetailsCandidates(mediaItems));
			} catch {
				if (!cancelled) {
					setRandomDetailsCandidates([]);
				}
			}
		}

		void loadRandomDetailsCandidates();

		return () => {
			cancelled = true;
		};
	}, [token]);

	const openRandomDetails = useCallback(async () => {
		let randomCandidate = pickRandomItem(randomDetailsCandidates);

		if (!randomCandidate) {
			try {
				const mediaItems = await listMedia(token);
				const refreshedCandidates = toRandomDetailsCandidates(mediaItems);
				setRandomDetailsCandidates(refreshedCandidates);
				randomCandidate = pickRandomItem(refreshedCandidates);
			} catch {
				return;
			}
		}

		if (randomCandidate) {
			navigate(`/details/${randomCandidate.id}`);
		}
	}, [navigate, randomDetailsCandidates, token]);

	function handleSearch(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		navigate(toLibrarySearchPath(query));
	}

	if (!hasTorrentAccess) {
		return <Navigate to="/" replace />;
	}

	const defaultOrderMode =
		systemSettingsState.systemSettings?.qbittorrentDefaultOrderMode ?? 'random';

	return (
		<PhonePageShell pageKey="download-control">
			<main className="browse-page admin-page settings-page-v2 phone-download-control-page">
				<PhonePageHeader
					user={user}
					onLogout={onLogout}
					query={query}
					onQueryChange={setQuery}
					onSearchSubmit={handleSearch}
					onOpenRandomDetails={openRandomDetails}
					randomDisabled={randomDetailsCandidates.length === 0}
				/>

				<section className="settings-content-grid">
					{systemSettingsState.systemError ? (
						<p className="error-text">{systemSettingsState.systemError}</p>
					) : null}

					<TorrentControlPanel token={token} defaultOrderMode={defaultOrderMode} />
				</section>
			</main>
		</PhonePageShell>
	);
}
