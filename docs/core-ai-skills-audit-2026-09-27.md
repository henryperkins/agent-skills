# Core AI Skills Upstream Alignment — 2026-09-27

An alignment pass of the Core AI skills against four upstream repositories:
`WordPress/ai`, `WordPress/php-ai-client`, `WordPress/mcp-adapter`, and
`WordPress/wp-bench`. Unlike the 2026-09-06 review, this pass also applied the
fixes; they ship as release 1.12.1 (`docs/release-notes-1.12.1.md`).

**Result in one paragraph.** No requested upstream has shipped a release past
the skills' markers, so every drift declaration stays green and no marker moved.
The staleness was in the text: guidance that was wrong against the released
tags (two high, eleven medium), and a large body of merged-but-untagged work —
WordPress/ai 1.4.0 on `develop` and MCP Adapter 0.7.0 on trunk — that the skills
either did not mention or described only in part. Both are now handled: the
wrong guidance is corrected and pinned, and the untagged work is documented as
labelled forward notes.

## Authority rule

Unchanged from the 2026-09-06 review: executable code at the released tag, then
tests at that tag, then the changelog/readme, then handbook and announcement
prose. Earlier audit documents were treated as claims under review. For
unreleased work, trunk/`develop` code is the evidence and every such statement is
labelled unreleased with its PR number.

## Method

- Full-history clones of all four upstreams; tags and default branches read with
  `git show <ref>:<path>`. `WordPress/ai`'s default branch is `develop`; its
  `trunk` sits at the 1.3.0 release point.
- Single files from `wordpress-develop` (`7.1`, `7.0`, `trunk`) and from the
  provider plugins at their tags, through the GitHub contents API.
- Deterministic gates on the committed tree, and the index updater in a
  throwaway copy of the tree.
- Four independent verification passes, one per upstream, each reporting only
  discrepancies it could cite. Every high and medium finding was then re-read
  against source before any text changed.
- Make/AI weekly summaries of 2026-09-02 and 2026-09-16 for release timing.
- Corrections were written test-first: each new release-conformance pin was run
  and seen to fail before the text changed, and all 40 new pins were checked to
  pass on the new text and fail on the pre-change text.

## Baselines: live status on 2026-09-27

