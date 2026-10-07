# WordPress skills 1.12.3

Local candidate, October 7, 2026. This release corrects the reproduced repository audit findings and refreshes reviewed upstream guidance.

- Theme helpers use readable index block templates at the detected theme root, including legacy paths and in-scope parent themes; `theme.json` and PHP parts alone no longer determine classification.
- Triage recognizes Composer's `phpunit/phpunit` key and separates declared dependencies from an installed launcher. Installed-helper examples preserve the target working directory and use resolved absolute paths.
- Abilities guidance describes normal permission execution, Core's pre-execution replacement, and separate REST/MCP gates. A frozen Core 7.1.3 fixture exercises the direct PHP path.
- Current guidance is reviewed against Core 7.1.3, Gutenberg 24.1.0, MCP Adapter 0.7.0, AI 1.4.0, and Anthropic provider 1.0.5. Explicit older-version guidance remains available.
- AI-maintenance dry run suppresses branch/PR writes and retains an upstream drift preview even without an advisory provider. Regression cases cover changed indices, skipped generation, and failed refreshes.
- Both maintenance workflows use an explicit index-preview validation mode for refreshed indices, while preserving the recorded baseline and strict default CI. Preview still rejects malformed indices and corrupt or incomplete recorded state.
- Installation examples select this fork, router fallbacks use shipped skills, and WPDS verification works with either connected MCP tools or cited official package sources.
- The standard harness runs executable detector, launch, workflow, and Core execution regressions. Historical July behavioral evidence remains historical.

See [audit verification and remediation](repository-audit-remediation-2026-10-07.md) for finding dispositions, validation results, and the confirmed GitHub Actions billing blocker. This candidate does not establish hosted CI success or update installed plugins.
