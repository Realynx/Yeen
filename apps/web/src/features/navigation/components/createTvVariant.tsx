import { createElement } from 'react';
import type { ComponentType, JSX } from 'react';
import { TvPageShell } from './TvPageShell';

interface TvVariantOptions {
  autoFocusFirst?: boolean;
}

export function createTvVariant<TProps extends object>(
  DesktopPage: ComponentType<TProps>,
  pageKey: string,
  options?: TvVariantOptions,
): ComponentType<TProps> {
  const autoFocusFirst = options?.autoFocusFirst ?? true;

  const TvVariant = (props: TProps): JSX.Element => {
    return (
      <TvPageShell pageKey={pageKey} autoFocusFirst={autoFocusFirst}>
        {createElement(DesktopPage, props)}
      </TvPageShell>
    );
  };

  const displayName = DesktopPage.displayName ?? DesktopPage.name ?? 'Page';
  TvVariant.displayName = `${displayName}TvVariant`;

  return TvVariant;
}
