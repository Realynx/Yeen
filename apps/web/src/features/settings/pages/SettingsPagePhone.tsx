import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { UserSettingsTab } from '../components/UserSettingsTab';
import { listMedia } from '../../shared/services/api';
import type { MediaItem, User } from '../../shared/services/types';
import {
	LIBRARY_SEARCH_QUERY_PARAM,
	normalizeLibrarySearchTerm,
	pickRandomItem,
	toLibrarySearchPath,
	toRandomDetailsCandidates,
} from '../../library/services/librarySearchUtils';
import { PhonePageHeader } from '../../navigation/components/PhonePageHeader';
import { PhonePageShell } from '../../navigation/components/PhonePageShell';

interface SettingsPagePhoneProps {
	token: string;
	user: User;
	onUserUpdated: (user: User) => void;
	onLogout: () => void;
}

interface SearchDraftState {
	routeTerm: string;
	draft: string;
}

export function SettingsPagePhone({
	token,
	user,
	onUserUpdated,
	onLogout,
}: SettingsPagePhoneProps) {
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

	return (
		<PhonePageShell pageKey="settings">
			<main className="browse-page admin-page settings-page-v2 phone-settings-page">
				<PhonePageHeader
					user={user}
					onLogout={onLogout}
					query={query}
					onQueryChange={setQuery}
					onSearchSubmit={handleSearch}
					onOpenRandomDetails={openRandomDetails}
					randomDisabled={randomDetailsCandidates.length === 0}
				/>

				<UserSettingsTab
					token={token}
					user={user}
					onUserUpdated={onUserUpdated}
				/>
			</main>
		</PhonePageShell>
	);
}
