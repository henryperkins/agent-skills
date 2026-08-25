---
name: wp-ai-connectors
description: "Use when building or debugging a WordPress AI provider plugin, registering an AI service with the PHP AI Client, exposing it through Settings → Connectors, declaring model capabilities/options, or adding text, media, function-calling, or embedding support at the provider layer."
compatibility: "Targets WordPress 7.0+ (PHP 7.4+); WordPress Core verified through: 7.1; Gutenberg verified through: 23.8.0; PHP AI Client verified through: 1.4.0 (Core bundles 1.3.1); Anthropic provider verified through: 1.0.4; Google provider verified through: 1.1.1; OpenAI provider verified through: 1.1.0. `application_password` needs Core 7.1 or Gutenberg 23.6+. Embeddings need standalone PHP AI Client 1.4+ and runtime gating. Filesystem-based agent with bash + node; some workflows require WP-CLI."
license: GPL-2.0-or-later
---

# WP AI Connectors

## When to use

Use this skill when the task involves:

- writing a plugin that integrates a new AI provider (commercial API, self-hosted Ollama, OpenRouter, Mistral, etc.) with the WordPress AI Client,
- adding or correcting embedding models, dimension support, input modalities, or other model metadata in a PHP AI Client 1.4+ provider,
- overriding metadata for a built-in connector (Anthropic, Google, OpenAI) — for example, customizing the description or pre-filling the credentials URL for an internal deployment,
- diagnosing "my provider plugin is installed but doesn't appear in Settings → Connectors,"
- understanding why a provider's API key is being read from the wrong source (env vs constant vs database).

If the task is to *consume* AI features (build a summarization endpoint, add image generation to a block), route to `wp-ai-client` instead.

## Inputs required

- Repo root (run `wordpress-router` and `wp-project-triage` first).
- Provider being integrated: name, ID slug (must match `/^[a-z0-9_-]+$/` — lowercase alphanumeric, hyphens, underscores), authentication method (`api_key`, or `none` for a provider that should have no connector card).
- Models the provider exposes, their generation capabilities, supported options, input/output modalities, and any embedding-dimension constraints.
- Public credentials URL (where users go to get an API key) and, if you have one, a logo file bundled inside the plugin directory — core derives the URL itself from a filesystem path, not from a URL you supply.

## Procedure

### 0) Triage and confirm scope

1. Run project triage if available: `node ../wp-project-triage/scripts/detect_wp_project.mjs` when the `wp-project-triage` skill is installed alongside; otherwise classify the project manually.
2. Confirm this is a *provider* plugin, not a *feature* plugin. The two have different shapes:
   - **Provider plugin**: registers with the `AiClient::defaultRegistry()` so other plugins can use the provider.
   - **Feature plugin**: calls `wp_ai_client_prompt()` to build something. That's `wp-ai-client` territory.
3. Set the plugin header's version requirements. Recommended: `Requires at least: 7.0` and `Requires PHP: 7.4`. The official Anthropic/Google/OpenAI provider plugins set `Requires at least: 6.9` but do **not** ship the SDK: `wordpress/php-ai-client` appears only under `require-dev` plus a `suggest` entry ("Required. The core PHP AI Client SDK that this provider extends."), `/vendor` is listed in `.distignore`, the wp.org deploy workflow runs no `composer install`, and `src/autoload.php` is a hand-rolled PSR-4 loader for the plugin's own namespace. What makes 6.9 safe is the `if ( ! class_exists( AiClient::class ) ) { return; }` guard: the plugin activates and stays inert where no SDK exists, and Core supplies one from 7.0 on. Their readmes say it plainly — "For WordPress 6.9, the package must be installed." Target 6.9 only if you replicate that guard and accept a no-op plugin there.

### 1) Register with the PHP AI Client provider registry

Provider registration happens at the SDK level, not the WordPress level. The `wordpress/php-ai-client` package (bundled in WP 7.0 Core) maintains a registry accessed via `AiClient::defaultRegistry()`. Your plugin's bootstrap registers a provider class on that registry — passing the class name, not an instance.

The canonical pattern, adapted from `WordPress/ai-provider-for-anthropic`'s `plugin.php` (v1.0.4; reformatted here to WordPress-style spacing — the upstream file uses tight PSR-12 spacing):

