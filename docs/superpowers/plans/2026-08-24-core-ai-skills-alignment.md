# Core AI Skills Upstream Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Bring all six Core AI skills into agreement with their current released upstream implementations, repair the AI plugin 1.3 regression in the live smoke test, and make future drift visible and actionable across every upstream these skills depend on.

**Architecture:** Treat tagged executable source as authoritative, with changelogs and handbooks as supporting context. Work in red-green slices: add conformance assertions, correct the skill, then exercise the live path. Replace duplicated upstream lists with a shared Core AI source registry consumed by the updater, drift checker, and optional AI generator. Deterministic index refresh and drift reporting stay authoritative; AI-generated edits are advisory and may never suppress an index-only pull request.

**Tech Stack:** Markdown Agent Skills, Node.js ES modules and built-in assertions, JSON release indices and eval scenarios, GitHub Actions, WordPress Playground, WP-CLI, GitHub Releases API, WordPress version-check API, Packagist.

**Spec:** docs/ai-plugin-connectors-audit.md and docs/abilities-api-audit.md, supplemented by the dated revalidation created in Task 1.

## Global Constraints

- Scope is wp-abilities-api, wp-abilities-audit, wp-abilities-verify, wp-ai-client, wp-ai-connectors, and wp-ai-plugin, plus their evals, upstream indices, maintenance scripts, workflows, and release metadata.
- Preserve the existing runtime floors: WordPress 6.9+/PHP 7.2.24+ for Abilities API skills; WordPress 7.0+/PHP 7.4+ for AI Client, Connectors, and the canonical AI plugin.
- Use these released baselines: WordPress 7.1, Gutenberg 23.8.0, WordPress/ai 1.3.0, MCP Adapter 0.6.1, wordpress/php-ai-client 1.4.0, WordPress/wp-ai-client 0.4.0, Anthropic provider 1.0.4, Google provider 1.1.1, and OpenAI provider 1.1.0.
- Resolve release behavior in this order: tagged executable source, tests in the tag, release notes/changelog, then handbook prose. When they disagree, describe executable behavior and record the documentation mismatch.
- Do not infer that an API is active merely because a helper or changelog entry exists. In WordPress/ai 1.3.0, SDK_Overlay::register() is commented out; embedding helpers exist but are unsupported on stock WordPress 7.1.
- Preserve docs/ai-plugin-connectors-audit.md and docs/abilities-api-audit.md as historical records. Add dated revalidation notes instead of rewriting their original release-state narrative.
- Keep eval/scenarios/ai-plugin-expose-read-abilities.json as an explicitly labeled 1.2 compatibility scenario. Add a separate 1.3 scenario for gated Custom Abilities.
- Add a failing deterministic assertion before changing each release-sensitive contract.
- Keep SKILL.md procedural and below 500 lines; move enumerations and version-specific depth to one-hop references.
- Use non-interactive commands, preserve transactional index writes, and do not edit installed/cache copies of the skills.
- Release the coordinated correction as plugin version 1.9.0; both manifests are currently 1.8.0.

## Approach Choice

1. **Patch only the stale prose and smoke fixture:** fastest, but leaves provider/index coverage and the broken maintenance path unchanged.
2. **Let the AI workflow rewrite skills from every release:** broad automation, but makes an advisory model responsible for source interpretation and can silently amplify changelog/source conflicts.
3. **Source-first hybrid (selected):** humans or agents rebaseline behavior from tagged source; deterministic scripts own release discovery and drift gates; AI generation proposes edits but cannot block or replace the deterministic path.

The hybrid is the recommended approach because it closes the present content defects and the systemic detection gaps without treating generated prose as a source of truth.

## Canonical Source Matrix

| Surface | Baseline | Canonical source |
|---|---:|---|
| WordPress Core | 7.1 | https://github.com/WordPress/wordpress-develop and https://api.wordpress.org/core/version-check/1.7/ |
| Gutenberg | 23.8.0 | https://github.com/WordPress/gutenberg/releases |
| Canonical AI plugin | 1.3.0 | https://github.com/WordPress/ai/releases |
| MCP Adapter | 0.6.1 | https://github.com/WordPress/mcp-adapter/releases |
| PHP AI Client | 1.4.0 | https://repo.packagist.org/p2/wordpress/php-ai-client.json plus tagged repository source |
| WP AI Client | 0.4.0 | https://github.com/WordPress/wp-ai-client/releases |
| Anthropic provider | 1.0.4 | https://github.com/WordPress/ai-provider-for-anthropic/releases |
| Google provider | 1.1.1 | https://github.com/WordPress/ai-provider-for-google/releases |
| OpenAI provider | 1.1.0 | https://github.com/WordPress/ai-provider-for-openai/releases |
| WP↔Gutenberg mapping | current official table | https://developer.wordpress.org/block-editor/contributors/versions-in-wordpress/ |

