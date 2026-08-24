# AI plugin smoke test (Playground)

Verifies `skills/wp-ai-plugin`'s core claims against a **live WordPress 7.1** site with
the canonical AI plugin (latest from wordpress.org), using WordPress
Playground — no server setup required.

```bash
./run.sh
```

What it exercises, in two clean WordPress request phases:

1. The documented downstream registration chain: a mu-plugin adds an
   Experiment class via the `wpai_default_feature_classes` filter, guarded on
   `class_exists( Abstract_Feature )`; the blueprint enables the global
   (`wpai_features_enabled`) and per-feature toggles so the Loader calls
   `register()`; the Experiment registers a `smoke/echo` ability on
   `wp_abilities_api_init`; the check then executes it (`"hi"` round-trip,
   with `permission_callback` satisfied via `wp_set_current_user`).
2. With `wpai_feature_custom-abilities_enabled` false, all five are absent:
   `core/read-content`, `core/read-users`, `core/read-settings`,
   `ai/get-post-details`, and `ai/get-post-terms`.
3. With `wpai_feature_custom-abilities_enabled` true, all five are present.
   The fixture changes only the option and lets the plugin's normal loader
   register them; the MU plugin never registers or substitutes those abilities.
4. In both states, the downstream `smoke/echo` ability executes and Suggest
   Reply (`ai/suggest-reply`) remains enabled.

The mu-plugin (`mu-plugins/wpai-skill-smoke.php`) is intentionally written
exactly as the skill instructs — if the skill's guidance drifts from the
plugin's real extension surface, this run fails.

Network-heavy (downloads WP + plugin zip per run), so it is not part of
`eval/harness/run.mjs` / CI-on-push. Run manually after a `wp-ai-plugin`
re-sync, or wire into a scheduled workflow alongside the upstream-sync
refresh.

Last verified: WordPress 7.1, AI plugin 1.3.0, Playground CLI latest, 2026-08-24.
