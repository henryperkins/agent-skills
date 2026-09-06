# Hooks, filters, constants, and gates

The public extension surface of the AI plugin v1.3.0, anchored to the tagged executable source.

## Constants (v0.6.0+)

Defined in `ai.php` `constants()`. The 0.6.0 release renamed the family from `AI_EXPERIMENTS_*` to `WPAI_*` (#317). Current values:

| Constant | Source | Use |
| --- | --- | --- |
| `WPAI_VERSION` | `'1.3.0'` (string literal) | Version detection in downstream code |
| `WPAI_PLUGIN_FILE` | `__FILE__` (ai.php) | The main plugin file path |
| `WPAI_PLUGIN_DIR` | `plugin_dir_path( WPAI_PLUGIN_FILE )` | Filesystem path to the plugin directory |
| `WPAI_PLUGIN_URL` | `plugin_dir_url( WPAI_PLUGIN_FILE )` | URL to the plugin directory (for asset references) |
| `WPAI_DEFAULT_ABILITY_CATEGORY` | `'ai-experiments'` | Default category for abilities registered by the plugin |

Use these in downstream plugins to detect the AI plugin's presence and version, and to reference its assets when integrating with its UI.

```php
if ( defined( 'WPAI_VERSION' ) && version_compare( WPAI_VERSION, '1.3.0', '>=' ) ) {
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

AI plugin 1.3.0 treats a false result as a whole-plugin requirement failure on `plugins_loaded`: `Main::load()` returns before `includes/helpers.php` is loaded or any feature, settings, dashboard, or Site Health hooks are registered.

The AI plugin uses this gate internally before initializing experiments (#268). Mirror it in your downstream code.

### Helper functions in `WordPress\AI` namespace

`includes/helpers.php` exposes utility functions used by the plugin's own Abilities. Useful ones for downstream extensions:

- `WordPress\AI\normalize_content( string $content ): string` — strips HTML, collapses whitespace, applies `wpai_pre_normalize_content` and `wpai_normalize_content` filters.
- `WordPress\AI\format_guidelines_for_prompt( array $categories, ?string $block_name = null ): string` — convenience wrapper around `Guidelines::get_instance()->format_for_prompt()`.
- `WordPress\AI\get_post_context( int $post_id ): array` — associative post-context array for prompts (callers read keys like `$context['content']`); it is **not** a pre-formatted string.
- `WordPress\AI\get_preferred_models_for_text_generation(): array` — returns the plugin's preferred model list for `using_model_preference()`.
- `WordPress\AI\log_ai_request()` — public v1.3.0 API for MCP servers and Ability consumers. It accepts `array $data` and returns `string|false`; the result is false while request logging is inactive or the write fails. Required data includes `type`, `operation`, and `status`.
- `WordPress\AI\supports_embedding_generation(): bool` and `WordPress\AI\generate_embeddings()` — declared in v1.3.0, but unavailable on stock WordPress 7.1 because `SDK_Overlay::register()` is commented out in `ai.php`. Without `EmbeddingBuilder`, support is false and generation returns `WP_Error` code `ai_embeddings_unsupported`. Feature-detect at runtime.

These are namespaced functions in `WordPress\AI`. Import as `use function WordPress\AI\normalize_content;` (or use the fully qualified name).

## Filters

### Feature lifecycle

| Filter | Where | Default | Use |
| --- | --- | --- | --- |
| `wpai_default_feature_classes` | `Loader::get_default_features()` | array of built-in classes | Add or remove Feature class strings before instantiation |
| `wpai_features_enabled` | `Loader::initialize_features()` | `true` | Master kill switch for all features |
| `wpai_feature_{$id}_enabled` | `Abstract_Feature::is_individually_enabled()` | option value | Per-feature override (force on/off in code) |
| `ai_experiments_experiment_{$id}_enabled` | `Abstract_Feature::is_individually_enabled()` | option value | Deprecated (0.6.0), kept via `apply_filters_deprecated` for legacy compat. Note the doubled segment — the id is preceded by `experiment_`, unlike the modern `wpai_feature_{$id}_enabled` |

### The rest of the deprecated `ai_experiments_*` surface

The per-feature toggle above is the one you meet in `Abstract_Feature`, but it isn't the only survivor. `includes/Deprecated.php` shims **nine** more — seven filters and **two actions** — all tagged `'0.6.0'` and still firing in v1.3.0. Each maps to a modern replacement:

| Deprecated | Kind | Replacement |
| --- | --- | --- |
| `ai_experiments_pre_normalize_content` | filter | `wpai_pre_normalize_content` |
| `ai_experiments_normalize_content` | filter | `wpai_normalize_content` |
| `ai_experiments_preferred_models_for_text_generation` | filter | `wpai_preferred_text_models` (active — see below) |
| `ai_experiments_preferred_image_models` | filter | `wpai_preferred_image_models` (active — see below) |
| `ai_experiments_preferred_vision_models` | filter | `wpai_preferred_vision_models` (active — see below) |
| `ai_experiments_pre_has_valid_credentials_check` | filter | `wpai_pre_has_valid_credentials_check` |
| `ai_experiments_enabled` | filter | `wpai_features_enabled` |
| `ai_experiments_register_experiments` | **action** | `wpai_register_features` |
| `ai_experiments_initialized` | **action** | `wpai_features_initialized` |

Counting the `Abstract_Feature` toggle, that is **ten** legacy names still live. `wpai_summarization_min_content_length` is separately shimmed in `Summarization.php`.

Two details that matter when debugging:

- **The last two are actions, fired via `do_action_deprecated`.** They are the deprecated forms of the two hooks this skill documents as the primary downstream extension points. `add_filter( 'ai_experiments_register_experiments', … )` will not behave like the modern `wpai_register_features` action — grepping only for `apply_filters_deprecated` misses both.
- **Every shim is conditional.** Each is registered as a callback on its *modern* hook and guarded by `has_filter()` / `has_action()`, so the legacy name only fires when a legacy callback is actually attached. A silent legacy hook means nothing is listening, not that the shim was removed.

These fire a deprecation notice and are not a migration target — they exist so pre-0.6.0 code keeps working. Read them only when debugging why an old filter still appears to have an effect. The in-tree `@todo` and notice say "will be removed in v1.0"; they survive in v1.3.0, so treat that removal target as stale.

### Preferred model selection

These three are **active** filters in v1.3.0 — plain `apply_filters()` in `includes/helpers.php`, with no `@deprecated` tag. Only their `ai_experiments_*` aliases (table above) are deprecated. Do not read the presence of an alias as evidence that the modern name is going away.

| Hook | Filtered value and additional arguments |
| --- | --- |
| `wpai_preferred_text_models` | `$preferred_models` — `helpers.php:227`, in `get_preferred_models_for_text_generation()`; `@since 0.2.1` |
| `wpai_preferred_image_models` | `$preferred_models` — `helpers.php:300`, in `get_preferred_image_models()`; `@since 0.2.0` |
| `wpai_preferred_vision_models` | `$preferred_models` — `helpers.php:342`, in `get_preferred_vision_models()`; `@since 0.3.0` |

Each returned array is cast with `(array)`. The deprecated aliases are conditional shims registered *onto* these hooks and guarded by `has_filter()`, so a legacy name fires only when something is listening to it.

### Request logging

Five filters and one action, all `@since 1.0.0`. Reachable only while the `ai-request-logging` Experiment is enabled — that Experiment is the sole production caller that instantiates the log manager.

| Hook | Filtered value and additional arguments |
| --- | --- |
| `wpai_request_log_retention_days` | `0` days by default — `Logging/AI_Request_Log_Manager.php:113` |
| `wpai_request_log_providers` | `$patterns` — `Logging/Log_Data_Extractor.php:77`; provider name → URL-pattern map derived from `wp_get_connectors()` |
| `wpai_request_log_context` | `$context, $decoded, $log_data` — `Logging/Log_Data_Extractor.php:179` |
| `wpai_request_log_tokens` | `array{input, output}, $response` — `Logging/Log_Data_Extractor.php:257`; lets a custom provider supply its own token extraction |
| `wpai_request_log_kind` | `'text', $provider, $path, $payload` — `Logging/Log_Data_Extractor.php:318` |

**Retention defaults to `0`, and `0` means retain forever.** It does not mean "clean up immediately". `AI_Request_Log_Manager` schedules its daily cleanup cron only when `get_retention_days() > 0`, and clears the scheduled hook when the value is `0`, so the default configuration accumulates request rows — including response previews — indefinitely. Return a positive integer (`30`, say) to enable time-based cleanup; return 0 to retain forever.

Two naming traps worth stating explicitly, because both have been miscounted before:

- `wpai_request_log_tokens` **is a filter**, not a data key. The data keys are `tokens_input` / `tokens_output`, the DB columns in `AI_Request_Log_Schema.php`. The hook and the columns are different things with similar names.
- `wpai_request_log_kind` is a **fallback only**. `detect_request_kind()` hard-returns `'image'`, `'metadata'`, `'embeddings'`, and `'audio'` before reaching it, so the filter never fires for those kinds.

The matching action, `wpai_request_logged( $log_id, $insert_data )`, is documented under "Actions" below.

### Comment moderation and analysis

| Hook | Filtered value and additional arguments |
| --- | --- |
| `wpai_comment_analysis_response_schema` | `$schema` — `Abilities/Comment_Moderation/Comment_Analysis.php:205`; the toxicity/sentiment JSON schema |
| `wpai_comment_analysis_result` | `null, $content, $author` — `Comment_Analysis.php:230`. A **pre-result short circuit**: returning an array skips the provider call entirely and the array is passed through `sanitize_analysis_result()`. Any non-array return is ignored |
| `wpai_comment_moderation_should_moderate` | `$should_moderate, $analysis, $comment_id` — `Experiments/Comment_Moderation/Comment_Moderation.php:406`; default is `toxicity_score >= 0.7 && 'negative' === $sentiment` |
| `wpai_comment_moderation_show_dashboard_pills` | `true, $comment_id, $comment` — `Comment_Moderation.php:498`; only fires on the dashboard screen |

### Content classification

Note that these live in **two** classes with the same name: the Experiments-side class holds the settings-derived values, the Abilities-side class holds the prompt and the parsed result.

| Hook | Filtered value and additional arguments |
| --- | --- |
| `wpai_content_classification_max_suggestions` | `$max_suggestions` — `Experiments/Content_Classification/Content_Classification.php:309`; re-sanitized after filtering, so an out-of-range return is clamped |
| `wpai_content_classification_strategy` | `$strategy` — `Experiments/Content_Classification/Content_Classification.php:284`; `existing_only` or `allow_new`, re-sanitized after filtering |
| `wpai_content_classification_prompt` | `$prompt, $context, $taxonomy, $assigned_terms, $available_terms` — `Abilities/Content_Classification/Content_Classification.php:400`. Five values total, so `add_filter()` needs `$accepted_args = 5` |
| `wpai_content_classification_suggestions` | `$suggestions, $taxonomy, $strategy` — `Abilities/Content_Classification/Content_Classification.php:440` |

### Meta description

Also split across an Experiments class (output) and Abilities classes (generation and storage).

| Hook | Filtered value and additional arguments |
| --- | --- |
| `wpai_meta_description` | `$meta_description` — `Experiments/Meta_Description/Meta_Description.php:209`. Returning an empty string suppresses output |
| `wpai_meta_description_prompt` | `$prompt, $content, $title` — `Abilities/Meta_Description/Meta_Description.php:262` |
| `wpai_meta_description_meta_key` | `$key, $plugin_slug` — `Abilities/Meta_Description/SEO_Integration.php:126`; `$plugin_slug` may be `null` when no SEO plugin was detected |
| `wpai_meta_description_seo_plugins` | `$plugins` — `Abilities/Meta_Description/SEO_Integration.php:67`; slug → `{file, meta_key}` detection map |

### Abilities, posts, and generated media

| Hook | Filtered value and additional arguments |
| --- | --- |
| `wpai_ability_category` | `$category_label, $slug` — `Experiments/Abilities_Explorer/Ability_Handler.php:152`. The filtered value is the category **label**, and `$slug` is the full ability name (`my-plugin/do-thing`), not the category slug |
| `wpai_get_post_details` | `$details, $post_id, $fields` — `Abilities/Utilities/Posts.php:305` |
| `wpai_get_post_terms` | `$terms, $post_id, $allowed_taxonomies` — `Abilities/Utilities/Posts.php:382`. Receives `WP_Term` objects; the result is mapped to arrays afterwards |
| `wpai_generated_image_filename` | `$args['filename'], $args` — `Abilities/Image/Import_Base64_Image.php:278`. Base filename **without** extension; the return is run through `sanitize_file_name()` and the extension is derived independently from the MIME type, so a filter cannot change either |

### Guidelines

| Filter | Where | Default | Use |
| --- | --- | --- | --- |
| `wpai_use_guidelines` | `Guidelines::should_use_guidelines()` | `true` | Disable Guidelines integration entirely |
| `wpai_max_guideline_length` | `Guidelines::format_for_prompt()` | `5000` (chars) | Per-category truncation length |

### Requests and feature settings

| Filter | Where | Use |
| --- | --- | --- |
| `wpai_default_request_timeout` (v1.2.0+) | `includes/helpers.php` | Plugin helper filter `( int $default_timeout, string $feature_id )`; helper default `30`, while Image Generation changes the image-generation default to `90`. The Core filter is `wp_ai_client_default_request_timeout`, takes one float value, and has default `30.0`. |
| `wpai_settings_feature_groups` | Settings → AI feature metadata | Extend or adjust feature groups |
| `wpai_settings_feature_metadata` | Settings → AI feature metadata | Extend metadata supplied by Features; receives `$metadata, $registry` |
| `wpai_feature_{$id}_settings` | A Feature that explicitly applies the hook | Adjust that Feature's settings; this is not universal (v1.3.0's Type Ahead Experiment applies it, and has since v1.1.0) |
| `wpai_bulk_action_max_items` (v1.3.0+) | `get_bulk_action_max_items()` | Maximum items per bulk action as `( int $max_items, string $feature_id )`; default 100 and clamped to at least 1 |

Advanced settings are Feature-provided metadata on the existing Settings → AI surface. These filters extend that data; they do not establish a separate public settings registry.

### Content normalization

| Filter | Where | Default | Use |
| --- | --- | --- | --- |
| `wpai_pre_normalize_content` | `WordPress\AI\normalize_content()` | input | Modify content before normalization |
| `wpai_normalize_content` | `WordPress\AI\normalize_content()` | output | Modify content after normalization |

### Content thresholds and capability detection

Version-marked per row — these did not all arrive together.

| Filter | Where | Default | Use |
| --- | --- | --- | --- |
| `wpai_min_content_length` (v1.1.0+) | `WordPress\AI\get_min_content_length()` | helper default `250`; Editorial Notes passes `75`, Content Resizing `25`, Content Translation `5` | Per-feature minimum character count; replaces the deprecated `wpai_summarization_min_content_length` |
| `wpai_has_image_generation_support` (v1.1.0+) | `WordPress\AI\has_image_generation_support()` | auto-detected bool | Receives `( bool $has_support, array $connectors )`; claim support when auto-detection misses it (for example, OAuth) |
| `wpai_pre_has_valid_credentials_check` | `WordPress\AI\has_valid_ai_credentials()` | `null` | Receives one `bool|null` value. Any non-null result short-circuits the live `is_supported_for_text_generation()` probe; `null` preserves the probe. |
| `wpai_has_ai_credentials` (v0.7.0+) | `WordPress\AI\has_ai_credentials()` | auto-detected bool | The credential-detection sibling of the row above, filtered as `( bool $has_credentials, array $connectors )`. The detection loop skips every connector whose auth method isn't `api_key`, so an OAuth connector must claim itself here or the site reads as unconfigured — it gates the AI Status widget's "Configure an AI provider" step, Settings → AI's `hasCredentials`, and Comment Moderation's provider check |
| `wpai_is_{$connector_slug}_connector_configured` (v0.9.0+) | AI Status dashboard widget | connector's detected bool | Correct dashboard status for connectors whose configuration cannot be inferred from API-key/OAuth data; filtered as `( bool $configured, array $connector_data )` |
| `wpai_comment_moderation_moderate_guests` (v1.1.0+) | Comment Moderation experiment | setting value (default yes) | Override whether guest comments are auto-moderated |
| `wpai_content_translation_languages` (v1.3.0+) | `Content_Translation/Languages.php` | built-in language map | Add or remove target languages. Codes pass through `sanitize_key()`; invalid labels are dropped and a non-array return is ignored |

### WordPress/ai 1.3.0 filters

| Filter | Signature/default | Use |
| --- | --- | --- |
| `wpai_gated_abilities` | array of class strings extending `Abstract_Gated_Ability` | Add/remove/replace the classes that register only while Custom Abilities is on |
| `wpai_remove_data_on_uninstall` | bool, default true | Preserve plugin data on deletion by returning false; evaluated per site on multisite |
| `wpai_slug_generation_number_of_suggestions` | int, default 3; clamped 1–10 | Control slug suggestions |
| `wpai_content_classification_available_terms` | `( array $terms, string $taxonomy, string $strategy )` | Replace/suppress the candidate terms placed in the prompt |
| `wpai_content_classification_min_confidence` | `( float $threshold, string $taxonomy, string $strategy )`; default 0.6, clamped 0–1 | Drop low-confidence suggestions before sorting/limiting |
| `wpai_content_classification_candidate_pool_size` | `( int $limit, string $taxonomy )`; default 100 and non-positive falls back to 100 | Bound existing terms fetched for the candidate pool |
| `wpai_alt_text_allowed_image_mime_types` | list of MIME types | Restrict safe/provider-supported image types accepted from custom references |
| `wpai_alt_text_image_download_timeout` | `( int $seconds, string $url )`; default 30 | Bound remote image download time |
| `wpai_alt_text_image_max_download_bytes` | `( int $bytes, string $url )`; default 20 MiB | Bound remote image size |

### Global Ability system instruction (v0.7.0+)

The global `wpai_system_instruction` hook ships in v0.7.0 (`@since 0.7.0` on `Abstract_Ability::get_system_instruction()`, unchanged through v1.3.0). It runs after Guidelines are appended and filters the final system instruction for every `Abstract_Ability`:

```php
apply_filters( 'wpai_system_instruction', string $instruction, string $name, array $data );
```

It is not Ability-ID-scoped; inspect `$name` and `$data` when a change should apply selectively.

### Ability-scoped prompt filters (v1.3.0+)

PR #770 added uniform Ability-scoped prompt extension points to `Abstract_Ability`; they ship in v1.3.0.

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

## 1.3.0 migrations and deprecations

- The upgrade routine renames `ai_generated` → `wpai_generated`, `ai_generated_summary` → `wpai_generated_summary`, and comment meta `ai_note` → `wpai_note`. If the destination already exists it is authoritative and the old duplicate is removed.
- `WordPress\AI\Services\AI_Service` and `WordPress\AI\get_ai_service()` are deprecated; call `wp_ai_client_prompt()` directly.
- `wpai_meta_description_result_temperature` fires only through `apply_filters_deprecated()` and its value is unused. Remove integrations instead of migrating to another temperature hook.
- Settings import/export ships at `GET /wp-json/ai/v1/settings/export` and `POST /wp-json/ai/v1/settings/import`. Both require `manage_options`, use schema version 1, and exclude option-name segments indicating keys, tokens, secrets, credentials, passwords, or auth.

## 1.3.0 security boundaries

- Bulk Alt Text and Summarization requests require their nonce; do not bypass the built-in handlers with an unauthenticated proxy.
- Custom image URLs for Alt Text Generation must remain public, preserve the verified final URL, use an allowed MIME type, and obey the timeout/size filters above. The XML/prompt wrapper is not a substitute for URL validation.
- Sanitize content sent to or rendered from an LLM in the context where it is used, and escape admin output. Do not treat a model response as trusted HTML.

## Actions

| Action | Where | Use |
| --- | --- | --- |
| `wpai_register_features` | `Loader::register_features()` | Primary downstream entry point: register a Feature instance into the registry |
| `wpai_features_initialized` | `Loader::initialize_features()` | Fires after every enabled Feature's `register()` has run; safe to assume features are wired up |
| `wpai_request_logged` (v1.0.0+) | `AI_Request_Log_Repository::insert()` | Fires after a request row is inserted, as `( string $log_id, array $insert_data )` — `$log_id` is a `wp_generate_uuid4()` string, not an insert ID. Only reachable while the `ai-request-logging` Experiment is enabled; that Experiment is the sole production caller that instantiates the log manager |

The plugin also fires the standard WordPress activation hook via `register_activation_hook( WPAI_PLUGIN_FILE, ... )`, which downstream code generally shouldn't depend on (use your own activation hook for your own plugin).

## Hook timing

The AI plugin bootstraps via `WordPress\AI\Main::get_instance()`, called at the bottom of `ai.php`. Main hooks subsequent setup on standard WordPress lifecycle. From an extension perspective:

- **`plugins_loaded` priority 10**: safe to register `wpai_default_feature_classes` filter and `wpai_register_features` action callbacks. Both fire later, but registering early ensures you're attached.
- **`init` priority 5**: also safe and used by AI provider plugins for the AI Client registry. AI plugin-specific hooks are not version-gated by `init`.
- **Inside any action that the AI plugin's Loader fires**: too late for `wpai_default_feature_classes` and `wpai_register_features` (they've already run). Use `wpai_features_initialized` if you need to react after features are wired up.

The AI plugin's `Loader::register_features()` runs once per request on `init` priority 15. If your downstream filter registers conditionally (e.g., based on user role), the registration only happens for that request — site admins will see the feature when they're admins, others won't. That's by design.

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