```php
namespace WordPress\AnthropicAiProvider;

use WordPress\AiClient\AiClient;
use WordPress\AnthropicAiProvider\Provider\AnthropicProvider;

function register_provider(): void {
    if ( ! class_exists( AiClient::class ) ) {
        return; // SDK not loaded; AI Client missing or WP < 7.0 without the Composer package.
    }

    $registry = AiClient::defaultRegistry();

    if ( $registry->hasProvider( AnthropicProvider::class ) ) {
        return; // Idempotent — don't double-register.
    }

    $registry->registerProvider( AnthropicProvider::class );
}

add_action( 'init', __NAMESPACE__ . '\\register_provider', 5 );
```

Notes:

- The method is `registerProvider()`, not `register()`. Argument is a class name string, not an instance.
- `class_exists( AiClient::class )` makes the plugin safely activate on sites without the SDK.
- `hasProvider()` makes the registration idempotent.
- `init` priority 5 runs before `_wp_connectors_init`, which Core hooks on `init` at **priority 15** (`wp-includes/default-filters.php`). Any priority earlier than 15 works (`plugins_loaded`, or `init` ≤ 14); `init` priority 5 is what every official provider plugin uses, so match it for consistency.

The provider class itself (`AnthropicProvider` in this example) implements the SDK's provider interface and lives in your plugin's `src/` directory. See `references/provider-registration.md` for the full annotated pattern and where to look in the SDK source for the current interface contract.

### 2) Declare capabilities and options from the exact SDK version

`ModelMetadata` keeps two different axes. `CapabilityEnum` contains generation kinds plus chat history; configuration features belong in `SupportedOption` entries keyed by `OptionEnum`. For example, embedding support in PHP AI Client 1.4 is `CapabilityEnum::embeddingGeneration()`, while caller-selectable dimensions are `OptionEnum::dimensions()`. Structured output, system instructions, function declarations, and modalities are options, not invented `CapabilityEnum` cases.

An embedding model must implement both `ModelInterface` and `EmbeddingGenerationModelInterface`; the latter adds `generateEmbeddingResult( array $inputs ): EmbeddingResult` but does not itself extend `ModelInterface`. Declare `OptionEnum::inputModalities()` so automatic resolution can match the actual text/file inputs, and declare `OptionEnum::dimensions()` only when the model accepts caller-selected dimensions. Return exactly one vector per input in input order.

**This is a 1.4-only surface, and core does not ship it.** Verified against the released WordPress 7.0 and 7.1 source: the vendored `src/wp-includes/php-ai-client/` is pre-1.4 — no `src/Providers/Models/EmbeddingGeneration/`, no `EmbeddingResult`/`EmbeddingBuilder`, and no `ModelConfig::KEY_DIMENSIONS`, so `OptionEnum::dimensions()` does not resolve. The trap is that `CapabilityEnum::EMBEDDING_GENERATION` **is** present in the bundled enum, so declaring the capability looks fine right up until `EmbeddingGenerationModelInterface` fatals as an unknown interface.

Do not bundle the SDK to close the gap. `WordPress/ai-provider-for-openai` 1.1.0 is the shipped precedent: `wordpress/php-ai-client: ^1.4` stays in `require-dev` (plus `suggest`) with `/vendor` in `.distignore`, and every 1.4-only symbol is gated at runtime — `interface_exists( EmbeddingGenerationModelInterface::class )` wraps both the `embeddingGeneration()` / `dimensions()` block in the metadata directory and the `OpenAiEmbeddingGenerationModel` branch of `createModel()`, so on a pre-1.4 SDK the plugin simply advertises no embeddings instead of fataling. Use `version_compare( AiClient::VERSION, '1.4.0', '>=' )` for surface that isn't a class or interface. Bundling is the riskier path, not the safe one: `wp-settings.php` requires `wp-includes/php-ai-client/autoload.php` before any plugin loads, so a second copy of `WordPress\AiClient\*` either loses the race or replaces core's SDK site-wide. The other flagships implement no embedding model (Anthropic 1.0.4 and Google 1.1.1), which makes OpenAI 1.1.0's `OpenAiEmbeddingGenerationModel` (`@since 1.1.0`) the released model-side reference to copy. Read `references/capabilities-declaration.md` for the exact enum, metadata, and model contract, and read the 1.4.0 tag of the SDK rather than core's copy.

### 3) Let auto-discovery handle the connector

