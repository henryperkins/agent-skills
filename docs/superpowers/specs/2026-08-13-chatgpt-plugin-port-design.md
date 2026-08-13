# ChatGPT Plugin Port Design

## Goal

Port the repository's complete WordPress Agent Skills collection to the current OpenAI plugin format so the same canonical skill corpus can be installed and used through ChatGPT and Codex without creating or maintaining an OpenAI-specific copy of any skill.

The port is a packaging and conformance change, not a rewrite of the WordPress guidance. `skills/` remains the single source of truth.

## Approved decisions

The design is based on the following approved choices:

- Ship full skill parity rather than a ChatGPT-curated subset.
- Keep the OpenAI plugin packaging in this repository rather than creating a separate distribution repository.
- Keep `skills/` canonical for Claude, ChatGPT, Codex, VS Code/Copilot, Cursor, Antigravity, and future compatible consumers.
- Add OpenAI-specific packaging only at the repository edge.
- Do not add an app, MCP server, WordPress connection, or other external integration in v1.
- Do not add `agents/openai.yaml` in v1. The plugin is intentionally skills-only unless a later requirement justifies an agent-specific companion surface.
- Keep plugin versioning unified with the existing Claude plugin release rather than creating an independent OpenAI version stream.

## Current state

The repository already uses the Agent Skills directory model:

```text
skills/<skill-name>/
├── SKILL.md
├── references/
└── scripts/
```

The repository also already packages the same source tree for multiple coding assistants. Claude Code has a repository-root plugin wrapper under `.claude-plugin/`, while build/install scripts produce project-scoped layouts for Codex, VS Code/Copilot, Claude, Cursor, and optional Antigravity targets.

The current Claude plugin identity is `wordpress-skills`, displayed as `Agent Skills for WordPress`, and the current release is `1.2.0` at the time this design is written.

OpenAI's current plugin examples use a required `.codex-plugin/plugin.json` manifest and allow a plugin to consist entirely of a `skills/` directory. The OpenAI curated marketplace is represented by `.agents/plugins/marketplace.json`, with marketplace entries resolving to plugin directories containing `.codex-plugin/plugin.json`.

## Compatibility invariants

The implementation must preserve these invariants.

### One canonical corpus

`skills/` is the only authoritative copy of skill content.

The implementation must not add any of the following:

- `chatgpt/skills/`
- `openai/skills/`
- copied skill trees under `.codex-plugin/`
- generated skill copies committed solely for ChatGPT
- product-specific rewrites of existing `SKILL.md` files

If cross-product testing exposes an actual portability defect in a canonical skill, fix the canonical skill in a platform-neutral way. Do not fork it by product.

### Knowledge parity, not runtime parity

Every current and future skill under `skills/` is exposed by the OpenAI plugin. Full parity means that ChatGPT and Codex receive the same WordPress guidance, procedures, references, and verification criteria.

It does not mean every runtime has the same execution capabilities.

A missing runtime capability changes what can be executed, not what WordPress guidance applies.

For example, a skill may legitimately require a repository filesystem, Node, Bash, WP-CLI, a browser, or another tool. When those capabilities exist, the skill may use them. When they do not exist, the assistant may reason from supplied code or content, explain the required commands, generate code, and identify what remains unverified, but it must not invent repository inspection, command output, test results, or external state.

### No implicit connectivity

Installing the WordPress skills plugin does not grant access to:

- a WordPress site
- WordPress.com
- GitHub
- WordPress.org
- WP-CLI on a remote machine
- Playground instances
- MCP servers
- external accounts or APIs

Any future integration that supplies those capabilities is a separate layer and must preserve the canonical skill corpus.

## Target repository architecture

The v1 repository shape is:

```text
agent-skills/
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── .codex-plugin/
│   └── plugin.json
├── .agents/
│   └── plugins/
│       └── marketplace.json
├── skills/
│   ├── wordpress-router/
│   ├── wp-project-triage/
│   ├── wp-block-development/
│   └── ...
├── eval/
├── shared/
└── docs/
```

No new `agents/` directory is required for v1.

No new plugin-specific skill copy is required.

## OpenAI plugin manifest

Add `.codex-plugin/plugin.json` at the repository root.

The manifest must use the existing plugin identity:

- machine name: `wordpress-skills`
- display name: `Agent Skills for WordPress`
- version: synchronized with `.claude-plugin/plugin.json`
- license: `GPL-2.0-or-later`
- category: `Developer Tools`
- skills path: `./skills/`

The description should communicate that this is expert WordPress development guidance for ChatGPT and Codex, covering the current skill set without trying to enumerate every future skill.

The interface advertises `Interactive`, `Read`, and `Write` capabilities, matching current OpenAI development-workflow plugin convention. These describe the kinds of workflows the plugin supports when the host runtime supplies those abilities. They must not be documented as permissions granted by installation.

Initial default prompts cover distinct high-value entry points:

- building or refactoring a WordPress plugin
- reviewing a Gutenberg block implementation
- auditing REST/Abilities API exposure
- debugging a WordPress Playground workflow

