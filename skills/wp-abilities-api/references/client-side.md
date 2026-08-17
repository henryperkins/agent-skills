# Client-side Abilities API (WP 7.0+)

WordPress 6.9 introduced the server-side Abilities API. WordPress 7.0 added the JavaScript counterpart, letting plugins register and execute abilities entirely on the client (e.g., navigating, inserting blocks) and consume server-registered abilities from JS.

## Two packages, one store

- **`@wordpress/abilities`** — pure state management, no server dependencies. Provides the store, registration, querying, and execution. Use when you only need the store; works in non-WordPress contexts too.
- **`@wordpress/core-abilities`** — the WordPress integration layer. When loaded, it auto-fetches all server-registered abilities and categories via `/wp-abilities/v1/` and registers them in the `@wordpress/abilities` store with execution callbacks. Use this for the common case.

### Registration is asynchronous — await `ready`

`@wordpress/core-abilities` starts fetching on import and exports a single thing: a `ready` promise that
resolves once both round trips (categories, then abilities) have registered.

```ts
// packages/core-abilities/src/index.ts — the package's only export.
export const ready: Promise< void > = initialize();
```

Until `ready` resolves, the store holds no server abilities. `getAbilities()` returns an empty array and
`executeAbility( 'some/server-ability' )` throws `Error: Ability not found: some/server-ability` — **an error
that names the ability but not the race**, which is why it gets misread as "the plugin never registered it".
Every imperative call against server-registered abilities must await it first:

```js
const { ready } = await import( '@wordpress/core-abilities' );
await ready;
// Server abilities are now in the store.
```

Use the dynamic-import form rather than a static `import { ready } from '@wordpress/core-abilities'` when your
module is enqueued as a *sibling* script module (the pattern below): siblings have no guaranteed evaluation
order, so a static import may not have a resolved binding when your code runs. Importing it yourself also
defers the network requests until the feature actually needs abilities.

`useSelect` consumers do not need this — they re-render when the store fills. Only imperative reads and
executions race it.

## Enqueuing

### Server abilities + client UI (most common)

```php
add_action( 'init', function () {
    wp_register_script_module(
        'my-plugin-admin',
        plugins_url( 'build/admin.js', __FILE__ ),
        array( '@wordpress/abilities' ),
        '1.0.0'
    );
} );

add_action( 'admin_enqueue_scripts', function ( $hook_suffix ) {
    if ( 'settings_page_my-plugin' !== $hook_suffix ) {
        return;
    }

    wp_enqueue_script_module( '@wordpress/core-abilities' );
    wp_enqueue_script_module( 'my-plugin-admin' );
} );
```

`wp_register_script_module()` makes the plugin's compiled script module available; it does not load it. `wp_enqueue_script_module()` loads it on the matching screen. Keep this page-scoped enqueue pattern, and explicitly enqueue `@wordpress/core-abilities`: it loads its `@wordpress/abilities` dependency and registers server abilities in the store automatically.

Note that `my-plugin-admin` declares `@wordpress/abilities` as its dependency, not `@wordpress/core-abilities` — the two are enqueued as siblings. That gets the store loaded in time but guarantees nothing about *registration* having finished, which is asynchronous. Await `ready` as shown above before any imperative read or execution.

### Client-only abilities on a specific page

```php
add_action( 'admin_enqueue_scripts', function ( $hook_suffix ) {
    if ( 'my-plugin-page' !== $hook_suffix ) {
        return;
    }
    wp_enqueue_script_module( '@wordpress/abilities' );
} );
```

Skips the server fetch overhead when you only need client-registered abilities on one screen.

## Importing in JS

Dynamic import:

```js
const {
    registerAbility,
    registerAbilityCategory,
    getAbilities,
    executeAbility,
} = await import( '@wordpress/abilities' );
```

Or, if your code is a script module compiled with `@wordpress/scripts`, a normal static import works:

```js
import {
    registerAbility,
    registerAbilityCategory,
    getAbilities,
    executeAbility,
} from '@wordpress/abilities';
```

## Registering a category

Categories must exist before abilities reference them. Server categories load automatically with `@wordpress/core-abilities`. Register client categories explicitly:

