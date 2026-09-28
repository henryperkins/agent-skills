# WordPress Skills 1.12.1

A correctness release from an alignment pass against four upstreams on
2026-09-27: WordPress/ai, WordPress/php-ai-client, WordPress/mcp-adapter, and
WordPress/wp-bench. None of them has shipped a release past the skills' markers,
so the baselines are unchanged: WordPress Core 7.1, Gutenberg 24.0.0,
WordPress/ai 1.3.0, MCP Adapter 0.6.1, PHP AI Client 1.5.0 (Core bundles
1.3.1), WP AI Client 0.4.0, Anthropic 1.0.4, Google 1.1.1, and OpenAI 1.1.0.

What changed is the text. Guidance that was wrong against those released tags is
corrected. Changes merged upstream but not yet tagged — WordPress/ai 1.4.0 on
`develop` and MCP Adapter 0.7.0 on trunk — are documented as labelled forward
notes, so code written today survives them.

Full ledger: `docs/core-ai-skills-audit-2026-09-27.md`.

## wp-abilities-api (MCP Adapter 0.6.1)

- **Default-server policy filters.** The `mcp_adapter_pre_tool_call` sample
  keyed policy on `get_adapter_meta()['ability']`. On the default server that is
  always `mcp-adapter/execute-ability`, so the sample's allow-list blocked every
  call and a deny-list written the same way matched nothing. The sample now reads
  the target from `$args['ability_name']`, and `wp_ability_permission_result`
  (WordPress 7.1) is named as the transport-independent alternative. Resource
  policy keys on the backing ability, not the client-sent URI, whose scheme case
  can differ from the registered one.
- **What the default server lists.** Its `tools/list` returns only the three
  meta-tools. The verification steps and the MCP eval scenario no longer tell
  readers their abilities appear there, and overriding the default server's
  `tools` is documented as a replacement that ignores `meta.mcp.public`.
- **Empty default server.** New failure mode for the 0.6.x registration race —
  another plugin opening the Abilities registry during `init` — which upstream
  fixed on trunk (#339).
- `defined( 'WP_MCP_VERSION' )` identifies the canonical plugin; `class_exists()`
  only proves that some copy of the classes is loadable.
- `wp_ability_permission_result` fires three times for the target (plus twice for
  the meta-ability) through the default server, not twice.
- `wp_get_ability()` on a missing name fires `_doing_it_wrong()`; probe with
  `wp_has_ability()` when absence is expected.
- Smaller corrections: a `null` error handler logs nothing; a transport
  permission callback cannot authenticate anyone; the default server is created
  per request; the `WP\MCP\Cli` `final` change moved out of the 0.6.x list.
- **Unreleased 0.7.0**, prepared on trunk 2026-09-23 and untagged: a new section
  covers the dual MCP revisions and legacy identifiers, always-on validation (the
  `mcp_adapter_validation_enabled` filter is removed), literal-boolean
  annotations, array `meta.mcp`, filter signature changes, elicitation, error
  codes, sessions, `wp mcp-adapter list --protocol`, packaging, WordPress.org
  deployment, and internals.

## wp-ai-plugin (WordPress/ai 1.3.0)

- **`get_post_context()`** performs no permission or status check and returns
  drafts, private, and password-protected content. The reference now says so and
  gives the capability check callers must add.
- **Gated wrappers** run `register()` on `init` priority 15, outside
  `wp_abilities_api_init`; a custom gated ability must hand off to a
  `wp_abilities_api_init` callback, because core rejects registration anywhere
  else.
- Gated read Abilities are probed with `wp_has_ability()`, so a disabled
  experiment raises no notice.
- Precision: `wpai_system_instruction` receives template data, not execute input;
  the scoped-hook slug strips only `ai/`; deprecated shims fire only for legacy
  listeners; the legacy per-feature filter runs before the modern one;
  `wpai_features_initialized` never fires when features are filtered off; the
  uninstall scope; the credential pre-check ordering; the Capabilities widget's
  content; router triggers for `wpai_*` hooks, Custom Abilities, and the read
  Ability IDs.
- **Unreleased 1.4.0 (`develop`)**: a new step 9 and an "Unreleased on
  `develop`" inventory — #1002 renames (`core/content-query`, `core/users-query`,
  deprecated aliases, `ai/get-post-details` deprecated), #975 embeddings switched
  on with `model`/`provider` now required, #976 and #993 storage and similarity,
  #988 `wp_knowledge`-only Guidelines, #681 and #972 comment moderation, and the
  #1011 WordPress 7.0.3 floor.

