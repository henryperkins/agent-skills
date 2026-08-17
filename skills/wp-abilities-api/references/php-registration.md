# PHP registration quick guide

Key concepts and entrypoints for the WordPress Abilities API:

- Register ability categories and abilities in PHP.
- Use the Abilities API init hooks to ensure registration occurs at the right lifecycle time.

## Hook order (critical)

**Categories must be registered before abilities.** Use the correct hooks:

1. `wp_abilities_api_categories_init` — Register categories here first.
2. `wp_abilities_api_init` — Register abilities here (after categories exist).

**Warning:** Registering abilities outside `wp_abilities_api_init` triggers `_doing_it_wrong()` and the registration will fail.

```php
// 1. Register category first
add_action( 'wp_abilities_api_categories_init', function() {
    wp_register_ability_category( 'my-plugin', [
        'label'       => __( 'My Plugin', 'my-plugin' ),
        'description' => __( 'Abilities provided by My Plugin.', 'my-plugin' ),
    ] );
} );

// 2. Then register abilities
add_action( 'wp_abilities_api_init', function() {
    wp_register_ability( 'my-plugin/get-info', [
        'label'               => __( 'Get Site Info', 'my-plugin' ),
        'description'         => __( 'Returns basic site information.', 'my-plugin' ),
        'category'            => 'my-plugin',
        'execute_callback'    => 'my_plugin_get_info_callback',
        'permission_callback' => 'my_plugin_get_info_permissions',
        'meta'                => [
            // WP 7.1+: general exposure intent. On 7.0, set show_in_rest instead.
            'public'       => true,
            'show_in_rest' => true, // Explicit; also correct on 6.9/7.0.
            'mcp'          => [
                'public' => true, // Expose via the WordPress MCP adapter.
            ],
            'annotations'  => [
                'readonly'    => true,
                'destructive' => false,
                'idempotent'  => true,
            ],
        ],
    ] );
} );
```

A category needs **both** `label` and `description`; `meta` is optional. `WP_Ability_Category::prepare_properties()`
throws `InvalidArgumentException` on a missing, empty, or non-string `description` exactly as it does for `label`,
and `WP_Ability_Categories_Registry::register()` catches that into `_doing_it_wrong()` + `return null`. The failure
then cascades: `WP_Abilities_Registry::register()` rejects every ability whose `category` is not registered, so one
omitted `description` silently takes out the category *and* all of its abilities. See "How a bad registration fails"
below — this is the most common way to hit it.

## Common primitives

`wp-includes/abilities-api.php` exposes ten public functions. All ten are `@since 6.9.0`; the only
signature change since is the `$args` parameter on `wp_get_abilities()`, added in 7.1.

Abilities:

- `wp_register_ability( string $name, array $args ): ?WP_Ability`
- `wp_unregister_ability( string $name ): ?WP_Ability`
- `wp_has_ability( string $name ): bool`
- `wp_get_ability( string $name ): ?WP_Ability`
- `wp_get_abilities( array $args = array() ): array` — on 6.9/7.0 the signature is
  `wp_get_abilities(): array` and returns everything; filtering by `$args` is 7.1+.

Categories:

- `wp_register_ability_category( string $slug, array $args ): ?WP_Ability_Category`
- `wp_unregister_ability_category( string $slug ): ?WP_Ability_Category`
- `wp_has_ability_category( string $slug ): bool`
- `wp_get_ability_category( string $slug ): ?WP_Ability_Category`
- `wp_get_ability_categories(): array`

`wp_unregister_ability()` is the supported way to remove another plugin's ability. It returns the
removed `WP_Ability` on success and `null` on failure, and — like registration — its only failure
signal is `_doing_it_wrong()`: `WP_Abilities_Registry::unregister()` emits `Ability "%s" not found.`
and returns `null` when the name was never registered. Unlike registration it is **not** restricted
to `wp_abilities_api_init`; call it on any hook after `init`, because
`WP_Abilities_Registry::get_instance()` bails with `_doing_it_wrong()` before `init` has fired. Do
not unregister from inside `wp_abilities_api_init` itself — the registry instance is assigned before
that action fires, so callbacks added by other plugins may not have registered their abilities yet.
The same rules apply to `wp_unregister_ability_category()`, which does not cascade: unregistering a
category leaves abilities that referenced it registered and orphaned.

### `wp_register_ability_args` — rewriting a registration instead of removing it

`WP_Abilities_Registry::register()` runs `apply_filters( 'wp_register_ability_args', $args, $name )`
(`@since 6.9.0`) after the name-format and duplicate checks, but before everything else: the
category-registered check, the `ability_class` type check, and `WP_Ability::prepare_properties()`.
It is the only core hook that can rewrite an ability's arguments — exposure meta and both callbacks
included — before validation sees them.

