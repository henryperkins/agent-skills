# `theme.json` guidance

Use this file when changing global settings/styles or per-block styling.

## High-level structure

Common top-level keys:

- `version`
- `settings` (what the UI exposes / allows)
- `styles` (default appearance)
- `customTemplates` and `templateParts` (optional, to describe templates and parts)

Upstream references:

- Theme Handbook: https://developer.wordpress.org/themes/global-settings-and-styles/
- Block Editor Handbook (often more current): https://developer.wordpress.org/block-editor/how-to-guides/themes/theme-json/
- Theme JSON living reference: https://developer.wordpress.org/block-editor/reference-guides/theme-json-reference/theme-json-living/
- Theme JSON version 3 (dev note): https://make.wordpress.org/core/2024/06/19/theme-json-version-3/

## Practical guardrails

- Prefer presets when you want editor-visible controls (colors, font sizes, spacing).
- Prefer `styles` when you want consistent defaults without requiring user choice.
- Be careful with specificity: user global styles override theme defaults.

## WordPress 6.9 additions

**Form element styling:**
- Style text inputs and selects via `styles.elements.textInput` and `styles.elements.select`.
- `textInput` targets `<textarea>` and `<input>` elements whose `type` is one of: email, number, password, search, text, tel, url.
- There is no `input`, `checkbox`, `radio`, or `label` element key.
- Supports border, color, outline, shadow, and spacing properties.
- Note: Focus state styling is not yet available in 6.9.

**Border radius presets:**
- Define presets in `settings.border.radiusSizes` for visual selection in the border radius control.
- Users can still enter custom values.

```json
{
  "settings": {
    "border": {
      "radiusSizes": [
        { "name": "Small", "slug": "small", "size": "4px" },
        { "name": "Medium", "slug": "medium", "size": "8px" },
        { "name": "Large", "slug": "large", "size": "16px" }
      ]
    }
  }
}
```

## WordPress 7.0 additions

Keep `theme.json` at version 3. Under `settings.dimensions`, WordPress 7.0 supports reusable dimension presets through `dimensionSizes`. Use the resulting preset values for `width`, `height`, and `min-height` only in controls or block properties that support the corresponding dimension; do not replace unsupported use cases with custom CSS.

Core Button styles can now express interaction states in `theme.json`: `:hover`, `:focus`, `:focus-visible`, and `:active`. Use `:focus-visible` to provide a keyboard-visible focus indicator, and retain the WordPress 6.9 form styling and border-radius presets above as separate guidance.

```json
{
  "version": 3,
  "settings": {
    "dimensions": {
      "dimensionSizes": [
        { "name": "Content", "slug": "content", "size": "40rem" },
        { "name": "Wide", "slug": "wide", "size": "72rem" }
      ]
    }
  },
  "styles": {
    "blocks": {
      "core/button": {
        ":hover": { "color": { "background": "#1e1e1e" } },
        ":focus-visible": { "outline": { "color": "#3858e9", "style": "solid", "width": "2px" } },
        ":active": { "color": { "background": "#000000" } }
      }
    }
  }
}
```

References:

- Border radius presets: https://make.wordpress.org/core/2025/11/12/theme-json-border-radius-presets-support-in-wordpress-6-9/
- Form element styling: https://developer.wordpress.org/news/2025/11/how-wordpress-6-9-gives-forms-a-theme-json-makeover/

## WordPress 7.1 additions

Still version 3 — 7.1 adds settings and style *states*, not a schema version.

### Responsive style states

`styles` can now carry breakpoint states. Two keys are valid, `@mobile` and `@tablet`, and they are set per block, per element, and per variation — not at the top level of `styles`:

```json
{
  "version": 3,
  "settings": {
    "viewport": { "mobile": "480px", "tablet": "782px" }
  },
  "styles": {
    "blocks": {
      "core/button": {
        "typography": { "fontSize": "1.25rem" },
        "@tablet": {
          "typography": { "fontSize": "1rem" },
          "elements": { "link": { ":hover": { "color": { "text": "#1e1e1e" } } } }
        },
        "@mobile": { "typography": { "fontSize": "0.875rem" } }
      }
    }
  }
}
```

Where a state may appear: `styles.elements.<element>`, `styles.blocks.<block>` (and inside it, `elements` and their pseudo-selectors), and `styles.blocks.<block>.variations.<variation>` including that variation's inner `blocks`. Variation definitions still cannot nest inside each other.

