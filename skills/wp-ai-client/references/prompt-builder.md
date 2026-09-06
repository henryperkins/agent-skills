# `WP_AI_Client_Prompt_Builder` reference

Complete fluent API for the in-core AI Client (WP 7.0+).

## Entry point

```php
$builder = wp_ai_client_prompt( $optional_text = null );
```

Returns a `WP_AI_Client_Prompt_Builder`. Chain configuration methods, then call a generator. Passing prompt text directly is a shortcut for `->with_text( $text )`.

## Configuration methods

| Configuration | Method |
| --- | --- |
| Prompt text | `with_text( string )` |
| File input | `with_file( $file, ?string $mimeType = null )` |
| Conversation history (multi-turn) | `with_history( Message ...$messages )` |
| Function call response (multi-turn function calling) | `with_function_response( FunctionResponse )` |
| Pre-built message parts | `with_message_parts( MessagePart ...)` |
| System instruction | `using_system_instruction( string )` |
| Temperature | `using_temperature( float )` |
| Max tokens | `using_max_tokens( int )` |
| Top-p / Top-k | `using_top_p( float )`, `using_top_k( int )` |
| Stop sequences | `using_stop_sequences( string ...$sequences )` |
| Candidate count | `using_candidate_count( int )` |
| Model preference (ordered list) | `using_model_preference( ...$model_ids )` |
| Force a specific model | `using_model( ModelInterface )` |
| Model configuration object | `using_model_config( ModelConfig )` |
| Force a specific provider | `using_provider( string $providerIdOrClassName )` |
| Bind registered Abilities for function calling | `using_abilities( ...$ability_ids )` |
| Function declarations (manual) | `using_function_declarations( FunctionDeclaration ...)` |
| Web search configuration | `using_web_search( WebSearch )` |
| Presence / frequency penalties | `using_presence_penalty( float )`, `using_frequency_penalty( float )` |
| Request options (HTTP transport) | `using_request_options( RequestOptions )` |
| Top log probabilities | `using_top_logprobs( ?int )` |
| Output modalities | `as_output_modalities( ...$modality_enums )` |
| Output file type (image/audio/video) | `as_output_file_type( FileTypeEnum )` |
| Output media orientation | `as_output_media_orientation( MediaOrientationEnum )` |
| Output media aspect ratio | `as_output_media_aspect_ratio( string )` |
| Output speech voice | `as_output_speech_voice( string )` |
| Output MIME type | `as_output_mime_type( string )` |
| Output schema (raw JSON Schema) | `as_output_schema( array )` |
| Structured JSON response | `as_json_response( ?array $schema = null )` |

The skill's main SKILL.md and the dev note focus on the most-used subset (the first ~12 rows). The advanced rows above are real but rarely needed — they're documented here for completeness, not for everyday use.

### Function calling via the Abilities API

`using_abilities()` is the integration point between the AI Client and the Abilities API. Pass registered ability IDs (server-side abilities, registered via `wp_register_ability()`); each is converted into a `FunctionDeclaration` — name, description, input schema — and handed to `using_function_declarations()`.

Declaration is all it does. A `FunctionDeclaration` holds no callable, so the call below never executes an ability by itself: if the model chooses one, the result carries a function-call part and no `permission_callback` or `execute_callback` has run.

```php
// Single call — the model can REQUEST an ability here, but nothing executes.
$result = wp_ai_client_prompt( 'Summarize this site’s WordPress and PHP versions and whether the environment is production-ready.' )
    ->using_abilities( 'core/get-site-info', 'core/get-environment-info' )
    ->generate_text_result();
```

Those two IDs are real: Core 7.1 registers exactly `core/get-site-info`, `core/get-environment-info`, and `core/get-user-info`, and nothing else under `core/`. Any other ability ID in an example — `my-plugin/...` and the like — is a placeholder for one you register yourself; `execute_ability()` returns `ability_not_allowed` for anything the resolver was not constructed with, and `using_abilities()` cannot declare an ability that was never registered.

