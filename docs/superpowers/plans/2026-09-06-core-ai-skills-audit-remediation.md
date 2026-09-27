# Core AI Skills Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Correct every actionable finding in the 2026-09-06 Core AI skills audit, advance the source-verified Gutenberg baseline to 23.9.0, and harden the maintenance checks that allowed stale or misleading guidance to remain green.

**Architecture:** Treat `docs/core-ai-skills-audit-2026-09-06.md` and its six evidence ledgers as the approved specification. Work one skill at a time: establish a failing behavioral or harness check, apply only source-supported guidance changes, validate that skill, then move to shared indices and automation. Derive release-sensitive harness expectations from the canonical registry and index files where practical.

**Tech Stack:** Markdown Agent Skills, Node.js 20 ESM, JSON release indices and scenarios, GitHub Actions YAML, WordPress 7.1, Gutenberg 23.9.0, MCP Adapter 0.6.1, PHP AI Client 1.4.0, and WordPress/ai 1.3.0.

**Spec:** `docs/core-ai-skills-audit-2026-09-06.md`

## Global Constraints

- Resolve claims in this order: tagged executable source, tagged tests, release notes or changelog, then handbook prose.
- Keep unreleased upstream changes on the watch list; do not describe them as released behavior.
- Preserve the released baselines except for the source-reviewed Gutenberg advance from 23.8.0 to 23.9.0.
- Keep `wordpress/wp-ai-client` at 0.4.0 and mark it final, deprecated, and archived.
- Treat WordPress 7.1 as requiring PHP 7.4; scope PHP 7.2.24 compatibility to WordPress 6.9.
- Use `apply_patch` for repository edits and preserve the untracked audit evidence.
- Do not commit, push, publish, dispatch workflows, or change account billing in this task.

---

### Task 1: Repair wp-ai-client Guidance and Detector Behavior

**Files:**

- Modify: `eval/harness/release-conformance.mjs`
- Modify: `skills/wp-ai-client/scripts/detect_ai_client.mjs`
- Modify: `skills/wp-ai-client/SKILL.md`
- Modify: `skills/wp-ai-client/references/prompt-builder.md`
- Modify: `skills/wp-ai-client/references/rest-patterns.md`
- Modify: `skills/wp-ai-client/references/embedding-builder.md`
- Modify: `docs/upstream-sync.md`

**Interfaces:**

- Consumes: WordPress plugin headers, theme headers, Composer manifests, and PHP source.
- Produces: a detector that reports valid floors and real API usage, exits nonzero for a missing root, and distinguishes `require` from `require-dev`.

- [x] Extend the runtime-hygiene fixture with a docblock containing a false `Requires at least:` sentence after the first 8 KiB, official-provider-style `require-dev`, SDK static calls, a local function definition, and a nonexistent root. Run the focused assertion and confirm the current detector fails for the expected reasons.
- [x] Limit header parsing to the first 8 KiB and anchored header lines, ignore the detector's own API definitions, recognize `AiClient::prompt()` and static generation calls, classify only production Composer requirements as vendored runtime dependencies, and reject a missing root.
- [x] Correct the function-calling example to preserve the original user message before the model message. Validate inline data URIs before `esc_attr()`, guard remote files with `isRemote()`, document the cache-group filter, and complete stripped image metadata.
- [x] Replace the conditional whole-plugin autoloader example with Core-or-prefixed dependency guidance and `class_exists( \WordPress\AiClient\AiClient::class )` runtime gating.
- [x] Mark WP AI Client 0.4.0 final, deprecated, and archived; retain only its still-active REST/JavaScript compatibility surface. Pin embedding APIs to the 1.4.0 release.
- [x] Run the focused detector assertion, the wp-ai-client behavioral scenario, skill validation, and `git diff --check`.

### Task 2: Correct wp-ai-connectors and wp-ai-plugin

**Files:**

