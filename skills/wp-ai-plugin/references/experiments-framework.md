# Experiments framework

The conceptual model and lifecycle for AI plugin Experiments, anchored to `WordPress/ai` v1.2.0 source.

## What an Experiment is

An "Experiment" in the AI plugin is a class that extends `WordPress\AI\Abstracts\Abstract_Feature`, which implements `WordPress\AI\Contracts\Feature`. The same `Abstract_Feature` is used for all features — Experiments are simply Features with `stability` set to `'experimental'`.

Three stability levels exist (declared in `load_metadata()` or defaulted):

- **`'experimental'`** — opt-in, may change shape, may be dropped, may be promoted (default if unspecified)
- **`'stable'`** — graduated through testing and contributor consensus
- **`'deprecated'`** — slated for removal

Image Generation is a stable Feature (promoted from `'experimental'` to `'stable'` in v0.8.0, #418; registered via `Loader::get_default_features()`) — and at v1.2.0 it holds the tree's only `'stability' => 'stable'` declaration. No registered Experiment sets the key at all, Title Generation included, so all sixteen fall back to `'experimental'`. The value is visible, not inert: the AI Status dashboard widget calls `Registry::get_features_by_stability()` to split its two lists, so a `'stable'` Feature lands in the **Features** column and everything else in the **Experiments** column (and `get_stability()` also rides along in the Settings → AI payload). In v1.0.0, the *Review Notes* and *Refine from Notes* experiments were renamed to **Editorial Notes** (`editorial-notes`) and **Editorial Updates** (`editorial-updates`) respectively. The path is experimental → stable → potentially core.

## The contract (`Abstract_Feature`)

From `includes/Abstracts/Abstract_Feature.php`:

- **`final public function __construct()`** — do not override. Calls `static::get_id()` and `$this->load_metadata()` to populate properties.
- **`abstract public static function get_id(): string`** — return a unique slug-style ID. Called statically.
- **`abstract protected function load_metadata(): array`** — return `['label', 'description', 'category', 'stability'?, 'image'?, 'capability'?]`. `label` and `description` are required; missing them throws `InvalidArgumentException`. `category` defaults to `Feature_Category::OTHER` if empty, `stability` to `'experimental'`, `image` to `''`, and **`capability` to `'text_generation'`** — the last is a live default, not an inert one: it is surfaced through `get_capability()` into the Settings → AI screen, so a Feature that needs no model should declare `'capability' => 'none'`. Values used in the 1.2.0 tree: `'none'`, `'vision'`, `'image_generation'`, `'text_generation'`.
- **`abstract public function register(): void`** — set up hooks. Called by `Loader::initialize_features()` only if `is_enabled()` returns true.
- **`final public function is_enabled(): bool`** — returns `is_globally_enabled() && is_individually_enabled()`, cached on the instance; cannot be overridden. The per-feature logic lives in `is_individually_enabled()` (added 1.0.1): it reads the `wpai_feature_{$id}_enabled` option and runs the `wpai_feature_{$id}_enabled` filter (plus the deprecated legacy filter). `is_globally_enabled()` (added 1.0.1) checks the global features toggle.
- **`public function register_settings(): void`** — optional override. Use `register_setting()` for custom feature settings.
- **`public function get_settings_fields(): array`** — optional override. Return field definitions for the DataForm UI on the AI settings page.
- **`final public static function get_field_option_name( string $option_name ): string`** — generates `wpai_feature_{$id}_field_{$option_name}`. Use for namespaced option storage.

The interface (`Contracts\Feature`) lists twelve public methods (unchanged as of v1.2.0): `get_id` (static), `get_label`, `get_description`, `get_category`, `get_stability`, `register`, `is_globally_enabled` (added v1.0.1), `is_individually_enabled` (added v1.0.1), `is_enabled`, `get_settings_fields_metadata` (added v0.7.0), `get_image` (added v0.8.0), and `get_capability` (added v0.9.0).

## The canonical example

`includes/Experiments/Example_Experiment/Example_Experiment.php` is shipped specifically as a copy-this reference. It demonstrates:

- subclassing `Abstract_Feature`,
- implementing `get_id`, `load_metadata`, `register`,
- using `Experiment_Category::ADMIN`,
- registering hooks (`wp_footer`, `document_title_parts`, `rest_api_init`) inside `register()`,
- a paired REST endpoint with permission_callback.

Read it before writing your own; that's what it's there for.

## Registration: the two extension points

From `includes/Features/Loader.php`. The Loader runs via `Loader::init()`, called by `Main::initialize_features()` on the **`init` hook at priority 15** — `init()` calls `register_features()` then `initialize_features()`. The `wpai_default_feature_classes` filter is applied inside `register_features()`'s helper `get_default_features()`; the `wpai_register_features` action fires in `register_features()` directly. So both run during the AI plugin's `init` priority-15 handler — attach your callbacks by `plugins_loaded`, or on `init` before priority 15.

For downstream extensions, the project documentation presents the `wpai_register_features` action as the primary registration path. Use the filter when you deliberately need to alter the pre-instantiation class list.

### `wpai_default_feature_classes` filter

```php
$items = apply_filters( 'wpai_default_feature_classes', $feature_classes );
```

Filter receives an array of `[ feature_id => fully_qualified_class_string ]`. The Loader then:

1. Validates each item is a class string (logs `_doing_it_wrong` and skips otherwise),
2. Validates the class implements `Feature` interface (logs `_doing_it_wrong` and skips otherwise),
3. Instantiates with `new $class()` inside try/catch (skips with `_doing_it_wrong` if construction throws),
4. Adds the resulting instance to the registry.

Use this filter to add, remove, or replace class strings before instantiation.

### `wpai_register_features` action

```php
do_action( 'wpai_register_features', $this->registry );
```

Action receives the `Registry` instance. Call `$registry->register_feature( $instance )` with an already-instantiated Feature. Returns `false` if the ID is already registered.

Use this action for normal downstream registration as well as custom construction (dependency injection, factory pattern, or conditional registration based on runtime state).

### Built-in Experiments

The plugin's own Experiments are registered via `Experiments::register_default_experiment_classes()` hooked to `wpai_default_feature_classes` at priority 9. `Experiments::EXPERIMENT_CLASSES` at the **v1.2.0 tag** has sixteen entries:

```
Abilities_Explorer, Connector_Approval, AI_Request_Logging,
Content_Classification, Content_Resizing, Excerpt_Generation,
Alt_Text_Generation, Meta_Description, Editorial_Notes,
Editorial_Updates, Summarization, Title_Generation, Type_Ahead,
Comment_Moderation, Key_Encryption, Suggest_Reply
```

On `develop` the list is **nineteen** — the same sixteen plus `Content_Translation`, `Slug_Generation`, and `Custom_Abilities` — and has been reordered so admin-category Experiments lead. `Example_Experiment` exists in the tree as an authoring template and is deliberately not registered.

Plus the internal `Image_Generation` Feature (registered separately as a stable Feature in `Loader::get_default_features()`).

### Built-in Abilities

The v1.2.0 plugin directly registers five non-Experiment utility/read Abilities:

- `core/read-content`
- `core/read-settings`
- `core/read-users`
- `ai/get-post-details`
- `ai/get-post-terms`

Feature and Experiment Abilities, including the three Image Generation Abilities (`ai/image-generation`, `ai/image-import`, `ai/image-prompt-generation`) and `ai/comment-analysis`, are conditional on those Features being enabled. Resolve an Ability with `wp_get_ability()` on or after `wp_abilities_api_init`; do not assume a conditional ID exists. The exposed post types and settings used by the read Abilities depend on `show_in_abilities`, so do not assume every object is exposed or re-register these IDs blindly.

On `develop` even the five above become conditional — see "Added after v1.2.0" below.

### Advanced feature settings

Features supply advanced settings through their own metadata and settings-field methods. Use the documented `wpai_settings_feature_groups` and `wpai_settings_feature_metadata` filters to extend that existing metadata. `wpai_feature_{$id}_settings` is only available when a specific Feature applies it (Type Ahead does in v1.2.0); it is not a universal framework filter. There is no separate public registry for advanced settings to invent.

### Added in v1.2.0

- **`Suggest_Reply`** (`suggest-reply`, `Experiment_Category::ADMIN`) — adds a "Suggest reply" action to the Comments screen row actions and the Activity dashboard widget so moderators can generate a reply to a comment; registers the paired `ai/suggest-reply` Ability (#724).
- Two new **read-only Abilities**, registered by `Main` and kept almost identical to the proposed WordPress core classes so the implementations stay in sync:
  - **`core/read-content`** (`includes/Abilities/Content/Content.php`, category `content`) — fetch a single readable post by ID or by post type + slug, or query multiple posts filtered by post type, status, author, parent, or included IDs. Only post types flagged with `show_in_abilities` are eligible; raw fields are returned only for posts the current user can edit (#739).
  - **`core/read-users`** (`includes/Abilities/Users/Users.php`, category `user`) — fetch a single readable user by ID, email, username, or slug, or a paginated collection filtered by roles, published-post authorship, or included IDs; field-level access is enforced per user (#774).
- The `show_in_abilities` polyfill (`includes/Abilities/Show_In_Abilities.php`) now also marks curated **post types** (previously only settings), so `core/read-content` returns data on a stock site until WordPress core ships the flag natively — after which core owns it, like `show_in_rest`.

### Added after v1.2.0 (unreleased on `develop`)

- **`Content_Translation`** (`content-translation`, `Experiment_Category::EDITOR`) — translates paragraph and heading blocks into a different language, and registers the paired `ai/content-translation` Ability (#747, merged 2026-07-29). Requires a connector with text-generation support.

  Target languages come from `Languages.php` and are filterable:

  ```php
  add_filter( 'wpai_content_translation_languages', function ( array $languages ): array {
      $languages['cy'] = __( 'Welsh', 'my-plugin' );
      return $languages;
  } );
  ```

  Codes are normalised with `sanitize_key()`, entries with a non-string or empty label are discarded, and a non-array return value is ignored entirely so the language picker and the ability schema keep working. The filtered list feeds the ability's input schema, so adding a language your provider cannot handle produces runtime failures rather than a validation error.

  The class carries `@since x.x.x` placeholders — it is on `develop` but not in any tagged release, and the CHANGELOG's `[Unreleased]` section has not been updated to mention it. Treat it as unavailable when targeting 1.2.0.

- **`Custom_Abilities`** (`custom-abilities`, `Experiment_Category::ADMIN`, `capability` `'none'`) — a single toggle that gates *all* of the plugin's custom Abilities. Its `register()` pulls `Gated_Abilities::get_all()` and registers each one, running the `Show_In_Abilities` polyfill first when any gated ability needs core objects exposed. `Gated_Abilities::GATED_ABILITY_CLASSES` currently holds `Post_Utilities`, `Read_Settings`, `Read_Users`, `Read_Content` — i.e. exactly the five IDs that 1.2.0 registers unconditionally (`core/read-content`, `core/read-settings`, `core/read-users`, `ai/get-post-details`, `ai/get-post-terms`). Third parties add their own via the `wpai_gated_abilities` filter.

  This is a behavioral inversion, not an addition: if it ships, those Ability IDs are absent until a site admin enables the Experiment, and the `show_in_abilities` polyfill goes with them. Any downstream code that resolves `core/read-content` must handle null, and anything relying on the polyfill to expose curated core objects must not assume it ran.

- **`Slug_Generation`** — generates post-slug suggestions; `wpai_slug_generation_number_of_suggestions` filters how many.

- **Ability-scoped prompt hooks** — `wpai_{$ability_slug}_system_instruction`, `wpai_{$ability_slug}_prompt`, and `wpai_{$ability_slug}_prompt_builder`. The global `wpai_system_instruction` hook has shipped since v0.7.0 and is present in v1.2.0; only the scoped family is new on `develop`.
- **Settings import/export** — authenticated `GET /ai/v1/settings/export` and `POST /ai/v1/settings/import` endpoints, both gated by `manage_options`, using schema version 1 and excluding credential-like settings.
- **Site Health integration** — an AI Plugin debug section and a direct credential-status test that does not expose secrets.
- **Content Classification controls** — available-term, minimum-confidence, and candidate-pool-size filters plus richer taxonomy descriptors.

The `develop` branch still declares plugin version `1.2.0`, and these additions carry `@since x.x.x` placeholders. Do not infer a future release number; keep them behind release or capability detection until tagged.

## The enabled-state model

`Abstract_Feature::is_enabled()` is layered:

1. **Global toggle** — `wpai_features_enabled` option. Settings → AI's master switch. Returns false immediately if off.
2. **Per-feature toggle** — `wpai_feature_{$id}_enabled` option. The Settings → AI screen renders one toggle per registered Feature.
3. **Per-feature filter** — `wpai_feature_{$id}_enabled` filter (same name as the option). Last filter value wins. Use this in mu-plugins or hosting controls to force-enable or force-disable specific features.
4. **Deprecated legacy filter** — `ai_experiments_experiment_{$id}_enabled` runs through `apply_filters_deprecated` for compat with code written before the 0.6.0 rename.

Result is cached on the instance. Filters firing after the first `is_enabled()` call have no effect on that instance — important for testing.

## Pairing with an Ability

Most Experiments register one or more Abilities inside their `register()` method. The pattern (from `Title_Generation`):

```php
public function register(): void {
    add_action( 'wp_abilities_api_init', array( $this, 'register_abilities' ) );
    // Other hooks for editor UI, REST endpoints, etc.
}

public function register_abilities(): void {
    wp_register_ability(
        'ai/' . $this->get_id(),
        array(
            'label'         => $this->get_label(),
            'description'   => $this->get_description(),
            'ability_class' => My_Ability::class,
        ),
    );
}
```

The `ability_class` key is a core `wp_register_ability()` argument since WordPress 6.9 — any fully-qualified class extending `WP_Ability`, instantiated instead of `WP_Ability` itself. The AI plugin is one consumer: it points the key at a class extending `WordPress\AI\Abstracts\Abstract_Ability` (which itself extends `WP_Ability`). Because core skips its `execute_callback`/`permission_callback` validation whenever `get_class( $this ) !== WP_Ability::class`, the named subclass is responsible for supplying both. The Ability class implements:

- `input_schema(): array`
- `output_schema(): array`
- `execute_callback( $input ): mixed`
- `permission_callback( $input ): mixed`
- `meta(): array`
- `category(): string` (defaults to `WPAI_DEFAULT_ABILITY_CATEGORY`)
- `guideline_categories(): array` (optional, for Guidelines integration)

The Ability is what the Abilities API exposes — reachable via REST when its `meta` sets `show_in_rest => true` (as the canonical abilities do). MCP exposure is separate from REST visibility but is not determined solely by the nested MCP flag: **MCP Adapter 0.6.0+** (`McpAbilityExposure::is_public()`) uses explicit `meta.mcp.public` when present and otherwise inherits high-level `meta.public`. Adapter 0.5.0 and earlier read `meta.mcp.public` alone and never inherit — check which version the site runs before reasoning about effective exposure. Set `meta.mcp.public => false` when a public Ability must remain unavailable through the default MCP server. The Experiment is the Settings → AI surface.

## Promotion path

The 0.5.0 release notes referenced "Finalize requirements to elevate an Experiment to a Feature." Working criteria (per contributor discussions):

- Stable user-facing UX with documented behavior
- At least one fully-tested provider integration
- No outstanding critical accessibility issues
- Plugin lead approval after contributor review

If you're building an Experiment with the explicit goal of seeing it graduate, work the contributor channels (`#core-ai` Slack, GitHub Discussions) early. Promotion is a community decision.

## Where to put your Experiment

- **Upstream contribution to `WordPress/ai`**: PR adding `includes/Experiments/My_Experiment/My_Experiment.php` and `includes/Abilities/My_Experiment/My_Experiment.php`. Follow the contributor guide (`CONTRIBUTING.md`); AI-authored code requires explicit disclosure per the AI Authorship guidelines.
- **Downstream plugin extending the AI plugin**: your own plugin normally registers an instance on `wpai_register_features`; use `wpai_default_feature_classes` when class-list mutation is the requirement. Treat the AI plugin as an optional dependency and gate every entry point.

The downstream pattern is what most agencies and hosts will use. Upstream contribution is for Experiments general enough to belong in the canonical plugin.