The OpenAI manifest should preserve the semantic identity and attribution of the existing package. The actual repository field must point to `henryperkins/agent-skills` while this fork is the distribution source. Canonical-upstream links may continue to reference `WordPress/agent-skills` when they are intentionally identifying the upstream project rather than the installed repository.

Assets, screenshots, privacy-policy metadata, terms metadata, and other marketplace presentation fields are out of scope unless current OpenAI manifest validation requires them for a locally installable skills-only plugin. Public curated-marketplace submission is not a v1 requirement.

## OpenAI marketplace wrapper

Add `.agents/plugins/marketplace.json` so the repository can describe itself as an OpenAI plugin marketplace/distribution source.

It contains one `wordpress-skills` entry. That entry must resolve to the repository root as the plugin directory, because the repository root contains `.codex-plugin/plugin.json` and the canonical `skills/` tree.

The implementation must use the smallest schema-valid local source representation accepted by the current OpenAI plugin loader. The acceptance criterion is behavioral: loading the marketplace entry must resolve the root plugin without moving or copying `skills/`.

The marketplace wrapper must not enumerate individual skills. Adding, removing, or renaming a skill under `skills/` should not require editing the OpenAI marketplace file merely to keep skill discovery complete.

## Runtime behavior contract

The same skill may run in different capability environments.

### Conversational or bounded ChatGPT runtime

When repository or command execution is unavailable, a skill may:

- answer WordPress implementation questions
- review code supplied in the conversation
- generate or revise code
- explain deterministic commands or checks the user can run
- reason from attached files or connected data that the runtime actually exposes
- state exactly which verification steps remain unexecuted

It must not claim that it inspected a repository, ran a script, executed WP-CLI, opened a browser, or validated a build unless the corresponding capability was actually used.

### Repository-capable Codex/runtime

When repository and execution capabilities are available, the same skill may:

- inspect the repository
- run its deterministic helper scripts
- use project tooling
- execute tests and linters
- modify files
- verify outcomes against the skill's existing criteria

The product wrapper must not weaken or replace the skill's existing safety, verification, compatibility, or source requirements.

## Skill discovery and routing

The OpenAI plugin exposes the entire canonical `skills/` directory.

`wordpress-router` remains the repository's WordPress-specific routing skill. The OpenAI wrapper must not duplicate that routing logic in manifest prose or product-specific instructions.

The plugin-level description and default prompts are discovery aids only. Skill descriptions and the router remain authoritative for deciding which WordPress workflow applies.

No current skill is marked Codex-only or ChatGPT-only in v1.

If later evidence shows that a skill truly cannot function meaningfully outside a specific runtime, that should be handled through portable compatibility metadata or a documented runtime precondition before introducing product-specific skill forks.

## Versioning and release behavior

Claude and OpenAI wrappers share one release version.

At the time of this design:

```text
.claude-plugin/plugin.json  -> 1.2.0
.codex-plugin/plugin.json   -> 1.2.0
```

Future releases must update both when a plugin version bump is required.

The existing plugin-version freshness protection must be extended so skill changes cannot become visible to one plugin consumer while remaining invisible to another.

The conformance rule is:

1. The Claude and OpenAI plugin versions must always be equal.
2. A release-relevant change under `skills/` must make stale plugin metadata fail CI rather than silently ship under the previous version.
3. If the current OpenAI marketplace schema carries a plugin version, it must equal the two plugin manifests. If the schema does not carry a version, no third version field is invented.
4. Version checking remains deterministic and offline in normal CI.

Do not create an independent `chatgptVersion`, `codexVersion`, or similar release number.

## Validation design

Extend the existing evaluation/conformance system rather than building a second OpenAI-only harness.

Add `eval/harness/plugin-packaging-conformance.mjs` and invoke it from the existing `eval/harness/run.mjs` flow. It owns cross-wrapper packaging and version invariants; existing release-conformance and skill-quality modules keep their current responsibilities.

### Manifest conformance

CI must verify that:

- `.codex-plugin/plugin.json` parses successfully.
- the manifest identifies `wordpress-skills`.
- the declared skills path resolves to repository-root `skills/`.
- every immediate skill directory containing a valid `SKILL.md` remains reachable through that path.
- no committed OpenAI-specific duplicate skill tree exists.
- the OpenAI and Claude plugin versions match.
- marketplace metadata parses successfully and resolves the intended root plugin.

Where an official OpenAI schema or validation command is available in the implementation environment, use it in addition to repository-local structural checks. Repository-local CI must still retain deterministic checks that do not depend on network availability.

### Cross-product portability scenarios

Add focused scenarios that exercise behavior rather than merely checking JSON structure.

At minimum, cover:

1. **Knowledge-only request** — a WordPress question that can be answered from the skill without filesystem execution. Success means correct skill guidance with no invented execution.
2. **Repository-dependent request without repository capabilities** — a task whose normal procedure includes deterministic repository inspection. Success means the answer clearly bounds what is known and identifies unexecuted verification rather than fabricating repository state.
3. **Repository-dependent request with execution capabilities** — the same class of task in a repository-capable runtime. Success means the relevant detector/script/tooling can actually be used and its result informs the workflow.
4. **Routing request** — a multi-area WordPress request that verifies the existing router and skill descriptions, rather than plugin wrapper prose, choose the relevant workflow.

