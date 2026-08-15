---
name: wp-abilities-api
description: "Use when working with the WordPress Abilities API (wp_register_ability, wp_register_ability_category, wp_get_abilities, /wp-json/wp-abilities/v1/*, @wordpress/abilities, @wordpress/core-abilities) including defining abilities, categories, meta, the meta.public and show_in_rest exposure flags, filtered ability discovery, permissions checks for clients, the WP 7.1+ execution lifecycle hooks (wp_ability_invoked, wp_pre_execute_ability, wp_ability_validate_input/output, wp_ability_permission_result, wp_before_execute_ability, wp_after_execute_ability), the WP 7.0+ client-side JS API (registerAbility, executeAbility, the core/abilities store), and exposing abilities to external AI agents via the MCP Adapter (Claude Desktop, Cursor, ChatGPT)."
compatibility: "Targets WordPress 6.9+ (PHP 7.2.24+); sections marked WP 7.1+ describe APIs that do not exist on 6.9/7.0. The 7.1 surface was verified against the `7.1` branch at RC3, not a released build — core verified through: 7.0. MCP Adapter guidance tracks the current canonical release: v0.6.1 (requires PHP 7.4+). Filesystem-based agent with bash + node. Some workflows require WP-CLI."
license: GPL-2.0-or-later
---

# WP Abilities API

## When to use

Use this skill when the task involves:

- registering abilities or ability categories in PHP,
- exposing abilities to clients via REST (`wp-abilities/v1`),
- consuming abilities in JS (notably `@wordpress/abilities`),
- diagnosing “ability doesn’t show up” / “client can’t see ability” / “REST returns empty”.

## Inputs required

- Repo root (run `wp-project-triage` first if you haven’t).
- Target WordPress version(s) and whether this is WP core or a plugin/theme.
- Where the change should live (plugin vs theme vs mu-plugin).

## Procedure

Before deciding what to register, read `references/domain-vs-projection.md` — abilities live at the domain capability layer; MCP / Command Palette / REST exposure is a projection. Registration shape and exposure shape are different decisions, and conflating them forces re-registration every time a consumer's constraints change.

### 1) Confirm availability and version constraints

- If this is WP core work, check `signals.isWpCoreCheckout` and `versions.wordpress.core`.
- The Abilities API is in core from **6.9** onward. The `WordPress/abilities-api` feature plugin
  was archived in February 2026 and is read-only — do not install it, and do not treat it as a
  shim for older sites. A project targeting WP < 6.9 should feature-detect
  (`function_exists( 'wp_register_ability' )`) and degrade.
- **Establish the target version before writing 7.1 features.** WP 7.1 adds the `meta.public`
  exposure flag, seven execution lifecycle hooks, `wp_get_abilities()` filtering args, and REST
  input type coercion — and changes the arity of the two lifecycle actions that already existed.
  Ask for the target version if triage does not settle it. Most of the 7.1 surface degrades
  *silently* on 7.0 (`wp_get_abilities()` returns the full registry, new hooks never fire), so
  guessing produces bugs that pass a smoke test — while the arity change fails *loudly*, with a
  fatal. See `references/execution-lifecycle.md` and `references/rest-api.md`.

### 2) Find existing Abilities usage

Search for these in the repo:

- `wp_register_ability(`
- `wp_register_ability_category(`
- `wp_get_abilities(`
- `wp_abilities_api_init`
- `wp_abilities_api_categories_init`
- `wp-abilities/v1`
- `@wordpress/abilities`
- `wp_ability_` / `wp_pre_execute_ability` / `wp_before_execute_ability` / `wp_after_execute_ability` (lifecycle hooks)

If none exist, decide whether you’re introducing Abilities API fresh (new registrations + client consumption) or only consuming.

### 3) Register categories (optional)

If you need a logical grouping, register an ability category early (see `references/php-registration.md`).

### 4) Register abilities (PHP)

For grouping decisions (how many abilities to register, and where to put filters vs. new ability names), read `references/grouping-heuristic.md` first — it keeps you from shipping one atomic ability per REST operation.

To avoid drift between the ability and the existing UI / REST code path, see `references/shared-core-service.md` — abilities, REST handlers, CLI commands, and UI controllers should be thin adapters over a shared service. The reference also covers the metric trap (REST handlers that emit usage telemetry) and the `AGENTS.md` rule for keeping registrations in sync when underlying code paths change.

