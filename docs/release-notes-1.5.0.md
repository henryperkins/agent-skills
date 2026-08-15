# Release notes — 1.5.0

## 2026-08-15

- Bumped plugin metadata to `1.5.0` in `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`.
- Clarified `wp-ai-plugin` legacy deprecation guidance:
  - Updated legacy `ai_experiments_*` surface from eight/ten to the full set of legacy names that still fire.
  - Added explicit mapping for two deprecated actions (`ai_experiments_register_experiments`, `ai_experiments_initialized`) and modern replacements.
  - Documented shim guard behavior (`has_filter`/`has_action`) so dead legacy hooks are not treated as removed APIs.
- Updated connector community provider docs to avoid stale model examples and treat OpenRouter `provider/model` IDs as illustrative only.
- Fixed a release-conformance harness regression:
  - Replaced the fixed Gutenberg exact version assertion (`v23.5.3`) with a shape + floor check to allow index refresh while preventing regressions.
