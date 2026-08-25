# Capability-Gate Tracing

How to resolve the actual capability (or capabilities) a plugin's REST
controllers gate on. The audit's `capability_gate` field and each ability's
`permission.resolves_to` field need to reflect reality, not what the
controller docblock says.

Two common mechanisms cover most plugins. Document both explicitly so the
auditor doesn't hard-code one plugin family's assumptions.

## Mechanism A — Direct (`check_permission()` returning a single cap)

The base REST controller declares a `check_permission()` (or
`permissions_check()`) method that calls `current_user_can('<some_cap>')`
once. Every route in the controller uses that method as
`permission_callback`.

### Identifying signs

- The base controller has a method like:
  ```php
  public function check_permission() {
      return current_user_can( 'manage_options' );
  }
  ```
- Controllers extend the plugin's own base, not a WordPress core
  post-type-backed class.
- The grep `grep -n 'current_user_can' <base-controller>.php` yields one hit.

### How to trace

```bash
# Locate the base controller (usually the parent of every REST controller).
grep -rn 'extends .*REST_Controller' includes/ | head

# Read its permission_callback implementation.
grep -n 'check_permission\|permissions_check' <base-controller>.php
```

Trace once: the single `current_user_can()` call is the plugin's gate.

### How to represent in the audit

```yaml
capability_gate: manage_options  # confirmed at includes/admin/class-<plugin>-rest-controller.php line 64
```

