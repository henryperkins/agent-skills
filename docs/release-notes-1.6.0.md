# Release notes — 1.6.0

## 2026-08-17

Merged the three commits `WordPress/agent-skills` trunk was ahead by (#79, #83, #82).

- Bumped plugin metadata to `1.6.0` in `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`.
- Refactored `wp-patterns` for predictability (upstream #79):
  - `SKILL.md` restructured around progressive disclosure — nine guardrails collapsed to six with pointers, detail moved into `references/`.
  - Added **Done when:** completion criteria to every procedure step, and promoted verification to a gated step rather than a trailing section.
  - Added `references/example-prompts.md` and `references/visual-composition.md`; expanded `anti-patterns.md`, `design-with-tokens.md`, and `pattern-categories-and-types.md`.
  - Kept fork conventions through the merge: `license: GPL-2.0-or-later`, the `WordPress 6.9 with PHP 7.2.24 or later` compatibility contract, the `Use when ...` description opener, and relative `../wp-*/scripts/*.mjs` invocations.
  - Folded upstream's description additions into the fork's opener: Query Loop layouts, pattern registration/categories, design-quality review, and routing to `wp-block-development` / `wp-interactivity-api`.
- Re-anchored two release-conformance gates that upstream's refactor relocated out of `wp-patterns/SKILL.md`:
  - Escaping guidance now asserted in `references/pattern-registration.md`.
  - Preset-over-hardcoded precedence now asserted in `references/design-with-tokens.md`.
- `wp-block-themes` `theme.json` form-element key fix (upstream #83) was already present in this fork; the merge confirmed parity rather than changing content.
- Kept this fork's `shared/references/` index snapshots over upstream's #82 refresh. Verified against the live sources: `api.wordpress.org` reports `7.0.4` and the Gutenberg releases API reports `v23.7.2` (2026-08-11) as the newest stable, against upstream's `7.0.3` / `v23.7.1`.
