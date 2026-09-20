# `block.json` (metadata) guidance

Use this file when you’re editing `block.json` fields or choosing between script/styles fields.

## Practical rules

- Treat `name` as stable API (renaming breaks existing content).
- Prefer adding new functionality without changing saved markup; if markup must change, add a `deprecated` version.
- Keep assets scoped: editor assets should not ship to frontend unless needed.

## API version + schema

**WordPress 6.9+ requires apiVersion 3.** The block.json schema now only validates blocks with `apiVersion: 3`. Older versions (1 or 2) trigger console warnings when `SCRIPT_DEBUG` is enabled.

**Why apiVersion 3 matters:** WordPress 7.0 enforces the iframed post editor only while every block inserted in the post uses Block API version 3 or later. If an inserted block uses API version 1 or 2, WordPress removes the iframe for backward compatibility. New and maintained blocks should still declare `apiVersion: 3` and load editor styles through `block.json`.

When the editor remains iframed, this provides style isolation (admin CSS will not affect editor content), correct viewport units (`vw`, `vh`), and native media queries.

**Migration checklist:**
1. Update `apiVersion` to `3` in block.json.
2. Ensure all style handles are declared in block.json (styles not included won't load in the iframe).
3. Test blocks that rely on third-party scripts (window scoping may differ).
4. Add a `$schema` to improve editor tooling and validation.

References:

- Block metadata: https://developer.wordpress.org/block-editor/reference-guides/block-api/block-metadata/
- Block API versions: https://developer.wordpress.org/block-editor/reference-guides/block-api/block-api-versions/
- Iframe migration guide: https://developer.wordpress.org/block-editor/reference-guides/block-api/block-api-versions/block-migration-for-iframe-editor-compatibility/
- Block schema index: https://schemas.wp.org/

## WordPress 7.1 additions

### `supports.autoRegister` — PHP-only blocks in the editor

A dynamic block with a `render_callback` can now appear in the editor with **no JavaScript registration at all**:

```json
{
  "$schema": "https://schemas.wp.org/trunk/block.json",
  "apiVersion": 3,
  "name": "my-plugin/server-card",
  "render": "file:./render.php",
  "supports": { "autoRegister": true }
}
```

Core collects every registered block whose `supports.autoRegister` is truthy **and** which has a `render_callback`, then exposes the list to the editor (`_wp_enqueue_auto_register_blocks()` in `wp-includes/blocks.php`, published as `window.__unstableAutoRegisterBlocks`). The editor renders those blocks with `ServerSideRender`.

Consequences worth knowing before reaching for it:

- **Both conditions are required.** `autoRegister` without a `render_callback` (or a `render` file that produces one) registers nothing; the block silently does not appear.
- **The editing experience is `ServerSideRender`,** not a real edit component: a server round-trip per change, no inline editing, no block-specific inspector controls beyond what supports give you. It suits blocks that are display-only in the editor, not blocks people type into.
- **The API version is forced to 3 in the editor.** A block declaring apiVersion 1 or 2, or none, is treated as 3. Combined with the 7.0 iframe rule, that means an auto-registered legacy block no longer drops the post editor out of its iframe — but it also means the block runs under API 3 semantics whether or not its markup expects them.
- The transport global is `__unstable`-prefixed. Do not read it directly; let the editor consume it.

### `selectors.states` — custom block states for theme.json

`selectors` gains a `states` map, which is what theme.json's custom block states resolve against:

```json
{
  "selectors": {
    "states": { "-current": ".current-menu-item" }
  }
}
```

A theme then targets `styles.blocks.<block>["-current"]`. The `-` prefix distinguishes these from real CSS pseudo-selectors. **Declaring `selectors.states` is necessary but not sufficient:** core also gates which blocks accept custom states in theme.json via `WP_Theme_JSON::VALID_BLOCK_CUSTOM_STATES`, which today lists only `core/navigation-link`. A third-party block can ship `selectors.states` and still have no theme.json surface. See the `wp-block-themes` skill's `references/theme-json.md`.

### Ahead of core

`supports.layout.default.autoFit` (grid columns stretching to fill rather than leaving empty tracks) is in the Gutenberg block.json schema but **not** in WordPress 7.1's layout support. Treat it as plugin-only until it appears in a core release.

## Modern asset fields to know

This is not a full schema; it’s a “what matters in practice” list:

- `editorScript` / `editorStyle`: editor-only assets.
- `script` / `style`: shared assets.
- `viewScript` / `viewStyle`: frontend view assets.
- `viewScriptModule`: module-based frontend scripts (newer WP).
- `render`: points to a PHP render file for dynamic blocks (newer WP).

## Helpful upstream references

- Block metadata reference (block.json):
  - https://developer.wordpress.org/block-editor/reference-guides/block-api/block-metadata/
- Block.json schema (editor tooling):
  - https://schemas.wp.org/trunk/block.json