## wp-ai-client (PHP AI Client 1.5.0, WordPress 7.1)

- **Embeddings example.** `GoogleProvider::model( 'gemini-embedding-001' )`
  throws on every released Google provider; the example now uses OpenAI's
  `text-embedding-3-small`.
- **Function calling.** The round trip is a bounded loop, since a follow-up can
  be another call and `toText()` throws on one. `execute_ability()` always
  returns a `FunctionResponse` whose `code` carries the failure, including the
  previously undocumented `invalid_ability_call`. Providers built on the SDK's
  OpenAI-compatible base reject a message carrying several function responses.
- Feature detection compares with `true !==`: a support check that throws
  returns the builder, which is truthy. The builder's sticky error and prevention
  states are documented.
- `using_request_options()` replaces the constructor's timeout; structured output
  on OpenAI-compatible-base providers; model-list caching after a key is
  removed; the standalone SDK's missing HTTP client and providers;
  `usingModelConfig()` merge precedence; 1.5.0 diagnostics (`ArgumentCountError`,
  `InvalidArgumentException`); the open wordpress-develop#12530 still vendors the
  1.4 API.
- `detect_ai_client.mjs` detects `AiClient::input()` chains and direct
  `EmbeddingBuilder` construction.

## wp-ai-connectors

- `FunctionDeclaration::getAnnotations()` exists only in standalone 1.5.0; Core
  7.0 and 7.1 bundle 1.3.1, so providers read it behind `method_exists()`. The
  serialization rules and upstream's annotation guidance are documented.
- Metadata DTOs cannot carry latency or pricing; results can, via
  `additionalData`. A model-list refresh must call `invalidateCaches()`.
- `wp_connectors_init` also registers non-AI connectors. Embedding wording
  follows 1.5.0's named-model verification.

## WP-Bench documents

- `docs/wp-bench-integration.md`, re-checked at `e19d3a8` (still trunk):
  fixtures run as user 0, not as an administrator; the Phase 1 command now works
  (explicit config and test IDs); the wp-env and docker graders are not
  equivalent; result-schema versus scoring versions, category counts, and exploit
  units are corrected; cost, baseline-bias, usage, and temperature notes; and a
  new skill↔suite alignment section.
- The portable Playground spec gains a dated note listing the code claims upstream
  has since invalidated.
- `docs/ai-authorship.md` no longer says an evaluation system does not exist.

## Enforcement

- New release-conformance pins for every high and medium correction, with
  exclusions for the wrong strings. The detector fixture covers the new entry
  points.
- A harness comment no longer claims that 0.6.0 deprecated Composer bundling.

## Not in this release

- Google and OpenAI provider 1.2.0 (2026-09-21): a fresh index refresh reports
  drift for `wp-ai-connectors`. That is outside this pass; the committed indices
  are unchanged.
- The markers stay at the released versions. Re-verify WordPress/ai and MCP
  Adapter against their tags when 1.4.0 and 0.7.0 ship; the forward notes name
  the lines that will move.

## Verification

Run against the final tree in Linux containers matching CI (`node:20`,
`python:3.11`), with LF content:

- `node eval/harness/run.mjs` (strict)
- skillpack build and install smoke for the `codex` and `vscode` targets
- `node shared/scripts/check-upstream-drift.mjs` (22 checks)
- `skills-ref validate` for all 22 skill directories

Each of the 40 new release-conformance pins was checked to pass on the new text
and fail on the pre-change text. GitHub Actions are unavailable for this
repository, so no hosted workflow run is presented as release evidence.
