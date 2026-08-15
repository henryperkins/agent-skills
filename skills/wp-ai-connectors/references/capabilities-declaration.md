# Declaring model capabilities

A provider plugin's job is to make its models *describable*. The PHP AI Client uses `ModelMetadata` to resolve a compatible model before generation. Keep operation capabilities separate from supported configuration options.

## What gets declared

For each model the provider exposes:

- **Model ID** — stable string. Site owners and feature plugins reference models by ID, so renaming is a breaking change.
- **Display name** — for the Settings → Connectors UI and any admin model picker.
- **`supportedCapabilities`** — `CapabilityEnum` values for generation kinds and chat history.
- **`supportedOptions`** — `SupportedOption` objects keyed by `OptionEnum` for modalities, structured output, system instructions, function declarations, dimensions, token limits, and other configuration.

The exact PHP shape is in the SDK source — the existing flagship providers are the canonical examples. The shape may evolve, so always read against the current SDK version.

## Why ordering matters

`using_model_preference()` / standalone `usingModelPreference()` are preferences, not hard constraints. If none match, resolution falls back to the first compatible model in registry order. Provider model ordering therefore affects the fallback.

The convention (followed by the three flagship providers): list newer models before older ones within a family. So `gpt-5.4` before `gpt-5.0` before `gpt-4.5-turbo`. A feature plugin that says "give me your best Anthropic model" gets `claude-opus-4-7` instead of a 2-year-old Claude 3. (Model IDs throughout this skill are illustrative — use the IDs your provider actually advertises.)

## CapabilityEnum is not an option list

At PHP AI Client 1.4.0, `CapabilityEnum` contains exactly:

- `textGeneration()`
- `imageGeneration()`
- `textToSpeechConversion()`
- `speechGeneration()`
- `musicGeneration()`
- `videoGeneration()`
- `embeddingGeneration()`
- `chatHistory()`

Names such as `json_response`, `system_instruction`, `function_calling`, and `streaming` are not `CapabilityEnum` cases. Structured output uses `OptionEnum::outputSchema()`, system instructions use `OptionEnum::systemInstruction()`, and function calling uses `OptionEnum::functionDeclarations()`. Input/output modalities are also options.

## SupportedOption and modalities

`SupportedOption` pairs an `OptionEnum` with either unrestricted support (`null`) or a list of exact supported values:

```php
new SupportedOption( OptionEnum::dimensions() );
new SupportedOption( OptionEnum::dimensions(), array( 256, 512, 1024 ) );
```

Declare input modalities with `OptionEnum::inputModalities()` and output modalities with `OptionEnum::outputModalities()`. Supported input values are lists of exact modality combinations. A model supporting text-only, image-only, and mixed text/image input must list all three combinations; the mixed combination does not imply either single-modality combination. Use unrestricted support only when the provider genuinely accepts every combination.

## Embedding provider contract (PHP AI Client 1.4+)

> **Core does not bundle this.** WP 7.0 and 7.1 vendor a pre-1.4 SDK: `src/wp-includes/php-ai-client/` has no `src/Providers/Models/EmbeddingGeneration/`, no `EmbeddingResult`/`EmbeddingBuilder`, and no `ModelConfig::KEY_DIMENSIONS` (so `OptionEnum::dimensions()` does not resolve). `CapabilityEnum::EMBEDDING_GENERATION` *is* in the bundled enum, which makes the surface look present. Require `wordpress/php-ai-client: ^1.4` in your plugin's own Composer bundle before writing any of the below.

An automatically discoverable text embedding model with configurable dimensions needs metadata shaped like:

```php
new ModelMetadata(
    'acme-embed',
    'Acme Embed',
    array( CapabilityEnum::embeddingGeneration() ),
    array(
        new SupportedOption(
            OptionEnum::inputModalities(),
            array( array( ModalityEnum::text() ) )
        ),
        new SupportedOption( OptionEnum::dimensions() ),
    )
);
```

`ModelRequirements::fromEmbeddingData()` requires `embeddingGeneration()`, the exact input-modality combination, and `dimensions()` whenever the caller used `usingDimensions()`.

The concrete model must satisfy `ModelInterface` and `EmbeddingGenerationModelInterface`. The embedding interface does not extend `ModelInterface`; it only adds:

```php
/** @param list<MessagePart> $inputs */
public function generateEmbeddingResult( array $inputs ): EmbeddingResult;
```

Read `$this->getConfig()->getDimensions()`, forward it when present, preserve input order, and return exactly one numeric vector per input. `EmbeddingResult` must contain at least one vector, a positive concrete dimension count, and vectors whose lengths match that count. `EmbeddingBuilder` separately rejects a result count that differs from the input count.

There is no implemented `EmbeddingOperation` or `EmbeddingGenerationOperationModelInterface` in 1.4.0; use the synchronous interface above.

## Logo and brand assets

Connector cards display a logo (`logo_url` in the connector array). Conventions to follow:

- **SVG preferred.** The card scales the logo; SVG stays sharp.
- **Square or near-square aspect.** Wide horizontal logos crop awkwardly.
- **Hosted on your provider's CDN, not WordPress.org.** The card just needs a URL; bundling the asset in the plugin is fine but `logo_url` should point to wherever the screen actually fetches from. Plugin-bundled assets work via `plugins_url()`.
- **Match the provider's official brand.** Don't invent a logo; use the upstream's asset.

## Versioning model declarations

Models change. New ones launch, old ones get deprecated, capabilities expand. Two patterns to handle this gracefully:

1. **Treat model IDs as a stable contract.** Don't rename `claude-sonnet-4-6` to `claude-sonnet-4.6` mid-release. If the upstream changes naming, add the new ID alongside the old one and mark the old one deprecated rather than removing it.
2. **Update the provider plugin frequently.** Site owners update plugins; that's how new model availability propagates. A provider plugin that hasn't updated in 18 months is offering site owners a stale menu.

## Cross-checking with feature detection

Build a small smoke test in your provider plugin that exercises every declared capability/option against a configured key. For embeddings, include `AiClient::input( ... )->usingDimensions( ... )->isSupported()` and a real single/batch generation check. Verify the output count, order, and dimensions instead of trusting metadata alone.
