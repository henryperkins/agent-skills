# AI Plugin & Connectors audit — skills vs. canonical sources

Covers `wp-ai-plugin` and `wp-ai-connectors` (SKILL.md plus all seven reference files). Audited
2026-08-15 against cloned upstream sources rather than documentation. All findings below are
closed; the finding text is kept so the reasoning behind the current guidance stays legible.

Sibling audit: `abilities-api-audit.md` covers the Abilities API surface these two skills sit on
top of, including the MCP exposure semantics that `wp-ai-plugin` references.

**Release state at audit time.** `WordPress/ai` latest tag **1.2.0** (14 July 2026) with `develop`
at `a0f5ea2` (14 August 2026, still declaring version `1.2.0`). `wordpress-develop` `trunk` is
7.2-alpha, branch `7.1` is at **RC3** and unreleased, latest stable core is **7.0.4**.
`php-ai-client` latest **1.4.0** (15 July 2026). Provider plugins: Anthropic 1.0.3, Google 1.1.0,
OpenAI 1.0.3. Gutenberg latest stable **v23.7.2** (v23.8.0-rc.1 out).

## Canonical sources

Priority order when re-verifying. The source outranks the docs during a release cycle, and for
the Connectors API "the source" means three separate repositories.

### WordPress AI plugin

| Tier | Source |
|---|---|
| Implementation | `WordPress/ai` **at the release tag** (`1.2.0`) — `includes/Abstracts/`, `includes/Features/Loader.php`, `includes/Experiments/Experiments.php`, `includes/Abilities/`, `includes/Services/Guidelines.php` |
| Implementation | `WordPress/ai` `develop` — diff against the tag to find the unreleased boundary; `@since x.x.x` marks it |
| Documentation | `CHANGELOG.md` and `readme.txt` in-tree — but see finding P5: the 1.2.0 changelog names a filter that does not exist |
| Documentation | Make/AI blog `make.wordpress.org/ai/` (release notes, roadmap) |
| Distribution | `wordpress.org/plugins/ai/` (slug `ai`) |

### Connectors

Three tiers that version independently and must be tracked separately.