The scenarios should reuse the repository's existing evaluation conventions wherever possible. They are not a second product-specific corpus.

### Regression protection

Claude installation and existing skillpack targets must remain unchanged by default.

The existing harness, release-conformance checks, skill-quality checks, and skillpack build must remain green after the OpenAI wrapper is added.

## Documentation changes

Update repository documentation so users can distinguish three related concepts:

1. **Agent Skills** — the canonical portable content under `skills/`.
2. **Claude Code plugin marketplace** — the existing `.claude-plugin/` wrapper.
3. **OpenAI plugin marketplace/package** — the new `.codex-plugin/` plus `.agents/plugins/` wrapper used by ChatGPT/Codex-compatible plugin workflows.

`README.md` should add an OpenAI installation/use section without displacing the current cross-tool `npx skills add` workflow.

`docs/packaging.md` should state explicitly that both plugin wrappers point to the same root `skills/` directory and that neither wrapper owns skill content.

Documentation must not claim that the OpenAI plugin grants GitHub, filesystem, shell, WordPress, or remote-site access by itself.

## Implementation boundaries

Implementation should be deliberately small.

Expected work:

- add `.codex-plugin/plugin.json`
- add `.agents/plugins/marketplace.json`
- add `eval/harness/plugin-packaging-conformance.mjs` and wire it into the existing harness
- add cross-product portability scenarios
- update `README.md` and `docs/packaging.md`
- make only narrowly justified canonical skill edits if portability tests reveal a real defect

Not expected:

- rewrite all skills
- create a ChatGPT-specific router
- add an OpenAI-only skill directory
- add MCP infrastructure
- add a WordPress.com or WordPress.org connector
- add GitHub as a hard dependency
- change WordPress/PHP compatibility floors
- change existing Claude installation semantics
- change existing skillpack target layouts merely to support the plugin wrapper
- submit the plugin to an OpenAI-curated public marketplace

## Error handling and failure modes

The port should fail closed around packaging ambiguity.

- If the OpenAI manifest cannot resolve the canonical `skills/` path, CI fails.
- If the marketplace source does not resolve the repository-root plugin, CI fails.
- If plugin versions diverge, CI fails.
- If a runtime-dependent scenario reports execution that did not occur, the portability test fails.
- If adding the OpenAI wrapper breaks an existing Claude or skillpack target, the port is not complete.
- If current OpenAI loader/schema requirements contradict this design's no-copy root layout, stop implementation at that incompatibility and revise the design rather than silently generating a second skill corpus.

## Acceptance criteria

The v1 port is complete when all of the following are true:

- The repository contains a valid OpenAI plugin manifest at `.codex-plugin/plugin.json`.
- The OpenAI plugin's skill source is the canonical repository-root `skills/` directory.
- The repository contains a valid `.agents/plugins/marketplace.json` entry for `wordpress-skills` that resolves the root plugin.
- All skills present under `skills/` at build/test time are exposed without being enumerated or copied into an OpenAI-specific tree.
- ChatGPT can use knowledge-only portions of the skills without requiring repository access.
- Repository-dependent workflows explicitly remain unverified when the required runtime capability is absent.
- In a repository-capable Codex/runtime, repository-dependent procedures can use the same canonical scripts and verification instructions.
- No test or documentation claims execution or connectivity that the plugin itself does not provide.
- Claude and OpenAI plugin versions remain synchronized.
- Existing Claude plugin behavior remains unchanged.
- Existing skillpack build/install targets remain unchanged unless a separately identified portability bug requires a platform-neutral fix.
- Existing repository validation remains green, plus the new OpenAI packaging and portability checks.
- Documentation explains OpenAI installation, shared-source architecture, runtime capability differences, and release/version behavior.

## Future extensions

The following are intentionally deferred and should be evaluated independently after the skills-only port is proven:

- optional GitHub-backed workflows
- WordPress.com or self-hosted WordPress connectors
- MCP Adapter integration
- WordPress Playground runtime integration
- richer OpenAI plugin assets and marketplace presentation
- public curated-marketplace submission
- product-specific companion agents or commands

Any future extension should consume the canonical `skills/` corpus rather than fork it.

## Primary implementation references

The implementation should verify current formats against primary sources at build time because plugin schemas may evolve. The design was checked against:

- `openai/plugins` repository README and current skills-only plugin examples
- `openai/plugins/plugins/superpowers/.codex-plugin/plugin.json`
- `openai/plugins/.agents/plugins/marketplace.json`
- this repository's `.claude-plugin/plugin.json`
- this repository's `.claude-plugin/marketplace.json`
- this repository's `docs/packaging.md`
- this repository's existing evaluation and release-conformance tooling

The OpenAI packaging format is an external dependency. If its current documented/schema behavior changes before implementation, preserve the architectural invariants in this document and update only the edge packaging needed to conform.