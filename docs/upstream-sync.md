# Upstream sync (automation plan)

Goal: when upstream changes (WordPress core releases, Gutenberg releases, docs updates), the repo should **regenerate indexes** and (eventually) **open PRs** that update affected skills/references.

## What to automate first (low risk)

1. **Indexes and matrices**
   - WordPress core version list (latest stable + recent).
   - Gutenberg releases list (latest stable + recent).
   - WordPress ↔ Gutenberg mapping table (derived from canonical docs where available).
2. **Routing metadata refresh**
   - Update `shared/references/*.json` files only.

This keeps automation deterministic and reviewable before it starts rewriting skill prose.

## Later automation (higher risk)

- “Reference chunk regeneration” from upstream docs into `skills/*/references/*.md`.
- Task-shaped deltas (e.g. a new Gutenberg package, new block APIs, changes in theme.json schema).
- Semi-automated PRs that include:
  - regenerated references
  - updated checklists
  - updated eval scenarios

## Scripts

- `shared/scripts/update-upstream-indices.mjs`
  - Fetches upstream sources and rewrites JSON indexes in `shared/references/`.
  - Covers WordPress core versions, Gutenberg releases, WordPress/ai (canonical AI plugin) releases, WordPress/mcp-adapter releases, WordPress/php-ai-client releases, and the WP↔Gutenberg mapping.
  - Drafts and prereleases are dropped. That filter is load-bearing: mcp-adapter publishes a rolling `ci-artifacts` prerelease that would otherwise sort to the front and pin every skill to a tag that is not a release.
- `shared/scripts/check-upstream-drift.mjs`
  - Offline check (run by `eval/harness/run.mjs` and therefore CI): compares the committed release indexes against the version each skill declares in its `compatibility:` frontmatter line.
  - When the Upstream Sync workflow's refresh PR lands a newer release, CI turns red until the affected skill is re-synced against the tagged source and its marker is bumped. This converts "someone notices the skill is stale" into a forced, reviewable follow-up.

### Tracked pairs

| Upstream | Index | Skill marker |
| --- | --- | --- |
| `WordPress/ai` | `ai-plugin-releases.json` | `current canonical release: vX.Y.Z` in `skills/wp-ai-plugin/SKILL.md` |
| `WordPress/mcp-adapter` | `mcp-adapter-releases.json` | `Verified against MCP Adapter X.Y.Z` in `skills/wp-abilities-api/SKILL.md` |
| `WordPress/php-ai-client` | `php-ai-client-releases.json` | `Verified against PHP AI Client X.Y.Z` in `skills/wp-ai-client/SKILL.md` |
| WordPress core | `wordpress-core-versions.json` | `and WordPress X.Y (bundles ...)` in `skills/wp-ai-client/SKILL.md`, compared at major.minor |
| WordPress core | `wordpress-core-versions.json` | `Verified against WordPress X.Y` in `skills/wp-block-themes/SKILL.md`, compared at major.minor |

A pair earns a check when the skill makes version-specific claims a release can falsify. All five qualify: the AI plugin moves Experiments and Abilities every release, the adapter reversed both its packaging advice and its exposure rule in 0.6.0, the SDK made the embedding model mandatory in 1.5.0, `theme.json` grows a "WordPress X.Y additions" section most core minors, and the remaining Core claim is about which SDK version Core bundles.

**The Gutenberg plugin is deliberately not tracked.** It releases fortnightly; a marker pinned to it would be red most of the time and would get switched off rather than acted on. The block skills document what is in core, so the two core-version checks fire on the two or three minor releases a year that actually move that line. Claims about Gutenberg running ahead of core are labelled in prose instead — re-read them whenever you touch the surrounding section.

The core check compares only major.minor, because Core ships patch releases that never change the bundled SDK; a minor bump is the event worth re-checking.

**Adding a pair:** add the source to `update-upstream-indices.mjs`, run it to write the index, add a `Verified against <Name> X.Y.Z` marker to the skill's `compatibility:` line, and add a `CHECKS` entry. Then confirm the gate actually fires by lowering the marker and re-running — a drift check that cannot fail is worse than none, because it reads as coverage.

## CI / PR bot design (recommended)

- Schedule a workflow (daily/weekly).
- Run `shared/scripts/update-upstream-indices.mjs`.
- If `git diff` is non-empty, open a PR with:
  - a summary of changes
  - links to upstream release notes
  - a checklist for human review (“does this impact blocks/themes/plugin workflows?”)

## Validation

- Always run `node eval/harness/run.mjs`.
- Optional: use Agent Skills reference validator:
  - `skills-ref validate skills/<skill-name>`

The updater is transactional with respect to parsing: it fetches and normalizes all three sources before writing any index. If the canonical WordPress/Gutenberg mapping cannot be parsed into at least one row, the command exits non-zero and preserves the checked-in indexes. Never accept `table-not-found` or an empty `rows` array as a successful refresh.

## Canonical sources

The automation should prefer canonical sources and avoid scraping where possible.

- WordPress core releases and API endpoints (official WordPress APIs)
- Gutenberg releases (GitHub releases)
- WordPress developer docs (used for the WP↔Gutenberg mapping when no API exists)

