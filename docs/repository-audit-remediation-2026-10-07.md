# Repository audit verification and remediation

October 7, 2026. Base: `fe2e33c8bff665349f2a3a30c0d565bb912087d5`. Candidate: WordPress skills 1.12.3, implemented in an attached worktree.

The supplied audit archive's 18 manifest-listed files match their SHA-256 hashes. The original six theme/PHPUnit expectations failed on the audited source. The fixes are based on those reproductions, local source, exact upstream tags, and read-only GitHub diagnostics.

## Finding dispositions

| Finding | Verification and implemented result |
| --- | --- |
| A01 | Confirmed MCP Adapter 0.7.0 is released and listed on WordPress.org. Replaced future-release guidance with the current schema runtime; retained explicit 0.6.x filter/DTO guidance for pinned older integrations. Reviewed AI 1.4.0 and Gutenberg 24.1.0 behavior before advancing markers. |
| A02 | Confirmed the unconditional permission assertion is false. The unmodified Core 7.1.3 `WP_Ability` fixture demonstrates normal denial/success, replacement values including null/false/objects, and input failure before permissions. Guidance distinguishes direct PHP execution from REST/MCP outer gates. |
| A03 | Reproduced incorrect root/index detection. Both helpers now inspect readable `templates/index.html` or `block-templates/index.html` in the detected theme, including an in-scope parent with proper child override precedence. Classic PHP parts and unrelated wrapper templates do not establish a block theme. |
| A04 | Reproduced the wrong Composer key. Triage now recognizes `phpunit/phpunit` in `require` and `require-dev`, reports dependency and launcher separately, and avoids recommending an uninstalled launcher. |
| A05 | Confirmed skill-relative launches depend on the wrong working directory. Corrected entrypoint examples to resolve the installed absolute path while retaining the target project root. Independent installed copies are executed against a target path containing spaces. |
| A06 | Confirmed the three planned skill routes are absent. Replaced them with shipped triage, block development, wp-env, plugin security, and REST authentication references. |
| A07 | Confirmed the source/package configuration distinction is intentional. WPDS now explains the skills-only OpenAI package and verifies each source mode according to available tools. |
| A08 | Confirmed the original harness lacked detector cases. Added executable detector/installed-launch, workflow write-gate, and direct-PHP Core regressions to the standard harness. Fixed a Windows path separator defect exposed by the baseline run. July behavioral evidence is preserved as historical evidence. |
| A09 | Confirmed the lack of successful hosted runs. GitHub check annotations explicitly identify an account billing lock. All ten registry indices refreshed successfully locally. A separate local defect blocked refreshed-index validation: both maintenance workflows now use an explicit preview mode that preserves the recorded baseline while validating new indices. Hosted restoration still requires the account issue to be resolved. No workflow was dispatched. |
| A10 | Confirmed README examples selected upstream for this fork. Installation and clone examples now select `henryperkins/agent-skills`; the upstream alternative is labeled. |
| A11 | Reproduced the dry-run write gate with source-derived workflow expressions. The PR job and action now suppress dry-run writes; a refresh failure also blocks the job. The refresh job uploads a drift preview independently of AI configuration. |

## Reviewed upstream sources

- [Core 7.1.3 release](https://wordpress.org/download/releases/): `WP_Ability::execute()`, `WP_Theme::is_block_theme()` and parent-file precedence, Core-bundled `AiClient::VERSION` (still 1.3.1).
- [Gutenberg 24.1.0](https://github.com/WordPress/gutenberg/tree/v24.1.0): Abilities validation/store behavior, Core Abilities bootstrap, Knowledge experiment, and connector compatibility removal. Current discovery uses Core's `_wp_connectors_init()`; legacy 23.6–24.0 references are explicitly scoped.
- [MCP Adapter 0.7.0](https://github.com/WordPress/mcp-adapter/tree/v0.7.0) and [WordPress.org listing](https://wordpress.org/plugins/mcp-adapter/): migration guide, exact schemas, exposure resolution, outer tool/target permissions, server getters, and transport entrypoints.
- [AI 1.4.0](https://github.com/WordPress/ai/tree/1.4.0): WordPress 7.0.3 floor, twenty unique Experiment IDs, three renamed utility abilities and aliases, conditional SDK overlay, explicit embedding model/provider, and published Knowledge guidelines.
- [Anthropic provider 1.0.5](https://github.com/WordPress/ai-provider-for-anthropic/tree/1.0.5): SDK 1.3.1 availability compatibility, thought signatures, and token-limit error behavior.

## Validation

The supplied audit probes now pass 6/6. The standard harness passes under Node 24.15.0 and Node 20.20.2 with PHP 8.3.33, including 17 detector/installed-launch cases, 7 maintenance-preview cases, 7 workflow write-gate cases, and 7 direct-PHP Core execution cases. All 22 upstream declaration checks agree with the refreshed registry. Syntax checks pass for 24 JavaScript modules and both PHP fixtures. Actionlint 1.7.12 passes for the three affected workflows (external ShellCheck/Pyflakes lanes disabled).

All 22 skills pass the official `skills-ref` validator at commit `69ef37e9424c0a7ea9dd2293b559e43ec8176379` on Python 3.11.15 (UTF-8 mode on Windows). All 133 skill files match their built and installed copies for Codex, VS Code, Claude, Cursor, and Antigravity. These checks used isolated temporary destinations.

Candidate evidence and source checksums are recorded in [the candidate result](../eval/results/2026-10-07-repository-audit-remediation.json). The [fresh review and fix-pass record](../eval/results/2026-10-07-repository-audit-review.md) identifies all three Important findings and the Minor finding, their corrections, and the review's limits. Complete refreshed-index CLI exercises confirm that preview validation preserves the recorded baseline and ordinary CI stays strict. The recorded maintenance fingerprint was updated with the generator's pure state functions after source review; advisory AI generation was not invoked.

Two independent skill exercises used only the skills and raw artifacts, without prescribed answers or the audit conclusions. They correctly classified an index-only block theme, separated declared PHPUnit from a usable launcher, and reviewed direct PHP permission/caching behavior. The supplied permission example had an incorrect filter signature; the evaluator identified it and demonstrated both the corrected-signature bypass and the safe callback-caching path using the exact Core class. The archived probe has only its input paths adapted to the repository; replay matches all six original outcomes and traces, and both archived PHP files pass syntax checks. These are bounded exercises, not a candidate-wide trigger-accuracy measurement. Historical July results remain unchanged.

The frozen Core fixture includes source provenance and a normalized-LF checksum. Its PHP runner supplies minimal host shims; it proves the direct execution path, not a full WordPress boot or live REST/MCP integration. Without PHP CLI, local Node validation clearly skips that lane; CI requires it.

## Remaining external limitation

GitHub Actions remains unavailable: [CI run 36366808395](https://github.com/henryperkins/agent-skills/actions/runs/36366808395) and [scheduled sync run 35585989561](https://github.com/henryperkins/agent-skills/actions/runs/35585989561) contain the check annotation, “The job was not started because your account is locked due to a billing issue.” This is confirmed account-side evidence, not a source or runner diagnosis. A successful local refresh does not establish hosted success.

No live AI-provider requests, plugin installation changes, remote configuration changes, workflow dispatches, pushes, pull requests, or publication occurred. Static filesystem detection cannot account for runtime `theme_file_path` filters or parent themes outside the scan root; verify those through WordPress when relevant.
