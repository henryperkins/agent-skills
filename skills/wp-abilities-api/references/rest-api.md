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

The four discovery routes — both category routes and both ability routes — gate on
`current_user_can( 'read' )`, and have since 6.9. The requester must be an authenticated user
holding at least Subscriber; an anonymous `GET /wp-json/wp-abilities/v1/abilities` returns
`rest_forbidden` with **HTTP 401**, not an empty array. `show_in_rest: true` therefore never makes
an ability anonymously discoverable, and an enumeration client needs cookie+nonce or
application-password auth. `/run` is gated separately, by the ability's own `permission_callback`.

Debug checklist:

- Confirm the route exists under `wp-json/wp-abilities/v1/...`.
- Verify the ability/category shows in REST responses.
- If a discovery route returns **401**, the request is unauthenticated — those four routes require
  a logged-in user with `read`, whatever the ability's exposure meta says.
- If missing, check the exposure resolution below — on WP 7.1+ an ability can be hidden by
  either `meta.show_in_rest` or `meta.public`.
- If `/run` returns **405**, the HTTP method does not match the one the ability's annotations
  require — see the next section.

### The `/run` method is enforced, not conventional

The route registers `WP_REST_Server::ALLMETHODS`, but that is a load-order workaround, not
permissiveness: routes are registered before plugins have registered their abilities, so core
cannot know each ability's annotations at registration time. It enforces the method later
instead. `check_ability_permissions()` — the route's `permission_callback` — calls
`validate_request_method()`, which derives **exactly one** legal method from the annotations:

| Annotations | Required method |
|---|---|
| `readonly: true` | `GET` |
| `destructive: true` **and** `idempotent: true` | `DELETE` |
| anything else | `POST` |

The first matching row wins (`readonly` is tested before the destructive/idempotent pair). Any
other method returns `rest_ability_invalid_method` with **HTTP 405**, before the permission
callback or the execute callback runs.

So this is not a client-side convention that `@wordpress/abilities` happens to follow — the
package follows it because the server requires it. Two practical consequences:

- **A hand-rolled client must derive the method the same way.** `POST`ing to a `readonly`
  ability gets a 405, not a result. Read the ability's annotations from
  `GET /wp-abilities/v1/abilities/{name}` and pick the method from the table above.
- **Changing an annotation changes the ability's HTTP contract.** Flipping `readonly` from
  `true` to `false` moves the ability from `GET` to `POST` and breaks every existing caller.
  Treat annotations as part of the public API surface, not as documentation.

Input travels as the `input` argument: a query-string parameter on `GET` and `DELETE`, and a **JSON
body** parameter on `POST` — `{"input": { ... }}` sent with `Content-Type: application/json`.
`get_input_from_request()` reads `get_json_params()` and nothing else on `POST`, so a form-encoded
or multipart body is ignored outright: the ability receives `null` input and either runs on schema
defaults or fails `validate_input()` with a 400 complaining that `input` is not an object rather than
about the content type. See `client-side.md` for how the JS packages apply the same mapping.

### The list endpoints are paginated — a single request is not the full set

Both collection routes — `/wp-abilities/v1/abilities` and `/wp-abilities/v1/categories` —
paginate, and have since 6.9. `get_collection_params()` declares:

| Param | Type | Default | Range |
|---|---|---|---|
| `page` | integer | `1` | minimum `1` |
| `per_page` | integer | `50` | `1`–`100` |

`get_items()` filters first, then slices the matched set with `array_slice()`, so the totals
describe the *filtered* collection, not the whole registry. Every list response carries:

- `X-WP-Total` — matched items before slicing.
- `X-WP-TotalPages` — `ceil( total / per_page )`.
- `Link: <...>; rel="prev"` when `page > 1`, and `Link: <...>; rel="next"` when
  `page < X-WP-TotalPages`. Both links preserve the request's other query parameters.

```
GET /wp-json/wp-abilities/v1/abilities?per_page=100&page=2

X-WP-Total: 137
X-WP-TotalPages: 2
Link: <.../wp-abilities/v1/abilities?per_page=100&page=1>; rel="prev"
```

The consequence for generated code: **an enumeration client that issues one unparameterized
`GET /wp-abilities/v1/abilities` and treats the array as the registry silently truncates at 50
on any site with more REST-visible abilities than that.** There is no error and no marker in
the body — the request looks entirely successful. `per_page=100` raises the ceiling but does not
remove it; the only correct enumeration is a loop that requests `page=1..X-WP-TotalPages` (or
follows `rel="next"` until it is absent) and concatenates the pages.

A `page` past the end is not an error either: the slice is empty, so the response is `200` with
`[]` and the totals headers still populated. Do not read an empty body as "this filter matched
nothing" without checking `X-WP-Total`.

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

### Worked example: what the flag change did to core's own abilities

Core migrated its three registered abilities onto `meta.public` in 7.1, and the migration changed
observable behavior for one of them. This is the clearest available demonstration that `public`
is not a cosmetic rename of `show_in_rest`:

| Ability | 7.0 registration | 7.1 registration | Effective REST | `permission_callback` |
|---|---|---|---|---|
| `core/get-site-info` | `show_in_rest => true` | `public => true` | `true` → `true` (unchanged) | `current_user_can( 'manage_options' )` |
| `core/get-user-info` | `show_in_rest => false` | `public => true` | **`false` → `true`** | `is_user_logged_in()` |
| `core/get-environment-info` | `show_in_rest => true` | `public => true` | `true` → `true` (unchanged) | `current_user_can( 'manage_options' )` |

