# WordPress Skills 1.9.1

A maintenance and correctness release. It makes Core AI upstream maintenance
deterministic and artifact-free, closes the gaps that let stale guidance and
uncovered skills pass the gates, and corrects every source-verified defect from
the 2026-08-25 audit. Baselines are unchanged: WordPress Core 7.1, Gutenberg
23.8.0, WordPress/ai 1.3.0, MCP Adapter 0.6.1, PHP AI Client 1.4.0, WP AI Client
0.4.0, Anthropic 1.0.4, Google 1.1.1, and OpenAI 1.1.0.

Full ledger: `docs/core-ai-skills-audit-2026-08-25.md`.

## Workflow reliability

- AI Skill Maintenance is now **artifact-free**. No job uploads or downloads an
  index or workspace; each one reruns the deterministic updater and compares a
  canonical SHA-256 **state hash** from the new read-only
  `node shared/scripts/ai-generate-updates.mjs --print-state-hash`. A release that
  lands mid-run fails the run closed instead of shipping a mixed snapshot.
- `upstream-sync.yml` is the sole weekly scheduled index owner. AI maintenance runs
  on manual dispatch or an `upstream-release` repository dispatch only, and uses its
  own branch, `chore/ai-maintenance-upstream-indices`, so the two paths cannot
  collide.
- A repository with no AI credentials records a redacted `skipped` outcome and still
  opens the deterministic index pull request; it no longer fails the refresh.
- The unreachable generated-skill pull request job is removed. AI-authored skill PRs
  stay disabled until tagged upstream files can be supplied as evidence.
- Packagist release URLs come from registry metadata instead of a hard-coded
  `WordPress/php-ai-client` path.

## Enforcement coverage

- Every release-backed affected skill now carries exactly one **drift** declaration,
  and three missing markers were added at their existing baselines. Drift checks went
  from 18 to 21.
- `--skip-upstream-drift` no longer suppresses the whole report. The drift command
  always runs and its check count is always verified; only the expected
  `upstream-newer` failure is suppressed, so a broken index, a malformed marker, a
  duplicate declaration, or a marker ahead of the index still blocks.
- Drift collection reads every `skills/*/SKILL.md`, so a release marker in an
  undeclared skill is reported instead of ignored.
- CI validates every `skills/*` directory with `skills-ref` instead of a
  hand-maintained list of 11.
- The release gate asserts a version floor, manifest equality, and notes for the
  current version, rather than pinning an exact release that the next one would break.
- `docs/skill-set-v1.md` is now checked against the filesystem and lists all 21 real
  skills; the phantom "planned next skills" section is gone.

## Corrected Core AI guidance

All corrections below were confirmed against tagged executable source.

- **Abilities API** — seven hooks are new in 7.1 and two predate it; PHP and the
  client's AJV inject schema defaults in opposite directions; awaiting
  `@wordpress/core-abilities` `ready` proves the attempts settled, not succeeded;
  Core's ability-name regex rejects underscores; the run route is
  `/wp-abilities/v1/abilities/{name}/run`; `mcp_adapter_validation_enabled` needs
  optional callback parameters; and `wp mcp-adapter serve` without `--server` picks
  the first registered server.
- **Audit and verify** — `edit_others_shop_orders` is the author-sensitive
  `shop_order` write cap; the `map_meta_cap` default rule is stated with its actual
  condition; a single-capability `capability_gate` string is canonical and unwarned;
  a `reference_ability` with no `input_schema` now FAILs; and `wp_get_abilities()` is
  named the filtered view, with the raw registry compared before anyone reports a
  registration failure.
- **AI Client and connectors** — examples use abilities Core actually registers;
  `generate_image()` output is persisted safely whether the `File` carries an inline
  data URI or a remote URL; and connector guidance describes the real write-time
  path, including that a model-discovery timeout stores an empty string over the key.
- **WordPress/ai 1.3.0** — 20 previously undocumented hooks are documented with their
  arguments and file paths, the preferred-model filters are shown as active, retention
  `0` is stated to mean forever, and readers are pointed at the domain implementations
  behind the thin gated wrappers. One audit note was corrected against source:
  `wpai_request_log_tokens` is a filter, so the request-log surface is five filters
  plus one action.
- **Runtime hygiene** — the AI Client detector reads theme `style.css` headers, the
  `wp-ai-plugin` triage command is portable with a manual fallback, and the Playground
  **smoke output** is ignored and removed on every exit path so a run leaves the
  working tree clean.

## Verification

Ran and passed at the release revision:

- `node eval/harness/run.mjs` — the complete strict harness, including all 21 registry-derived drift checks.
- `node shared/scripts/check-upstream-drift.mjs` — 21 declarations current.
- `node shared/scripts/update-upstream-indices.mjs` — no index diff against the committed state.
- Two independent clean clones each refreshed indices and printed the **identical** canonical state hash, with no index copied between them and both worktrees left clean.
- The WordPress Playground smoke test — 0/5 gated abilities registered with Custom Abilities off, 5/5 with it on — and it left the working tree clean, with no `mu-plugins/result.json` behind.
- `skillpack-build.mjs` + `skillpack-install.mjs` for the Codex and VS Code targets, installing all 21 skills.
- `skills-ref validate` across all 21 skill directories.
- `node shared/scripts/ai-generate-updates.mjs --check-config`, which reported the expected `missing-api-key` without a network call.

**Did not run — stated as not run, not implied:**

- **The live workflow acceptance test did not execute.** The reworked `AI Skill Maintenance` workflow was pushed and dispatched successfully, and GitHub created the run with exactly the intended three-job graph (`refresh-indices`, `generate-updates`, `create-index-pr`, and no generated-skill PR job). **No step ran**: GitHub refused to start a runner with "The job was not started because your account is locked due to a billing issue." Evidence: [run 32865822278](https://github.com/henryperkins/agent-skills/actions/runs/32865822278) — `refresh-indices` failed in 3s with an empty `steps` array, `generate-updates` and `create-index-pr` skipped. The `CI` run on the same push failed identically with zero steps, and the pre-existing scheduled runs fail the same way, so this is fork Actions billing rather than the new YAML — but the runtime behaviour (index refresh, state-hash comparison, redacted advisory skip, artifact upload) remains **unverified on a real runner**. The workflow's structure and expression validity were verified offline instead, by YAML parse and by `assertAiMaintenanceWorkflow()`.
- **The advisory analysis path was not exercised with live credentials.** This repository has no `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` configured; only the redacted-skip path was checked.
- **The 14 Core AI behavioural scenarios were reviewed, not all passed.** Two pass outright; the rest have unmet criteria. The great majority of those are pre-existing gaps between a single-shot response and a richly specified scenario — two scenarios require a plugin checkout that does not exist in this environment, and many criteria predate this release. Every criterion this release added was re-run after a targeted fix and is satisfied.
