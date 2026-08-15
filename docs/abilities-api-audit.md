# Abilities API audit — skills vs. canonical sources

Covers `wp-abilities-api`, `wp-abilities-audit`, `wp-abilities-verify`, and the abilities-related
surface of `wp-ai-plugin`. Two passes, both on 2026-08-15; all findings from both are closed. The
finding text is kept so the reasoning behind the current guidance stays legible.

**Release state at audit time.** `wordpress-develop` `trunk` is **7.2-alpha** (`7.2-alpha-63166-src`),
branch `7.1` is at **RC3** (`7.1-RC3-63235-src`) and unreleased, and the latest stable core release
is **7.0.4**. MCP Adapter is at **v0.6.1** (13 August 2026).

**Verify 7.1 behavior against the `7.1` branch, not `trunk`.** The first pass read `trunk` while
it still was 7.1-alpha; that is no longer sound and was corrected in the second pass. The
abilities files happen to be byte-identical between `7.1` and `trunk` today, so the first pass's
conclusions survive — but by luck, not by method. `trunk` stopped describing 7.1 the moment it
became 7.2-alpha.

## Canonical sources

Priority order when re-verifying. The source outranks the docs during a release cycle.

| Tier | Source |
|---|---|
| Implementation | `wordpress-develop` **at the release branch**: `src/wp-includes/abilities-api.php`, `src/wp-includes/abilities-api/` (`@since` tags separate 6.9 from 7.1) |
| Implementation | `wordpress-develop`: `src/wp-includes/rest-api/endpoints/class-wp-rest-abilities-v1-{list,categories,run}-controller.php` — the run controller holds the real method and double-invocation contract, which the ability class alone does not reveal |
| Implementation | `wordpress-develop`: `src/wp-includes/abilities.php` — the abilities core actually registers; diff it across branches to catch exposure changes |
| Implementation | `wordpress-develop`: `tests/phpunit/tests/abilities-api/` — settles behavior the source leaves ambiguous |
| Implementation | Gutenberg `packages/abilities`, `packages/core-abilities` (client-side) |
| Implementation | `WordPress/mcp-adapter` at the release tag — versioned independently of core |
| Documentation | Dev notes on make.wordpress.org/core (per release, with Trac tickets) |
| Documentation | `developer.wordpress.org/apis/abilities-api/` |
| Project hub | `make.wordpress.org/ai/handbook/projects/abilities-api/` |

Not a source: **`WordPress/abilities-api`**, archived and read-only (see below).

