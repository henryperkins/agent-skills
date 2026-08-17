# Standalone PHP AI Client embedding reference

Embedding generation arrived in `wordpress/php-ai-client` 1.4.0. It is a standalone SDK surface, not a method on `WP_AI_Client_Prompt_Builder` and not a WordPress procedural wrapper.

## Version boundary

- WordPress 7.0 through 7.0.4 and 7.1 all bundle PHP AI Client 1.3.1 (`AiClient::VERSION`). Its prompt builder can report embedding capability, but that package version has no generation path.
- Do not load the unprefixed standalone 1.4 package beside Core's bundled copy. Both use the same namespaces.
- On stock Core, wait for the bundled dependency to update. If an earlier Core version must use 1.4 behavior, isolate/prefix the dependency or call a separate service rather than relying on Composer load order.
- In a standalone PHP application where WordPress Core is not loading the SDK, require `wordpress/php-ai-client:^1.4` and register a compatible provider before using `AiClient::input()`.
- For a future Core build, verify `AiClient::VERSION`, `method_exists( AiClient::class, 'input' )`, the Core wrapper surface, and provider availability independently. The standalone release does not prove Core availability.

## Entry point and builder

```php
use WordPress\AiClient\AiClient;

$builder = AiClient::input( 'Content to embed' )
    ->usingDimensions( 1536 );

if ( ! $builder->isSupported() ) {
    throw new RuntimeException( 'No compatible embedding model is configured.' );
}

$embedding = $builder->generateEmbedding();
$values    = $embedding->getValues();
```

`AiClient::input()` accepts one input or a list. Each input may be a nonblank string, a text/file `MessagePart`, a `File`, or a matching message-part array shape. Inputs are independent, not a conversation. `withInput()` is variadic and appends inputs; spread a list with `withInput( ...$inputs )`.

## Builder methods and model selection

| Method | Result |
| --- | --- |
| `withInput( ...$inputs )` | Adds independent inputs to embed |
| `usingDimensions( int $dimensions )` | Requests an embedding dimension |
| `isSupported()` | Checks model resolution without generating |
| `generateEmbedding()` | One `Embedding`; rejects multiple configured inputs |
| `generateEmbeddings()` | `list<Embedding>` |
| `generateEmbeddingResult()` | `EmbeddingResult` with embeddings and metadata |

`EmbeddingBuilder` also uses `ModelResolutionTrait`: `usingModel()`, `usingModelPreference()`, `usingModelConfig()`, `usingProvider()`, and `usingRequestOptions()`. Model preferences accept model IDs, model instances, or `[ $provider_id, $model_id ]` tuples. Generation honors those constraints and falls back to the first compatible discovered model if preferences do not match.

At 1.4.0, `isSupported()` behaves more broadly than generation: it honors an explicit `usingModel()`, but without one it searches the whole registry and does not apply `usingProvider()` or model preferences. Treat it as a broad availability probe unless you set the exact model.

## Static entry points

| Method | Return |
| --- | --- |
| `AiClient::generateEmbedding( $input, $model_or_config = null, $registry = null )` | One `Embedding`; the documented input is singular |
| `AiClient::generateEmbeddings( array $inputs, $model_or_config = null, $registry = null )` | `list<Embedding>` |
| `AiClient::generateEmbeddingResult( $input, $model_or_config = null, $registry = null )` | Metadata-bearing `EmbeddingResult` for one or many inputs |

For static calls, request dimensions through a `ModelConfig`:

```php
use WordPress\AiClient\AiClient;
use WordPress\AiClient\Providers\Models\DTO\ModelConfig;

$config = new ModelConfig();
$config->setDimensions( 512 );

$embedding = AiClient::generateEmbedding( 'Content', $config );
```

Follow the singular contract of static `AiClient::generateEmbedding()`. In 1.4.0 its implementation accepts a list at runtime and returns the first vector instead of invoking the fluent builder's multiple-input guard; use `AiClient::generateEmbeddings()` for a list.

## Results and invariants

`Embedding` exposes `getValues()`, `getDimensions()`, `count()`, iteration, `toArray()`, and JSON serialization. `EmbeddingResult` exposes `getId()`, `getEmbedding()`, `getEmbeddings()`, `getDimensions()`, token usage, provider/model metadata, additional data, and array/JSON serialization. `EmbeddingList` is only a PHPStan alias for `list<float|int>` in `Embedding.php`; do not import or instantiate it as a class.

The SDK preserves input order and requires exactly one output vector per input. Every vector in an `EmbeddingResult` must match the result's positive dimension count. A provider that violates the count invariant triggers `Expected N embedding(s) from the model, but received M.`

## Lifecycle events

Configure a PSR event dispatcher with `AiClient::setEventDispatcher()` before constructing the builder. Embedding generation dispatches `BeforeGenerateEmbeddingEvent` after model resolution and `AfterGenerateEmbeddingEvent` only after the returned count is validated. The before event exposes inputs/model/capability; the after event also exposes the `EmbeddingResult`.

## Failure modes

- `wp_ai_client_embedding()` does not exist.
- `wp_ai_client_prompt()` cannot generate embeddings.
- `is_supported_for_embedding_generation()` returning true on Core 7.0/7.1 proves provider capability, not the presence of a generation API.
- `generateEmbedding()` rejects multiple inputs; use `generateEmbeddings()` for a batch.
- Empty strings and non-text/non-file message parts are invalid inputs.
- `usingDimensions()` rejects values below 1.
- No embedding provider is registered automatically; the default registry must contain a configured provider with compatible metadata.
- `EmbeddingOperation`, embedding streaming, and async embedding APIs are not implemented in 1.4.0 even though prospective architecture diagrams mention operations.

## Source

- `WordPress/php-ai-client` 1.4.0: `src/AiClient.php`, `src/Builders/EmbeddingBuilder.php`, `src/Builders/Traits/ModelResolutionTrait.php`, `src/Providers/ModelResolver.php`, `src/Events/BeforeGenerateEmbeddingEvent.php`, `src/Events/AfterGenerateEmbeddingEvent.php`, `src/Results/DTO/Embedding.php`, `src/Results/DTO/EmbeddingResult.php`
