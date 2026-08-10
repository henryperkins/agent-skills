---
name: wp-ai-client
description: "Use when building provider-agnostic AI features in a WordPress plugin or theme with the WP 7.0+ AI Client, or when a task involves standalone `wordpress/php-ai-client` 1.4+ embeddings. Triggers include text/image/speech/video generation, vector embeddings, semantic search, prompt builders, model preferences, feature detection, REST endpoints, and AI Client ability function calling."
compatibility: "Targets WordPress 7.0+ (PHP 7.4+). Filesystem-based agent with bash + node. Some workflows require WP-CLI."
license: GPL-2.0-or-later
---

# WP AI Client

## When to use

Use this skill when the task involves:

- adding an AI-powered feature (text, image, speech, video generation) to a plugin or theme on WP 7.0+,
- building embeddings for semantic search, clustering, or similarity with standalone `wordpress/php-ai-client` 1.4+ while respecting the Core-bundled version boundary,
- replacing direct calls to OpenAI/Anthropic/Google SDKs with the provider-agnostic in-core API,
- migrating from the standalone `wordpress/php-ai-client` or `wordpress/wp-ai-client` Composer packages now that 7.0 bundles them,
- exposing an AI feature to the block editor or custom JS via a REST endpoint,
- diagnosing "the model isn't responding" / "no provider configured" / "feature shows but never works".

If the task is to write a *provider plugin* (e.g., adding a new AI service), route to `wp-ai-connectors` instead.

## Inputs required

- Repo root (run `wordpress-router` and `wp-project-triage` first).
- Target WP version: this skill is **WP 7.0+ only**. If the project must support 6.x, see the migration section in `references/prompt-builder.md`.
- Whether the feature runs server-side (PHP only), client-side (JS), or both.
- Which modality is needed (text / image / speech / video / embedding), and whether the code runs through WordPress Core or the standalone SDK.

## Procedure

### 0) Triage and confirm WP 7.0+

1. Run project triage if available (`node ../wp-project-triage/scripts/detect_wp_project.mjs` when the `wp-project-triage` skill is installed alongside); otherwise classify the project manually.
2. Detect AI Client availability: `node scripts/detect_ai_client.mjs`

If the project's `Requires at least` is `< 7.0`, decide: bump the requirement (recommended), or use the conditional autoloader pattern in `references/prompt-builder.md#migration` to keep older versions working.

### 1) Check feature support before showing UI

Never assume an AI feature will work just because WP 7.0 is installed — site owners may have no provider configured, or their provider may not support every modality. Use `is_supported_for_*()` builder methods, which run synchronously and incur no API cost:

```php
$builder = wp_ai_client_prompt( 'test' )->using_temperature( 0.7 );
if ( ! $builder->is_supported_for_text_generation() ) {
    return; // Skip registering UI.
}
```

Conditionally enqueue scripts, hide blocks, or render a notice based on this check. See `references/prompt-builder.md#feature-detection` for all support methods.

### 2) Build the prompt with the fluent builder

Entry point is `wp_ai_client_prompt( $optional_text )`, which returns a `WP_AI_Client_Prompt_Builder`. Chain configuration, then call a generator:

```php
$result = wp_ai_client_prompt( 'Summarize the following post.' )
    ->using_system_instruction( 'You are a concise WordPress editor.' )
    ->using_temperature( 0.3 )
    ->using_model_preference( 'claude-sonnet-4-6', 'gpt-5.4', 'gemini-3.1-pro-preview' )
    ->generate_text_result();
```

Model preferences are *preferences*, not requirements. The Client falls back to any compatible model. The model IDs shown above (`claude-sonnet-4-6`, etc.) are **illustrative** — pass whatever IDs your configured providers actually advertise. See `references/prompt-builder.md` for the full method list (with_text/with_file/with_history, using_max_tokens/top_p/top_k/stop_sequences, as_json_response, as_output_modalities).

### 3) Expose to JS via a per-feature REST endpoint

Do **not** use the client-side JS prompt API in distributed plugins — its REST route is gated behind the `prompt_ai` capability (granted to administrators by default) and lets the caller send any prompt to any configured provider. Instead, register a REST endpoint scoped to your single feature, with a tight permission callback:

