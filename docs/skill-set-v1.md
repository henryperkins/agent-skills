# WordPress skill set (v1)

This repository ships 21 skills. The list below is the complete inventory of
`skills/*` and is enforced against the filesystem by
`assertRemediationRelease191()` in `eval/harness/release-conformance.mjs`, so it
cannot drift from what is actually installed.

- `blueprint`
- `wordpress-router`
- `wp-abilities-api`
- `wp-abilities-audit`
- `wp-abilities-verify`
- `wp-ai-client`
- `wp-ai-connectors`
- `wp-ai-plugin`
- `wp-block-development`
- `wp-block-themes`
- `wp-interactivity-api`
- `wp-patterns`
- `wp-performance`
- `wp-phpstan`
- `wp-playground`
- `wp-plugin-development`
- `wp-plugin-directory-guidelines`
- `wp-project-triage`
- `wp-rest-api`
- `wp-wpcli-and-ops`
- `wpds`

Earlier revisions of this file carried a "planned next skills" section naming
skills that were never implemented. It has been removed: a roadmap that nothing
verifies reads as an inventory, and readers acted on it as one. Propose new
skills in an issue or pull request instead, where the proposal can be reviewed
against the authoring guide.