---

## File Map

**New files**

- docs/core-ai-skills-audit-2026-08-24.md
- shared/scripts/core-ai-upstreams.mjs
- shared/scripts/upstream-drift-lib.mjs
- shared/references/wp-ai-client-releases.json
- shared/references/ai-provider-anthropic-releases.json
- shared/references/ai-provider-google-releases.json
- shared/references/ai-provider-openai-releases.json
- eval/scenarios/ai-plugin-custom-abilities-1-3.json
- docs/release-notes-1.9.0.md

**Modified skills/references**

- skills/wp-abilities-api/SKILL.md
- skills/wp-abilities-audit/SKILL.md
- skills/wp-abilities-verify/SKILL.md
- skills/wp-abilities-verify/references/exposure-checks.md
- skills/wp-ai-client/SKILL.md
- skills/wp-ai-client/references/embedding-builder.md
- skills/wp-ai-connectors/SKILL.md
- skills/wp-ai-connectors/references/provider-registration.md
- skills/wp-ai-connectors/references/capabilities-declaration.md
- skills/wp-ai-plugin/SKILL.md
- skills/wp-ai-plugin/references/experiments-framework.md
- skills/wp-ai-plugin/references/hooks-and-filters.md
- skills/wp-ai-plugin/references/dashboard-widgets.md
- skills/wp-ai-plugin/references/guidelines-integration.md

**Modified eval/maintenance/release files**

- eval/harness/run.mjs
- eval/harness/release-conformance.mjs
- eval/scenarios/ai-plugin-register-experiment.json
- eval/scenarios/ai-plugin-expose-read-abilities.json
- eval/scenarios/ai-connectors-register-provider.json
- eval/scenarios/upstream-sync-indices.json
- eval/playground/ai-plugin-smoke/blueprint.json
- eval/playground/ai-plugin-smoke/run.sh
- eval/playground/ai-plugin-smoke/README.md
- eval/playground/ai-plugin-smoke/mu-plugins/wpai-skill-smoke.php
- shared/scripts/update-upstream-indices.mjs
- shared/scripts/check-upstream-drift.mjs
- shared/scripts/ai-generate-updates.mjs
- shared/references/wordpress-core-versions.json
- shared/references/gutenberg-releases.json
- shared/references/ai-plugin-releases.json
- shared/references/mcp-adapter-releases.json
- shared/references/php-ai-client-releases.json
- shared/references/wp-gutenberg-version-map.json
- shared/references/wp-ai-client-releases.json
- shared/references/ai-provider-anthropic-releases.json
- shared/references/ai-provider-google-releases.json
- shared/references/ai-provider-openai-releases.json
- .github/state/last-sync.json
- .github/workflows/upstream-sync.yml
- .github/workflows/ai-skill-maintenance.yml
- docs/upstream-sync.md
- docs/ai-plugin-connectors-audit.md
- docs/abilities-api-audit.md
- .claude-plugin/plugin.json
- .claude-plugin/marketplace.json

---

### Task 1: Freeze the 2026-08-24 Evidence Baseline

**Files:**

- Create: docs/core-ai-skills-audit-2026-08-24.md
- Modify: docs/ai-plugin-connectors-audit.md
- Modify: docs/abilities-api-audit.md

- [ ] **Step 1: Record the clean offline baseline**

Run:

    git status --short --branch
    node eval/harness/run.mjs
    node shared/scripts/check-upstream-drift.mjs

Expected: the harness and drift checker pass against the committed stale indices. Record this as an offline false-negative, not evidence of currency.

- [ ] **Step 2: Capture immutable upstream evidence**

For all nine releases, record release/tag, commit SHA, release date, source URL, relevant files, local declaration, finding, and remediation task. For Core 7.1, compare the released branch against the previously audited RC paths. For Gutenberg 23.8.0, compare packages/abilities, packages/core-abilities, and the Knowledge files used by wp-ai-plugin.

