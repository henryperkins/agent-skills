# WordPress Skills 1.11.0

A source-verified sync release. It merges a parallel batch of upstream re-sync
work — WordPress 7.1 and Gutenberg 24 for the block skills, PHP AI Client 1.5.0
for embeddings — into the 1.10.0 line, settles every point where the two lines
disagreed against tagged upstream source, and advances the Gutenberg and PHP AI
Client baselines.

## Block skills: WordPress 7.1 and Gutenberg 24

- **wp-block-themes** — documents the theme.json surface WordPress 7.1 added:
  responsive style states (`@mobile`, `@tablet` — there is no `@desktop` key),
  `settings.viewport` and its silent sanitisation ladder,
  `settings.blockVisibility.allowEditing`, `core/navigation-link` pseudo-selectors,
  and `VALID_BLOCK_CUSTOM_STATES`.
- **wp-block-development** — documents `supports.autoRegister` (server-rendered
  editor blocks with no JavaScript registration), `selectors.states`, and labels
  `supports.layout.default.autoFit` as plugin-only.
- **wp-interactivity-api** — records that the 7.1 deadline for
  `state.navigation.hasStarted` / `hasFinished` lapsed; Gutenberg 24.0 still only
  warns.
- `wp-block-themes` now declares `WordPress Core verified through: 7.1` and is
  tracked by the drift gate at minor granularity. The Gutenberg plugin is
  deliberately not tracked for the block skills.

## Core AI guidance

- **AI Client** — PHP AI Client 1.5.0 made the embedding model mandatory
  (#274): `usingProviderModel()` / `usingModel()` are required,
  `usingModelPreference()` and `usingProvider()` left `EmbeddingBuilder`, and the
  static entry points take `$model` second. `isSupported()` throws without a
  model and swallows only SDK exceptions. WordPress 7.0 and 7.1 (verified through
  7.0.6 and 7.1.2) still bundle 1.3.1, and wordpress-develop#12530 is open and
  written against the 1.4 builder API.
- **Connectors** — the 1.5.0 provider interfaces are unchanged, but explicitly
  named embedding models are now validated against their declared metadata;
  records the optional `createModelMetadataForExplicitModelIds()` hook (#231) and
  `FunctionDeclaration` annotations (#282). Confirms that `application_password`
  connectors cannot work on any WordPress 7.0.x site, with or without Gutenberg.
- **Abilities and MCP** — MCP Adapter 0.6.1 still supports Composer bundling
  without a notice; the `_deprecated_function()` deprecation is on unreleased
  trunk (0.7.0). A bundled copy needs a root-level `automattic/jetpack-autoloader`
  requirement plus `config.allow-plugins` to get `autoload_packages.php`, and
  `Requires Plugins: mcp-adapter` cannot install the adapter until it is listed
  on WordPress.org (#178). WordPress 7.1 marks all three core abilities public,
  so with adapter 0.6.0+ they reach the default MCP server without anyone opting
  in.
- **WordPress/ai 1.3.0** — corrects the `log_ai_request()` example (`type` must
  be `ai_client`, `mcp_tool`, or `ability`), dates the request-log hooks to
  1.0.0, documents `wpai_ability_category` as display-only, and notes that the
  uninstall opt-out must live in an mu-plugin and leaves post and comment meta
  in place. The embedding helper also fails against a 1.5 SDK
  (`ai_embeddings_failed`). Guidelines: PR #988 has merged to `develop`
  (milestone 1.4.0) but is not in a release, and WordPress 7.1 core ships
  neither `wp_guideline` nor `wp_knowledge`.

## Release maintenance

- Regenerated three indices with the registry updater: Gutenberg **v24.0.0**,
  PHP AI Client **1.5.0** (Packagist), and WordPress core **7.1.2**. The Google
  and OpenAI provider 1.2.0 releases (2026-09-21) are not indexed yet because
  they have not been verified.
- Advanced verified-through markers after source review: Gutenberg 24.0.0
  (`wp-abilities-api`, `wp-ai-plugin`, `wp-ai-connectors`) and PHP AI Client
  1.5.0 (`wp-ai-client`, `wp-ai-connectors`, `wp-ai-plugin`).
- Synchronized the schema-3 maintenance state at
  `ddd9e900ad79d7b9bdbe6a987fff135af62c2ea6eb32a7363702f33680a40d5e`.
- The drift gate now runs 22 declaration checks: the six Core AI skills plus
  `wp-block-themes`.
- Two harness fixtures only worked while the core index held exactly "7.1".
  They now derive the core version from the index and bump it at the declared
  granularity.
- Rewrote `docs/wp-bench-integration.md` against WP-Bench `e19d3a8`.

## Verification

Run against the final tree in Linux containers matching CI (`node:20`,
`python:3.11`), with LF content:

- `node eval/harness/run.mjs`
- skillpack build and install smoke for the `codex` and `vscode` targets
- `skills-ref validate` for all 21 skill directories
- `node shared/scripts/check-upstream-drift.mjs`
- `node shared/scripts/ai-generate-updates.mjs --print-state-hash`

GitHub Actions are unavailable for this repository, so no hosted workflow run
is presented as release evidence.