`core/get-user-info` was deliberately hidden from REST on 7.0 and is listed on 7.1, reachable by
any logged-in user. And because all three now carry `meta.public => true` with no
`meta.mcp.public` key, all three are served by the default MCP server on adapter 0.6.0+ — where
on 7.0 none of them were, since the adapter reads `meta.public` and 7.0 never sets it.

The lesson generalizes to any migration from a channel key to `public`: `show_in_rest => false`
and *no* exposure key are the same effective value but not the same declaration, and only the
first survives a rewrite to `public => true`. When converting registrations, convert
`show_in_rest => false` to `public => false` (or keep the explicit `show_in_rest => false`
alongside `public => true`), never drop it.

### Exposure is not authorization

`public` and `show_in_rest` decide **whether a client can see and address the ability**. They
decide nothing about **who may run it**. Every invocation still runs `permission_callback`,
through REST, PHP, WP-CLI, and MCP alike.

Two failure shapes follow, and coding agents produce both:

- **Setting `public => true` and omitting `permission_callback`.** The ability is now
  discoverable and runs for anyone who can reach the endpoint. `public` is not a gate. (Core
  rejects a registration with no `permission_callback`, but it does so by discarding the ability
  behind a `_doing_it_wrong()` notice rather than raising anything catchable — so in practice
  this bug ships as a callback that returns `true` unconditionally. See
  "How a bad registration fails" in `php-registration.md`.)
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
supported place for a plugin to enforce a site-wide inclusion rule. There is no supported public
bypass for those filters. `WP_Abilities_Registry::get_all_registered()` returns the raw registry,
but the registry class and this direct method are private API and are not covered by backward
compatibility; reserve it for diagnostic tooling that accepts that risk.

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

Unlike `wp_get_abilities()`, which returns everything it matches, the endpoint slices the result
— add `per_page`/`page` and follow `X-WP-TotalPages` as described above.

The list endpoint always forces `meta => array( 'show_in_rest' => true )` into the query and
merges caller-supplied `meta` **underneath** it, so a caller cannot use `?meta[...]` to reveal an
ability that is hidden from REST. `show_in_rest` is deliberately absent from the declared
parameters for the same reason.

#### `?meta[...]` silently matches nothing on undeclared keys

This is the REST counterpart of the strict-comparison rule above, and it is the most common
"my filter returns an empty list" cause.

Query-string values arrive as **strings**, and `wp_get_abilities()` compares meta strictly. So
`?meta[custom_key]=true` compares `'true' !== true` and matches nothing — no error, just an empty
collection. The values that *do* work are the ones core pre-declares a schema type for, and core
pre-declares only the three annotations:

```php
'meta' => array(
    'type'       => 'object',
    'properties' => array(
        // show_in_rest is omitted on purpose. It is forced on and cannot be filtered by a caller.
        'annotations' => array(
            'type'       => 'object',
            'properties' => array(
                'readonly'    => array( 'type' => array( 'boolean', 'null' ) ),
                'destructive' => array( 'type' => array( 'boolean', 'null' ) ),
                'idempotent'  => array( 'type' => array( 'boolean', 'null' ) ),
            ),
            'additionalProperties' => true,
        ),
    ),
    'additionalProperties' => true,
),
```

`additionalProperties => true` is why an undeclared key is *accepted* rather than rejected — it
passes validation, stays a string, and then fails the strict match. Declaring a type is what lets
REST coerce `"true"` to `true` before matching.

WP 7.1 adds **`rest_abilities_collection_params`** for exactly this. Declare the type of any
custom meta key your clients filter on:

```php
add_filter(
    'rest_abilities_collection_params',
    function ( array $params ): array {
        $params['meta']['properties']['mcp'] = array(
            'description'          => __( 'Limit results by MCP metadata.', 'my-plugin' ),
            'type'                 => 'object',
            'properties'           => array(
                'public' => array( 'type' => array( 'boolean', 'null' ) ),
            ),
            'additionalProperties' => true,
        );

        $params['meta']['properties']['tier'] = array(
            'description' => __( 'Limit results by plugin tier.', 'my-plugin' ),
            'type'        => 'integer',
        );

        return $params;
    }
);
```

With that in place `?meta[mcp][public]=true` and `?meta[tier]=2` both match. Without it, both
return an empty collection while looking perfectly well-formed.

Note the ordering constraint: this filter runs on the REST controller, so it only affects the
*endpoint*. A direct PHP call to `wp_get_abilities( array( 'meta' => array( 'tier' => '2' ) ) )`
still fails the strict comparison — pass a real integer there.

### The 7.0 fallback trap

On WP 6.9 and 7.0 the function takes no parameters. PHP does not error when extra arguments
are passed to a userland function, so `wp_get_abilities( array( 'meta' => array( 'public' => true ) ) )`
on a 7.0 site **does not fail — it silently returns every registered ability**, filters and all
ignored. Code that trusted the filter then leaks the full registry into a client list.

There is no runtime signal that the filter was dropped, so gate explicitly on any project that
still supports 7.0:

```php
$args = array( 'meta' => array( 'public' => true ) );

if ( version_compare( get_bloginfo( 'version' ), '7.1-alpha', '>=' ) ) {
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