Plugin-specific capabilities (e.g. WooCommerce's `manage_woocommerce` for
shop-aware contexts, Jetpack Forms' `edit_pages`) substitute for
`manage_options` cleanly — the shape stays the same.

## Mechanism B — Post-type-backed (core CPT capability machinery)

The controller extends a WordPress core post-type-backed class that
dispatches to the post-type capability map. There is no local
`check_permission()` — the permission callback resolves dynamically at
request time based on the request context (read vs write) and the post
type's `cap` object.

### Identifying signs

- The controller's base class is one of:
  - `WP_REST_Posts_Controller` — the core post-type REST base.
  - A subclass of it, in or out of this plugin's repo.
- No local `check_permission()` — permission callbacks are inherited.
- The post type is registered with `capability_type => '<cpt_or_shadow>'`,
  and the cap map is resolved by core's `map_meta_cap()`.

### How to trace

```bash
# Find the post-type registration.
grep -rn "register_post_type\s*(\s*['\"]<cpt_name>['\"]" .

# Read the registration block. The relevant fields are:
#   - capability_type: the type whose cap map this post type uses.
#     A custom post type can either declare its own caps or shadow another
#     type's (e.g. capability_type => 'page' to reuse Pages' caps).
#   - capabilities: optional explicit cap-string overrides.
#   - map_meta_cap: whether meta caps (read_post, edit_post) get mapped to
#     primitive caps (read_private_<type>s, edit_others_<type>s).
```

### `map_meta_cap` is not a safe assumption — read the registration

In WordPress Core, map_meta_cap defaults to true only for the built-in post and page capability types. The rule lives in `WP_Post_Type::set_props()`:

```php
// Back compat with quirky handling in version 3.0. #14122.
if ( empty( $args['capabilities'] )
    && null === $args['map_meta_cap'] && in_array( $args['capability_type'], array( 'post', 'page' ), true )
) {
    $args['map_meta_cap'] = true;
}

// If not set, default to false.
if ( null === $args['map_meta_cap'] ) {
    $args['map_meta_cap'] = false;
}
```

Read that literally, because two details decide real audits:

- It tests the **capability type**, not whether the post type is built-in. And
  `capability_type` itself defaults to `'post'`, so a custom post type registered
  with no capability argument at all silently gets `map_meta_cap = true` without
  opting in.
- A custom `capability_type` — `'shop_order'`, `'book'` — never gets it by
  default and **must opt in explicitly**. So must any registration that passes a
  non-empty `capabilities` array, even with `capability_type => 'post'`.
- The `in_array()` is strict, so the array form `array( 'post', 'posts' )` does
  not qualify either.

`get_post_type_capabilities()` does *not* special-case `'post'`/`'page'`; it
branches only on the boolean `set_props()` already resolved. With
`map_meta_cap = false`, the `cap` object never gains `read_post` / `edit_post` /
`delete_post`, `map_meta_cap()` appends an undefined capability, and the check
fails closed — which reads like correct denial in testing and is actually a
misconfiguration. Record the registration you read, not the shape you expected.

Dynamic resolution typically lands at:

- **Collection read** (GET list): `get_items_permissions_check()` checks
  `current_user_can($post_type->cap->edit_posts)` *only* when `context=edit`, and
  otherwise returns `true` with no cap check — an unauthenticated collection read
  passes. The per-post gate is downstream of the callback: `get_items()` filters
  every row of the result set through `check_read_permission($post)`
  (`check_update_permission($post)` under `context=edit`), so `read_private_<type>s`
  still governs which private posts appear in the response. On the
  permission-callback layer itself the only `read_private_<type>s` check is in
  `sanitize_post_statuses()`, when `status=private` is asked for.
- **Item read** (GET item): `get_item_permissions_check()` → `check_read_permission($post)`
  → `current_user_can('read_post', $id)` (the literal meta cap, whatever the post
  type is named), which `map_meta_cap()` resolves to `read_private_<type>s` for a
  private post the current user does not author. Under
  `context=edit` the same callback adds a `check_update_permission($post)` gate
  (`current_user_can('edit_post', $id)`) up front, then still falls through to
  `check_read_permission($post)`.
- **Create** (POST collection): `create_item_permissions_check()` →
  `current_user_can($post_type->cap->create_posts)`, which
  `get_post_type_capabilities()` defaults to `edit_<type>s`. Request-shape
  branches sit in front of it: assigning another author needs
  `edit_others_<type>s`, and `sticky` needs `edit_others_<type>s` or
  `publish_<type>s`.
- **Update** (POST / PUT / PATCH item): `update_item_permissions_check()` →
  `check_update_permission($post)` → `current_user_can('edit_post', $id)` —
  the literal meta cap, which `map_meta_cap()` resolves to
  `edit_others_<type>s` for another author's post and
  `edit_published_<type>s` for a published one. The same two request-shape
  branches (`author`, `sticky`) apply here as well.
- **Delete** (DELETE item): `delete_item_permissions_check()` →
  `check_delete_permission($post)` → `current_user_can('delete_post', $id)`,
  resolving through `map_meta_cap()` to `delete_others_<type>s` /
  `delete_published_<type>s` the same way.

The item write gates are meta caps that take `$id`; the create gate is a
primitive cap that takes none. Do not mix the two forms. `map_meta_cap()`
returns a primitive cap unchanged and drops the extra argument, so
`current_user_can('delete_<type>s', $id)` is an author-blind check — copy
that shape into an ability's `permission_callback` and anyone holding
`delete_<type>s` can delete another author's post.

Read and write often differ — post-type-backed plugins routinely have
distinct read and write caps.

### How to represent in the audit

Use the structured `{read, write}` form from `audit-schema.md`:

```yaml
capability_gate:
  read: read_private_pages
  write: edit_others_pages
  confirmed: true
  verified_at: "custom_post_type capability_type='page' → get_post_type_capabilities (wp-includes/post.php) → map_meta_cap (wp-includes/capabilities.php) → primitive page caps"
```

In each ability's `permission` block, `resolves_to` carries the cap the
**ability** must enforce — not a narration of what the route does. Trace the
route to find that cap, then record the cap: `wp-abilities-verify` diffs this
field against the registered `permission_callback`, so a narrated value can
never match and manufactures a FAIL. Keep the trace itself in a comment, in
`capability_gate.verified_at`, or in the audit's prose.

The collection and item callbacks reach the same cap by different paths, which
is why the callback name alone is not enough to fill this in:

```yaml
permission:
  source: rest_controller
  callback: get_items_permissions_check   # inherited from WP_REST_Posts_Controller
  # Callback itself only gates context=edit; the read cap is enforced per item
  # inside get_items() via check_read_permission().
  resolves_to: "current_user_can('read_private_pages')"
  confirmed: true
```

```yaml
permission:
  source: rest_controller
  callback: get_item_permissions_check    # inherited from WP_REST_Posts_Controller
  # check_read_permission($post) → current_user_can('read_post', $id) → map_meta_cap.
  resolves_to: "current_user_can('read_private_pages')"
  confirmed: true
```

`get_items_permissions_check` is never itself a `read_private_*` gate. In the
permission-callback layer of a collection route the only `read_private_<type>s`
check is in `sanitize_post_statuses()`, which admits a requested
`status=private` when
`current_user_can($post_type_obj->cap->edit_posts) || 'private' === $status && current_user_can($post_type_obj->cap->read_private_posts)`.
The collection *response* is gated separately and per item: `get_items()` runs
every queried post through `check_read_permission($post)` →
`current_user_can('read_post', $id)` → `map_meta_cap()`, skipping any post that
fails. Cite both when the audit needs the read cap on a list route — the
callback name alone does not carry it.

Example A — generic plugin shadowing core Pages caps. A custom post type
registered with `capability_type='page'` inherits the Pages cap map, so
private-item reads resolve to `read_private_pages` and writes gate on
`edit_others_pages`.

Example B — WooCommerce-style sidebar. WooCommerce's `shop_subscription` is
registered with `capability_type='shop_order'`, so private-item reads resolve
to `read_private_shop_orders` and author-sensitive writes gate on
`edit_others_shop_orders`.
Mechanically identical to Example A; the cap names are project-specific.

Do not substitute `edit_shop_orders` here. That name is
`$post_type->cap->edit_posts` — the author-**insensitive** primitive, checked
only when the user *is* the order's author (and aliased to `create_posts`).
WooCommerce uses it as a blanket "may work with orders at all" gate with no post
ID. The author-sensitive primitive is `edit_others_shop_orders`, reached only on
the not-the-author branch of `map_meta_cap()`. Recording the wrong one in an
audit produces an ability whose `permission_callback` lets any user holding the
base capability edit another customer's order.
WooCommerce also exposes a helper `wc_rest_check_post_permissions()` that
wraps the same core machinery — the helper is convenience; the underlying
mechanism is core's `map_meta_cap()`.

## Compound-string form (accepted, not preferred)

Some earlier audits encoded compound gates as a single string with a `/`
separator:

```yaml
capability_gate: read_private_pages / edit_others_pages
```

This is accepted for backwards compatibility, but:

- Downstream consumers have to heuristically split on `/`.
- YAML comments after the string are silently dropped by strict parsers, so
  provenance gets lost.
- The `{read, write}` object form is machine-parseable and carries
  `confirmed` and `verified_at` in-band.

Prefer the structured form for any new audit.

## Procedure — trace the permission source for each proposed behavior

The ability's permission should match the plugin's intended gate for the
proposed *behavior*, not necessarily the REST route. Often the REST
controller's `permission_callback` is the right source of truth, but in
some plugins the canonical permission lives elsewhere — an admin-action
handler with its own `check_admin_referer` + `current_user_can` block, a
service / helper method that performs the check before doing the work, a
domain-policy / authorization layer, or a post-type cap shadow resolved
through core's `map_meta_cap`. The audit should preserve where the
permission canonically lives so the implementer doesn't silently drift
to whichever source the REST layer happens to expose.

For each proposed ability, walk the chain once:

1. Identify the *behavior* the ability surfaces, then locate where the
   plugin enforces the cap for that behavior. Check the REST controller's
   `permission_callback` first; if the REST callback is `'__return_true'`,
   delegates entirely, or doesn't match the behavior's intended gate,
   look for the canonical source in an admin handler, a shared service
   method, a domain-policy class, or a post-type cap map.
2. Record where the gate lives in the ability's `permission.source` field
   per `audit-schema.md`: one of `rest_controller`, `admin_action`,
   `service`, `domain_policy`, `post_type_map`, `none`. Default
   `rest_controller`; pick another value when the canonical source is
   elsewhere.
3. Determine whether the gate is Mechanism A (local method, single cap)
   or Mechanism B (inherited, post-type-backed, dynamic).
4. Resolve to the actual `current_user_can()` call(s). For Mechanism B,
   resolve BOTH read and write if the ability crosses contexts.
5. Record in the ability's `permission.resolves_to` field verbatim — the
   string should read as an actual trace, not a best-guess summary.
6. Add a risk note when the canonical permission source diverges from
   the REST controller's callback: the ability's `permission_callback`
   must consult the canonical source (or replicate its check), not
   copy the REST callback by reflex.
7. If every behavior in the plugin resolves to the same cap (or same
   `{read, write}` pair) at the same source, hoist it into the top-level
   `capability_gate`. If any behavior diverges in cap OR in source,
   record the divergence in "Notes and Surprises".

## Common pitfall — `permission_callback => '__return_true'`

Zero-arg public endpoints sometimes declare `permission_callback =>
'__return_true'` at the REST layer (e.g. status lookups, enumerated lists
that are safe to expose). The audit still needs a gate:

- Record the REST-layer value in `permission.callback`
  (`callback: "__return_true"`) so the auditor isn't hiding reality.
- Put the gate the **ability** must enforce in `permission.resolves_to` —
  the canonical source located in step 1, or the plugin's intended user
  gate when no other source enforces one. `resolves_to` is the expected
  ability gate, not the current REST-layer value: `wp-abilities-verify`
  diffs it against the registered `permission_callback` and FAILs on
  disagreement (`wp-abilities-verify/references/permission-roundtrip.md`,
  "Audit cross-check"). Recording `"__return_true (public)"` there
  manufactures a FAIL against a correct registration and pressures the
  implementer to copy `__return_true` back in.
- Add a risk note: the **ability** registration must NOT copy
  `'__return_true'` — the ability's own `permission_callback` must match
  the plugin's intended user gate (e.g. `manage_options`, `edit_pages`, or
  whatever your plugin uses). The ability layer is the agent-facing surface
  and needs that gate even when the underlying REST route is public.
