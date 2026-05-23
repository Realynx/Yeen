import type { PropsWithChildren } from 'react';
import { PhoneBottomNav } from './PhoneBottomNav';

interface PhonePageShellProps {
  pageKey: string;
  showBottomNav?: boolean;
}

export function PhonePageShell({
  pageKey,
  showBottomNav = true,
  children,
}: PropsWithChildren<PhonePageShellProps>) {
  const shellClassName = showBottomNav
    ? `phone-page-shell phone-page-shell-${pageKey} phone-page-shell-with-bottom-nav`
    : `phone-page-shell phone-page-shell-${pageKey}`;

  return (
    <div className={shellClassName}>
      {children}
      {showBottomNav ? <PhoneBottomNav /> : null}
    </div>
  );
}