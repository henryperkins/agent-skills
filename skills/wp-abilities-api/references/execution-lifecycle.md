# Ability execution lifecycle (WP 7.1+)

WordPress 7.1 opened `WP_Ability::execute()` up to nine extension points. On 6.9 and 7.0 there
were only two, and the ability's own `execute_callback` and `permission_callback` were the only
real places to intervene.

## What is actually new in 7.1

Seven of the nine hooks are new. **Two are not** — and that difference is the one that produces
fatal errors rather than missing behavior.

| Hook | 6.9 / 7.0 | 7.1 |
|---|---|---|
| `wp_ability_invoked` | — | new |
| `wp_pre_execute_ability` | — | new |
| `wp_ability_normalize_input` | — | new |
| `wp_ability_validate_input` | — | new |
| `wp_ability_permission_result` | — | new |
| `wp_before_execute_ability` | `( $name, $input )` | `( $name, $input, $ability )` |
| `wp_ability_execute_result` | — | new |
| `wp_ability_validate_output` | — | new |
| `wp_after_execute_ability` | `( $name, $input, $result )` | `( $name, $input, $result, $ability )` |

The two pre-existing actions **gained a trailing `$ability` argument in 7.1**. Registering a
callback with the 7.1 arity on a 7.0 site does not degrade quietly — `do_action()` passes only
the arguments it has, so a closure declaring four required parameters raises
`ArgumentCountError` and takes down every ability execution on the site:

```php
// FATAL on 7.0: only three arguments are passed.
add_action( 'wp_after_execute_ability', function ( $name, $input, $result, $ability ) {
    // ...
}, 10, 4 );

// Safe on both: default the parameter that 7.0 does not supply.
add_action( 'wp_after_execute_ability', function ( $name, $input, $result, $ability = null ) {
    // ...
}, 10, 4 );
```

For the seven genuinely new hooks, a callback registered on 7.0 simply never fires. Gate on
`version_compare( get_bloginfo( 'version' ), '7.1', '>=' )` when behavior depends on them.

`execute()` also gained a `normalize_input()` failure check in 7.1 — normalization returning a
`WP_Error` now aborts the call. On 7.0 a normalization error fell through into validation.

## The ordered chain

`WP_Ability::execute( $input )` runs these in exactly this order. Anything returning a
`WP_Error` stops the chain immediately — later hooks do not fire.

| # | Hook | Type | Fires |
|---|------|------|-------|
| 1 | `wp_ability_invoked` | action | First. Raw, un-normalized input. Before every check. |
| 2 | `wp_pre_execute_ability` | filter | Short-circuit. Before normalization, validation, permissions. |
| 3 | `wp_ability_normalize_input` | filter | Inside `normalize_input()`, after schema defaults are applied. A `WP_Error` here aborts (7.1+). |
| 4 | *(schema input validation)* | built-in | `rest_validate_value_from_schema()` against `input_schema`. |
| 5 | `wp_ability_validate_input` | filter | Inside `validate_input()`, after built-in schema validation. **Skipped entirely when the ability declares no `input_schema`.** |
| 6 | `wp_ability_permission_result` | filter | Inside `check_permissions()`, after `permission_callback` returns. |
| 7 | `wp_before_execute_ability` | action | Permissions passed; callback is about to run. |
| 8 | `wp_ability_execute_result` | filter | Inside `do_execute()`, after the callback, **before** output validation. |
| 9 | *(schema output validation)* | built-in | `rest_validate_value_from_schema()` against `output_schema`. |
| 10 | `wp_ability_validate_output` | filter | Inside `validate_output()`, after built-in output validation. |
| 11 | `wp_after_execute_ability` | action | Last. Only on a fully validated success. |

Two orderings surprise people:

- **Input validation runs before the permission check** (4–5 before 6). A caller with no
  permission still gets an `ability_invalid_input` error if the input was malformed — the
  validation error wins, and it is emitted before any capability is consulted.
- **`wp_ability_execute_result` runs before output validation** (8 before 9). A filter that
  reshapes the result can push it out of conformance with `output_schema` and turn a working
  ability into `ability_invalid_output`.

## Signatures

```php
do_action( 'wp_ability_invoked', string $name, mixed $input, WP_Ability $ability );
apply_filters( 'wp_pre_execute_ability', WP_Filter_Sentinel $pre, string $name, mixed $input, WP_Ability $ability );
apply_filters( 'wp_ability_normalize_input', mixed $input, string $name, WP_Ability $ability );
apply_filters( 'wp_ability_validate_input', true|WP_Error $is_valid, mixed $input, string $name );
apply_filters( 'wp_ability_permission_result', mixed $permission, string $name, mixed $input, WP_Ability $ability );
do_action( 'wp_before_execute_ability', string $name, mixed $input, WP_Ability $ability );
apply_filters( 'wp_ability_execute_result', mixed $result, string $name, mixed $input, WP_Ability $ability );
apply_filters( 'wp_ability_validate_output', true|WP_Error $is_valid, mixed $output, string $name );
do_action( 'wp_after_execute_ability', string $name, mixed $input, mixed $result, WP_Ability $ability );
```

