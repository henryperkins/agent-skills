# Exposing abilities via the MCP Adapter

The MCP Adapter (`WordPress/mcp-adapter`) bridges the Abilities API to the Model Context Protocol, letting external AI agents (Claude Desktop, Claude Code, Cursor, ChatGPT) discover and execute WordPress abilities as MCP tools, resources, and prompts.

The adapter is a separate plugin. WordPress ships the Abilities API in core (6.9+) but does **not** ship the adapter. MCP Adapter 0.6.x requires **WordPress 6.9+ and PHP 7.4+** — 0.6.0 dropped the standalone Abilities API plugin as a supported installation path. The base Abilities skill supports PHP 7.2.24+, so on PHP 7.2 or 7.3 stop before installation: upgrade the site runtime to PHP 7.4+ or do not enable MCP exposure.

## Installation

**Install the canonical plugin. Do not bundle the adapter.** This reversed in 0.6.x: bundling as a Composer library is deprecated in favour of the canonical plugin, and loading the adapter as a bundled dependency now triggers `_deprecated_function()` (`McpAdapter::check_plugin_loaded()`, gated on the `WP_MCP_VERSION` constant that only the plugin defines).

```bash
wp plugin install https://github.com/WordPress/mcp-adapter/releases/latest/download/mcp-adapter.zip --activate
```

Declaring it as a plugin dependency is the intended path for a distributed plugin:

```php
<?php
/**
 * Plugin Name:      My MCP Plugin
 * Requires Plugins: mcp-adapter
 */
```