That makes it the non-destructive alternative to `wp_unregister_ability()` when adjusting another
plugin's ability: tighten `meta.public`, wrap `permission_callback` in a stricter check, or narrow
`input_schema`, without removing an ability the owning plugin still depends on.

```php
add_filter( 'wp_register_ability_args', function ( array $args, string $name ): array {
    if ( 'other-plugin/delete-everything' !== $name ) {
        return $args; // Fires for every ability on the site — always name-guard.
    }
    $args['meta']['public'] = false;
    return $args;
}, 10, 2 );
```

Because it runs ahead of the remaining validation, a careless callback can also take a registration
out: writing an unregistered `category`, an uncallable `execute_callback`, or a non-boolean
`meta.public` makes `register()` fail the silent way described next. When an ability that should
exist does not, an unrelated plugin's filter on this hook is a real suspect.

## How a bad registration fails

**It fails silently.** `wp_register_ability()` never throws and never returns a `WP_Error` — every
rejection path in `WP_Abilities_Registry::register()` ends in `_doing_it_wrong()` followed by
`return null`. That includes argument validation, which throws internally and is then swallowed:

```php
try {
    // WP_Ability::prepare_properties() throws InvalidArgumentException if the properties are invalid.
    $ability = new $ability_class( $name, $args );
} catch ( InvalidArgumentException $e ) {
    _doing_it_wrong( __METHOD__, $e->getMessage(), '6.9.0' );
    return null;
}
```

So a missing `permission_callback` (on a default-class registration), a non-boolean `meta.public`,
a malformed ability name, a duplicate name, or an unregistered `category` all produce the same
observable result: **the ability simply is not there.** No exception reaches your code, nothing
appears in the REST listing, and `wp_get_ability()` returns `null`.

Two consequences worth designing around:

- **`_doing_it_wrong()` is the only signal, and it is invisible in production.** With `WP_DEBUG`
  off, the notice is not displayed and — unless `WP_DEBUG_LOG` is on — not written anywhere. A
  registration bug that a developer would have caught instantly on a debug site ships as a
  feature that quietly does nothing.
- **Do not write `try`/`catch` or `is_wp_error()` around `wp_register_ability()`.** Neither can
  fire. If you need to know a registration succeeded, check the return value, which is the
  `WP_Ability` on success and `null` on every failure:

  ```php
  add_action( 'wp_abilities_api_init', function () {
      $ability = wp_register_ability( 'my-plugin/get-info', array( /* ... */ ) );
      if ( null === $ability && defined( 'WP_DEBUG' ) && WP_DEBUG ) {
          error_log( '[my-plugin] ability my-plugin/get-info failed to register' );
      }
  } );
  ```

When debugging "my ability never appears", turn on `WP_DEBUG` **before** investigating exposure
metadata. A registration that never happened and an ability hidden by `show_in_rest` look
identical from the REST endpoint, and only the first one leaves a notice.

## Key arguments for `wp_register_ability()`

| Argument | Required? | Description |
|----------|-----------|-------------|
| `label` | **Required** | Human-readable name for UI (e.g., command palette). |
| `description` | **Required** | What the ability does. |
| `category` | **Required** | Category ID (must be registered first via `wp_abilities_api_categories_init`). |
| `execute_callback` | **Required** (unless `ability_class` is set — that exemption is **WP 7.0+**) | Function that runs when the ability is invoked. Receives mixed input (per `input_schema`), returns mixed result or `WP_Error`. |
| `permission_callback` | **Required** (unless `ability_class` is set — that exemption is **WP 7.0+**) | Function that checks whether the current user may execute. Receives the same mixed input as `execute_callback`; returns `bool` or `WP_Error`. With the default `WP_Ability` class there is no implicit default — omitting it means the ability is never registered (see "How a bad registration fails"). |
| `input_schema` | Optional | JSON Schema for expected input (enables validation). Required when the ability accepts input. |
| `output_schema` | Optional | JSON Schema for returned output (enables validation of the result). |
| `ability_class` | Optional (default `WP_Ability`) | Fully-qualified class name to instantiate instead of `WP_Ability`. Must extend `WP_Ability` — `WP_Abilities_Registry::register()` checks `is_a( $args['ability_class'], WP_Ability::class, true )` and `_doing_it_wrong()` + `return null` otherwise. On 7.0+ supplying it makes the subclass responsible for both callbacks (see below); on 6.9 both are still required. |
| `meta.public` | Optional (default `false`, **WP 7.1+**) | General "this ability is meant for clients" declaration. Channel keys override it. Core resolves `show_in_rest = meta.show_in_rest ?? meta.public ?? false`. Has no effect on WP 6.9/7.0 core, but the MCP Adapter reads it on those versions too. |
| `meta.show_in_rest` | Optional (default `false`) | Per-channel override for the `wp-abilities/v1` REST API namespace. On 7.1+ an explicit value always beats `meta.public`, in both directions. |
| `meta.mcp.public` | Optional (default: `meta.public` on adapter 0.6.0+, `false` before) | Set `true` to expose the ability as a tool via the WordPress MCP adapter, or `false` to opt a `public` ability out. |
| `meta.mcp.type` | Optional (default `'tool'`) | One of `'tool'`, `'resource'`, `'prompt'`. Controls how the MCP adapter projects the ability. A typo does **not** fail loudly — it lands the ability back on the tool path. See "`meta.mcp.type`: a typo becomes a tool" in `mcp-exposure.md`. |
| `meta.annotations.readonly` | **Strongly recommended** (default `null`) | `true` if the ability does not modify its environment. |
| `meta.annotations.destructive` | **Strongly recommended** (default `null`) | `true` if the ability may perform destructive updates. `false` for additive-only updates. |
| `meta.annotations.idempotent` | **Strongly recommended** (default `null`) | `true` if calling the ability repeatedly with the same arguments has no additional effect. |