Dev notes used: [6.9 server-side](https://make.wordpress.org/core/2025/11/10/abilities-api-in-wordpress-6-9/) ·
[7.0 client-side](https://make.wordpress.org/core/2026/03/24/client-side-abilities-api-in-wordpress-7-0/) ·
[7.1 hooks](https://make.wordpress.org/core/2026/07/31/abilities-api-improvements-in-wordpress-7-1/) (#64311, #65248) ·
[7.1 `public` flag](https://make.wordpress.org/core/2026/08/04/a-unified-public-exposure-flag-for-abilities-in-wordpress-7-1/) (#65568) ·
[7.1 filtering](https://make.wordpress.org/core/2026/08/05/filtering-registered-abilities-with-wp_get_abilities-in-wordpress-7-1/) (#64990) ·
[deferred core abilities merge proposal](https://make.wordpress.org/core/2026/07/02/merge-proposal-expanding-wordpress-core-abilities/).

Versioned separately, tracked separately: **`WordPress/mcp-adapter`** (not core; reversed an
exposure default in 0.6.0) and **`WordPress/ai`** (hosts abilities proposed for core).

**Archived — not a source for current behavior:** `WordPress/abilities-api`, the feature plugin,
read-only since 5 February 2026. Its last tagged release was the `v0.5.0-rc` prerelease
(14 November 2025); its last stable was `v0.4.0` (30 October 2025). MCP Adapter 0.6.0 dropped
support for it as an installation path. Do not confuse its `v0.5.0-rc` with MCP Adapter `v0.5.0`
— unrelated projects that happen to share a `0.x` line.

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

Note the release state: 7.1 is unreleased (core latest is 7.0.4), so `meta.public` is documented
as 7.1+ throughout — but the adapter honors it on 6.9/7.0, and that skew is now stated explicitly.

### 3. Cross-skill contradiction on the same version (high) — fixed

`wp-abilities-api` said adapter 0.5.0 reads `meta.mcp.public` alone; `wp-ai-plugin` said 0.5.0
inherits `meta.public`. Both named 0.5.0. Reality: inheritance shipped in 0.6.0. Both skills now
state the version-conditional rule identically.

### 4. 7.1 execution lifecycle absent (high) — fixed

Added `references/execution-lifecycle.md`: the ordered eleven-step chain, all nine hook
signatures, and deep treatment of the four most misused — `wp_ability_invoked` (attempt, not
success), `wp_pre_execute_ability` (sentinel short-circuit that skips the permission callback),
`wp_ability_permission_result`, and the two validation filters. Includes the arity
change on `wp_before_execute_ability` / `wp_after_execute_ability`, which raises
`ArgumentCountError` on 6.9/7.0 rather than degrading quietly.

Ordering verified line-by-line against `WP_Ability::execute()`.

**Superseded in part by finding 11.** This pass described the validation filters as *additive*
— able to extend schema validation but not relax it. That is backwards; see below.

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

## Second pass — findings 11-18

A re-audit against the `7.1` branch (not `trunk`), the REST controllers, and MCP Adapter v0.6.1.
All closed in this change.

### 11. Validation filters described as additive-only (high) — fixed

`execution-lifecycle.md` and `SKILL.md` said `wp_ability_validate_input` /
`wp_ability_validate_output` "extend schema validation; they cannot relax it," and that returning
`true` against a `WP_Error` verdict "does not resurrect the call." The opposite is true. From
`WP_Ability::validate_input()` on branch `7.1`:

```php
$validity = apply_filters( 'wp_ability_validate_input', $is_valid, $input, $this->name );
if ( false === $validity ) {
    return new WP_Error( 'ability_invalid_input', __( 'Invalid input.' ) );
}
if ( is_wp_error( $validity ) && $validity->has_errors() ) {
    return $validity;
}
return true;
```

Nothing re-checks the schema after the filter, so a callback returning `true` overturns the
schema's rejection and the ability executes on invalid input. Core's own docblock agrees: the
filter "can add additional error information **or override it**." `validate_output()` is
identical.

The same file already stated this correctly one screen further down ("a callback that
unconditionally returns `true` overturns the schema verdict for every ability on the site"), so
the section contradicted itself — and the wrong half was the heading and the lead. Direction
matters here: the old wording told authors schema validation was a floor third-party code could
not lower, which is exactly the assumption that makes an unguarded callback look safe.

Also captured: an empty `WP_Error` does not reject, because the test is
`is_wp_error( $validity ) && $validity->has_errors()`.

### 12. `meta.mcp.type` — the doc was right, the re-audit's correction was wrong (informational)

The re-audit proposed that an out-of-enum `meta.mcp.type` (say `'tools'`) drops the ability from
MCP entirely, citing `DefaultServerFactory::discover_abilities_by_type()`, which does
`$ability_type !== $type → continue` with no validation. That helper is only ever called with
`'resource'` and `'prompt'` — the default server's `tools` list is hardcoded to the three
built-in `mcp-adapter/*` abilities — so it never decides tool exposure at all.

The path that does decide it, `McpAbilityHelperTrait::get_ability_mcp_type()`, explicitly
validates against `array( 'tool', 'resource', 'prompt' )` and returns `'tool'` for anything else.
`GetAbilityInfoAbility` and `ExecuteAbilityAbility` do not check type whatsoever. So the original
claim — values outside the enum coerce to `'tool'` — was correct for observable behavior, and the
proposed correction would have introduced an error.

The real trap is the inverse, and it is now documented in `mcp-exposure.md`: a *typo'd*
`'resource'` is silently **promoted to a tool**. It vanishes from the server's `resources` list
while remaining listed by `discover-abilities` and executable via `execute-ability` — turning
passive context into something an agent can invoke.

### 13. Cross-skill contract referenced fields that do not exist (high) — fixed

`wp-abilities-verify/references/exposure-checks.md` failed an ability when the audit doc did not
mark it "agent-facing", and failed a destructive MCP-public ability unless the audit named it "in
an explicit allow-list decision". `wp-abilities-audit`'s canonical schema had **no exposure
surface at all** — not in `proposed_abilities`, not top-level, nowhere in the skill. Both FAIL
branches therefore fired on every audit that was supplied, which is the worst failure shape for a
verifier: confident, automatic, and wrong.

Fixed on both sides. `audit-schema.md` gains an optional `exposure` object
(`agent_facing`, `mcp: allow|deny|inherit`, `rationale`) with the same
optional-but-required-for-new-audits posture as `backing.kind` and the implementation-readiness
fields, and `wp-abilities-audit`'s procedure gains step 4a to populate it. `exposure-checks.md`
now keys off those real field names, and degrades to WARN — worded as a statement about the
*audit*, not the plugin — when the object is absent. An absent `exposure` is explicitly not
readable as `agent_facing: false`.

### 14. Registration failure shape (medium) — fixed

`php-registration.md` and `rest-api.md` presented `InvalidArgumentException` as something that
escapes to the caller. `WP_Abilities_Registry::register()` catches it, calls `_doing_it_wrong()`,
and returns `null` — as do all its other rejection paths. Nothing propagates.

So every registration bug has the same shape: **the ability is silently absent**, with a notice
that is invisible when `WP_DEBUG` is off. That changes the debugging advice materially — a
registration that never happened and an ability hidden by `show_in_rest` are indistinguishable
from the REST endpoint, and only the first leaves any trace. `php-registration.md` gains a "How a
bad registration fails" section; `SKILL.md`'s "ability never appears" entry now leads with
`WP_DEBUG`.

### 15. Core changed an ability's exposure in 7.1 (medium) — fixed

On 7.0, `core/get-user-info` registered `'show_in_rest' => false`. On 7.1 it registers
`'public' => true` with no override, resolving to `show_in_rest: true`. An ability deliberately
hidden from REST is now listed there, gated only by `is_user_logged_in()` — and on adapter 0.6.0+
it inherits MCP exposure, as do `core/get-site-info` and `core/get-environment-info`.

This is the skill's own "third row is the trap" happening inside core, and evidence that the
`core/get-*` migration onto `meta.public` was not behavior-preserving. Documented as a worked
example in `rest-api.md` with the full three-ability table.

### 16. `/run` method choice framed as client convention (medium) — fixed

`rest-api.md` attributed the `readonly→GET` / `destructive+idempotent→DELETE` / else→`POST`
mapping to "the client packages". The run route registers `WP_REST_Server::ALLMETHODS`, but
`check_ability_permissions()` calls `validate_request_method()`, which derives exactly one legal
method from the annotations and returns `rest_ability_invalid_method` with **HTTP 405** for
anything else. The packages follow the mapping because the server enforces it. A hand-rolled
client that POSTs to a readonly ability gets a 405, and flipping an annotation changes an
ability's HTTP contract.

### 17. `rest_abilities_collection_params` undocumented (medium) — fixed

Meta matching in `wp_get_abilities()` is strict `!==`, and REST query values arrive as strings, so
`?meta[custom_key]=true` matches nothing — silently, with a well-formed empty collection.
`get_collection_params()` pre-declares schema types only for `meta[annotations][*]`, and
`additionalProperties => true` means an undeclared key is accepted rather than rejected, so it
passes validation and then fails the match. `rest_abilities_collection_params` (`@since 7.1.0`)
exists precisely to declare types for custom meta keys, and was absent from the skills. Added to
`rest-api.md`, alongside the note that the list endpoint forces `show_in_rest => true` under any
caller-supplied `meta` so the parameter cannot be used to reveal hidden abilities.

### 18. Hooks fire twice per REST run request (medium) — fixed

`check_ability_permissions()` runs `normalize_input()`, `validate_input()`, and
`check_permissions()`; `execute_ability()` then calls `execute()`, which runs all three again. So
one `/run` request fires `wp_ability_normalize_input`, `wp_ability_validate_input`, and
`wp_ability_permission_result` **twice**, and every other hook once.

That is a correctness trap for the exact use cases those filters attract: a rate limiter or audit
row on `wp_ability_permission_result` records two events per REST call and one per WP-CLI call,
so the same policy yields different numbers by transport. Documented in `execution-lifecycle.md`
with the guidance to keep those three callbacks pure and meter on `wp_ability_invoked` or
`wp_after_execute_ability`.

### 19. Archived plugin's last release misstated (low) — fixed

Three files said the archived `WordPress/abilities-api` plugin's last release was 0.2.0. It was
`v0.5.0-rc` (prerelease, 14 November 2025); the last stable was `v0.4.0`. Corrected in
`php-registration.md`, `docs/upstream-sync.md`, and this file, with a note that its `v0.5.0-rc` is
unrelated to MCP Adapter `v0.5.0`.

### 20. Stale core index and no core drift gate (low) — fixed

`shared/references/wordpress-core-versions.json` said `latest: 7.0.2` while core was at 7.0.4, and
`check-upstream-drift.mjs` had no core check — so WP 7.1 shipping would not have turned CI red
despite the skills carrying a large, pre-release-verified 7.1 surface.

Three fixes:

- **Index refreshed** to 7.0.4, and the normalizer's sort in `update-upstream-indices.mjs` changed
  from lexicographic to numeric. The old sort ranked `7.0.10` below `7.0.4`, which would have made
  `latest` name a superseded release once a patch series reached double digits — latent, but now
  load-bearing because the gate reads `latest`.
- **Core gate added**, comparing the index against a new `core verified through: 7.0` marker in
  `wp-abilities-api`'s compatibility line at **minor** granularity: quiet on patches, red when a
  new minor ships. Verified by simulating both a 7.1 release (fires) and a 7.0.5 patch (does not).
- **Exact-equality assertion in `eval/harness/release-conformance.mjs` replaced with a floor.**
  `assert(core.latest === "7.0.2")` is what froze the index: it fails whenever the index is
  refreshed, so the refresh and the assertion had to move together or not at all. It now asserts
  shape plus a non-regression floor, and leaves "a new minor shipped, go re-verify" to the drift
  gate, which reports it with enough context to act on.

## Verified correct, left alone

- `client-side.md` — both package names, the `core/abilities` store, all nine exports, and the
  `readonly→GET` / `destructive+idempotent→DELETE` / else→`POST` mapping all match the 7.0 dev
  note and Gutenberg trunk.
- `input-schema-gotchas.md` §4 — direct-vs-indirect ordering matches `execute()` exactly.
- `wp-abilities-verify`'s idempotency definition quotes the `$default_annotations` docblock.
- Registration hook order, mandatory `permission_callback`, the `wp-abilities/v1` namespace, and
  the three annotations with their MCP hint mapping.
- `wp-abilities-audit` needed no *correctness* changes in the first pass; it is methodology. The
  second pass found it was missing a field the verify skill depended on — see finding 13.

Re-verified clean in the second pass, against branch `7.1` and adapter v0.6.1:

- Exposure resolution — `show_in_rest ?? public ?? false`, `DEFAULT_PUBLIC = false` (`@since
  7.1.0`), absent from 6.9/7.0, and `InvalidArgumentException` on a non-boolean `public`.
- The eleven-step lifecycle chain and all nine hook signatures, line by line, including the
  argument-order inconsistency in the two validation filters.
- The five REST routes, and `check_ability_permissions()`'s 404 on a non-REST-exposed ability.
- `wp_get_abilities()` pipeline order and args; strict `!==` meta matching.
- `McpAbilityExposure::is_public()` (`meta.mcp.public ?? meta.public ?? false`, `isset`-based so
  an explicit `null` falls through, malformed `meta.mcp` fails closed).
- Adapter defaults: `read` on all three built-ins and the HTTP transport, session `32` /
  `DAY_IN_SECONDS` / `60`, three supported protocol versions, `create_server()` at 13 parameters.
- The `current_user_can( 'read' )` transport gate — the upstream docblock claiming
  `is_user_logged_in()` really is stale, as the skill says.
- Client-side store key, exports, and error codes; core's three registered `core/get-*` abilities.
- The `wp mcp-adapter` CLI command name.

## Follow-on

`wp-abilities-verify` gained `references/exposure-checks.md` and a new procedure step 6, so a
future audit catches this class of drift in a plugin under test rather than only in the skills.

Two method changes came out of the second pass and are worth keeping:

1. **Read the release branch, not `trunk`.** Documented in `docs/upstream-sync.md` and enforced by
   the new core drift gate.
2. **Read the REST controllers, not only `WP_Ability`.** Findings 16, 17, and 18 are all invisible
   from the ability class alone — the controller is where the method contract, the collection
   parameter schema, and the double invocation live.

Still unexamined: `tests/phpunit/tests/abilities-api/`. The test suite is listed as a canonical
source above but has not been read end to end; it is the natural place to settle behavior the
source leaves ambiguous, and the obvious starting point for a third pass.