Once your provider is in `AiClient::defaultRegistry()`, the Connectors API discovers it automatically and creates the connector entry with the right metadata. **You do not need to call `register()` on the connector registry yourself.** The flow:

1. WordPress fires `init`.
2. `_wp_connectors_init()` runs, registers built-in connectors (Anthropic/Google/OpenAI), then queries `AiClient::defaultRegistry()` for everything else.
3. Your provider's metadata is merged on top of any defaults (provider registry values win).
4. The `wp_connectors_init` action fires, giving plugins a final chance to override.

If your provider used `api_key` auth, the database setting `connectors_ai_{your_id}_api_key` is created automatically and the env var / constant pattern `{YOUR_ID}_API_KEY` (uppercased) is wired up.

### 4) Override metadata only when needed

Use `wp_connectors_init` if you need to change an existing connector's display data — for example, an agency overriding the Anthropic connector description for a white-label install:

```php
add_action( 'wp_connectors_init', function ( WP_Connector_Registry $registry ) {
    if ( $registry->is_registered( 'anthropic' ) ) {
        $connector = $registry->unregister( 'anthropic' );
        $connector['description'] = __( 'Custom description for our managed Anthropic deployment.', 'my-plugin' );
        $registry->register( 'anthropic', $connector );
    }
} );
```

Notes:

- Always `is_registered()` before `unregister()`. Unregistering a missing connector triggers `_doing_it_wrong()`.
- `unregister()` returns the data; mutate it; pass back to `register()`.
- IDs must match `/^[a-z0-9_-]+$/` (lowercase alphanumeric, hyphens, underscores). Hyphens are normalized to underscores when Core derives the setting / env var / constant names.
- Outside the `wp_connectors_init` callback, query through `wp_get_connector()` / `wp_get_connectors()` — do not access the registry directly.

### 5) Confirm the API key source order

For `api_key` connectors, the AI Client looks up the key in this order. Document this in your provider plugin's readme so admins know:

1. **Environment variable** — `{PROVIDER_ID}_API_KEY` (uppercased)
2. **PHP constant** — `define( '{PROVIDER_ID}_API_KEY', '...' );` in `wp-config.php`
3. **Database** — the `connectors_ai_{provider_id}_api_key` setting, edited via Settings → Connectors

