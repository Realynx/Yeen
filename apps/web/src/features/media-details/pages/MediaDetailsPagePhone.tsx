import { useCallback, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { MediaDetailsPage } from './MediaDetailsPage';
import { toLibrarySearchPath } from '../../library/services/librarySearchUtils';
import type { User } from '../../shared/services/types';
import { PhonePageHeader } from '../../navigation/components/PhonePageHeader';
import { PhonePageShell } from '../../navigation/components/PhonePageShell';
import { useSafeBackNavigation } from '../../navigation/services/safeBackNavigation';

interface MediaDetailsPagePhoneProps {
	token: string;
	user: User;
	onLogout: () => void;
}

export function MediaDetailsPagePhone({ token, user, onLogout }: MediaDetailsPagePhoneProps) {
	const navigate = useNavigate();
	const navigateBackSafely = useSafeBackNavigation('/library');
	const [query, setQuery] = useState('');

	const handleSearchSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		navigate(toLibrarySearchPath(query));
	}, [navigate, query]);

	const handleBackNavigation = useCallback(() => {
		navigateBackSafely();
	}, [navigateBackSafely]);

	return (
		<PhonePageShell pageKey="details">
			<MediaDetailsPage
				token={token}
				user={user}
				onLogout={onLogout}
				hideTopNav
				headerContent={(
					<PhonePageHeader
						user={user}
						onLogout={onLogout}
						query={query}
						onQueryChange={setQuery}
						onSearchSubmit={handleSearchSubmit}
						leadingAction={(
							<button
								type="button"
								className="phone-details-back-button"
								onClick={handleBackNavigation}
								aria-label="Go back"
							>
								<span aria-hidden="true">←</span>
								Back
							</button>
						)}
					/>
				)}
			/>
		</PhonePageShell>
	);
}
