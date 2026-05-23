import { MetadataSuggestionList } from '../MetadataSuggestionList';
import type { MetadataSearchCandidate } from '../../../shared/services/api';
import type { EpisodeOrder } from './types';

interface AssignDialogBasicFieldsProps {
  title: string;
  onTitleChange: (value: string) => void;
  tagsInput: string;
  onTagsChange: (value: string) => void;
  order: EpisodeOrder;
  onOrderChange: (value: EpisodeOrder) => void;
  suggestionCandidates: MetadataSearchCandidate[];
  suggestionLoading: boolean;
  suggestionError: string | null;
  onPickSuggestion: (candidate: MetadataSearchCandidate) => void;
}

export function AssignDialogBasicFields({
  title,
  onTitleChange,
  tagsInput,
  onTagsChange,
  order,
  onOrderChange,
  suggestionCandidates,
  suggestionLoading,
  suggestionError,
  onPickSuggestion,
}: AssignDialogBasicFieldsProps) {
  return (
    <>
      <label className="metadata-field metadata-field-wide">
        <span>Show Title</span>
        <input
          type="text"
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          required
          autoFocus
        />
        <MetadataSuggestionList
          candidates={suggestionCandidates}
          loading={suggestionLoading}
          error={suggestionError}
          onPick={onPickSuggestion}
        />
      </label>

      <label className="metadata-field metadata-field-wide">
        <span>Tags (comma separated)</span>
        <input
          type="text"
          value={tagsInput}
          onChange={(event) => onTagsChange(event.target.value)}
          placeholder="anime, drama"
        />
      </label>

      <label className="metadata-field metadata-field-wide">
        <span>Episode Order</span>
        <select
          value={order}
          onChange={(event) => onOrderChange(event.target.value as EpisodeOrder)}
        >
          <option value="detect-from-filename">
            Detect from filename (recommended)
          </option>
          <option value="filename-asc">Sort by filename (natural)</option>
          <option value="existing-episode">Use existing season/episode</option>
          <option value="as-provided">Selection order</option>
        </select>
      </label>
    </>
  );
}
