# Core AI Skills Upstream Revalidation — 2026-08-24

> **Superseded for current-state claims** by `docs/core-ai-skills-audit-2026-08-25.md`.
> This document remains the historical record of the 1.9.0 revalidation and is
> intentionally not rewritten. Where the two disagree about how an upstream
> behaves today, the 2026-08-25 audit is authoritative — it corrected several
> findings against tagged executable source, including the WordPress/ai
> request-log filter count. Cite this file only for what was believed on
> 2026-08-24.

This was the evidence snapshot for the six Core AI skills:

- wp-abilities-api
- wp-abilities-audit
- wp-abilities-verify
- wp-ai-client
- wp-ai-connectors
- wp-ai-plugin

It supplements the historical audits in docs/abilities-api-audit.md and
docs/ai-plugin-connectors-audit.md. Those documents describe the repository
state on 2026-08-15 and are intentionally not rewritten.

## Authority rule

For release behavior, use sources in this order:

1. executable code at the released tag or release package;
2. tests shipped at that ref;
3. the release changelog/readme;
4. handbook and announcement prose.

When those disagree, the skills must describe the executable behavior and
record the documentation mismatch. A helper, class, or changelog entry does
not prove that the corresponding runtime path is active.

## Reproducible baseline

Before this revalidation, both commands passed:

    node eval/harness/run.mjs
    node shared/scripts/check-upstream-drift.mjs

That result was an offline false-negative. The committed indices still named
WordPress 7.0.4, Gutenberg 23.7.2, and WordPress/ai 1.2.0, so the drift checker
had no current upstream state to compare with the skills.

## Released-source matrix

| Surface | Released ref and date | Immutable source ref | Relevant source | Local state before remediation |
|---|---|---|---|---|
| WordPress Core | 7.1, 2026-08-19 | release ZIP SHA-256 d1ae02b5ae18428031ffc3943659fa87ab361d827f4aa804adf9276e4dc75df6; 7.1 branch c70675b7a1a04101065b0533f5c778bd92f4c69f | abilities-api.php, abilities-api/, REST ability controllers, abilities.php, connectors.php, class-wp-connector-registry.php, ai-client.php, php-ai-client/ | wp-abilities-api still says RC3 and Core verified through 7.0; the other Core AI skills have no independent Core drift marker |
| Gutenberg | 23.8.0, 2026-08-19 | ae8b34d78e1abc6d1c866fdc00080a1452de82ad | packages/abilities, packages/core-abilities, lib/experimental/knowledge | committed index is 23.7.2 and no complete Core AI declaration set exists |
| WordPress/ai | 1.3.0, 2026-08-18 | fc115ba4a65430a25f8cfe3ef3e105664e1f30ef | ai.php, includes/Experiments, includes/Abilities, includes/helpers.php, includes/Deprecated.php | wp-ai-plugin declares 1.2.0 and classifies released 1.3 surfaces as develop-only |
| MCP Adapter | 0.6.1, 2026-08-13 | 23cb53e0b82f39238eec1c38cb055e28aa30fa7c | ability exposure and server registration | wp-abilities-api is current; wp-abilities-verify has no independent marker |
| PHP AI Client | 1.4.0, 2026-07-15 | a31b0ec6d4676d4a464055fef72173e2d8995214 | embedding builders, model interfaces, results, capability/options enums | wp-ai-client and connector guidance are substantively current |
| WP AI Client | 0.4.0, 2026-03-01 | f53a17eeb5aa7d7e82faaa598ea553940544bcf6 | standalone REST/JS layer and Ability_Function_Resolver | skill prose names 0.4.x but no release index or drift gate exists |
| Anthropic provider | 1.0.4, 2026-08-18 | 91c5eb9bfc5e090eb855fd3f0d25540b3d446256 | model metadata, tool-call argument normalization | connector references still name 1.0.3 |
| Google provider | 1.1.1, 2026-08-17 | 89921157d54f0c0d8753f6f84dffeb37acd53645 | provider registration and media result handling | guidance is current but untracked |
| OpenAI provider | 1.1.0, 2026-08-17 | d446edf830cec58c010aa0bb7a38dee2503e8715 | embedding model, model-aware options, image editing | guidance is current but untracked |

Release pages:

- https://wordpress.org/news/2026/08/mary-lou/
- https://github.com/WordPress/gutenberg/releases/tag/v23.8.0
- https://github.com/WordPress/ai/releases/tag/1.3.0
- https://github.com/WordPress/mcp-adapter/releases/tag/v0.6.1
- https://github.com/WordPress/php-ai-client/releases/tag/1.4.0
- https://github.com/WordPress/wp-ai-client/releases/tag/0.4.0
- https://github.com/WordPress/ai-provider-for-anthropic/releases/tag/1.0.4
- https://github.com/WordPress/ai-provider-for-google/releases/tag/1.1.1
- https://github.com/WordPress/ai-provider-for-openai/releases/tag/1.1.0

## WordPress 7.1 final versus RC3

The 7.1 RC3 archive used by the earlier audits has SHA-256
6d0d8c6ce77af46e81292c0b3d26a6a8274849a976fe1a4a4a24799f120b5990.
A recursive byte comparison against the final 7.1 release package found these
paths identical:

- wp-includes/abilities-api.php
- wp-includes/abilities-api/
- wp-includes/abilities.php
- the list, categories, and run REST ability controllers
- wp-includes/connectors.php
- wp-includes/class-wp-connector-registry.php
- wp-includes/ai-client.php
- wp-includes/php-ai-client/