Note the inconsistency, because it causes real bugs: the two **validation** filters take
`( $validity, $value, $name )` and receive **no** `WP_Ability` object. Every other hook takes
`$name` before `$input` and passes the ability last. Do not copy a callback signature from one
family to the other.

## The four that get misused

### `wp_ability_invoked` — an attempt, not a success

This is the single most misread hook in 7.1. It fires at the top of `execute()`, before
normalization, before schema validation, before the permission callback. Every one of these
still fires it:

- input that fails `input_schema` validation,
- a caller the `permission_callback` rejects,
- a call that a `wp_pre_execute_ability` filter short-circuits,
- a callback that throws or returns `WP_Error`.

So it answers "who tried?" — never "what worked?". Wiring an activity feed, a usage counter,
or a billing meter to `wp_ability_invoked` over-counts, and reading it as a success log is a
correctness bug in an audit trail.

Use the pair:

```php
// Attempt surface — security auditing, abuse detection, rate limiting.
add_action( 'wp_ability_invoked', function ( $name, $input, $ability ) {
    my_audit_log( 'ability.attempted', array( 'ability' => $name, 'user' => get_current_user_id() ) );
}, 10, 3 );

// Success surface — usage metering, cache invalidation, downstream sync.
add_action( 'wp_after_execute_ability', function ( $name, $input, $result, $ability = null ) {
    my_audit_log( 'ability.succeeded', array( 'ability' => $name, 'user' => get_current_user_id() ) );
}, 10, 4 );
```

`wp_after_execute_ability` is the only hook that fires exclusively after output validation
passed. If you need "the callback ran but the output may be malformed", use
`wp_before_execute_ability` (permissions passed, callback about to run) instead.

### `wp_pre_execute_ability` — a bypass, not a pre-flight

Core builds a `WP_Filter_Sentinel` object and passes it as the filter's first argument. If the
filter returns anything that is not that exact instance, `execute()` returns it immediately:

```php
$pre_execute_sentinel = new WP_Filter_Sentinel();
$pre = apply_filters( 'wp_pre_execute_ability', $pre_execute_sentinel, $this->name, $input, $this );
if ( $pre !== $pre_execute_sentinel ) {
    return $pre;
}
```

Identity comparison, not `null`-checking — so returning `null` short-circuits with `null`, and
a callback with a `return;` on some branch silently kills the ability.

**Everything downstream is skipped: normalization, schema validation, and the permission
callback.** That makes it the one hook in the chain that can hand a caller a result they were
never authorized to receive. Legitimate uses are caching, maintenance-mode responses, and
feature flags — and each of those must do its own capability check:

```php
add_filter( 'wp_pre_execute_ability', function ( $pre, $name, $input, $ability ) {
    if ( 'my-plugin/expensive-report' !== $name ) {
        return $pre; // Always return the sentinel unchanged to continue.
    }
    // The permission callback will NOT run if we return a value here.
    if ( ! current_user_can( 'view_reports' ) ) {
        return $pre;
    }
    $cached = get_transient( 'my_plugin_report_' . md5( wp_json_encode( $input ) ) );
    return false === $cached ? $pre : $cached;
}, 10, 4 );
```

Always name-guard the filter. It fires for *every* ability on the site, so an unguarded
callback breaks unrelated plugins.

REST callers reach `execute()` after the controller has already validated and checked
permissions, so a short-circuit there is less dangerous. Direct PHP calls, WP-CLI, and
in-process agent loops have no such protection.

### `wp_ability_permission_result` — site-wide, and not only during execution

Fires inside `check_permissions()` after the registered `permission_callback` runs, taking its
return value as `$permission`. Because it lives in `check_permissions()` rather than
`execute()`, it also fires on standalone permission probes — the REST `has_permission` surface,
WP-CLI, and any direct `$ability->check_permissions()` call.

It is the right place for org-wide policy (deny everything to a role, require an audit
acknowledgement, force a maintenance freeze). It is the wrong place for per-ability logic that
belongs in that ability's own `permission_callback`.

Return `true`, `false`, or a `WP_Error`. Anything else — `null`, an integer, a string —
`check_permissions()` silently coerces to `false`, with no notice. A callback that forgets to
return on one branch therefore denies the call rather than passing through.

Where the return value lands depends on the caller, and this trips people up:

- **Through `execute()`**, anything other than boolean `true` is a denial. A `WP_Error` triggers
  `_doing_it_wrong()` and is then replaced with a generic `ability_invalid_permissions` error —
  deliberately, so a permission check cannot leak detail to someone who failed it. Your custom
  message reaches the log, not the caller.
- **Through a direct `check_permissions()` call** — it is a public method, and the REST
  `has_permission` surface and WP-CLI use it — the `WP_Error` is returned verbatim, message
  intact.

So do not rely on a custom message reaching an executing caller, and do not put anything
sensitive in one, because a permission-probing caller can read it.

