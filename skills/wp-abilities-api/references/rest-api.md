# REST API and exposure (`wp-abilities/v1`)

## Endpoints

The Abilities API registers five routes under the `wp-abilities/v1` namespace:

| Route | Methods | Purpose |
|---|---|---|
| `/wp-abilities/v1/categories` | `GET` | List ability categories. |
| `/wp-abilities/v1/categories/{slug}` | `GET` | Get one category. |
| `/wp-abilities/v1/abilities` | `GET` | List abilities (only those resolving to `show_in_rest: true`). |
| `/wp-abilities/v1/abilities/{name}` | `GET` | Get one ability, including its schemas and meta. |
| `/wp-abilities/v1/abilities/{name}/run` | `GET`, `POST`, `DELETE` | **Execute** the ability. |

`{name}` is the full namespaced ID, slash included — `my-plugin/list-orders` — so the run route
reads `/wp-abilities/v1/abilities/my-plugin/list-orders/run`.

The method used on `/run` is not arbitrary. The client packages pick it from the ability's
annotations (`readonly: true` → `GET`; `destructive: true` + `idempotent: true` → `DELETE`;
otherwise `POST`), which is one more reason to set annotations accurately — see
`client-side.md`. Input travels as the `input` argument: a query-string parameter on `GET` and
`DELETE`, a body parameter on `POST`.

Debug checklist:

- Confirm the route exists under `wp-json/wp-abilities/v1/...`.
- Verify the ability/category shows in REST responses.
- If missing, check the exposure resolution below — on WP 7.1+ an ability can be hidden by
  either `meta.show_in_rest` or `meta.public`.

## Exposure: `public` and `show_in_rest` (WP 7.1+)

Before 7.1, each client channel had its own opt-in key and there was no way to say "this
ability is meant for clients" once. WP 7.1 adds `meta.public` as the general statement of
intent, with channel keys overriding it.

Core resolves the two at registration, in `WP_Ability::prepare_properties()`:

```php
$args['meta']['show_in_rest'] = $args['meta']['show_in_rest'] ?? $args['meta']['public'] ?? false;
$args['meta']['public']       = $args['meta']['public'] ?? false;
```

Both default to `false`. `show_in_rest` wins when set; otherwise `public` supplies the value.

| `meta.public` | `meta.show_in_rest` | Effective `show_in_rest` |
|---|---|---|
| *(unset)* | *(unset)* | `false` |
| `true` | *(unset)* | `true` |
| `false` | *(unset)* | `false` |
| `true` | `false` | `false` — public everywhere else, hidden from REST |
| `false` | `true` | `true` — REST-only exposure |

Only `null` counts as unset, so an explicit `false` is preserved rather than falling through.

On 7.1+, prefer `public` as the default declaration and reach for `show_in_rest` only when one
channel needs to differ:

```php
wp_register_ability(
    'my-plugin/list-orders',
    array(
        'label'               => __( 'List orders', 'my-plugin' ),
        'description'         => __( 'Returns recent orders.', 'my-plugin' ),
        'category'            => 'commerce',
        'input_schema'        => array( /* ... */ ),
        'output_schema'       => array( /* ... */ ),
        'execute_callback'    => 'my_plugin_list_orders',
        'permission_callback' => static function () {
            return current_user_can( 'edit_shop_orders' );
        },
        'meta'                => array(
            'public'      => true,  // Intended for clients generally.
            'annotations' => array( 'readonly' => true ),
        ),
    )
);
```

### Exposure is not authorization

`public` and `show_in_rest` decide **whether a client can see and address the ability**. They
decide nothing about **who may run it**. Every invocation still runs `permission_callback`,
through REST, PHP, WP-CLI, and MCP alike.

Two failure shapes follow, and coding agents produce both:

- **Setting `public => true` and omitting `permission_callback`.** The ability is now
  discoverable and runs for anyone who can reach the endpoint. `public` is not a gate. (Core
  throws `InvalidArgumentException` on a missing `permission_callback`, so the realistic version
  of this bug is a callback that returns `true` unconditionally.)
- **Setting `public => false` and treating that as the security control.** Obscurity is not
  authorization; a non-public ability is still executable by any code path that knows its
  name, including a direct `wp_get_ability( 'my-plugin/x' )->execute()`.

Write the permission callback as though the ability were fully public, then set exposure
separately to control who can *find* it.

### `public` reaches MCP too — check the adapter version

`meta.public` is not REST-only. The MCP Adapter reads the same flag, and **the direction of the
default flipped in adapter 0.6.0**:

| Adapter version | Default-server exposure rule |
|---|---|
| ≤ 0.5.0 | `meta.mcp.public` only. No fallback — `public: true` did nothing for MCP. |
| 0.6.0+ | `McpAbilityExposure::is_public()` resolves `meta.mcp.public ?? meta.public ?? false`. |

So on a current adapter, `public => true` **does** expose the ability through the default MCP
server, and opting out takes an explicit `meta.mcp.public => false`. Note the version skew this
creates: core applies `meta.public` to REST starting in 7.1, but the adapter honors it for MCP
on 6.9 and 7.0 as well. A site on WP 7.0 with adapter 0.6.1 gets MCP exposure from `public`
while REST still ignores it. See `mcp-exposure.md`.

## Typed REST inputs (WP 7.1+)

A run request sends input as a query string on `GET` and `DELETE`, so every value arrives at
PHP as a string. Before 7.1, callbacks received `"10"` where the schema declared an integer,
and `"true"` and `"false"` were both truthy strings — a classic source of silently wrong
behavior.