The three annotations under `meta.annotations` are hints in one sense only: core never *verifies* them — nothing checks that a `readonly: true` ability really only reads. Core does *enforce* them. Since 6.9, `WP_REST_Abilities_V1_Run_Controller::validate_request_method()` derives the `/run` route's single legal HTTP method from them (`readonly: true` → `GET`; `destructive` **and** `idempotent` → `DELETE`; anything else → `POST`) and returns `rest_ability_invalid_method` with HTTP 405 on a mismatch, before the permission callback runs. So a missing or `null` value is legal — it routes the ability to `POST` — but the annotations are part of the ability's HTTP contract, and changing one breaks every existing REST caller. See "The `/run` method is enforced, not conventional" in `rest-api.md`.

Populate all three explicitly for the second reason as well: MCP / Command Palette / agent surfaces and review tooling reason about ability safety from these values *without* invoking the callback. A `readonly: null` ability is treated as "behavior unknown," which is a worse signal than either `true` or `false`. Treat the absence of an annotation as a bug, not a default.

### `ability_class`: naming a subclass skips callback validation (WP 7.0+)

`ability_class` is a **core** argument, documented on `wp_register_ability()` since 6.9.0 — not a
convention invented by any plugin. The registry validates it, then removes it before instantiating:

```php
if ( isset( $args['ability_class'] ) && ! is_a( $args['ability_class'], WP_Ability::class, true ) ) {
    _doing_it_wrong( __METHOD__, /* ... */, '6.9.0' );
    return null;
}
$ability_class = $args['ability_class'] ?? WP_Ability::class;
unset( $args['ability_class'] );
```

So it never becomes a property of the ability and never appears in REST output. The consequential
part is what happens next. `WP_Ability::prepare_properties()` gates the callback checks on the
instance being exactly `WP_Ability`:

```php
// If we are not overriding `ability_class` parameter during instantiation, then we need to validate the execute_callback.
if ( get_class( $this ) === self::class && ( empty( $args['execute_callback'] ) || ! is_callable( $args['execute_callback'] ) ) ) {
    throw new InvalidArgumentException( /* ... */ );
}
```

The `permission_callback` check is gated identically. **Naming a subclass therefore skips both
checks entirely**, and `execute_callback` / `permission_callback` stop being required at
registration time. The subclass takes on that responsibility: it must either still pass both
callbacks in `$args`, or override `do_execute()` and `check_permissions()`. Get it wrong and
registration succeeds — the ability appears in `wp_get_abilities()` and in the REST listing — but
every invocation fails at runtime with `WP_Error( 'ability_invalid_execute_callback' )` or
`WP_Error( 'ability_invalid_permission_callback' )`. This is the one way to produce an ability that
looks registered and is permanently broken: it moves a defect that `_doing_it_wrong()` would have
flagged at registration into a `WP_Error` returned on every call.

**The gate itself is 7.0+.** On WP 6.9 `prepare_properties()` validates `execute_callback` and
`permission_callback` unconditionally — there is no `get_class( $this )` test — so a subclass
registration that omits them is rejected the usual silent way: `_doing_it_wrong()`, `null`, no
ability. `ability_class` works on 6.9; only the callback relaxation is newer. When 6.9 is a target,
pass both callbacks in `$args` even when naming a subclass, or gate the pattern on core >= 7.0.

