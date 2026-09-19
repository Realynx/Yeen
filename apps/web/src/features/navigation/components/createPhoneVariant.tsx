import { createElement, type ComponentType, type JSX } from 'react';
import { PhonePageShell } from './PhonePageShell';

interface PhoneVariantOptions {
  showBottomNav?: boolean;
}

export function createPhoneVariant<TProps extends object>(
  DesktopPage: ComponentType<TProps>,
  pageKey: string,
  options?: PhoneVariantOptions,
): ComponentType<TProps> {
  const showBottomNav = options?.showBottomNav ?? true;

  const PhoneVariant = (props: TProps): JSX.Element => {
    return (
      <PhonePageShell pageKey={pageKey} showBottomNav={showBottomNav}>
        {createElement(DesktopPage, props)}
      </PhonePageShell>
    );
  };

  const displayName = DesktopPage.displayName ?? DesktopPage.name ?? 'Page';
  PhoneVariant.displayName = `${displayName}PhoneVariant`;

  return PhoneVariant;
}