- Modify: `eval/harness/release-conformance.mjs`
- Modify: `skills/wp-ai-connectors/SKILL.md`
- Modify: `skills/wp-ai-connectors/references/provider-registration.md`
- Modify: `skills/wp-ai-plugin/SKILL.md`
- Modify: `skills/wp-ai-plugin/references/guidelines-integration.md`
- Modify: `skills/wp-ai-plugin/references/hooks-and-filters.md`
- Modify: `skills/wp-ai-plugin/references/experiments-framework.md`

**Interfaces:**

- Consumes: WordPress 7.1 connector registry behavior and WordPress/ai 1.3.0 source.
- Produces: version-bounded compatibility guidance with exact authentication, Guidelines, hook, and registration behavior.

- [x] Add focused conformance checks for the WordPress 7.1-only `application_password` method, the Gutenberg 23.6+ Guidelines failure, the exact Core timeout filter, and the missing credential short-circuit hook. Confirm RED.
- [x] Remove every Gutenberg-on-7.0 `application_password` fallback claim. Correct key ownership, registration timing under Gutenberg, connector lookup notices, metadata-directory cache identity, model metadata fields, provider registration timing, Akismet visibility, and #64789 attribution.
- [x] State that WordPress/ai 1.3.0 Guidelines work only with Gutenberg 23.0 through 23.5.x when the experiment is enabled; document the 23.6+ `wp_knowledge` mismatch and unreleased PR #988 fix.
- [x] Correct `AI_EXPERIMENTS_*`, `wp_supports_ai()` bootstrap failure, timeout and content-length defaults, Type Ahead classification, hook signatures and inventory, Guidelines query details, wrapper registration ownership, and source attributions.
- [x] Run focused connector/plugin assertions, both behavioral scenarios, both skill validations, and `git diff --check`.

### Task 3: Repair wp-abilities-api and MCP Adapter Guidance

**Files:**

- Modify: `eval/harness/release-conformance.mjs`
- Modify: `eval/scenarios/abilities-mcp-expose.json`
- Modify: `skills/wp-abilities-api/SKILL.md`
- Modify: `skills/wp-abilities-api/references/client-side.md`
- Modify: `skills/wp-abilities-api/references/input-schema-gotchas.md`
- Modify: `skills/wp-abilities-api/references/rest-api.md`
- Modify: `skills/wp-abilities-api/references/execution-lifecycle.md`
- Modify: `skills/wp-abilities-api/references/php-registration.md`
- Modify: `skills/wp-abilities-api/references/mcp-exposure.md`

**Interfaces:**

- Consumes: WordPress 7.1 Script Modules, Abilities REST behavior, and MCP Adapter 0.6.1.
- Produces: copyable client bootstrap and supported plugin-install integration.

- [x] Add focused checks that the plugin module declares `@wordpress/core-abilities` as a dynamic dependency, enqueues `wp-data`, `wp-api-fetch`, and `wp-url`, and recommends the canonical MCP Adapter plugin with `Requires Plugins` and `class_exists()` guards. Confirm RED.
- [x] Correct WordPress/PHP floors, the 7.1 prerelease gate, normalization wording, raw-registry privacy, form-encoded type error, and multi-version `show_in_rest`/`public` advice.
- [x] Replace the sibling module enqueue with an actual dependency; explain static import evaluation accurately; enqueue required classic scripts; correct readiness failure, JS name, AJV default, and readonly transport guidance.
- [x] Replace Composer-first MCP installation with the recommended plugin path. Mark Composer bundling legacy; correct authentication, CLI global options, caught STDIO errors, server parameter arity, skipped-name logging, and default endpoint.
- [x] Run focused Abilities/MCP assertions, behavioral scenarios, skill validation, and `git diff --check`.

### Task 4: Reconcile wp-abilities-audit and wp-abilities-verify

**Files:**