### Exposure keys: `public`, `show_in_rest`, `mcp.public`

Three keys, one general and two per-channel. The general one is newer than the channel ones,
which is why so much existing code and documentation only mentions the channel keys.

- **`meta.public`** (core, WP 7.1+) is the general declaration of intent. `WP_Ability` defines
  it with `protected const DEFAULT_PUBLIC = false;` and resolves it in `prepare_properties()`:

  ```php
  $args['meta']['show_in_rest'] = $args['meta']['show_in_rest'] ?? $args['meta']['public'] ?? self::DEFAULT_SHOW_IN_REST;
  $args['meta']['public']       = $args['meta']['public'] ?? self::DEFAULT_PUBLIC;
  ```

- **`meta.show_in_rest`** controls visibility on the core REST namespace `wp-abilities/v1`. On
  7.1+ it is the per-channel *override*: set it only when REST should differ from the general
  intent. An explicit `false` beats `public => true`.
- **`meta.mcp.public`** is read by the WordPress MCP adapter. On adapter 0.6.0+ it is also an
  override rather than the sole switch — `McpAbilityExposure::is_public()` resolves
  `meta.mcp.public ?? meta.public ?? false`.

So on current core + current adapter, `public => true` alone exposes an ability on **both**
channels. That is usually what an author wants, but it must be a decision rather than a
side effect:

```php
'meta' => array(
    'public'      => true,                        // REST (7.1+) and MCP (adapter 0.6.0+).
    'mcp'         => array( 'public' => false ),  // ...but keep it away from agents.
    'annotations' => array( 'readonly' => true ),
),
```

Version skew is the thing to watch. Core applies `meta.public` to REST starting in 7.1, while
the adapter applies it to MCP on 6.9 and 7.0 as well — so on an older site with a current
adapter, `public` reaches agents before it reaches REST. When the target version is uncertain,
write both the general flag and the channel key you care about; they agree on every combination
of versions. See `mcp-exposure.md` for the full resolution table and the upgrade audit.

Older guidance you may encounter in existing plugins — "`meta.public` is not a core key" or
"the adapter reads `meta.mcp.public` and nothing else" — described adapter 0.5.0 and pre-7.1
core. Both statements are now wrong; do not carry them forward.

## Recommended patterns

- Namespace ability IDs as `<plugin-slug>/<verb-noun>` (e.g., `my-plugin/get-info`, `my-plugin/update-thing`). Slash-separated.
- Treat IDs as stable API; changing an ID is a breaking change for any consumer that holds a reference.
- Use `input_schema` and `output_schema` for validation and to help AI agents understand usage.
- **Always include a `permission_callback`.** It is required on every registration — there is no implicit default.
- **Always set all three `meta.annotations` keys (`readonly`, `destructive`, `idempotent`) explicitly.** Leaving them at the `null` default broadcasts "behavior unknown" to every consumer that reads this metadata before invoking the ability. The cost of writing them is three lines; the cost of omitting them is opaque safety surface.

## Where the API lives

The Abilities API is **core** from WordPress 6.9 onward — `wp-includes/abilities-api.php` plus
`wp-includes/abilities-api/`. The `WordPress/abilities-api` feature plugin that preceded it was
archived on 5 February 2026 and is read-only; its last tagged release was the `v0.5.0-rc`
prerelease (14 November 2025), and its last stable release was `v0.4.0`. Do not install it, and
do not treat it as a back-compat shim for WP < 6.9 — MCP Adapter 0.6.0 dropped support for that
path explicitly. Projects that must run below 6.9 should feature-detect
(`function_exists( 'wp_register_ability' )`) and degrade rather than vendoring the archived
plugin.

## References

- Abilities API handbook: https://developer.wordpress.org/apis/abilities-api/
- Core source: `src/wp-includes/abilities-api/class-wp-ability.php` — the authority on meta keys
  and their defaults, with `@since` tags separating the 6.9 surface from the 7.1 additions.
- Dev note (6.9): https://make.wordpress.org/core/2025/11/10/abilities-api-in-wordpress-6-9/
- Dev note (7.1 `public` flag): https://make.wordpress.org/core/2026/08/04/a-unified-public-exposure-flag-for-abilities-in-wordpress-7-1/
- WordPress MCP adapter package — source of the `meta.mcp.public` / `meta.mcp.type` contract. The
  adapter is versioned independently of core and has already changed this contract once; verify
  the meta-key semantics against the package version your plugin actually pulls in.
