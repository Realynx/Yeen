import type { ChangeEvent, RefObject } from 'react';

interface MetadataCommitBackupSectionProps {
  replaceOnImport: boolean;
  importing: boolean;
  exporting: boolean;
  planning: boolean;
  committing: boolean;
  importInputRef: RefObject<HTMLInputElement | null>;
  onSetReplaceOnImport: (value: boolean) => void;
  onExport: () => void;
  onOpenImportDialog: () => void;
  onImportFileSelected: (event: ChangeEvent<HTMLInputElement>) => void;
}

export function MetadataCommitBackupSection({
  replaceOnImport,
  importing,
  exporting,
  planning,
  committing,
  importInputRef,
  onSetReplaceOnImport,
  onExport,
  onOpenImportDialog,
  onImportFileSelected,
}: MetadataCommitBackupSectionProps) {
  return (
    <section className="commit-backup-panel">
      <div className="commit-subheader">
        <div>
          <p className="settings-section-kicker">Metadata Backup</p>
          <h3>Export / Import Metadata</h3>
        </div>
      </div>
      <p className="muted commit-backup-copy">
        Export your current metadata index to a JSON file and re-import it
        later on this server.
      </p>

      <div className="commit-toolbar commit-toolbar-tight">
        <label className="commit-toggle">
          <input
            type="checkbox"
            checked={replaceOnImport}
            onChange={(event) => onSetReplaceOnImport(event.target.checked)}
            disabled={importing || exporting || planning || committing}
          />
          <span>Replace existing metadata during import</span>
        </label>

        <div className="commit-toolbar-spacer" />

        <button
          className="ghost-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
          type="button"
          onClick={onExport}
          disabled={exporting || importing || planning || committing}
        >
          {exporting ? 'Exporting...' : 'Export Metadata JSON'}
        </button>

        <button
          className="accent-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
          type="button"
          onClick={onOpenImportDialog}
          disabled={importing || exporting || planning || committing}
        >
          {importing ? 'Importing...' : 'Import Metadata JSON'}
        </button>

        <input
          ref={importInputRef}
          className="commit-import-input"
          type="file"
          accept=".json,application/json"
          onChange={onImportFileSelected}
        />
      </div>
    </section>
  );
}