For shared helper patterns when multiple execute callbacks delegate to existing REST controllers, see `references/plugin-family-patterns.md` (identify the shared-API-client vs zero-arg-controllers shape) and `references/delegate-helper-pattern.md` (one helper shape that works, and when not to use it).

For standardized `WP_Error` codes that let agents reason about retry vs. escalation, see `references/error-code-vocabulary.md`.

Implement the ability in PHP registration with:

- stable `id` (namespaced),
- `label`/`description`,
- `category`,
- `meta`:
  - add `readonly: true` when the ability is informational,
  - on **WP 7.1+**, set `public: true` for abilities you intend clients to see, and use
    `show_in_rest` only to override that for one channel;
  - on **WP 6.9/7.0**, set `show_in_rest: true` — core ignores `public` there.

Always write `permission_callback` as though the ability were fully exposed. Exposure metadata
decides who can *find* an ability, never who may *run* it (see step 5).

Use the documented init hooks for Abilities API registration so they load at the right time (see `references/php-registration.md`).

For worked examples of read-only, permission-gated abilities (single-item *and* collection modes,
field-level access gated on `current_user_can`), study the AI plugin's `core/read-content`,
`core/read-users`, and `core/read-settings` abilities (WordPress/ai 1.2.0, `includes/Abilities/`).
They use the `show_in_abilities` registration flag to decide which post types/settings to expose.
Note their status: these were **proposed for core in 7.1 and deferred** — the merge proposal was
punted, so they ship only in the AI plugin for now, with 7.2 the earliest target. The abilities
actually registered by core today are the 6.9 `core/get-*` family (`core/get-site-info`,
`core/get-user-info`, `core/get-environment-info`), which 7.1 migrated onto `meta.public`. Do not
tell a user that `core/read-*` is available from core, and do not assume the two families share a
shape — contributors have discussed making `core/get-*` compatibility aliases, but that has not
happened.

**That migration was not behavior-preserving, and it is the cleanest worked example of the
exposure trap in step 5.** On 7.0, `core/get-user-info` was registered with
`'show_in_rest' => false`; on 7.1 it is registered with `'public' => true` and no override, which
resolves to `show_in_rest: true`. An ability that was deliberately hidden from REST is now listed
there, gated only by its `permission_callback` of `is_user_logged_in()` — and on MCP Adapter
0.6.0+ it inherits MCP exposure as well, alongside `core/get-site-info` and
`core/get-environment-info`. Cite this when someone treats `public` as a cosmetic refactor of
`show_in_rest`: core made exactly that assumption in its own registrations and changed the
exposure of one of the three. See `references/rest-api.md`.

### 5) Set exposure, and keep it separate from authorization

Read `references/rest-api.md` for the resolution table and worked examples.

- On 7.1+, core resolves `show_in_rest = meta.show_in_rest ?? meta.public ?? false`, and `public`
  itself defaults to `false`. An explicit `show_in_rest` always wins; `public` supplies the value
  otherwise. Only `null` counts as unset, so an explicit `false` is preserved.
- `public` is an **exposure default, not an authorization decision**. Every invocation still runs
  `permission_callback` — through REST, direct PHP, WP-CLI, and MCP. Never generate an ability
  that relies on `public => false` as a security control, and never weaken a permission callback
  because an ability is not public.
- **`public` is not REST-only.** MCP Adapter 0.6.0+ resolves
  `meta.mcp.public ?? meta.public ?? false`, so `public => true` also publishes the ability to
  the adapter's default MCP server unless you set `meta.mcp.public => false`. The adapter honors
  `meta.public` on 6.9 and 7.0 as well, where core still ignores it for REST — so agent exposure
  can precede REST exposure. Decide both channels in the same edit.
- Verify the REST endpoints exist and return expected results.
- If the client still can't see the ability, check the *resolved* `show_in_rest` value — on 7.1+
  it can be suppressed by an explicit `show_in_rest: false` even when `public` is `true`.

### 5a) Discover abilities with `wp_get_abilities()` (args are WP 7.1+)

When code needs a subset of the registry, pass `$args` rather than looping over everything: filter
by `category`, `namespace`, or nested `meta`, and reshape with `item_include_callback` or
`result_callback`. On 6.9/7.0 the extra argument is **silently ignored and the full registry is
returned** — PHP does not error on extra args to a userland function — so gate on the core version
before trusting a filtered list. See `references/rest-api.md`.

