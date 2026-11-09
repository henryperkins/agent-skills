# Packaging and installation

This repo is the **source of truth** under `skills/`.

## CLI harness plugin marketplaces

This repo includes root-level marketplace and plugin manifests so CLI harnesses can add it directly by repository slug (`henryperkins/agent-skills` for this fork, or `WordPress/agent-skills` upstream) with no clone or build step:

- `plugin.json` — Agent Plugins 1.0 manifest (`https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`)
- `.claude-plugin/marketplace.json` and `.claude-plugin/plugin.json` — Claude Code (and Claude-compatible harnesses such as Grok Build, GitHub Copilot CLI, and Factory Droid)
- `.agents/plugins/marketplace.json` and `.codex-plugin/plugin.json` — OpenAI Codex CLI
- `.cursor-plugin/marketplace.json` and `.cursor-plugin/plugin.json` — Cursor

Because the standard plugin layout (`skills/<name>/SKILL.md`) matches this repository's structure directly, all wrappers point to the canonical root `skills/` directory without copying files. New skills added under `skills/` are discovered automatically.

Example marketplace commands (substitute `WordPress/agent-skills` when installing from upstream):

```bash
# Claude Code
claude plugin marketplace add henryperkins/agent-skills
claude plugin install wordpress-skills@wordpress-skills

# Codex CLI
codex plugin marketplace add henryperkins/agent-skills
codex plugin add wordpress-skills@wordpress-skills

# GitHub Copilot CLI
copilot plugin marketplace add henryperkins/agent-skills
copilot plugin install wordpress-skills@wordpress-skills

# Grok Build CLI
grok plugin marketplace add henryperkins/agent-skills
grok plugin install wordpress-skills@wordpress-skills
```

Validate the manifests after editing them:

```bash
node shared/scripts/validate-skills.mjs
claude plugin validate . --strict
claude plugin validate .claude-plugin/plugin.json --strict
```

To distribute skills to other repos/tools as plain files (without symlinks), use the skillpack scripts.

## Build dist

Build a packaged copy under `dist/`:

- `node shared/scripts/skillpack-build.mjs --clean`

Outputs:

- `dist/codex/.codex/skills/*` (OpenAI Codex repo layout)
- `dist/vscode/.github/skills/*` (VS Code / Copilot repo layout)
- `dist/claude/.claude/skills/*` (Claude Code repo layout)
- `dist/cursor/.cursor/skills/*` (Cursor repo layout)

Antigravity is opt-in. Add `--targets=codex,vscode,claude,cursor,antigravity` to also build:

- `dist/antigravity/.agents/skills/*` (Antigravity repo layout)

## Install into another repo

1. Build dist (above).
2. Install into a destination repo:

- `node shared/scripts/skillpack-install.mjs --dest=../some-repo --targets=codex,vscode,claude,cursor`

To include Antigravity, build it first and include it in the install targets:

- `node shared/scripts/skillpack-build.mjs --clean --targets=codex,vscode,claude,cursor,antigravity`
- `node shared/scripts/skillpack-install.mjs --dest=../some-repo --targets=codex,vscode,claude,cursor,antigravity`

By default, install mode is `replace` (it replaces only the skill directories it installs).