Running the requested ability and returning its output to the model requires `WP_AI_Client_Ability_Function_Resolver` and a second generation call. The abilities you pass must already be registered. See step 6 of the skill's `SKILL.md` for the full round trip, and the `wp-abilities-api` skill for the registration side.

## Generator methods

Each modality has a "raw" generator (returns the content directly) and a `*_result()` generator (returns a `GenerativeAiResult` with metadata).

### Text

```php
$text  = wp_ai_client_prompt( 'Write a haiku about WordPress.' )->generate_text();
$texts = wp_ai_client_prompt( 'Write a tagline.' )->generate_texts( 4 );  // 4 variants
$res   = wp_ai_client_prompt( $prompt )->generate_text_result();           // with metadata
```

### Image

```php
use WordPress\AiClient\Files\DTO\File;

$image  = wp_ai_client_prompt( 'A neon WordPress logo' )->generate_image();
$images = wp_ai_client_prompt( $prompt )->generate_images( 4 );
$res    = wp_ai_client_prompt( $prompt )->generate_image_result();
```

`generate_image()` returns a `File` DTO. Check `$image->isRemote()` first: `getDataUri()` is nullable and is usable only for a non-remote file, while `getUrl()` is nullable and is usable only for a remote file. Validate either representation before rendering or persist it through the bounded Media Library pattern in `rest-patterns.md`.

### Other modalities

- `generate_speech()` / `generate_speech_result()`
- `convert_text_to_speech()` / `convert_text_to_speech_result()`
- `generate_video()` / `generate_video_result()`
- `generate_result()` — multimodal, when `as_output_modalities()` includes more than one

## Structured output

Pass a JSON Schema and the model returns a JSON-encoded string matching it:

```php
$schema = array(
    'type'  => 'array',
    'items' => array(
        'type'       => 'object',
        'properties' => array(
            'plugin_name' => array( 'type' => 'string' ),
            'category'    => array( 'type' => 'string' ),
        ),
        'required' => array( 'plugin_name', 'category' ),
    ),
);

$json = wp_ai_client_prompt( 'List 5 popular WordPress plugins.' )
    ->as_json_response( $schema )
    ->generate_text();

$data = json_decode( $json, true );
```

## Multimodal output

```php
use WordPress\AiClient\Messages\Enums\ModalityEnum;

$result = wp_ai_client_prompt( 'Recipe for chocolate cake with step photos.' )
    ->as_output_modalities( ModalityEnum::text(), ModalityEnum::image() )
    ->generate_result();

foreach ( $result->toMessage()->getParts() as $part ) {
    if ( $part->getType()->isText() ) {
        echo wp_kses_post( $part->getText() );
    } elseif ( $part->getType()->isFile() && $part->getFile()->isImage() ) {
        $file = $part->getFile();
        $src  = $file->isRemote() ? $file->getUrl() : $file->getDataUri();

        if ( $file->isRemote() && is_string( $src ) && wp_http_validate_url( $src ) ) {
            echo '<img src="' . esc_url( $src ) . '">';
        } elseif (
            ! $file->isRemote()
            && is_string( $src )
            && preg_match( '#^data:image/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$#', $src )
        ) {
            // esc_url() rejects data: URIs; validate the complete shape first.
            echo '<img src="' . esc_attr( $src ) . '">';
        }
    }
}
```

The `isText()` / `isFile()` predicates live on the `MessagePartTypeEnum` returned by `$part->getType()`, **not** on `MessagePart` itself — `$part->isText()` raises `Error: Call to undefined method`. Use `$part->getType()->isText()`. The value accessors (`getText()`, `getFile()`) are on `MessagePart` directly.

## Feature detection