Expected: Core 7.1 final is behaviorally unchanged in the audited paths; Gutenberg 23.8.0 changes no relevant behavior beyond versions/import comments.

- [ ] **Step 3: Record the WordPress/ai embedding contradiction**

Cite the 1.3.0 tag where SDK_Overlay::register() is commented out, the helper definitions in includes/helpers.php, and the contradictory changelog. State that supports_embedding_generation() and generate_embeddings() exist but report unsupported on stock WordPress 7.1.

- [ ] **Step 4: Append dated addenda to both historical audits**

Link each addendum to the new audit and list only what changed since the original snapshot. Retain the old dated findings intact.

- [ ] **Step 5: Verify and commit**

Run:

    rg -n 'WordPress 7\.1|Gutenberg 23\.8\.0|WordPress/ai 1\.3\.0|SDK_Overlay::register|tagged executable source' docs/core-ai-skills-audit-2026-08-24.md docs/ai-plugin-connectors-audit.md docs/abilities-api-audit.md
    git diff --check

Commit:

    git add -- docs/core-ai-skills-audit-2026-08-24.md docs/ai-plugin-connectors-audit.md docs/abilities-api-audit.md
    git commit -m "docs: record Core AI upstream revalidation"

---

### Task 2: Define RED WordPress/ai 1.3 Contracts

**Files:**

- Modify: eval/harness/release-conformance.mjs
- Create: eval/scenarios/ai-plugin-custom-abilities-1-3.json
- Modify: eval/scenarios/ai-plugin-register-experiment.json
- Modify: eval/scenarios/ai-plugin-expose-read-abilities.json only to label it legacy 1.2

- [ ] **Step 1: Replace the current release pin assertion**

Require v1.3.0 plus custom-abilities, wpai_feature_custom-abilities_enabled, wpai_gated_abilities, the three ability-scoped prompt hooks, and WordPress\AI\log_ai_request().

- [ ] **Step 2: Add the gated-ability consistency assertion**

Require core/read-content, core/read-settings, core/read-users, ai/get-post-details, and ai/get-post-terms to be conditional on Custom Abilities in 1.3. Reject any current-release text saying the five register after only wpai_features_enabled.

- [ ] **Step 3: Add the embedding-overlay negative assertion**

Require the current guidance to name SDK_Overlay::register(), say that it is commented out in 1.3.0, and prohibit version-only claims that the overlay is active.

- [ ] **Step 4: Add the 1.3 behavioral scenario**

The new scenario must require the global switch, wpai_feature_custom-abilities_enabled, the five conditional IDs, wpai_gated_abilities for third parties, released scoped prompt hooks, and the stock-Core embedding caveat.

- [ ] **Step 5: Refresh the experiment scenario**

Require the 19 classes in Experiments::EXPERIMENT_CLASSES at tag 1.3.0, including Content Translation, Slug Generation, and Custom Abilities. Move scoped prompt hooks, settings import/export, Site Health, and request logging into the shipped 1.3 surface. Preserve the existing 1.2 scenario as a versioned compatibility contract.

- [ ] **Step 6: Verify RED and commit tests only**

Run:

    node eval/harness/run.mjs

Expected: exit 1 because wp-ai-plugin still declares 1.2.0 and its references label 1.3 surfaces unreleased.

Commit:

    git add -- eval/harness/release-conformance.mjs eval/scenarios/ai-plugin-custom-abilities-1-3.json eval/scenarios/ai-plugin-register-experiment.json eval/scenarios/ai-plugin-expose-read-abilities.json
    git commit -m "test: define AI plugin 1.3 contracts"

---

### Task 3: Rebaseline wp-ai-plugin to Tagged 1.3.0 Source

**Files:**

- Modify: skills/wp-ai-plugin/SKILL.md
- Modify: skills/wp-ai-plugin/references/experiments-framework.md
- Modify: skills/wp-ai-plugin/references/hooks-and-filters.md
- Modify: skills/wp-ai-plugin/references/dashboard-widgets.md
- Modify: skills/wp-ai-plugin/references/guidelines-integration.md

- [ ] **Step 1: Correct top-level versioning and troubleshooting**

Declare AI plugin 1.3.0 and Core 7.1. Make the Custom Abilities toggle part of every troubleshooting/verification path that expects the five read/utility abilities.

- [ ] **Step 2: Resolve the internal ability contradiction**

