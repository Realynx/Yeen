import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';

interface PhoneNavItem {
  to: string;
  label: string;
  end?: boolean;
  icon: ReactNode;
}

const PHONE_NAV_ITEMS: readonly PhoneNavItem[] = [
  {
    to: '/',
    label: 'Home',
    end: true,
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 11.5L12 4l8 7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7.5 10.8V20h9V10.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: '/library',
    label: 'Library',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="4" y="5" width="16" height="14" rx="2.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 9.5h8M8 13h8M8 16.5h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/explore',
    label: 'Explore',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M15.5 8.5l-2.7 5.3-5.3 2.7 2.7-5.3z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 4.7v2.1M12 17.2v2.1M6.84 6.84l1.48 1.48M15.68 15.68l1.48 1.48M4.7 12h2.1M17.2 12h2.1M6.84 17.16l1.48-1.48M15.68 8.32l1.48-1.48" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
];

export function PhoneBottomNav() {
  return (
    <nav className="phone-bottom-nav" aria-label="Primary">
      {PHONE_NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          className={({ isActive }) =>
            isActive ? 'phone-bottom-nav-link is-active' : 'phone-bottom-nav-link'
          }
          end={item.end}
          to={item.to}
        >
          <span className="phone-bottom-nav-icon" aria-hidden="true">
            {item.icon}
          </span>
          <span className="phone-bottom-nav-label">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}