import { useRef, useState } from 'react';
import { useDialogLayer } from '../../navigation/hooks/useDialogLayer';
import { useCoreUpdate } from '../services/useCoreUpdate';
import type { CoreUpdateStatus } from '../../shared/services/types';

interface CoreUpdatePanelProps { token: string }

function updateApplying(status: CoreUpdateStatus | null): boolean {
  return ['downloading', 'staged', 'draining', 'applying'].includes(status?.phase ?? '');
}

function UpdateHeader({ status }: { status: CoreUpdateStatus | null }) {
  const label = status?.updateAvailable ? 'Update available' : status?.phase === 'up-to-date' ? 'Up to date' : 'Manual check';
  return <header className="addon-card-header"><div><p className="settings-section-kicker">Core Maintenance</p>
    <h2>Yeen updates</h2></div><span className={`settings-pill ${status?.updateAvailable ? 'is-warning' : 'is-safe'}`}>{label}</span></header>;
}

function UpdateNotices({ status, error }: { status: CoreUpdateStatus | null; error: string | null }) {
  return <>
    {status?.message ? <p className="core-update-message" role="status">{status.message}</p> : null}
    {error ? <p className="error-text" role="alert">{error}</p> : null}
    {status?.managedMode === 'docker' && status.operatorCommand ? <div className="core-update-operator-note">
      <strong>Docker-managed installation</strong><span>Pull and recreate the deployment from its host:</span><code>{status.operatorCommand}</code></div> : null}
    {status?.managedMode === 'unsupported' ? <p className="muted">In-app cutover requires the supported Linux systemd service. Release checks remain available.</p> : null}
  </>;
}

function UpdateFacts({ status }: { status: CoreUpdateStatus | null }) {
  return <dl className="addon-facts core-update-facts">
    <div><dt>Installed</dt><dd>{status?.currentVersion ?? 'Loading…'}</dd></div>
    <div><dt>Latest</dt><dd>{status?.latestVersion ?? 'Not checked'}</dd></div>
    <div><dt>Channel</dt><dd>{status?.channel ?? 'Stable'}</dd></div>
    <div><dt>Repository</dt><dd>{status?.repository ?? 'Not configured'}</dd></div>
  </dl>;
}

function UpdateActions({ status, busy, applying, canApply, onCheck, onGraceful, onInstant }: {
  status: CoreUpdateStatus | null; busy: boolean; applying: boolean; canApply: boolean;
  onCheck: () => void; onGraceful: () => void; onInstant: () => void;
}) {
  return <div className="core-update-actions">
    <button className="ghost-button" type="button" onClick={onCheck} disabled={busy || applying || !status?.configured}>
      {status?.phase === 'checking' ? 'Checking…' : 'Check GitHub'}</button>
    <button className="accent-button" type="button" onClick={onGraceful} disabled={!canApply || busy}>
      {status?.phase === 'draining' ? `Waiting for ${status.activePlaybackCount} Playback session(s)…` : 'Update gracefully'}</button>
    <button className="danger-button" type="button" onClick={onInstant} disabled={!canApply || busy}>Update now</button>
  </div>;
}

function UpdateConfirmation({ open, dialogRef, onClose, onConfirm }: {
  open: boolean; dialogRef: React.RefObject<HTMLDivElement | null>; onClose: () => void; onConfirm: () => void;
}) {
  if (!open) return null;
  return <div className="addon-confirm-backdrop" data-yeen-layer-open="true"><div ref={dialogRef}
    className="addon-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="core-update-confirm-title">
    <p className="settings-section-kicker">Interrupt Playback</p><h2 id="core-update-confirm-title">Install the update immediately?</h2>
    <p>The verified release will be handed to the deployment service now. Active Playback will stop; a failed health check automatically restores the previous release.</p>
    <div className="addon-confirm-actions"><button className="ghost-button" type="button" onClick={onClose}>Cancel</button>
      <button className="danger-button core-update-confirm" type="button" onClick={onConfirm}>Update now</button></div></div></div>;
}

export function CoreUpdatePanel({ token }: CoreUpdatePanelProps) {
  const updates = useCoreUpdate(token);
  const [confirmInstant, setConfirmInstant] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useDialogLayer({
    open: confirmInstant,
    containerRef: dialogRef,
    onRequestClose: () => setConfirmInstant(false),
    initialFocusSelector: '.core-update-confirm',
  });

  const status = updates.status;
  const applying = updateApplying(status);
  const canApply = Boolean(
    status?.updateAvailable
    && status.managedMode === 'systemd'
    && !applying,
  );

  return (
    <article className="settings-surface settings-surface-full addon-admin-card core-update-card" data-tv-focus-lane-id="core-update">
      <UpdateHeader status={status} />

      <UpdateFacts status={status} />

      <UpdateNotices status={status} error={updates.error} />

      <UpdateActions status={status} busy={updates.busy} applying={applying} canApply={canApply}
        onCheck={() => void updates.check()} onGraceful={() => void updates.apply('graceful')}
        onInstant={() => setConfirmInstant(true)} />

      <UpdateConfirmation open={confirmInstant} dialogRef={dialogRef}
        onClose={() => setConfirmInstant(false)} onConfirm={() => { setConfirmInstant(false); void updates.apply('instant'); }} />
    </article>
  );
}
