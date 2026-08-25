---
name: wp-ai-client
description: "Use when building provider-agnostic AI features in a WordPress plugin or theme with the WP 7.0+ AI Client, or when a task involves standalone `wordpress/php-ai-client` 1.4+ embeddings. Triggers include text/image/speech/video generation, vector embeddings, semantic search, prompt builders, model preferences, feature detection, REST endpoints, and AI Client ability function calling."
compatibility: "Targets WordPress 7.0+ (PHP 7.4+); WordPress Core verified through: 7.1; PHP AI Client verified through: 1.4.0 standalone (Core-bundled: 1.3.1); WP AI Client verified through: 0.4.0 standalone. Filesystem-based agent with bash + node. Some workflows require WP-CLI."
license: GPL-2.0-or-later
---

# WP AI Client

## When to use

Use this skill when the task involves:

- adding an AI-powered feature (text, image, speech, video generation) to a plugin or theme on WP 7.0+,
- building embeddings for semantic search, clustering, or similarity with standalone `wordpress/php-ai-client` 1.4+ while respecting the Core-bundled version boundary,
- replacing direct calls to OpenAI/Anthropic/Google SDKs with the provider-agnostic in-core API,
- dropping a standalone `wordpress/php-ai-client` dependency now that 7.0 bundles it as `src/wp-includes/php-ai-client/`, reached through `wp_ai_client_prompt()`,
- deciding what to do about `wordpress/wp-ai-client`, which Core does **not** bundle — there is no `src/wp-includes/wp-ai-client/` at 7.0 or 7.1, so if you want its REST/JS layer it stays a separate plugin/Composer package (0.4.x) you install yourself,
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

Never assume an AI feature will work just because WP 7.0 is installed — the site may have AI switched off outright, may have no provider configured, or its provider may not support every modality.

Check the global switch first. `wp_supports_ai()` (**WP 7.0+**, in `wp-includes/ai-client.php`) returns `false` when `WP_AI_SUPPORT` is defined falsy or the `wp_supports_ai` filter says so, and the builder consults it on every support check and every generator call: with it off, `is_supported_for_*()` returns `false` and generators return `WP_Error` code `prompt_prevented` with status 503, without an API call. Then narrow with the `is_supported_for_*()` builder methods:

```php
if ( ! function_exists( 'wp_supports_ai' ) || ! wp_supports_ai() ) {
    return; // WP < 7.0, or AI is disabled for this environment/request.
}

$builder = wp_ai_client_prompt( 'test' )->using_temperature( 0.7 );
if ( ! $builder->is_supported_for_text_generation() ) {
    return; // Skip registering UI.
}
```

`is_supported_for_*()` never runs your prompt, but it is not a local lookup either: resolving the model list probes each registered API-based provider over HTTP — for most, a list-models request cached 24h in the `wp_ai_client` object-cache group, which is per-request unless the site runs a persistent object cache. Don't call it on every front-end page load or inside a loop; cache the boolean yourself, or gate the check to admin/editor screens.

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

Core registers **no** AI REST route and ships no JS prompt API — `wp_ai_client_prompt()` is PHP-only, so there is nothing for JS to call until you register something. The client-side JS prompt builder belongs to the standalone `wordpress/wp-ai-client` plugin (0.4.x); do not rely on it in distributed plugins, since its route is gated behind that plugin's `prompt_ai` capability (granted to administrators by default) and lets the caller send any prompt to any configured provider. Register a REST endpoint scoped to your single feature instead, with a tight permission callback:

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

**Persisting generated media: branch on `$image->isRemote()` first.** `generate_image()` returns a
PHP AI Client `File` DTO that carries **either** inline base64 **or** a remote URL — never both.
`getDataUri(): ?string` and `getUrl(): ?string` are each nullable and each return `null` in the
other's case, so code that reaches straight for `getDataUri()` breaks the moment a provider or an
`asOutputFileType()` choice yields a URL. Validate `getMimeType()` against an allow-list before
writing, fetch the remote case with `wp_safe_remote_get()` bounded by `limit_response_size` and a
timeout after `wp_http_validate_url()`, then re-check `wp_get_image_mime()` on the uploaded file and
delete it on mismatch before `wp_insert_attachment()`. The complete, copyable handler is in
`references/rest-patterns.md`.

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

### 6) Function calling: `using_abilities()` declares functions — you drive the round trip

If your feature needs the model to *call* something — read site metadata, classify content, update a record — pass registered ability IDs to `using_abilities()`. It converts each into a `FunctionDeclaration` (name, description, input schema) and terminates in `using_function_declarations()`. Pair this with `wp-abilities-api` to define the abilities themselves.

**Core 7.1 registers exactly three abilities out of the box** — `core/get-site-info`, `core/get-environment-info`, and `core/get-user-info`. Nothing else in the `core/` namespace exists — media-oriented IDs of the `core/…-attachment` shape appear in older guidance and are not real. Every other ID in an example is a placeholder you must register yourself with `wp_register_ability()` before passing it here, or the resolver rejects it.

**`using_abilities()` does not execute anything.** A `FunctionDeclaration` carries no callable. When the model decides to call one, the result comes back holding a *function-call part*, and nothing has run: no `permission_callback`, no `execute_callback`. Executing it and feeding the answer back is the caller's job, and Core gives you `WP_AI_Client_Ability_Function_Resolver` to do it. Treat the loop below as mandatory, not as a low-level alternative:

```php
// Real Core 7.1 abilities — this example runs on a stock install.
$abilities = array( 'core/get-site-info', 'core/get-environment-info' );

$result = wp_ai_client_prompt( 'Summarize this site’s WordPress and PHP versions and whether the environment is production-ready.' )
    ->using_abilities( ...$abilities )
    ->generate_text_result();

if ( is_wp_error( $result ) ) {
    return $result;
}

// The model may have asked for an ability instead of answering. Nothing has run yet.
$model_message = $result->toMessage();
$resolver      = new WP_AI_Client_Ability_Function_Resolver( ...$abilities );

if ( $resolver->has_ability_calls( $model_message ) ) {
    // This is where permission_callback and execute_callback finally run.
    $tool_message = $resolver->execute_abilities( $model_message );

    $result = wp_ai_client_prompt( $tool_message )
        ->using_abilities( ...$abilities )
        ->with_history( $model_message )
        ->generate_text_result();

    if ( is_wp_error( $result ) ) {
        return $result;
    }
}

$answer = $result->toText();
```

Two things the resolver enforces that the builder does not. It allow-lists independently — `execute_ability()` returns `ability_not_allowed` for anything absent from *its own* constructor arguments, so pass the same list you gave `using_abilities()`. And a model can emit several calls in one turn: `execute_abilities()` handles all of them and returns one message of responses, which is why the example loops on the message rather than a single call.

A production loop should carry the full turn history (the original user message as well as `$model_message`) and should re-check for further calls, since the second response can request more. Abilities you pass must already be registered server-side via `wp_register_ability()`.

The resolver also exposes static helpers that round-trip an Ability ID to the AI-safe function name the model actually sees, which is what you need when inspecting or logging raw function-call parts:

```php
$function_name = WP_AI_Client_Ability_Function_Resolver::ability_name_to_function_name( 'my-plugin/lookup' );
$ability_name  = WP_AI_Client_Ability_Function_Resolver::function_name_to_ability_name( $function_name );
```

### 7) Timeout policy

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

- **"Feature detection returns `false` everywhere, but a provider is configured"**: check `wp_supports_ai()` before anything else. `define( 'WP_AI_SUPPORT', false )` or a `wp_supports_ai` filter turns the whole surface off for the request; every `is_supported_for_*()` then returns `false` and every generator returns `WP_Error` `prompt_prevented` (503) without an API call ever being attempted.
- **"AI feature shows but always errors"**: usually no provider configured. Confirm at least one provider plugin is active (`AI Provider for Anthropic|Google|OpenAI` or a community provider) and a key is set in Settings → Connectors.
- **`call to undefined function wp_ai_client_prompt()`**: site is on WP < 7.0. Either bump the floor or use the conditional autoloader pattern.
- **"Works for admin, fails for editors"**: the site has the standalone `wordpress/wp-ai-client` plugin active and the JS is calling its `prompt_ai`-gated prompt route instead of your scoped REST endpoint. On plain 7.0/7.1 neither that route nor the `prompt_ai` capability exists, so the same call 404s for every role — don't go hunting for the capability in Core. Switch to a per-feature endpoint.
- **`WP_Error` with HTTP 4xx but no useful detail**: log its `get_error_code()`, `get_error_message()`, and `get_error_data()`. Do not call `getProviderMetadata()` or `getModelMetadata()` on a `WP_Error`.
- **Different model than expected ran**: `using_model_preference()` is a preference. Inspect `getProviderMetadata()` / `getModelMetadata()` on the result to see what actually answered.

## Bundled versus standalone PHP AI Client

WordPress 7.0 through 7.0.4 and 7.1 all bundle PHP AI Client 1.3.1 (check `AiClient::VERSION` on the site itself). Composer's standalone latest is PHP AI Client 1.4.0. Treat the Core-bundled version as the compatibility boundary: an API added only in the standalone package cannot be assumed available through Core until WordPress updates its bundled dependency.

**What 1.4.0 added, and therefore what Core does not yet expose:** embedding generation. Embeddings use a dedicated `EmbeddingBuilder` (`withInput()`, `usingDimensions()`, `generateEmbedding()`, `generateEmbeddings()`, `generateEmbeddingResult()`, `isSupported()`) plus the static `AiClient::generateEmbedding()`, `AiClient::generateEmbeddings()`, and `AiClient::generateEmbeddingResult()` entry points. The builder shares `usingModel()`, `usingModelPreference()`, `usingModelConfig()`, `usingProvider()`, and `usingRequestOptions()` with the prompt builder through `ModelResolutionTrait`. It returns concrete `Embedding` / `EmbeddingResult` DTOs and dispatches `BeforeGenerateEmbeddingEvent` / `AfterGenerateEmbeddingEvent` when a PSR event dispatcher is configured. `EmbeddingList` is a PHPStan alias for `list<float|int>`, not a value-object class. Inputs are message parts — strings, `File`s, or parts — not conversations, matching how providers treat embeddings as a separate API.

If a task calls for embeddings (semantic search, clustering, similarity), you cannot reach them through `wp_ai_client_prompt()` on any 7.0 or 7.1 release. Do not load an unprefixed standalone `wordpress/php-ai-client` 1.4 beside Core's 1.3.1 copy; the duplicate namespaces are not a supported override path. Wait for Core to bump, isolate/prefix the newer dependency, or move embedding work to a separate service. In a standalone PHP application where Core is not loading the SDK, the entry point is `AiClient::input()`:

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
- WP AI Client standalone plugin (the REST/JS layer Core does not bundle): https://github.com/WordPress/wp-ai-client
- Trac ticket: https://core.trac.wordpress.org/ticket/64591

References:
- `references/prompt-builder.md`
- `references/embedding-builder.md`
- `references/rest-patterns.md`
- `references/error-handling.md`