### 5b) Hook the execution lifecycle (WP 7.1+)

If the task involves auditing, telemetry, caching, policy enforcement, or custom validation, read
`references/execution-lifecycle.md` before writing hooks. The ordered chain and the four hooks
agents most often misuse are documented there. The load-bearing distinctions:

- `wp_ability_invoked` fires **first**, before normalization, validation, and permission checks.
  It records an **attempt** — invalid input and denied callers fire it too. It is not a success
  signal; `wp_after_execute_ability` is.
- `wp_pre_execute_ability` short-circuits **past normalization, validation, and the permission
  callback**. It compares by object identity against a `WP_Filter_Sentinel`, so any other return
  value — including `null` — ends the call. Guard on the ability name and do your own capability
  check.
- `wp_ability_validate_input` / `wp_ability_validate_output` run **after** built-in schema
  validation, and what they return **replaces** its verdict — they do not merely extend it. A
  callback that returns `true` without first guarding on `is_wp_error( $is_valid )` overturns the
  schema rejection and the ability executes on invalid input, site-wide. Return `WP_Error`, not
  `false`, or the caller loses the reason. `wp_ability_validate_input` does not fire at all when
  the ability declares no `input_schema`.
- A single REST `/run` request fires `wp_ability_normalize_input`, `wp_ability_validate_input`,
  and `wp_ability_permission_result` **twice** — once in the route's permission callback, once
  inside `execute()`. Keep callbacks on those three pure; meter on `wp_ability_invoked` or
  `wp_after_execute_ability` instead.
- `wp_ability_permission_result` fires wherever `check_permissions()` runs, not only during
  execution. Tighten with it; never widen. Through `execute()` a `WP_Error` is logged via
  `_doing_it_wrong()` and replaced by a generic denial, so the message never reaches an executing
  caller.
- `wp_before_execute_ability` and `wp_after_execute_ability` **predate 7.1** and gained a trailing
  `$ability` argument in it. A callback written to the 7.1 arity raises `ArgumentCountError` on
  6.9/7.0 — default the trailing parameter when supporting both.

### 5c) Typed REST inputs (WP 7.1+)

Run-request input is coerced to the types declared in `input_schema` before the callback runs, so
`"10"` arrives as `10` and `"true"` as `true`. It is registered as the `input` argument's
`sanitize_callback`, so it applies on every transport, not only the query-string methods where the
difference shows. Declare accurate schema types to benefit. Coercion does not widen what validation
accepts, so do not lean on it to sanitize untrusted input. Callbacks that must also run on 6.9/7.0
should still cast defensively.

### 6) Consume from JS (if needed)

- For the WP 7.0+ client-side surface (registering abilities in JS, the `core/abilities` store, `executeAbility`, and how annotations affect the HTTP method used to dispatch server abilities), see `references/client-side.md`.
- Two packages: `@wordpress/abilities` (pure store, registration, execution) and `@wordpress/core-abilities` (auto-loads server-registered abilities into the client store). Register your script module during `init`, then explicitly enqueue both your page-scoped module and `@wordpress/core-abilities` with `wp_enqueue_script_module()` on the screen that needs them.
- For older clients or non-WP 7.0 contexts, prefer `@wordpress/abilities` APIs for client-side access and checks; ensure the build pipeline bundles the dependency.

### 7) Expose via MCP for external AI agents (optional)

If external agents (Claude Desktop, Cursor, ChatGPT) should be able to discover and invoke your abilities, first check the site's PHP and WordPress versions. This base skill supports PHP 7.2.24+ and WP 6.9+, but MCP Adapter 0.6.1 requires PHP 7.4+ (`^7.4 || ^8.0`) and WordPress 6.9+; on PHP 7.2 or 7.3, upgrade the site runtime or stop before installing the adapter. Read `references/mcp-exposure.md` before giving installation, bootstrap, or server code. Install `wordpress/mcp-adapter`; for multi-plugin dependency use, also run `composer require automattic/jetpack-autoloader` and bootstrap `vendor/autoload_packages.php`.