These methods are synchronous and never run your prompt — they match the builder's configuration against the models each registered provider advertises. They are not a local lookup, though. Resolving that model list probes every registered API-based provider over HTTP: providers built on `ListModelsApiBasedProviderAvailability` send a list-models request, cached 24h in the `wp_ai_client` object-cache group (filterable since WordPress 7.1 with `wp_ai_client_cache_group`; per-request only unless the site runs a persistent object cache), while providers built on `GenerateTextApiBasedProviderAvailability` send an uncached 1-token test generation on *every* check. Cache the boolean yourself, or run the check on admin/editor screens only — not on every front-end request and never inside a loop. Use them before showing UI:

- `is_supported_for_text_generation()`
- `is_supported_for_image_generation()`
- `is_supported_for_text_to_speech_conversion()`
- `is_supported_for_speech_generation()`
- `is_supported_for_video_generation()`
- `is_supported_for_music_generation()`
- `is_supported_for_embedding_generation()` — **probe only on Core.** WP 7.0 through 7.0.4 and 7.1 all bundle PHP AI Client 1.3.1, which has this method but no embedding generation path at all; generation arrived in standalone 1.4.0 as a separate `EmbeddingBuilder`. A `true` here does not mean you can generate an embedding through `wp_ai_client_prompt()`.
- `is_supported( ?CapabilityEnum $capability = null )` — general form, takes any capability enum

```php
$builder = wp_ai_client_prompt( 'test' )->using_temperature( 0.7 );
if ( ! $builder->is_supported_for_text_generation() ) {
    return; // No suitable model available; skip UI.
}
```

## `GenerativeAiResult`

Returned by `generate_*_result()` methods. Useful methods:

- `getTokenUsage()` — input/output (and optional thinking) token counts
- `getProviderMetadata()` — which provider handled this request
- `getModelMetadata()` — which model the provider routed to
- `toMessage()` — raw `Message` for multimodal inspection

The object is serializable; `rest_ensure_response( $result )` works directly in REST callbacks.

### Split `WP_Error` from successful results first

Every `generate_*_result()` call can instead return `WP_Error`. Branch on `is_wp_error( $result )` before metadata access. On errors, use only `get_error_code()`, `get_error_message()`, and `get_error_data()`; call `getProviderMetadata()` and `getModelMetadata()` only on the successful `GenerativeAiResult` branch.

## Architecture (worth knowing)

The AI Client is two layers:

1. **`wordpress/php-ai-client`** — the framework-agnostic PHP SDK, bundled into Core. WordPress 7.0 through 7.0.4 and 7.1 all bundle PHP AI Client 1.3.1 (`AiClient::VERSION`); the standalone Composer latest is PHP AI Client 1.4.0, so do not assume standalone-only additions are available in Core before WordPress updates its dependency. camelCase methods, throws exceptions.
2. **`WP_AI_Client_Prompt_Builder`** — Core's WordPress wrapper. snake_case methods, returns `WP_Error`, integrates with WordPress HTTP, the Connectors API, and the hooks system.

`wp_ai_client_prompt()` is the recommended entry point. It returns the wrapper, which catches SDK exceptions and converts them to `WP_Error` for you.

Embedding generation is not a prompt-builder operation. Standalone PHP AI Client 1.4 uses `AiClient::input()` and `EmbeddingBuilder`; see `embedding-builder.md`. Do not assume that standalone-only API is available from Core's bundled SDK.

**Argument-typing caveat.** The wrapper forwards your arguments to the SDK method unchanged and its `__call` only `catch`es `Exception`. Passing a wrong *type* — e.g. an `array` to `using_stop_sequences( string ...$sequences )` or `with_history( Message ...$messages )` — raises a PHP `TypeError`, which extends `Error`, **not** `Exception`, so it is *not* converted to `WP_Error` and will fatal. Match the signatures in the table above (the variadic methods take spread arguments / DTO objects, not arrays). By contrast, `using_model_preference( ...$models )` is tolerant of value *shape* — each argument may be a model-ID string, a `ModelInterface` instance, or a `[ provider_id, model_id ]` tuple; a malformed tuple raises `InvalidArgumentException` (an `Exception`, so it *is* converted to `WP_Error`), not a `TypeError`. The wrapper also defers errors: once any call in a chain throws, the instance enters an error state and later non-generating calls become no-ops; the `WP_Error` surfaces only when a generating method is called.