Therefore the previously audited 7.1 behavior remains valid. The required
change is to replace prerelease markers with a released 7.1 baseline and give
each dependent skill an independent drift declaration.

## Gutenberg 23.8.0 versus 23.7.2

lib/experimental/knowledge/ is byte-identical between the two tags.
packages/abilities and packages/core-abilities have package/changelog changes
and remove import-group comments from TypeScript sources and tests. The
executable statements, exported APIs, reducers, selectors, validation, and
tests are otherwise unchanged. No skill procedure changes are required, but
the verified Gutenberg baseline and drift coverage must advance to 23.8.0.

## WordPress/ai 1.3.0

### Custom Abilities changes registration behavior

The 1.3.0 tag has 19 entries in Experiments::EXPERIMENT_CLASSES, adding
Content Translation, Slug Generation, and Custom Abilities to the 1.2 set.
Custom Abilities gates these five IDs behind
wpai_feature_custom-abilities_enabled:

- core/read-content
- core/read-settings
- core/read-users
- ai/get-post-details
- ai/get-post-terms

Third parties may add gated implementations through wpai_gated_abilities.
The current smoke fixture enables the global switch but not Custom Abilities,
then incorrectly requires three of the gated IDs. Against 1.3.0 those three
booleans are false.

### Newly released extension surface

The 1.3.0 tag ships the three ability-scoped prompt filters, settings
import/export, Site Health coverage, public WordPress\AI\log_ai_request(),
meta-key migration, and new experiment/filter surfaces. Local references
still label several of these as develop-only and omit some filters.

The hook audit must include at least:

- wpai_content_classification_available_terms
- wpai_content_classification_min_confidence
- wpai_content_classification_candidate_pool_size
- wpai_bulk_action_max_items
- wpai_alt_text_allowed_image_mime_types
- wpai_alt_text_image_download_timeout
- wpai_alt_text_image_max_download_bytes
- wpai_gated_abilities
- wpai_remove_data_on_uninstall
- wpai_slug_generation_number_of_suggestions
- wpai_{$ability_slug}_system_instruction
- wpai_{$ability_slug}_prompt
- wpai_{$ability_slug}_prompt_builder

### Embedding changelog/source conflict

CHANGELOG.md says the embedding code was brought over and loaded
conditionally. Executable bootstrap code says otherwise. In ai.php lines
77–85, SDK_Overlay::register() is commented out with a warning that upstream
embedding changes are breaking and should not yet be built upon.

includes/helpers.php still declares supports_embedding_generation() and
generate_embeddings(). The former requires AiClient and EmbeddingBuilder
classes; without overlay registration, the standalone-only EmbeddingBuilder
is absent on stock WordPress 7.1. generate_embeddings() therefore returns
WP_Error code ai_embeddings_unsupported.

Current guidance must say: the helper API exists in WordPress/ai 1.3.0, but
embedding generation is unavailable on stock Core 7.1 unless a future
source-verified integration supplies the missing 1.4 surface. Version checks
alone are insufficient.

## Provider deltas

Anthropic 1.0.4 fixes model metadata for Claude Opus 4.7 and later/Claude 5
so unsupported sampling parameters are not advertised, and normalizes empty
tool-call arguments as JSON objects. Google 1.1.1 prevents warnings when
processing base64 image results. OpenAI 1.1.0 is the released embedding
provider reference and makes sampling/reasoning options model-aware.

Only the Anthropic local pin is stale, but all three providers and standalone
WP AI Client lack committed release indices and independent drift gates.

## Automation gaps

- update-upstream-indices.mjs tracks Core, Gutenberg, WordPress/ai, MCP
  Adapter, and PHP AI Client, but not standalone WP AI Client or providers.
- ai-generate-updates.mjs hashes only Core, Gutenberg, and the version map; it
  cannot detect the AI plugin, MCP, PHP client, standalone client, or provider
  releases already present in indices.
- Its Core affected-skill list omits the six Core AI consumers, and its
  Gutenberg list is incomplete.
- check-upstream-drift.mjs incorrectly claims the wp-abilities-api Core gate
  covers the Core half of wp-ai-client.
- The five most recent scheduled AI Skill Maintenance runs (2026-07-27 through
  2026-08-24) all failed at **Generate skill updates** with the same redacted
  category: missing `ANTHROPIC_API_KEY`. Index refresh succeeded first, but both
  PR jobs were skipped, so the deterministic refresh was discarded. Repository
  owner action: configure the `ANTHROPIC_API_KEY` Actions secret before a live AI
  run. Code action: preflight configuration and make the index-only path run on
  generation failure, skip, or zero edits.
- An index PR created with GITHUB_TOKEN may not trigger the ordinary pull
  request workflow. The refresh workflow needs its own validation/report and
  an optional App/PAT token path.

## Remediation map

| Finding | Plan task |
|---|---:|
| AI plugin 1.2 pin and develop-only labels | 2–3 |
| Custom Abilities registration/smoke regression | 2–4 |
| Embedding changelog/source contradiction | 1–3 |
| Core/Gutenberg prerelease or stale markers | 5 |
| Anthropic 1.0.3 reference | 5 |
| Missing standalone/provider indices | 6 |
| Incomplete/false drift gates | 7 |
| Incomplete and failing AI generator | 8 |
| Refresh PR validation/trigger gap | 9 |
| Coordinated release metadata | 10 |
