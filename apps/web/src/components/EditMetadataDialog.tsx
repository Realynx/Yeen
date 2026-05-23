import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  updateMediaMetadata,
  detectMediaFilename,
  toApiErrorMessage,
  type MediaMetadataPatch,
  type MetadataSearchCandidate,
} from '../lib/api';
import { useMetadataSuggestions } from '../lib/use-metadata-suggestions';
import type { MediaItem } from '../lib/types';
import { MetadataSuggestionList } from './MetadataSuggestionList';

interface EditMetadataDialogProps {
  token: string;
  media: MediaItem;
  onClose: () => void;
  onSaved: (item: MediaItem) => void;
}

type MediaType = 'movie' | 'show' | 'other';

function toIntegerField(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function parseIntegerField(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTagsField(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

export function EditMetadataDialog({
  token,
  media,
  onClose,
  onSaved,
}: EditMetadataDialogProps) {
  const initialTagsValue = useMemo(() => media.tags.join(', '), [media.tags]);

  const [title, setTitle] = useState(media.title);
  const [type, setType] = useState<MediaType>(media.type);
  const [releaseYear, setReleaseYear] = useState(toIntegerField(media.releaseYear));
  const [seasonNumber, setSeasonNumber] = useState(toIntegerField(media.seasonNumber));
  const [episodeNumber, setEpisodeNumber] = useState(toIntegerField(media.episodeNumber));
  const [episodeTitle, setEpisodeTitle] = useState(media.episodeTitle ?? '');
  const [description, setDescription] = useState(media.description ?? '');
  const [tagsInput, setTagsInput] = useState(initialTagsValue);
  const [tagsDirty, setTagsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidatePosterUrl, setCandidatePosterUrl] = useState<string | null>(null);
  const [candidateBackdropUrl, setCandidateBackdropUrl] = useState<string | null>(null);
  const [candidateRemoteSource, setCandidateRemoteSource] = useState<'tmdb' | 'jikan' | null>(null);
  const [candidateRemoteSourceId, setCandidateRemoteSourceId] = useState<string | null>(null);

  const parsedYear = Number.parseInt(releaseYear, 10);
  const safeYear = Number.isFinite(parsedYear) ? parsedYear : null;

  const suggestionType: 'movie' | 'show' | 'other' =
    type === 'show' || type === 'movie' ? type : 'other';

  const suggestions = useMetadataSuggestions({
    token,
    title,
    type: suggestionType,
    year: safeYear,
  });

  function applyCandidate(candidate: MetadataSearchCandidate) {
    setTitle(candidate.title);
    if (
      typeof candidate.releaseYear === 'number' &&
      Number.isFinite(candidate.releaseYear)
    ) {
      setReleaseYear(String(candidate.releaseYear));
    }
    if (candidate.overview) {
      setDescription(candidate.overview);
    }
    if (candidate.tags.length > 0 && tagsInput.trim().length === 0) {
      setTagsInput(candidate.tags.join(', '));
      setTagsDirty(true);
    }
    setCandidatePosterUrl(candidate.posterUrl ?? null);
    setCandidateBackdropUrl(candidate.backdropUrl ?? null);
    setCandidateRemoteSource(candidate.remoteSource);
    setCandidateRemoteSourceId(candidate.remoteSourceId);
  }

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !saving && !detecting) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, saving, detecting]);

  async function handleDetectFromFilename() {
    setDetecting(true);
    setError(null);
    try {
      const result = await detectMediaFilename(token, media.id);
      if (result.seasonNumber !== null) {
        setSeasonNumber(String(result.seasonNumber));
      }
      if (result.episodeNumber !== null) {
        setEpisodeNumber(String(result.episodeNumber));
      }
      if (result.episodeTitle) {
        setEpisodeTitle(result.episodeTitle);
      }
      if (result.suggestedType === 'show' && type !== 'show') {
        setType('show');
      } else if (result.suggestedType === 'other' && type !== 'other') {
        setType('other');
      }
    } catch (detectError) {
      setError(toApiErrorMessage(detectError, 'Failed to detect from filename.'));
    } finally {
      setDetecting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const patch: MediaMetadataPatch = {
        title: title.trim(),
        type,
        description: description.trim() ? description : null,
        releaseYear: parseIntegerField(releaseYear),
        seasonNumber: type === 'show' ? parseIntegerField(seasonNumber) : null,
        episodeNumber: type === 'show' ? parseIntegerField(episodeNumber) : null,
        episodeTitle: type === 'show' && episodeTitle.trim() ? episodeTitle : null,
        ...(candidatePosterUrl ? { posterUrl: candidatePosterUrl } : {}),
        ...(candidateBackdropUrl ? { backdropUrl: candidateBackdropUrl } : {}),
        ...(candidateRemoteSource && candidateRemoteSourceId
          ? {
              remoteSource: candidateRemoteSource,
              remoteSourceId: candidateRemoteSourceId,
            }
          : {}),
      };

      if (tagsDirty) {
        patch.tags = parseTagsField(tagsInput);
      }

      const updated = await updateMediaMetadata(token, media.id, patch);
      onSaved(updated);
    } catch (saveError) {
      setError(toApiErrorMessage(saveError, 'Failed to save metadata.'));
    } finally {
      setSaving(false);
    }
  }

  return (
      <div className="metadata-modal-backdrop" role="presentation" onClick={() => !saving && !detecting && onClose()}>
      <div
        className="metadata-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="metadata-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="metadata-modal-header">
          <div>
            <p className="metadata-modal-eyebrow">Edit Metadata</p>
            <h2 id="metadata-modal-title">{media.title}</h2>
            <p className="metadata-modal-path">{media.relativePath}</p>
          </div>
          <button
            type="button"
            className="metadata-modal-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Close dialog"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M6 6 L18 18 M18 6 L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <form className="metadata-form" onSubmit={handleSubmit}>
          <div className="metadata-grid">
            <label className="metadata-field metadata-field-wide">
              <span>Title</span>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={500}
                autoFocus
              />
              <MetadataSuggestionList
                candidates={suggestions.candidates}
                loading={suggestions.loading}
                error={suggestions.error}
                onPick={applyCandidate}
              />
            </label>

            <label className="metadata-field">
              <span>Type</span>
              <select
                value={type}
                onChange={(event) => setType(event.target.value as MediaType)}
              >
                <option value="movie">Movie</option>
                <option value="show">Show / Episode</option>
                <option value="other">Other</option>
              </select>
            </label>

            <label className="metadata-field">
              <span>Release Year</span>
              <input
                type="number"
                inputMode="numeric"
                value={releaseYear}
                onChange={(event) => setReleaseYear(event.target.value)}
                min={0}
                max={9999}
                placeholder="—"
              />
            </label>

            {type === 'show' ? (
              <>
                <label className="metadata-field">
                  <span>Season</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={seasonNumber}
                    onChange={(event) => setSeasonNumber(event.target.value)}
                    min={0}
                  />
                </label>

                <label className="metadata-field">
                  <span>Episode</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={episodeNumber}
                    onChange={(event) => setEpisodeNumber(event.target.value)}
                    min={0}
                  />
                </label>

                <label className="metadata-field metadata-field-wide">
                  <span>Episode Title</span>
                  <input
                    type="text"
                    value={episodeTitle}
                    onChange={(event) => setEpisodeTitle(event.target.value)}
                    maxLength={500}
                    placeholder="Optional"
                  />
                </label>
              </>
            ) : null}

            <label className="metadata-field metadata-field-wide">
              <span>Tags (comma separated)</span>
              <input
                type="text"
                value={tagsInput}
                onChange={(event) => {
                  setTagsInput(event.target.value);
                  setTagsDirty(true);
                }}
                placeholder="anime, family, action"
              />
            </label>

            <label className="metadata-field metadata-field-wide">
              <span>Description</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                maxLength={5000}
              />
            </label>
          </div>

          {error ? <p className="metadata-modal-error">{error}</p> : null}

          <footer className="metadata-modal-footer">
            <button
              type="button"
              className="ghost-button"
              onClick={handleDetectFromFilename}
              disabled={saving || detecting}
            >
              {detecting ? 'Detecting…' : 'Detect from filename'}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={onClose}
              disabled={saving || detecting}
            >
              Cancel
            </button>
            <button type="submit" className="accent-button" disabled={saving || detecting}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
