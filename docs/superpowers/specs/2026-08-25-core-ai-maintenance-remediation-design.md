# Core AI Maintenance Remediation Design

**Date:** 2026-08-25

## Goal

Restore the existing upstream-maintenance workflows, close the confirmed validation gaps, and correct the WordPress Core AI skill inaccuracies enumerated below without redesigning the repository's maintenance system.

## Scope

This is a targeted patch release. Keep the deterministic upstream-index workflow and the advisory AI-maintenance workflow separate. Reuse the existing registry, updater, drift checker, release harness, and evaluation structure.

In scope:

- remove the AI workflow's artifact hand-off for upstream indices and deterministically refresh them in each consuming job;
- compare a canonical upstream-state hash across jobs so a release arriving mid-run fails closed instead of mixing snapshots;
- keep the deterministic `upstream-sync.yml` workflow as the sole scheduled index owner;
- stop the two scheduled workflows from rewriting the same pull-request branch;
- make the 1.9.0 release assertion a version floor while requiring synchronized manifests and notes for the version currently shipped;
- make each release-backed registry entry internally consistent by either declaring a real version dependency or narrowing an over-broad `affectedSkills` list;
- keep `--skip-upstream-drift` limited to the expected index-ahead-of-skill condition;
- validate every directory under `skills/` with `skills-ref`;
- correct each concrete skill, reference, and documentation error enumerated in the 2026-08-25 audit response;
- publish the corrections as plugin version 1.9.1.

Out of scope:

- combining the two workflows;
- adding a new scheduler, service, dependency, or AI provider;
- autonomous AI-authored skill pull requests or version bumps;
- allowing generated prose without tagged-source evidence;
- broad rewriting of unaffected WordPress skills; and
- changing upstream versions unless a fresh deterministic refresh finds a real release change; and
- mutating WordPress/agent-skills PR #92, whose branch and base-repository diff are currently active.

## Design

### 1. Workflow reliability

Delete `workspace-with-indices`. The refresh job updates every index, computes the canonical state hash already defined by `getUpstreamStateHash()`, and exposes that hash as a job output. `generate-updates` and `create-index-pr` each start from a clean checkout, run `update-upstream-indices.mjs` themselves, recompute the hash, and stop if it differs from the refresh job's value. This follows the working `upstream-sync.yml` model and removes dependency on `upload-artifact` path-root semantics.

Keep `upstream-sync.yml` on `chore/core-ai-upstream-indices`. Move the AI workflow's index-only fallback to `chore/ai-maintenance-upstream-indices` and give it a distinct title. Do not alter reviewer-owned commits on either branch.

Remove the weekly schedule from `ai-skill-maintenance.yml`. `upstream-sync.yml` remains the weekly deterministic path; AI maintenance remains available through `workflow_dispatch` and `repository_dispatch`. This avoids two routine PRs containing the same index diff and stops scheduled failures while `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` are not configured. The workflow documents those settings as optional for index refresh but required for advisory analysis.

The current generator has no tagged-file ingestion path: detected changes always carry `taggedFiles: []`, so its evidence gate permits review recommendations but not source-backed edits. Remove the unreachable AI-generated skill PR job instead of building credentials, release automation, and CI around a path that cannot produce a valid edit. A future autonomous-editing change is separate work and must first design tagged-source ingestion, current-version release notes, non-`GITHUB_TOKEN` CI triggering, and version-conflict handling.

The remaining index-only PR uses `UPSTREAM_SYNC_TOKEN || GITHUB_TOKEN` and discloses its token mode, matching `upstream-sync.yml`. It runs non-drift validation in-job; with the preferred token, ordinary PR CI also runs. The 1.9.0 release assertion becomes `assertReleaseFloor`, not `assertRelease190`.

### 2. Enforcement coverage

Add regression assertions before changing behavior. Cover:

- removal of `workspace-with-indices`, deterministic refresh in every consuming job, and fail-closed state-hash comparison;
- non-colliding branch names and one scheduled owner;
- absence of an autonomous generated-skill PR until tagged-source ingestion exists;
- a release version above 1.9.0 passing the floor while a lower version fails;
- equal plugin and marketplace versions plus `docs/release-notes-<current-version>.md`;
- every release-backed `affectedSkills` entry having one drift declaration after false dependencies are removed;
- undeclared markers being detected even when no other declaration caused that skill to be loaded;
- `--skip-upstream-drift` suppressing only `upstream-newer`, while invalid indices, missing or duplicate markers, and `declaration-ahead` still fail; and
- CI enumerating all skill directories rather than maintaining a partial list.

