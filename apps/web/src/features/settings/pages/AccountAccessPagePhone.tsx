import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AdminAccountsPanel } from '../components/AdminAccountsPanel';
import { listMedia } from '../../shared/services/api';
import type { MediaItem, User } from '../../shared/services/types';
import {
	LIBRARY_SEARCH_QUERY_PARAM,
	normalizeLibrarySearchTerm,
	pickRandomItem,
	toLibrarySearchPath,
	toRandomDetailsCandidates,
} from '../../library/services/librarySearchUtils';
import { useAdminAccounts } from '../services/useAdminAccounts';
import { PhonePageHeader } from '../../navigation/components/PhonePageHeader';
import { PhonePageShell } from '../../navigation/components/PhonePageShell';
import { SettingsAppShell } from '../components/SettingsAppShell';

interface AccountAccessPagePhoneProps {
	token: string;
	user: User;
	onLogout: () => void;
}

interface SearchDraftState {
	routeTerm: string;
	draft: string;
}

export function AccountAccessPagePhone({
	token,
	user,
	onLogout,
}: AccountAccessPagePhoneProps) {
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
	const adminAccountsState = useAdminAccounts(token, isAdmin);

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
		<PhonePageShell pageKey="account-access">
			<main className="browse-page admin-page settings-page-v2 admin-accounts-page phone-account-access-page">
				<PhonePageHeader
					user={user}
					onLogout={onLogout}
					query={query}
					onQueryChange={setQuery}
					onSearchSubmit={handleSearch}
					onOpenRandomDetails={openRandomDetails}
					randomDisabled={randomDetailsCandidates.length === 0}
				/>

				<SettingsAppShell
					user={user}
					experience="phone"
					title="Accounts & access"
					description="Manage Account Roles, invitations, limits, and activity."
				>
					<AdminAccountsPanel adminAccountsState={adminAccountsState} />
				</SettingsAppShell>
			</main>
		</PhonePageShell>
	);
}