Database storage is unencrypted by default but masked in the UI. The canonical AI plugin (`WordPress/ai` v1.1.0+) ships an opt-in **Key Encryption** experiment that transparently encrypts `connectors_ai_*_api_key` options at rest (libsodium via a bundled secrets API) and restores plaintext on opt-out or deactivation. Core-level encryption is still being explored upstream ([#64789](https://core.trac.wordpress.org/ticket/64789)).

**Application-password connectors (core 7.1).** `authentication.method` accepts `'api_key' | 'application_password' | 'none'`. This is **core**, not a Gutenberg-only evolution: `wordpress-develop` branch `7.1` carries it in `src/wp-includes/class-wp-connector-registry.php` and `src/wp-includes/connectors.php` under `@since 7.1.0`, and the built Settings → Connectors route (`src/wp-includes/build/routes/connectors-home/`) renders the credentials UI. It reached core through Gutenberg 23.6 ([#79403](https://github.com/WordPress/gutenberg/pull/79403)); Gutenberg still ships its own copy under `lib/compat/wordpress-7.0/`, so a 7.0 site with a current Gutenberg gets the same surface. The contract mirrors `api_key` with one twist — the credential is a *pair*:

- `env_var_name` / `constant_name` hold a single `username:password` string (e.g. `remote-user:abcd efgh ijkl mnop 1234`), split on the **first** colon so passwords may contain colons. A non-empty value that won't parse triggers `_doing_it_wrong()` and is skipped, falling through to the next source.
- The database setting stores an array of `username` + `password`, registered as an `object` setting and masked in `/wp/v2/settings` (the password becomes 16 `•` characters). Resubmitting the masked value keeps the stored password, and an empty username discards both fields so a partial update can't orphan a secret. `setting_name` is auto-generated as `connectors_{$type}_{$id}_application_password` when omitted (hyphens in type/ID normalized to underscores), or can be set explicitly.
- `credentials_url` should point where the user *creates* the application password (e.g. the remote site's `wp-admin/profile.php`).
- Unlike `api_key`, these credentials are masked but **not validated** on write — there is no provider round-trip.

Typical use is non-AI connector types like `content_source` (remote WordPress) rather than `ai_provider`. A complete registration example ships as Gutenberg's e2e fixture `packages/e2e-tests/plugins/connectors-application-password.php`. On core 7.0 without Gutenberg 23.6+, the method is rejected by `register()` — gate on the target version.

### 6) Verify the connector card appears

Check Settings → Connectors. You should see a card with your provider's name, description, logo, a "Get API key" link pointing at `authentication.credentials_url`, and a status indicator showing where the key is being read from (or "not configured").

If the connector isn't showing up:

- Confirm `var_dump( wp_supports_ai() )` is `true`. If it's false — `WP_AI_SUPPORT` defined falsey in `wp-config.php`, or a plugin/host filtering `wp_supports_ai` — `register()` returns `null` for every `ai_provider` connector with **no** `_doing_it_wrong()` (core treats a disabled AI surface as intentional), and `_wp_connectors_init()` skips AI discovery entirely. The tell is that the built-in Anthropic/Google/OpenAI cards are missing too.
- Confirm the provider class actually registers — add a temporary `error_log()` in your registration callback and reload.
- Confirm the registration runs *before* `_wp_connectors_init` (priority 15 on `init`). Use `init` priority 5 or earlier (anything ≤ 14).
- Confirm the connector ID matches `/^[a-z0-9_-]+$/` — hyphens are allowed (normalized to underscores in the derived key names); an invalid ID (e.g. uppercase) triggers `_doing_it_wrong()` and `register()` returns `null`.
- Confirm `type` is `ai_provider` so the connector is treated as an AI provider and discovered from the AI Client registry. (The admin screen actually renders a card for *any* connector whose `authentication.method` is `api_key` — the built-in Akismet connector is `type` `spam_filtering` and still appears — so a missing card isn't explained by `type` alone. A `none`-auth connector is the reverse: it registers fine and `wp_get_connector()` returns it, but the screen assigns a render component only for `api_key` and `application_password`, so it never gets a card.)

## Saving an API key runs a live provider call — make discovery reliable

Core validates an AI-provider API key **against the live provider**, and a failing check destroys the key the admin just saved. This is the single most-reported "my key keeps going blank" bug, and it is not a sanitize-callback bug:

1. The `api_key` setting's `sanitize_callback` is plain `sanitize_text_field`. It validates nothing, and the REST settings controller **persists the submitted key first**.
2. Afterwards, on `rest_post_dispatch`, `_wp_connectors_rest_settings_dispatch()` runs — only for `POST`/`PUT` to `/wp/v2/settings`, and only for connectors whose `type` is `ai_provider`.
3. It calls `_wp_connectors_is_ai_api_key_valid()`, which sets the submitted key on the AI Client registry and asks `ProviderRegistry::isProviderConfigured()` → `$className::availability()->isConfigured()`. `createProviderAvailability()` is abstract, so **your provider decides what that costs**: the shipped `ListModelsApiBasedProviderAvailability` performs a live `listModelMetadata()` round trip, while `GenerateTextApiBasedProviderAvailability` performs a one-token `generateTextResult()` call instead.
4. On anything other than `true` — `false` from `isConfigured()`, a swallowed `NetworkException` from a timeout, or `null` from a caught exception — Core runs `update_option( $setting_name, '' )` and blanks the value in the response. So a discovery **timeout stores an empty string** over a key that may have been perfectly valid.

There is no admin-visible error from the server: no `WP_Error`, no `add_settings_error()`, no admin notice, and only a debug-only `wp_trigger_error()` on the exception branch. The shipped Settings → Connectors screen compensates client-side — it notices the value came back empty and renders a `role="alert"` message reading "It was not possible to connect to the provider using this key." Any write that does **not** go through `POST /wp/v2/settings` — `wp option update`, a custom settings screen, a direct `update_option()` — skips validation entirely and gets neither the blanking nor the message.

What that means for a provider you ship:

- Make `availability()` / model discovery fast and reliable, and prefer the cheapest `ProviderAvailabilityInterface` your API supports. Note that `listModelMetadata()` results are cached for 86400 seconds keyed on provider class plus AI Client version — **not** on the API key — so on a site with a persistent object cache the check may not be live at all, and on a site without one it is live on every save.
- Test all three paths before shipping: an invalid key (expect blanking plus the screen's alert), an unreachable or slow endpoint (same outcome — this is the surprising one), and a valid key (expect persistence).
- When a user reports a blanked key, look at provider reachability from the server, not at the settings form.

## Verification

- `wp_is_connector_registered( 'your_provider_id' )` returns `true` after `init`.
- `wp_get_connector( 'your_provider_id' )` returns the expected `name`, `description`, `type`, `authentication`, and `plugin.file` (if set).
- The connector card renders on Settings → Connectors with the correct logo, description, and credentials link.
- Setting an API key via env var, constant, and database (in turn) shows the right source on the card.
- A feature plugin calling `wp_ai_client_prompt()->is_supported_for_text_generation()` returns `true` once your provider is configured.
- For every advertised PHP AI Client 1.4 embedding model, `AiClient::input( ... )->usingDimensions( ... )->isSupported()` and generation succeed with one correctly sized vector per input.

## Failure modes / debugging

- **Connector doesn't appear**: registration runs too late (after `_wp_connectors_init`), or `type` isn't `ai_provider`, or ID has invalid characters, or `wp_supports_ai()` is false. The last one is the silent case — core deliberately skips `_doing_it_wrong()` there — and it takes the built-in AI connectors down with yours; check it with `var_dump( wp_supports_ai() )`.
- **"Settings → Connectors shows the card but says no key configured" even though `MY_PROVIDER_API_KEY` is set**: confirm the constant/env var name matches `{PROVIDER_ID}_API_KEY` exactly (uppercased ID, `_API_KEY` suffix). The system does not respect alternate naming.
- **Override not taking effect**: hooked too late, or hooked outside `wp_connectors_init`. Setting the registry instance outside `init` triggers `_doing_it_wrong()`.
- **Duplicate-ID error during `register()`**: another plugin already registered that ID. Use `is_registered()` first; if you need to override, follow the unregister-modify-register pattern.
- **Provider works locally but not on a managed host**: the host may have set `MY_PROVIDER_API_KEY` as a sealed env var. Env beats constant beats database — that's the intended priority and the host's value will win.
- **"My API key saves as blank"**: the post-dispatch validation call failed. See "Saving an API key runs a live provider call" above — a timeout during model discovery stores an empty string with no server-side error. Reproduce by pointing the provider at an unreachable host and saving.
- **Embedding model never resolves**: metadata is missing `CapabilityEnum::embeddingGeneration()`, the exact `OptionEnum::inputModalities()` combination, or `OptionEnum::dimensions()` for the requested value; do not substitute made-up capability names.
- **`OptionEnum::dimensions()` throws, or `EmbeddingGenerationModelInterface` is "not found"**: the site is resolving core's bundled SDK, which is pre-1.4 through WP 7.1. `CapabilityEnum::embeddingGeneration()` resolving is not evidence the rest of the surface exists. Gate the 1.4-only surface on `interface_exists( EmbeddingGenerationModelInterface::class )` so the model is never advertised there; don't bundle a second SDK copy to force it.
- **Embedding generation resolves but fails at runtime**: the concrete model does not also implement `ModelInterface`, returned a different vector count than input count, or reported dimensions that do not match every vector.

## Escalation

For canonical detail before inventing patterns:

- Connectors API dev note: https://make.wordpress.org/core/2026/03/18/introducing-the-connectors-api-in-wordpress-7-0/
- AI Client dev note (architecture and provider plugin list): https://make.wordpress.org/core/2026/03/24/introducing-the-ai-client-in-wordpress-7-0/
- PHP AI Client source (registry contract): https://github.com/WordPress/php-ai-client
  - `src/Providers/Contracts/ProviderInterface.php` and `src/Providers/AbstractProvider.php`
  - `src/Providers/Models/Enums/CapabilityEnum.php` and `OptionEnum.php`
  - `src/Providers/Models/EmbeddingGeneration/Contracts/EmbeddingGenerationModelInterface.php`
- Reference provider plugins:
  - https://wordpress.org/plugins/ai-provider-for-anthropic/
  - https://wordpress.org/plugins/ai-provider-for-google/
  - https://wordpress.org/plugins/ai-provider-for-openai/
- Community provider testing call (OpenRouter, Ollama, Mistral patterns): https://make.wordpress.org/ai/2026/03/25/call-for-testing-community-ai-connector-plugins/

References:
- `references/provider-registration.md`
- `references/capabilities-declaration.md`
- `references/community-providers.md`