**Confirm the adapter version before writing exposure metadata — the rule reversed in 0.6.0.** The default server (`mcp-adapter-default-server`) surfaces its discover/get/execute flow for abilities that resolve to MCP-public, and `McpAbilityExposure::is_public()` resolves `meta.mcp.public ?? meta.public ?? false`. On 0.6.0+, an ability marked `meta.public => true` for REST is therefore exposed to agents unless you add `meta.mcp.public => false`; on 0.5.0 and earlier only an explicit `meta.mcp.public => true` did anything. Write `meta.mcp.public` explicitly whenever MCP status matters — it means the same thing on every version. Every execution still runs the ability's `permission_callback`, so this governs discovery rather than authorization; but the default server's own built-in abilities gate on `read`, which every role holds. A custom server can explicitly allow-list selected ability IDs, and is the cleanest way to stay insulated from the 0.6.0 default; it also does not bypass permission callbacks. The adapter maps `meta.annotations` (`readonly`, `destructive`, `idempotent`) to the corresponding MCP tool annotations.

## Verification

- `wp-project-triage` indicates `signals.usesAbilitiesApi: true` after your change (if applicable).
- REST check (in a WP environment): endpoints under `wp-abilities/v1` return your ability and category when expected.
- If the repo has tests, add/update coverage near:
  - PHP: ability registration and meta exposure
  - JS: ability consumption and UI gating

## Failure modes / debugging

- Ability never appears — **turn on `WP_DEBUG` first.** `wp_register_ability()` never throws and
  never returns `WP_Error`; every rejection ends in `_doing_it_wrong()` + `null`, which is
  invisible in production. A registration that failed and an ability hidden by exposure metadata
  look identical from REST, and only the first leaves a notice. Then check, in order:
  - registration rejected (missing `permission_callback`, non-boolean `meta.public`, malformed or
    duplicate ID, unregistered `category`) — see `references/php-registration.md`,
  - registration code not running (wrong hook / file not loaded),
  - neither `meta.public` (7.1+) nor `meta.show_in_rest` set, or an explicit `show_in_rest: false`
    overriding `public: true`,
  - incorrect category/ID mismatch.
- REST shows ability but JS doesn’t:
  - wrong REST base/namespace,
  - JS dependency not bundled,
  - caching (object/page caches) masking changes.
- Execute callback returns unexpected errors or silently ignores input:
  - `input_schema` defaults aren't being applied, pagination key drift between the ability and the backing, or `empty()`-based ID validation — see `references/input-schema-gotchas.md`.
- An ability shows up in an MCP client that was never marked `meta.mcp.public`:
  - adapter 0.6.0+ inherited `meta.public`. Add an explicit `meta.mcp.public => false`, or move to
    a custom server with an allow-list — see `references/mcp-exposure.md`.
- `wp_get_abilities()` filters appear to do nothing and the full registry comes back:
  - the site is on 6.9/7.0, where the `$args` parameter does not exist and PHP discards the extra
    argument without error. Gate on the core version.
- Telemetry counts more invocations than the ability actually served:
  - `wp_ability_invoked` counts attempts, including validation failures and permission denials.
    Move success metering to `wp_after_execute_ability`.
- Permission callback appears to be bypassed, or an ability returns `null`:
  - a `wp_pre_execute_ability` filter short-circuited the call, or a `wp_ability_permission_result`
    filter overrode the verdict — see `references/execution-lifecycle.md`.
- `ArgumentCountError` on every ability call after deploying to an older site:
  - a `wp_before_execute_ability` / `wp_after_execute_ability` callback declares the 7.1 arity on
    6.9/7.0. Default the trailing `$ability` parameter.

## Escalation

- If you're uncertain about version support, confirm the target WP core version before using any
  7.1 API. The 7.1 surface degrades silently on 6.9/7.0 rather than erroring, so this is worth
  asking about rather than inferring.
- Confirm the installed MCP Adapter version before writing exposure metadata; the exposure rule
  changed in 0.6.0 and the two behaviors are opposites.
- For canonical details, consult:
  - `references/rest-api.md` (endpoints, `public`/`show_in_rest` resolution, typed inputs, discovery)
  - `references/execution-lifecycle.md` (WP 7.1+ hook chain)
  - `references/php-registration.md`
  - `references/client-side.md` (WP 7.0+ JavaScript API)
  - `references/mcp-exposure.md` (MCP Adapter integration)
- Upstream truth, in priority order: core source (`src/wp-includes/abilities-api/`, `@since` tags),
  the Make/Core dev notes, then `developer.wordpress.org/apis/abilities-api/`. The archived
  `WordPress/abilities-api` repo is not a source for current behavior.