| Upstream | Marker | Live latest | State |
| --- | ---: | ---: | --- |
| WordPress/ai | 1.3.0 | 1.3.0 (2026-08-18; WordPress.org 1.3.0) | current. `develop` is 59 commits past the tag; milestone 1.4.0 is open (20 open / 66 closed). On 2026-09-02 the AI team expected the next release "later this month" |
| MCP Adapter | 0.6.1 | v0.6.1 (2026-08-13) | current. Trunk is 32 commits past; 0.7.0 was prepared on 2026-09-23 (#342) and is untagged; the WordPress.org slug is not live, and #347 added a deploy step |
| PHP AI Client | 1.5.0 | 1.5.0 (2026-09-16) | current. Trunk equals the tag. WordPress 7.1 and trunk (7.2-alpha-63166) still bundle 1.3.1; wordpress-develop#12530 is open and vendors 1.4.0 |
| wp-bench | `e19d3a8` | `e19d3a8` (2026-09-07; no releases) | current. Open PRs listed below |
| WordPress Core | 7.1 | 7.1.2 | current (minor granularity) |
| Gutenberg | 24.0.0 | v24.0.0 | current |
| Anthropic provider | 1.0.4 | 1.0.4 | current |
| Google provider | 1.1.1 | **1.2.0** (2026-09-21) | drift once indices refresh — outside this pass |
| OpenAI provider | 1.1.0 | **1.2.0** (2026-09-21) | drift once indices refresh — outside this pass |
| WP AI Client | 0.4.0 | 0.4.0 | archived; final |

The committed indices were not refreshed in this change set, so the drift gate
stays green; a refresh will turn the two provider rows red.

## Corrections applied

Severity: **high** means a reader builds something broken or unsafe;
**medium** a materially wrong or missing statement; **low** and **nit** are
precision. Upstream paths are at the ref given.

### wp-abilities-api against MCP Adapter v0.6.1

- **[high]** `mcp_adapter_pre_tool_call` policy sample keyed on
  `$mcp_tool->get_adapter_meta()['ability']`. On the default server every tool is
  one of three meta-tools (`includes/Servers/DefaultServerFactory.php:54-58`),
  the adapter meta records the *backing* ability
  (`includes/Domain/Tools/RegisterAbilityAsMcpTool.php:157-159`), and the target
  arrives as `$args['ability_name']` (`includes/Abilities/ExecuteAbilityAbility.php:106-117`,
  filter at `includes/Handlers/Tools/ToolsHandler.php:183`). The sample's
  allow-list blocked every call; a deny-list written the same way never matched.
  Fixed, with `wp_ability_permission_result` named as the 7.1 alternative.
- **[medium]** Verification steps and `eval/scenarios/abilities-mcp-expose.json`
  step 17 told readers their abilities appear in the client's tool list; the
  default server lists only the meta-tools.
- **[medium]** Missing failure mode: on 0.6.x the adapter hooks default-ability
  registration only when it initializes (`includes/Core/McpAdapter.php:62-67`,
  `:106-126`), while core fires `wp_abilities_api_init` once on first registry
  access (`class-wp-abilities-registry.php:282-313` @7.1). Early registry access
  leaves an empty default server and the log line from
  `McpComponentRegistry.php:232`. Fixed upstream on trunk by #339.
- **[medium]** `execution-lifecycle.md` said `wp_ability_permission_result` fires
  twice per MCP `tools/call`. Through the default server the target is checked
  three times — execute-ability's permission callback calls the target's
  `check_permissions()` during both the adapter's check and its own `execute()`,
  then the target's `execute()` checks again — plus twice for
  `mcp-adapter/execute-ability` (`McpTool.php:270`, `:360`).
- **[medium]** `$uri` in `mcp_adapter_pre_resource_read` is the trimmed,
  client-sent URI (`ResourcesHandler.php:121-122`, `:158`) while lookup folds the
  scheme's case, so exact-string resource policy fails open.
- **[low]** `class_exists()` proves only that some copy is loadable;
  `WP_MCP_VERSION` is defined only by the canonical plugin (`mcp-adapter.php:44`).
  A `null` error handler becomes `NullMcpErrorHandler` (`McpAdapter.php:173-176`),
  so the "only trace" sentence was wrong twice. Overriding the default server's
  `tools` replaces the meta-tools and ignores `meta.mcp.public`. The `WP\MCP\Cli`
  `final` change (#306, merged 2026-09-07) was listed under "What changed in
  0.6.0 / 0.6.1"; `McpCommand.php:21` is not final at v0.6.1.
- **[low]** `wp_get_ability()` on a missing name fires `_doing_it_wrong()`
  (`class-wp-abilities-registry.php:260-271` @7.1); `php-registration.md` now
  says so and names `wp_has_ability()`.
- **[nit]** Negotiation answers any unsupported version, older or newer, with
  `2025-11-25`; a `transport_permission_callback` cannot authenticate; the
  default server is created per request from adapter (not core) abilities; server
  arrays accept component instances; the absent-schema wording;
  `domain-vs-projection.md` and the `meta.mcp.public` table row now say
  MCP-public rather than "every published ability" and "as a tool".

### wp-ai-plugin against WordPress/ai 1.3.0

- **[medium]** `WordPress\AI\get_post_context()` was presented as a downstream
  helper with no caveat. Its own docblock (`includes/helpers.php:121-134`) says
  the permission callback is not run; it reads through `Posts::get_post_details()`
  for any status, drafts and private posts included.
- **[medium]** Gated wrappers were said to do "nothing but instantiate the real
  class". Their `register()` runs on `init` priority 15 (`Custom_Abilities.php:56-66`
  via `Loader.php:193-201`), outside `wp_abilities_api_init`, and only hands off;
  core rejects `wp_register_ability()` elsewhere (`abilities-api.php:290-303` @7.1).
- **[low]** "Resolve with `wp_get_ability()` and handle null" (six places) fires a
  notice whenever Custom Abilities is off; the plugin itself probes with
  `wp_has_ability()` (`Content.php:191`, `Users.php:122`, `Settings.php:114`).
- **[low]** Deprecated shims fire only when the *legacy* name has a listener
  (`Deprecated.php:30-195`); `wpai_system_instruction` receives template data,
  not execute input (`Abstract_Ability.php:168-195`); `wpai_features_initialized`
  never fires when `wpai_features_enabled` is filtered false (`Loader.php:186-191`);
  the legacy per-feature filter runs before the modern one
  (`Abstract_Feature.php:182-199`).
- **[nit]** Uninstall scope (`Uninstall.php:60-283`); the credential pre-check is
  reached only after `has_ai_credentials()` (`helpers.php:596-615`); the
  Capabilities widget's content (`AI_Capabilities_Widget.php:3-6`); the scoped
  hook slug strips only `ai/`; a stale "#268" sentence; the "private methods"
  rule contradicted documented hooks; router triggers lacked `wpai_*`, Custom
  Abilities, and the read-ability IDs.

### wp-ai-client against PHP AI Client 1.5.0 and WordPress 7.1

- **[high]** The embeddings example used
  `GoogleProvider::model( 'gemini-embedding-001' )`. No released Google provider
  lists an embedding model (`GoogleModelMetadataDirectory.php:223-257` @1.2.0
  lists only `generateContent`/`predict` models; support is in the open
  ai-provider-for-google#30), so the call throws before the builder runs. Now
  `OpenAiProvider::model( 'text-embedding-3-small' )`
  (`WordPress\OpenAiAiProvider\Provider`, `text-embedding-*` gated on the 1.4
  interface at `OpenAiModelMetadataDirectory.php:188-199` @1.2.0).
- **[medium]** `execute_abilities()` returns one `UserMessage` holding every
  response (resolver `:187-200` @7.1); providers on the SDK's OpenAI-compatible
  base accept a function response only as a message's sole part
  (`AbstractOpenAiCompatibleTextGenerationModel.php:366-369` @1.5.0). The flagship
  providers extend `AbstractApiBasedModel` directly.
- **[medium]** `execute_ability()` was said to "return `ability_not_allowed`". It
  always returns a `FunctionResponse`; the `code` in `getResponse()` is
  `invalid_ability_call`, `ability_not_allowed`, `ability_not_found`, or the
  ability's own code (resolver `:93-157` @7.1).
- **[medium]** `detect_ai_client.mjs` missed `AiClient::input()` chains and
  `new EmbeddingBuilder(` — the skill's own 1.5 entry points. Fixed, with harness
  fixtures.
- **[low]** `! $builder->is_supported_…()` reads a throwing support check as
  "supported", because `__call` returns `$this` (`class-wp-ai-client-prompt-builder.php:361-367`
  @7.1); now `true !==`. The round trip ends in `toText()`, which throws when the
  follow-up is another call; now a bounded loop. `using_request_options()`
  replaces the constructor's timeout options (`:217-223`), and the HTTP adapter
  then omits `timeout` (`class-wp-ai-client-http-client.php:141-144`).
  `using_abilities()` with an unknown ID raises two notices (`:241-255`). The
  builder's error and prevention states are sticky (`:293-367`).
- **[low]** Standalone SDK ships no HTTP client or providers (`composer.json`
  @1.5.0); `usingModelConfig()` merges with builder values winning
  (`ModelConfigurationTrait.php`); 1.5.0 throws `InvalidArgumentException` for a
  non-embedding model where 1.4.0 threw `RuntimeException`
  (`EmbeddingBuilder.php:385-411` @1.5.0 vs `:179-186` @1.4.0); a 1.4-style static
  call raises `ArgumentCountError`; raw `json_schema` on the OpenAI-compatible base
  (`:514-521`); the model-list cache survives key removal for 24 hours;
  `is_supported_for_embedding_generation()` is `@since 0.1.0`.
- **[nit]** `convert*` methods; "standalone 1.4.0" wording; the #12530 status and
  the scenario that stated it as fact.

### wp-ai-connectors

- **[medium]** `FunctionDeclaration::getAnnotations()` is standalone 1.5.0 only;
  Core's 1.3.1 has a three-argument constructor and no getter
  (`FunctionDeclaration.php` @7.1), so an unguarded provider fatals on every
  stock 7.x site.
- **[medium]** `community-providers.md` said result metadata can carry latency
  and pricing; `ModelMetadata` and `ProviderMetadata` have no such fields
  (@1.5.0). Results can, through `additionalData`.
- **[low]** A catalog refresh must call `invalidateCaches()`
  (`WithDataCachingTrait.php:143`); `wp_connectors_init` is documented by core as
  primarily for registering non-AI connectors (`connectors.php` @7.1);
  annotations are omitted from `toArray()` when empty, upstream's guidance
  (`docs/ARCHITECTURE.md:343-360`), and the OpenAI-compatible base forwards them
  verbatim in `tools[].function`; embedding wording now follows 1.5.0's
  named-model verification.

## Unreleased upstream changes, now forward notes

Nothing here has shipped. Each item is labelled in the skills with its PR and
merge date; re-verify against the tag when it exists.

### MCP Adapter 0.7.0 (trunk `05b10aa`; CHANGELOG dated 2026-09-23)

Documented in a new "Unreleased: MCP Adapter 0.7.0" section of
`mcp-exposure.md`, with pointers from the sections it will change: exact
revisions `2025-11-25` and `2026-07-28` with `LEGACY_PROTOCOL_VERSIONS`; removal
of `mcp_adapter_validation_enabled`, `is_mcp_validation_enabled()`, and the
validators; rejection instead of repair for malformed fields; literal-boolean
annotations; array `meta.mcp` (`mcp_ability_invalid_meta`); a third `Schema`
argument on the list and initialize filters; exact-as-sent name and URI matching;
`McpInputRequired` elicitation and the `( $args, ?McpToolCallContext )` handler
signature; error codes `-32602`, `-32002`, `-32022`; sessionless `2026-07-28`;
`final` CLI classes and `list --protocol`; bundled-copy deprecation notices and
`WP_MCP_AUTOLOAD`; WordPress.org deployment; `php-mcp-schema ^0.2.0` internals.

Exposure resolution, the default server, the name sanitizer, the schema
transformer, the transport permission check, and session storage are
byte-identical on trunk, so the core advice survives. One discrepancy to settle
at the tag: the CHANGELOG says `wp mcp-adapter list` adds per-revision columns,
while the code adds a `--protocol` switch and keeps the columns.

### WordPress/ai 1.4.0 (`develop` `0c4b71e3`)

Documented as step 9 of `SKILL.md` and an "Unreleased on `develop`" inventory in
`experiments-framework.md`, with notes in the hooks and Guidelines references:

- #1002 (2026-09-09): `core/content-query` and `core/users-query` replace
  `core/read-content` and `core/read-users`, which remain as deprecated aliases via
  `register_deprecated_ability_alias()`; `ai/get-post-details` is deprecated. The
  gate yields seven IDs.
- #975 and #1005: `SDK_Overlay::register()` runs; `generate_embeddings()` requires
  `model` (and `provider` for an ID), with `ai_embeddings_missing_model` and
  `ai_embeddings_missing_provider`. #976 and #993 add the `wpai_embeddings` table,
  repository, vector math, ranking, and `wp ai embeddings` commands — in the
  plugin by design, not in core.
- #988: Guidelines read only published `wp_knowledge` rows, with no `wp_guideline`
  fallback and no migration — the supported Gutenberg window inverts.
- #681 and #972: `value_score`, a fourth `$post_id` argument on
  `wpai_comment_analysis_result`, the new
  `wpai_comment_analysis_post_context_shareable` filter (62 `wpai_*` hooks in all),
  and the bulk cap reaching comment moderation.
- #1011: minimum WordPress 7.0.3.

Recomputed at `develop`: still nineteen Experiments in the same order;
`GATED_ABILITY_CLASSES` is `Post_Utilities`, `Read_Settings`, `Users_Query`,
`Content_Query`.

### What must move when those tags ship

- Harness pins that encode released 1.3.0 behaviour and will contradict 1.4.0:
  the Guidelines window ("Gutenberg 23.0 through 23.5.x", "PR #988"), the overlay
  ("SDK_Overlay::register()", "commented out", "ai_embeddings_unsupported",
  "usingModelPreference()"), and the release markers.
- Harness pins that encode 0.6.1: "Current release: 0.6.1", "verified in v0.6.1",
  the validation-filter arity strings, and the four MCP markers.
- `eval/playground/ai-plugin-smoke` installs the latest WordPress.org release, so
  it will run against 1.4.0 the day it ships. The deprecated aliases keep its
  five-ID check passing, but it will not cover the new IDs, and its README says
  "AI plugin 1.3.0".
- The 1.3-scoped scenarios (`ai-plugin-custom-abilities-1-3.json`,
  `ai-plugin-expose-read-abilities-1-3.json`, `ai-plugin-register-experiment.json`)
  will need 1.4 siblings.

### PHP AI Client and Core watch items (unmerged)

- **wordpress-develop#12530** (open, conflicting): vendors SDK 1.4.0, adds
  `wp_ai_client_embedding()` and `WP_AI_Client_Embedding_Builder` without
  `using_provider_model()`, a `WP_AI_Client_Builder` base, and a second argument
  on the timeout filter. If merged, it changes the "no Core embedding wrapper"
  statements in `wp-ai-client` and the one-argument timeout-filter statements in
  `wp-ai-plugin`.
- **wordpress-develop** #12658 (draft; `using_ability_resolution()`), #10915
  (stale; `wp-ai/v1` routes in core), #12345 (stale; key retention).
- **php-ai-client** #273 (resolver loop and `withMessages()`), #288/#290 (one
  tool message per response), #289 (`PROVIDER_DATA` again), #269 (text
  extraction), #255 (streaming, which would bypass Core's generating-method gate),
  #263 (non-finite embedding values; milestone 1.6.0), #264 (`contextWindow`),
  #279/#259 (token usage), #245, #239, #280, #251, #278.
