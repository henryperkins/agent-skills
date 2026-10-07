# Repository Audit Remediation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task, then request a fresh whole-change review.

**Goal:** Verify the October 7 audit and correct supported repository findings without publishing or dispatching remote workflows.

**Architecture:** Preserve self-contained skill helpers, add executable fixture coverage to the standard harness, and source instruction changes from exact upstream release tags. Keep generated index refreshes separate from claims of source review and hosted success.

**Tech Stack:** Node.js ESM, PHP CLI for the frozen Core execution fixture, Markdown, GitHub Actions YAML.

**Spec:** The supplied `agent-skills-repository-audit-2026-10-07.md` (SHA-256 `6acd389a89975cd932a5a837dcf68c53d0c1eaa975282bc503183aea552cf3c4`), against base `fe2e33c8bff665349f2a3a30c0d565bb912087d5`.

## Global Constraints

- Retain all 22 skills and existing WordPress/PHP compatibility floors unless tagged source changes them.
- Core release markers compare at minor granularity; other registry declarations compare at patch granularity.
- Do not execute live provider requests, publish, push, create PRs, dispatch workflows, or change installed plugins.
- Preserve dated historical behavioral evidence and record this candidate's checks separately.

## Review Focus

- Theme roots without `theme.json`, legacy index paths, nested roots, and classic PHP parts must classify correctly.
- Plugin fixtures and a parent directory's templates must not relabel a different detected theme.
- A declared PHPUnit dependency must not imply an installed executable.
- Installed helper launch paths must scan an unrelated target directory, including paths with spaces.
- Dry run with changed indices must suppress every branch/PR write even when advisory generation is skipped.

### Task 1: Detector behavior and installed launches (A03/A04/A05/A08)

**Files:** `skills/wp-project-triage/scripts/detect_wp_project.mjs`, `skills/wp-block-themes/scripts/detect_block_themes.mjs`, `skills/wp-ai-client/scripts/detect_ai_client.mjs`, their entrypoints, `eval/harness/detector-regressions.mjs`, `eval/harness/run.mjs`.

**Interfaces:** Helpers retain their JSON reports and process working-directory scan contract; executable fixtures run through `runDetectorRegressions(repoRoot)`.

- [x] Add fixtures for the audit's six failures, legacy/nested/decoy roots, declared vs installed PHPUnit, and independent installed launches.
- [x] Run `node eval/harness/detector-regressions.mjs`; expect the original detector failures.
- [x] Implement root-based readable-index detection, the actual Composer key, portable output paths, and absolute installed helper guidance.
- [x] Run the detector fixtures; expect all pass, and integrate them into the standard harness.

### Task 2: Released guidance and permission execution (A01/A02/A08/A09)

**Files:** Affected Abilities and AI entrypoints/references, `shared/references/*.json`, `eval/harness/ability-execution.php`, frozen Core fixture and provenance.

**Interfaces:** Existing compatibility declarations remain the drift gate; exact release sources establish reviewed changes, and the PHP fixture exercises Core's real execution order.

- [x] Review Core 7.1.3, Gutenberg 24.1.0, MCP Adapter 0.7.0, AI 1.4.0, and Anthropic provider 1.0.5 against affected guidance.
- [x] Exercise direct Core PHP permission rejection and pre-execution replacement; demonstrate that the unconditional permission guarantee is false.
- [x] Correct current vs legacy Adapter guidance, short-circuit responsibilities, AI release changes, and verified declarations only after source review.
- [x] Run the PHP regression and `node shared/scripts/check-upstream-drift.mjs --format json`; expect the reviewed indices and declarations to agree.

### Task 3: Workflow, installation, and routing (A06/A07/A10/A11)

**Files:** `.github/workflows/ai-skill-maintenance.yml`, workflow regression coverage, `README.md`, router decision tree, WPDS entrypoint.

**Interfaces:** Preview jobs may refresh local runner files and upload reports; the only external write action must require dry run to be false.

- [x] Add dry-run/changed-index workflow cases and run them; expect dry run to permit the original PR job incorrectly.
- [x] Gate PR writes, use this fork in fork installation examples, route absent skills to available references, and qualify WPDS verification by host capability.
- [x] Run workflow regression cases and the harness; expect correct dry-run behavior.

### Task 4: Candidate validation and evidence (all findings)

**Files:** `docs/repository-audit-remediation-2026-10-07.md`, candidate evidence under `eval/results/`, both Claude distribution manifests, release notes.

**Interfaces:** The release version must advance with changed skills; candidate evidence identifies source hashes without relabeling historical runs as current.

- [x] Diagnose Actions using read-only run/check annotations and record any external blocker with a direct URL.
- [x] Advance manifests together, run the full harness, syntax, all five packaging/install targets, and available official frontmatter validation.
- [x] Request a fresh whole-change review and realistic skill exercises; repair supported important findings and rerun their checks.
- [x] Record each audit finding's verification, fix, and limits; leave the completed local change reviewable on the attached worktree branch.
