import { TvPageShell } from '../../navigation/components/TvPageShell';
import {
  SystemSettingsPage,
  type SystemSettingsPageProps,
} from './SystemSettingsPage';

export function SystemSettingsPageTv(props: SystemSettingsPageProps) {
  return (
    <TvPageShell pageKey="system-settings">
      <SystemSettingsPage {...props} experience="tv" />
    </TvPageShell>
  );
}
