import { useMemo, useState } from 'react';
import {
  buildDetectRuleSet,
  createDraftId,
} from './detectRules';
import type { KeywordRuleDraft, PatternRuleDraft } from './types';

interface InitialRuleDrafts {
  keywordRules: KeywordRuleDraft[];
  patternRules: PatternRuleDraft[];
}

export function useRuleDrafts(initialRuleDrafts: InitialRuleDrafts) {
  const [keywordRules, setKeywordRules] = useState<KeywordRuleDraft[]>(
    () => initialRuleDrafts.keywordRules,
  );
  const [patternRules, setPatternRules] = useState<PatternRuleDraft[]>(
    () => initialRuleDrafts.patternRules,
  );

  const detectRuleSet = useMemo(
    () => buildDetectRuleSet(keywordRules, patternRules),
    [keywordRules, patternRules],
  );

  function addKeywordRule() {
    setKeywordRules((prev) => [
      ...prev,
      {
        id: createDraftId('kw'),
        keyword: '',
        seasonNumber: '',
        episodeNumber: '',
      },
    ]);
  }

  function updateKeywordRule(
    id: string,
    field: 'keyword' | 'seasonNumber' | 'episodeNumber',
    value: string,
  ) {
    setKeywordRules((prev) =>
      prev.map((rule) => (rule.id === id ? { ...rule, [field]: value } : rule)),
    );
  }

  function removeKeywordRule(id: string) {
    setKeywordRules((prev) => prev.filter((rule) => rule.id !== id));
  }

  function addPatternRule() {
    setPatternRules((prev) => [
      ...prev,
      {
        id: createDraftId('pattern'),
        seasonLandmark: 'S',
        episodeLandmark: 'E',
        caseSensitive: false,
        seasonNumber: '',
        episodeNumber: '',
        legacyPattern: null,
        legacyFlags: '',
        legacySeasonGroup: '',
        legacyEpisodeGroup: '',
      },
    ]);
  }

  function updatePatternRule(
    id: string,
    field: 'seasonLandmark' | 'episodeLandmark' | 'seasonNumber' | 'episodeNumber',
    value: string,
  ) {
    setPatternRules((prev) =>
      prev.map((rule) => {
        if (rule.id !== id) {
          return rule;
        }

        const next: PatternRuleDraft = { ...rule, [field]: value };
        if (field === 'seasonLandmark' || field === 'episodeLandmark') {
          next.legacyPattern = null;
          next.legacyFlags = '';
          next.legacySeasonGroup = '';
          next.legacyEpisodeGroup = '';
        }

        return next;
      }),
    );
  }

  function updatePatternRuleCaseSensitivity(id: string, checked: boolean) {
    setPatternRules((prev) =>
      prev.map((rule) =>
        rule.id === id ? { ...rule, caseSensitive: checked } : rule,
      ),
    );
  }

  function removePatternRule(id: string) {
    setPatternRules((prev) => prev.filter((rule) => rule.id !== id));
  }

  return {
    keywordRules,
    patternRules,
    detectRuleSet,
    addKeywordRule,
    updateKeywordRule,
    removeKeywordRule,
    addPatternRule,
    updatePatternRule,
    updatePatternRuleCaseSensitivity,
    removePatternRule,
  };
}
