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
  - Covers WordPress core versions, Gutenberg releases, WordPress/ai (canonical AI plugin) releases, WordPress/mcp-adapter releases, and the WP↔Gutenberg mapping.
- `shared/scripts/check-upstream-drift.mjs`
  - Offline check (run by `eval/harness/run.mjs` and therefore CI): compares the committed release indexes against the canonical release each skill declares (e.g. the `current canonical release: vX.Y.Z` marker in `skills/wp-ai-plugin/SKILL.md`).
  - When the Upstream Sync workflow's refresh PR lands a newer release, CI turns red until the affected skill is re-synced against the tagged source and its marker is bumped. This converts "someone notices the skill is stale" into a forced, reviewable follow-up.

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

### Abilities API specifically

The Abilities API is core from WordPress 6.9. Its canonical sources, in priority order:

1. **Core source** — `src/wp-includes/abilities-api.php` and `src/wp-includes/abilities-api/`
   in `WordPress/wordpress-develop`. The `@since` tags are the authority on which surface belongs
   to which release.
2. **Make/Core dev notes** — the per-release notes carry the rationale and the Trac tickets.
3. **`developer.wordpress.org/apis/abilities-api/`** — the handbook; correct but less current than
   the source during a release cycle.
4. **Gutenberg `packages/abilities` and `packages/core-abilities`** for the client-side API.

Two adjacent projects version independently and must be tracked separately:

- **`WordPress/mcp-adapter`** — not core, ships no part of WordPress. It has already reversed an
  ability-exposure default once (0.6.0), so a stale pin here inverts security-relevant guidance
  rather than merely aging. `check-upstream-drift.mjs` gates it against the marker in
  `skills/wp-abilities-api/SKILL.md`.
- **`WordPress/ai`** — hosts abilities proposed for core but not yet merged.

#### Read the release branch, not `trunk`

Once a release branches, `trunk` moves on and stops describing it. Verifying "what WP 7.1 does"
against `trunk` is only accidentally correct, and silently stops being correct the moment 7.2
lands a change. Read `wordpress-develop` at the **release branch** (`7.1`, `7.0`, `6.9`), and
diff branches when you need to know which release introduced a behavior rather than trusting a
single `@since` tag.

`check-upstream-drift.mjs` carries a third check for this: it compares the released core version
in `shared/references/wordpress-core-versions.json` against the `core verified through:` marker
in `skills/wp-abilities-api/SKILL.md`, at **minor** granularity. A patch release stays quiet; a
new minor turns CI red, because that is when a large pre-release-verified surface needs
re-checking against a shipped build. The abilities skills currently describe a 7.1 surface
verified against the `7.1` branch at RC3, so the gate fires when 7.1 ships stable.

The **`WordPress/abilities-api` feature plugin is archived** (5 February 2026, read-only; last
tagged release the `v0.5.0-rc` prerelease of 14 November 2025, last stable `v0.4.0`). It is not a
source for current behavior and must not be recommended as a pre-6.9 shim. Its version numbers
are also not comparable to the MCP Adapter's — both are in `0.x` and the two `0.5.0`s are
unrelated releases of different projects.