- **ai-provider-for-google#30**: embedding models.

## WP-Bench

`docs/wp-bench-integration.md` was re-checked at `e19d3a8`, which is still
trunk. Corrected: the verifier runs as user 0, not as an administrator
(`environment.py:242-246`; 19 of 350 tests switch users); the Phase 1 command
(no `--config` meant the Hugging Face dataset, which returned 401, and
`--limit 60` selected one rest-api and two abilities-api tests); wp-env versus
bare docker (`WP_DEBUG`); scoring 3.0 was already current at `bf059e2`, while the
result schema moved 2.0 → 2.2; #64 added 10 new categories, not 9; exploit units;
#52 versus #53; `wp_plugin_files` tests now exist. Added: cost, baseline-bias,
usage, and temperature notes, and a skill↔suite alignment section.

The portable Playground spec (2026-08-16) keeps its body and gains a dated list of
code claims upstream has invalidated. `docs/ai-authorship.md` no longer says an
evaluation system does not exist (fork-side correction of upstream prose, pinned).

**Alignment.** No `abilities-api` or `ai-client` reference solution contradicts
the skills. The four gaps the tests exposed — the `wp_get_ability()` notice, the
`execute_ability()` return shape, the builder's sticky states, and
`wp_connectors_init` for non-AI connectors — are fixed above.