**`Requires Plugins` resolves against the WordPress.org directory, and the adapter is not listed there yet** ([#178](https://github.com/WordPress/mcp-adapter/issues/178)). Until it is, the header installs nothing — pair it with a runtime guard and an admin notice telling site owners to install the release zip:

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

If you already bundle the adapter via Composer, migrate: `composer remove wordpress/mcp-adapter`, drop `automattic/jetpack-autoloader` if nothing else needs it, switch `vendor/autoload_packages.php` back to `vendor/autoload.php`, and clear the generated files (`rm -rf vendor && composer install`) — a leftover `autoload_packages.php` works locally and fails in production. Upstream's [migration guide](https://github.com/WordPress/mcp-adapter/blob/trunk/docs/migration/vx.y.z.md) has the full sequence. Bundling still functions today and will be removed in a future version; if you genuinely cannot migrate yet, use Jetpack Autoloader or a prefixer such as Strauss.

## How abilities become MCP tools

Once the adapter is loaded:

1. The default server's `discover-abilities`, `get-ability-info`, and `execute-ability` abilities only surface registered abilities that resolve as MCP-public (see below).
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

`meta.mcp.public` controls default-server discovery, not authorization. A well-shaped ability still needs a namespaced ID, label, description, schemas, permission callback, and accurate annotations.

### Exposure inherits from `meta.public` since 0.6.0

`McpAbilityExposure::is_public()` is the single source of truth, and it is **not** a bare read of `meta.mcp.public`:

```php
// McpAbilityExposure::is_meta_public(), v0.6.0+
$mcp_meta = $meta['mcp'] ?? array();
if ( ! is_array( $mcp_meta ) ) {
    return false;                                // malformed meta.mcp fails closed
}
if ( isset( $mcp_meta['public'] ) ) {
    return (bool) $mcp_meta['public'];           // explicit wins, either direction
}
return true === ( $meta['public'] ?? false );    // otherwise inherit
```

This composes with a core change landing at the same time. WordPress 7.1 added `meta.public` to `WP_Ability` (`@since 7.1.0`, default `false`) and seeds `show_in_rest` from it, and **every core ability in 7.1 registers `'public' => true`** — `core/get-site-info`, `core/get-user-info`, `core/get-environment-info`.

**Net effect on a WP 7.1 site running MCP Adapter 0.6+:** those core abilities, and any of yours marked `meta.public`, are discoverable and executable through the default MCP server with nobody having opted in. The 0.5.0-era assumption that omitting `meta.mcp.public` means "invisible to MCP" no longer holds.

**Set `meta.mcp.public` explicitly, in both directions.** Write `true` on what you intend to expose, and `false` on anything REST-public that should stay off MCP:

```php
'meta' => array(
    'public' => true,          // REST-visible to clients
    'mcp'    => array(
        'public' => false,     // ...but not through MCP
    ),
),
```

The adapter resolves exposure from the stored ability *after* registration completes, not during it, because `wp_register_ability_args` callbacks can still rewrite `meta.public` and no filter priority is guaranteed to run last. That is also why inheritance is fragile as a deliberate strategy: a flag you did not set, changed by code you do not control, moves the ability across the MCP boundary. An explicit `meta.mcp.public` is immune to that.

Auditing an existing site: enumerate abilities where `meta.public` is true and `meta.mcp.public` is unset. Those are exactly the ones whose MCP exposure changed when the adapter reached 0.6.0.

## Default server vs custom server

On activation, the adapter registers a default MCP server (`mcp-adapter-default-server`) with three core abilities for inspection and execution:

- `mcp-adapter/discover-abilities` — list all available abilities
- `mcp-adapter/get-ability-info` — inspect a single ability's schema
- `mcp-adapter/execute-ability` — run any ability

(Ability names follow the `namespace/ability` convention — slash, not hyphen, between the two parts. They register inside the `mcp-adapter` ability namespace.)

The set this reaches is every ability that resolves MCP-public, which since adapter 0.6.0 includes anything carrying `meta.public` without an explicit `meta.mcp.public` — on WP 7.1 that is all three core abilities. Audit the resolved set rather than assuming it matches what you opted in.

Each of the three requires a logged-in user and then a capability that also defaults to `'read'`:

| Ability | Capability filter | Default |
|---|---|---|
| `mcp-adapter/discover-abilities` | `mcp_adapter_discover_abilities_capability` | `read` |
| `mcp-adapter/get-ability-info` | `mcp_adapter_get_ability_info_capability` | `read` |
| `mcp-adapter/execute-ability` | `mcp_adapter_execute_ability_capability` | `read` |

So on a stock install a Subscriber can enumerate every effectively MCP-public ability and attempt to execute it. Each target ability's own `permission_callback` is the final operation-specific authorization check. Raise these baseline capabilities before relying on the default server anywhere but a local site.

For finer control (exposing only a subset, separating tool/resource/prompt categorization, server-level metadata), register a custom server. **`create_server()` has 13 parameters in current source (verified unchanged through v0.6.1); the 7th is required and takes an array of transport class names, not a config array.** The signature and convention follow what `DefaultServerFactory::create()` does internally:

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

## What changed in 0.6.0 / 0.6.1

Beyond the exposure and packaging changes above:

- **`resources/templates/list`** is supported, returning an empty template list when none are registered.
- **Session storage is per-site on multisite.** Active Streamable HTTP sessions must reconnect once after upgrading; single-site installs are unaffected. Concurrent session mutations are now guarded with bounded retries.
- **`McpValidator`'s MIME validation helpers were removed.** Integrations that called them directly must apply their own MIME validation. `mimeType` is now emitted exactly as declared, including parameterised values such as `text/html;profile=mcp-app`.
- **`_meta` is preserved** on resource contents, embedded resources, content blocks, and prompt messages; malformed `_meta` is dropped without discarding the payload it accompanied.
- **Resource URI schemes match case-insensitively**, so a client that lowercases the scheme can still read the resource.
- **`WP\MCP\Cli` classes are `final`** as of the 0.6.x line; do not subclass them.
- **0.6.1 is a packaging fix only.** 0.6.0's release ZIP shipped a Jetpack Autoloader class map pointing at test-only files, so `class_exists( 'WP_CLI' )` could fatal on a normal web request. No API, hook, or protocol behaviour changed; upgrading from 0.6.0 needs no migration.

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

- **The default is no longer deny.** Since adapter 0.6.0 exposure inherits `meta.public`, and WP 7.1 marks every core ability public, so a stock 7.1 + 0.6.x site already serves `core/get-site-info`, `core/get-user-info`, and `core/get-environment-info` over MCP. Treat the exposed set as something to audit and narrow, not something you build up.
- **Narrow it deliberately.** Use a custom server with an explicit allow-list in production, or restrict the default server's `tools` through `mcp_adapter_default_server_config`, or disable it with `mcp_adapter_create_default_server`. Setting `meta.mcp.public => false` opts an individual public ability out.
- **Raise the transport and built-in-ability capabilities.** Both default to `'read'`, which every role has. An MCP server left on defaults is reachable by any Subscriber.
- **Discipline `permission_callback`.** Every write or destructive ability needs one. Read-only abilities should still have one if they expose anything sensitive.
- **Mark annotations honestly.** `readonly: true` on an ability that actually mutates state misleads both human reviewers and the MCP client's safety logic.
- **Test with an unprivileged user.** If you've been testing as administrator, your permission callbacks are probably under-tested. Create an editor or author user, regenerate an Application Password for them, and verify the client only sees what they're allowed to do.

## Sources

- MCP Adapter repo: https://github.com/WordPress/mcp-adapter — verified against **v0.6.1**: `includes/Abilities/McpAbilityExposure.php`, `includes/Core/McpAdapter.php`, `includes/Servers/DefaultServerFactory.php`, `includes/Transport/HttpTransport.php`, `docs/getting-started/installation.md`, `docs/migration/vx.y.z.md`, `CHANGELOG.md`
- Adapter releases: https://github.com/WordPress/mcp-adapter/releases
- WordPress 7.1 `WP_Ability` (`meta.public`, `@since 7.1.0`) and core ability registrations: `src/wp-includes/abilities-api/class-wp-ability.php`, `src/wp-includes/abilities.php`
- Developer Blog walkthrough: https://developer.wordpress.org/news/2026/02/from-abilities-to-ai-agents-introducing-the-wordpress-mcp-adapter/
- Make/AI overview of MCP: https://make.wordpress.org/ai/2025/07/17/mcp-adapter/
- Archived predecessor (do not use for new work): https://github.com/Automattic/wordpress-mcp