WP 7.1 coerces run-request input to the types declared in `input_schema` before the ability
runs. It is registered as the `sanitize_callback` on the controller's `input` argument, so it
applies **regardless of transport** — both `check_ability_permissions()` and
`execute_ability()` receive natively typed input on `POST` as well. Query-string methods are
simply where the difference is visible, because that is where everything arrives as a string:

```
GET /wp-json/wp-abilities/v1/abilities/my-plugin/list-items/run
    ?input[limit]=10&input[featured]=true&input[ids]=1,2,3
```

With a schema declaring `limit` as `integer`, `featured` as `boolean`, and `ids` as an array
of integers, the callback receives `10`, `true`, and `array( 1, 2, 3 )`.

Two consequences:

- **Declare accurate types in `input_schema`.** Coercion is driven entirely by the schema. An
  input typed `string` stays a string no matter what it looks like.
- **Coercion is not a validation escape hatch.** The controller runs `validate_input()` first
  and returns the input untouched if it is already invalid, then falls back to the raw input if
  sanitization itself errors. So coercion never widens what validation accepts — anything the
  schema would have rejected is still rejected. Do not generate code that relies on coercion to
  clean up untrusted input.

Because this landed in 7.1, a callback that must also run on 7.0 cannot assume the native
type. Either gate on the core version or keep the callback tolerant:

```php
$limit = (int) ( $input['limit'] ?? 10 );
```

## Server-side discovery with `wp_get_abilities()` (args are WP 7.1+)

`wp_get_abilities()` exists since 6.9 and returned the whole registry. WP 7.1 adds an optional
`$args` array so callers can filter in core rather than looping and testing by hand:

```php
function wp_get_abilities( array $args = array() ): array
```

| Arg | Type | Behavior |
|---|---|---|
| `category` | string | Exact match on category slug. |
| `namespace` | string | Ability namespace prefix, no trailing slash (`'my-plugin'`; `'my-plugin/'` normalizes the same). |
| `meta` | array | Key/value pairs, AND logic, nested arrays supported. Strict comparison — `true` does not match `1`. |
| `item_include_callback` | callable | Per-ability, receives `WP_Ability`, returns bool. |
| `result_callback` | callable | Receives the matched `WP_Ability[]`, returns the reshaped array. |

Declarative args combine with AND:

```php
$abilities = wp_get_abilities(
    array(
        'category'  => 'commerce',
        'namespace' => 'my-plugin',
        'meta'      => array( 'public' => true ),
    )
);
```

Nested meta works, which is how you enumerate the MCP-exposed set:

```php
$mcp_abilities = wp_get_abilities(
    array( 'meta' => array( 'mcp' => array( 'public' => true ) ) )
);
```

On adapter 0.6.0+ that query is *incomplete* on its own — abilities exposed by inheriting
`meta.public` carry no `meta.mcp.public` key at all. To enumerate what the default MCP server
actually serves, union it with the `public` set and subtract explicit opt-outs.

The pipeline runs in this order: declarative filters, then `item_include_callback`, then the
`wp_get_abilities_item_include` filter, then `result_callback`, then the
`wp_get_abilities_result` filter. Steps one through three share a single pass over the
registry.

The pipeline runs even with no arguments, so the two filters always fire — that is the
supported place for a plugin to enforce a site-wide inclusion rule. For raw registry data that
bypasses filtering entirely, call `WP_Abilities_Registry::get_all_registered()`.

`item_include_callback` runs per ability and receives the `WP_Ability` object, so it can do
capability checks — but note that filtering a list for display is not the same as authorizing
execution:

```php
$visible = wp_get_abilities(
    array(
        'meta'                  => array( 'public' => true ),
        'item_include_callback' => static function ( WP_Ability $ability ) {
            // Compare strictly: check_permissions() can return WP_Error, which is truthy.
            return true === $ability->check_permissions();
        },
    )
);
```

### REST equivalents

The list endpoint accepts the same declarative filters as query parameters:

```
GET /wp-json/wp-abilities/v1/abilities?namespace=my-plugin
GET /wp-json/wp-abilities/v1/abilities?category=my-plugin-content
GET /wp-json/wp-abilities/v1/abilities?meta[annotations][readonly]=true
GET /wp-json/wp-abilities/v1/abilities?category=data-export&namespace=my-plugin
```

### The 7.0 fallback trap

On WP 6.9 and 7.0 the function takes no parameters. PHP does not error when extra arguments
are passed to a userland function, so `wp_get_abilities( array( 'meta' => array( 'public' => true ) ) )`
on a 7.0 site **does not fail — it silently returns every registered ability**, filters and all
ignored. Code that trusted the filter then leaks the full registry into a client list.

There is no runtime signal that the filter was dropped, so gate explicitly on any project that
still supports 7.0:

```php
$args = array( 'meta' => array( 'public' => true ) );

if ( version_compare( get_bloginfo( 'version' ), '7.1', '>=' ) ) {
    $abilities = wp_get_abilities( $args );
} else {
    $abilities = array_filter(
        wp_get_abilities(),
        static function ( WP_Ability $ability ) {
            return true === ( $ability->get_meta()['public'] ?? false );
        }
    );
}
```

## Sources

- Core source: `src/wp-includes/abilities-api.php`, `src/wp-includes/abilities-api/class-wp-ability.php`
- Dev note (6.9, endpoints): https://make.wordpress.org/core/2025/11/10/abilities-api-in-wordpress-6-9/
- Dev note (7.1, `public` flag): https://make.wordpress.org/core/2026/08/04/a-unified-public-exposure-flag-for-abilities-in-wordpress-7-1/ (Trac #65568)
- Dev note (7.1, filtering): https://make.wordpress.org/core/2026/08/05/filtering-registered-abilities-with-wp_get_abilities-in-wordpress-7-1/ (Trac #64990)