**Open wp-bench PRs to watch:** #67 (`--category`), #51 (`--baseline-from`, usage
restored), #54 (removes `ModelConfig.temperature` — breaking for configs that set
it), #55 (concurrency under `reset_per_test`), #62 (Python 3.11 floor), #58, #59.

## Outside this pass, reported

- **Provider plugins 1.2.0.** Google and OpenAI shipped 1.2.0 on 2026-09-21.
  Handled as a follow-up in release 1.12.2; see the addendum below.
- **Synced personal skills** (claude.ai, not in this repository).
  `anthropic-skills:wp-bench` was verified against wp-bench on 2026-08-23 and is
  stale at `e19d3a8`: 185 tests (now 350), schema 2.1 (now 2.2), WordPress 7.0 (now
  7.1), `difficulty` (removed); `examples.md` shows `exploit_solutions` as objects
  (CI requires PHP strings) and uses `self::factory()`, which the sandbox cannot
  call; `scripts/lint_tests.py` fails all 350 upstream tests on the removed
  `difficulty` requirement, and `scripts/report.py --compare` never actually
  compares scoring or schema versions. `anthropic-skills:wordpress-ai-development`
  and `anthropic-skills:wordpress-abilities-api` overlap these upstreams and were
  not audited.

## Remediation status of the 2026-09-06 review

