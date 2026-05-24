interface PlayerStatusOverlayProps {
  loading: boolean;
  switchingToHls: boolean;
  error: string | null;
  playerError: string | null;
}

export function PlayerStatusOverlay({
  loading,
  switchingToHls,
  error,
  playerError,
}: PlayerStatusOverlayProps) {
  const hasMessages = loading || switchingToHls || Boolean(error) || Boolean(playerError);

  if (!hasMessages) {
    return null;
  }

  return (
    <div className="player-status-overlay" role="status" aria-live="polite">
      {error ? <p className="player-status-chip player-status-chip-error" role="alert">{error}</p> : null}
      {playerError ? <p className="player-status-chip player-status-chip-error" role="alert">{playerError}</p> : null}
      {loading ? <p className="player-status-chip player-status-chip-info">Preparing stream...</p> : null}
      {switchingToHls
        ? <p className="player-status-chip player-status-chip-info">Switching to transcoded stream...</p>
        : null}
    </div>
  );
}