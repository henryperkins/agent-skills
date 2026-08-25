# Core AI Skills Maintenance Remediation — 2026-08-25

Current evidence snapshot for the six Core AI skills (`wp-abilities-api`,
`wp-abilities-audit`, `wp-abilities-verify`, `wp-ai-client`, `wp-ai-connectors`,
`wp-ai-plugin`) plus the maintenance and enforcement machinery that keeps them
honest. It supersedes `docs/core-ai-skills-audit-2026-08-24.md` for current-state
claims; that document remains the historical record of the 1.9.0 revalidation and
is not rewritten.

## Authority rule

Unchanged from the 2026-08-24 audit, and applied literally below: executable code
at the released tag, then tests shipped at that ref, then the release
changelog/readme, then handbook and announcement prose. Where this ledger
contradicts an earlier note, it is because tagged source contradicted the note.

## Two tiers of evidence, kept apart

This document deliberately separates two things that are easy to conflate:

- **Verified source facts.** Read off an `apply_filters()` / `do_action()` call
  site, a class method, or a registration in a named upstream tag. Every entry in
  "Source-verified corrections" carries the file it came from.
- **Workflow acceptance evidence.** What a run of the harness, the drift gate, the
  Playground smoke, or a dispatched GitHub Actions workflow actually produced.
  Recorded in `docs/release-notes-1.9.1.md` under verification, not here.

A green harness is not a source fact, and a source fact is not proof the workflow
ran. Do not promote one into the other.

## Baselines held

WordPress Core 7.1, Gutenberg 23.8.0, WordPress/ai 1.3.0, MCP Adapter 0.6.1,
PHP AI Client 1.4.0, WP AI Client 0.4.0, Anthropic 1.0.4, Google 1.1.1, and
OpenAI 1.1.0. No `verified through` marker was advanced past its 1.9.0 value; the
three markers added in this release
(`wp-ai-connectors` → Gutenberg, `wp-ai-plugin` → MCP Adapter and PHP AI Client)
were added *at* those existing baselines to close declaration gaps, not to claim
new verification.

## Maintenance and enforcement corrections

| Finding | Fix |
| --- | --- |
| The advisory AI workflow flattened index state through a `workspace-with-*` artifact, so a consumer job could act on a stale snapshot. | Every job now reruns `update-upstream-indices.mjs` itself and compares a canonical SHA-256 upstream-state hash from the new read-only `ai-generate-updates.mjs --print-state-hash`. A mismatch fails the run closed. No index artifact is transferred. |
| Two workflows owned a weekly schedule and shared the `chore/core-ai-upstream-indices` branch. | `upstream-sync.yml` is the sole scheduled index owner; AI maintenance is `workflow_dispatch` / `repository_dispatch` only and uses the distinct branch `chore/ai-maintenance-upstream-indices`. |
| Missing AI credentials failed the advisory job rather than skipping it. | `--check-config` is inspected before the SDK is installed; an unconfigured repository records outcome `skipped` with a redacted category and still opens the deterministic index PR. |
| The generated-skill PR job was unreachable — detected changes always carry `taggedFiles: []`, so the evidence gate could never be satisfied. | The job is removed. **AI-authored skill pull requests remain disabled** until tagged upstream files can be supplied to the generator. |
| The Packagist release URL was hard-coded to `WordPress/php-ai-client`. | `normalizePackagistVersions()` now requires a `releaseUrlBase` from registry metadata and throws without one. |
| Six affected skills had no drift declaration, so their indices could advance forever without turning anything red. | The registry now requires exactly one declaration per release-backed affected skill (the HTML version map is exempt — it has no single release version), and the three missing markers were added. Drift checks went from 18 to 21. |
| `--skip-upstream-drift` suppressed the whole drift report. | The drift command always runs and its check count is always verified; `getBlockingUpstreamFailures()` suppresses only `upstream-newer`. A broken index, malformed marker, duplicate declaration, or marker ahead of the index still blocks. |
| Drift collection read only declaration-owned skills, so a release marker in an undeclared skill was invisible. | Collection reads every `skills/*/SKILL.md` and reports `unregistered-marker`. |
| CI validated 11 of 21 skills with a hand-maintained `skills-ref` list. | CI enumerates `skills/*`. |
| An exact `1.9.0` release pin would block the next release. | `assertReleaseVersionAtLeast()` asserts a floor, manifest equality, and notes for the *current* version. |
| The AI Client detector ignored theme `style.css`, so a block theme requiring 7.1 reported no floor. | The detector reads plugin PHP and `style.css` for headers, and scans AI usage only in PHP. |
| `wp-ai-plugin` told readers to run a checkout-relative triage path. | It now resolves the installed `wp-project-triage` skill directory and documents a manual fallback; the harness rejects both checkout-relative forms outside `wp-project-triage` itself. |
| The Playground smoke left `mu-plugins/result.json` in the working tree. | The path is ignored at the repository root and `run.sh` removes it on every exit path. The file was never tracked in git, so no deletion was required. |

