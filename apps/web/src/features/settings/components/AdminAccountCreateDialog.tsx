import { useEffect, useRef, useState, type FormEvent } from 'react';
import { UserPlus, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useDialogLayer } from '../../navigation/hooks/useDialogLayer';
import {
  normalizeBitrateInput,
  normalizeInvitesInput,
  type AccountRole,
} from './adminAccountsViewUtils';

interface AdminAccountCreateDialogProps {
  open: boolean;
  creating: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (input: {
    email: string;
    name: string;
    password: string;
    role?: AccountRole;
    invitesRemaining?: number;
    maxBitrateKbps?: number | null;
  }) => Promise<boolean>;
}

export function AdminAccountCreateDialog({
  open,
  creating,
  error,
  onClose,
  onCreate,
}: AdminAccountCreateDialogProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AccountRole>('user');
  const [invites, setInvites] = useState('0');
  const [maxBitrate, setMaxBitrate] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  useDialogLayer({
    open,
    containerRef: dialogRef,
    onRequestClose: creating ? undefined : onClose,
    initialFocusSelector: 'input[name="account-name"]',
  });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) {
      return;
    }

    setName('');
    setEmail('');
    setPassword('');
    setRole('user');
    setInvites('0');
    setMaxBitrate('');
    setNotice(null);
    setAttempted(false);
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!open) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (normalizedName.length < 2 || !normalizedEmail) {
      setNotice('Enter a display name and email address.');
      return;
    }

    if (password.length < 8) {
      setNotice('Password must be at least 8 characters.');
      return;
    }

    setNotice(null);
    setAttempted(true);
    const created = await onCreate({
      name: normalizedName,
      email: normalizedEmail,
      password,
      role,
      invitesRemaining: role === 'admin' ? 0 : normalizeInvitesInput(invites),
      maxBitrateKbps: normalizeBitrateInput(maxBitrate),
    });

    if (created) {
      onClose();
    }
  }

  return (
    <div
      className="admin-accounts-editor-backdrop"
      onClick={creating ? undefined : onClose}
    >
      <article
        ref={dialogRef}
        className="admin-accounts-editor-card"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-account-create-title"
      >
        <header className="admin-accounts-editor-header">
          <div>
            <p className="settings-section-kicker">Account & Access</p>
            <h3 id="admin-account-create-title">Create Account</h3>
            <p className="admin-accounts-editor-subtitle">
              Add a login identity and choose its access level.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={creating}
            aria-label="Close create account dialog"
          >
            <X aria-hidden="true" />
          </Button>
        </header>

        <Separator />

        <form className="admin-accounts-editor-form" onSubmit={handleSubmit}>
          <Label className="settings-field">
            <span className="settings-field-label">Display Name</span>
            <Input
              name="account-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={2}
              maxLength={64}
              autoComplete="name"
              required
            />
          </Label>

          <Label className="settings-field">
            <span className="settings-field-label">Email</span>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </Label>

          <Label className="settings-field settings-field-wide">
            <span className="settings-field-label">Temporary Password</span>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              required
            />
            <small className="settings-field-hint">At least 8 characters.</small>
          </Label>

          <Label className="settings-field">
            <span className="settings-field-label">Account Role</span>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as AccountRole)}
            >
              <option value="user">Standard Account</option>
              <option value="sailer">Downloader</option>
              <option value="admin">Administrator</option>
            </select>
          </Label>

          <Label className="settings-field">
            <span className="settings-field-label">Invites Remaining</span>
            <Input
              type="number"
              min={0}
              max={100000}
              value={invites}
              onChange={(event) => setInvites(event.target.value)}
              disabled={role === 'admin'}
            />
          </Label>

          <Label className="settings-field settings-field-wide">
            <span className="settings-field-label">Max Transcode Bitrate (kbps)</span>
            <Input
              type="number"
              min={250}
              max={50000}
              value={maxBitrate}
              onChange={(event) => setMaxBitrate(event.target.value)}
              placeholder="Use system default"
            />
          </Label>

          {notice || (attempted && error) ? (
            <Alert variant="destructive" className="settings-field-wide" role="alert">
              <AlertTitle>Account was not created</AlertTitle>
              <AlertDescription>{notice ?? error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="settings-actions-row admin-accounts-editor-actions settings-field-wide">
            <Button type="button" variant="outline" onClick={onClose} disabled={creating}>
              Cancel
            </Button>
            <Button type="submit" disabled={creating}>
              <UserPlus aria-hidden="true" />
              {creating ? 'Creating…' : 'Create Account'}
            </Button>
          </div>
        </form>
      </article>
    </div>
  );
}
