# Controller Enumeration

How to produce an exhaustive list of a plugin's REST controllers — the first
step of every audit. Plugin family classification is handled separately by
`wp-project-triage`; this reference covers the mechanics of finding controller
classes inside whatever layout the plugin happens to use.

## Three enumeration paths

Two paths find the controllers a plugin declares itself; the third finds REST
surface that WordPress core registers on the plugin's behalf. Glob and grep
between them cover every *declared* layout seen in the wild, but both key on a
literal `register_rest_route(` call or a controller filename — so both return
zero for a plugin whose entire REST surface comes from `show_in_rest`
registrations:

| Path | When it works | How it works |
|---|---|---|
| **Glob** | Plugins that follow the standard `includes/admin/class-*-rest-*-controller.php` layout (WooCommerce core extensions, classic WooPayments). | Fast, deterministic, easy to script. Returns a complete list in one shell call. |
| **Grep** | Any non-standard layout — `includes/api/`, `includes/rest-api/`, `src/rest/`, monorepo package directories, or anything else. | Universal fallback: grep every PHP file under the plugin root for `register_rest_route(` call sites, then collect the enclosing class for each hit. |
| **Implicit** | Any plugin registering a post type, taxonomy, setting, meta key, or REST field with `show_in_rest`. | Grep for the registration functions, then derive the routes core builds from them. No `register_rest_route(` call exists anywhere in the plugin. |

### Default order

