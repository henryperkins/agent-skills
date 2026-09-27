# WordPress Skills 1.10.0

A source-verified Core AI correctness release. It resolves the actionable
findings from the 2026-09-06 audit, advances the reviewed Gutenberg baseline to
23.9.0, and hardens the maintenance path that detects upstream changes.

Full audit: `docs/core-ai-skills-audit-2026-09-06.md`.

## Corrected Core AI guidance

- **AI Client** — preserves the complete function-calling history, handles
  inline and remote files safely, pins embedding guidance to PHP AI Client
  1.4.0, and identifies the final deprecated `wordpress/wp-ai-client` 0.4.0
  compatibility surface. The detector now parses real headers, distinguishes
  runtime from development dependencies, recognizes static SDK calls, and
  rejects missing roots.
- **Connectors and WordPress/ai** — scopes `application_password` to WordPress
  7.1, documents actual connector discovery and credential behavior, and
  records that WordPress/ai 1.3.0 Guidelines are inactive with Gutenberg
  23.6.0+ until the pending upstream fix is released.
- **Abilities and MCP** — fixes Script Module dependency and classic-script
  loading, recommends the canonical MCP Adapter plugin installation, corrects
  authentication and CLI guidance, and aligns PHP floors and REST behavior
  with WordPress 6.9 through 7.1.
- **Audit and verify** — reconciles the reference-ability schema contract,
  distinguishes the raw registry from filtered discovery, records both runtime
  inventories, applies Core's `readonly` promise literally, and corrects
  WooCommerce capability tracing.

## Release maintenance

- Refreshed the Gutenberg index and all three verified-through markers from
  23.8.0 to **23.9.0** after reviewing the tagged source.
- Synchronized the schema-3 maintenance state at
  `602d4b07ec6a969c68095c97fd25d5e040f2dddd61db6b71ee582ce49e02b1fe`.
- GitHub API requests now use `GITHUB_TOKEN` when available, restricted to the
  exact `api.github.com` host. Tokenless local runs remain supported.
- Release-sensitive test fixtures derive their baselines from the canonical
  registry and committed indices where practical, while behavioral assertions
  retain exact source-reviewed contracts.
- Updated the README, router triggers, Blueprint verification loop, packaging
  audit status, and Claude marketplace metadata for version **1.10.0**.

There is no separate ChatGPT package or version manifest in this repository.
ChatGPT consumes these abilities through MCP-compatible integrations; the
relevant WordPress and MCP Adapter compatibility versions live in the skills.

## Verification

Run locally against the final tree:

- `node eval/harness/run.mjs`
- `skills-ref validate` for all 21 skill directories
- `node shared/scripts/check-upstream-drift.mjs`
- `node shared/scripts/ai-generate-updates.mjs --print-state-hash`
- JavaScript syntax checks for every changed `.mjs` file
- `git diff --check`

GitHub Actions are unavailable for this repository, so no hosted workflow run
is presented as release evidence.
