# Exposing abilities via the MCP Adapter

The MCP Adapter (`WordPress/mcp-adapter`) bridges the Abilities API to the Model Context Protocol, letting external AI agents (Claude Desktop, Claude Code, Cursor, ChatGPT) discover and execute WordPress abilities as MCP tools, resources, and prompts.

The adapter is a separate Composer package and plugin. WordPress ships the Abilities API in core
from 6.9 onward but does **not** ship the adapter. The base Abilities skill supports PHP 7.2.24+,
but the adapter requires PHP `^7.4 || ^8.0`. On PHP 7.2 or 7.3, stop before installation: upgrade
the site runtime to PHP 7.4+ or do not enable MCP exposure.

**Current release: 0.6.1.** Verify against the version the project actually pulls in — this
package moves faster than core, and 0.6.0 changed both the exposure default and the minimum
platform:

- **WordPress 6.9+ is now required**, and the standalone `WordPress/abilities-api` plugin is no
  longer a supported installation path (that repository was archived in February 2026; the API
  lives in core).
- **`meta.public` now grants MCP exposure** unless `meta.mcp.public` opts out — see below. This
  reverses the 0.5.0 rule and is the single most important thing to get right in a registration.
- On multisite, session storage moved from a network-wide key to per-site keys, so active
  Streamable HTTP sessions must reconnect once after upgrading.
- `_meta` is preserved on resource contents, embedded resources, content blocks, and prompt
  messages; resource URIs now match case-insensitively.

## Installation

The adapter is designed to be a Composer dependency, not a standalone plugin install for distributed use:

```bash
composer require wordpress/mcp-adapter
composer require automattic/jetpack-autoloader
```

Then load the Jetpack Autoloader from your plugin's bootstrap. It resolves compatible package versions when multiple plugins on the site depend on the adapter:

```php
require_once plugin_dir_path( __FILE__ ) . 'vendor/autoload_packages.php';
```