**There is no `@desktop` key in `theme.json`.** Core can generate a desktop media query, but only when a caller passes `include_desktop` to `WP_Theme_JSON::get_viewport_media_queries()`, and nothing in theme.json validation does. Desktop is the unqualified base declaration; `@mobile` and `@tablet` narrow it. Writing `"@desktop": { ... }` silently validates away.

Emitted media queries, from `settings.viewport`:

| State | Both breakpoints set | Only that breakpoint set |
| --- | --- | --- |
| `@mobile` | `@media (width <= 480px)` | same |
| `@tablet` | `@media (480px < width <= 782px)` | `@media (width <= 782px)` |

So `@tablet` means "tablet band" when `mobile` is also configured, and "tablet and below" when it is not. Declaring only `tablet` is a different cascade from declaring both, not a subset of it.

### `settings.viewport`

Defaults are `mobile: "480px"` and `tablet: "782px"`. Sanitisation is strict and silent, so get it right rather than expecting an error:

- Values must match `^(?:\d+|\d*\.\d+)(?:px|em|rem)$`. CSS functions, percentages, `vw`, and other units are rejected — the value is interpolated into a media query, so the allow-list is a security boundary, not a style preference.
- An invalid value is dropped, not corrected. If both end up invalid (or `viewport` is not an object), **both defaults are restored**.
- If exactly one survives, only that one is used, keyed by its own name.
- If both survive but `mobile >= tablet`, **`tablet` is dropped** and only `mobile` is used. Comparison converts `em`/`rem` at a 16px base; the emitted query keeps your original units.

`viewport` is a **top-level setting only.** It is not in the per-block settings enum, so `settings.blocks.core/button.viewport` is not valid.

### `settings.blockVisibility`

```json
{ "settings": { "blockVisibility": { "allowEditing": false } } }
```

`allowEditing` (default `true`) controls whether the block visibility controls appear in the editor. **It does not control rendering:** visibility attributes already saved on blocks are still applied regardless. Setting it to `false` locks the control, it does not disable the feature. Like `viewport`, this is top-level only.

### Block states beyond pseudo-selectors

`core/navigation-link` joins `core/button` in `VALID_BLOCK_PSEUDO_SELECTORS` (`:hover`, `:focus`, `:focus-visible`, `:active`), and 7.1 adds a separate concept: **custom states** that map to CSS classes rather than pseudo-selectors. They use a `-` prefix to distinguish them:

```json
{
  "styles": {
    "blocks": {
      "core/navigation-link": {
        "-current": {
          "typography": { "fontWeight": "700" },
          ":hover": { "color": { "text": "#1e1e1e" } }
        }
      }
    }
  }
}
```

The CSS selector behind `-current` comes from the block's own `block.json` (`selectors.states`), and a block listed in `VALID_BLOCK_CUSTOM_STATES` inherits its pseudo-selectors as sub-states, producing compound selectors such as `.wp-block-navigation-item.current-menu-item:hover`. Core ships exactly one entry — `core/navigation-link` with `-current`. A custom state you invent for a block core does not list is not valid theme.json; the block must declare `selectors.states` *and* be registered in the constant, so third-party blocks cannot opt in from theme.json alone today.

References:

- Theme JSON living reference: https://developer.wordpress.org/block-editor/reference-guides/theme-json-reference/theme-json-living/

## Slug normalisation gotcha

> **Slug normaliser trap (silent failure).** WordPress inserts hyphens inside preset/custom slugs before emitting CSS vars: slug `3xl` becomes `--wp--preset--font-size--3-xl`; slug `cardShadow` becomes `--wp--custom--card-shadow`. A handwritten reference to the *un-normalised* form (e.g. `var(--wp--preset--font-size--3xl)`) resolves to nothing and silently falls back to the second `var()` argument.

Before assembling the variable name, `WP_Theme_JSON` passes each preset/custom slug through `_wp_to_kebab_case()`, which splits it into word tokens — at digit/letter boundaries, camelCase transitions, and non-alphanumeric characters — lowercases them, and joins with `-`. Reference the emitted form, not the slug you typed.

Grep pattern to catch un-normalised references in CSS/SCSS/PHP/JS:

```
var\(\s*--wp--(?:preset|custom)--[a-z-]+--\d+[a-z]
```

This matches a digit immediately followed by a letter inside the variable name (`3xl`, `2xs`, `4x-large`) — every emitted form keeps the hyphen (`3-xl`, `2-xs`, `4-x-large`) and is correctly not flagged.
