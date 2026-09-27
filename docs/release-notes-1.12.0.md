# WordPress Skills 1.12.0

An upstream-merge release. It brings in the six commits WordPress/agent-skills
trunk gained since the 2026-08-17 merge (a new `wp-env` skill, WebMCP routing
for Playground, and plugin security guidance) and corrects the new skill
against the `@wordpress/env` 11.16.0 source before shipping it.

## New skill: wp-env

- **wp-env** (upstream #38) covers setting up, configuring, and
  troubleshooting `@wordpress/env` environments: installation, zero-config
  detection, `.wp-env.json` and override files, `wp-env run`, Xdebug,
  multisite, and when to prefer `wp-playground` instead.
- Upstream's text follows the package README, which lags the code. Checked
  against the 11.16.0 package source, and run where the behavior mattered, the
  fork corrects:
  - `composer` is no longer a `wp-env run` container; `composer` and
    `phpunit` run inside `cli`, and the `tests-*` containers are listed.
  - `wp-env run` passes arguments to `docker compose exec` without a shell,
    so a whole command in one quoted string fails with
    `executable file not found in $PATH`. The examples are unquoted.
  - The database image is `mariadb:lts`, which has no `mysql` binary; the
    client example uses `mariadb`.
  - `npx wp-env` resolves the unrelated unscoped `wp-env` npm package when the
    local install is missing, and npm installs it without asking in a
    non-interactive shell. Local installs now run through
    `npm exec --no -- wp-env`.
  - `cleanup` and `destroy` wait for a confirmation unless `--force` is
    passed; the skill asks for the user's go-ahead first.
  - Override files also merge `lifecycleScripts`; the invalid-source error is
    `Invalid or unrecognized source: "<value>"`; relative paths need a
    leading `.`; the default tests environment (port 8889) is deprecated in
    favour of `--config`; `--auto-port` is ignored when `CI` is set.
- Follows fork conventions: the WordPress 6.9 floor (wp-env covers no 7.0-only
  API), `license: GPL-2.0-or-later`, and a `wp-playground` boundary in the
  description.
- `wordpress-router` routes `wp-env`, `@wordpress/env`, and `.wp-env.json`
  requests to the new skill. Upstream still routes wp-env to the planned
  `wp-testing` skill. The inventory in `docs/skill-set-v1.md` now lists 22
  skills.

## Playground: WebMCP site tools (upstream #105)

- `references/website.md` now chooses an interaction method for an existing
  browser site: WebMCP site tools by default, Playground MCP when the user asks
  for it or as a fallback, and the `window.playgroundSites` / active-client
  JavaScript APIs for anything else. The JavaScript API material moved to
  `references/sites-api.md`; WebMCP and Playground MCP each have their own
  reference. The listed tool names match `packages/playground/mcp` in
  WordPress/wordpress-playground.
- The router sends WebMCP and Playground MCP requests to
  `wp-playground` → `website.md`.
- Four new eval scenarios cover method selection and fallback.

## Plugin development

- `references/security.md` adds context-specific output escaping and AJAX
  handler rules (upstream #63).
- `detect_plugins.mjs` now recognises docblock-style ` * Plugin Name:` headers
  (upstream #103). `detect_wp_project.mjs` already carried a broader fix and
  keeps it.

## Release maintenance

- The WordPress core index stays at **7.1.2**, which api.wordpress.org still
  reports as current; upstream's #92 refresh stopped at 7.1.1. The Gutenberg
  index is unchanged at **v24.0.0**, since v24.1.0 is still a release
  candidate.
- Removed WordPress-org automation that does nothing in this fork: the
  `.github/CODEOWNERS` file upstream added in #108 (its team,
  `@WordPress/agent-skills-maintainers`, does not resolve here) and the Props
  Bot workflow.
- New `assertWpEnvPrecision` gate: it pins the wp-env corrections and the
  fork-only router entry, and fails on upstream's original `SKILL.md`.

## Verification

Run against the final tree in Linux containers matching CI (`node:20`,
`python:3.11`), with LF content:

- `node eval/harness/run.mjs`
- skillpack build and install smoke for the `codex` and `vscode` targets
- `skills-ref validate` for all 22 skill directories
- `node shared/scripts/check-upstream-drift.mjs`

GitHub Actions are unavailable for this repository, so no hosted workflow run
is presented as release evidence.