For local exploration / smoke testing, the standalone plugin zip from the [adapter's Releases page](https://github.com/WordPress/mcp-adapter/releases) is fine. Don't ship that to production with multiple consumers — version conflicts will bite.

## How abilities become MCP tools

Once the adapter is loaded:

1. The default server's `discover-abilities`, `get-ability-info`, and `execute-ability` abilities only surface registered abilities that resolve to MCP-public — on 0.6.0+ that means `meta.mcp.public` when set, otherwise `meta.public` (see the resolution rules below).
2. A custom server may explicitly list selected ability IDs as tools, resources, or prompts; that selection does not bypass each ability's `permission_callback`.
3. The adapter respects the ability's `permission_callback` at execution — agents can only invoke what the authenticated user is authorized to do.
4. The ability's `input_schema` and `output_schema` translate directly into the MCP tool's input and output schemas.
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

## Exposure resolution — the 0.6.0 reversal

**This changed, and it changed in the dangerous direction.** Adapter 0.6.0 introduced
`McpAbilityExposure::is_public()` (tagged `@since 0.6.0`), which resolves:

```
meta.mcp.public  ?? meta.public  ?? false
```

An explicit `meta.mcp.public` still wins in both directions; a malformed `meta.mcp` fails
closed. But an *absent* `meta.mcp.public` now inherits the general-purpose `meta.public` flag
that WP 7.1 adds for REST exposure.

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
  ability with `meta.public` truthy and no `meta.mcp.public` key. See the
  `wp_get_abilities()` recipe in `rest-api.md`.

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
`resources` list, present in `discover-abilities`, and executable through
`mcp-adapter/execute-ability`.

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

On activation, the adapter registers a default MCP server (`mcp-adapter-default-server`) with three core abilities for inspection and execution:

- `mcp-adapter/discover-abilities` — list all available abilities
- `mcp-adapter/get-ability-info` — inspect a single ability's schema
- `mcp-adapter/execute-ability` — run any ability

(Ability names follow the `namespace/ability` convention — slash, not hyphen, between the two parts. They register inside the `mcp-adapter` ability namespace.)

This is enough for most use cases when the abilities intended for agent access are explicitly marked `meta.mcp.public => true`. The default server's discovery, get, and execute flow excludes every other registered ability — remembering that on 0.6.0+ "every other" no longer includes abilities carrying `meta.public => true`.

Each of the three requires a logged-in user and then a capability that also defaults to `'read'`:

| Ability | Capability filter | Default |
|---|---|---|
| `mcp-adapter/discover-abilities` | `mcp_adapter_discover_abilities_capability` | `read` |
| `mcp-adapter/get-ability-info` | `mcp_adapter_get_ability_info_capability` | `read` |
| `mcp-adapter/execute-ability` | `mcp_adapter_execute_ability_capability` | `read` |

So on a stock install a Subscriber can enumerate every effectively MCP-public ability and attempt to execute it. Each target ability's own `permission_callback` is the final operation-specific authorization check. Raise these baseline capabilities before relying on the default server anywhere but a local site.

For finer control (exposing only a subset, separating tool/resource/prompt categorization, server-level metadata), register a custom server. A custom server with an explicit allow-list is also the cleanest way to stay insulated from the 0.6.0 exposure default. **`create_server()` has 13 parameters (verified in v0.6.1); the 7th is required and takes an array of transport class names, not a config array.** The signature and convention follow what `DefaultServerFactory::create()` does internally:

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

The tools/resources/prompts lists decide which abilities this server projects; they do not grant access. Each selected ability retains its own `permission_callback`, which runs when the ability executes.

Read the `create_server()` docblock in `includes/Core/McpAdapter.php` for the complete parameter documentation, and `includes/Servers/DefaultServerFactory.php` for the canonical "how to call it" example.

## Customizing the default server (without replacing it)

Two filters let you tune the default server without writing a custom one:

- **`mcp_adapter_default_server_config`** — receives the default config array and lets you override any of: `server_id`, `server_route_namespace`, `server_route`, `server_name`, `server_description`, `server_version`, `mcp_transports`, `error_handler`, `observability_handler`, `tools`, `resources`, `prompts`. Useful for restricting which abilities the default server exposes.

  ```php
  add_filter( 'mcp_adapter_default_server_config', function ( array $config ): array {
      // Allow-list which abilities the default server exposes.
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
3. The MCP client uses it as basic auth or a bearer credential, depending on the client.

For self-hosted scenarios with stricter requirements, the adapter supports JWT and OAuth in different deployments — but the canonical pattern documented in the WordPress.com MCP work is OAuth 2.1 with browser-based authorization. Production setups should use that rather than long-lived application passwords.

## STDIO transport

For local development and CLI integration, the adapter ships a STDIO transport, wrapped by two WP-CLI commands:

```bash
wp mcp-adapter serve [--server=<server-id>] [--user=<id|login|email>]
wp mcp-adapter list [--format=<format>]
```

`serve` runs the named server (default server when omitted) over STDIO — point an MCP client's STDIO config at it. `--user` sets the WordPress user the session runs as; without it the session is unauthenticated and capability-gated abilities will fail. `list` enumerates registered servers.

STDIO is enabled by default and can be switched off:

```php
add_filter( 'mcp_adapter_enable_stdio_transport', '__return_false' );
```

With it disabled, `serve` throws a `RuntimeException` rather than starting.

This is the right transport for:

- Local Claude Code / Claude Desktop integration via the standard MCP STDIO config
- Testing abilities without setting up auth
- Scripted agent runs against a local site

HTTP transport is the right choice for production, remote sites, and any case where the AI client and the WordPress site aren't on the same machine.

## Protocol version negotiation

`McpVersionNegotiator::SUPPORTED_PROTOCOL_VERSIONS` accepts `2025-11-25`, `2025-06-18`, and `2024-11-05`, in that preference order. A client requesting a supported version gets it; anything else is negotiated down to `2025-11-25`. Pin nothing client-side unless a specific version is required.

## Sessions and request interception

HTTP transport sessions are managed by `SessionManager` and tuned with three filters:

| Filter | Default |
|---|---|
| `mcp_adapter_session_max_per_user` | `32` |
| `mcp_adapter_session_inactivity_timeout` | `DAY_IN_SECONDS` |
| `mcp_adapter_session_activity_update_interval` | `60` (clamped below the inactivity timeout) |

For auditing, rate limiting, or policy enforcement, hook the request lifecycle rather than wrapping abilities. `mcp_adapter_pre_tool_call` receives `( $args, $tool_name, $mcp_tool, $mcp )` and short-circuits execution by returning a `WP_Error`; `mcp_adapter_tool_call_result` filters the outcome. Equivalents exist for resources (`mcp_adapter_pre_resource_read`, `mcp_adapter_resource_read_result`) and prompts (`mcp_adapter_pre_prompt_get`, `mcp_adapter_prompt_get_result`).

`mcp_adapter_validation_enabled` receives `( false, $server_id, $server )` and is **off** by default. It is not an untrusted-input control. It gates deeper MCP component/DTO compliance checks on the *definitions* you register (`McpToolValidator::validate_tool_dto()`, run while the tool is constructed). `McpTool::execute()` passes arguments to the ability or handler on the same path either way. Enable it to catch malformed tool definitions in development; do not enable it expecting argument validation.

Validate untrusted arguments at the ability boundary instead. `WP_Ability::execute()` normalizes input, validates it against the ability's `input_schema` via `rest_validate_value_from_schema()`, runs `check_permissions()`, and validates the result against `output_schema` — which is why every ability that accepts input needs an `input_schema`. That check is what the adapter is relying on when it defaults validation off. A custom server registered with a raw `handler` callback rather than an ability gets none of it: `call_user_func( $this->handler, $args )` receives whatever the client sent, so such a handler must validate its own arguments.

## Verifying the server

A quick way to confirm the MCP server is registered: hit the WordPress REST API root (`/wp-json/`) and look for your server's namespace. If it shows up, the server registered. If it doesn't, the server creation hook didn't fire or the ID conflicted.

For a more thorough check, connect an MCP client (Claude Desktop, MCP Inspector, or similar) and:

1. Confirm the client lists your tools (your registered abilities).
2. Inspect a tool's schema and confirm it matches your `input_schema` declaration.
3. Execute a tool and confirm `permission_callback` enforcement.

## Security posture

MCP clients act as authenticated WordPress users. An overly permissive ability is the same risk as giving an external service the user's credentials.

- **Default-deny.** Don't expose abilities you haven't reviewed for safety. Use a custom server with an explicit allow-list rather than the default server in production.
- **Re-audit exposure when upgrading the adapter to 0.6.0+.** The inherited-`meta.public` rule can widen the default server's surface without any change to your registrations. Enumerate what the default server now serves before shipping the upgrade.
- **Raise the transport and built-in-ability capabilities.** Both default to `'read'`, which every role has. An MCP server left on defaults is reachable by any Subscriber.
- **Discipline `permission_callback`.** Every write or destructive ability needs one. Read-only abilities should still have one if they expose anything sensitive.
- **Mark annotations honestly.** `readonly: true` on an ability that actually mutates state misleads both human reviewers and the MCP client's safety logic.
- **Test with an unprivileged user.** If you've been testing as administrator, your permission callbacks are probably under-tested. Create an editor or author user, regenerate an Application Password for them, and verify the client only sees what they're allowed to do.

## Sources

- MCP Adapter repo: https://github.com/WordPress/mcp-adapter
- Adapter releases: https://github.com/WordPress/mcp-adapter/releases
- Developer Blog walkthrough: https://developer.wordpress.org/news/2026/02/from-abilities-to-ai-agents-introducing-the-wordpress-mcp-adapter/
- Make/AI overview of MCP: https://make.wordpress.org/ai/2025/07/17/mcp-adapter/
- Archived predecessor (do not use for new work): https://github.com/Automattic/wordpress-mcp