```js
const { registerAbilityCategory } = await import( '@wordpress/abilities' );

registerAbilityCategory( 'my-plugin-actions', {
    label: 'My Plugin Actions',
    description: 'Actions provided by My Plugin',
} );
```

Slug rules: lowercase alphanumeric with dashes only (e.g., `data-retrieval`, `user-management`). No underscores, no caps.

## Registering an ability

```js
const { registerAbility } = await import( '@wordpress/abilities' );

registerAbility( {
    name: 'my-plugin/navigate-to-settings',
    label: 'Navigate to Settings',
    description: 'Navigates to the plugin settings page',
    category: 'my-plugin-actions',
    callback: async () => {
        window.location.href = '/wp-admin/options-general.php?page=my-plugin';
        return { success: true };
    },
} );
```

### Input/output schemas (recommended)

JSON Schema (draft-04). Inputs are validated before `callback` runs; outputs are validated after. Validation failures throw `ability_invalid_input` or `ability_invalid_output`.

```js
registerAbility( {
    name: 'my-plugin/create-item',
    label: 'Create Item',
    description: 'Creates a new item with the given title and content',
    category: 'my-plugin-actions',
    input_schema: {
        type: 'object',
        properties: {
            title: { type: 'string', minLength: 1 },
            content: { type: 'string' },
            status: { type: 'string', enum: [ 'draft', 'publish' ] },
        },
        required: [ 'title' ],
    },
    output_schema: {
        type: 'object',
        properties: {
            id: { type: 'number' },
            title: { type: 'string' },
        },
        required: [ 'id' ],
    },
    callback: async ( { title, content, status = 'draft' } ) => {
        // Implementation...
        return { id: 123, title };
    },
} );
```

### Permission callback

Render the capability state with the page that owns the client-only ability:

```php
<div
    id="my-plugin-root"
    data-can-manage-options="<?php echo current_user_can( 'manage_options' ) ? '1' : '0'; ?>"
></div>
```

```js
const { registerAbility } = await import( '@wordpress/abilities' );
const root = document.getElementById( 'my-plugin-root' );
const canManageOptions = root?.dataset.canManageOptions === '1';

registerAbility( {
    name: 'my-plugin/admin-action',
    label: 'Admin Action',
    description: 'Runs an administrator-only client action',
    category: 'my-plugin-actions',
    permissionCallback: () => canManageOptions,
    callback: async () => ( { success: true } ),
} );
```

`permissionCallback` gates execution and nothing else: `executeAbility()` awaits it and throws `ability_permission_denied` on a falsy result. The store selectors ignore it — `getAbilities()`, `getAbility()`, and the `core/abilities` store still hand back the ability, label and description included, to a user who cannot run it. A UI that lists abilities has to filter by permission itself, or skip the `registerAbility()` call entirely when the user lacks the capability. Server-backed work still needs a server-side `permission_callback`.

## Annotations

Behavioral hints used by the runtime and (importantly) by the MCP Adapter when exposing the ability over MCP:

| Annotation | Type | Description |
| --- | --- | --- |
| `readonly` | boolean | Reads only, no state change |
| `destructive` | boolean | Performs destructive operations |
| `idempotent` | boolean | Same result if called multiple times with same input |

```js
registerAbility( {
    name: 'my-plugin/get-stats',
    label: 'Get Stats',
    description: 'Returns plugin statistics',
    category: 'my-plugin-actions',
    callback: async () => ({ views: 100 }),
    meta: { annotations: { readonly: true } },
} );
```

The MCP Adapter maps these to MCP tool annotations: `readonly` → `readOnlyHint`, `destructive` → `destructiveHint`, `idempotent` → `idempotentHint`. So getting these right pays off for both the local execution surface and any MCP-exposed external surface.

## HTTP method routing for server abilities

When `executeAbility` calls a server-registered ability through the REST API, the HTTP method is chosen from the ability's annotations:

- `readonly: true` → `GET`
- `destructive: true` + `idempotent: true` → `DELETE`
- All other cases → `POST`

This matters for caching, logging, and CSRF posture. A read-only ability should always be marked `readonly` so it gets `GET` and benefits from any HTTP caching layer.

The package is not choosing a convention here — it is matching one the server enforces. The run controller derives the same single legal method from the same annotations and returns `rest_ability_invalid_method` (HTTP 405) for anything else, so a hand-rolled client must apply this mapping too. See "The `/run` method is enforced, not conventional" in `rest-api.md`.