Describe gates in this order: wpai_features_enabled, wpai_feature_custom-abilities_enabled, Gated_Abilities::get_all(), and optional additions through wpai_gated_abilities. Keep the 1.2 unconditional behavior only in a clearly labeled compatibility note.

- [ ] **Step 3: Move released features out of develop-only sections**

Document Content Translation, Slug Generation, Custom Abilities, settings import/export, Site Health, and ability-scoped prompt hooks as shipped in 1.3.0. Remove obsolete x.x.x/develop warnings.

- [ ] **Step 4: Complete the hook/helper inventory from executable source**

Add source-verified signatures for wpai_gated_abilities; wpai_content_classification_available_terms; wpai_content_classification_min_confidence; wpai_content_classification_candidate_pool_size; wpai_bulk_action_max_items; wpai_alt_text_allowed_image_mime_types; wpai_alt_text_image_download_timeout; wpai_alt_text_image_max_download_bytes; wpai_remove_data_on_uninstall; wpai_slug_generation_number_of_suggestions; the three scoped prompt hooks; and WordPress\AI\log_ai_request().

- [ ] **Step 5: Document migrations and deprecations**

Cover the migration from ai_generated, ai_generated_summary, and ai_note to wpai_* keys. Mark AI_Service, get_ai_service(), and the unused wpai_meta_description_result_temperature surface deprecated, naming source-backed replacements where available.

- [ ] **Step 6: Document the embedding boundary and security hardening**

Explain the inactive overlay and require runtime feature detection. Recheck permissions, import/export, logging, prompt handling, sanitization, and escaping examples against the 1.3 tag.

- [ ] **Step 7: Verify GREEN and commit**

Run:

    node eval/harness/run.mjs
    rg -n 'develop-only|unreleased after v1\.2\.0|still declaring version.*1\.2\.0' skills/wp-ai-plugin
    git diff --check

Expected: the harness passes; stale phrases appear only in explicitly historical notes.

Commit:

    git add -- skills/wp-ai-plugin
    git commit -m "docs: align AI plugin skill with 1.3.0"

---

### Task 4: Repair the Live AI Plugin Smoke Test

**Files:**

- Modify: eval/playground/ai-plugin-smoke/blueprint.json
- Modify: eval/playground/ai-plugin-smoke/run.sh
- Modify: eval/playground/ai-plugin-smoke/mu-plugins/wpai-skill-smoke.php
- Modify: eval/playground/ai-plugin-smoke/README.md

- [ ] **Step 1: Make the fixture report the gate and all five IDs**

Add custom_abilities_feature plus ai/get-post-details and ai/get-post-terms to the JSON output. First assert all five are absent while the Custom Abilities toggle is false.

- [ ] **Step 2: Add the 1.3 toggle without bypassing registration**

Enable wpai_feature_custom-abilities_enabled only for the enabled phase. Never directly register the five abilities in the MU plugin.

- [ ] **Step 3: Exercise both states**

Assert:

    disabled: all five gated abilities are false
    enabled: all five gated abilities are true
    always: smoke ability executes and Suggest Reply remains enabled
    version: WPAI_VERSION is at least 1.3.0

- [ ] **Step 4: Update README evidence**

Set Last verified to WordPress 7.1 and AI plugin 1.3.0. Include expected disabled/enabled summaries and explain the required toggle.

- [ ] **Step 5: Verify and commit**

Run:

    ./eval/playground/ai-plugin-smoke/run.sh
    node eval/harness/run.mjs
    git diff --check

Commit:

    git add -- eval/playground/ai-plugin-smoke
    git commit -m "test: cover AI plugin 1.3 gated abilities"

---

### Task 5: Rebaseline the Other Five Skills

**Files:**

- Modify: eval/harness/release-conformance.mjs
- Modify: skills/wp-abilities-api/SKILL.md
- Modify: skills/wp-abilities-audit/SKILL.md
- Modify: skills/wp-abilities-verify/SKILL.md
- Modify: skills/wp-abilities-verify/references/exposure-checks.md
- Modify: skills/wp-ai-client/SKILL.md
- Modify: skills/wp-ai-client/references/embedding-builder.md
- Modify: skills/wp-ai-connectors/SKILL.md
- Modify: skills/wp-ai-connectors/references/provider-registration.md
- Modify: skills/wp-ai-connectors/references/capabilities-declaration.md
- Modify: eval/scenarios/ai-connectors-register-provider.json

- [ ] **Step 1: Add RED independent baseline assertions**

