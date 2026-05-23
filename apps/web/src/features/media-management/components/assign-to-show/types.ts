import type { MediaItem } from '../../../shared/services/types';

export interface AssignToShowDialogProps {
  token: string;
  selectedItems: MediaItem[];
  onClose: () => void;
  onAssigned: (count: number) => void;
}

export type EpisodeOrder =
  | 'detect-from-filename'
  | 'filename-asc'
  | 'existing-episode'
  | 'as-provided';

export type AssignmentDetectionSource =
  | 'builtin'
  | 'pattern'
  | 'keyword'
  | 'sample'
  | 'existing'
  | 'sequential';

export interface KeywordRuleDraft {
  id: string;
  keyword: string;
  seasonNumber: string;
  episodeNumber: string;
}

export interface PatternRuleDraft {
  id: string;
  seasonLandmark: string;
  episodeLandmark: string;
  caseSensitive: boolean;
  seasonNumber: string;
  episodeNumber: string;
  legacyPattern: string | null;
  legacyFlags: string;
  legacySeasonGroup: string;
  legacyEpisodeGroup: string;
}

export interface AssignProgressState {
  mode: 'idle' | 'bulk' | 'per-item';
  phase: 'preparing' | 'assigning' | 'finalizing';
  total: number;
  completed: number;
  currentPath: string | null;
}

export interface AssignmentRow {
  item: MediaItem;
  seasonNumber: number;
  episodeNumber: number;
  detected: boolean;
  detectionSource: AssignmentDetectionSource;
  matchedPattern: string | null;
  matchedKeyword: string | null;
}

export interface DetectRuleBuildResult {
  rules: import('../../services/filenameParse').FilenameParseRules;
  keywordRuleCount: number;
  patternRuleCount: number;
  errors: string[];
}
