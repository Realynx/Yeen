import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AdminManagedAccount } from '../../shared/services/types';
import { AdminAccountsManageCard } from './AdminAccountsManageCard';

const downloaderAccount: AdminManagedAccount = {
  id: 'account-1',
  name: 'Dana Downloader',
  email: 'dana@example.com',
  role: 'sailer',
  avatarDataUrl: null,
  invitesRemaining: 2,
  maxBitrateKbps: null,
  invitedByAccountId: null,
  invitedByName: null,
  createdAt: '2026-08-20T12:00:00.000Z',
};

function renderDirectory() {
  return renderToStaticMarkup(
    <AdminAccountsManageCard
      accounts={[downloaderAccount]}
      filteredAccounts={[downloaderAccount]}
      loadingAccounts={false}
      accountQuery=""
      roleFilter="all"
      adminCount={1}
      activityByAccount={new Map()}
      selectedAccount={null}
      selectedIsLastAdmin={false}
      selectedLastActiveLabel="No activity recorded yet"
      editName=""
      editEmail=""
      editRole="user"
      editInvites="0"
      editMaxBitrate=""
      resetPasswordDraft=""
      updatingAccountId={null}
      editorNotice={null}
      accountsMessage={null}
      accountsError={null}
      onAccountQueryChange={vi.fn()}
      onRoleFilterChange={vi.fn()}
      onOpenAccountEditor={vi.fn()}
      onOpenCreateAccount={vi.fn()}
      onRefreshAccounts={vi.fn(async () => undefined)}
      onCloseAccountEditor={vi.fn()}
      onEditNameChange={vi.fn()}
      onEditEmailChange={vi.fn()}
      onEditRoleChange={vi.fn()}
      onEditInvitesChange={vi.fn()}
      onEditMaxBitrateChange={vi.fn()}
      onResetPasswordDraftChange={vi.fn()}
      onSaveAccountEdits={vi.fn()}
      onResetPassword={vi.fn()}
    />,
  );
}

describe('AdminAccountsManageCard', () => {
  it('exposes clear create, refresh, and edit actions', () => {
    const markup = renderDirectory();

    expect(markup).toContain('Add Account');
    expect(markup).toContain('Refresh');
    expect(markup).toContain('Edit Account Dana Downloader');
    expect(markup).toContain('>Edit<');
    expect(markup).not.toContain('Double-click');
  });

  it('shows canonical Account role labels instead of persistence codes', () => {
    const markup = renderDirectory();

    expect(markup).toContain('Downloader');
    expect(markup).not.toContain('>sailer<');
  });
});