```php
register_rest_route( 'my-plugin/v1', '/summarize', array(
    'methods'             => 'POST',
    'permission_callback' => fn() => current_user_can( 'edit_posts' ),
    'callback'            => 'my_plugin_rest_summarize',
    'args'                => array(
        'content' => array( 'required' => true, 'type' => 'string' ),
    ),
) );

function my_plugin_rest_summarize( WP_REST_Request $request ) {
    $result = wp_ai_client_prompt( 'Summarize: ' . $request->get_param( 'content' ) )
        ->generate_text_result();
    return rest_ensure_response( $result );
}
```

`GenerativeAiResult` and `WP_Error` both serialize cleanly through `rest_ensure_response()`, with the right HTTP status code attached automatically on errors. See `references/rest-patterns.md`.

### 4) Handle errors

Generator methods return `WP_Error` on SDK failures — the wrapper converts caught `Exception`s to `WP_Error` (but **not** an argument `TypeError`; match the signatures in `references/prompt-builder.md`). Always check:

```php
$result = wp_ai_client_prompt( 'Summarize this text.' )
    ->with_text( $text )
    ->generate_text_result();

if ( is_wp_error( $result ) ) {
    error_log(
        sprintf(
            'AI request failed [%s]: %s',
            $result->get_error_code(),
            $result->get_error_message()
        )
    );
    $upstream_data = $result->get_error_data();
    return $result;
}

$provider_metadata = $result->getProviderMetadata();
$model_metadata    = $result->getModelMetadata();
```

`WP_Error` has only its WordPress error accessors in this flow: use `get_error_code()`, `get_error_message()`, and `get_error_data()` on the error path. Call result metadata methods only after the `is_wp_error( $result )` branch proves that `$result` is a successful `GenerativeAiResult`.

The `wp_ai_client_prevent_prompt` filter lets you block specific prompts before they execute (useful for capability gating, content policies, dev-mode kill switches). See `references/error-handling.md`.

### 5) Credentials are someone else's problem

Do not handle API keys. The Connectors API (in core) reads keys from env var → PHP constant → database (in that order) and the **Settings → Connectors** screen surfaces them to admins. If you need to hint to site owners that no provider is set up, use feature detection (step 1) plus a link to `Settings → Connectors`.

### 6) Function calling: `using_abilities()` is the bridge to the Abilities API

If your feature needs the model to *call* something — read a post, update an attachment, classify content — pass registered ability IDs to `using_abilities()`. The AI Client converts them into function declarations the model can invoke; when the model calls one, execution routes back through the Abilities API's permission and execution machinery. This makes the AI Client agentic without writing function-calling boilerplate. Pair this with `wp-abilities-api` to define the abilities themselves.

```php
$result = wp_ai_client_prompt( 'Summarize the latest 5 posts.' )
    ->using_abilities( 'core/get-posts', 'core/get-post' )
    ->generate_text_result();
```

Abilities you pass must already be registered server-side via `wp_register_ability()`. Their `permission_callback` runs every time the model attempts to invoke them.

### 7) Use the Core resolver and timeout APIs when working below `using_abilities()`

`using_abilities()` is the normal high-level path. For low-level function-call handling, Core exposes `WP_AI_Client_Ability_Function_Resolver`. Its static conversion helpers round-trip an Ability ID to the AI-safe function name, and an instance allow-lists the Abilities it may execute:

```php
$function_name = WP_AI_Client_Ability_Function_Resolver::ability_name_to_function_name( 'my-plugin/lookup' );
$ability_name  = WP_AI_Client_Ability_Function_Resolver::function_name_to_ability_name( $function_name );

$resolver = new WP_AI_Client_Ability_Function_Resolver( 'my-plugin/lookup' );
$payload  = $resolver->execute_ability( $function_call )->getResponse();
```

For builders created after a global timeout policy is installed, use Core's real filter rather than a plugin-specific lookalike:

```php
add_filter( 'wp_ai_client_default_request_timeout', static fn(): float => 45.0 );
```

The filter fires during builder construction. Scope or remove it when the timeout should not remain process-wide.

## Verification

- `is_supported_for_*()` returns `true` in your test environment with at least one configured provider.
- Your REST endpoint returns the expected modality and a `GenerativeAiResult` payload (token usage, provider/model metadata visible).
- With the provider's API key removed/invalidated, `is_supported_*()` returns `false` and your UI gracefully hides or shows a useful notice.
- The `wp_ai_client_prevent_prompt` filter, if used, blocks calls without leaking the prompt content to logs.

