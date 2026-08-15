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
        'label' => __( 'My Plugin', 'my-plugin' ),
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

## Common primitives

- `wp_register_ability_category( $category_id, $args )`
- `wp_register_ability( $ability_id, $args )`

## Key arguments for `wp_register_ability()`

| Argument | Required? | Description |
|----------|-----------|-------------|
| `label` | **Required** | Human-readable name for UI (e.g., command palette). |
| `description` | **Required** | What the ability does. |
| `category` | **Required** | Category ID (must be registered first via `wp_abilities_api_categories_init`). |
| `execute_callback` | **Required** | Function that runs when the ability is invoked. Receives mixed input (per `input_schema`), returns mixed result or `WP_Error`. |
| `permission_callback` | **Required** | Function that checks whether the current user may execute. Receives the same mixed input as `execute_callback`; returns `bool` or `WP_Error`. WP core throws `InvalidArgumentException` if this is missing — there is no implicit default. |
| `input_schema` | Optional | JSON Schema for expected input (enables validation). Required when the ability accepts input. |
| `output_schema` | Optional | JSON Schema for returned output (enables validation of the result). |
| `meta.public` | Optional (default `false`, **WP 7.1+**) | General "this ability is meant for clients" declaration. Channel keys override it. Core resolves `show_in_rest = meta.show_in_rest ?? meta.public ?? false`. Has no effect on WP 6.9/7.0 core, but the MCP Adapter reads it on those versions too. |
| `meta.show_in_rest` | Optional (default `false`) | Per-channel override for the `wp-abilities/v1` REST API namespace. On 7.1+ an explicit value always beats `meta.public`, in both directions. |
| `meta.mcp.public` | Optional (default: `meta.public` on adapter 0.6.0+, `false` before) | Set `true` to expose the ability as a tool via the WordPress MCP adapter, or `false` to opt a `public` ability out. |
| `meta.mcp.type` | Optional (default `'tool'`) | One of `'tool'`, `'resource'`, `'prompt'`. Controls how the bundled MCP adapter projects the ability. Values outside this enum silently coerce to `'tool'`. |
| `meta.annotations.readonly` | **Strongly recommended** (default `null`) | `true` if the ability does not modify its environment. |
| `meta.annotations.destructive` | **Strongly recommended** (default `null`) | `true` if the ability may perform destructive updates. `false` for additive-only updates. |
| `meta.annotations.idempotent` | **Strongly recommended** (default `null`) | `true` if calling the ability repeatedly with the same arguments has no additional effect. |

The three annotations under `meta.annotations` are *hints* for tooling and documentation — core does not enforce them at runtime, so a missing or `null` value is silently legal. That permissiveness is exactly why every registration should populate them explicitly: MCP / Command Palette / agent surfaces and review tooling reason about ability safety from these values *without* invoking the callback. A `readonly: null` ability is treated as "behavior unknown," which is a worse signal than either `true` or `false`. Treat the absence of an annotation as a bug, not a default.

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
archived on 5 February 2026 and is read-only; its last release was 0.2.0. Do not install it, and
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