1. **Try glob first** — it's faster and produces a cleaner inventory.
2. **Fall back to grep** if glob returns zero hits (or clearly undercounts
   against what you see in the plugin's public documentation / admin UI).
3. **Always run the implicit pass**, whatever the first two returned. It is
   additive, not a fallback: a plugin can have both hand-registered
   controllers and `show_in_rest` post types.

Running all three and de-duplicating is legal; it catches monorepos that have
*some* controllers under the standard layout and *others* under a package
directory.

## Glob — standard layout

```bash
# From the plugin root:
ls includes/admin/class-*-rest-*-controller.php 2>/dev/null
ls includes/reports/class-*-rest-*-controller.php 2>/dev/null
```

What you'll see in repos that match this convention:

- WooPayments (`Automattic/woocommerce-payments`) — every controller under
  `includes/admin/class-wc-rest-payments-*-controller.php` plus some under
  `includes/reports/`.
- WooCommerce core's internal REST controllers use the same pattern.

If glob returns 5+ hits, it's almost always the complete inventory. If it
returns 0-2, fall through to grep.

## Grep — universal fallback

```bash
# From the plugin root:
grep -rn --include='*.php' 'register_rest_route(' .
```

For each hit:

1. Open the file.
2. Walk up to the enclosing class declaration.
3. Record `(class, file, route, callback, permission_callback)`.

This path matters because it's the only one that finds controllers in
non-standard locations:

- **WooCommerce Subscriptions** — controllers live under `includes/api/` and
  `includes/api/legacy/`. The standard WooPayments glob returns zero; grep is
  mandatory.
- **Jetpack Forms** (and most Jetpack packages) — controllers live under
  `projects/packages/<name>/src/` with no conventional filename. Grep is
  again mandatory.
- **Custom plugin layouts** — anything with `src/Rest/`, `lib/rest/`,
  `api/v1/`, etc. Grep catches them all.

## Implicit — core-derived routes

`create_initial_rest_routes()` (`wp-includes/rest-api.php` in the release package;
`src/wp-includes/rest-api.php` in wordpress-develop, WP 7.1) loops
over `get_post_types( array( 'show_in_rest' => true ) )` and
`get_taxonomies( array( 'show_in_rest' => true ) )` and calls
`register_routes()` on each object's controller. The plugin never calls
`register_rest_route(` — core does, at `rest_api_init`, from arguments the
plugin passed to `register_post_type()` / `register_taxonomy()`.

```bash
# From the plugin root:
grep -rn --include='*.php' -e 'register_post_type(' -e 'register_taxonomy(' \
  -e 'register_rest_field(' -e 'register_meta(' -e 'register_post_meta(' \
  -e 'register_term_meta(' -e 'register_setting(' .

# Then confirm the exposure flag on each hit:
grep -rn --include='*.php' "show_in_rest" .
```

For each hit, derive the surface:

| Registration | Derived REST surface |
|---|---|
| `register_post_type( $type, array( 'show_in_rest' => true ) )` | `/<ns>/<rest_base>` and `/<ns>/<rest_base>/(?P<id>[\d]+)` via `WP_REST_Posts_Controller` |
| …plus `supports` including `revisions` | `/<ns>/<rest_base>/(?P<parent>[\d]+)/revisions[/(?P<id>[\d]+)]` |
| …plus `supports` including `editor` (or `autosave`, or `supports` omitted entirely — `editor` implies `autosave`, and the default `supports` is `title`, `editor`, `autosave`) | `/<ns>/<rest_base>/(?P<id>[\d]+)/autosaves` — collection, GET + POST — and `/<ns>/<rest_base>/(?P<parent>[\d]+)/autosaves/(?P<id>[\d]+)` — item, GET — via `WP_REST_Autosaves_Controller`. Note the collection captures the parent post id as `id`, not `parent`. |
| `register_taxonomy( $tax, $types, array( 'show_in_rest' => true ) )` | `/<ns>/<rest_base>` and `/<ns>/<rest_base>/(?P<id>[\d]+)` via `WP_REST_Terms_Controller` |
| `register_rest_field( $object_type, $attr, … )` | No new route — a new top-level field on the existing routes for `$object_type`, with its own `get_callback` / `update_callback`. |
| `register_meta( …, array( 'show_in_rest' => true ) )` | No new route — a readable/writable key inside the `meta` object on the routes for that object type and subtype. |
| `register_setting( $group, $option, array( 'show_in_rest' => true ) )` | No new route — a readable/writable key on `GET` / `POST /wp/v2/settings`, which `WP_REST_Settings_Controller` registers unconditionally, gated on `manage_options` (`WP_REST_Settings_Controller::get_item_permissions_check`). `show_in_rest` may be an array carrying `name` and `schema`, and `name` renames the exposed key away from the option name. |

Resolving `<ns>` and `<rest_base>`: `rest_namespace` falls back to `wp/v2`,
and `rest_base` falls back to the post type / taxonomy name. `rest_base` is
often left unset, so `register_post_type( 'acme_order', … )` yields
`/wp/v2/acme_order`.

Two registrations that look exposed but are not: `show_in_rest` with a
`rest_controller_class` that is not a `WP_REST_Controller` subclass yields no
routes (`get_rest_controller()` returns `null`), and the revisions routes only
appear when the post type actually declares `revisions` support
(`get_revisions_rest_controller()` returns `null` otherwise). The autosaves
routes need no declaration to appear: `WP_Post_Type::add_supports()` adds
`autosave` implicitly whenever `editor` support is present, so a CPT that took
the default `supports` gets them.

Recording the result — reuse the inherited-route fields (see below), since
the controller genuinely does live in core:

- `backing.class`: the core controller (`WP_REST_Posts_Controller` unless the
  plugin passed `rest_controller_class`).
- `backing.file`: the plugin file containing the `register_post_type()` /
  `register_taxonomy()` / `register_setting()` call — that is where the
  plugin's decision lives.
- `backing.route_registration_line: null` and `backing.callback_line: null`.
- `backing.inherited_from: "WP_REST_Posts_Controller"` (or the relevant base).
- `permission.source: post_type_map` for CPT routes whose capabilities resolve
  through the post type's `capability_type` / `map_meta_cap` shadow rather
  than a hand-written `permission_callback`.

## Inherited routes

A controller can extend a base class in a different repo — typically the
parent plugin (for extensions built on top of another plugin) or WordPress
core itself (for plugins extending `WP_REST_Posts_Controller` or other core
REST bases). The `parent::register_routes()` dispatch appears in the
extending plugin's source, but the literal `register_rest_route(` call lives
in the parent. WooCommerce extensions extending
`WC_REST_Orders_Controller`, plugins built on Jetpack package REST classes,
and CPT plugins inheriting from `WP_REST_Posts_Controller` all hit this
pattern.

Handling:

- Record the route on the child class (that's where the plugin's REST surface
  actually exposes it).
- Set `backing.route_registration_line: null` and
  `backing.callback_line: null` in the audit schema.
- Add `backing.inherited_from: "<parent FQCN>"` so downstream skills can tell
  the inheritance case from a plain missing line number.
- Consider running grep against the parent repo too when you need to confirm
  the callback's request handling — inherited callbacks behave as whatever
  the parent defines, not what the plugin repo documents.

See `audit-schema.md` for the exact field shapes.

## Exhaustiveness is the goal

The "Controller Inventory" table in the audit doc must list every controller
the enumeration found — not just ones backing proposed abilities. A reviewer
asking "why isn't controller X in the MVP?" should be able to point at the
inventory and see the explicit answer (usually: "excluded from MVP because…"
or "surfaced as a gap because…").

If your inventory has 3 entries and the plugin clearly exposes more, either
the enumeration is incomplete (re-run grep with broader patterns) or you're
filtering the inventory instead of the proposal list. Fix the inventory
first; filter after.

An **empty** inventory is never a finding on its own. It means the plugin has
no *declared* controllers, which is exactly what a CPT-only plugin looks like
— run the implicit pass before writing "no REST surface" anywhere in the
audit.

## Escalation

If none of the three paths produces a complete inventory — for example a
plugin that registers routes dynamically from config or via a factory that
does not contain a literal `register_rest_route(` string — document the
enumeration gap in "Notes and Surprises", and extend this reference with the
new pattern once understood.
