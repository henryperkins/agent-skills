---
name: wp-playground
description: Use when routing ambiguous WordPress Playground work, running local CLI sessions with @wp-playground/cli, creating playground.wordpress.net share links or browser previews, or working with snapshots, mounts, version switching, and Xdebug. For Blueprint JSON authoring or review, use the blueprint skill directly.
compatibility: "Targets WordPress 6.9+ (PHP 7.2.24+). Playground CLI requires Node.js 20.18+; runs WP in WebAssembly with SQLite."
license: GPL-2.0-or-later
---

# WordPress Playground

This is a thin routing wrapper. Use it to pick the right Playground workflow, then load only the focused reference or skill needed for the task.

## Procedure

1. Identify the user intent: Blueprint authoring/review, local CLI execution, browser-only website/share link workflow, Xdebug/stuck CLI run, or a mixed Playground request.
2. Route to the focused source below, loading more than one only when the request has multiple distinct parts.
3. For mixed requests, delegate Blueprint JSON work to `blueprint`, then return here for runtime, CLI, debugging, or sharing guidance.

- **Blueprint JSON, schema, steps, resources, bundles, or Blueprint review**: use the `blueprint` skill directly. Do not duplicate Blueprint schema details here.
- **Local CLI execution**: read [references/cli.md](references/cli.md) for `@wp-playground/cli` `start`, `server`, `run-blueprint`, `build-snapshot`, mounts, version switching, and local validation.
- **Xdebug or stuck CLI runs**: read [references/debugging.md](references/debugging.md) for Xdebug, runtime logs, worker flags, and stuck CLI runs.
- **Browser-only Playground website workflows**: read [references/website.md](references/website.md) for `playground.wordpress.net`, share URLs, Blueprint Editor, hosted bundles, and browser limitations.

## Inputs required

- The intended workflow: Blueprint authoring, local CLI run, website/share link, snapshot, or debugging.
- Project or bundle path if local code must be mounted or packaged.
- Desired WordPress/PHP versions if compatibility matters.
- Port preference if a local server is needed.
- Whether browser-only sharing or local filesystem access is required.

## Guardrails

- Playground instances are disposable, SQLite-backed environments; never point them at production data or mount secrets.
- Keep Blueprint JSON guidance in `blueprint` so the schema and examples have one source of truth.
- For local CLI work, pin `@wp-playground/cli@3.1.45` and confirm Node.js 20.18 or later with `node -v`.
- Browser-only Playground cannot read local filesystem paths; use public URLs, hosted ZIP bundles, or inline Blueprint JSON.

## Verification

- For Blueprint content, validate against the published schema and follow the `blueprint` skill verification.
- For local CLI runs, verify the mounted plugin/theme or Blueprint side effects in the Playground instance.
- For share links, open the generated URL and confirm the expected landing page and installed assets load.

## Failure modes

- **Blueprint work routed here**: stop and use the `blueprint` skill for schema keys, steps, resources, bundles, validation, or Blueprint review.
- **Local filesystem needed in a browser-only workflow**: use `references/cli.md`; `playground.wordpress.net` cannot read local filesystem paths.
- **Shareable browser link requested from a local CLI workflow**: use `references/website.md`; local server URLs are not portable share links.
- **Debugging treated as a second-hop reference**: read `references/debugging.md` directly for Xdebug, logs, worker flags, and stuck CLI runs.

## Escalation

- If the task needs native PHP extensions, external database access, persistence, or production-like infrastructure that Playground cannot provide, use a full WordPress stack such as wp-env, Docker, or the project-provided environment.
