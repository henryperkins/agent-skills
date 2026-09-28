# WordPress Skills 1.12.2

A same-day follow-up to 1.12.1: `wp-ai-connectors` is re-verified against the
Google and OpenAI provider plugins' 1.2.0 releases (2026-09-21), and their
upstream indices are refreshed. Baselines: Anthropic 1.0.4, **Google 1.2.0**,
**OpenAI 1.2.0**; every other marker is unchanged from 1.12.1.

Details: the addendum to `docs/core-ai-skills-audit-2026-09-27.md`.

## wp-ai-connectors

- **Dev dependency precedent.** Both providers now declare
  `wordpress/php-ai-client: ^1.3.1` in `require-dev` — the SDK Core bundles —
  and run PHPUnit against the lowest and the latest SDK. The skill had cited
  OpenAI 1.1.0's `^1.4` as the pattern to copy. Keeping the SDK out of the
  shipped plugin and gating 1.4-only symbols with `interface_exists()` are
  unchanged.
- **Text to speech needs no version gate.** Both providers added text-to-speech
  models in 1.2.0 and return them from `createModel()` unconditionally, because
  `TextToSpeechConversionModelInterface` is already in SDK 1.3.1. The
  capabilities reference now contrasts that with embeddings, whose interface
  arrived in 1.4.0.
- Verified unchanged at 1.2.0: plugin headers, the `class_exists()` guard,
  `init` priority 5, the autoloader, `.distignore`, the deploy workflow, the
  registration shape, Google's lack of an embedding model, and OpenAI's gated
  embedding branch.

## Maintenance

- `shared/references/ai-provider-google-releases.json` and
  `ai-provider-openai-releases.json` refreshed; the drift gate is green across
  all 22 declarations.
- Release-conformance pins track the new baselines and the `^1.3.1` precedent,
  and exclude the old `^1.4` wording.

## Verification

Run against the final tree in Linux containers matching CI (`node:20`,
`python:3.11`), cloned from a bundle of the committed branch:

- `node eval/harness/run.mjs` (strict)
- skillpack build and install smoke for the `codex` and `vscode` targets
- `node shared/scripts/check-upstream-drift.mjs` (22 checks)
- `skills-ref validate` for all 22 skill directories

GitHub Actions are unavailable for this repository, so no hosted workflow run
is presented as release evidence.
