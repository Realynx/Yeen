import { NavLink } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function MediaHomeButton({ compact = false }: { compact?: boolean }) {
  return (
    <Button
      asChild
      size="sm"
      variant="outline"
      className={compact
        ? 'phone-details-back-button phone-media-home-button shrink-0'
        : 'media-home-button shrink-0'}
    >
      <NavLink
        to="/"
        aria-label="Media Home"
        title="Media Home"
        data-tv-focus-key="navigation:media-home"
      >
        {compact ? 'Home' : 'Media Home'}
      </NavLink>
    </Button>
  );
}