Require:

    wp-abilities-api: Core 7.1; Gutenberg 23.8.0; MCP Adapter 0.6.1
    wp-abilities-audit: Core 7.1
    wp-abilities-verify: Core 7.1; MCP Adapter 0.6.1
    wp-ai-client: Core 7.1; PHP AI Client 1.4.0; WP AI Client 0.4.0
    wp-ai-connectors: Core 7.1; PHP AI Client 1.4.0;
                      Anthropic 1.0.4; Google 1.1.1; OpenAI 1.1.0

Run the harness and confirm RED because these independent declarations do not all exist.

- [ ] **Step 2: Rebaseline all three Abilities skills**

Replace the RC3 warning with released Core 7.1 evidence. Recheck lifecycle hooks, validation, permission results, REST exposure, meta.public, show_in_rest, and MCP Adapter 0.6.1 fallback rules. Change exposure-checks.md only if shipped source differs; otherwise record unchanged behavior.

- [ ] **Step 3: Rebaseline wp-ai-client**

Declare Core 7.1, standalone PHP AI Client 1.4.0, Core-bundled 1.3.1, and standalone WP AI Client 0.4.0 separately. Preserve that Core has no src/wp-includes/wp-ai-client/ directory and embeddings remain standalone-only.

- [ ] **Step 4: Rebaseline wp-ai-connectors**

Replace RC3 wording with released Core 7.1 and update provider references to Anthropic 1.0.4, Google 1.1.1, and OpenAI 1.1.0. Where relevant to implementers, document the Anthropic fixes for Claude Opus 4.7/Claude 5 sampling metadata and empty tool-call arguments.

- [ ] **Step 5: Keep the embedding-provider boundary explicit**

Retain runtime gating for CapabilityEnum::embeddingGeneration() and the fact that Core 7.1 does not bundle PHP AI Client 1.4.0. Cross-link the AI plugin overlay caveat only where it prevents a false workaround.

- [ ] **Step 6: Refresh the provider scenario and verify GREEN**

Require current provider baselines, safe empty tool-call parsing, model-aware options, and runtime embedding detection.

Run:

    node eval/harness/run.mjs
    rg -n 'RC3|Anthropic 1\.0\.3|core verified through: 7\.0' skills/wp-abilities-* skills/wp-ai-client skills/wp-ai-connectors
    git diff --check

Commit:

    git add -- eval/harness/release-conformance.mjs eval/scenarios/ai-connectors-register-provider.json skills/wp-abilities-api skills/wp-abilities-audit skills/wp-abilities-verify skills/wp-ai-client skills/wp-ai-connectors
    git commit -m "docs: rebaseline Core AI skills for WordPress 7.1"

---

### Task 6: Centralize and Extend Core AI Release Indices

**Files:**

- Create: shared/scripts/core-ai-upstreams.mjs
- Modify: shared/scripts/update-upstream-indices.mjs
- Create: four missing release-index JSON files
- Refresh: existing release indices, Core index, Gutenberg index, and WP↔Gutenberg map
- Modify: eval/harness/release-conformance.mjs
- Modify: eval/scenarios/upstream-sync-indices.json

**Interface:**

The new registry exports CORE_AI_UPSTREAMS. Each entry contains id, indexFile, source, sourceType, affectedSkills, and declarations. A declaration contains skill, label, and patch/minor granularity. Include Core, Gutenberg, WordPress/ai, MCP Adapter, PHP AI Client, WP AI Client, Anthropic, Google, OpenAI, and the version map.

- [ ] **Step 1: Add RED registry coverage checks**

Assert unique IDs/files/sources, valid affected skills, a parseable index/latest version for every release source, all required sources present, and no private hard-coded release-source lists in the updater/generator.

- [ ] **Step 2: Extract source metadata without changing parsers**

Keep network I/O and normalization outside the registry. Preserve the updater's all-fetch/all-normalize-before-any-write transaction.

- [ ] **Step 3: Add missing GitHub sources**

Track WordPress/wp-ai-client and the Anthropic, Google, and OpenAI provider repositories. Apply the existing non-empty stable-release safeguards.

- [ ] **Step 4: Add pure normalization fixtures**

Prove error objects and empty stable arrays fail; drafts/prereleases are excluded; tags/dates/URLs survive; numeric versions sort correctly; missing Packagist packages fail; one failed source leaves every index untouched.

