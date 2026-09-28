# Exposing abilities via the MCP Adapter

The MCP Adapter (`WordPress/mcp-adapter`) bridges the Abilities API to the Model Context Protocol, letting external AI agents (Claude Desktop, Claude Code, Cursor, ChatGPT) discover and execute WordPress abilities as MCP tools, resources, and prompts.

The adapter is a separate WordPress plugin. WordPress ships the Abilities API in core from 6.9
onward but does **not** ship the adapter. MCP Adapter 0.6.x requires **WordPress 6.9+ and PHP 7.4+**
(`^7.4 || ^8.0`). WordPress 6.9 supports PHP 7.2.24+, while WordPress 7.0 and 7.1 require PHP 7.4+,
so a 6.9 site on PHP 7.2 or 7.3 must upgrade PHP before activating the adapter — or leave MCP
exposure off.

**Current release: 0.6.1.** Verify against the version the project actually pulls in — this
package moves faster than core, and 0.6.0 changed both the exposure default and the minimum
platform:

- **WordPress 6.9+ is now required**, and the standalone `WordPress/abilities-api` plugin is no
  longer a supported installation path (that repository is archived; the API
  lives in core).
- **`meta.public` now grants MCP exposure** unless `meta.mcp.public` opts out — see below. This
  reverses the 0.5.0 rule and is the single most important thing to get right in a registration.
- On multisite, session storage moved from a network-wide key to per-site keys, so active
  Streamable HTTP sessions must reconnect once after upgrading. Concurrent session mutations are
  now guarded with bounded retries.
- `_meta` is preserved on resource contents, embedded resources, content blocks, and prompt
  messages (malformed `_meta` is dropped without discarding the payload it accompanies);
  resource-URI lookup now folds the **scheme** and only the scheme, so
  `MyPlugin://Thing` resolves a resource registered as `myplugin://Thing` while
  `myplugin://thing` still does not — everything after the scheme stays case-sensitive.

The rest of the 0.6.0/0.6.1 changes are under "What changed in 0.6.0 / 0.6.1" below.

## Installation

Install the canonical **WordPress plugin (recommended)** and activate it:

```bash
wp plugin install https://github.com/WordPress/mcp-adapter/releases/latest/download/mcp-adapter.zip --activate
```

`releases/latest` resolves to whatever was published last. This reference is verified against
0.6.1, and 0.7.0 is prepared on upstream trunk with breaking changes, so check the installed
version (`WP_MCP_VERSION`) and read "Unreleased: MCP Adapter 0.7.0" below if it reports 0.7.x.

Declare the dependency in the header of every plugin that integrates with the adapter, then guard
the integration at runtime so deactivation never causes a fatal:

```php
/**
 * Plugin Name: My MCP Integration
 * Requires Plugins: mcp-adapter
 */

add_action( 'plugins_loaded', function () {
    if ( ! class_exists( 'WP\MCP\Core\McpAdapter' ) ) {
        return;
    }

    // Attach callbacks for mcp_adapter_init here.
} );
```

`Requires Plugins: mcp-adapter` gives WordPress the activation-order dependency; the `class_exists()`
guard handles deactivation and partial installations. The plugin bootstrap calls `McpAdapter::instance()`
for you.

`class_exists()` only proves that *some* copy of the `WP\MCP` classes is loadable — other plugins
can bundle the library, and a bundled copy that nobody boots never fires `mcp_adapter_init`.
`defined( 'WP_MCP_VERSION' )` is true only when the canonical plugin is active (its bootstrap
defines it). Keep the integration itself inside an `mcp_adapter_init` callback, which fires only
after an adapter has actually booted.

