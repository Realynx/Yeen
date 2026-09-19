import { TvPageShell } from '../../navigation/components/TvPageShell';
import { SettingsPage, type SettingsPageProps } from './SettingsPage';

export function SettingsPageTv(props: SettingsPageProps) {
  return (
    <TvPageShell pageKey="settings">
      <SettingsPage {...props} experience="tv" />
    </TvPageShell>
  );
}