- [ ] **Step 5: Refresh committed indices**

Run:

    node shared/scripts/update-upstream-indices.mjs

Expected latest values are 7.1, 23.8.0, 1.3.0, 0.6.1, 1.4.0, 0.4.0, 1.0.4, 1.1.1, and 1.1.0. If any upstream has advanced, stop and re-audit it before updating a marker.

- [ ] **Step 6: Update scenario, verify, and commit**

Run:

    node eval/harness/run.mjs
    git diff --check

The registry and normalization checks must pass. Drift may remain RED until Task 7 wires every declaration.

Commit:

    git add -- shared/scripts/core-ai-upstreams.mjs shared/scripts/update-upstream-indices.mjs shared/references eval/harness/release-conformance.mjs eval/scenarios/upstream-sync-indices.json
    git commit -m "feat: track every Core AI upstream release"

---

### Task 7: Make Drift Detection Complete and Reportable

**Files:**

- Create: shared/scripts/upstream-drift-lib.mjs
- Modify: shared/scripts/check-upstream-drift.mjs
- Modify: shared/scripts/core-ai-upstreams.mjs
- Modify: eval/harness/release-conformance.mjs
- Modify: eval/harness/run.mjs
- Modify: compatibility declarations in all six SKILL.md files

**Interfaces:**

    collectUpstreamDrift(repoRoot, registry) -> { checks, failures }
    formatDriftMarkdown(report) -> string
    formatDriftJson(report) -> string

CLI:

    node shared/scripts/check-upstream-drift.mjs
    node shared/scripts/check-upstream-drift.mjs --format markdown --allow-drift
    node shared/scripts/check-upstream-drift.mjs --format json --allow-drift

Default exits 1 on drift. --allow-drift emits the complete report and exits 0 only for refresh-PR reporting.

- [ ] **Step 1: Add RED independent-drift fixtures**

Prove failure when Core advances beyond wp-ai-client/connectors/audit/verify while wp-abilities-api remains current; when MCP advances beyond either exposure consumer; when WP AI Client advances; when any provider advances; when AI plugin advances; and when Gutenberg advances beyond declared Abilities/Knowledge consumers.

- [ ] **Step 2: Extract pure collection and remove the manual CHECKS list**

Generate checks from registry declarations. Remove the false comment that the Abilities Core gate covers wp-ai-client.

- [ ] **Step 3: Standardize markers**

Use consistent verified through labels. Require every registry declaration to match exactly one skill marker and every release-sensitive marker to have exactly one registry declaration.

- [ ] **Step 4: Add report modes and argument validation**

Support concise --help, text/markdown/json output, and --allow-drift. Unknown arguments exit 2 without a stack trace.

- [ ] **Step 5: Verify and commit**

Run:

    node shared/scripts/check-upstream-drift.mjs
    node shared/scripts/check-upstream-drift.mjs --format markdown --allow-drift
    node shared/scripts/check-upstream-drift.mjs --format json --allow-drift
    node eval/harness/run.mjs

Expected: all pass with the refreshed baseline.

Commit:

    git add -- shared/scripts/core-ai-upstreams.mjs shared/scripts/upstream-drift-lib.mjs shared/scripts/check-upstream-drift.mjs eval/harness/release-conformance.mjs eval/harness/run.mjs skills/wp-abilities-api/SKILL.md skills/wp-abilities-audit/SKILL.md skills/wp-abilities-verify/SKILL.md skills/wp-ai-client/SKILL.md skills/wp-ai-connectors/SKILL.md skills/wp-ai-plugin/SKILL.md
    git commit -m "test: gate all Core AI upstream drift"

---

### Task 8: Repair AI Maintenance Without Blocking Deterministic Sync

**Files:**

- Modify: shared/scripts/ai-generate-updates.mjs
- Modify: .github/state/last-sync.json
- Modify: eval/harness/release-conformance.mjs
- Modify: .github/workflows/ai-skill-maintenance.yml
- Modify: docs/core-ai-skills-audit-2026-08-24.md

- [ ] **Step 1: Diagnose the last five scheduled failures**

With authenticated repository access:

    gh run list --workflow ai-skill-maintenance.yml --limit 5
    gh run view "$(gh run list --workflow ai-skill-maintenance.yml --limit 1 --json databaseId --jq '.[0].databaseId')" --log-failed

Record only the failing step and redacted error category. If credentials/quota are the cause, record the repository-owner action separately from code changes.