## Source-verified corrections

Every row was confirmed against the named tag before the guidance changed.

**WordPress Core 7.1** (`src/wp-includes/abilities-api/class-wp-ability.php`, `class-wp-abilities-registry.php`, `abilities-api.php`, `class-wp-post-type.php`, `connectors.php`, `class-wp-connector-registry.php`)

- Seven execution hooks are new in 7.1; `wp_before_execute_ability` and
  `wp_after_execute_ability` shipped in 6.9 and only gained a trailing `$ability`
  argument. The skill previously omitted `wp_ability_normalize_input` and
  `wp_ability_execute_result` from its summary and blurred the 6.9/7.1 split.
- Ability names are validated by `/^[a-z0-9-]+\/[a-z0-9-]+$/`; underscores are
  rejected and registration returns `null` before `wp_register_ability_args`.
- PHP applies only a **root** schema `default`, and only when input is `null`.
- `WP_Ability::validate_input()` guards on `null === $input`, so a schema-less
  ability accepts `execute()` but returns `WP_Error( 'ability_missing_input_schema' )`
  for `execute( array() )`. The verify skill now FAILs a schema-less reference ability.
- `wp_get_abilities()` is the ecosystem-filtered view — `wp_get_abilities_item_include`
  and `wp_get_abilities_result` always run. The raw surface is
  `WP_Abilities_Registry::get_instance()->get_all_registered()`.
- Core 7.1 registers exactly `core/get-site-info`, `core/get-environment-info`, and
  `core/get-user-info`. `core/get-attachment` and `core/update-attachment`, used in
  two copyable examples, do not exist anywhere in Core 7.1.
- The run route is `/wp-abilities/v1/abilities/{name}/run`.
- `map_meta_cap` defaults to true only when `capability_type` is the string `post`
  or `page` and no `capabilities` array was passed. Because `capability_type`
  itself defaults to `post`, a CPT registered with no capability argument gets it
  without opting in; a custom `capability_type` never does.
- Saving an `ai_provider` API key validates **after** persistence, in
  `_wp_connectors_rest_settings_dispatch()` on `rest_post_dispatch`, via
  `isProviderConfigured()`. Anything but `true` runs `update_option( $setting_name, '' )`,
  with no server-side admin error.
- `WP_Connector_Registry::register()` rebuilds `authentication` from `method` plus
  an allow-list of `credentials_url`, `setting_name`, `constant_name`, and
  `env_var_name`; unknown keys are discarded silently. The registry class is
  `@since 7.0.0`; `application_password` is the 7.1 addition.

**Gutenberg 23.8.0** (`packages/abilities/src/validation.ts`, `api.ts`, `store/actions.ts`, `packages/core-abilities/src/index.ts`)

- AJV is constructed with `useDefaults: true` and mutates missing **property**
  defaults into the caller's own input object before the JS callback — the exact
  opposite of PHP. The root `default` is destructured out of the schema before
  compiling and never reaches the callback.
- `ready` resolves after both initialization attempts **settle**: both fetches are
  wrapped in `try/catch` that only logs, so an empty store after `await ready` can
  still mean an auth or network failure.
- `registerAbility()` reads `meta.annotations.serverRegistered` to avoid stamping
  `clientRegistered`; `unregisterAbility()` ignores the flag entirely, contradicting
  an `@throws` line in the `api.ts` JSDoc.

