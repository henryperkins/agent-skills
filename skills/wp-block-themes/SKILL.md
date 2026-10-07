---
name: wp-block-themes
description: "Use when developing WordPress block themes: theme.json (global settings/styles), templates and template parts, patterns, style variations, and Site Editor troubleshooting (style hierarchy, overrides, caching)."
compatibility: "Targets WordPress 6.9+ (PHP 7.2.24+); WordPress Core verified through: 7.1 (theme.json guidance). Filesystem-based agent with bash + node. Some workflows require WP-CLI."
license: GPL-2.0-or-later
---

# WP Block Themes

## When to use

Use this skill for block theme work such as:

- editing `theme.json` (presets, settings, styles, per-block styles)
- adding or changing templates (`templates/*.html`) and template parts (`parts/*.html`)
- adding patterns (`patterns/*.php`) and controlling what appears in the inserter
- adding style variations (`styles/*.json`)
- debugging “styles not applying” / “editor doesn’t reflect theme.json”

## Inputs required

- Repo root and which theme is targeted (theme directory if multiple exist).
- Target WordPress version range (theme.json version and features vary by core version).
- Where the issue manifests: Site Editor, post editor, frontend, or all.

## Procedure

Resolve helper paths from this installed skill directory; replace example absolute paths with the real location and keep the working directory at the target project root.

### 0) Triage and locate block theme roots

1. Run project triage if available:
   - Resolve the installed `wp-project-triage` directory to its absolute path and keep the process working directory at the target project root: `node "/absolute/path/to/wp-project-triage/scripts/detect_wp_project.mjs"`. If unavailable, classify manually.
2. Detect theme roots + key folders:
   - `node "/absolute/path/to/wp-block-themes/scripts/detect_block_themes.mjs"`

If multiple themes exist, pick one and scope all changes to that theme root.

A readable `templates/index.html` or legacy `block-templates/index.html` establishes block-theme classification; `theme.json` is optional. In-scope parent themes may supply the index. Filesystem checks cannot evaluate runtime path filters or parents outside the scanned root.

### 1) Create a new block theme (if needed)

If you are creating a new block theme from scratch (or converting a classic theme):

- Prefer starting from a known-good scaffold (or exporting from a WP environment) rather than guessing file layout.
- Be explicit about the minimum supported WordPress version because `theme.json` schema versions differ.

Read:
- `references/creating-new-block-theme.md`

After creating the theme root, re-run `detect_block_themes` and continue below.

### 2) Confirm theme type and override expectations

- Block theme indicators:
  - `theme.json` present
  - `templates/` and/or `parts/` present
- Remember the style hierarchy:
  - core defaults → theme.json → child theme → user customizations
  - user customizations can make theme.json edits appear “ignored”

Read:
- `references/debugging.md` (style hierarchy + fastest checks)

### 3) Make `theme.json` changes safely

Decide whether you are changing:

- **settings** (what the UI allows): presets, typography scale, colors, layout, spacing
- **styles** (how it looks by default): CSS-like rules for elements/blocks

Read:
- `references/theme-json.md`

### 4) Templates and template parts

- Templates live under `templates/` and are HTML.
- Template parts live under `parts/` and must not be nested in subdirectories.

Read:
- `references/templates-and-parts.md`

### 5) Patterns

Prefer filesystem patterns under `patterns/` when you want theme-owned patterns.

Read:
- `references/patterns.md`

### 6) Style variations

Style variations are JSON files under `styles/`. Note: once a user picks a style variation, that selection is stored in the DB, so changing the file may not “update what the user sees” automatically.

Read:
- `references/style-variations.md`

## Verification

- Site Editor reflects changes where expected (Styles UI, templates, patterns).
- Frontend renders with expected styles.
- If styles aren’t changing, confirm whether user customizations override theme defaults.
- Run the repo’s build/lint scripts if assets are involved (fonts, custom JS/CSS build).

## Failure modes / debugging

Start with:

- `references/debugging.md`

Common issues:

- wrong theme root (editing an inactive theme)
- user customizations override your defaults
- invalid `theme.json` shape/typos prevent application
- templates/parts in wrong folders (or nested parts)

## Escalation

If upstream behavior is unclear, consult canonical docs:

- Theme Handbook and Block Editor Handbook for `theme.json`, templates, patterns, and style variations.
