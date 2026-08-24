# Core AI upstream synchronization

Core AI maintenance has two deliberately separate paths:

- The **deterministic** path discovers releases, normalizes indices, reports drift, and opens an index-only pull request. It is authoritative and never needs an AI provider.
- The **advisory** path may propose skill edits only when tagged-source evidence is supplied. Failure, missing configuration, a review-only result, or zero edits can never discard deterministic index changes.

## Source registry

`shared/scripts/core-ai-upstreams.mjs` exports `CORE_AI_UPSTREAMS`, the only release-source inventory. It contains nine release sources plus the official WordPress↔Gutenberg version map:

1. WordPress Core version-check API
2. Gutenberg releases
3. WordPress/ai releases
4. MCP Adapter releases
5. `wordpress/php-ai-client` on Packagist
6. standalone WP AI Client releases
7. Anthropic provider releases
8. Google provider releases
9. OpenAI provider releases
10. the WordPress↔Gutenberg mapping document

Each registry entry owns an index file, source type, affected skills, and zero or more exact `verified through` declarations. Do not add a private source list to a workflow or consumer. Generate a reviewable inventory with:

```bash
node shared/scripts/core-ai-upstreams.mjs --format markdown
```

## Deterministic refresh

Run:

```bash
node shared/scripts/update-upstream-indices.mjs
node eval/harness/run.mjs --skip-upstream-drift
node shared/scripts/check-upstream-drift.mjs --format markdown --allow-drift
```

The updater fetches every source concurrently and normalizes every payload before writing any index. GitHub error objects, empty stable-release arrays, missing Packagist packages, and an unparseable mapping all fail before the first write. Drafts and prereleases are excluded, versions sort numerically, and output is bounded and deterministic.

`--skip-upstream-drift` skips only the expected “index advanced before skill marker” failure. Frontmatter, scenario, parser, registry, release-conformance, and quality checks still run. The default harness remains strict.

### Reading a red drift report

A red drift row is a review requirement, not an updater failure. It names one upstream and one independently versioned skill whose marker is behind. Patch releases are checked for package/plugin sources; WordPress Core is checked at minor granularity.

On the refresh branch:

1. Open the release tag named in the report.
2. Resolve behavior in this order: tagged executable source, tagged tests, release notes/changelog, then handbook prose.
3. Update only the affected skill and one-hop references; keep historical claims explicitly versioned.
4. Update that skill's exact frontmatter marker.
5. Run the strict harness and any live smoke test named by the skill.
6. Commit the release metadata with shipped skill changes so marketplace consumers receive them.

Do not make the drift green by editing a marker without source review.

## Upstream Sync workflow

`.github/workflows/upstream-sync.yml` runs weekly and supports manual dispatch. A no-change rerun creates no pull request. When indices change it:

1. runs complete non-drift validation;
2. generates the source inventory and `upstream-drift.md` from the registry;
3. uploads both as workflow evidence;
4. embeds both in the pull request body; and
5. limits the automated commit to `shared/references/**`.

This makes the refresh pull request self-validating even when GitHub declines to start another workflow recursively.

### Pull request token setup

Prefer a fine-grained PAT or GitHub App installation token stored as the Actions secret `UPSTREAM_SYNC_TOKEN`. Grant only the target repository's:

- Contents: read and write
- Pull requests: read and write

Set an owner and expiry, rotate the token on the repository's normal secret-rotation schedule, and revoke it immediately if ownership changes. Never put the token in repository variables, logs, or workflow artifacts.

If `UPSTREAM_SYNC_TOKEN` is absent, the workflow falls back to `GITHUB_TOKEN`. Pull requests created with that token may not trigger normal `pull_request` workflows recursively, so the workflow discloses fallback mode and performs validation/reporting before PR creation.

## AI maintenance configuration

The separate AI Skill Maintenance workflow needs:

- Actions secret `ANTHROPIC_API_KEY`
- Actions variable `ANTHROPIC_MODEL`

Inspect configuration without a network call or exposing the key:

```bash
node shared/scripts/ai-generate-updates.mjs --check-config
```

The generator hashes the complete sorted registry state with SHA-256. Every Core AI release source changes that state and uses the registry's affected-skill list. Without supplied tagged-file evidence, it records a review recommendation instead of rewriting a skill. Its error artifact contains only a redacted category such as `missing-api-key`, `rate-limit`, or `model-access`.

If generation fails, is skipped, or produces no edits, the workflow validates and opens the index-only path with the drift report. It must never describe that PR as skill alignment.

## Safe reruns

- Re-running either workflow is safe: deterministic JSON makes an unchanged run a no-op.
- Do not delete a refresh branch to hide red drift; update the named skill on that branch or close the PR with a recorded reason.
- If one source endpoint is temporarily unavailable, rerun later. Never hand-author an empty index.
- A successful advisory dry run is still not approval to merge generated prose; tagged citations and live verification remain required.

## Abilities source priority

The Abilities API is in Core from WordPress 6.9. Use `wordpress-develop` release branches (`7.1`, `7.0`, `6.9`) rather than `trunk` to answer release-specific questions. The archived `WordPress/abilities-api` feature plugin is not a current behavior source or pre-6.9 shim.

For external exposure, MCP Adapter is independently versioned and security-sensitive. Its 0.6.0 release changed fallback exposure to `meta.mcp.public ?? meta.public ?? false`, so Core and MCP markers must remain independent. Gutenberg's `packages/abilities` and `packages/core-abilities` remain the canonical client-side source.