Every source-verified finding that review recorded for the six Core AI skills is
fixed in the tree. Its watch items are now forward notes (#975, #976, #988,
#681/#972, the 0.7.0 bundling deprecation) or have fired (provider 1.2.0). Two of
its own claims were wrong: a second root `composer require
automattic/jetpack-autoloader` is not redundant — the autoloader's Composer
plugin runs only when the root package requires it
(`src/CustomAutoloaderPlugin.php:93-99`, v5.0.23), so the skill's "do both" was
right — and a `wpai_comment_analysis_result` short circuit need not carry
`value_score`, which defaults to 0.0 (`Comment_Analysis.php:414-416` @`develop`).

## Could not verify

- MCP Adapter 0.7.0 at a tag (none exists); trunk `05b10aa` stands in.
- Live provider behaviour: strict OpenAI-compatible endpoints rejecting a raw
  `json_schema` or forwarded `annotations`, and OpenAI rejecting replayed model
  messages; inferred from code only.
- Whether WooCommerce or Elementor boot their bundled adapter copies (named in
  upstream comments and commits only).
- Anything requiring a running WordPress: the notice-to-exception behaviour in
  wp-bench's sandbox, user-0 failures, and the MCP registration race were read from
  code, not executed.
- Trac tickets (#65638, #64865, #64789) serve a JavaScript browser check.

## Verification of this change set

Run in Linux containers matching CI (`node:20`, `python:3.11`) against LF
content, with the branch cloned from a bundle of `trunk` and the working-tree diff
applied and committed inside the container only:

- `node eval/harness/run.mjs` — strict, including the version-freshness,
  marketplace-match, and release-floor gates, every new pin, and the detector
  fixture;
- skillpack build and install smoke for the `codex` and `vscode` targets;
- `node shared/scripts/check-upstream-drift.mjs` — 22 checks;
- `skills-ref validate` for all 22 skill directories.

GitHub Actions remain unavailable for this repository, so no hosted run is
presented as evidence.

## Addendum: provider plugins 1.2.0 (release 1.12.2)

Done the same day as a follow-up, after the pass above had shipped as 1.12.1.
The Google and OpenAI provider indices were refreshed (1.1.1 → 1.2.0 and
1.1.0 → 1.2.0, both 2026-09-21), and `wp-ai-connectors` was re-verified against
the tags.

- **Unchanged, verified at the tags:** `Requires at least: 6.9`, `Requires PHP: 7.4`,
  the `class_exists( AiClient::class )` guard, `init` priority 5, the hand-rolled
  `src/autoload.php` (`plugin.php:30-54`, identical in shape to Anthropic 1.0.4's
  once names are normalized), `/vendor` in `.distignore`, `deploy-to-wporg.yml`
  running no `composer install`, and the readme's "For WordPress 6.9 … must be
  installed" note. Google 1.2.0 still lists only `generateContent`/`predict`
  models; OpenAI's `interface_exists()`-gated embedding branch
  (`OpenAiProvider.php:59-64`) and `OpenAiEmbeddingGenerationModel` are unchanged.
- **Changed:** both `composer.json` files moved `wordpress/php-ai-client` in
  `require-dev` from `^1.4` (OpenAI 1.1.0) to `^1.3.1`, with a PHPUnit matrix over
  PHP 7.4–8.4 × lowest/latest SDK (`ci.yml:55-79` in OpenAI). The skill cited
  `^1.4` as the precedent at `SKILL.md:85` and
  `references/capabilities-declaration.md:74`; both now describe `^1.3.1`.
- **New:** `GoogleTextToSpeechConversionModel` and `OpenAiTextToSpeechConversionModel`
  (`@since 1.2.0`), returned from `createModel()` on `isTextToSpeechConversion()`
  with no version gate — `TextToSpeechConversionModelInterface` is already in the
  SDK 1.3.1 that Core bundles. `capabilities-declaration.md` now draws that
  contrast with the gated embedding branch. Google's thought-signature and
  thought-token round-tripping (#26, #36, #44) and OpenAI's reasoning-item
  preservation (#26) change no statement in the skills.

Markers now read Google 1.2.0 and OpenAI 1.2.0; the harness pins and
`eval/scenarios/ai-connectors-register-provider.json` moved with them. Anthropic
is still 1.0.4.
