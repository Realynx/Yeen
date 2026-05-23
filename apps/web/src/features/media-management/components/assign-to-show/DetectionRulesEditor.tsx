import { formatPatternRulePreview } from './detectRules';
import type {
  DetectRuleBuildResult,
  KeywordRuleDraft,
  PatternRuleDraft,
} from './types';

interface DetectionRulesEditorProps {
  isDetectMode: boolean;
  detectRuleSet: DetectRuleBuildResult;
  keywordRules: KeywordRuleDraft[];
  patternRules: PatternRuleDraft[];
  saving: boolean;
  addKeywordRule: () => void;
  updateKeywordRule: (
    id: string,
    field: 'keyword' | 'seasonNumber' | 'episodeNumber',
    value: string,
  ) => void;
  removeKeywordRule: (id: string) => void;
  addPatternRule: () => void;
  updatePatternRule: (
    id: string,
    field: 'seasonLandmark' | 'episodeLandmark' | 'seasonNumber' | 'episodeNumber',
    value: string,
  ) => void;
  updatePatternRuleCaseSensitivity: (id: string, checked: boolean) => void;
  removePatternRule: (id: string) => void;
}

export function DetectionRulesEditor({
  isDetectMode,
  detectRuleSet,
  keywordRules,
  patternRules,
  saving,
  addKeywordRule,
  updateKeywordRule,
  removeKeywordRule,
  addPatternRule,
  updatePatternRule,
  updatePatternRuleCaseSensitivity,
  removePatternRule,
}: DetectionRulesEditorProps) {
  if (!isDetectMode) {
    return null;
  }

  return (
    <section className="metadata-detect-rules metadata-field-wide">
      <div className="metadata-detect-rules-header">
        <p className="metadata-detect-rules-title">Detection Assist Rules</p>
        <p className="metadata-field-hint">
          Mix auto-detection with manual guidance. Overrides still work per item in every mode.
        </p>
        <p className="metadata-field-hint metadata-detect-rules-counts">
          Active rules: {detectRuleSet.keywordRuleCount} keyword / {detectRuleSet.patternRuleCount} pattern
        </p>
      </div>

      <div className="metadata-detect-rules-grid">
        <article className="metadata-detect-card">
          <header className="metadata-detect-card-header">
            <h3>Keyword Mapping</h3>
            <button
              type="button"
              className="ghost-button"
              onClick={addKeywordRule}
              disabled={saving}
            >
              Add Keyword
            </button>
          </header>
          <p className="metadata-field-hint">
            Example: keyword "sample" with season -1 auto-groups clips to ignored sample season.
          </p>
          <div className="metadata-detect-rule-list">
            {keywordRules.length === 0 ? (
              <p className="metadata-detect-empty">No keyword rules yet.</p>
            ) : (
              keywordRules.map((rule) => (
                <div key={rule.id} className="metadata-detect-rule-row">
                  <input
                    type="text"
                    value={rule.keyword}
                    onChange={(event) =>
                      updateKeywordRule(rule.id, 'keyword', event.target.value)
                    }
                    placeholder="keyword"
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    value={rule.seasonNumber}
                    onChange={(event) =>
                      updateKeywordRule(rule.id, 'seasonNumber', event.target.value)
                    }
                    placeholder="season"
                    min={-1}
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    value={rule.episodeNumber}
                    onChange={(event) =>
                      updateKeywordRule(rule.id, 'episodeNumber', event.target.value)
                    }
                    placeholder="episode"
                    min={0}
                  />
                  <button
                    type="button"
                    className="metadata-detect-remove"
                    onClick={() => removeKeywordRule(rule.id)}
                    disabled={saving}
                    aria-label="Remove keyword rule"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="metadata-detect-card">
          <header className="metadata-detect-card-header">
            <h3>Pattern Builder</h3>
            <button
              type="button"
              className="ghost-button"
              onClick={addPatternRule}
              disabled={saving}
            >
              Add Landmark Rule
            </button>
          </header>
          <p className="metadata-field-hint">
            Enter the text that appears before season and episode numbers. We generate the regex for you.
          </p>
          <div className="metadata-detect-rule-list">
            {patternRules.length === 0 ? (
              <p className="metadata-detect-empty">No landmark rules yet.</p>
            ) : (
              patternRules.map((rule) => (
                <div key={rule.id} className="metadata-detect-pattern-row">
                  <div className="metadata-detect-pattern-builder-main">
                    <input
                      type="text"
                      value={rule.seasonLandmark}
                      onChange={(event) =>
                        updatePatternRule(rule.id, 'seasonLandmark', event.target.value)
                      }
                      placeholder="season landmark (e.g. S, Season)"
                    />
                    <input
                      type="text"
                      value={rule.episodeLandmark}
                      onChange={(event) =>
                        updatePatternRule(rule.id, 'episodeLandmark', event.target.value)
                      }
                      placeholder="episode landmark (e.g. E, Episode)"
                    />
                  </div>
                  <div className="metadata-detect-pattern-builder-meta">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={rule.seasonNumber}
                      onChange={(event) =>
                        updatePatternRule(rule.id, 'seasonNumber', event.target.value)
                      }
                      placeholder="S fixed"
                      min={-1}
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      value={rule.episodeNumber}
                      onChange={(event) =>
                        updatePatternRule(rule.id, 'episodeNumber', event.target.value)
                      }
                      placeholder="E fixed"
                      min={0}
                    />
                    <label className="metadata-detect-pattern-toggle">
                      <input
                        type="checkbox"
                        checked={rule.caseSensitive}
                        onChange={(event) =>
                          updatePatternRuleCaseSensitivity(rule.id, event.target.checked)
                        }
                      />
                      Case sensitive
                    </label>
                    <button
                      type="button"
                      className="metadata-detect-remove"
                      onClick={() => removePatternRule(rule.id)}
                      disabled={saving}
                      aria-label="Remove pattern rule"
                    >
                      Remove
                    </button>
                  </div>
                  <p className="metadata-detect-pattern-preview">
                    Generated pattern: {formatPatternRulePreview(rule)}
                  </p>
                  {rule.legacyPattern ? (
                    <p className="metadata-detect-pattern-legacy">
                      Legacy regex preserved until landmarks are set.
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </article>
      </div>

      {detectRuleSet.errors.length > 0 ? (
        <p className="metadata-detect-errors">
          {detectRuleSet.errors.join(' ')}
        </p>
      ) : null}
    </section>
  );
}