| Tier | Source |
|---|---|
| Implementation | `wordpress-develop` **at the release branch** — `src/wp-includes/connectors.php`, `src/wp-includes/class-wp-connector-registry.php`, `src/wp-includes/ai-client.php`; `@since` tags separate 7.0 from 7.1 |
| Implementation | `wordpress-develop` `src/wp-includes/php-ai-client/` — the **vendored** SDK. Not the same as the standalone package; see finding C2 |
| Implementation | `wordpress-develop` `tests/phpunit/tests/connectors/` — settles behavior the source leaves ambiguous |
| Implementation | `WordPress/php-ai-client` **at the tag** (`1.4.0`) — `src/Providers/Contracts/ProviderInterface.php`, `src/Providers/Models/Enums/`, `src/Providers/Models/DTO/ModelConfig.php` (the real source of `OptionEnum` cases), `src/Providers/Models/EmbeddingGeneration/` |
| Implementation | `WordPress/ai-provider-for-{anthropic,google,openai}` — the reference provider plugins. Read `plugin.php` and `composer.json` together; the SDK constraint matters |
| Implementation | `WordPress/gutenberg` `lib/compat/wordpress-7.0/{connectors,class-wp-connector-registry,default-connectors}.php` — how the API reaches 7.0 sites, and where post-7.0 work lands first |
| Documentation | [Connectors API dev note](https://make.wordpress.org/core/2026/03/18/introducing-the-connectors-api-in-wordpress-7-0/) · [AI Client dev note](https://make.wordpress.org/core/2026/03/24/introducing-the-ai-client-in-wordpress-7-0/) |

**Read the release branch, not `trunk`.** Same rule as the abilities audit. `connectors.php` is
24 KB on `7.0` and 33 KB on `7.1`; `trunk` (7.2-alpha) is currently byte-identical to `7.1`, but
that is a coincidence of timing, not a method.

**The AI plugin's `capability` metadata and the SDK's `OptionEnum` are both indirect.** Neither is
readable from the file you would expect. `OptionEnum` declares exactly one constant and derives
the rest by reflecting over `ModelConfig::KEY_*`; `Abstract_Feature` applies the `capability`
default in its constructor, not in any metadata declaration. Grepping the obvious file returns a
confidently wrong answer for both.

## Findings

### C1. Application-password connectors are core 7.1, not a Gutenberg-only evolution (moderate) — fixed

`wp-ai-connectors/SKILL.md` §5 framed the method as "Gutenberg 23.6+" and closed with "This is a
post-7.0 evolution carried by the Gutenberg plugin — on stock core without Gutenberg 23.6+, verify
the method and UI exist before building on them." That was true when written and is now wrong in
the direction that costs work: it tells an author to treat a shipped core API as speculative.

`wordpress-develop` branch `7.1` carries the whole surface under `@since 7.1.0` — the registry
accepts the method, `wp_connectors_parse_application_password_credentials()`,
`wp_connectors_get_application_password_credentials()` and
`wp_connectors_sanitize_application_password_credentials()` are all present,
`_wp_register_default_connector_settings()` registers an `object` setting with a username/password
schema, and the built admin route at `src/wp-includes/build/routes/connectors-home/content.js`
handles `application_password`. Gutenberg 23.7.2 still ships its copy under
`lib/compat/wordpress-7.0/` and added no 7.1 connectors compat file, which is the expected shape
once a compat API lands in core.

Details the skill did not carry, all verified in `7.1`: the credential string splits on the
**first** colon so passwords may contain colons; an unparseable env var or constant triggers
`_doing_it_wrong()` and falls through rather than failing hard; a resubmitted mask (16 `•`) keeps
the stored password; an empty username discards both fields; and unlike `api_key` these values are
masked but **never validated** against the remote.

Fixed in `SKILL.md` §5 (rewritten, retitled "core 7.1"), the frontmatter compatibility line, and
`references/provider-registration.md` (auth-method table replacing the "only two methods" prose,
connector-array comment, and the Settings → Connectors rendering paragraph).

### C2. Core does not bundle a PHP AI Client with the embedding surface (moderate) — fixed

The skill hedged correctly — "verify the Core build actually bundles PHP AI Client 1.4+" — but a
hedge is the wrong shape here, because the answer is knowable, stable, and the failure is a fatal
error rather than a missing feature.

Verified against the vendored `src/wp-includes/php-ai-client/` on both `7.0` and `7.1`:

- no `src/Providers/Models/EmbeddingGeneration/` — so `EmbeddingGenerationModelInterface` does not exist
- no `EmbeddingResult`, no `Embedding`, no `EmbeddingBuilder`
- no `ModelConfig::KEY_DIMENSIONS` — so `OptionEnum::dimensions()` does not resolve

**But `CapabilityEnum::EMBEDDING_GENERATION` is present in the bundled enum.** That constant
predates 1.4 and is the one piece of the surface an author would naturally test first, so the
capability declaration succeeds and the code looks supported right up to the point where the
interface is not found. This is the trap worth naming, and the skill named none of it.

The remedy is concrete rather than investigative: a provider offering embeddings must require
`wordpress/php-ai-client: ^1.4` in its own Composer bundle, which is the same mechanism the
flagship plugins already use for their SDK.

Fixed in `SKILL.md` (frontmatter, §2 rewritten, a new failure mode keyed to the exact symptom) and
`references/capabilities-declaration.md` (blockquote at the head of the embedding section).

### C3. No flagship provider is an embedding reference (minor) — fixed

`SKILL.md` and `references/provider-registration.md` both point at the three official plugins as
"the reference implementations," and §2 teaches embeddings. Their `composer.json` files say
otherwise: Anthropic and Google constrain `wordpress/php-ai-client` to `^0.4 || dev-trunk`, OpenAI
to `^1.1`, and none of the three implement an embedding model. An author following the skill's own
advice to copy from them would find nothing to copy.

Folded into the C2 rewrite in §2 so the absence is stated rather than discovered.

### C4. `provider-registration.md` was 7.0-only on authentication (minor) — fixed

The reference said "Only two methods are supported in WP 7.0" and its connector-array example
commented `'api_key' or 'none'`, so the reference and the SKILL disagreed with each other once the
SKILL gained its (Gutenberg-framed) application-password section. Both now carry the same 7.1 story.

Fixed alongside C1.

### P1. The `develop` delta was stale, and the drift inverts a behavior (moderate) — fixed

`wp-ai-plugin/SKILL.md` §8 and `references/experiments-framework.md` described `develop` as
seventeen Experiments, adding only `Content_Translation` past the 1.2.0 tag. Current `develop`
holds **nineteen**: `Content_Translation`, `Slug_Generation`, and `Custom_Abilities`, with the list
reordered so admin-category Experiments lead.

`Custom_Abilities` is not an eighteenth feature to list — it changes where five documented Ability
IDs come from. Its `register()` iterates a new `includes/Abilities/Gated/` registry
(`Gated_Abilities::GATED_ABILITY_CLASSES` = `Post_Utilities`, `Read_Settings`, `Read_Users`,
`Read_Content`) and runs the `Show_In_Abilities` polyfill only when a gated ability needs it. Those
are exactly the IDs 1.2.0 registers unconditionally: `core/read-content`, `core/read-settings`,
`core/read-users`, `ai/get-post-details`, `ai/get-post-terms`.

So if this ships, `wp_get_ability( 'core/read-content' )` legitimately returns null on a site with
the AI plugin active and the Experiment off — and Experiments are off by default. The skill's §4
guidance on exposing custom post types through `show_in_abilities` becomes conditional on the same
toggle. A skill that lists the new Experiment without saying this would leave a reader more
confident and less correct.

Fixed in `SKILL.md` §8 (nineteen, with a flagged paragraph on the inversion) and
`references/experiments-framework.md` (tag-vs-develop lists separated, `Custom_Abilities` and
`Slug_Generation` written up under "Added after v1.2.0", forward-pointer added to the built-in
Abilities section).

### P2. The `capability` metadata key was undocumented, and its default is not inert (moderate) — fixed

`Abstract_Feature::__construct()` reads `$metadata['capability'] ?? 'text_generation'` and exposes
it via `get_capability()` — in the `Feature` contract since v0.9.0 — which `Settings_Page` passes
to the Settings → AI screen. Both `SKILL.md` §2 and the `experiments-framework.md` contract listed
the metadata shape as `label / description / category / stability? / image?`, omitting it.

The omission has a consequence rather than being merely incomplete: a downstream admin-only or
utility Experiment that never calls a model inherits `'text_generation'` and advertises a
requirement it does not have. The plugin's own code shows the intended values — `'none'`,
`'vision'`, `'image_generation'` are all in the 1.2.0 tree, and `develop`'s `Custom_Abilities`
declares `'capability' => 'none'` precisely because it is an admin toggle.

Fixed in `SKILL.md` §2 (prose plus a worked `load_metadata()` example) and the
`experiments-framework.md` contract bullet, which now states the default and lists the in-tree
values.

### P3. Four `develop`-only hooks missing (minor) — fixed

`references/hooks-and-filters.md` documented the ability-scoped prompt family and
`wpai_content_translation_languages` but not `wpai_gated_abilities`,
`wpai_remove_data_on_uninstall`, `wpai_slug_generation_number_of_suggestions`, or
`wpai_content_classification_candidate_pool_size`. `wpai_gated_abilities` is the one that matters
— it is the extension point for the P1 inversion.

Fixed with a new "Other `develop`-only hooks" table.

### P4. The deprecated-hook surface was understated (minor) — fixed

`SKILL.md`'s failure-modes section said the legacy `ai_experiments_*` prefix "exists only via
`apply_filters_deprecated` for the per-feature toggle." There are eight: the toggle in
`Abstract_Feature`, plus seven shimmed in `includes/Deprecated.php`
(`ai_experiments_pre_normalize_content`, `ai_experiments_normalize_content`,
`ai_experiments_preferred_models_for_text_generation`, `ai_experiments_preferred_image_models`,
`ai_experiments_preferred_vision_models`, `ai_experiments_pre_has_valid_credentials_check`,
`ai_experiments_enabled`), all tagged `0.6.0` and all still firing in 1.2.0.
`wpai_summarization_min_content_length` is separately shimmed in `Summarization.php`.

"Only one" is the kind of claim that sends someone debugging a live legacy filter to the wrong
conclusion.

Fixed in `SKILL.md` (failure modes) and `references/hooks-and-filters.md` (new subsection).

### P5. `wpai_default_request_timeout` — prior finding re-confirmed, no change

The skill carries a warning that the 1.2.0 changelog and `readme.txt` name this filter
`wp_ai_client_default_request_timeout` while the plugin actually applies
`wpai_default_request_timeout`. Re-verified: `wpai_default_request_timeout` appears in
`includes/helpers.php`; `wp_ai_client_default_request_timeout` appears in **no** PHP in the plugin
at 1.2.0 or on `develop`. The warning stands as written and is worth keeping — it is the one place
where following the upstream changelog produces dead code.

## Verified correct — no change needed

Recorded so a future pass doesn't re-derive them.

**`wp-ai-plugin`**

- Sixteen Experiments at the 1.2.0 tag, and `Example_Experiment` deliberately unregistered.
- The five unconditional utility/read Ability IDs, and the framing that Feature and Experiment
  Abilities are conditional. (The conditional set is `ai/image-generation`, `ai/image-import`,
  `ai/image-prompt-generation`, `ai/comment-analysis`, `ai/suggest-reply` plus one per
  content Experiment; the reference now names the image and comment ones explicitly.)
- Experiments register through `wpai_default_feature_classes` at priority 9 — the same filter the
  skill documents for downstream use, not a separate Experiment registry.
- `Main::initialize_features()` on `init` priority **15**; `Loader::get_default_features()` returns
  only `Image_Generation`.
- Widget IDs `wpai_status` and `wpai_capabilities`, gated on `manage_options`, registered with
  plain `wp_add_dashboard_widget()` — still no third-party widget framework.
- `Experiment_Category::EDITOR` / `::ADMIN`, `Feature_Category::OTHER` fallback.
- Guidelines: `wp_guideline` CPT and `wp_guideline_type` taxonomy on both 1.2.0 and `develop`; meta
  keys `_guideline_{copy,images,site,additional}` and `_guideline_block_*`; XML tags
  `site-context` / `copy-guidelines` / `image-guidelines` / `additional-guidelines` /
  `block-guidelines`; the six public service methods; `wpai_max_guideline_length` default 5000.
- The Knowledge note: at Gutenberg **23.7.2** it is still `lib/experimental/knowledge/`, with
  `wp_knowledge` CPT, `wp_knowledge_type` taxonomy, and `wp_guideline_scopes()` shipping `site`,
  `copy`, `images`, `blocks`, `additional`. Not staged into `lib/compat/wordpress-7.1/`. The
  skill's "upstream in flux, verify before depending on names" framing is still the right one.
- `develop` still declares `1.2.0`; the ability-scoped prompt hooks are still unreleased.
- The full released filter and action list, including `wpai_feature_{$id}_settings` being
  Type-Ahead-only rather than a framework hook.

**`wp-ai-connectors`**

- `_wp_connectors_init` on `init` priority **15** in `default-filters.php` on both 7.0 and 7.1, and
  the whole hook-timing table that follows from it.
- All three provider plugins: `init` priority 5, `class_exists( AiClient::class )`,
  `hasProvider()`, `registerProvider()` with a class string, `Requires at least: 6.9`,
  `Requires PHP: 7.4`.
- Connector ID regex `/^[a-z0-9_-]+$/`, hyphen-to-underscore normalization, `is_registered()`
  before `unregister()`.
- The two precision notes on key naming, both exact: the `ai` segment in
  `connectors_ai_{id}_api_key` is a literal for auto-discovered AI providers, and `{ID}` is
  CONSTANT_CASE via `preg_replace( '/([a-z])([A-Z])/', '$1_$2', … )` then `strtoupper()`. Akismet's
  explicit `WPCOM_API_KEY` override is real.
- API key source order env → constant → database.
- `capabilities-declaration.md`'s embedding contract, against the 1.4.0 tag: the eight
  `CapabilityEnum` cases; `EmbeddingGenerationModelInterface` not extending `ModelInterface` and
  adding only `generateEmbeddingResult( array $inputs ): EmbeddingResult`;
  `ModelRequirements::fromEmbeddingData()` requiring `embeddingGeneration()` plus input modalities;
  and the claim that no `EmbeddingOperation` is implemented in 1.4.0.

## Repo hygiene

`shared/references/gutenberg-releases.json` is pinned at **v23.5.3** while latest stable is
**v23.7.2**. `check-upstream-drift.mjs` passes because no skill declares a Gutenberg marker for it
to gate against, unlike the AI plugin and MCP Adapter. That is defensible — no skill pins a
Gutenberg release the way `wp-ai-plugin` pins `current canonical release:` — but it means Gutenberg
claims in these two skills (the Knowledge rename, the connectors compat path) age silently. Both
were re-verified by hand in this pass against v23.7.2.

`shared/references/ai-plugin-releases.json` is current at 1.2.0.
