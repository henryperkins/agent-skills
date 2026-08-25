# Core AI Maintenance Remediation Design

**Date:** 2026-08-25

## Goal

Restore the existing upstream-maintenance workflows, close the confirmed validation gaps, and correct the WordPress Core AI skill inaccuracies enumerated below without redesigning the repository's maintenance system.

## Scope

This is a targeted patch release. Keep the deterministic upstream-index workflow and the advisory AI-maintenance workflow separate. Reuse the existing registry, updater, drift checker, release harness, and evaluation structure.

In scope:

- preserve `shared/references/**` across the AI workflow's artifact hand-offs;
- preserve refreshed indices in both index-only and generated-update pull requests;
- stop the two scheduled workflows from rewriting the same pull-request branch;
- make the 1.9.0 release assertion a version floor and make generated skill updates carry a synchronized patch-version bump;
- validate every release-index dependency declared by an affected Core AI skill;
- keep `--skip-upstream-drift` limited to the expected index-ahead-of-skill condition;
- validate every directory under `skills/` with `skills-ref`;
- correct each concrete skill, reference, and documentation error enumerated in the 2026-08-25 audit response;
- publish the corrections as plugin version 1.9.1; and
- close obsolete PR #92 only after verifying that its head branch is gone and that the replacement workflow branch names cannot collide.

Out of scope:

- combining the two workflows;
- adding a new scheduler, service, dependency, or AI provider;
- allowing generated prose without tagged-source evidence;
- broad rewriting of unaffected WordPress skills; and
- changing upstream versions unless a fresh deterministic refresh finds a real release change.

## Design

### 1. Workflow reliability

Change the first AI-maintenance artifact upload from a single stripped directory to a root-preserving `shared/references/**` path. Both download jobs continue restoring artifacts at the repository root. The generated-update pull request must include `shared/references/**` as well as skills, sync state, and synchronized plugin manifests.

Keep `upstream-sync.yml` on `chore/core-ai-upstream-indices`. Move the AI workflow's index-only fallback to `chore/ai-maintenance-upstream-indices` and give it a distinct title. Do not alter reviewer-owned commits on either branch.

The generated-update checkout uses full history. When the generator actually writes a skill, it also increments the plugin's patch version and writes the same value to both plugin manifests. This is a small deterministic operation in the existing generator, not a new release subsystem. The release harness treats 1.9.0 as the minimum supported release and continues requiring the 1.9.0 evidence document.

### 2. Enforcement coverage

Add regression assertions before changing behavior. Cover:

- root-preserving artifact paths and non-colliding branch names;
- generated PR inclusion of indices and both manifests;
- a release version above 1.9.0 passing the floor while a lower version fails;
- synchronized patch-version generation;
- every release-backed `affectedSkills` entry having one drift declaration;
- undeclared markers being detected even when no other declaration caused that skill to be loaded;
- `--skip-upstream-drift` suppressing only `upstream-newer`, while invalid indices, missing or duplicate markers, and `declaration-ahead` still fail; and
- CI enumerating all skill directories rather than maintaining a partial list.

The WordPress/Gutenberg HTML version map remains exempt from release-marker completeness because it has no single release version.

### 3. Source corrections

Verify every correction against tagged executable source or tests at the versions in the committed indices before editing prose. Apply only the enumerated corrections:

- replace the nonexistent `core/get-attachment` and `core/update-attachment` examples;
- document the real `mcp_adapter_validation_enabled` call shapes safely;
- distinguish PHP schema defaults from JavaScript default injection;
- explain that `@wordpress/core-abilities` `ready` settles even when initialization catches a failure;
- correct capability mapping and the author-sensitive shop-order write capability;
- document connector credential validation and key-clearing behavior;
- remove the claim that arbitrary authentication fields survive registry normalization;
- complete the public WordPress/ai 1.3.0 hook inventory identified by the audit, including request-log retention behavior;
- add missing upstream markers for skills that already depend on those release surfaces;
- correct the WordPress/ai 1.2.0 path pin, gated-ability source path, run-route path, and stale Gutenberg verification note;
- distinguish filtered `wp_get_abilities()` output from the raw registry in `wp-abilities-verify`; and
- update the current audit snapshot and complete skill inventory.

Examples will use abilities that actually exist at the stated release or clearly label plugin-owned placeholder abilities. No marker advances without source review.

### 4. Release and documentation

Set both plugin manifests to 1.9.1 and add concise 1.9.1 release notes covering workflow reliability, validation changes, and corrected guidance. Add a concise 2026-08-25 remediation record and mark the 2026-08-24 snapshot as superseded for current-state claims while preserving its historical evidence.

## Failure handling

- An upstream fetch or normalization failure writes no index.
- AI configuration or generation failure still leaves the deterministic index-only route available.
- A source claim that cannot be confirmed is left unchanged and reported as unresolved; it is not guessed.
- A failing baseline or regression check stops the relevant slice before later edits.
- PR #92 is not closed if its branch or contents are still active.

## Verification

Use test-first regression cycles for harness and workflow behavior. For skill prose, run the existing behavioral scenarios before and after the edits and add narrow assertions for the corrected contracts.

Final verification consists of:

1. a fresh upstream-index refresh in an isolated copy, proving either an empty diff or explicitly reviewed release changes;
2. the strict evaluation harness and standalone drift checker;
3. all Core AI behavioral scenarios and the existing AI plugin smoke fixture where the environment supports it;
4. skillpack build and install smoke tests;
5. `skills-ref validate` for every skill directory;
6. manifest validation when the Claude CLI is available;
7. inspection of the final diff and repository status; and
8. independent review of the complete change set.

No result is described as complete unless its corresponding command has run successfully in the final revision.
