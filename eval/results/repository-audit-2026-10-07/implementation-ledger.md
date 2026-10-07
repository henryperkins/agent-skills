# SDD ledger — plan: docs/superpowers/plans/2026-10-07-repository-audit-remediation.md

Base: fe2e33c8bff665349f2a3a30c0d565bb912087d5
Pre-flight: Task 1 and Task 3 add regression runners consumed by the standard harness in Task 4. Existing report fields and registry declaration labels are retained.
Task 1: in progress. Audit probe before implementation: 0 passed, 6 failed; saved in before-probes.json.
Task 2: online index refresh succeeded for all ten registry sources. Source verification pending for advanced declarations.
Ruling: Use local candidate changes and read-only GitHub diagnostics; do not dispatch or publish remote workflows. This implements the requested repository fixes without triggering the maintenance workflow's writes.
Baseline: Standard harness fails on Windows because feature_endpoints uses native path separators while its contract expects assets/sdk.php; trace confirmed in detect_ai_client.mjs.

Task 1: complete — detector regressions 14/15 failures before fixes, 17/17 pass after fixes; six audit probes now pass.
Task 2: complete — source tags inspected before markers; 7/7 direct Core cases and 22/22 drift checks pass.
Task 3: complete — original 3 workflow-gate failures now 7/7 pass; portable launch and routes verified.
Task 4: complete — Node 20/24 full harness, 24 MJS and 2 PHP syntax checks, 22 official validators, 5 package/install copies of 133 files, and 3 actionlint workflows pass.
Final: fixed all 3 Important and 1 Minor review findings; guidance guards RED to GREEN, maintenance preview 3/7 failures to 7/7 pass, full harness green. Five complete CLI preview cases passed with unchanged recorded baseline.
Final: two independent skill exercises completed with raw outputs archived. No second reviewer pass; no deferred minors.
Ruling: Preserve the local branch/worktree and leave hosted/live/publication claims unverified; cost is that hosted recovery requires account unlock and a subsequent authorized run.
