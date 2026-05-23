import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { SystemSettingsTab } from '../../components/settings/SystemSettingsTab';
import { listMedia } from '../../lib/api';
import type { MediaItem, User } from '../../lib/types';
import {
	LIBRARY_SEARCH_QUERY_PARAM,
	normalizeLibrarySearchTerm,
	pickRandomItem,
	toLibrarySearchPath,
	toRandomDetailsCandidates,
} from '../librarySearchUtils';
import { useMediaLocations } from '../settings/useMediaLocations';
import { useSystemSettings } from '../settings/useSystemSettings';
import { PhonePageHeader } from './PhonePageHeader';
import { PhonePageShell } from './PhonePageShell';

interface SystemSettingsPagePhoneProps {
	token: string;
	user: User;
	onLogout: () => void;
}

interface SearchDraftState {
	routeTerm: string;
	draft: string;
}

export function SystemSettingsPagePhone({
	token,
	user,
	onLogout,
}: SystemSettingsPagePhoneProps) {
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

	const isAdmin = user.role === 'admin';
	const mediaLocationsState = useMediaLocations(token, isAdmin);
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

	if (!isAdmin) {
		return <Navigate to="/settings" replace />;
	}

	return (
		<PhonePageShell pageKey="system-settings">
			<main className="browse-page admin-page settings-page-v2 phone-system-settings-page">
				<PhonePageHeader
					user={user}
					onLogout={onLogout}
					query={query}
					onQueryChange={setQuery}
					onSearchSubmit={handleSearch}
					onOpenRandomDetails={openRandomDetails}
					randomDisabled={randomDetailsCandidates.length === 0}
				/>

				<SystemSettingsTab
					token={token}
					systemSettingsState={systemSettingsState}
					mediaLocationsState={mediaLocationsState}
					phoneFloatingQuickJumpBar
				/>
			</main>
		</PhonePageShell>
	);
}