- [ ] **Step 2: Add RED generator state tests**

Prove every AI plugin, MCP, PHP client, WP AI Client, and provider version changes the state hash and produces the registry-declared affected skills. Prove a Core change reaches all six skills.

- [ ] **Step 3: Replace the partial hash**

Load every registry index, create a stable sorted versions object, and hash it with node:crypto SHA-256. Include the version-map row count. Treat the old 16-character base64 state as a one-time migration.

- [ ] **Step 4: Make generated analysis source-first**

Prompts must include source IDs, versions, release URLs, affected skills, and the source-precedence rule. Require summaries to identify tagged files inspected. Without tagged-source evidence, emit a review recommendation rather than speculative skill edits.

- [ ] **Step 5: Make API configuration explicit**

Read ANTHROPIC_MODEL from a repository variable and preflight it with ANTHROPIC_API_KEY. Add --help and an offline --check-config mode. Keep AI_DRY_RUN.

- [ ] **Step 6: Fix the fallback condition**

Ensure create-index-pr runs when generation fails, is skipped, or produces no edits. Upload the generator error category and drift report. An AI failure must never discard refreshed indices.

- [ ] **Step 7: Validate both PR paths**

Full generated skill changes run the strict harness. Index-only changes run all non-drift checks and attach check-upstream-drift --format markdown --allow-drift to the PR, without claiming alignment.

- [ ] **Step 8: Verify and commit**

Run:

    node shared/scripts/ai-generate-updates.mjs --help
    node shared/scripts/ai-generate-updates.mjs --check-config
    node eval/harness/run.mjs
    git diff --check

Then manually dispatch a dry run to test the live API without writes.

Commit:

    git add -- shared/scripts/ai-generate-updates.mjs .github/state/last-sync.json .github/workflows/ai-skill-maintenance.yml eval/harness/release-conformance.mjs docs/core-ai-skills-audit-2026-08-24.md
    git commit -m "fix: make AI maintenance complete and non-blocking"

---

### Task 9: Harden the Deterministic Upstream Sync Workflow

**Files:**

- Modify: .github/workflows/upstream-sync.yml
- Modify: docs/upstream-sync.md
- Modify: eval/scenarios/upstream-sync-indices.json
- Modify: eval/harness/release-conformance.mjs
- Modify: eval/harness/run.mjs

- [ ] **Step 1: Add RED workflow assertions**

Require all registry indices, a generated upstream-drift.md report, non-drift validation before PR creation, report inclusion/artifact upload, all nine Core AI release sources, and an UPSTREAM_SYNC_TOKEN path.

- [ ] **Step 2: Add a workflow-only non-drift harness mode**

Implement node eval/harness/run.mjs --skip-upstream-drift. It must still run every quality, scenario, release-conformance, and parser test. Default run.mjs remains strict.

- [ ] **Step 3: Enrich refresh PRs**

Run:

    node eval/harness/run.mjs --skip-upstream-drift
    node shared/scripts/check-upstream-drift.mjs --format markdown --allow-drift > upstream-drift.md

Put the report in the PR body and upload it. Generate the source list from the registry rather than maintaining workflow prose by hand.

- [ ] **Step 4: Restore normal PR-check triggering**

Use secrets.UPSTREAM_SYNC_TOKEN when owners provide a fine-grained PAT or GitHub App token. Document permissions/rotation. If absent, fall back to GITHUB_TOKEN, run complete validation/reporting in the workflow, and disclose that normal PR workflows may not recursively trigger.

- [ ] **Step 5: Update the operational runbook**

Document the registry, deterministic/advisory split, interpretation of red drift, secret/variable setup, safe reruns, and how to update skills on the refresh branch.

- [ ] **Step 6: Verify and commit**

Run:

    node eval/harness/run.mjs
    node eval/harness/run.mjs --skip-upstream-drift
    node shared/scripts/check-upstream-drift.mjs --format markdown --allow-drift
    git diff --check

Manually dispatch Upstream Sync on a test branch. No change should create no PR; a deliberately older fixture marker should produce a PR/report naming the exact drift.

Commit:

    git add -- .github/workflows/upstream-sync.yml docs/upstream-sync.md eval/scenarios/upstream-sync-indices.json eval/harness/release-conformance.mjs eval/harness/run.mjs
    git commit -m "ci: make upstream drift PRs self-validating"

---

### Task 10: Release 1.9.0 and Run Final Verification