### A class-name nuance worth knowing

The dev note documents the Core 7.0 wrapper class as `WP_AI_Client_Prompt_Builder`. The deprecated, archived `wordpress/wp-ai-client` 0.4.0 package returns a different class name — `WordPress\AI_Client\Builders\Prompt_Builder_With_WP_Error`, a subclass of `WordPress\AI_Client\Builders\Prompt_Builder` that adds the `WP_Error` translation. The fluent method names are identical between the two; both proxy to the underlying `php-ai-client` SDK via `__call`. So:

- **Type hints in published code**: prefer interface-style typing over the concrete class name when possible. If you must reference the class, use `WP_AI_Client_Prompt_Builder` for Core 7.0+ and the fully-qualified plugin class for WP < 7.0 — handle both paths if your plugin supports both.
- **Method names**: identical across both for the common surface. The 0.4.0 wrapper proxies unknown methods to its installed SDK, so newer video or media-output calls may reach that SDK, but those names are absent from its documented surface and from `Prompt_Builder_With_WP_Error::$terminate_methods`; a failing terminal call can therefore return the builder instead of `WP_Error`. Do not treat that deprecated bridge as a stable compatibility promise.

## Migration

If your plugin used the standalone Composer packages before WordPress 7.0, remember that `wordpress/wp-ai-client` 0.4.0 is final, deprecated, and archived. Its 7.0+ REST routes, JavaScript API, and `prompt_ai` / `list_ai_providers_models` capability filters still run, but upstream's upgrade guide says to remove the package once the site requires WordPress 7.0+.

### Recommended: bump to WP 7.0

Update your plugin header to `Requires at least: 7.0` and remove the Composer dependencies on `wordpress/php-ai-client` and its transitive deps. Replace `AI_Client::prompt()` calls with `wp_ai_client_prompt()`. Remove `wordpress/wp-ai-client` if you weren't using its REST/JS layer.

### If you must support WordPress < 7.0

Always load your plugin's own Composer autoloader; gating the entire `vendor/autoload.php` on `wp_ai_client_prompt()` also disables your own PSR-4 classes and unrelated dependencies on WordPress 7.0+. Never ship an unprefixed `wordpress/php-ai-client` beside Core's bundled SDK. Both autoloaders are lazy, so the main hazard is a mixed SDK: Core 1.3.1 uses scoped PSR namespaces while standalone 1.4.0 uses unscoped PSR namespaces, and one version's classes can load against the other's DTOs.

Choose one supported boundary:

- require WordPress 7.0+ and use Core's `wp_ai_client_prompt()`;
- for a distributed plugin that still supports 6.x, prefix/scope a tested standalone SDK with a tool such as PHP-Scoper or Strauss, and select the prefixed entry point only when Core's `\WordPress\AiClient\AiClient` is absent; or
- depend on the deprecated WP AI Client 0.4.0 plugin for its remaining pre-7.0 bridge while planning its removal.

Use `class_exists( \WordPress\AiClient\AiClient::class )` and `function_exists( 'wp_ai_client_prompt' )` to select an entry point after the normal plugin bootstrap has loaded. They are runtime feature gates, not conditions for loading all of your dependencies.

## Sources

- Dev note: https://make.wordpress.org/core/2026/03/24/introducing-the-ai-client-in-wordpress-7-0/
- PHP AI Client repo: https://github.com/WordPress/php-ai-client
- WP AI Client repo: https://github.com/WordPress/wp-ai-client
- `WP_AI_Client_Prompt_Builder` source — read it directly when in doubt about a method signature; the dev note is canonical for the public surface but the class is the source of truth.
