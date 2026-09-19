import { useCallback, useEffect, useState } from "react";
import {
  getSubtitlePreExtractionProgress,
  startSubtitlePreExtraction,
  toApiErrorMessage,
  type SubtitlePreExtractionProgress,
} from "../../../shared/services/api";

interface SubtitlePreExtractionPanelProps {
  token: string;
  disabled?: boolean;
}

interface SubtitlePreExtractionProgressViewProps {
  progress: SubtitlePreExtractionProgress | null;
}

export function SubtitlePreExtractionProgressView({
  progress,
}: SubtitlePreExtractionProgressViewProps) {
  if (!progress || progress.status === "idle") return null;
  const total = progress.totalMediaItems;
  const processed = progress.processedMediaItems;
  const progressPercent =
    total > 0 ? Math.round((Math.min(processed, total) / total) * 100) : 0;

  return (
    <div className="!mt-3 !grid !gap-2" role="status" aria-live="polite">
      {total > 0 ? (
        <div
          className="settings-scan-progress-bar"
          role="progressbar"
          aria-label="Subtitle extraction progress"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={Math.min(processed, total)}
        >
          <div style={{ width: `${progressPercent}%` }} />
        </div>
      ) : null}
      <p className="muted">
        {progress.message ?? "Subtitle extraction status is available."}
      </p>
      <p className="muted !text-xs">
        {processed}/{total} media inspected · {progress.extractedTracks}{" "}
        extracted · {progress.existingTracks} ready ·{" "}
        {progress.unsupportedTracks} unsupported · {progress.failedTracks}{" "}
        failed
      </p>
      {progress.status === "running" && progress.currentMediaTitle ? (
        <p className="muted !truncate !text-xs">
          Inspecting {progress.currentMediaTitle}
        </p>
      ) : null}
      {progress.lastFailure ? (
        <p className="error-text !text-xs">{progress.lastFailure}</p>
      ) : null}
    </div>
  );
}

function startButtonLabel(input: {
  running: boolean;
  starting: boolean;
}): string {
  if (input.running) return "Extracting...";
  if (input.starting) return "Starting...";
  return "Extract Missing Subtitles";
}

export function SubtitlePreExtractionPanel({
  token,
  disabled = false,
}: SubtitlePreExtractionPanelProps) {
  const [progress, setProgress] =
    useState<SubtitlePreExtractionProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProgress = useCallback(async () => {
    try {
      const next = await getSubtitlePreExtractionProgress(token);
      setProgress(next);
      setError(next.error);
    } catch (failure) {
      setError(
        toApiErrorMessage(
          failure,
          "Failed to load subtitle extraction status.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProgress();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadProgress]);

  useEffect(() => {
    if (progress?.status !== "running") return;
    const timer = window.setInterval(() => {
      void loadProgress();
    }, 1_500);
    return () => window.clearInterval(timer);
  }, [loadProgress, progress?.status]);

  async function handleStart() {
    setStarting(true);
    setError(null);
    try {
      setProgress(await startSubtitlePreExtraction(token));
    } catch (failure) {
      setError(
        toApiErrorMessage(failure, "Failed to start subtitle extraction."),
      );
    } finally {
      setStarting(false);
    }
  }

  const running = progress?.status === "running";
  return (
    <section className="commit-backup-panel">
      <div className="settings-scan-progress-head">
        <div>
          <p className="settings-section-kicker">Subtitle Extraction</p>
          <h3>Prepare embedded subtitles</h3>
          <p className="muted">
            Inspect every Local video and extract missing embedded Subtitle
            Tracks before Playback needs them.
          </p>
        </div>
        <button
          className="accent-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
          type="button"
          onClick={() => void handleStart()}
          disabled={disabled || loading || starting || running}
        >
          {startButtonLabel({ running, starting })}
        </button>
      </div>

      {loading ? <p className="muted">Checking extraction status...</p> : null}

      <SubtitlePreExtractionProgressView progress={progress} />

      {error ? <p className="error-text !mt-3">{error}</p> : null}
    </section>
  );
}