The WordPress/Gutenberg HTML version map remains exempt from release-marker completeness because it has no single release version.

For the current registry, add declarations where the version dependency is real: Gutenberg for `wp-ai-connectors`, MCP Adapter for `wp-ai-plugin`, and PHP AI Client for `wp-ai-plugin`. Remove `wp-ai-client` from the WordPress/ai and three provider `affectedSkills` lists because it makes no version-specific claim about those releases. Do not add four ornamental markers to its frontmatter.

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

Also include the eleven findings added during design review:

- detect a theme's `Requires at least` header in `style.css` as well as plugin PHP headers;
- correct the `wp-abilities-api` description's 6.9 versus 7.1 lifecycle-hook list;
- make the reference-ability lint fail when the input schema itself is absent;
- reconcile the conflicting `capability_gate` string-form guidance;
- handle a nullable `File::getDataUri()` and the URL-backed file path;
- state the lowercase alphanumeric-and-dashes ability-name rule that rejects underscores;
- narrow the client-side `serverRegistered` warning to unregistration, since registration checks it;
- state that MCP `serve` selects the first registered server when `--server` is omitted;
- remove the false claim that the connector registry class labels application passwords `@since 7.1.0`;
- replace the non-portable `wp-ai-plugin` triage command and enforce the portable form; and
- derive Packagist release URLs from registry/package metadata instead of hard-coding PHP AI Client.

Remove the tracked AI plugin smoke output, ignore the runtime result, and clean it on exit so a smoke run cannot dirty the repository or masquerade as committed evidence.

Examples will use abilities that actually exist at the stated release or clearly label plugin-owned placeholder abilities. No marker advances without source review.

### 4. Release and documentation

Set both plugin manifests to 1.9.1 and add concise 1.9.1 release notes covering workflow reliability, validation changes, and corrected guidance. `assertReleaseFloor` requires the two manifests to match and requires the release-notes file named by that exact version. Add a concise 2026-08-25 remediation record and mark the 2026-08-24 snapshot as superseded for current-state claims while preserving its historical evidence.

Version 1.9.1 is a manual coordinated release. Because autonomous generator bumps are out of scope, concurrent generated PRs cannot claim the same version. If autonomous releases are designed later, a stale version conflict must require rebasing and recomputing the version before merge.

## Failure handling

- An upstream fetch or normalization failure writes no index.
- A state-hash mismatch between jobs stops the run and asks for a clean rerun.
- Missing AI configuration skips advisory analysis with a redacted category; manual or repository-dispatch index refresh remains provider-independent.
- A source claim that cannot be confirmed is left unchanged and reported as unresolved; it is not guessed.
- A failing baseline or regression check stops the relevant slice before later edits.

As of the design review, PR #92's two files are byte-identical to this fork's `trunk`, but not to the `WordPress/agent-skills` base branch. Its `refs/heads/chore/upstream-indices` branch exists and the upstream PR still has a two-file diff. It is therefore not a zombie PR and this remediation must not close it.

## Verification

Use test-first regression cycles for harness and workflow behavior. For skill prose, run the existing behavioral scenarios before and after the edits and add narrow assertions for the corrected contracts.

Final verification consists of:

1. an integration check using independent clean checkouts: refresh, compute the state hash, refresh again downstream, and prove the hashes match without transferring index files;
2. a live `workflow_dispatch` of the pushed remediation ref with `force=true`, confirming the downstream refresh/hash gate and provider-independent fallback behavior;
3. the strict evaluation harness and standalone drift checker;
4. all Core AI behavioral scenarios and the AI plugin smoke fixture where the environment supports it, followed by a clean status check;
5. skillpack build and install smoke tests;
6. `skills-ref validate` for every skill directory;
7. exact-current-version release-note and manifest validation, including Claude CLI validation when available;
8. inspection of the final diff and repository status; and
9. independent review of the complete change set.

No result is described as complete unless its corresponding command has run successfully in the final revision.