**`Requires Plugins` cannot install the adapter for site owners yet.** WordPress resolves that header
against the WordPress.org directory, and the adapter is not listed there as of 0.6.1
([#178](https://github.com/WordPress/mcp-adapter/issues/178) tracks the listing; upstream trunk added a
WordPress.org deploy step to its release workflow in #347, so the listing is expected with 0.7.0 —
re-check before relying on it). Until it is, the header offers no install link — it only blocks
activating your plugin until someone installs and activates the release zip. Pair it with the
runtime guard and an admin notice:

```php
add_action( 'admin_notices', function () {
    if ( class_exists( 'WP\MCP\Core\McpAdapter' ) ) {
        return;
    }
    echo '<div class="notice notice-warning"><p>';
    esc_html_e( 'My Plugin: install and activate the MCP Adapter plugin to enable MCP features.', 'my-plugin' );
    echo '</p></div>';
} );
```

**Composer bundling is a legacy path.** Release 0.6.1 still supports `composer require
wordpress/mcp-adapter`, with no deprecation notice. A bundled copy does not boot itself — Composer
autoloading registers no hooks — so you must call `McpAdapter::instance()`, and upstream's 0.6.1
installation guide recommends loading `vendor/autoload_packages.php` (Jetpack Autoloader) rather than
`vendor/autoload.php` so the newest `WP\MCP` classes win when several plugins bundle different
versions. The adapter's own `composer.json` requires Jetpack Autoloader, but that alone does not
generate `autoload_packages.php`: the autoloader's Composer plugin only runs when the *root* package
requires `automattic/jetpack-autoloader` directly, and Composer refuses to run it until the root
`composer.json` allows it in `config.allow-plugins`. Do both, or the file silently never appears.

Upstream trunk — the unreleased 0.7.0 — deprecates bundled loading: `McpAdapter::check_plugin_loaded()`
calls `_deprecated_function()` when the adapter loads without the canonical plugin, and when both are
present but the bundled classes load first, the plugin logs `_doing_it_wrong()` and shows a
non-dismissible admin notice (`WP_MCP_AUTOLOAD=false` turns off the plugin's own autoloader; upstream
does not recommend it). Do not start a new deployment on the Composer path. To migrate an existing one: `composer remove wordpress/mcp-adapter`,
drop `automattic/jetpack-autoloader` and its `config.allow-plugins` entry if nothing else needs them,
switch `vendor/autoload_packages.php` back to `vendor/autoload.php`, and clear the generated files
(`rm -rf vendor && composer install`) — a leftover `autoload_packages.php` works locally and fails in
production. Upstream's [migration guide](https://github.com/WordPress/mcp-adapter/blob/trunk/docs/migration/v0.7.0.md)
has the full sequence.

## How abilities become MCP tools

Once the adapter is loaded:

1. The default server's `discover-abilities`, `get-ability-info`, and `execute-ability` abilities only surface registered abilities that resolve to MCP-public — on 0.6.0+ that means `meta.mcp.public` when set, otherwise `meta.public` (see the resolution rules below).
2. A custom server may explicitly list selected ability IDs as tools, resources, or prompts; that selection does not bypass each ability's `permission_callback`.
3. The adapter respects the ability's `permission_callback` at execution — agents can only invoke what the authenticated user is authorized to do.
4. The ability's `input_schema` and `output_schema` become the MCP tool's input and output schemas — but MCP requires both to be object-typed, so `SchemaTransformer::transform_to_object_schema()` rewrites a non-object root. An input schema of `{ "type": "string" }` is advertised to clients as `{ "type": "object", "properties": { "input": { "type": "string" } }, "required": [ "input" ] }`, a non-object output schema is wrapped under `result`, and an absent `input_schema` is advertised as an empty object schema. The adapter unwraps and rewraps around execution, so the ability itself still sees its declared shape. Declare an object root if you want the tool schema clients read to match the registration.
5. The ability's annotations map to MCP annotations: `readonly` → `readOnlyHint`, `destructive` → `destructiveHint`, `idempotent` → `idempotentHint`.

Mark an ability public for the default-server flow only after reviewing it for external use:

```php
'meta' => array(
    'mcp' => array(
        'public' => true,
    ),
    'annotations' => array(
        'readonly' => true,
    ),
),
```

MCP exposure controls default-server discovery, not authorization. A well-shaped ability still needs a namespaced ID, label, description, schemas, permission callback, and accurate annotations.

## Ability names are rewritten into MCP tool names

MCP tool and prompt names allow only `A-Za-z0-9_.-`, so an ability is **not** exposed under the
name you registered. `RegisterAbilityAsMcpTool::resolve_tool_name()` runs the registered name
through `McpNameSanitizer::sanitize_name()` (verified in v0.6.1) before the tool is built:

| Step | Effect |
|---|---|
| trim, then `/` → `-` | `my-plugin/list-comments` becomes `my-plugin-list-comments` |
| `remove_accents()` | `é` → `e`, `ñ` → `n` — only reached if the name is still invalid after the slash swap |
| `[^a-zA-Z0-9_.-]` → `-`, consecutive hyphens collapsed, leading/trailing `-` and `_` trimmed | spaces and other punctuation become hyphens |
| length > 128 | truncated to 115 chars + `-` + the first 12 hex chars of `md5()` of the *original* name |

Only an empty result fails; it returns `WP_Error` and the tool is not registered. The
`mcp_adapter_tool_name` filter receives the sanitized name and its return value is re-validated.

Prompts use the same sanitizer (`RegisterAbilityAsMcpPrompt::resolve_prompt_name()`). Resources
do not — they are identified by the URI you declare at `meta.mcp.uri`.

So the default server's three abilities reach clients as:

| Registered ability | Client-visible tool |
|---|---|
| `mcp-adapter/discover-abilities` | `mcp-adapter-discover-abilities` |
| `mcp-adapter/get-ability-info` | `mcp-adapter-get-ability-info` |
| `mcp-adapter/execute-ability` | `mcp-adapter-execute-ability` |

Four places still take the **unsanitized** ability name and must not be "corrected" to the
hyphenated form:

- the `tools` / `resources` / `prompts` arrays passed to `create_server()`, and the same keys in
  the `mcp_adapter_default_server_config` filter — those are ability names, resolved with
  `wp_get_ability()`.
- the `ability_name` argument of `mcp-adapter-execute-ability`, also resolved with
  `wp_get_ability()`.
- the `ability_name` argument of `mcp-adapter-get-ability-info`, resolved the same way.
- the `name` field reported by `mcp-adapter-discover-abilities` and by
  `mcp-adapter-get-ability-info`, which is `WP_Ability::get_name()`.

Everything the protocol carries as a *tool name* is sanitized — including the `$tool_name` passed
to `mcp_adapter_pre_tool_call`. See "Sessions and request interception" for why that matters.

## Exposure resolution — the 0.6.0 reversal

**This changed, and it changed in the dangerous direction.** Adapter 0.6.0 introduced
`McpAbilityExposure::is_public()` (tagged `@since 0.6.0`), which resolves:

```
meta.mcp.public  ?? meta.public  ?? false
```

An explicit `meta.mcp.public` still wins in both directions; a malformed `meta.mcp` fails
closed. But an *absent* `meta.mcp.public` now inherits the general-purpose `meta.public` flag
that WP 7.1 adds for REST exposure. The exact logic (`McpAbilityExposure::is_meta_public()`,
verified in v0.6.1):

```php
$mcp_meta = $meta['mcp'] ?? array();
if ( ! is_array( $mcp_meta ) ) {
    return false;                                // malformed meta.mcp fails closed
}
if ( isset( $mcp_meta['public'] ) ) {
    return (bool) $mcp_meta['public'];           // explicit wins, either direction
}
return true === ( $meta['public'] ?? false );    // otherwise inherit, strictly
```

This composes with the core change that landed alongside it. WordPress 7.1 added `meta.public`
to `WP_Ability` (`@since 7.1.0`, default `false`) and seeds `show_in_rest` from it, and **every
core ability in 7.1 registers `'public' => true`** — `core/get-site-info`, `core/get-user-info`,
`core/get-environment-info`. Net effect on a WP 7.1 site running adapter 0.6.0+: those core
abilities, and any of yours marked `meta.public`, are discoverable and executable through the
default MCP server with nobody having opted in.

The adapter resolves exposure from the stored ability *after* registration completes, not during
it, because `wp_register_ability_args` callbacks that run later can still rewrite `meta.public`.
That is also why inheritance is fragile as a deliberate strategy: a flag you did not set, changed
by code you do not control, moves the ability across the MCP boundary. An explicit
`meta.mcp.public` is immune to that.

| Registration | ≤ 0.5.0 | 0.6.0+ |
|---|---|---|
| `mcp.public: true` | exposed | exposed |
| `mcp.public: false` | hidden | hidden |
| `public: true`, no `mcp.public` | **hidden** | **exposed** |
| `public: true`, `mcp.public: false` | hidden | hidden |
| neither key | hidden | hidden |

The third row is the trap. An author who sets `public => true` purely to get an ability onto
the `wp-abilities/v1` REST namespace also publishes it to the default MCP server on any site
running a current adapter — and the adapter honors `meta.public` on WordPress 6.9 and 7.0 too,
where core itself still ignores that key for REST. The exposure can therefore precede the REST
behavior the author was actually aiming for.

This is a discoverability change, not an authorization hole: every execution still runs the
ability's `permission_callback`. But the default server's own gate is `read` (see the table
below), so "discoverable by any Subscriber" is the realistic blast radius.

Practical rules:

- **Set `meta.mcp.public` explicitly on every ability whose MCP status matters.** It is the one
  key that means the same thing on every adapter version, and it is self-documenting at the
  registration site.
- **When adding `public => true` for REST, decide MCP in the same edit.** If the ability should
  not reach agents, write `'mcp' => array( 'public' => false )` alongside it.
- **Auditing an existing plugin against a 0.6.0+ upgrade:** the newly-exposed set is every
  ability whose `meta.public` is boolean `true` and that has no `meta.mcp.public` key. The two
  keys are compared differently: `is_meta_public()` casts an explicit `meta.mcp.public` with
  `(bool)`, so anything truthy exposes, but tests the inherited `meta.public` with strict
  `true ===`. On 6.9/7.0, where core does not type-check the key, `'public' => 1` is therefore
  not inherited; on 7.1 it never reaches the registry, because `prepare_properties()` rejects a
  non-boolean `meta.public`. See the `wp_get_abilities()` recipe in `rest-api.md`.

## `meta.mcp.type`: a typo becomes a tool

`meta.mcp.type` selects which MCP primitive an ability is projected as — `'tool'` (the default),
`'resource'`, or `'prompt'`. The adapter reads it on two different code paths that handle an
invalid value **differently**, and the asymmetry is the whole trap:

| Path | How it reads the type | Out-of-enum value (e.g. `'resources'`) |
|---|---|---|
| `DiscoverAbilitiesAbility` (what agents list) | `McpAbilityHelperTrait::get_ability_mcp_type()` — validates against the enum, falls back to `'tool'` | **coerced to `'tool'` → listed as a tool** |
| `GetAbilityInfoAbility` / `ExecuteAbilityAbility` | no type check at all; gates on MCP-public only | inspectable and executable |
| `DefaultServerFactory::discover_abilities_by_type()` (builds the `resources` / `prompts` lists) | raw `$meta['mcp']['type'] ?? 'tool'`, strict `!==`, no validation | excluded from both lists |

So an ability you meant to expose as a resource, misspelled as `'resources'`, does not disappear
and does not raise anything. It is **silently promoted to a tool**: absent from the server's
`resources` list, present in `discover-abilities`, and executable through the
`mcp-adapter-execute-ability` tool.

That is the opposite of the failure people expect, and it matters because tools are the
primitive agents act with. An ability designed to be read as passive context becomes something
an agent can decide to invoke.

- Write `meta.mcp.type` only when it is not `'tool'`, and copy the value rather than typing it.
- Verify after registration rather than trusting the registration. On a site with the adapter,
  `wp mcp-adapter list` plus the server's `resources` list is the check that catches this; a
  string comparison in your own tests against `'resource'` / `'prompt'` is the cheaper one.
- Do not rely on an invalid type to hide an ability. Exposure is decided by
  `McpAbilityExposure::is_public()` alone — set `meta.mcp.public => false` to hide it.

## Default server vs custom server

Whenever the adapter initializes for a request (`rest_api_init`, or `init` under WP-CLI), it creates a default MCP server (`mcp-adapter-default-server`) backed by three of the adapter's own abilities:

- `mcp-adapter/discover-abilities` — list the MCP-public abilities whose type is `tool`
- `mcp-adapter/get-ability-info` — inspect a single MCP-public ability's schema
- `mcp-adapter/execute-ability` — run an MCP-public ability, named in its `ability_name` argument

Those three are the **only** entries in the default server's `tools/list`. Your abilities never
appear there as tools of their own; an agent finds them through discover and runs them through
execute. Only a custom server's `tools` list (or a replaced default-server `tools` list, below)
turns an ability into a directly listed tool.

(Those are *ability* names — the `namespace/ability` convention, slash not hyphen, registered inside the `mcp-adapter` ability namespace. An MCP client never sees them in that form: it lists `mcp-adapter-discover-abilities`, `mcp-adapter-get-ability-info`, and `mcp-adapter-execute-ability`. See "Ability names are rewritten into MCP tool names".)

This is enough for most use cases when the abilities intended for agent access are explicitly marked `meta.mcp.public => true`. The default server's discovery, get, and execute flow excludes every other registered ability — remembering that on 0.6.0+ "every other" no longer includes abilities carrying `meta.public => true`, which on WP 7.1 means all three core abilities. Audit the resolved set rather than assuming it matches what you opted in.

Each of the three requires a logged-in user and then a capability that also defaults to `'read'`:

| Ability | Capability filter | Default |
|---|---|---|
| `mcp-adapter/discover-abilities` | `mcp_adapter_discover_abilities_capability` | `read` |
| `mcp-adapter/get-ability-info` | `mcp_adapter_get_ability_info_capability` | `read` |
| `mcp-adapter/execute-ability` | `mcp_adapter_execute_ability_capability` | `read` |

So on a stock install a Subscriber can enumerate every effectively MCP-public ability and attempt to execute it. Each target ability's own `permission_callback` is the final operation-specific authorization check. Raise these baseline capabilities before relying on the default server anywhere but a local site.

For finer control (exposing only a subset, separating tool/resource/prompt categorization, server-level metadata), register a custom server. A custom server with an explicit allow-list is also the cleanest way to stay insulated from the 0.6.0 exposure default. **`create_server()` has 13 parameters (verified in v0.6.1); the 7th and 8th are required. The 7th takes an array of transport class names, and the 8th is a nullable error-handler class name, so it may be `null`; only parameters 9–13 have defaults.** The signature and convention follow what `DefaultServerFactory::create()` does internally:

```php
use WP\MCP\Core\McpAdapter;
use WP\MCP\Transport\HttpTransport;
use WP\MCP\Infrastructure\ErrorHandling\ErrorLogMcpErrorHandler;
use WP\MCP\Infrastructure\Observability\NullMcpObservabilityHandler;

add_action( 'mcp_adapter_init', function ( McpAdapter $adapter ) {
    $adapter->create_server(
        'my-plugin-server',                           // server_id
        'my-plugin/v1',                               // server_route_namespace
        'mcp',                                        // server_route
        'My Plugin MCP Server',                       // server_name
        'Tools for managing my plugin',               // server_description
        '1.0.0',                                      // server_version
        array( HttpTransport::class ),                // mcp_transports (required, array of class strings)
        ErrorLogMcpErrorHandler::class,               // error_handler (class string or null)
        NullMcpObservabilityHandler::class,           // observability_handler (optional, class string)
        array(                                        // tools (ability names to expose)
            'my-plugin/list-comments',
            'my-plugin/approve-comment',
            'my-plugin/mark-as-spam',
        ),
        array(),                                      // resources (ability names)
        array(),                                      // prompts (ability names)
        null                                          // transport_permission_callback (see below — null is NOT is_user_logged_in)
    );
} );
```

**Do not read `null` here as "any logged-in user".** The `create_server()` docblock in current source says the callback "defaults to `is_user_logged_in()`", but that docblock is stale. `HttpTransport::check_permission()` actually runs `current_user_can( 'read' )`, with the capability filtered since 0.3.0:

```php
$user_capability = apply_filters( 'mcp_adapter_default_transport_permission_user_capability', 'read', $context );
```

`'read'` is held by every role down to Subscriber, so passing `null` exposes the transport to the entire logged-in user base. Pass an explicit callback, or raise the floor:

```php
add_filter( 'mcp_adapter_default_transport_permission_user_capability', fn() => 'edit_posts' );
```

A custom callback that throws or returns `WP_Error` fails closed — the transport logs and denies.

`create_server()` enforces that it can only be called inside the `mcp_adapter_init` action — calling it elsewhere triggers `_doing_it_wrong()`. The function returns either an `McpAdapter` instance or a `WP_Error`.

The tools/resources/prompts lists decide which abilities this server projects; they do not grant access. Each selected ability retains its own `permission_callback`, which runs when the ability executes. These entries are **ability** names with the slash intact — `my-plugin/list-comments`, not `my-plugin-list-comments`. The adapter sanitizes them into tool names on its own; writing the hyphenated form here means `wp_get_ability()` returns nothing and the tool is not registered. The traces are a core `_doing_it_wrong()` notice ("Ability … not found.", visible only with `WP_DEBUG`) and an error-handler log line — and passing `null` as the error handler selects `NullMcpErrorHandler`, which logs nothing.

Read the `create_server()` docblock in `includes/Core/McpAdapter.php` for the complete parameter documentation, and `includes/Servers/DefaultServerFactory.php` for the canonical "how to call it" example.

## Customizing the default server (without replacing it)

Two filters let you tune the default server without writing a custom one:

- **`mcp_adapter_default_server_config`** — receives the default config array and lets you override any of: `server_id`, `server_route_namespace`, `server_route`, `server_name`, `server_description`, `server_version`, `mcp_transports`, `error_handler`, `observability_handler`, `tools`, `resources`, `prompts`.

  Overriding `tools` is a **replacement**, not a filter on what discover returns: the list you
  supply takes the place of the three `mcp-adapter/*` meta-tools, and every ability in it becomes a
  directly listed tool *whether or not it is MCP-public* (server lists ignore the exposure flag).
  `resources` and `prompts` stay auto-discovered unless you override them too.

  ```php
  add_filter( 'mcp_adapter_default_server_config', function ( array $config ): array {
      // Replace discover/get/execute with two directly listed tools.
      $config['tools'] = array( 'core/get-site-info', 'core/get-user-info' );
      return $config;
  } );
  ```

- **`mcp_adapter_create_default_server`** — return `false` to skip default server creation entirely. Use when you want only your custom servers exposed.

  ```php
  add_filter( 'mcp_adapter_create_default_server', '__return_false' );
  ```

## Permalinks requirement

The MCP Adapter's HTTP transport uses REST API endpoints. **Plain permalinks break the routing.** Site owners need to set permalinks to anything other than Plain (Post name is the typical recommendation). If your plugin requires the adapter, document this in your readme and consider a `wp_admin_notice` when Plain is detected:

```php
if ( '' === get_option( 'permalink_structure' ) ) {
    add_action( 'admin_notices', function () {
        echo '<div class="notice notice-warning"><p>';
        esc_html_e( 'My Plugin: change Settings → Permalinks away from Plain to enable MCP.', 'my-plugin' );
        echo '</p></div>';
    } );
}
```

## Authentication for HTTP transport

External agents authenticate via WordPress's standard mechanisms. For Claude Desktop, Cursor, and similar local clients, **Application Passwords** are the practical default:

1. Users → Profile → Application Passwords → create one for "My MCP Server".
2. Copy the generated password (shown once).
3. The MCP client sends the WordPress username and Application Password with HTTP Basic authentication.

The adapter does not implement Bearer, JWT, or OAuth authentication. Those schemes require a
WordPress authentication plugin that sets the current user. A `transport_permission_callback` cannot
substitute for one: it only allows or denies the route and never authenticates anyone.

## STDIO transport

For local development and CLI integration, the adapter ships a STDIO transport, wrapped by two WP-CLI commands:

```bash
wp mcp-adapter serve [--server=<server-id>] --user=<id|login|email>
wp mcp-adapter list [--format=<format>]
```

`serve` runs a server over STDIO — point an MCP client's STDIO config at it. `--user` is WP-CLI's
global option, not a local `serve` option; it sets the WordPress user for the process. Without it the
session is unauthenticated and capability-gated abilities fail. `list` enumerates registered servers.

**Omitting `--server` does not select the default server — it selects the first registered server.** `McpCommand::serve()` falls through to `array_values( $adapter->get_servers() )[0]`, which is insertion order, and insertion order is registration order. The built-in default server is itself registered from a `mcp_adapter_init` callback, so which server lands first depends on hook priority and load order, not on any notion of "default". Any command whose identity matters — production, CI, a committed MCP client config, or any site that may ever register a second server — must pass `--server=<server-id>` explicitly.

STDIO is enabled by default and can be switched off:

```php
add_filter( 'mcp_adapter_enable_stdio_transport', '__return_false' );
```

With it disabled, the bridge throws internally, `McpCommand::serve()` catches the exception, and the
command exits with a WP-CLI error rather than starting.

This is the right transport for:

- Local Claude Code / Claude Desktop integration via the standard MCP STDIO config
- Testing abilities without setting up auth
- Scripted agent runs against a local site

HTTP transport is the right choice for production, remote sites, and any case where the AI client and the WordPress site aren't on the same machine.

## What changed in 0.6.0 / 0.6.1

Beyond the platform, exposure, session, `_meta`, URI-scheme, and packaging changes above:

- **`resources/templates/list`** is supported, returning an empty template list when none are registered.
- **`McpValidator`'s MIME validation helpers were removed.** Integrations that called them directly must apply their own MIME validation. `mimeType` is now emitted exactly as declared, including parameterised values such as `text/html;profile=mcp-app`.
- **0.6.1 is a packaging fix only.** 0.6.0's release ZIP shipped a Jetpack Autoloader class map pointing at test-only files, so `class_exists( 'WP_CLI' )` could fatal on a normal web request. No API, hook, or protocol behaviour changed; upgrading from 0.6.0 needs no migration.

## Unreleased: MCP Adapter 0.7.0

Prepared on upstream trunk on 2026-09-23 (`mcp-adapter.php` says 0.7.0 and the CHANGELOG has the
section) but **not tagged as of 2026-09-27**; everything else in this reference describes 0.6.1.
Exposure resolution (`McpAbilityExposure`), the default server and its three meta-abilities, the
name sanitizer, the schema transformer, the transport permission check, and session storage are
unchanged on trunk. What changes:

- **Protocol revisions.** The schema-backed revisions are exactly `2025-11-25` and `2026-07-28`.
  `2025-06-18` and `2024-11-05` move to `McpVersionNegotiator::LEGACY_PROTOCOL_VERSIONS`: still
  accepted by `initialize` and echoed back, but served through the `2025-11-25` schema. `2026-07-28`
  is sessionless and selected per request (`MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`, and
  `Mcp-Param-*` headers; `server/discover` instead of `initialize`). JSON-RPC batches and the
  non-canonical `tools/list/all` are rejected.
- **Validation always runs.** `mcp_adapter_validation_enabled`, `McpServer::is_mcp_validation_enabled()`,
  and the three component validators are removed. Invalid protocol fields are no longer dropped or
  repaired: malformed `_meta` or annotation values reject the component, and one invalid in every
  supported revision is dropped with `_doing_it_wrong()`. Annotation values must be literal
  booleans — `'readonly' => 1` or `'true'` now invalidates a directly listed tool.
- **`meta.mcp` must be an array.** Exposure still fails closed on a non-array `meta.mcp`, and a
  custom server that lists such an ability no longer registers it (`mcp_ability_invalid_meta`).
- **Filters.** `mcp_adapter_tools_list`, `mcp_adapter_resources_list`, `mcp_adapter_prompts_list`,
  and `mcp_adapter_initialize_response` gain a third `Schema` argument. Tool names and resource URIs
  are matched exactly as sent — no trimming; the resource scheme is still case-insensitive.
  `mcp_adapter_pre_resource_read` receives only the protocol parameters (`uri`, `_meta`,
  `inputResponses`, `requestState`), and `mcp_adapter_tool_call_result` can receive an
  `McpInputRequired` object — pass it through unchanged.
- **Elicitation.** Under `2026-07-28` a direct (raw-handler) tool may return `McpInputRequired` and
  read the client's answers from `McpToolCallContext` on the retry.
- **Results and errors.** Tool `title` always comes from the ability label. Resource annotations
  come from core's top-level `meta.annotations`, overridden by `meta.mcp.annotations`. Under
  `2025-11-25` a tool that returns a JSON list loses `structuredContent` (the text block keeps the
  list). Missing tools and prompts return `-32602` in both revisions (0.6.1 uses `-32003` and
  `-32004`); a missing resource returns `-32002` under 2025 and `-32602` under 2026; an unsupported
  per-request version returns `-32022`.
- **Sessions.** The session filters below apply only to sessions opened by `initialize`
  (`2025-11-25`); `2026-07-28` over HTTP has no session.
- **CLI.** The `WP\MCP\Cli` classes become `final` (#306; they are not final in 0.6.1) — do not
  subclass them now. `wp mcp-adapter list` gains `--protocol=<2025-11-25|2026-07-28>`, and a component
  can be valid in one revision and not the other, so check both.
- **Packaging.** Bundled loading is deprecated (see "Installation") and the release workflow deploys
  to WordPress.org (#347).
- **Internals.** DTO classes and `get_protocol_dto()` give way to exact-revision schema records from
  `wordpress/php-mcp-schema` `^0.2.0`; `JsonRpcResponseBuilder` is removed and custom transports must
  delegate to `HttpRequestHandler` or `McpWireOrchestrator`. Code that touches adapter internals
  needs upstream's [migration guide](https://github.com/WordPress/mcp-adapter/blob/trunk/docs/migration/v0.7.0.md).

When 0.7.0 is tagged, re-verify this reference against the tag rather than trunk: the CHANGELOG
and code already disagree in places (the CHANGELOG says `list` adds columns; the code adds the
`--protocol` switch and keeps the columns).

## Protocol version negotiation

`McpVersionNegotiator::SUPPORTED_PROTOCOL_VERSIONS` accepts `2025-11-25`, `2025-06-18`, and `2024-11-05`, in that preference order (verified in v0.6.1). A client requesting a supported version gets it; any other version, older or newer, is answered with `2025-11-25`. Pin nothing client-side unless a specific version is required. The unreleased 0.7.0 changes this list — see "Unreleased: MCP Adapter 0.7.0".

## Sessions and request interception

HTTP transport sessions are managed by `SessionManager` and tuned with three filters:

| Filter | Default |
|---|---|
| `mcp_adapter_session_max_per_user` | `32` |
| `mcp_adapter_session_inactivity_timeout` | `DAY_IN_SECONDS` |
| `mcp_adapter_session_activity_update_interval` | `60` (clamped below the inactivity timeout) |

For auditing, rate limiting, or policy enforcement, hook the request lifecycle rather than wrapping abilities. `mcp_adapter_pre_tool_call` receives `( $args, $tool_name, $mcp_tool, $mcp )` and short-circuits execution by returning a `WP_Error`; `mcp_adapter_tool_call_result` filters the outcome. Equivalents exist for resources (`mcp_adapter_pre_resource_read`, `mcp_adapter_resource_read_result`) and prompts (`mcp_adapter_pre_prompt_get`, `mcp_adapter_prompt_get_result`).

**`$tool_name` is the sanitized MCP tool name, not the ability name.** `ToolsHandler::call_tool()` takes the name off the wire, resolves the tool with it, and passes that same string to the filter — so a policy written against `my-plugin/list-comments` never matches `my-plugin-list-comments`, and which way that breaks depends on the policy's shape. A deny-list never fires and **fails open**: every call sails through. A deny-by-default allow-list never matches either and **fails closed**: every call is blocked, including the ones you meant to permit. Neither enforces what it says.

**On the default server the tool is never your ability.** Its `tools/list` holds only the three
meta-tools, so every default-server call arrives as `mcp-adapter-execute-ability` (or
`-get-ability-info` / `-discover-abilities`). `$tool_name` is the meta-tool's name,
`$mcp_tool->get_adapter_meta()['ability']` is `mcp-adapter/execute-ability`, and the ability the
agent is actually running is the unsanitized name in `$args['ability_name']`. A policy keyed on the
tool alone sees the meta-tool on every call — the same fail-open / fail-closed split as above.
Resolve the target first:

```php
add_filter( 'mcp_adapter_pre_tool_call', function ( $args, $tool_name, $mcp_tool ) {
    // The ability backing the tool; null for tools registered with a raw handler.
    $backing = $mcp_tool->get_adapter_meta()['ability'] ?? null;

    if ( 'mcp-adapter/discover-abilities' === $backing ) {
        return $args; // Listing only; exposure rules already decide what it returns.
    }

    // The default server's meta-tools carry the real target as an argument;
    // a tool that a custom server lists directly is its own target.
    $meta_tools = array( 'mcp-adapter/execute-ability', 'mcp-adapter/get-ability-info' );
    $target     = in_array( $backing, $meta_tools, true ) ? ( $args['ability_name'] ?? null ) : $backing;

    if ( ! in_array( $target, array( 'my-plugin/list-comments' ), true ) ) {
        return new WP_Error( 'my_plugin_tool_denied', 'Tool not permitted.' );
    }
    return $args;
}, 10, 3 );
```

On WordPress 7.1, `wp_ability_permission_result` is a transport-independent alternative: it fires
inside the target ability's own `check_permissions()` on every path — REST, a directly listed MCP
tool, and the default server's execute-ability — with the target `WP_Ability` in hand. It fires more
than once per call; see `execution-lifecycle.md` before metering on it.

**`$uri` and `$prompt_name` need the same care.** `$uri` in `mcp_adapter_pre_resource_read` is the
URI exactly as the client sent it (trimmed), while resource lookup folds the scheme's case — so
`MYPLUGIN://Thing` reaches the resource registered as `myplugin://Thing` with `$uri` still
uppercase, and an exact-string deny-list fails open. Key resource policy on the ability behind it,
`$mcp_resource->get_adapter_meta()['ability']` (the filter's third argument), not on `$uri`.
`$prompt_name` in `mcp_adapter_pre_prompt_get` is sanitized the same way tool names are.

**0.6.x only:** the unreleased 0.7.0 removes this filter, `McpServer::is_mcp_validation_enabled()`,
and the three component validators; schema validation always runs there and a hooked callback simply
never fires (see "Unreleased: MCP Adapter 0.7.0").

`mcp_adapter_validation_enabled` is **off** by default and its arity varies by call site. Verified in v0.6.1, it is applied at eight places:

- **Seven DTO validation sites pass only the default value — one argument.** They are byte-identical `apply_filters( 'mcp_adapter_validation_enabled', false );` calls in `McpTool::fromArray()`, `RegisterAbilityAsMcpTool::build()`, `McpResource::fromArray()`, `RegisterAbilityAsMcpResource::build()`, `McpPrompt::fromArray()`, `McpPrompt::fromBuilder()`, and `RegisterAbilityAsMcpPrompt::build()`.
- **One site — `McpServer::__construct()` — passes all three arguments**, `( false, $this->server_id, $this )`.

WordPress never pads missing filter arguments: `WP_Hook::apply_filters()` takes the `accepted_args >= $num_args` branch and calls the callback with the one argument it has. So a callback registered with `10, 3` and **three required parameters** raises an uncaught `ArgumentCountError` — a fatal — at all seven DTO sites, while working fine at the `McpServer` one. Default the two server parameters so one registration is safe everywhere:

```php
add_filter( 'mcp_adapter_validation_enabled', function ( $enabled, $server_id = null, $server = null ) {
    if ( null === $server_id ) {
        return true;
    }
    return 'my-server' === $server_id;
}, 10, 3 );
```

It is not an untrusted-input control. It gates deeper MCP component/DTO compliance checks on the *definitions* you register (`McpToolValidator::validate_tool_dto()`, run while the tool is constructed). `McpTool::execute()` passes arguments to the ability or handler on the same path either way. Enable it to catch malformed tool definitions in development; do not enable it expecting argument validation.

Validate untrusted arguments at the ability boundary instead. `WP_Ability::execute()` normalizes input, validates it against the ability's `input_schema` via `rest_validate_value_from_schema()`, runs `check_permissions()`, and validates the result against `output_schema` — which is why every ability that accepts input needs an `input_schema`. That check is what the adapter is relying on when it defaults validation off. A custom server registered with a raw `handler` callback rather than an ability gets none of it: `call_user_func( $this->handler, $args )` receives whatever the client sent, so such a handler must validate its own arguments. (Server `tools` and `prompts` arrays accept `McpTool` / `McpPrompt` instances — and, for prompts, `McpPromptBuilderInterface` builders — alongside ability names; that is how raw-handler components get registered. In the unreleased 0.7.0 a raw handler is called as `( $args, ?McpToolCallContext $context )`.)

## Verifying the server

A quick way to confirm the MCP server is registered: hit the WordPress REST API root (`/wp-json/`) and look for your server's namespace. The built-in server endpoint is `/wp-json/mcp/mcp-adapter-default-server`. If it shows up, the *route* registered — which does not prove the server has anything to serve (see below). If it doesn't, the server creation hook didn't fire or the ID conflicted.

For a more thorough check, connect an MCP client (Claude Desktop, MCP Inspector, or similar). What a correct server shows depends on which one it is:

- **Default server:** `tools/list` returns only the three meta-tools — `mcp-adapter-discover-abilities`, `mcp-adapter-get-ability-info`, and `mcp-adapter-execute-ability`. Confirm your abilities appear in the *discover* output (and that nothing you did not mean to expose does), read their schemas with get-ability-info, and test `permission_callback` enforcement through execute-ability as a low-privilege user.
- **Custom server:** `tools/list` shows the abilities in its `tools` list under their sanitized names. Check each schema against your `input_schema` declaration and execute each as a low-privilege user.

**An empty default server on 0.6.x.** If the route exists but `tools/list` is empty and the error log shows `WordPress ability 'mcp-adapter/…' does not exist.` three times, another plugin opened the Abilities registry during `init`, before the adapter hooked its own registration. The adapter adds that hook only when it initializes (`rest_api_init`, or `init` priority 20 under WP-CLI), and core fires `wp_abilities_api_init` once, on first registry access. Remove the early registry access. Upstream fixed the ordering on trunk (#339, unreleased 0.7.0); a bundled copy that boots late remains exposed to it.

## Security posture

MCP clients act as authenticated WordPress users. An overly permissive ability is the same risk as giving an external service the user's credentials.

- **Adopt default-deny yourself — the adapter no longer does.** Since adapter 0.6.0 exposure inherits `meta.public`, and WP 7.1 marks every core ability public, so a stock 7.1 + 0.6.x site already serves `core/get-site-info`, `core/get-user-info`, and `core/get-environment-info` over MCP. Don't expose abilities you haven't reviewed for safety; treat the exposed set as something to audit and narrow, not something you build up.
- **Narrow it deliberately.** Use a custom server with an explicit allow-list rather than the default server in production, or replace the default server's `tools` through `mcp_adapter_default_server_config` (which swaps out the discover/get/execute meta-tools for direct tools), or disable it with `mcp_adapter_create_default_server`. Setting `meta.mcp.public => false` opts an individual public ability out.
- **Re-audit exposure when upgrading the adapter to 0.6.0+.** The inherited-`meta.public` rule can widen the default server's surface without any change to your registrations. Enumerate what the default server now serves before shipping the upgrade.
- **Raise the transport and built-in-ability capabilities.** Both default to `'read'`, which every role has. An MCP server left on defaults is reachable by any Subscriber.
- **Discipline `permission_callback`.** Every write or destructive ability needs one. Read-only abilities should still have one if they expose anything sensitive.
- **Mark annotations honestly.** `readonly: true` on an ability that actually mutates state misleads both human reviewers and the MCP client's safety logic.
- **Test with an unprivileged user.** If you've been testing as administrator, your permission callbacks are probably under-tested. Create an editor or author user, regenerate an Application Password for them, and verify the client only sees what they're allowed to do.

## Sources

- MCP Adapter repo: https://github.com/WordPress/mcp-adapter — verified against **v0.6.1**: `includes/Abilities/McpAbilityExposure.php`, `includes/Abilities/ExecuteAbilityAbility.php`, `includes/Core/McpAdapter.php`, `includes/Core/McpComponentRegistry.php`, `includes/Servers/DefaultServerFactory.php`, `includes/Handlers/Tools/ToolsHandler.php`, `includes/Handlers/Resources/ResourcesHandler.php`, `includes/Transport/HttpTransport.php`, `docs/getting-started/installation.md`. The 0.7.0 material (`CHANGELOG.md`, `docs/migration/v0.7.0.md`, and the code it describes) was read at trunk `05b10aa` on 2026-09-27, before any 0.7.0 tag existed
- Adapter releases: https://github.com/WordPress/mcp-adapter/releases
- WordPress 7.1 `WP_Ability` (`meta.public`, `@since 7.1.0`) and core ability registrations: `src/wp-includes/abilities-api/class-wp-ability.php`, `src/wp-includes/abilities.php`
- Developer Blog walkthrough: https://developer.wordpress.org/news/2026/02/from-abilities-to-ai-agents-introducing-the-wordpress-mcp-adapter/
- Make/AI overview of MCP: https://make.wordpress.org/ai/2025/07/17/mcp-adapter/
- Archived predecessor (do not use for new work): https://github.com/Automattic/wordpress-mcp
