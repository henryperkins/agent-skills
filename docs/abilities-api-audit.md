# Abilities API audit — skills vs. canonical sources

Audited 2026-08-15 against WordPress core trunk (7.1-alpha), the Make/Core dev notes, Gutenberg
trunk, and MCP Adapter v0.6.1. Covers `wp-abilities-api`, `wp-abilities-audit`,
`wp-abilities-verify`, and the abilities-related surface of `wp-ai-plugin`.

All ten findings are closed in this change. The finding text is kept so the reasoning behind the
current guidance stays legible.

## Canonical sources

Priority order when re-verifying. The source outranks the docs during a release cycle.

| Tier | Source |
|---|---|
| Implementation | `wordpress-develop`: `src/wp-includes/abilities-api.php`, `src/wp-includes/abilities-api/` (`@since` tags separate 6.9 from 7.1) |
| Implementation | Gutenberg `packages/abilities`, `packages/core-abilities` (client-side) |
| Documentation | Dev notes on make.wordpress.org/core (per release, with Trac tickets) |
| Documentation | `developer.wordpress.org/apis/abilities-api/` |
| Project hub | `make.wordpress.org/ai/handbook/projects/abilities-api/` |

Dev notes used: [6.9 server-side](https://make.wordpress.org/core/2025/11/10/abilities-api-in-wordpress-6-9/) ·
[7.0 client-side](https://make.wordpress.org/core/2026/03/24/client-side-abilities-api-in-wordpress-7-0/) ·
[7.1 hooks](https://make.wordpress.org/core/2026/07/31/abilities-api-improvements-in-wordpress-7-1/) (#64311, #65248) ·
[7.1 `public` flag](https://make.wordpress.org/core/2026/08/04/a-unified-public-exposure-flag-for-abilities-in-wordpress-7-1/) (#65568) ·
[7.1 filtering](https://make.wordpress.org/core/2026/08/05/filtering-registered-abilities-with-wp_get_abilities-in-wordpress-7-1/) (#64990) ·
[deferred core abilities merge proposal](https://make.wordpress.org/core/2026/07/02/merge-proposal-expanding-wordpress-core-abilities/).

Versioned separately, tracked separately: **`WordPress/mcp-adapter`** (not core; reversed an
exposure default in 0.6.0) and **`WordPress/ai`** (hosts abilities proposed for core).

**Archived — not a source for current behavior:** `WordPress/abilities-api`, the feature plugin,
read-only since 5 February 2026, last release 0.2.0. MCP Adapter 0.6.0 dropped support for it as
an installation path.

## Findings

### 1. MCP exposure semantics inverted in adapter 0.6.0 (critical) — fixed

Adapter 0.6.0 introduced `McpAbilityExposure::is_public()` (`@since 0.6.0`), resolving
`meta.mcp.public ?? meta.public ?? false`. Opt-in became opt-out. Three files taught the 0.5.0
rule, so an author setting `meta.public => true` for REST — exactly what core 7.1 teaches — was
told MCP was unaffected. On a current adapter that ability is served by the default MCP server,
whose built-in abilities and HTTP transport both gate on `read`.

Discovery leak, not an authz bypass: `permission_callback` still runs. But it contradicted the
skill's own default-deny posture.

Fixed in `references/mcp-exposure.md` (new "Exposure resolution — the 0.6.0 reversal" section with
a per-version truth table), `references/php-registration.md`, `references/rest-api.md`, and
`SKILL.md` steps 5 and 7.

### 2. `meta.public` is a core key (high) — fixed

`php-registration.md` asserted it "is not a key the core Abilities API defines". `WP_Ability`
declares `protected const DEFAULT_PUBLIC = false;` and resolves it in `prepare_properties()`. The
meta-key table omitted it entirely. Both fixed; the table now carries `public`, `show_in_rest`,
and `mcp.public` with their real defaults and version gates.

Note the release state: 7.1 is unreleased (core latest is 7.0.2), so `meta.public` is documented
as 7.1+ throughout — but the adapter honors it on 6.9/7.0, and that skew is now stated explicitly.

### 3. Cross-skill contradiction on the same version (high) — fixed

`wp-abilities-api` said adapter 0.5.0 reads `meta.mcp.public` alone; `wp-ai-plugin` said 0.5.0
inherits `meta.public`. Both named 0.5.0. Reality: inheritance shipped in 0.6.0. Both skills now
state the version-conditional rule identically.

### 4. 7.1 execution lifecycle absent (high) — fixed

Added `references/execution-lifecycle.md`: the ordered eleven-step chain, all nine hook
signatures, and deep treatment of the four most misused — `wp_ability_invoked` (attempt, not
success), `wp_pre_execute_ability` (sentinel short-circuit that skips the permission callback),
`wp_ability_permission_result`, and the additive-only validation filters. Includes the arity
change on `wp_before_execute_ability` / `wp_after_execute_ability`, which raises
`ArgumentCountError` on 6.9/7.0 rather than degrading quietly.

Ordering verified line-by-line against `WP_Ability::execute()`.

### 5. `rest-api.md` was a 13-line stub (medium) — fixed

It listed two collection routes and omitted `GET|POST|DELETE /abilities/{name}/run` — the route
abilities actually execute through. Rewritten with the full five-route table, the exposure
resolution table, typed REST inputs (7.1), and the `wp_get_abilities()` filtering pipeline
including its silent-fallback trap on 6.9/7.0.

### 6. Archived feature plugin recommended (medium) — fixed

`SKILL.md` sent pre-6.9 projects to the archived plugin. Replaced with feature detection
(`function_exists( 'wp_register_ability' )`). `client-side.md` framed the store key as an open
discrepancy; `core/abilities` is canonical and the alternative is now labelled as history.

### 7. Adapter pinned to 0.5.0 in eight places (medium) — fixed

Bumped to 0.6.1 with the 0.6.0 breaking changes documented (WP 6.9+ required, standalone plugin
unsupported, per-site multisite sessions, `_meta` preservation, case-insensitive resource URIs).
`create_server()` re-verified at 13 parameters against v0.6.1; the stale `is_user_logged_in()`
docblock claim was re-checked and remains correct — `HttpTransport::check_permission()` really
does fall through to `current_user_can( 'read' )`.

### 8. Pending 7.1 patch would have frozen a stale claim (medium) — fixed

`wp-abilities-api-7.1.patch` (untracked, dated 15 Aug) asserted the 0.5.0 MCP rule in a new eval
scenario — three days after 0.6.0 shipped. Its content was ported by hand rather than applied:
the patch targeted a diverged branch and would have stripped `license:`, `client-side.md`, and the
whole MCP step. The scenario now grades on the version-conditional rule.

**The patch file is now superseded and should be deleted** — applying it would reintroduce
findings 1, 6, and 8.

### 9. `core/read-*` provenance (low-medium) — fixed

The merge proposal was deferred (7.2 earliest), so `core/read-content`, `core/read-users`, and
`core/read-settings` ship only in the AI plugin. The abilities core actually registers are the 6.9
`core/get-*` family, migrated onto `meta.public` in 7.1. `SKILL.md` now says so and warns against
assuming the families share a shape.

### 10. No drift gate on this surface (low) — fixed

`check-upstream-drift.mjs` covered only `wp-ai-plugin`. Added `shared/references/mcp-adapter-releases.json`,
an `update-upstream-indices.mjs` source, and a second drift check bound to the
`current canonical release: v0.6.1` marker in the `wp-abilities-api` compatibility line. Verified
the gate fires by simulating a 0.7.0 upstream release.

## Verified correct, left alone

- `client-side.md` — both package names, the `core/abilities` store, all nine exports, and the
  `readonly→GET` / `destructive+idempotent→DELETE` / else→`POST` mapping all match the 7.0 dev
  note and Gutenberg trunk.
- `input-schema-gotchas.md` §4 — direct-vs-indirect ordering matches `execute()` exactly.
- `wp-abilities-verify`'s idempotency definition quotes the `$default_annotations` docblock.
- Registration hook order, mandatory `permission_callback`, the `wp-abilities/v1` namespace, and
  the three annotations with their MCP hint mapping.
- `wp-abilities-audit` needed no correctness changes; it is methodology, and it delegates
  grouping and exposure questions to `wp-abilities-api`.

## Follow-on

`wp-abilities-verify` gained `references/exposure-checks.md` and a new procedure step 6, so a
future audit catches this class of drift in a plugin under test rather than only in the skills.
