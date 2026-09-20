# Standalone PHP AI Client embedding reference

Embedding generation arrived in `wordpress/php-ai-client` 1.4.0 and **changed breakingly in 1.5.0**. It is a standalone SDK surface, not a method on `WP_AI_Client_Prompt_Builder` and not a WordPress procedural wrapper.

## The 1.5.0 breaking change: a model is mandatory

In 1.4.0 the builder resolved a model for you. In 1.5.0 ([#274](https://github.com/WordPress/php-ai-client/pull/274)) it never does. Embedding vectors are only comparable to vectors from the same model, so a stored corpus is permanently bound to its model; letting the resolver pick could silently invalidate stored vectors when the registered providers change.

Specify the model with `usingModel()` or `usingProviderModel()`. Omitting it throws `InvalidArgumentException` — including from `isSupported()`, which treats a missing model as a programming error rather than an unsupported one.

Carried over from 1.4.0 and now wrong:

| 1.4.0 | 1.5.0 |
| --- | --- |
| `AiClient::input( $text )->generateEmbedding()` | Throws — add `usingProviderModel()` or `usingModel()` |
| `EmbeddingBuilder` uses `ModelResolutionTrait` | Uses `ModelConfigurationTrait` |
| `usingModelPreference()`, `usingProvider()` | **Removed from this builder**; use `usingProviderModel( $provider, $model )` |
| `isSupported()` probes the whole registry | Reports only on the specified model; throws with no model |
| `AiClient::generateEmbedding( $input, $modelOrConfig = null, $registry = null )` | `generateEmbedding( $input, $model, ?ModelConfig, ?ProviderRegistry )` — `$model` required, second position |

## Version boundary

- WordPress 7.1 bundles PHP AI Client **1.3.1** (`AiClient::VERSION` in `src/wp-includes/php-ai-client/src/AiClient.php`). Its `src/Builders/` holds only `MessageBuilder` and `PromptBuilder` — there is no embedding generation path in Core.
- Upstream states embedding generation lands in **WordPress core 7.2** via [wordpress-develop#12530](https://github.com/WordPress/wordpress-develop/pull/12530) (`WordPress/ai`, `includes/Vendor/AiClient/README.md`).
- Do not load an unprefixed standalone package beside Core's bundled copy. Both use the `WordPress\AiClient\` namespace.
- In a standalone PHP application where WordPress Core is not loading the SDK, require `wordpress/php-ai-client:^1.5` and register a configured provider before using `AiClient::input()`.
- For a future Core build, verify `AiClient::VERSION`, `class_exists( \WordPress\AiClient\Builders\EmbeddingBuilder::class )`, the Core wrapper surface, and provider availability independently. A standalone release does not prove Core availability.

### The canonical AI plugin does not close the gap yet

`WordPress/ai` 1.3.0 ships `WordPress\AI\supports_embedding_generation()` and `WordPress\AI\generate_embeddings( $input, $args )` (`includes/helpers.php`), plus a vendored 1.4-era `EmbeddingBuilder` under `includes/Vendor/AiClient/`. The changelog advertises embeddings. **The released code does not load them:** `ai.php:85` has `SDK_Overlay::register()` commented out, with an inline note that upstream embedding changes are still landing and "we don't want anyone to start building on top of things."

Consequences to check before recommending this path:

- `supports_embedding_generation()` is `class_exists( AiClient::class ) && class_exists( EmbeddingBuilder::class )`. With the overlay disabled and Core on 1.3.1, it returns `false` and `generate_embeddings()` returns `WP_Error( 'ai_embeddings_unsupported' )`.
- The wrapper calls `usingProvider()` and `usingModelPreference()` — the methods 1.5.0 removed from `EmbeddingBuilder`. It is written against the vendored 1.4 overlay, not against standalone 1.5.

Treat AI plugin embeddings as staged-but-inactive. Re-read `ai.php` and the vendor README at the installed version rather than trusting the changelog.

## Entry point and builder

```php
use WordPress\AiClient\AiClient;

$builder = AiClient::input( 'Content to embed' )
    ->usingProviderModel( 'openai', 'text-embedding-3-small' )
    ->usingDimensions( 512 );

if ( ! $builder->isSupported() ) {
    throw new RuntimeException( 'That embedding model cannot fulfill this request.' );
}

$embedding = $builder->generateEmbedding();
$values    = $embedding->getValues();
```

`AiClient::input()` accepts one input or a list. Each input may be a nonblank string, a text/file `MessagePart`, a `File`, or a matching message-part array shape. Inputs are independent, not a conversation. `withInput()` is variadic and appends; spread a list with `withInput( ...$inputs )`.

To reference a provider class directly instead of an ID, pass a model instance:

```php
use WordPress\GoogleAiProvider\Provider\GoogleProvider;

$embedding = AiClient::input( 'Content to embed' )
    ->usingModel( GoogleProvider::model( 'gemini-embedding-001' ) )
    ->generateEmbedding();
```

## Builder methods

| Method | Result |
| --- | --- |
| `withInput( ...$inputs )` | Adds independent inputs to embed |
| `usingModel( ModelInterface $model )` | Names the model by instance; clears any provider/model pair |
| `usingProviderModel( string $providerIdOrClassName, string $modelId )` | Names the model by provider + ID (1.5.0); clears any instance. Rejects empty strings |
| `usingModelConfig( ModelConfig $config )` | Applies a full config (via `ModelConfigurationTrait`) |
| `usingDimensions( int $dimensions )` | Requests an embedding dimension; rejects values below 1 |
| `usingRequestOptions( RequestOptions $options )` | HTTP transport options; applied only to API-based models |
| `isSupported()` | Whether *the specified model* can fulfill the request. Throws if no model was specified |
| `generateEmbedding()` | One `Embedding`; rejects multiple configured inputs |
| `generateEmbeddings()` | `list<Embedding>` |
| `generateEmbeddingResult()` | `EmbeddingResult` with embeddings and metadata |

`isSupported()` returns `false` — rather than throwing — for every *model* problem: an unregistered or unconfigured provider, a model ID the provider does not offer, a provider that could not be reached, a model that does not implement `EmbeddingGenerationModelInterface`, and any unmet input-modality or option requirement. Generation raises `InvalidArgumentException` with the specific unmet requirement instead.

A model instance passed to `usingModel()` is left untouched by `isSupported()`, so probing does not mutate it. Generation binds dependencies and merges configuration, with the builder's configuration taking precedence over the model's own.

## Static entry points

| Method | Signature |
| --- | --- |
| `AiClient::generateEmbedding()` | `( $input, $model, ?ModelConfig $modelConfig = null, ?ProviderRegistry $registry = null ): Embedding` |
| `AiClient::generateEmbeddings()` | `( array $inputs, $model, ?ModelConfig $modelConfig = null, ?ProviderRegistry $registry = null ): list<Embedding>` |
| `AiClient::generateEmbeddingResult()` | `( $input, $model, ?ModelConfig $modelConfig = null, ?ProviderRegistry $registry = null ): EmbeddingResult` |

`$model` is a `ModelInterface` **or** a `[ $provider_id, $model_id ]` tuple. Anything else — including a `ModelConfig`, which used to occupy that position — throws `InvalidArgumentException` naming the received type. Dimensions now travel in the third parameter:

```php
use WordPress\AiClient\AiClient;
use WordPress\AiClient\Providers\Models\DTO\ModelConfig;

$config = new ModelConfig();
$config->setDimensions( 512 );

$embedding = AiClient::generateEmbedding( 'Content', array( 'openai', 'text-embedding-3-small' ), $config );
```

Follow the singular contract of static `AiClient::generateEmbedding()`. Its implementation accepts a list at runtime and returns the first vector rather than invoking the fluent builder's multiple-input guard; use `AiClient::generateEmbeddings()` for a list.

## Discovering embedding models

Because nothing is chosen for you, a feature that lets site owners pick a model needs the registry:

```php
use WordPress\AiClient\AiClient;
use WordPress\AiClient\Providers\Models\DTO\ModelRequirements;
use WordPress\AiClient\Providers\Models\Enums\CapabilityEnum;

$requirements = new ModelRequirements( array( CapabilityEnum::embeddingGeneration() ), array() );

foreach ( AiClient::defaultRegistry()->findModelsMetadataForSupport( $requirements ) as $provider_models ) {
    $provider_id = $provider_models->getProvider()->getId();
    foreach ( $provider_models->getModels() as $model_metadata ) {
        echo $provider_id . ' / ' . $model_metadata->getId() . "\n";
    }
}
```

Store the provider ID and model ID alongside every vector you persist. A corpus whose model is unrecorded cannot be safely extended.

## Results and invariants

`Embedding` exposes `getValues()`, `getDimensions()`, `count()`, iteration, `toArray()`, and JSON serialization. `EmbeddingResult` exposes `getId()`, `getEmbedding()` (the first vector), `getEmbeddings()`, `getDimensions()`, `getTokenUsage()`, `getProviderMetadata()`, `getModelMetadata()`, `getAdditionalData()`, and array/JSON serialization. `EmbeddingList` is only a PHPStan alias for `list<float|int>` in `Embedding.php`; do not import or instantiate it as a class.

The SDK preserves input order and requires exactly one output vector per input. Every vector in an `EmbeddingResult` must match the result's positive dimension count. A provider that violates the count invariant triggers `RuntimeException`: `Expected N embedding(s) from the model, but received M.`

## Lifecycle events

Configure a PSR event dispatcher with `AiClient::setEventDispatcher()` before constructing the builder. Embedding generation dispatches `BeforeGenerateEmbeddingEvent` after the model is resolved and verified, and `AfterGenerateEmbeddingEvent` only after the returned count is validated. The before event exposes inputs/model/capability; the after event also exposes the `EmbeddingResult`.

## Failure modes

- `wp_ai_client_embedding()` does not exist.
- `wp_ai_client_prompt()` cannot generate embeddings.
- **No model specified** — `An embedding model must be specified…` from `generateEmbedding*()` *and* from `isSupported()`. This is the most common 1.4 → 1.5 migration break.
- `usingModelPreference()` / `usingProvider()` on an `EmbeddingBuilder` is a fatal "call to undefined method" on 1.5; they exist only on `PromptBuilder`.
- Passing a `ModelConfig` as the second argument of a static `AiClient::generateEmbedding*()` throws — it is the `$model` slot now.
- `is_supported_for_embedding_generation()` returning true on Core proves provider capability, not the presence of a generation API.
- `generateEmbedding()` rejects multiple inputs; use `generateEmbeddings()` for a batch.
- Empty strings and non-text/non-file message parts are invalid inputs.
- `usingDimensions()` rejects values below 1.
- No embedding provider is registered automatically; the default registry must contain a configured provider with compatible metadata.
- `EmbeddingOperation`, embedding streaming, and async embedding APIs are still unimplemented in 1.5.0 even though prospective architecture diagrams mention operations.

## Source

- `WordPress/php-ai-client` 1.5.0: `README.md`, `src/AiClient.php`, `src/Builders/EmbeddingBuilder.php`, `src/Builders/Traits/ModelConfigurationTrait.php`, `src/Providers/ModelResolver.php`, `src/Providers/Models/DTO/ModelRequirements.php`, `src/Events/BeforeGenerateEmbeddingEvent.php`, `src/Events/AfterGenerateEmbeddingEvent.php`, `src/Results/DTO/Embedding.php`, `src/Results/DTO/EmbeddingResult.php`
- `WordPress/ai` 1.3.0: `ai.php`, `includes/helpers.php`, `includes/Vendor/AiClient/README.md`
- WordPress 7.1: `src/wp-includes/php-ai-client/src/AiClient.php`
