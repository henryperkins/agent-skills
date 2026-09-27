# WordPress Skills 1.9.0

Release 1.9.0 realigns the six Core AI skills with tagged executable source as of 2026-08-24.

## Source-alignment corrections

- Rebaseline the canonical AI plugin guidance to **WordPress/ai 1.3.0**, including all nineteen experiments, the **Custom Abilities** gate, five gated abilities, released ability-scoped prompt filters, settings import/export, request logging, Site Health, metadata migration, and current security behavior.
- Treat the WordPress/ai 1.3.0 **embedding overlay** as inactive on stock WordPress 7.1 because `SDK_Overlay::register()` is commented out in the release tag. The helpers remain documented behind runtime feature detection.
- Replace the AI plugin smoke fixture with a **two-state** check that proves the five gated abilities are absent while Custom Abilities is disabled and present after it is enabled.
- Revalidate Abilities API guidance against **WordPress 7.1** final and **Gutenberg 23.8.0**, retaining the WordPress 6.9+/PHP 7.2.24+ floor.
- Refresh AI Client and connector guidance for PHP AI Client 1.4.0, WP AI Client 0.4.0, Anthropic 1.0.4, Google 1.1.1, and OpenAI 1.1.0.

## Maintenance and drift detection

- Track Core, Gutenberg, the canonical AI plugin, MCP Adapter, PHP AI Client, WP AI Client, and all three provider plugins through one shared source registry.
- Make every source independently capable of failing the deterministic **drift** gate, including skill-local verified markers and the WordPress-to-Gutenberg mapping.
- Keep index refresh useful when advisory AI **maintenance** cannot run: deterministic indices and the sync report remain authoritative, while generated edits are non-blocking.

## Verification evidence

Local verification on 2026-08-24:

- `node eval/harness/run.mjs` passed the complete offline harness, including all eighteen registry-derived drift checks.
- `node shared/scripts/check-upstream-drift.mjs` reported all eighteen declarations current.
- `node shared/scripts/ai-generate-updates.mjs --check-config` completed without a network call and correctly reported the missing repository API configuration.
- The WordPress Playground smoke test passed against WordPress 7.1 and WordPress/ai 1.3.0: zero of five gated abilities were registered while Custom Abilities was disabled, and all five were registered after it was enabled.
- `node shared/scripts/skillpack-build.mjs --clean --out=/tmp/wordpress-skills-1.9.0 --targets=codex,vscode` built both targets. All six Core AI skill directories matched their source directories byte-for-byte, and both release manifests reported 1.9.0.
- Both workflow files parsed successfully as YAML, the tracked JSON files parsed successfully, and `git diff --check` passed.

## Remote verification outstanding

The implementation is ready on `trunk`, but the release completion gate remains open until the new workflow definitions are pushed and exercised:

- Manually dispatch **Upstream Sync** and record a successful run of the new deterministic validation/report path.
- Configure the `ANTHROPIC_API_KEY` Actions secret and `ANTHROPIC_MODEL` repository variable, then manually dispatch an **AI Skill Maintenance** dry run and record a successful advisory path.

The five scheduled AI maintenance runs immediately preceding this implementation all refreshed indices successfully and then failed with the redacted category `missing-api-key`; both PR jobs were consequently skipped. Evidence: [2026-08-24](https://github.com/WordPress/agent-skills/actions/runs/32693703242), [2026-08-17](https://github.com/WordPress/agent-skills/actions/runs/31998029993), [2026-08-10](https://github.com/WordPress/agent-skills/actions/runs/31359714547), [2026-08-03](https://github.com/WordPress/agent-skills/actions/runs/30790232413), and [2026-07-27](https://github.com/WordPress/agent-skills/actions/runs/30242823702). The revised workflow preserves the deterministic index-only path when advisory generation fails.