**MCP Adapter 0.6.1**

- `mcp_adapter_validation_enabled` is applied at eight sites: seven DTO sites pass
  one argument, and only `McpServer::__construct()` passes three. WordPress does not
  pad filter arguments, so a three-required-parameter callback is a fatal at the
  seven. Guidance now uses optional parameters.
- `wp mcp-adapter serve` without `--server` selects the **first registered** server
  (`array_values( $adapter->get_servers() )[0]`), not the default server.

**PHP AI Client 1.4.0** (`src/Files/DTO/File.php`)

- `getDataUri(): ?string` and `getUrl(): ?string` are both nullable and each return
  `null` in the other's case; `isRemote(): bool` and `getMimeType(): string` decide
  which is populated. The previous image-persistence example called `strlen()` on a
  possibly-null data URI.

**WordPress/ai 1.3.0**

- **20 previously undocumented hooks** from the 2026-08-25 audit's enumeration are
  now documented with their filtered value, additional arguments, and file path.
- One further correction to that audit, resolved against executable source:
  `wpai_request_log_tokens` is a **real filter** at
  `includes/Logging/Log_Data_Extractor.php:257` (`@since 1.0.0`), not a data key.
  The request-log surface is therefore **five** filters plus the
  `wpai_request_logged` action, not four. The similarly named `tokens_input` /
  `tokens_output` are the DB columns, which is where the misclassification came
  from. The audit's five-versus-four count is resolved in favour of five.
- Request-log retention defaults to `0`, and `0` disables cleanup and retains logs
  forever — `AI_Request_Log_Manager` schedules the daily cron only when the value
  is greater than zero and clears it at zero.
- `wpai_preferred_text_models`, `wpai_preferred_image_models`, and
  `wpai_preferred_vision_models` are active `apply_filters()` calls in
  `includes/helpers.php`; only their `ai_experiments_*` aliases are deprecated shims.
- `includes/Abilities/Gated/*.php` holds thin wrappers only. The schemas and
  permission callbacks live in `includes/Abilities/Content/Content.php`,
  `includes/Abilities/Users/Users.php`, `includes/Abilities/Settings/Settings.php`,
  and `includes/Abilities/Utilities/Posts.php`. The enablement gate is in
  `Features/Loader.php`, not in `Gated_Abilities.php`.
- **WooCommerce**: the author-sensitive `shop_order` write primitive is
  `edit_others_shop_orders`. `edit_shop_orders` is `cap->edit_posts` — checked when
  the user *is* the author, and aliased to `create_posts`.

## Disclosures

- **AI-authored skill pull requests remain disabled.** The generator's evidence gate
  requires supplied tagged files, and every detected change carries `taggedFiles: []`.
  Re-enabling requires tagged-file ingestion, not a workflow change.
- **1.9.1 is a manual, coordinated release.** Autonomous version bumps are not
  implemented and are not planned in this change. The marketplace freshness gate
  requires the manifest bump to land in the same commit as, or after, the shipped
  skill content.
- **Future autonomous version conflicts must rebase and recompute before merge.** If
  an automated branch and a manual release both touch `.claude-plugin/plugin.json`,
  the automated branch rebases onto the release, recomputes the freshness gate from
  the rebased history, and only then merges. Resolving the conflict by taking either
  side wholesale can leave `skills/` changes shipped under an unbumped version.
- **PR #92 was not mutated.** WordPress/agent-skills PR #92 and both reviewer-owned
  refresh branches were observed during this work and left untouched: no push, no
  comment, no label, no close.

## What this audit does not claim

- It does not claim any upstream release newer than the baselines above was
  reviewed; no `verified through` marker moved.
- It does not claim the advisory analysis path was exercised with live credentials.
- It does not claim the reworked workflow was exercised on a real runner. The
  dispatch succeeded and produced the intended three-job graph, but GitHub
  refused to start a runner ("account is locked due to a billing issue") and
  **no step ran**. See the "Did not run" section of
  `docs/release-notes-1.9.1.md`.
- It does not re-verify the 1.9.0 findings that this remediation did not touch;
  those remain as recorded in the 2026-08-24 audit.
