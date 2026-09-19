import {
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import type { InstalledAddon } from '../../shared/services/types';
import { useDialogLayer } from '../../navigation/hooks/useDialogLayer';
import {
  ADDON_PACKAGE_ACCEPT,
  formatPackageSize,
  isZipPackage,
  restartPhaseIsActive,
  signatureStatusLabel,
} from '../services/addonAdminUtils';
import { useAddonCatalog } from '../services/useAddonCatalog';
import { useRuntimeRestart } from '../services/useRuntimeRestart';
import { CoreUpdatePanel } from './CoreUpdatePanel';

interface AddonsAdminPanelProps {
  token: string;
}

type ConfirmationKind = 'allow-unsigned' | 'instant-restart' | null;

function addonStatusLabel(addon: InstalledAddon) {
  if (addon.status === 'failed') {
    return 'Needs attention';
  }

  if (addon.restartRequired || addon.status === 'staged') {
    return 'Restart required';
  }

  return addon.enabled ? 'Enabled' : 'Disabled';
}

function addonVersionLabel(addon: InstalledAddon) {
  if (addon.stagedVersion && addon.stagedVersion !== addon.activeVersion) {
    return `${addon.activeVersion ?? addon.version} → ${addon.stagedVersion}`;
  }

  return addon.activeVersion ?? addon.version;
}

type CatalogState = ReturnType<typeof useAddonCatalog>;
type RestartState = ReturnType<typeof useRuntimeRestart>;

function InstalledAddonRow({ addon, catalog, restartActive }: {
  addon: InstalledAddon; catalog: CatalogState; restartActive: boolean;
}) {
  const updating = catalog.updatingAddonId === addon.id;
  return <li className="installed-addon-card"><div className="installed-addon-main">
    <div className="installed-addon-title-row"><h3>{addon.name}</h3>
      <span className={`addon-state-badge is-${addon.status}`}>{addonStatusLabel(addon)}</span></div>
    <p>{addon.description || 'No package description provided.'}</p>
    <dl className="addon-facts"><div><dt>Version</dt><dd>{addonVersionLabel(addon)}</dd></div>
      <div><dt>Publisher</dt><dd>{addon.publisher || 'Unknown'}</dd></div>
      <div><dt>Trust</dt><dd>{signatureStatusLabel(addon.signatureStatus)}</dd></div>
      <div><dt>Compatibility</dt><dd>{addon.compatible ? 'Compatible' : 'Incompatible'}</dd></div></dl>
    {addon.error ? <p className="error-text">{addon.error}</p> : null}</div>
    <button className={addon.enabled ? 'ghost-button' : 'accent-button'} type="button"
      onClick={() => void catalog.setAddonEnabled(addon.id, !addon.enabled)}
      disabled={!addon.compatible || updating || restartActive}>
      {updating ? 'Updating…' : addon.enabled ? 'Disable' : 'Enable'}</button>
  </li>;
}

function InstalledAddonsCard({ catalog, restartActive }: { catalog: CatalogState; restartActive: boolean }) {
  const empty = catalog.catalog.items.length === 0;
  return <article className="settings-surface settings-surface-full addon-admin-card" data-tv-focus-lane-id="installed-addons">
    <header className="addon-card-header"><div><p className="settings-section-kicker">Installed</p><h2>Installed add-ons</h2></div>
      <button className="ghost-button" type="button" onClick={() => void catalog.refresh()} disabled={catalog.loading}>
        {catalog.loading ? 'Refreshing…' : 'Refresh'}</button></header>
    {catalog.loading && empty ? <p className="muted" role="status">Loading add-ons…</p> : null}
    {!catalog.loading && empty ? <div className="addons-empty-state"><strong>No add-ons installed</strong>
      <span>Upload a signed ZIP package to get started.</span></div>
      : <ul className="installed-addon-list">{catalog.catalog.items.map((addon) =>
        <InstalledAddonRow key={addon.id} addon={addon} catalog={catalog} restartActive={restartActive} />)}</ul>}
  </article>;
}

function RestartCard({ state, restartActive, restartRequired, onInstant }: {
  state: RestartState; restartActive: boolean; restartRequired: boolean; onInstant: () => void;
}) {
  const heading = restartActive ? 'Restart in progress' : restartRequired ? 'Restart required' : 'Restart Yeen';
  const description = restartActive
    ? state.status.message ?? `${state.status.activePlaybackCount} active playback session(s) remaining.`
    : !state.status.supervisedRestartExpected
      ? 'Configure a process supervisor before using automatic restart.'
      : restartRequired ? 'Restart Yeen to activate the staged add-on changes.'
        : 'Use a graceful restart for maintenance, or restart immediately when downtime is acceptable.';
  return <article className="settings-surface settings-surface-full addon-restart-card" data-tv-focus-lane-id="addon-restart">
    <div><p className="settings-section-kicker">Activation & Runtime</p><h2>{heading}</h2><p className="muted">{description}</p></div>
    <div className="addon-restart-actions">
      {restartActive && state.status.mode === 'graceful' ? <button className="ghost-button" type="button"
        onClick={() => void state.cancel()} disabled={state.submitting || state.status.phase === 'restarting'}>Cancel graceful restart</button>
        : <button className="accent-button" type="button" onClick={() => void state.restart('graceful')}
          disabled={state.submitting || state.loading || !state.status.supervisedRestartExpected}>Graceful restart</button>}
      <button className="danger-button addon-instant-restart" type="button" onClick={onInstant}
        disabled={state.submitting || state.status.phase === 'restarting' || !state.status.supervisedRestartExpected}>Restart now</button>
    </div>
  </article>;
}

function AddonConfirmation({ kind, dialogRef, onCancel, onConfirm }: {
  kind: Exclude<ConfirmationKind, null> | null; dialogRef: React.RefObject<HTMLDivElement | null>;
  onCancel: () => void; onConfirm: () => void;
}) {
  if (!kind) return null;
  const allowingUnsigned = kind === 'allow-unsigned';
  return <div className="addon-confirm-backdrop" data-yeen-layer-open="true"><div ref={dialogRef}
    className="addon-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="addon-confirm-title">
    <p className="settings-section-kicker">Confirm elevated risk</p>
    <h2 id="addon-confirm-title">{allowingUnsigned ? 'Allow unsigned add-ons?' : 'Restart Yeen immediately?'}</h2>
    <p>{allowingUnsigned
      ? 'Unsigned code cannot be authenticated and will execute with Yeen server permissions.'
      : 'Active playback will stop immediately. Staged add-on changes will activate when Yeen returns.'}</p>
    <div className="addon-confirm-actions"><button className="ghost-button" type="button" onClick={onCancel}>Cancel</button>
      <button className="danger-button addon-confirm-primary" type="button" onClick={onConfirm}>
        {allowingUnsigned ? 'Allow unsigned packages' : 'Restart now'}</button></div>
  </div></div>;
}

export function AddonsAdminPanel({ token }: AddonsAdminPanelProps) {
  const catalogState = useAddonCatalog(token, true);
  const restartState = useRuntimeRestart(token, true);
  const [selectedPackage, setSelectedPackage] = useState<File | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [confirmationKind, setConfirmationKind] =
    useState<ConfirmationKind>(null);
  const confirmationRef = useRef<HTMLDivElement | null>(null);

  useDialogLayer({
    open: confirmationKind !== null,
    containerRef: confirmationRef,
    onRequestClose: () => setConfirmationKind(null),
    initialFocusSelector: '.addon-confirm-primary',
  });

  function handlePackageSelected(event: ChangeEvent<HTMLInputElement>) {
    const packageFile = event.target.files?.[0] ?? null;
    setSelectionError(null);

    if (packageFile && !isZipPackage(packageFile.name)) {
      setSelectedPackage(null);
      setSelectionError('Choose an add-on package ending in .zip.');
      event.target.value = '';
      return;
    }

    setSelectedPackage(packageFile);
  }

  async function handleInstall(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedPackage) {
      setSelectionError('Choose an add-on ZIP before installing.');
      return;
    }

    const installed = await catalogState.install(selectedPackage);
    if (installed) {
      setSelectedPackage(null);
      const input = event.currentTarget.elements.namedItem('addon-package');
      if (input instanceof HTMLInputElement) {
        input.value = '';
      }
    }
  }

  function handleUnsignedPolicyChange(allowUnsigned: boolean) {
    if (allowUnsigned) {
      setConfirmationKind('allow-unsigned');
      return;
    }

    void catalogState.setAllowUnsigned(false);
  }

  async function confirmRiskyAction() {
    const kind = confirmationKind;
    setConfirmationKind(null);

    if (kind === 'allow-unsigned') {
      await catalogState.setAllowUnsigned(true);
      return;
    }

    if (kind === 'instant-restart') {
      await restartState.restart('instant');
    }
  }

  const restartActive = restartPhaseIsActive(restartState.status.phase);
  const restartRequired =
    catalogState.catalog.restartRequired
    || catalogState.catalog.items.some((item) => item.restartRequired);

  return (
    <section
      className="settings-content-grid addons-admin-layout"
      data-tv-focus-zone="shelf"
    >
      <article className="settings-surface settings-surface-full addons-hero-card">
        <div>
          <p className="settings-section-kicker">Extension Management</p>
          <h1>Add-ons</h1>
          <p className="muted">
            Install privately distributed features without adding their source
            code to Core Yeen.
          </p>
        </div>
        <span className="settings-pill">
          {catalogState.catalog.items.length} installed
        </span>
      </article>

      {catalogState.message ? (
        <p className="scan-success addons-admin-notice" role="status">
          {catalogState.message}
        </p>
      ) : null}
      {catalogState.error || selectionError || restartState.error ? (
        <p className="error-text addons-admin-notice" role="alert">
          {catalogState.error ?? selectionError ?? restartState.error}
        </p>
      ) : null}

      <div className="addons-admin-grid">
        <article
          className="settings-surface addon-admin-card"
          data-tv-focus-lane-id="addon-package"
        >
          <header className="addon-card-header">
            <div>
              <p className="settings-section-kicker">Package Installer</p>
              <h2>Upload an add-on ZIP</h2>
            </div>
            <span className="settings-pill">.zip</span>
          </header>
          <p className="muted">
            Yeen validates the manifest, compatibility, file safety, and
            signature before staging an installation.
          </p>

          <form className="addon-upload-form" onSubmit={handleInstall}>
            <label className="addon-package-picker">
              <span>Choose package</span>
              <input
                name="addon-package"
                type="file"
                accept={ADDON_PACKAGE_ACCEPT}
                onChange={handlePackageSelected}
                disabled={catalogState.installing}
              />
            </label>

            <div className="addon-package-summary" aria-live="polite">
              {selectedPackage ? (
                <>
                  <strong>{selectedPackage.name}</strong>
                  <span>{formatPackageSize(selectedPackage.size)}</span>
                </>
              ) : (
                <span>No package selected</span>
              )}
            </div>

            <button
              className="accent-button"
              type="submit"
              disabled={!selectedPackage || catalogState.installing}
            >
              {catalogState.installing ? 'Validating & Installing…' : 'Install Add-on'}
            </button>
          </form>
        </article>

        <article
          className={`settings-surface addon-admin-card addon-trust-card ${catalogState.trustPolicy.allowUnsigned ? 'is-warning' : ''}`}
          data-tv-focus-lane-id="addon-trust"
        >
          <header className="addon-card-header">
            <div>
              <p className="settings-section-kicker">Trust Policy</p>
              <h2>Package signatures</h2>
            </div>
            <span className={`settings-pill ${catalogState.trustPolicy.allowUnsigned ? 'is-warning' : 'is-safe'}`}>
              {catalogState.trustPolicy.allowUnsigned ? 'Unsigned allowed' : 'Signed only'}
            </span>
          </header>

          <p className="muted">
            Signed packages prove who created them and whether their contents
            were changed after signing.
          </p>

          <label className="addon-policy-toggle">
            <span>
              <strong>Allow unsigned ZIP packages</strong>
              <small>Only enable this for packages you personally trust.</small>
            </span>
            <input
              type="checkbox"
              checked={catalogState.trustPolicy.allowUnsigned}
              onChange={(event) => handleUnsignedPolicyChange(event.target.checked)}
              disabled={catalogState.updatingPolicy}
            />
          </label>

          {catalogState.trustPolicy.allowUnsigned ? (
            <p className="addon-risk-warning" role="status">
              Unsigned add-ons execute with Yeen's server permissions. Verify
              the source of every ZIP before uploading it.
            </p>
          ) : null}
        </article>
      </div>

      <InstalledAddonsCard catalog={catalogState} restartActive={restartActive} />

      <CoreUpdatePanel token={token} />

      <RestartCard state={restartState} restartActive={restartActive} restartRequired={restartRequired}
        onInstant={() => setConfirmationKind('instant-restart')} />

      <AddonConfirmation kind={confirmationKind} dialogRef={confirmationRef}
        onCancel={() => setConfirmationKind(null)} onConfirm={() => void confirmRiskyAction()} />
    </section>
  );
}
