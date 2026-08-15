# Hooks, filters, constants, and gates

The public extension surface of the AI plugin v1.2.0, plus additions explicitly marked as unreleased on `develop`. Anchored to source — the source is canonical.

## Constants (v0.6.0+)

Defined in `ai.php` `constants()`. The 0.6.0 release renamed the family from `AIE_*` to `WPAI_*` (#317). Current values:

| Constant | Source | Use |
| --- | --- | --- |
| `WPAI_VERSION` | `'1.2.0'` (string literal) | Version detection in downstream code |
| `WPAI_PLUGIN_FILE` | `__FILE__` (ai.php) | The main plugin file path |
| `WPAI_PLUGIN_DIR` | `plugin_dir_path( WPAI_PLUGIN_FILE )` | Filesystem path to the plugin directory |
| `WPAI_PLUGIN_URL` | `plugin_dir_url( WPAI_PLUGIN_FILE )` | URL to the plugin directory (for asset references) |
| `WPAI_DEFAULT_ABILITY_CATEGORY` | `'ai-experiments'` | Default category for abilities registered by the plugin |

Use these in downstream plugins to detect the AI plugin's presence and version, and to reference its assets when integrating with its UI.

```php
if ( defined( 'WPAI_VERSION' ) && version_compare( WPAI_VERSION, '1.2.0', '>=' ) ) {
    // Use the current canonical AI plugin extension surface.
}
```

**Note**: earlier drafts of this skill referred to `WPAI_PATH`, `WPAI_URL`, `WPAI_FILE`. Those names are wrong. The actual constants are `WPAI_PLUGIN_DIR`, `WPAI_PLUGIN_URL`, `WPAI_PLUGIN_FILE`.

## Top-level functions

### `wp_supports_ai()` (v0.8.0+ usage)

The primary *global* gate. It returns `true` unless AI is turned off for the request — Core only checks the `WP_AI_SUPPORT` constant and the `wp_supports_ai` filter (`wp-includes/ai-client.php`). It does **not** check whether a provider is configured or a model is available; use the builder's `is_supported_for_*()` methods for provider/model readiness. The function is provided by Core (WP 7.0), not the AI plugin, so guard with `function_exists()`:

```php
if ( ! function_exists( 'wp_supports_ai' ) || ! wp_supports_ai() ) {
    return; // Don't initialize AI-dependent code.
}
```

The AI plugin uses this gate internally before initializing experiments (#268). Mirror it in your downstream code.

### Helper functions in `WordPress\AI` namespace

`includes/helpers.php` exposes utility functions used by the plugin's own Abilities. Useful ones for downstream extensions:

- `WordPress\AI\normalize_content( string $content ): string` — strips HTML, collapses whitespace, applies `wpai_pre_normalize_content` and `wpai_normalize_content` filters.
- `WordPress\AI\format_guidelines_for_prompt( array $categories, ?string $block_name = null ): string` — convenience wrapper around `Guidelines::get_instance()->format_for_prompt()`.
- `WordPress\AI\get_post_context( int $post_id ): array` — associative post-context array for prompts (callers read keys like `$context['content']`); it is **not** a pre-formatted string.
- `WordPress\AI\get_preferred_models_for_text_generation(): array` — returns the plugin's preferred model list for `using_model_preference()`.

These are namespaced functions in `WordPress\AI`. Import as `use function WordPress\AI\normalize_content;` (or use the fully qualified name).

## Filters

### Feature lifecycle

| Filter | Where | Default | Use |
| --- | --- | --- | --- |
| `wpai_default_feature_classes` | `Loader::get_default_features()` | array of built-in classes | Add or remove Feature class strings before instantiation |
| `wpai_features_enabled` | `Loader::initialize_features()` | `true` | Master kill switch for all features |
| `wpai_feature_{$id}_enabled` | `Abstract_Feature::is_enabled()` | option value | Per-feature override (force on/off in code) |
| `ai_experiments_experiment_{$id}_enabled` | `Abstract_Feature::is_enabled()` | option value | Deprecated (0.6.0), kept via `apply_filters_deprecated` for legacy compat. Note the doubled segment — the id is preceded by `experiment_`, unlike the modern `wpai_feature_{$id}_enabled` |

### The rest of the deprecated `ai_experiments_*` surface

The per-feature toggle above is the one you meet in `Abstract_Feature`, but it isn't the only survivor. `includes/Deprecated.php` shims **nine** more — seven filters and **two actions** — all tagged `'0.6.0'` and still firing in v1.2.0. Each maps to a modern replacement:

| Deprecated | Kind | Replacement |
| --- | --- | --- |
| `ai_experiments_pre_normalize_content` | filter | `wpai_pre_normalize_content` |
| `ai_experiments_normalize_content` | filter | `wpai_normalize_content` |
| `ai_experiments_preferred_models_for_text_generation` | filter | `wpai_preferred_text_models` |
| `ai_experiments_preferred_image_models` | filter | `wpai_preferred_image_models` |
| `ai_experiments_preferred_vision_models` | filter | `wpai_preferred_vision_models` |
| `ai_experiments_pre_has_valid_credentials_check` | filter | `wpai_pre_has_valid_credentials_check` |
| `ai_experiments_enabled` | filter | `wpai_features_enabled` |
| `ai_experiments_register_experiments` | **action** | `wpai_register_features` |
| `ai_experiments_initialized` | **action** | `wpai_features_initialized` |

Counting the `Abstract_Feature` toggle, that is **ten** legacy names still live. `wpai_summarization_min_content_length` is separately shimmed in `Summarization.php`.

Two details that matter when debugging:

- **The last two are actions, fired via `do_action_deprecated`.** They are the deprecated forms of the two hooks this skill documents as the primary downstream extension points. `add_filter( 'ai_experiments_register_experiments', … )` will not behave like the modern `wpai_register_features` action — grepping only for `apply_filters_deprecated` misses both.
- **Every shim is conditional.** Each is registered as a callback on its *modern* hook and guarded by `has_filter()` / `has_action()`, so the legacy name only fires when a legacy callback is actually attached. A silent legacy hook means nothing is listening, not that the shim was removed.

These fire a deprecation notice and are not a migration target — they exist so pre-0.6.0 code keeps working. Read them only when debugging why an old filter still appears to have an effect. Note that the in-tree `@todo` and the notice text both say "will be removed in v1.0"; they survived v1.0 and are still present in v1.2.0, so treat the stated removal target as unreliable in both directions.

### Guidelines

| Filter | Where | Default | Use |
| --- | --- | --- | --- |
| `wpai_use_guidelines` | `Guidelines::should_use_guidelines()` | `true` | Disable Guidelines integration entirely |
| `wpai_max_guideline_length` | `Guidelines::format_for_prompt()` | `5000` (chars) | Per-category truncation length |

### Requests and feature settings

| Filter | Where | Use |
| --- | --- | --- |
| `wpai_default_request_timeout` (v1.2.0+) | `includes/helpers.php` | Per-request timeout, filtered as `( int $default_timeout, string $feature_id )`; used for the image-generation request. ⚠️ The 1.2.0 changelog/`readme.txt` call this `wp_ai_client_default_request_timeout` — that name is in *no* plugin PHP (most likely the core AI Client's own filter); the plugin applies `wpai_default_request_timeout`. |
| `wpai_settings_feature_groups` | Settings → AI feature metadata | Extend or adjust feature groups |
| `wpai_settings_feature_metadata` | Settings → AI feature metadata | Extend metadata supplied by Features |
| `wpai_feature_{$id}_settings` | A Feature that explicitly applies the hook | Adjust that Feature's settings; this is not a universal framework hook (v1.2.0's Type Ahead Feature applies it) |

Advanced settings are Feature-provided metadata on the existing Settings → AI surface. These filters extend that data; they do not establish a separate public settings registry.

### Content normalization

| Filter | Where | Default | Use |
| --- | --- | --- | --- |
| `wpai_pre_normalize_content` | `WordPress\AI\normalize_content()` | input | Modify content before normalization |
| `wpai_normalize_content` | `WordPress\AI\normalize_content()` | output | Modify content after normalization |

### Content thresholds and capability detection (v1.1.0+)

| Filter | Where | Default | Use |
| --- | --- | --- | --- |
| `wpai_min_content_length` | `WordPress\AI\get_min_content_length()` | `250` (chars) | Per-feature minimum character count before content-dependent features enable; replaces the deprecated `wpai_summarization_min_content_length` |
| `wpai_has_image_generation_support` | `WordPress\AI\has_image_generation_support()` | auto-detected bool | Claim Image Generation support when auto-detection misses it (e.g., connectors authenticating without an API key, such as OAuth) |
| `wpai_is_{$connector_slug}_connector_configured` | AI Status dashboard widget | connector's detected bool | Correct dashboard status for connectors whose configuration cannot be inferred from API-key/OAuth data |
| `wpai_comment_moderation_moderate_guests` | Comment Moderation experiment | setting value (default yes) | Override whether guest comments are auto-moderated |
| `wpai_content_translation_languages` | `Content_Translation/Languages.php` | built-in language map | Add or remove target languages for Content Translation. Codes pass through `sanitize_key()`; entries with a non-string or empty label are dropped; a non-array return is ignored. `develop` only — not in 1.2.0 |

### Other `develop`-only hooks (unreleased after v1.2.0)

| Filter | Where | Use |
| --- | --- | --- |
| `wpai_gated_abilities` | `Abilities\Gated\Gated_Abilities::get_all()` | Add an `Abstract_Gated_Ability` to the set that registers when the `custom-abilities` Experiment is on. This is also the hook that makes the read/utility Abilities conditional — see `references/experiments-framework.md` |
| `wpai_remove_data_on_uninstall` | uninstall routine | Opt in/out of deleting plugin data on uninstall |
| `wpai_slug_generation_number_of_suggestions` | Slug Generation experiment | How many slug suggestions to request |
| `wpai_content_classification_candidate_pool_size` | Content Classification experiment | Size of the candidate term pool before ranking |

### Global Ability system instruction (v1.2.0+)

The global `wpai_system_instruction` hook ships in v1.2.0. It runs after Guidelines are appended and filters the final system instruction for every `Abstract_Ability`:

```php
apply_filters( 'wpai_system_instruction', string $instruction, string $name, array $data );
```

It is not Ability-ID-scoped; inspect `$name` and `$data` when a change should apply selectively.

### Ability-scoped prompt filters (`develop`, unreleased after v1.2.0)

Commit `1aabfe3` / PR #770 added uniform Ability-scoped prompt extension points to `Abstract_Ability` after the v1.2.0 tag. Do not recommend these scoped hooks for a site pinned to v1.2.0.

| Filter | Filtered value | Additional arguments |
| --- | --- | --- |
| `wpai_{$ability_slug}_system_instruction` | Ability-scoped system-instruction string | Data array |
| `wpai_{$ability_slug}_prompt` | Ability-scoped prompt string | Ability-defined context arguments |
| `wpai_{$ability_slug}_prompt_builder` | Configured prompt builder | Same ability-defined context arguments |

The slug strips `ai/` and replaces hyphens with underscores; `ai/title-generation` becomes `title_generation`. The prompt-builder filter runs after model preference configuration and must return the builder object it receives; invalid returns fall back to the original builder. Individual Abilities may also add their own `apply_filters()` calls — grep to find them:

```bash
grep -rn "apply_filters" wp-content/plugins/ai/includes/Abilities/
```

That gives you every Ability-level filter with file/line context.

## Actions

| Action | Where | Use |
| --- | --- | --- |
| `wpai_register_features` | `Loader::register_features()` | Primary downstream entry point: register a Feature instance into the registry |
| `wpai_features_initialized` | `Loader::initialize_features()` | Fires after every enabled Feature's `register()` has run; safe to assume features are wired up |

The plugin also fires the standard WordPress activation hook via `register_activation_hook( WPAI_PLUGIN_FILE, ... )`, which downstream code generally shouldn't depend on (use your own activation hook for your own plugin).

## Hook timing

The AI plugin bootstraps via `WordPress\AI\Main::get_instance()`, called at the bottom of `ai.php`. Main hooks subsequent setup on standard WordPress lifecycle. From an extension perspective:

- **`plugins_loaded` priority 10**: safe to register `wpai_default_feature_classes` filter and `wpai_register_features` action callbacks. Both fire later, but registering early ensures you're attached.
- **`init` priority 5**: also safe and used by AI provider plugins for the AI Client registry. AI plugin-specific hooks are not version-gated by `init`.
- **Inside any action that the AI plugin's Loader fires**: too late for `wpai_default_feature_classes` and `wpai_register_features` (they've already run). Use `wpai_features_initialized` if you need to react after features are wired up.

The AI plugin's `Loader::register_features()` runs once per request, early in the bootstrap. If your downstream filter registers conditionally (e.g., based on user role), the registration only happens for that request — site admins will see the feature when they're admins, others won't. That's by design.

## Reading the source for the latest

The hook surface evolves. To get the current authoritative list:

```bash
# In the AI plugin root
grep -rn "apply_filters\|do_action" includes/ | grep -v "@since\|@param" | sort -u
```

That gives you every filter and action with file/line context. The Experiment classes (`includes/Experiments/`) are usually where the most interesting integration points live — search there first when looking for ways to customize a specific feature.

## What not to do

- **Don't replace `Abstract_Feature` with your own base class.** The framework hooks are wired into that hierarchy; subclassing it is the supported path.
- **Don't write to `WPAI_*` constants.** They're set during the plugin's bootstrap; modifying them has no effect after that and creates "why isn't this taking?" debugging confusion.
- **Don't rely on filters that fire only inside private methods.** They may be removed without notice. Stick to the documented public extension surface.
- **Don't assume backward compatibility across 0.x releases.** The plugin is explicitly experimental; renames and reshapes happen. Pin your minimum version requirement (`WPAI_VERSION` check) and test against the next release before recommending it to users.
