# Error handling and prompt prevention

The AI Client follows WordPress conventions: `WP_Error` on failure, semantic HTTP status codes when returned through REST, and a filter for blocking prompts before they execute.

## Generators return `WP_Error`

The wrapper catches `Exception` subclasses from the underlying SDK and converts them to `WP_Error`. (It does **not** catch a PHP `TypeError` from a wrong-typed argument — that's an `Error`, not an `Exception` — so match the builder signatures in `references/prompt-builder.md`.) Never wrap calls in try/catch for SDK failures — check `is_wp_error()`:

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

The error path must use only `WP_Error` methods: `get_error_code()`, `get_error_message()`, and `get_error_data()`. `getProviderMetadata()` and `getModelMetadata()` belong exclusively to the successful `GenerativeAiResult` path after `is_wp_error( $result )` returns false.

When passed to `rest_ensure_response()`, a `WP_Error` automatically receives a meaningful HTTP status code based on the underlying failure. You don't need to map status codes manually.

## Common error categories

The Core wrapper maps caught SDK exceptions to a small set of **stable `WP_Error` codes** in `WP_AI_Client_Prompt_Builder::exception_to_wp_error()`. The code is assigned by Core, not the provider plugin; the provider- and failure-specific detail rides in the error *message* and `get_error_data()`, where every converted exception adds `status` and `exception_class`. The complete set that method emits: `prompt_network_error` (503), `prompt_client_error` (the provider's HTTP status, else 400), `prompt_upstream_server_error` (the provider's HTTP status, else 500), `prompt_token_limit_reached` (400), `prompt_invalid_argument` (400), and `prompt_builder_error` (500) for every other `Exception`.

One code never passes through that method: `prompt_prevented` (503), which `__call()` constructs directly when `wp_supports_ai()` is `false` or `wp_ai_client_prevent_prompt` returns `true` — before any SDK call, so there is no exception to convert. `exception_to_wp_error()` is `private`, so re-checking this list means reading `wp-includes/ai-client/class-wp-ai-client-prompt-builder.php`, not calling anything.

General categories you should handle:

- **No provider configured / no compatible model.** `is_supported_*()` would have returned `false` had you checked first. The error from a generator in this state is still meaningful, but the user-facing fix is "configure a provider in Settings → Connectors."
- **Rate limited / quota exhausted.** Provider-specific. Usually `429`-class. Surface a generic "try again shortly" to the user; log the upstream message for ops.
- **Validation error from the model.** Most common with `as_json_response()` if the schema is too strict or the prompt is ambiguous. Loosen the schema, lower temperature, or add an explicit example to the system instruction.
- **Provider returned an opaque error.** Log the `WP_Error` code, message, and data. Do not use `GenerativeAiResult` metadata methods on the error object.

## The `wp_ai_client_prevent_prompt` filter

This filter runs before any AI call. Returning `true` blocks the prompt: no API call is made, `is_supported_*()` returns `false`, and generators return a `WP_Error`. Use it for capability gating, dev-mode kill switches, content policy enforcement, or per-environment restrictions. It does not run at all when `wp_supports_ai()` is already `false` — the builder short-circuits before reaching it — so don't hang side effects such as logging off this filter.

```php
add_filter(
    'wp_ai_client_prevent_prompt',
    function ( bool $prevent, $builder ): bool {
        // Block all prompts in staging unless explicitly opted in.
        if ( defined( 'WP_ENVIRONMENT_TYPE' ) && 'staging' === wp_get_environment_type() ) {
            return ! defined( 'MY_PLUGIN_AI_ENABLED_IN_STAGING' );
        }
        return $prevent;
    },
    10,
    2
);
```

The filter receives a `clone $this` of the wrapper, documented as read-only — but `WP_AI_Client_Prompt_Builder` defines no `__clone()`, so the copy is shallow and its inner SDK `PromptBuilder` is the *same object* the live builder holds. Calling any `using_*` / `with_*` / `as_*` method on the argument silently mutates the request that is about to run. Treat it as strictly do-not-touch.

There is nothing to read off it either. The wrapper proxies only to `PromptBuilder`, whose public surface is `with*` / `using*` / `as*` / `isSupported*` / `generate*` — no getters at all. A `get_*()` call raises `BadMethodCallException` inside `__call()`, which its `catch ( Exception $e )` swallows; you get the clone back (a truthy object, not a value) and the clone is left in its error state. Worse, calling `is_supported_*()` on the clone re-enters `__call()`, which re-applies `wp_ai_client_prevent_prompt` — infinite recursion.

Gate on your own context instead: `current_user_can()`, `wp_get_environment_type()`, a constant, the request you are already handling. You can't (and shouldn't) read user prompt text out of the builder for content moderation; do moderation upstream of the builder, in your REST callback or business logic.

### Combining with `is_supported_*()`

When `wp_ai_client_prevent_prompt` returns `true`, the support checks return `false`. This is by design: your UI naturally hides itself when prompts are prevented. You don't need a separate check.

## Surfacing errors in the editor

If your feature runs in the block editor, return errors as a normal REST error and let `@wordpress/api-fetch` reject. Display via the `core/notices` store:

```js
import apiFetch from '@wordpress/api-fetch';
import { dispatch } from '@wordpress/data';

try {
    const result = await apiFetch( {
        path: '/my-plugin/v1/summarize-post',
        method: 'POST',
        data: { post_id: postId },
    } );
    // use result.text
} catch ( error ) {
    dispatch( 'core/notices' ).createErrorNotice(
        error.message || 'AI request failed.',
        { type: 'snackbar' }
    );
}
```

## Logging without leaking prompts

Don't dump full prompts into PHP error logs — they may contain user content, PII, or trade secrets. Log:

- error code,
- HTTP status (from `$error->get_error_data()['status']` if present),
- provider/model metadata only after a `*_result()` call returned a successful `GenerativeAiResult`,
- a short hash of the prompt for correlation if you really need it.

Keep the actual prompt text in your application's audit log, behind whatever access controls you already use for sensitive content.
