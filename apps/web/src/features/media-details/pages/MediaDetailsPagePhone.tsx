import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { MediaDetailsPage } from './MediaDetailsPage';
import { toLibrarySearchPath } from '../../library/services/librarySearchUtils';
import type { User } from '../../shared/services/types';
import '../../media-management/metadataStyles';
import { PhonePageHeader } from '../../navigation/components/PhonePageHeader';
import { PhonePageShell } from '../../navigation/components/PhonePageShell';

interface MediaDetailsPagePhoneProps {
	token: string;
	user: User;
	onLogout: () => void;
}

export function MediaDetailsPagePhone({ token, user, onLogout }: MediaDetailsPagePhoneProps) {
	const navigate = useNavigate();
	const [query, setQuery] = useState('');

	const handleSearchSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		navigate(toLibrarySearchPath(query));
	}, [navigate, query]);

	const handleBackNavigation = useCallback(() => {
		if (window.history.length > 1) {
			navigate(-1);
			return;
		}

		navigate('/library');
	}, [navigate]);

	return (
		<PhonePageShell pageKey="details">
			<MediaDetailsPage
				token={token}
				user={user}
				onLogout={onLogout}
				hideTopNav
				usePhoneTorrentPopover
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
