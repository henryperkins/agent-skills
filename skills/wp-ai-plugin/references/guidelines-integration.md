# Guidelines integration

The AI plugin v0.8.0 introduced Guidelines integration (#359). The released AI plugin 1.3.0 still reads Gutenberg's legacy `wp_guideline` custom post type when an Ability declares interest.

The supported window is precise: **Gutenberg 23.0 through 23.5.x** registers that storage. **Gutenberg 23.6.0+** replaced it with the experimental Knowledge model, while AI plugin 1.3.0 still checks `post_type_exists( 'wp_guideline' )`. In that combination, `Guidelines::is_available()` returns `false`, `get_guidelines()` returns `null`, and `format_for_prompt()` returns `''`. WordPress/ai **PR #988** is the pending adaptation; until a release containing it is installed, do not describe Guidelines as active on Gutenberg 23.6.0+.

Gutenberg 23.6.0+ uses the following model under `lib/experimental/knowledge/`:
>
> - Storage becomes a **`wp_knowledge`** CPT with a `wp_knowledge_type` taxonomy; knowledge *types* are `guideline`, `memory`, and `note` (filterable via `wp_knowledge_types`) — Guidelines become one type of Knowledge.
> - The post-meta singleton dissolves into **per-scope rows**: each scope is backed by one `guideline`-typed row with slug `guideline-{scope}`; the `blocks` scope instead holds per-block rows slugged `guideline-block-*`.
> - The scope registry is `wp_guideline_scopes()` (filterable), shipping `site`, `copy`, `images`, `blocks`, `additional`. Registering a new scope via the filter grows the Settings → Guidelines page automatically.
> - REST: rows through the standard `/wp/v2/knowledge` collection; the read-only scope registry at `/wp/v2/knowledge/guideline-scopes`. Per-scope length is `wp_guideline_max_length()` (default 5000, filter `wp_guideline_max_length` — parallel to the AI plugin's own `wpai_max_guideline_length`).
>
> WordPress 7.1 core ships neither `wp_guideline` nor `wp_knowledge`; these are Gutenberg-plugin experiments.

## Where Guidelines live

For Gutenberg 23.0 through 23.5.x, Guidelines are stored as a `wp_guideline` custom post type. Each post stores guidelines in four post meta fields:

- `_guideline_copy` — text/copy guidelines (voice, tone, banned terms)
- `_guideline_images` — image guidelines (style, accessibility, alt text rules)
- `_guideline_site` — site context (what the site is about)
- `_guideline_additional` — anything else

Plus per-block guidelines via `_guideline_block_{$sanitized_block_name}` (e.g., `_guideline_block_core_paragraph`).

The `WordPress\AI\Services\Guidelines` service queries both `publish` and `draft`, newest first. When the `wp_guideline_type` taxonomy exists, it restricts the query to the `content` term so an artifact record cannot shadow the site-wide guideline record. Site owners edit Guidelines through Gutenberg's UI, not through the AI plugin's settings.

## The integration pattern (most code paths)

The cleanest path: **declare `guideline_categories()` on your `Abstract_Ability` subclass.** The Ability's `get_system_instruction()` automatically appends formatted Guidelines to the system instruction (it loads the base text via `load_system_instruction_from_file()`, then folds in the guidelines):

```php
class My_Internal_Linker_Ability extends \WordPress\AI\Abstracts\Abstract_Ability {

    /**
     * @return list<string> Subset of: 'site', 'copy', 'images', 'additional'.
     */
    protected function guideline_categories(): array {
        return array( 'site', 'copy' );
    }

    // ... rest of the Ability ...
}
```

When the Ability runs:

1. `get_system_instruction()` calls `load_system_instruction_from_file()`, which auto-detects exactly one filename — `system-instruction.php`, in the Ability class's own directory. Any other name must be passed explicitly as the first argument (`$this->get_system_instruction( 'alt-text-system-instruction.php' )`, as `Alt_Text_Generation` does). `get_system_instruction()`'s own docblock still names `prompt.php`; that is stale — no such file exists in the plugin and no code path looks for one.
2. If the base instruction is non-empty AND `guideline_categories()` returns non-empty, `get_system_instruction()` calls `get_guidelines_for_prompt( $block_name )`, which yields `''` unless `should_use_guidelines()` passes (CPT registered and `wpai_use_guidelines` still true). The `'' !== $instruction` guard comes first, so an Ability whose instruction file is missing or unreadable silently loses its Guidelines too.
3. The result is appended after a fixed preamble whose source literal contains `site&#039;s`: *"The following guidelines represent the site's editorial standards. Apply them where relevant. Do not fabricate content to satisfy guidelines. If guidelines conflict with the input, prioritize accuracy."* Image Generation uses a shorter preamble and omits the “Do not fabricate content” sentence.
4. The full instruction (base + preamble + `<guidelines>...</guidelines>` block) passes through the global `wpai_system_instruction` filter before reaching the model; that hook ships in v0.7.0. In v1.3.0, `get_system_instruction()` then runs the result through the Ability-scoped `wpai_{$ability_slug}_system_instruction` filter.

Returning an empty array (the default) skips Guidelines entirely.

## Categories cheat sheet

Pick the categories your Ability actually benefits from:

| Category | When to use |
| --- | --- |
| `site` | Anything that should know what the site is about — name, audience, mission |
| `copy` | Anything generating text that should match site voice/tone |
| `images` | Image-generating Abilities, alt-text generation |
| `additional` | Catch-all for site-specific rules that don't fit elsewhere |

Existing Abilities in the AI plugin source show real choices: `Title_Generation` uses `['site', 'copy']`, image-related Abilities use `['site', 'images']`, etc. Search source for `guideline_categories(): array` to see all the existing declarations.

## Using Guidelines outside `Abstract_Ability`

If you're not using `Abstract_Ability` (e.g., you're writing a standalone REST endpoint or admin tool that wants to respect Guidelines), use the singleton service directly:

```php
use WordPress\AI\Services\Guidelines;

$service = Guidelines::get_instance();

if ( ! $service->is_available() ) {
    // Legacy wp_guideline CPT is absent: Gutenberg < 23.0, 23.6.0+, or experiment off.
    $guidelines_xml = '';
} else {
    $guidelines_xml = $service->format_for_prompt(
        array( 'site', 'copy' ),  // Categories.
        'core/paragraph'          // Optional block name for block-specific guidelines.
    );
}

// Stack onto your own system instruction.
$system_instruction = $base_instruction;
if ( '' !== $guidelines_xml ) {
    $system_instruction .= "\n\n" . $guidelines_xml;
}
```

The service caches results internally (singleton pattern). For tests, call `Guidelines::reset_cache()` between cases.

### Available methods on the service

| Method | Returns | Use |
| --- | --- | --- |
| `is_available(): bool` | `true` if `wp_guideline` CPT is registered | Gate before calling other methods |
| `get_guidelines( ?string $category = null ): ?array` | Keyed array of category → text, or null | Direct access to raw guideline strings |
| `get_block_guidelines( string $block_name ): ?string` | Block-specific guideline text or null | When you only want guidelines for one block type |
| `format_for_prompt( array $categories, ?string $block_name = null ): string` | XML-tagged string suitable for prompt injection, or `''` | The standard integration call |
| `reset_cache(): void` | — | Test cleanup |

## XML output shape

`format_for_prompt()` returns a string like:

```xml
<guidelines>
<site-context>The site is a Brooklyn-based food blog focused on weeknight cooking.</site-context>
<copy-guidelines>Use a friendly, conversational tone. Avoid superlatives.</copy-guidelines>
<block-guidelines>For paragraph blocks, keep sentences under 30 words.</block-guidelines>
</guidelines>
```

Tag names per category:

- `site` → `<site-context>`
- `copy` → `<copy-guidelines>`
- `images` → `<image-guidelines>`
- `additional` → `<additional-guidelines>`
- block-specific → `<block-guidelines>`

Each category is wrapped only if it has content. Returns empty string if nothing applies.

## Length limits

Each category is truncated to the value of the `wpai_max_guideline_length` filter (default 5000 characters). Override for sites with shorter or longer guideline content:

```php
add_filter( 'wpai_max_guideline_length', fn() => 2000 );
```

## Disabling Guidelines globally

The `wpai_use_guidelines` filter (default `true`) gates the entire integration:

```php
add_filter( 'wpai_use_guidelines', '__return_false' );
```

When false, `should_use_guidelines()` returns false even if the CPT is registered. Use this for tests, staging environments, or sites where Guidelines should be ignored.

## Cache invalidation

The service caches guidelines on first read for the request. If your code edits Guidelines and then expects the new values to take effect *in the same request*, call `Guidelines::reset_cache()` after the edit. Most code doesn't need this — the cache is per-request, so the next pageload reads fresh data.

## What not to do

- **Don't bypass the integration with a "raw mode" toggle in your Ability.** If site owners want different behavior in different contexts, that's what Guidelines' own context system is for.
- **Don't read `wp_guideline` CPT directly with `get_posts()`.** The service handles `publish` and `draft`, newest-first ordering, the `content` taxonomy term when available, caching, sanitization, and length limits.
- **Don't pass user-supplied content as guideline text into the prompt.** The XML-wrapping is a structural marker for the model, not a security boundary. User content goes in the `with_text()` payload.
- **Don't make your Ability worse when Guidelines is on.** If the system instruction stops working when Guidelines append themselves, the prompt was fragile. Test with and without Guidelines.

## Source

- `includes/Services/Guidelines.php` — full service implementation
- `includes/Abstracts/Abstract_Ability.php` — search for `guideline_categories` and `get_guidelines_for_prompt` to see how the integration ties into Ability execution
- `includes/Abilities/Title_Generation/Title_Generation.php` — real Ability with `guideline_categories()` declared
