import type { SubtitleTrack } from '../../../shared/services/types';
import { CaptionsIcon, CheckIcon } from '../PlayerIcons';

interface PlayerSubtitleMenuProps {
  open: boolean;
  activeSubtitle: SubtitleTrack | null;
  selectedSubtitleId: string;
  subtitleTracks: SubtitleTrack[];
  extractingSubtitleTrackId: string | null;
  isPhoneMode: boolean;
  onToggle: () => void;
  onClose: () => void;
  onSelectSubtitle: (subtitleId: string) => void;
  onExtractSubtitle: (track: SubtitleTrack) => void;
}

export function PlayerSubtitleMenu({
  open,
  activeSubtitle,
  selectedSubtitleId,
  subtitleTracks,
  extractingSubtitleTrackId,
  isPhoneMode,
  onToggle,
  onClose,
  onSelectSubtitle,
  onExtractSubtitle,
}: PlayerSubtitleMenuProps) {
  return (
    <div className="player-menu-anchor">
      <button
        type="button"
        className={`player-icon-button ${activeSubtitle ? 'is-active' : ''}`}
        onClick={onToggle}
        aria-label="Subtitles"
        aria-expanded={open}
        title={isPhoneMode ? 'Subtitles' : 'Subtitles (C)'}
      >
        <CaptionsIcon />
      </button>

      {open ? (
        <div className="player-menu player-menu-unified" role="menu" aria-label="Subtitles">
          <p className="player-menu-heading">Subtitles</p>

          <button
            type="button"
            role="menuitemradio"
            aria-checked={selectedSubtitleId === ''}
            className={`player-menu-item ${selectedSubtitleId === '' ? 'is-active' : ''}`}
            onClick={() => {
              onSelectSubtitle('');
              onClose();
            }}
          >
            <span className="player-menu-check">{selectedSubtitleId === '' ? <CheckIcon /> : null}</span>
            <span className="player-menu-label">
              <span className="player-menu-primary">Off</span>
            </span>
          </button>

          {subtitleTracks.length === 0 ? (
            <p className="player-menu-empty">No subtitles detected yet.</p>
          ) : null}

          {subtitleTracks.map((track) => {
            const isSelected = selectedSubtitleId === track.id;
            const ready = !!track.url;
            const isExtracting = extractingSubtitleTrackId === track.id;

            return (
              <div className="player-menu-row" key={track.id}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={isSelected}
                  className={`player-menu-item ${isSelected ? 'is-active' : ''}`}
                  onClick={() => {
                    if (!ready || isExtracting) {
                      return;
                    }

                    onSelectSubtitle(track.id);
                    onClose();
                  }}
                  disabled={isExtracting || (!ready && !track.extractable)}
                >
                  <span className="player-menu-check">{isSelected ? <CheckIcon /> : null}</span>
                  <span className="player-menu-label">
                    <span className="player-menu-primary">{track.label}</span>
                    <span className="player-menu-secondary">
                      {track.format.toUpperCase()}
                      {track.language ? ` · ${track.language}` : ''}
                      {!ready
                        ? (
                            isExtracting
                              ? ' · extracting...'
                              : (track.extractable ? ' · needs extraction' : ' · unavailable')
                          )
                        : ''}
                    </span>
                  </span>
                </button>

                {!ready && track.extractable ? (
                  <button
                    type="button"
                    className={`player-menu-mini ${isExtracting ? 'is-loading' : ''}`}
                    disabled={extractingSubtitleTrackId !== null}
                    aria-busy={isExtracting}
                    onClick={() => {
                      if (extractingSubtitleTrackId !== null) {
                        return;
                      }

                      onExtractSubtitle(track);
                    }}
                  >
                    {isExtracting ? (
                      <>
                        <span className="player-menu-mini-spinner" aria-hidden="true" />
                        <span>Extracting...</span>
                      </>
                    ) : 'Extract'}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
