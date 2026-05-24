import { NavLink } from 'react-router-dom';
import { StorageUsageMeter } from '../../library/components/StorageUsageMeter';
import type { MediaStorageSummary } from '../../shared/services/types';

interface HomeFooterProps {
  storageSummary: MediaStorageSummary | null;
  storageSummaryLoading: boolean;
  storageSummaryError: string | null;
}

export function HomeFooter({
  storageSummary,
  storageSummaryLoading,
  storageSummaryError,
}: HomeFooterProps) {
  return (
    <footer className="home-footer" aria-label="Home page footer">
      <div className="home-footer-meta">
        <div className="home-footer-links">
          <NavLink className="home-footer-link" to="/library">
            Library
          </NavLink>
          <NavLink className="home-footer-link" to="/explore">
            Explore
          </NavLink>
          <NavLink className="home-footer-link" to="/settings">
            Settings
          </NavLink>
        </div>
      </div>

      <div className="home-footer-storage">
        <StorageUsageMeter
          className="home-footer-storage-meter"
          summary={storageSummary}
          loading={storageSummaryLoading}
          error={storageSummaryError}
          title="Library Storage"
        />
        <p className="home-footer-copy">Your personal streaming shelf, organized your way.</p>
      </div>
    </footer>
  );
}