## Querying

```js
const {
    getAbilities,
    getAbility,
    getAbilityCategories,
    getAbilityCategory,
} = await import( '@wordpress/abilities' );

// Required before reading server-registered abilities; without it these return empty.
const { ready } = await import( '@wordpress/core-abilities' );
await ready;

const all      = getAbilities();
const filtered = getAbilities( { category: 'data-retrieval' } );
const one      = getAbility( 'my-plugin/create-item' );
const cats     = getAbilityCategories();
const cat      = getAbilityCategory( 'data-retrieval' );
```

### Reactive queries with `@wordpress/data`

The store registers via `@wordpress/data` and integrates with `useSelect`. Use `useSelect` for reactive queries in React:

```jsx
import { useSelect } from '@wordpress/data';
import { store as abilitiesStore } from '@wordpress/abilities';

function AbilitiesList() {
    const abilities = useSelect(
        ( select ) => select( abilitiesStore ).getAbilities(),
        []
    );
    const dataAbilities = useSelect(
        ( select ) => select( abilitiesStore ).getAbilities( { category: 'data-retrieval' } ),
        []
    );
    // Updates automatically when the store changes.
}
```

Use the imported `store` constant rather than referencing the store by string name. The canonical key is `'core/abilities'` — that is what the WP 7.0 dev note documents and what `@wordpress/abilities` registers. You may still meet `'abilities-api/abilities'` in older code: that was the key used by the standalone `WordPress/abilities-api` feature plugin, archived in February 2026 once the API landed in core. Importing `store` keeps that history from mattering.

## Executing

```js
import { executeAbility } from '@wordpress/abilities';

// Server-registered target, so wait for registration before executing.
const { ready } = await import( '@wordpress/core-abilities' );
await ready;

try {
    const result = await executeAbility( 'my-plugin/create-item', {
        title: 'New Item',
        content: 'Item content',
        status: 'draft',
    } );
} catch ( error ) {
    switch ( error.code ) {
        // Raised by executeAbility itself.
        case 'ability_permission_denied':
        case 'ability_invalid_input':
        case 'ability_invalid_output':
            // Handle each appropriately.
            break;
        // Raised by apiFetch for server-registered targets.
        case 'rest_ability_cannot_execute':  // 401/403 — server permission_callback said no.
        case 'rest_ability_not_found':       // 404 — unregistered, or show_in_rest: false.
        case 'rest_ability_invalid_method':  // 405 — annotations disagree with the method sent.
            // Handle each appropriately.
            break;
        default:
            console.error( 'Execution failed:', error.message );
    }
}
```

The two families are not interchangeable. `ability_permission_denied` only ever fires for a client-registered ability, because the REST payload carries no `permissionCallback` — a server ability's permission failure arrives as `rest_ability_cannot_execute`. `ability_invalid_input` and `ability_invalid_output` fire for both: the client validates against the `input_schema`/`output_schema` it fetched over REST before and after the round trip, so a server ability can fail validation client-side and never reach the server at all.

`executeAbility` works for both client- and server-registered abilities. For server abilities loaded via `@wordpress/core-abilities`, execution is dispatched over REST automatically using the method derived from annotations — but only once `ready` has resolved. Client-registered abilities are available synchronously and need no wait.

## Unregistering

```js
const { unregisterAbility, unregisterAbilityCategory } = await import( '@wordpress/abilities' );

unregisterAbility( 'my-plugin/navigate-to-settings' );
unregisterAbilityCategory( 'my-plugin-actions' );
```

Both functions remove any entry from the store by name or slug, including the ones `@wordpress/core-abilities` registered from the server — the `annotations.serverRegistered` flag it stamps is recorded but never checked. Unregistering a server ability client-side only hides it from this page's store; the `/run` route still executes it, and the next page load fetches it back. To actually retire a server ability, unregister it in PHP.

## Sources

- Dev note: https://make.wordpress.org/core/2026/03/24/client-side-abilities-api-in-wordpress-7-0/
- Server-side dev note (WP 6.9): https://make.wordpress.org/core/2025/11/10/abilities-api-in-wordpress-6-9/
- WebMCP context (why this work matters for browser agents): https://github.com/WordPress/ai/pull/224