## Failure modes / debugging

- **"AI feature shows but always errors"**: usually no provider configured. Confirm at least one provider plugin is active (`AI Provider for Anthropic|Google|OpenAI` or a community provider) and a key is set in Settings → Connectors.
- **`call to undefined function wp_ai_client_prompt()`**: site is on WP < 7.0. Either bump the floor or use the conditional autoloader pattern.
- **"Works for admin, fails for editors"**: the JS code is calling the high-privilege client-side prompt API instead of your scoped REST endpoint. Switch to a per-feature endpoint.
- **`WP_Error` with HTTP 4xx but no useful detail**: log its `get_error_code()`, `get_error_message()`, and `get_error_data()`. Do not call `getProviderMetadata()` or `getModelMetadata()` on a `WP_Error`.
- **Different model than expected ran**: `using_model_preference()` is a preference. Inspect `getProviderMetadata()` / `getModelMetadata()` on the result to see what actually answered.

## Bundled versus standalone PHP AI Client

WordPress 7.0.2 bundles PHP AI Client 1.3.1. Composer's standalone latest is PHP AI Client 1.4.0. Treat the Core-bundled version as the compatibility boundary: an API added only in the standalone package cannot be assumed available through Core until WordPress updates its bundled dependency.

**What 1.4.0 added, and therefore what Core does not yet expose:** embedding generation. Embeddings use a dedicated `EmbeddingBuilder` (`withInput()`, `usingDimensions()`, `generateEmbedding()`, `generateEmbeddings()`, `generateEmbeddingResult()`, `isSupported()`) plus the static `AiClient::generateEmbedding()`, `AiClient::generateEmbeddings()`, and `AiClient::generateEmbeddingResult()` entry points. The builder shares `usingModel()`, `usingModelPreference()`, `usingModelConfig()`, `usingProvider()`, and `usingRequestOptions()` with the prompt builder through `ModelResolutionTrait`. It returns concrete `Embedding` / `EmbeddingResult` DTOs and dispatches `BeforeGenerateEmbeddingEvent` / `AfterGenerateEmbeddingEvent` when a PSR event dispatcher is configured. `EmbeddingList` is a PHPStan alias for `list<float|int>`, not a value-object class. Inputs are message parts — strings, `File`s, or parts — not conversations, matching how providers treat embeddings as a separate API.

If a task calls for embeddings (semantic search, clustering, similarity), you cannot reach them through `wp_ai_client_prompt()` on WP 7.0.2. Do not load an unprefixed standalone `wordpress/php-ai-client` 1.4 beside Core's 1.3.1 copy; the duplicate namespaces are not a supported override path. Wait for Core to bump, isolate/prefix the newer dependency, or move embedding work to a separate service. In a standalone PHP application where Core is not loading the SDK, the entry point is `AiClient::input()`:

```php
use WordPress\AiClient\AiClient;

$builder = AiClient::input( 'PHP powers a large part of the web.' );
if ( ! $builder->isSupported() ) {
    throw new RuntimeException( 'No embedding model is available.' );
}

$values = $builder->generateEmbedding()->getValues();
```

Do not invent a `wp_ai_client_embedding()` wrapper — no such Core function exists. See `references/embedding-builder.md` for the complete standalone boundary and method contract.

Watch for this trap: `is_supported_for_embedding_generation()` shipped on the prompt builder back in 1.3.1, so it *is* reachable through Core and will happily return `true`. In 1.3.1 there is no corresponding generation method anywhere — not on the prompt builder, not on the client. The probe answers "this provider does embeddings", not "you can call them from here". Probe support and generate through the same package version.

## Escalation

For canonical detail before inventing patterns:

- AI Client dev note: https://make.wordpress.org/core/2026/03/24/introducing-the-ai-client-in-wordpress-7-0/
- PHP AI Client SDK source: https://github.com/WordPress/php-ai-client
- WP AI Client (REST/JS package): https://github.com/WordPress/wp-ai-client
- Trac ticket: https://core.trac.wordpress.org/ticket/64591

References:
- `references/prompt-builder.md`
- `references/embedding-builder.md`
- `references/rest-patterns.md`
- `references/error-handling.md`
