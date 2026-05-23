import type { MediaItem } from '../../../shared/services/types';
import { formatBytes } from '../../services/mediaDetailsUtils';

interface TechnicalDetailsSectionProps {
  current: MediaItem;
}

export function TechnicalDetailsSection({ current }: TechnicalDetailsSectionProps) {
  const subtitleDetails = current.subtitleDetails ?? [];
  const mediaDetails = current.mediaDetails;

  return (
    <section>
      <h3 className="section-title">Technical Details</h3>
      <div className="movie-details-grid tech-grid">
        <article>
          <h4>Container</h4>
          <p>{current.container ?? current.extension.replace('.', '').toUpperCase()}</p>
        </article>
        <article>
          <h4>Video</h4>
          <p>
            {current.videoCodec ? current.videoCodec.toUpperCase() : 'Unknown'}
            {current.width && current.height ? ` · ${current.width}×${current.height}` : ''}
            {mediaDetails?.frameRate ? ` · ${mediaDetails.frameRate.toFixed(2)}fps` : ''}
          </p>
        </article>
        <article>
          <h4>Audio</h4>
          <p>
            {current.audioCodec ? current.audioCodec.toUpperCase() : 'Unknown'}
            {mediaDetails?.audioChannels ? ` · ${mediaDetails.audioChannels}ch` : ''}
          </p>
        </article>
        <article>
          <h4>Bitrate</h4>
          <p>
            {mediaDetails?.bitRate
              ? `${(mediaDetails.bitRate / 1_000_000).toFixed(2)} Mbps`
              : 'Unknown'}
          </p>
        </article>
        <article>
          <h4>File Size</h4>
          <p>{formatBytes(current.sizeBytes)}</p>
        </article>
        <article>
          <h4>Path</h4>
          <p className="mono-text">{current.relativePath}</p>
        </article>
      </div>

      {subtitleDetails.length > 0 ? (
        <>
          <h3 className="section-title">Subtitles</h3>
          <div className="subtitle-pill-list">
            {subtitleDetails.map((track, index) => (
              <span key={`${track.source}-${index}`} className="subtitle-pill">
                <strong>{track.label || track.language || 'Track'}</strong>
                <span className="subtitle-pill-kind">{track.kind}</span>
              </span>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