**Files:**

- Create: docs/release-notes-1.9.0.md
- Modify: .claude-plugin/plugin.json
- Modify: .claude-plugin/marketplace.json

- [ ] **Step 1: Add RED release checks**

Require synchronized manifest version 1.9.0 and docs/release-notes-1.9.0.md. Confirm the harness fails while both manifests remain at 1.8.0.

- [ ] **Step 2: Write finding-linked release notes**

Cover AI plugin 1.3/Custom Abilities, Core 7.1/Gutenberg 23.8, provider/client tracking, inactive embedding overlay, two-state live smoke, complete drift gates, and non-blocking maintenance fallback.

- [ ] **Step 3: Bump both manifests atomically**

Set plugin.json and the marketplace plugin entry to 1.9.0 without changing unrelated metadata.

- [ ] **Step 4: Run offline verification**

    node eval/harness/run.mjs
    node shared/scripts/check-upstream-drift.mjs
    node shared/scripts/ai-generate-updates.mjs --check-config
    git diff --check

- [ ] **Step 5: Run live and package verification**

    ./eval/playground/ai-plugin-smoke/run.sh
    node shared/scripts/skillpack-build.mjs --clean --out=/tmp/wordpress-skills-1.9.0 --targets=codex,vscode

Inspect all six built skills, their one-hop references, and generated manifest versions. If skills-ref is installed, validate each source skill directory.

- [ ] **Step 6: Search for stale current claims**

    rg -n 'current canonical release: v1\.2\.0|RC3|Anthropic 1\.0\.3|unreleased after v1\.2\.0|develop-only' skills/wp-abilities-* skills/wp-ai-*
    rg -n 'core gate above already covers|sixteen built-in Experiments|last verified.*1\.2' shared eval docs skills

Expected: no current guidance is stale. Matches in historical audits or the 1.2 scenario are explicitly labeled.

- [ ] **Step 7: Review workflow evidence**

Require one successful manual Upstream Sync run and one successful AI Maintenance dry run; link both in the release notes. If API credentials/quota block the latter, keep Task 8 open and do not declare completion.

- [ ] **Step 8: Commit the release**

    git status --short
    git diff --stat
    git diff --check
    git add -- .claude-plugin/plugin.json .claude-plugin/marketplace.json docs/release-notes-1.9.0.md
    git commit -m "chore: release WordPress skills 1.9.0"

---

## Finding-to-Task Coverage

| Finding | Tasks | Closure evidence |
|---|---:|---|
| wp-ai-plugin pinned to 1.2.0 | 2–3 | 1.3 assertions and tagged-source guidance |
| Five abilities incorrectly treated as unconditional | 2–4 | gated scenario and disabled/enabled live smoke |
| 1.3 features/hooks labeled develop-only | 2–3 | stale-term rejection and current hook inventory |
| Changelog claims an embedding overlay that code disables | 1–3 | source-priority audit, negative assertion, runtime detection |
| Core 7.1/Gutenberg 23.8 markers stale | 1, 5 | released-source evidence and independent markers |
| Committed indices stale | 6 | refreshed transactional indices |
| AI generator ignores AI/MCP/PHP/provider changes | 6, 8 | shared registry and complete state hash |
| One Core gate falsely claimed to cover other skills | 7 | independent drift fixtures/markers |
| Providers and standalone WP AI Client untracked | 5–7 | four indices plus drift declarations |
| Five scheduled AI maintenance runs failed | 8 | root-cause evidence, explicit configuration, fallback |
| Bot refresh PR may not trigger CI | 9 | self-validation/report plus App/PAT path |
| AI plugin evals/smoke README remain at 1.2 | 2, 4 | current scenario and updated live evidence |
| Historical audits say 7.1 is pending | 1 | dated addenda preserving chronology |
| Release metadata needs coordinated bump | 10 | synchronized 1.9.0 manifests and notes |

## Completion Gate

The work is complete only when:

- all six skills carry current, independently checked upstream declarations;
- no current guidance contradicts WordPress/ai 1.3.0 tagged code;
- the live smoke proves both sides of the Custom Abilities gate;
- every tracked release can independently turn CI red;
- index refresh still opens a useful PR when AI generation fails;
- offline harness, live smoke, drift checker, config check, package build, and diff checks pass;
- Upstream Sync has a successful manual run and AI Maintenance has a successful dry run with evidence recorded.
