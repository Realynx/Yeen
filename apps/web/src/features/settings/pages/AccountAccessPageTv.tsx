import { TvPageShell } from '../../navigation/components/TvPageShell';
import {
  AccountAccessPage,
  type AccountAccessPageProps,
} from './AccountAccessPage';

export function AccountAccessPageTv(props: AccountAccessPageProps) {
  return (
    <TvPageShell pageKey="accounts">
      <AccountAccessPage {...props} experience="tv" />
    </TvPageShell>
  );
}