```php
add_filter( 'wp_ability_permission_result', function ( $permission, $name, $input, $ability ) {
    if ( true !== $permission ) {
        return $permission; // Never widen a denial.
    }
    if ( str_starts_with( $name, 'my-plugin/' ) && get_option( 'my_plugin_frozen' ) ) {
        return false;
    }
    return $permission;
}, 10, 4 );
```

Tightening is safe; widening is not. A filter that returns `true` unconditionally silently
disables every permission callback on the site.

### `wp_ability_validate_input` / `wp_ability_validate_output` — additive only

Both run **after** the built-in `rest_validate_value_from_schema()` pass, and receive its
verdict as `$is_valid`. They extend schema validation; they cannot relax it. If the schema
already rejected the value, `$is_valid` arrives as a `WP_Error` and returning `true` does not
resurrect the call.

Use them for rules JSON Schema cannot express: cross-field constraints, database existence
checks, business rules.

```php
add_filter( 'wp_ability_validate_input', function ( $is_valid, $input, $name ) {
    if ( 'my-plugin/schedule-report' !== $name || is_wp_error( $is_valid ) ) {
        return $is_valid;
    }
    if ( strtotime( $input['ends'] ) <= strtotime( $input['starts'] ) ) {
        return new WP_Error(
            'my_plugin_invalid_range',
            __( 'The end date must be after the start date.', 'my-plugin' )
        );
    }
    return $is_valid;
}, 10, 3 );
```

Return `true` to accept, or a `WP_Error` to reject with a useful message. Returning bare
`false` also rejects, but core discards it and substitutes a generic
`ability_invalid_input` / `ability_invalid_output` error — the caller loses any explanation of
what went wrong. Prefer `WP_Error`.

Guard on `is_wp_error( $is_valid )` early, as above: without it, a callback that unconditionally
returns `true` overturns the schema verdict for every ability on the site.

Three asymmetries between the two, all of which have bitten people:

- **`wp_ability_validate_input` does not always fire.** `validate_input()` returns early when the
  ability declares no `input_schema` — `true` if the input is `null`, otherwise an
  `ability_missing_input_schema` error — and the filter is never reached. Custom input validation
  on a schema-less ability silently never runs. `validate_output()` has no such bypass: an empty
  `output_schema` still reaches the filter with `$is_valid` as `true`.
- **The rejection test is strict `false ===`.** A callback returning `0`, `''`, or `null` does not
  reject — those fall through and the value is treated as valid. Only literal `false` and
  `WP_Error` reject.
- **Neither filter receives the `WP_Ability` object.** Their third argument is the ability *name*
  string. Call `wp_get_ability( $name )` if you need the object.

## Debugging the chain

Drop this in an mu-plugin to see the real order for a given ability:

```php
foreach ( array( 'wp_ability_invoked', 'wp_before_execute_ability', 'wp_after_execute_ability' ) as $action ) {
    add_action( $action, function () use ( $action ) {
        error_log( "[abilities] action: {$action}" );
    }, 10, 0 );
}
foreach ( array(
    'wp_pre_execute_ability',
    'wp_ability_normalize_input',
    'wp_ability_validate_input',
    'wp_ability_permission_result',
    'wp_ability_execute_result',
    'wp_ability_validate_output',
) as $filter ) {
    add_filter( $filter, function ( $value ) use ( $filter ) {
        error_log( "[abilities] filter: {$filter}" );
        return $value;
    }, 10, 1 );
}
```

Symptoms and where to look:

- **Ability returns `null` for no clear reason** — a `wp_pre_execute_ability` callback returned
  something (possibly implicitly) instead of the sentinel.
- **Permission callback appears to be ignored** — either a `wp_pre_execute_ability` short-circuit
  ran first, or a `wp_ability_permission_result` filter overrode the verdict.
- **`ability_invalid_output` after adding a filter** — `wp_ability_execute_result` reshaped the
  result into something `output_schema` rejects.
- **Custom permission message never reaches the caller** — expected; `execute()` replaces
  `WP_Error` denials with the generic `ability_invalid_permissions`. Check the
  `_doing_it_wrong()` notice in the log.
- **Telemetry counts more calls than the ability actually served** — `wp_ability_invoked`
  counts attempts. Move success metering to `wp_after_execute_ability`.
- **Custom input validation never runs** — the ability declares no `input_schema`, so
  `validate_input()` returns before reaching `wp_ability_validate_input`. Add a schema.
- **A validation filter appears to be ignored** — it returned `0`, `''`, or `null`. The check is
  strict `false ===`; return literal `false` or a `WP_Error`.
- **`ArgumentCountError` on every ability call after deploying to an older site** — a
  `wp_before_execute_ability` or `wp_after_execute_ability` callback declares the 7.1 arity on a
  6.9/7.0 site. Default the trailing `$ability` parameter.
- **Permission filter denies everything after a refactor** — a branch in a
  `wp_ability_permission_result` callback returns nothing; `check_permissions()` coerces the
  resulting `null` to `false`.

## Sources

- Core source: `src/wp-includes/abilities-api/class-wp-ability.php` (`@since 7.1.0` markers)
- Dev note: https://make.wordpress.org/core/2026/07/31/abilities-api-improvements-in-wordpress-7-1/
  (Trac #64311, #65248)