- Modify: `eval/harness/release-conformance.mjs`
- Modify: `skills/wp-abilities-audit/SKILL.md`
- Modify: `skills/wp-abilities-audit/references/audit-schema.md`
- Modify: `skills/wp-abilities-audit/references/capability-gate-tracing.md`
- Modify: `skills/wp-abilities-audit/references/controller-enumeration.md`
- Modify: `skills/wp-abilities-verify/SKILL.md`
- Modify: `skills/wp-abilities-verify/references/annotation-correctness.md`
- Modify: `skills/wp-abilities-verify/references/audit-schema-validation.md`
- Modify: `skills/wp-abilities-verify/references/permission-roundtrip.md`
- Modify: `skills/wp-abilities-verify/references/static-enumeration.md`

**Interfaces:**

- Consumes: the shared audit schema and runtime harness contract.
- Produces: identical audit/verify rules and honest runtime-only reporting.

- [x] Add focused checks for schema-less reference abilities, the runtime-harness-only report section, WooCommerce capability boundaries, and canonical terminology. Confirm RED.
- [x] Add missing `input_schema` as a reference-ability failure; correct mechanism names, example revision dates, conditional rationale, report section names, and the wordpress-develop path.
- [x] Retitle WP-CLI enumeration, add the runtime-only report section, correct the seven-shape count, distinguish Core's strict readonly definition from the skill's relaxed audit interpretation, and scope WooCommerce claims to verified source.
- [x] Run focused audit/verify assertions, both behavioral scenarios, both skill validations, and `git diff --check`.

### Task 5: Advance Gutenberg and Harden Release Maintenance

**Files:**

- Modify: `shared/references/gutenberg-releases.json`
- Modify: `.github/state/last-sync.json`
- Modify: `shared/scripts/update-upstream-indices.mjs`
- Modify: `.github/workflows/upstream-sync.yml`
- Modify: `.github/workflows/ai-skill-maintenance.yml`
- Modify: `eval/harness/release-conformance.mjs`
- Modify: `skills/wp-abilities-api/SKILL.md`
- Modify: `skills/wp-ai-connectors/SKILL.md`
- Modify: `skills/wp-ai-plugin/SKILL.md`
- Modify: `README.md`
- Modify: `docs/skill-audit.md`
- Modify: `docs/upstream-sync.md`
- Modify: `skills/wordpress-router/SKILL.md`

**Interfaces:**

- Consumes: the canonical upstream registry, release indices, and `GITHUB_TOKEN` when present.
- Produces: authenticated GitHub requests, derived conformance baselines, and a synchronized schema-3 state file.

- [x] Add a failing updater contract proving GitHub requests receive `Authorization: Bearer <token>` only when a token is present, while non-GitHub requests and tokenless local use remain unchanged.
- [x] Pass `GITHUB_TOKEN` from both workflows, build request headers from the environment without logging the token, and pass focused normalization tests.
- [x] Run the deterministic updater; verify that only Gutenberg advances to v23.9.0. Advance the three verified-through markers and related prose based on the audit's tag diff.
- [x] Replace literal current-version baselines in the harness with values read from `CORE_AI_UPSTREAMS` and committed indices where this preserves independent drift tests.
- [x] Mark the archived WP AI Client source, correct README/router discovery copy, and resolve the stale `docs/skill-audit.md` findings.
- [x] Recompute `.github/state/last-sync.json`; require exact equality with `--print-state-hash`.

### Task 6: Final Verification and Review

**Files:**

- Review: every modified and new file in the final diff.

**Interfaces:**

- Consumes: final working tree.
- Produces: verification evidence without publishing or changing remote state.

- [x] Run `skills-ref validate` for all skill directories and the six focused Core AI skills.
- [x] Run every Core AI scenario and the strict `node eval/harness/run.mjs` gate.
- [x] Run `node shared/scripts/check-upstream-drift.mjs` and `node shared/scripts/ai-generate-updates.mjs --print-state-hash`; require current declarations and matching state.
- [x] Run `git diff --check`, inspect `git diff --stat`, review the complete diff, and confirm the audit evidence remains present.
- [x] Report any environment-only limitation separately, especially the existing GitHub billing lock and live workflow execution.
