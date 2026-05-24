import { formatBytes, formatEtaShort as formatEta, formatPercent, formatRate } from '../../../shared/services/formatters';
import type {
  TorrentStateCategoryGroup,
  TorrentStateCategoryKey,
} from './torrentControlUtils';
import { formatTorrentState } from './torrentControlUtils';

interface TorrentLibraryGroupsProps {
  categorizedItems: TorrentStateCategoryGroup[];
  searchActive: boolean;
  hiddenCategories: Partial<Record<TorrentStateCategoryKey, boolean>>;
  selectedHashSet: Set<string>;
  isBusy: boolean;
  adding: boolean;
  onToggleCategory: (key: TorrentStateCategoryKey) => void;
  onToggleSelection: (hash: string, shiftKey: boolean) => void;
}

export function TorrentLibraryGroups({
  categorizedItems,
  searchActive,
  hiddenCategories,
  selectedHashSet,
  isBusy,
  adding,
  onToggleCategory,
  onToggleSelection,
}: TorrentLibraryGroupsProps) {
  return (
    <div className="torrent-control-groups">
      {categorizedItems.map((group) => {
        const hidden = searchActive ? false : (hiddenCategories[group.key] ?? true);

        return (
          <section key={group.key} className="torrent-control-group">
            <header className="torrent-control-group-header">
              <h3 className="torrent-control-group-title">
                <button
                  type="button"
                  className="torrent-control-group-title-button"
                  onClick={() => onToggleCategory(group.key)}
                  aria-expanded={!hidden}
                  aria-label={`${hidden ? 'Show' : 'Hide'} ${group.label} torrents`}
                >
                  <span
                    className={`torrent-control-group-chevron${hidden ? ' is-hidden' : ''}`}
                    aria-hidden="true"
                  >
                    ▾
                  </span>
                  <span>{group.label}</span>
                  <span className="torrent-control-group-count">{group.items.length}</span>
                </button>
              </h3>
            </header>

            {hidden ? (
              <p className="muted torrent-control-group-hidden-note">Rows hidden.</p>
            ) : (
              <ul className="settings-location-list torrent-control-list">
                {group.items.map((item) => {
                  const progressPercent = formatPercent(item.progress);
                  const modeLabel =
                    item.sequentialDownload === null
                      ? 'Unknown'
                      : item.sequentialDownload
                        ? 'Sequential'
                        : 'Random';
                  const selected = selectedHashSet.has(item.hash);

                  return (
                    <li
                      key={item.hash}
                      className={`settings-location-item torrent-control-item${selected ? ' is-selected' : ''}`}
                      onClick={(event) => {
                        if (isBusy || adding) {
                          return;
                        }

                        const target = event.target as HTMLElement;
                        if (target.closest('input,button,a,label')) {
                          return;
                        }

                        onToggleSelection(item.hash, event.shiftKey);
                      }}
                    >
                      <label className="torrent-control-item-select">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(event) => {
                            const shiftKey = (
                              event.nativeEvent as MouseEvent
                            ).shiftKey;
                            onToggleSelection(item.hash, shiftKey);
                          }}
                          onClick={(event) => event.stopPropagation()}
                          disabled={isBusy || adding}
                          aria-label={`Select torrent ${item.name}`}
                        />
                      </label>

                      <div className="settings-location-text torrent-control-item-text">
                        <div className="torrent-control-item-heading">
                          <strong>{item.name}</strong>
                          <span
                            className="torrent-control-item-state"
                            title={`Raw state: ${item.state}`}
                          >
                            {formatTorrentState(item.state)}
                          </span>
                        </div>

                        <div className="settings-inline-meta torrent-control-item-meta">
                          <span className="torrent-control-meta-chip">{progressPercent}</span>
                          <span className="torrent-control-meta-chip">
                            {formatBytes(item.completedBytes, { precision: 'one-for-scaled' })} / {formatBytes(item.sizeBytes, { precision: 'one-for-scaled' })}
                          </span>
                          <span className="torrent-control-meta-chip">
                            ETA {formatEta(item.etaSeconds)}
                          </span>
                          <span className="torrent-control-meta-chip">
                            Down {formatRate(item.downloadRate)}
                          </span>
                          <span className="torrent-control-meta-chip">
                            Up {formatRate(item.uploadRate)}
                          </span>
                          <span className="torrent-control-meta-chip">Mode {modeLabel}</span>
                        </div>

                        <div
                          className="settings-scan-progress-bar"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(item.progress * 100)}
                        >
                          <div style={{ width: progressPercent }} />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
