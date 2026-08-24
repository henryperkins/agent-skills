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

Verification commands, package inspection, and workflow-run links will be recorded here before the release is finalized.
