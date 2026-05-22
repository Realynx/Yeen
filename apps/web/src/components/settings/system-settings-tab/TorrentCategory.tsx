import type { SystemSettings } from '../../../lib/types';
import type { SystemSettingsState } from '../../../pages/settings/useSystemSettings';
import { SettingsCategorySection } from './SettingsCategorySection';

interface TorrentCategoryProps {
  systemSettings: SystemSettings;
  updateSetting: SystemSettingsState['updateSetting'];
}

export function TorrentCategory({
  systemSettings,
  updateSetting,
}: TorrentCategoryProps) {
  return (
    <SettingsCategorySection
      id="system-torrent"
      kicker="Integrations"
      title="Torrent Providers"
      description="Connection and mapping settings for qBittorrent and IPTorrents workflows."
      badge="Download Pipeline"
    >
      <div className="system-settings-form">
        <label className="settings-field settings-field-wide">
          <span className="settings-field-label">qBittorrent Base URL</span>
          <input
            type="text"
            value={systemSettings.qbittorrentBaseUrl}
            onChange={(event) =>
              updateSetting('qbittorrentBaseUrl', event.target.value)
            }
            placeholder="http://torrents.fox:8080"
          />
          <small className="settings-field-hint">
            Base URL for the qBittorrent Web UI API.
          </small>
        </label>

        <label className="settings-field">
          <span className="settings-field-label">qBittorrent Username</span>
          <input
            type="text"
            value={systemSettings.qbittorrentUsername}
            onChange={(event) =>
              updateSetting('qbittorrentUsername', event.target.value)
            }
            placeholder="admin"
            autoComplete="off"
          />
        </label>

        <label className="settings-field">
          <span className="settings-field-label">qBittorrent Password</span>
          <input
            type="password"
            value={systemSettings.qbittorrentPassword}
            onChange={(event) =>
              updateSetting('qbittorrentPassword', event.target.value)
            }
            placeholder="Web UI password"
            autoComplete="new-password"
          />
        </label>

        <label className="settings-field">
          <span className="settings-field-label">IPTorrents Username</span>
          <input
            type="text"
            value={systemSettings.iptorrentsUsername}
            onChange={(event) =>
              updateSetting('iptorrentsUsername', event.target.value)
            }
            placeholder="IPT username"
            autoComplete="off"
          />
        </label>

        <label className="settings-field">
          <span className="settings-field-label">IPTorrents Password</span>
          <input
            type="password"
            value={systemSettings.iptorrentsPassword}
            onChange={(event) =>
              updateSetting('iptorrentsPassword', event.target.value)
            }
            placeholder="IPT password"
            autoComplete="new-password"
          />
        </label>

        <div className="settings-field-wide settings-seeding-toggles">
          <span className="settings-field-label">Tracker Seeding</span>

          <label className="settings-seeding-toggle">
            <input
              type="checkbox"
              checked={systemSettings.iptorrentsSeedingEnabled}
              onChange={(event) =>
                updateSetting('iptorrentsSeedingEnabled', event.target.checked)
              }
            />
            <span className="settings-seeding-toggle-copy">
              <span className="settings-seeding-toggle-title">
                Seed IPTorrents torrents
              </span>
              <small className="settings-field-hint">
                If disabled, torrents added from IPTorrents stop once complete.
              </small>
            </span>
          </label>

          <label className="settings-seeding-toggle">
            <input
              type="checkbox"
              checked={systemSettings.nyaaSeedingEnabled}
              onChange={(event) =>
                updateSetting('nyaaSeedingEnabled', event.target.checked)
              }
            />
            <span className="settings-seeding-toggle-copy">
              <span className="settings-seeding-toggle-title">
                Seed Nyaa torrents
              </span>
              <small className="settings-field-hint">
                If disabled, torrents added from Nyaa stop once complete.
              </small>
            </span>
          </label>
        </div>

        <label className="settings-field">
          <span className="settings-field-label">qB Request Timeout (ms)</span>
          <input
            type="number"
            min={1000}
            max={120000}
            value={systemSettings.qbittorrentRequestTimeoutMs}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              updateSetting(
                'qbittorrentRequestTimeoutMs',
                Number.isFinite(parsed) ? parsed : 15000,
              );
            }}
          />
          <small className="settings-field-hint">
            Timeout for server-to-qBittorrent API calls.
          </small>
        </label>

        <label className="settings-field">
          <span className="settings-field-label">Default Torrent Order</span>
          <select
            value={systemSettings.qbittorrentDefaultOrderMode}
            onChange={(event) =>
              updateSetting(
                'qbittorrentDefaultOrderMode',
                event.target.value as SystemSettings['qbittorrentDefaultOrderMode'],
              )
            }
          >
            <option value="random">Random</option>
            <option value="sequential">Sequential (In Order)</option>
          </select>
          <small className="settings-field-hint">
            Background torrent adds use this mode. Stream intent always uses sequential.
          </small>
        </label>

        <fieldset className="settings-field settings-field-wide">
          <legend className="settings-field-label">qBittorrent Path Mappings</legend>
          <small className="settings-field-hint">
            Rewrite paths reported by qBittorrent (e.g. when running in Docker) to
            host paths Yeen can read. Longest matching prefix wins. Example:{' '}
            <code>/downloads</code> {'->'} <code>D:\Torrents\Downloads</code>.
          </small>
          <div className="settings-path-mappings">
            {(systemSettings.qbittorrentPathMappings ?? []).map((mapping, index) => (
              <div key={`mapping-${index}`} className="settings-path-mapping-row">
                <input
                  type="text"
                  value={mapping.from}
                  placeholder="/downloads"
                  onChange={(event) => {
                    const next = [...(systemSettings.qbittorrentPathMappings ?? [])];
                    next[index] = { ...next[index], from: event.target.value };
                    updateSetting('qbittorrentPathMappings', next);
                  }}
                />
                <span aria-hidden="true">{'->'}</span>
                <input
                  type="text"
                  value={mapping.to}
                  placeholder="D:\\Torrents\\Downloads"
                  onChange={(event) => {
                    const next = [...(systemSettings.qbittorrentPathMappings ?? [])];
                    next[index] = { ...next[index], to: event.target.value };
                    updateSetting('qbittorrentPathMappings', next);
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = (systemSettings.qbittorrentPathMappings ?? []).filter(
                      (_, i) => i !== index,
                    );
                    updateSetting('qbittorrentPathMappings', next);
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                const next = [
                  ...(systemSettings.qbittorrentPathMappings ?? []),
                  { from: '', to: '' },
                ];
                updateSetting('qbittorrentPathMappings', next);
              }}
            >
              Add mapping
            </button>
          </div>
        </fieldset>
      </div>
    </SettingsCategorySection>
  );
}
