# Core AI Maintenance Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Core AI maintenance reliably deliver deterministic index updates, close the release and drift validation gaps, correct every source-verified guidance defect from the 2026-08-25 audit, and ship the result as version 1.9.1.

**Architecture:** Keep `upstream-sync.yml` as the only scheduled index owner. The advisory AI workflow refreshes indices independently in each job and compares the existing canonical SHA-256 upstream-state hash instead of transferring a workspace artifact; it never creates an AI-authored skill PR while tagged-file ingestion is absent. Extend the existing Node harness with focused source-contract checks, then correct the six Core AI skills and release them together.

**Tech Stack:** Node.js 20 ESM and built-in assertions, GitHub Actions YAML, Markdown Agent Skills, Bash, WordPress Playground, GitHub CLI, Packagist and tagged WordPress upstream source.

**Spec:** `docs/superpowers/specs/2026-08-25-core-ai-maintenance-remediation-design.md`

## Global Constraints

- Work in an isolated feature worktree created with `superpowers:using-git-worktrees`; do not implement directly on `trunk`.
- Preserve the released baselines: WordPress Core 7.1, Gutenberg 23.8.0, WordPress/ai 1.3.0, MCP Adapter 0.6.1, PHP AI Client 1.4.0, WP AI Client 0.4.0, Anthropic 1.0.4, Google 1.1.1, and OpenAI 1.1.0 unless a fresh deterministic refresh proves a newer release exists.
- Resolve claims in this order: tagged executable source, tagged tests, release notes or changelog, then handbook prose.
- Never advance a `verified through` marker without inspecting the corresponding tagged executable source.
- Do not add dependencies, providers, schedulers, generated-skill PRs, automatic version bumps, or tagged-file ingestion.
- Do not mutate WordPress/agent-skills PR #92 or either reviewer-owned refresh branch.
- Preserve the existing WordPress/PHP compatibility floors and keep every `SKILL.md` under the repository's 500-line limit.
- The WordPress/Gutenberg HTML version map is exempt from one-declaration-per-affected-skill completeness because it has no single release version.
- Once the first `skills/` commit lands, the full harness is expected to report only the marketplace freshness failure until Task 9 commits the coordinated 1.9.1 version bump. Use the focused exported assertion named by each intervening task for its green check.
- Use `apply_patch` for every repository file edit, including deletion of the tracked smoke output.

---

## File Map

**Maintenance and enforcement**

- `shared/scripts/core-ai-upstreams.mjs` — canonical source, affected-skill, declaration, and release-URL metadata.
- `shared/scripts/update-upstream-indices.mjs` — transactional normalization, including metadata-driven Packagist release URLs.
- `shared/scripts/ai-generate-updates.mjs` — configuration inspection and read-only current-state hash CLI.
- `shared/scripts/upstream-drift-lib.mjs` — filesystem collection and blocking-failure selection.
- `eval/harness/release-conformance.mjs` — focused regression fixtures for every corrected contract.
- `eval/harness/run.mjs` — strict harness and narrow `--skip-upstream-drift` behavior.
- `.github/workflows/ai-skill-maintenance.yml` — manual/dispatch advisory workflow with independent refreshes.
- `.github/workflows/ci.yml` — dynamic `skills-ref` coverage for every skill directory.
- `docs/upstream-sync.md` and `eval/scenarios/upstream-sync-indices.json` — operator and scenario contracts.

**Skill/runtime corrections**

- `skills/wp-ai-client/scripts/detect_ai_client.mjs` — plugin PHP and theme `style.css` floor detection.
- `skills/wp-abilities-api/SKILL.md` and its `client-side.md`, `input-schema-gotchas.md`, `mcp-exposure.md`, and `php-registration.md` references.
- `skills/wp-abilities-audit/references/audit-schema.md` and `capability-gate-tracing.md`.
- `skills/wp-abilities-verify/SKILL.md` and its `audit-schema-validation.md`, `exposure-checks.md`, `runtime-harness.md`, and `schema-lints.md` references.
- `skills/wp-ai-client/SKILL.md` and its `prompt-builder.md` and `rest-patterns.md` references.
- `skills/wp-ai-connectors/SKILL.md` and `references/provider-registration.md`.
- `skills/wp-ai-plugin/SKILL.md`, `references/experiments-framework.md`, and `references/hooks-and-filters.md`.
- Relevant JSON scenarios under `eval/scenarios/` for the six Core AI skills.
- `.gitignore` and `eval/playground/ai-plugin-smoke/run.sh`; delete `eval/playground/ai-plugin-smoke/mu-plugins/result.json`.

**Release records**

- Create `docs/core-ai-skills-audit-2026-08-25.md` and `docs/release-notes-1.9.1.md`.
- Modify `docs/core-ai-skills-audit-2026-08-24.md`, `docs/skill-set-v1.md`, `.claude-plugin/plugin.json`, and `.claude-plugin/marketplace.json`.

---

### Task 0: Capture No-Skill Behavioral Controls

**Files:**

- Read: the repository only; write control outputs under a fresh `/tmp` directory.

**Interfaces:**

- Consumes: six realistic application prompts, one per substantively edited Core AI skill.
- Produces: six no-skill control responses and an evidence note identifying the exact omissions or errors that the skill edits must correct.

- [ ] **Step 1: Record the clean starting revision**

Run:

```bash
git status --short --branch
git rev-parse HEAD
command -v claude
PRESSURE_CONTROL_ROOT=$(mktemp -d)
```

Expected: clean feature worktree, exact starting SHA, an available Claude CLI, and a unique results directory outside the repository.

- [ ] **Step 2: Run one fresh no-skill control per skill**

Run each command separately so no prior response or skill text carries into the next context:

```bash
claude -p "Do not read any file under skills/. Answer from your current knowledge and do not edit files. I need a WordPress 7.1 implementation today. Explain which execution hooks are genuinely new in 7.1, whether PHP and JavaScript inject property-level input-schema defaults, what awaiting @wordpress/core-abilities ready proves, how to safely hook mcp_adapter_validation_enabled, and what wp mcp-adapter serve chooses without --server." --output-format json > "$PRESSURE_CONTROL_ROOT/wp-abilities-api.json"

claude -p "Do not read any file under skills/. Answer from your current knowledge and do not edit files. Audit a WooCommerce-style shop_order controller now: give the private-read and author-sensitive write caps, say when map_meta_cap defaults true for a custom capability_type, and choose the canonical capability_gate shape for both a one-capability plugin and a read/write plugin." --output-format json > "$PRESSURE_CONTROL_ROOT/wp-abilities-audit.json"

claude -p "Do not read any file under skills/. Answer from your current knowledge and do not edit files. Verify an audited WordPress 7.1 reference ability. It has reference_ability true but no input_schema, and wp_get_abilities omits it while the registration call is visible statically. Give PASS/WARN/FAIL decisions and the exact runtime checks needed before saying registration is broken." --output-format json > "$PRESSURE_CONTROL_ROOT/wp-abilities-verify.json"

claude -p "Do not read any file under skills/. Answer from your current knowledge and do not edit files. Give copyable WordPress 7.1 PHP for an AI Client function-calling round trip using two abilities Core actually registers, then safely persist generate_image() output when the File DTO may contain either an inline data URI or a remote URL." --output-format json > "$PRESSURE_CONTROL_ROOT/wp-ai-client.json"

claude -p "Do not read any file under skills/. Answer from your current knowledge and do not edit files. A custom WordPress 7.1 AI provider times out during model discovery and an admin says their saved API key became blank. Explain the exact write-time path and whether arbitrary extra authentication keys survive WP_Connector_Registry normalization." --output-format json > "$PRESSURE_CONTROL_ROOT/wp-ai-connectors.json"

claude -p "Do not read any file under skills/. Answer from your current knowledge and do not edit files. For WordPress/ai 1.3.0, list the request-log filters and retention default, name the active preferred-model filters, and point me to the real schema and permission implementations behind the gated read-content, read-users, and read-settings wrappers." --output-format json > "$PRESSURE_CONTROL_ROOT/wp-ai-plugin.json"
```

- [ ] **Step 3: Grade and preserve the RED evidence**

Inspect all six results:

```bash
for result in "$PRESSURE_CONTROL_ROOT"/*.json; do
  echo "===== $(basename "$result") ====="
  jq -r '.result // .content // .' "$result"
done
```

For each control, record the precise wrong API, omitted distinction, or unsupported claim. At least one load-bearing criterion must fail for that skill; if a control already answers every criterion correctly, do not add prose solely for that prompt—retain only the deterministic correction required by tagged source. Keep the results directory path in the execution log. This read-only task has no commit.

---

### Task 1: Expose the Canonical State Hash and Remove the Packagist URL Hard-Code

**Files:**

- Modify: `eval/harness/release-conformance.mjs`
- Modify: `shared/scripts/core-ai-upstreams.mjs`
- Modify: `shared/scripts/update-upstream-indices.mjs`
- Modify: `shared/scripts/ai-generate-updates.mjs`

**Interfaces:**

- Consumes: `getUpstreamStateHash(indices, registry): { hash: string, state: object }`.
- Produces: `normalizePackagistVersions(payload, packageName, releaseUrlBase): { latest, recent }` and CLI option `node shared/scripts/ai-generate-updates.mjs --print-state-hash`, which prints exactly one lowercase 64-character SHA-256 hash plus a newline.

- [ ] **Step 1: Add failing normalization and CLI assertions**

In `assertUpstreamNormalization()`, pass an explicit non-WordPress release base and prove the result uses it:

```js
const alternatePackagist = normalizePackagistVersions(
  {
    packages: {
      "vendor/other-client": [
        { version: "2.3.4", time: "2026-08-01T00:00:00+00:00" },
      ],
    },
  },
  "vendor/other-client",
  "https://github.com/vendor/other-client/releases/tag"
);
assert(
  alternatePackagist.latest.url === "https://github.com/vendor/other-client/releases/tag/2.3.4",
  "Packagist release URLs must come from registry metadata"
);

const stateHash = spawnSync(
  "node",
  [path.join(repoRoot, "shared/scripts/ai-generate-updates.mjs"), "--print-state-hash"],
  { cwd: repoRoot, encoding: "utf8" }
);
assert(stateHash.status === 0, "State-hash CLI must exit successfully");
assert(/^[a-f0-9]{64}\n$/.test(stateHash.stdout), "State-hash CLI must print one SHA-256 hash");
assert(!stateHash.stderr, "State-hash CLI must not emit diagnostics on success");
```

- [ ] **Step 2: Run the focused assertion and confirm RED**

Run:

```bash
node --input-type=module -e "import { assertUpstreamNormalization } from './eval/harness/release-conformance.mjs'; assertUpstreamNormalization(process.cwd())"
```

Expected: failure because `normalizePackagistVersions` ignores the third argument and `--print-state-hash` is unknown.

- [ ] **Step 3: Add registry metadata and the hash CLI**

Add this property to the `php-ai-client` registry entry:

```js
releaseUrlBase: "https://github.com/WordPress/php-ai-client/releases/tag",
```

Change normalization and dispatch to use it:

```js
export function normalizePackagistVersions(payload, packageName, releaseUrlBase) {
  const versions = payload?.packages?.[packageName];
  if (!Array.isArray(versions)) {
    throw new Error(`Expected a Packagist version array for ${packageName}.`);
  }
  if (typeof releaseUrlBase !== "string" || releaseUrlBase === "") {
    throw new Error(`Missing Packagist releaseUrlBase for ${packageName}.`);
  }

  const stable = versions
    .filter(
      (version) =>
        version &&
        typeof version.version === "string" &&
        /^v?\d+(?:\.\d+)+$/.test(version.version)
    )
    .map((version) => ({
      tag: version.version,
      name: version.version,
      publishedAt: typeof version.time === "string" ? version.time.replace(/\+00:00$/, "Z") : null,
      url: `${releaseUrlBase}/${version.version}`,
    }))
    .sort((a, b) => compareVersionsDesc(a.tag, b.tag));

  if (stable.length === 0) {
    throw new Error(`Packagist returned no stable versions for ${packageName}.`);
  }
  return { latest: stable[0], recent: stable.slice(0, 30) };
}

case "packagist":
  return normalizePackagistVersions(payload, upstream.packageName, upstream.releaseUrlBase);
```

Pass `CORE_AI_UPSTREAMS.find((upstream) => upstream.id === "php-ai-client").releaseUrlBase` to the existing valid Packagist fixture in `assertUpstreamNormalization()` so every successful call supplies the required metadata.

Export the existing index loader and add the CLI branch:

```js
export function loadUpstreamIndices(repoRoot = REPO_ROOT, registry = CORE_AI_UPSTREAMS) {
  return Object.fromEntries(
    registry.map((upstream) => [
      upstream.id,
      loadJson(path.join(repoRoot, upstream.indexFile)),
    ])
  );
}

function parseArguments(args) {
  const options = { checkConfig: false, printStateHash: false, help: false };
  for (const argument of args) {
    if (argument === "--check-config") options.checkConfig = true;
    else if (argument === "--print-state-hash") options.printStateHash = true;
    else if (argument === "--help") options.help = true;
    else {
      const error = new Error(`Unknown argument: ${argument}`);
      error.exitCode = 2;
      throw error;
    }
  }
  return options;
}

if (options.printStateHash) {
  const { hash } = getUpstreamStateHash(loadUpstreamIndices());
  process.stdout.write(`${hash}\n`);
  return 0;
}
```

Update `HELP` to describe `--print-state-hash` as read-only and provider-independent.

- [ ] **Step 4: Verify GREEN and commit**

Run:

```bash
node --input-type=module -e "import { assertUpstreamNormalization } from './eval/harness/release-conformance.mjs'; assertUpstreamNormalization(process.cwd())"
node shared/scripts/ai-generate-updates.mjs --print-state-hash
git diff --check
```

Expected: both commands exit 0; the second prints one SHA-256 hash.

Commit:

```bash
git add -- eval/harness/release-conformance.mjs shared/scripts/core-ai-upstreams.mjs shared/scripts/update-upstream-indices.mjs shared/scripts/ai-generate-updates.mjs
git commit -m "fix: expose deterministic upstream state hash"
```

---

### Task 2: Make AI Maintenance Artifact-Free and Advisory-Only

**Files:**

- Modify: `eval/harness/release-conformance.mjs`
- Modify: `.github/workflows/ai-skill-maintenance.yml`
- Modify: `docs/upstream-sync.md`
- Modify: `eval/scenarios/upstream-sync-indices.json`

**Interfaces:**

- Consumes: `--print-state-hash` from Task 1 and `inspectConfiguration()` JSON from the existing `--check-config` CLI.
- Produces: `refresh-indices.outputs.state_hash`, a manual/`repository_dispatch` advisory workflow, and the distinct fallback branch `chore/ai-maintenance-upstream-indices`.

- [ ] **Step 1: Add a failing workflow contract**

Create and export `assertAiMaintenanceWorkflow(repoRoot)`. Its central checks must be:

```js
export function assertAiMaintenanceWorkflow(repoRoot) {
  const workflow = read(repoRoot, ".github/workflows/ai-skill-maintenance.yml");
  const deterministicWorkflow = read(repoRoot, ".github/workflows/upstream-sync.yml");
  const updaterCalls = workflow.match(/node shared\/scripts\/update-upstream-indices\.mjs/g) ?? [];
  const hashCalls = workflow.match(/--print-state-hash/g) ?? [];
  const scheduleOwners = `${workflow}\n${deterministicWorkflow}`.match(/^\s+schedule:/gm) ?? [];

  assert(updaterCalls.length === 3, "Each AI workflow job must refresh indices independently");
  assert(hashCalls.length === 3, "Each AI workflow job must compute the canonical state hash");
  assert(scheduleOwners.length === 1, "Exactly one upstream-maintenance workflow may own a schedule");
  assert(workflow.includes("state_hash: ${{ steps.state.outputs.hash }}"), "Refresh job must expose state_hash");
  assert(workflow.includes("needs.refresh-indices.outputs.state_hash"), "Consumers must compare the refresh hash");
  assert(workflow.includes("Upstream state changed during this run"), "A state mismatch must fail closed");
  assert(!workflow.includes("workspace-with-indices"), "Index artifacts are forbidden");
  assert(!workflow.includes("workspace-with-updates"), "Generated workspace artifacts are forbidden");
  assert(!workflow.includes("actions/download-artifact"), "Jobs must not restore a transferred workspace");
  assert(!workflow.includes("create-pr:"), "Autonomous skill PRs are disabled without tagged-file ingestion");
  assert(!/^\s+schedule:/m.test(workflow), "AI maintenance must not own a schedule");
  assert(workflow.includes("chore/ai-maintenance-upstream-indices"), "AI fallback branch must not collide");
  assert(workflow.includes("secrets.UPSTREAM_SYNC_TOKEN || secrets.GITHUB_TOKEN"), "Fallback PR must prefer the CI-triggering token");
  assert(workflow.includes('OUTCOME="skipped"'), "Missing provider configuration must skip advisory analysis");
}
```

Call it from `runReleaseConformance()`.

- [ ] **Step 2: Run the focused assertion and confirm RED**

Run:

```bash
node --input-type=module -e "import { assertAiMaintenanceWorkflow } from './eval/harness/release-conformance.mjs'; assertAiMaintenanceWorkflow(process.cwd())"
```

Expected: failure on artifact names, the schedule, the generated-skill PR, and the shared branch.

- [ ] **Step 3: Rewrite the workflow around independent refreshes**

Apply these job contracts:

```yaml
on:
  workflow_dispatch:
    inputs:
      dry_run:
        description: "Dry run (don't write files)"
        type: boolean
        default: false
      force:
        description: "Force advisory analysis even if no index changed"
        type: boolean
        default: false
  repository_dispatch:
    types: [upstream-release]

jobs:
  refresh-indices:
    outputs:
      has_index_changes: ${{ steps.check.outputs.has_changes }}
      state_hash: ${{ steps.state.outputs.hash }}
```

After the updater in `refresh-indices`, compute the output without committing or uploading indices:

```yaml
      - name: Compute canonical upstream state
        id: state
        run: echo "hash=$(node shared/scripts/ai-generate-updates.mjs --print-state-hash)" >> "$GITHUB_OUTPUT"
```

At the start of both `generate-updates` and `create-index-pr`, after checkout and Node setup, use the same fail-closed gate:

```yaml
      - name: Refresh and verify canonical upstream state
        env:
          EXPECTED_STATE_HASH: ${{ needs.refresh-indices.outputs.state_hash }}
        run: |
          node shared/scripts/update-upstream-indices.mjs
          ACTUAL_STATE_HASH=$(node shared/scripts/ai-generate-updates.mjs --print-state-hash)
          if [ "$ACTUAL_STATE_HASH" != "$EXPECTED_STATE_HASH" ]; then
            echo "::error::Upstream state changed during this run; rerun from a clean snapshot."
            exit 1
          fi
```

In `generate-updates`, inspect configuration before installing the SDK:

```yaml
      - name: Inspect AI configuration
        id: config
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          ANTHROPIC_MODEL: ${{ vars.ANTHROPIC_MODEL }}
        run: |
          CONFIG_JSON=$(node shared/scripts/ai-generate-updates.mjs --check-config)
          echo "$CONFIG_JSON"
          echo "configured=$(echo "$CONFIG_JSON" | jq -r '.configured')" >> "$GITHUB_OUTPUT"
          echo "category=$(echo "$CONFIG_JSON" | jq -r '.category')" >> "$GITHUB_OUTPUT"

      - name: Install advisory generator dependency
        if: steps.config.outputs.configured == 'true'
        run: npm install --no-save @anthropic-ai/sdk

      - name: Generate advisory analysis
        id: generate
        if: steps.config.outputs.configured == 'true'
        continue-on-error: true
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          ANTHROPIC_MODEL: ${{ vars.ANTHROPIC_MODEL }}
          AI_DRY_RUN: ${{ github.event.inputs.dry_run }}
        run: node shared/scripts/ai-generate-updates.mjs
```

In the always-running classifier, handle missing configuration before inspecting generator output:

```bash
if [ "${{ steps.config.outputs.configured }}" != "true" ]; then
  OUTCOME="skipped"
  HAS_UPDATES="false"
  ERROR_CATEGORY="${{ steps.config.outputs.category }}"
  MODE="skipped"
elif [ "${{ steps.generate.outcome }}" = "failure" ]; then
  OUTCOME="failed"
  HAS_UPDATES="false"
  ERROR_CATEGORY=$(jq -r '.errorCategory // "unknown"' .github/state/generator-result.json 2>/dev/null || echo "unknown")
  MODE="ran"
elif git diff --quiet skills/; then
  OUTCOME=$(jq -r '.outcome // "no-updates"' .github/state/generator-result.json 2>/dev/null || echo "no-updates")
  HAS_UPDATES="false"
  ERROR_CATEGORY="none"
  MODE="ran"
else
  OUTCOME="updated"
  HAS_UPDATES="true"
  ERROR_CATEGORY="none"
  MODE="ran"
fi
echo "outcome=$OUTCOME" >> "$GITHUB_OUTPUT"
echo "has_updates=$HAS_UPDATES" >> "$GITHUB_OUTPUT"
echo "error_category=$ERROR_CATEGORY" >> "$GITHUB_OUTPUT"
echo "mode=$MODE" >> "$GITHUB_OUTPUT"
```

Keep only the `ai-maintenance-report` artifact. Delete the `create-pr` job because every detected change has `taggedFiles: []` and cannot satisfy the evidence gate.

Make `create-index-pr` depend on both jobs with `always()`, require only `has_index_changes == 'true'`, rerun the updater/hash gate, run non-drift validation, and create the PR with:

```yaml
          token: ${{ secrets.UPSTREAM_SYNC_TOKEN || secrets.GITHUB_TOKEN }}
          title: "chore: refresh AI-maintenance upstream indices"
          branch: chore/ai-maintenance-upstream-indices
          add-paths: |
            shared/references/**
            .github/state/last-sync.json
```

Mirror `upstream-sync.yml`'s `Determine pull request token mode` step and include its output plus advisory outcome/category in the PR body. Do not add or close any other PR branch.

- [ ] **Step 4: Update operator docs and the infrastructure scenario**

In `docs/upstream-sync.md`, state all of the following explicitly:

- `upstream-sync.yml` is the sole weekly scheduled index owner.
- AI maintenance is manual or release-dispatch only.
- index refresh and state-hash verification need no AI credentials;
- `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` are required only for advisory analysis;
- missing configuration produces a redacted skip, not a failed index refresh;
- generated skill edits and autonomous release bumps are disabled until tagged files can be supplied; and
- each consuming job reruns the deterministic updater and rejects a hash mismatch.

Add the same observable expectations to `eval/scenarios/upstream-sync-indices.json`, including the two distinct branch names and exactly one schedule.

- [ ] **Step 5: Verify GREEN and commit**

Run:

```bash
node --input-type=module -e "import { assertAiMaintenanceWorkflow } from './eval/harness/release-conformance.mjs'; assertAiMaintenanceWorkflow(process.cwd())"
node eval/harness/run.mjs
git diff --check
```

Expected: all commands pass; no `workspace-with-*` or `create-pr:` remains in the AI workflow.

Commit:

```bash
git add -- .github/workflows/ai-skill-maintenance.yml docs/upstream-sync.md eval/scenarios/upstream-sync-indices.json eval/harness/release-conformance.mjs
git commit -m "fix: make AI maintenance artifact-free"
```

---

### Task 3: Enforce Complete Registry, Narrow Drift Skips, and Validate Every Skill

**Files:**

- Modify: `eval/harness/release-conformance.mjs`
- Modify: `eval/harness/run.mjs`
- Modify: `shared/scripts/core-ai-upstreams.mjs`
- Modify: `shared/scripts/upstream-drift-lib.mjs`
- Modify: `skills/wp-ai-connectors/SKILL.md`
- Modify: `skills/wp-ai-plugin/SKILL.md`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: `collectUpstreamDriftFromData(indices, skillTexts, registry)`.
- Produces: `getBlockingUpstreamFailures(report, { allowUpstreamNewer }): object[]`, `assertReleaseVersionAtLeast(actual, floor): void`, one declaration per release-backed affected skill, and dynamic CI enumeration of `skills/*`.

- [ ] **Step 1: Add failing registry, drift, release-floor, and CI fixtures**

Extend `assertCoreAiUpstreamRegistry()`:

```js
if (upstream.sourceType !== "html-version-map") {
  const declarationCounts = new Map();
  for (const declaration of upstream.declarations) {
    declarationCounts.set(declaration.skill, (declarationCounts.get(declaration.skill) ?? 0) + 1);
  }
  for (const skill of upstream.affectedSkills) {
    assert(
      declarationCounts.get(skill) === 1,
      `${upstream.id} affected skill ${skill} must have exactly one declaration`
    );
  }
  assert(
    declarationCounts.size === upstream.affectedSkills.length,
    `${upstream.id} declarations and affectedSkills must describe the same skills`
  );
}
```

Import `os` from `node:os`, import `collectUpstreamDrift`, and add a filesystem-backed stray skill to `assertIndependentUpstreamDrift()`. Write the existing fixture indices and skill texts into a temporary repository, then require an `unregistered-marker` failure even though no declaration loads the extra skill:

```js
const driftRoot = fs.mkdtempSync(path.join(os.tmpdir(), "upstream-drift-filesystem-"));
for (const upstream of CORE_AI_UPSTREAMS) {
  const indexPath = path.join(driftRoot, upstream.indexFile);
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, `${JSON.stringify(indices[upstream.id], null, 2)}\n`, "utf8");
}
for (const [skill, text] of Object.entries(skillTexts)) {
  const skillPath = path.join(driftRoot, "skills", skill, "SKILL.md");
  fs.mkdirSync(path.dirname(skillPath), { recursive: true });
  fs.writeFileSync(skillPath, text, "utf8");
}
const strayPath = path.join(driftRoot, "skills", "stray-skill", "SKILL.md");
fs.mkdirSync(path.dirname(strayPath), { recursive: true });
fs.writeFileSync(
  strayPath,
  "---\nname: stray-skill\ncompatibility: \"MCP Adapter verified through: 0.6.1\"\n---\n",
  "utf8"
);
const stray = collectUpstreamDrift(driftRoot, CORE_AI_UPSTREAMS);
fs.rmSync(driftRoot, { recursive: true, force: true });
assert(
  stray.failures.some((failure) => failure.code === "unregistered-marker" && failure.skill === "stray-skill"),
  "A marker in an otherwise undeclared skill must be rejected"
);
```

Import `getBlockingUpstreamFailures` from `upstream-drift-lib.mjs` and add a pure skip fixture:

```js
const mixedFailures = {
  failures: [
    { code: "upstream-newer" },
    { code: "invalid-index" },
    { code: "invalid-marker" },
    { code: "duplicate-declaration" },
    { code: "declaration-ahead" },
  ],
};
assert(
  getBlockingUpstreamFailures(mixedFailures, { allowUpstreamNewer: true })
    .map((failure) => failure.code)
    .join(",") === "invalid-index,invalid-marker,duplicate-declaration,declaration-ahead",
  "--skip-upstream-drift may suppress only upstream-newer"
);
```

In the same RED patch, change the expected drift sets to the target contract: Gutenberg reaches `wp-abilities-api`, `wp-ai-connectors`, and `wp-ai-plugin`; MCP reaches all three Abilities skills plus `wp-ai-plugin`; PHP AI Client reaches `wp-ai-client`, `wp-ai-connectors`, and `wp-ai-plugin`; WordPress/ai reaches only `wp-ai-plugin`; each provider reaches only `wp-ai-connectors`.

Replace `assertRelease190` with `assertReleaseFloor`; implement the reusable floor check exactly as follows:

```js
export function assertReleaseVersionAtLeast(actual, floor = "1.9.0") {
  assert(
    compareSemver(actual, floor) >= 0,
    `Release version ${actual} must be at least ${floor}`
  );
}
```

Test `assertReleaseVersionAtLeast("1.9.1", "1.9.0")` directly and use:

```js
expectThrow(
  () => assertReleaseVersionAtLeast("1.8.9", "1.9.0"),
  "A version below the release floor must fail"
);
```

`assertReleaseFloor()` must call that helper, require manifest equality, and require `docs/release-notes-${plugin.version}.md`.

Add a CI assertion requiring this loop and forbidding hard-coded `skills-ref validate skills/<name>` lines:

```bash
for skill_dir in skills/*; do
  test -d "$skill_dir" || continue
  skills-ref validate "$skill_dir"
done
```

- [ ] **Step 2: Run the focused checks and confirm RED**

Run:

```bash
node --input-type=module -e "import { assertCoreAiUpstreamRegistry, assertIndependentUpstreamDrift, assertReleaseFloor } from './eval/harness/release-conformance.mjs'; assertCoreAiUpstreamRegistry(process.cwd()); assertIndependentUpstreamDrift(); assertReleaseFloor(process.cwd())"
```

Expected: the first run fails because `upstream-drift-lib.mjs` does not yet export `getBlockingUpstreamFailures`. That is the RED result for the narrow skip contract.

- [ ] **Step 3: Make drift collection and skip behavior exact**

In `collectUpstreamDrift()`, load every `skills/*/SKILL.md`, not only declaration-owned skills, before calling the pure collector.

Add this helper to `upstream-drift-lib.mjs`:

```js
export function getBlockingUpstreamFailures(report, { allowUpstreamNewer = false } = {}) {
  const failures = Array.isArray(report?.failures) ? report.failures : [];
  return allowUpstreamNewer
    ? failures.filter((failure) => failure.code !== "upstream-newer")
    : failures;
}
```

In `run.mjs`, always execute the drift command and always verify its check count. Pass `allowUpstreamNewer: skipDrift` to the helper and fail on the returned list. Do not bypass the drift command when `--skip-upstream-drift` is present.

Retain an explicit `Array.isArray(drift.failures)` assertion before filtering so a malformed JSON report cannot become an empty blocking list.

Run the focused command from Step 2 again. Expected now: failure on the old affected-skill/declaration sets and old registry data, proving the filesystem and skip implementations load before registry data is corrected.

- [ ] **Step 4: Reconcile affected skills and markers**

Make these exact registry changes:

- add a Gutenberg declaration for `wp-ai-connectors`;
- remove `wp-ai-client` from `wordpress-ai-plugin.affectedSkills`;
- add an MCP Adapter declaration for `wp-ai-plugin`;
- add a PHP AI Client declaration for `wp-ai-plugin`; and
- remove `wp-ai-client` from each provider's `affectedSkills`.

Add these exact compatibility markers:

```text
wp-ai-connectors: Gutenberg verified through: 23.8.0
wp-ai-plugin: MCP Adapter verified through: 0.6.1
wp-ai-plugin: PHP AI Client verified through: 1.4.0
```

The RED fixtures from Step 1 already encode these exact target sets; do not weaken them while changing the registry.

- [ ] **Step 5: Make CI enumerate all skill directories**

Replace the eleven hard-coded `skills-ref` calls with the exact loop from Step 1. Retain the existing reference-tool install step.

- [ ] **Step 6: Verify GREEN and commit**

Run:

```bash
node --input-type=module -e "import { assertCoreAiUpstreamRegistry, assertIndependentUpstreamDrift, assertReleaseFloor } from './eval/harness/release-conformance.mjs'; assertCoreAiUpstreamRegistry(process.cwd()); assertIndependentUpstreamDrift(); assertReleaseFloor(process.cwd())"
node eval/harness/run.mjs --skip-upstream-drift
node shared/scripts/check-upstream-drift.mjs
git diff --check
```

Expected: all commands pass before the commit.

Commit:

```bash
git add -- .github/workflows/ci.yml eval/harness/release-conformance.mjs eval/harness/run.mjs shared/scripts/core-ai-upstreams.mjs shared/scripts/upstream-drift-lib.mjs skills/wp-ai-connectors/SKILL.md skills/wp-ai-plugin/SKILL.md
git commit -m "fix: enforce complete upstream drift coverage"
```

---

### Task 4: Fix Repository-Local Detection and Smoke Hygiene

**Files:**

- Modify: `eval/harness/release-conformance.mjs`
- Modify: `eval/harness/run.mjs`
- Modify: `skills/wp-ai-client/scripts/detect_ai_client.mjs`
- Modify: `skills/wp-ai-plugin/SKILL.md`
- Modify: `.gitignore`
- Modify: `eval/playground/ai-plugin-smoke/run.sh`
- Delete: `eval/playground/ai-plugin-smoke/mu-plugins/result.json`

**Interfaces:**

- Consumes: detector CLI `--root <path>` and the existing portable-triage validator.
- Produces: exported `assertLocalRuntimeHygiene(repoRoot)`, theme floor detection from `style.css`, portable prose with a manual fallback, and an untracked runtime-only smoke result.

- [ ] **Step 1: Add failing detector, triage, and smoke assertions**

Create `assertLocalRuntimeHygiene(repoRoot)`, call it from `runReleaseConformance()`, reuse the `os` import added in Task 3, and add a temporary theme fixture:

```js
const themeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wp-ai-client-theme-"));
fs.writeFileSync(
  path.join(themeRoot, "style.css"),
  "/*\nTheme Name: Detector Fixture\nRequires at least: 7.1\n*/\n",
  "utf8"
);
const detector = spawnSync(
  "node",
  [path.join(repoRoot, "skills/wp-ai-client/scripts/detect_ai_client.mjs"), "--root", themeRoot],
  { encoding: "utf8" }
);
const detectorReport = JSON.parse(detector.stdout);
assert(detectorReport.wp_floor === "7.1", "Theme style.css must set the detected WordPress floor");
assert(detectorReport.supports_ai_client === true, "A theme requiring 7.1 must support the Core AI Client path");
```

Add repository assertions:

```js
requireExcludes(repoRoot, "skills/wp-ai-plugin/SKILL.md", [
  "node skills/wp-project-triage/scripts/detect_wp_project.mjs",
]);
requireIncludes(repoRoot, "skills/wp-ai-plugin/SKILL.md", [
  "If the triage skill is unavailable, classify the project manually",
]);
requireIncludes(repoRoot, ".gitignore", [
  "eval/playground/ai-plugin-smoke/mu-plugins/result.json",
]);
requireIncludes(repoRoot, "eval/playground/ai-plugin-smoke/run.sh", [
  "trap 'rm -f mu-plugins/result.json' EXIT",
]);
assert(
  git(repoRoot, ["ls-files", "--", "eval/playground/ai-plugin-smoke/mu-plugins/result.json"]) === "",
  "Runtime smoke output must not be tracked"
);
```

Teach `validatePortableTriageCommand()` to reject both checkout-relative forms outside `wp-project-triage` itself:

```js
const nonPortableCommands = [
  "`node scripts/detect_wp_project.mjs`",
  "`node skills/wp-project-triage/scripts/detect_wp_project.mjs`",
];
if (
  expectedName !== "wp-project-triage" &&
  nonPortableCommands.some((command) => markdown.includes(command))
) {
  throw new Error(
    `Invalid checkout-relative triage command in ${path.relative(repoRoot, skillPath)}. Resolve the installed wp-project-triage skill directory or use manual classification.`
  );
}
```

- [ ] **Step 2: Run the focused checks and confirm RED**

Run:

```bash
node --input-type=module -e "import { assertLocalRuntimeHygiene } from './eval/harness/release-conformance.mjs'; assertLocalRuntimeHygiene(process.cwd())"
```

Expected: failure because `style.css` is ignored, the repository-relative triage command is present, and the smoke result is tracked.

- [ ] **Step 3: Implement theme-aware detection and portable triage prose**

In the detector loop, read plugin PHP and a file named exactly `style.css`, but scan AI usage only in PHP:

```js
for await (const file of walk(root)) {
  const isPhp = file.endsWith(".php");
  const isThemeStylesheet = path.basename(file) === "style.css";
  if (!isPhp && !isThemeStylesheet) continue;

  const contents = await fs.readFile(file, "utf8");
  const floor = extractHeaderField(contents, "Requires at least");
  if (floor) {
    floors.push({ file: path.relative(root, file), floor });
    if (lowestFloor === null || compareVersions(floor, lowestFloor) < 0) lowestFloor = floor;
  }

  if (!isPhp) continue;
  if (contents.includes("wp_ai_client_prompt(")) {
    result.uses_ai_client = true;
    result.feature_endpoints.push(path.relative(root, file));
  }
  if (/AI_Client\s*::\s*prompt\s*\(/.test(contents)) {
    result.uses_legacy_packages = true;
  }
}
```

In `wp-ai-plugin/SKILL.md`, say to run the installed `wp-project-triage` skill's detector resolved from that skill's own directory. Add the quoted manual-classification fallback and remove the repository-relative command.

- [ ] **Step 4: Make smoke output runtime-only**

Add the exact result path to `.gitignore`, add the cleanup trap immediately after `cd` in `run.sh`, and delete the committed JSON with `apply_patch`. Keep the MU plugin writing the same runtime path.

- [ ] **Step 5: Verify GREEN and commit**

Run:

```bash
node --input-type=module -e "import { assertLocalRuntimeHygiene } from './eval/harness/release-conformance.mjs'; assertLocalRuntimeHygiene(process.cwd())"
git check-ignore eval/playground/ai-plugin-smoke/mu-plugins/result.json
! git ls-files --error-unmatch eval/playground/ai-plugin-smoke/mu-plugins/result.json
```

Expected: all three commands pass; the negated `git ls-files` proves the runtime result is no longer tracked.

Commit:

```bash
git add -- .gitignore eval/harness/release-conformance.mjs eval/harness/run.mjs eval/playground/ai-plugin-smoke/run.sh skills/wp-ai-client/scripts/detect_ai_client.mjs skills/wp-ai-plugin/SKILL.md
git add -u -- eval/playground/ai-plugin-smoke/mu-plugins/result.json
git commit -m "fix: keep local detection and smoke output portable"
```

---

### Task 5: Correct the Abilities API Skill

**Files:**

- Modify: `eval/harness/release-conformance.mjs`
- Modify: `eval/scenarios/abilities-lifecycle-observability.json`
- Modify: `eval/scenarios/abilities-mcp-expose.json`
- Modify: `eval/scenarios/abilities-register-and-expose.json`
- Modify: `skills/wp-abilities-api/SKILL.md`
- Modify: `skills/wp-abilities-api/references/client-side.md`
- Modify: `skills/wp-abilities-api/references/input-schema-gotchas.md`
- Modify: `skills/wp-abilities-api/references/mcp-exposure.md`
- Modify: `skills/wp-abilities-api/references/php-registration.md`

**Interfaces:**

- Consumes: tagged Core 7.1, Gutenberg 23.8.0, and MCP Adapter 0.6.1 behavior.
- Produces: exported `assertAbilitiesApiPrecision(repoRoot)` and corrected lifecycle, schema-default, client-ready, registration, naming, validation-filter, route, and CLI-server guidance.

- [ ] **Step 1: Add a failing focused assertion**

Create `assertAbilitiesApiPrecision(repoRoot)` with these exact requirements:

```js
export function assertAbilitiesApiPrecision(repoRoot) {
  requireIncludes(repoRoot, "skills/wp-abilities-api/SKILL.md", [
    "wp_ability_normalize_input",
    "wp_ability_execute_result",
    "wp_before_execute_ability and wp_after_execute_ability predate 7.1",
  ]);
  requireIncludes(repoRoot, "skills/wp-abilities-api/references/input-schema-gotchas.md", [
    "useDefaults: true",
    "property-level defaults",
    "/wp-abilities/v1/abilities/{name}/run",
    "Gutenberg 23.8.0",
  ]);
  requireIncludes(repoRoot, "skills/wp-abilities-api/references/client-side.md", [
    "settled, not succeeded",
    "serverRegistered",
    "Unregistration does not check",
  ]);
  requireIncludes(repoRoot, "skills/wp-abilities-api/references/mcp-exposure.md", [
    "one argument",
    "three arguments",
    "$server_id = null",
    "first registered server",
  ]);
  requireIncludes(repoRoot, "skills/wp-abilities-api/references/php-registration.md", [
    "/^[a-z0-9-]+\\/[a-z0-9-]+$/",
    "underscores are rejected",
  ]);
}
```

Call it from `runReleaseConformance()` and update the three scenarios to require the same observable distinctions.

- [ ] **Step 2: Run the focused assertion and confirm RED**

Run:

```bash
node --input-type=module -e "import { assertAbilitiesApiPrecision } from './eval/harness/release-conformance.mjs'; assertAbilitiesApiPrecision(process.cwd())"
```

Expected: failure on the missing new-hook names and the incorrect schema/client/MCP guidance.

- [ ] **Step 3: Correct lifecycle, naming, and schema-default guidance**

In the description and lifecycle summary, list the genuinely new 7.1 surfaces: `wp_ability_invoked`, `wp_pre_execute_ability`, `wp_ability_normalize_input`, `wp_ability_validate_input`, `wp_ability_permission_result`, `wp_ability_execute_result`, and `wp_ability_validate_output`. State separately that `wp_before_execute_ability` and `wp_after_execute_ability` shipped in 6.9 and only gained the trailing ability argument in 7.1.

In `php-registration.md`, state the Core regex exactly and give `my-plugin/get-info` as valid and `my_plugin/get-info` as invalid.

In `input-schema-gotchas.md`, retain the PHP rule that property defaults are not injected, then add the client divergence: Gutenberg's AJV uses `useDefaults: true`, strips only the root schema default, and mutates missing property defaults into the input before the JS callback. Correct the run route and verification tag.

- [ ] **Step 4: Correct client and MCP behavior**

In `client-side.md`, state that `ready` resolves after both initialization attempts settle because fetch errors are caught and logged; after awaiting it, an empty store can still mean authentication/network failure. State that registration reads `serverRegistered` to avoid adding `clientRegistered`, while unregistration ignores the flag and removes the local store entry.

Replace the validation-filter example with an optional-argument callback safe for all eight call sites:

```php
add_filter( 'mcp_adapter_validation_enabled', function ( $enabled, $server_id = null, $server = null ) {
    if ( null === $server_id ) {
        return true;
    }
    return 'my-server' === $server_id;
}, 10, 3 );
```

Explain that seven DTO validation sites pass only the default value, while `McpServer` passes all three arguments. Correct STDIO guidance: omitting `--server` selects the first registered server, so production/test commands must pass `--server=<server-id>` when identity matters.

- [ ] **Step 5: Re-run the Abilities API application scenario with the skill**

Run in a fresh context:

```bash
claude -p "Read skills/wp-abilities-api/SKILL.md, skills/wp-abilities-api/references/input-schema-gotchas.md, skills/wp-abilities-api/references/client-side.md, and skills/wp-abilities-api/references/mcp-exposure.md completely from this workspace. Do not use globally installed copies and do not edit files. I need a WordPress 7.1 implementation today. Explain which execution hooks are genuinely new in 7.1, whether PHP and JavaScript inject property-level input-schema defaults, what awaiting @wordpress/core-abilities ready proves, how to safely hook mcp_adapter_validation_enabled, and what wp mcp-adapter serve chooses without --server." --output-format json
```

Expected: the response names all seven genuinely new hooks, including `wp_ability_normalize_input` and `wp_ability_execute_result`, separates the two older before/after actions, distinguishes PHP from AJV defaults, treats `ready` as settled rather than successful, uses optional callback arguments, and says omitted `--server` chooses the first registered server.

- [ ] **Step 6: Verify GREEN and commit**

Run:

```bash
node --input-type=module -e "import { assertAbilitiesApiPrecision } from './eval/harness/release-conformance.mjs'; assertAbilitiesApiPrecision(process.cwd())"
node --check eval/harness/release-conformance.mjs
git diff --check
```

Expected: focused, syntax, and whitespace checks pass. The strict harness remains intentionally deferred until the release bump because Task 3 already committed skill-marker changes.

Commit:

```bash
git add -- eval/harness/release-conformance.mjs eval/scenarios/abilities-lifecycle-observability.json eval/scenarios/abilities-mcp-expose.json eval/scenarios/abilities-register-and-expose.json skills/wp-abilities-api
git commit -m "docs: correct Abilities API edge cases"
```

---

### Task 6: Correct Audit and Verification Contracts

**Files:**

- Modify: `eval/harness/release-conformance.mjs`
- Modify: `eval/scenarios/wp-abilities-audit.json`
- Modify: `eval/scenarios/wp-abilities-verify.json`
- Modify: `skills/wp-abilities-audit/references/audit-schema.md`
- Modify: `skills/wp-abilities-audit/references/capability-gate-tracing.md`
- Modify: `skills/wp-abilities-verify/SKILL.md`
- Modify: `skills/wp-abilities-verify/references/audit-schema-validation.md`
- Modify: `skills/wp-abilities-verify/references/exposure-checks.md`
- Modify: `skills/wp-abilities-verify/references/runtime-harness.md`
- Modify: `skills/wp-abilities-verify/references/schema-lints.md`

**Interfaces:**

- Consumes: Core's filtered `wp_get_abilities()` and raw `WP_Abilities_Registry::get_instance()->get_all_registered()` surfaces.
- Produces: exported `assertAbilitiesAuditVerifyPrecision(repoRoot)`, an executable-with-empty-input reference-ability lint, and unambiguous capability-gate severity.

- [ ] **Step 1: Add a failing focused assertion**

```js
export function assertAbilitiesAuditVerifyPrecision(repoRoot) {
  requireIncludes(repoRoot, "skills/wp-abilities-audit/references/capability-gate-tracing.md", [
    "map_meta_cap defaults to true only for the built-in post and page capability types",
    "edit_others_shop_orders",
  ]);
  requireExcludes(repoRoot, "skills/wp-abilities-audit/references/capability-gate-tracing.md", [
    "writes gate on `edit_shop_orders`",
  ]);
  requireIncludes(repoRoot, "skills/wp-abilities-audit/references/audit-schema.md", [
    "A single-capability string is canonical and does not emit WARN",
    "Only the legacy slash-separated compound string emits WARN",
  ]);
  requireIncludes(repoRoot, "skills/wp-abilities-verify/references/schema-lints.md", [
    "missing `input_schema`",
    "ability_missing_input_schema",
  ]);
  requireIncludes(repoRoot, "skills/wp-abilities-verify/references/exposure-checks.md", [
    "filtered view",
    "WP_Abilities_Registry::get_instance()->get_all_registered()",
  ]);
}
```

Call it from `runReleaseConformance()` and update both scenarios with these acceptance rules.

- [ ] **Step 2: Run the focused assertion and confirm RED**

Run:

```bash
node --input-type=module -e "import { assertAbilitiesAuditVerifyPrecision } from './eval/harness/release-conformance.mjs'; assertAbilitiesAuditVerifyPrecision(process.cwd())"
```

Expected: failure on shop-order capability, missing-schema lint, and filtered enumeration language.

- [ ] **Step 3: Correct capability tracing and schema semantics**

In `capability-gate-tracing.md`, say that Core defaults `map_meta_cap` to true only when `capability_type` is `post` or `page`; custom types must opt in. Change the author-sensitive shop-order write example to `edit_others_shop_orders`.

Make all capability-gate descriptions agree:

- a single capability string such as `manage_options` is canonical and produces no warning;
- a structured `{read, write, confirmed, verified_at}` object is canonical for compound gates; and
- only the legacy slash-separated compound string is accepted with WARN.

- [ ] **Step 4: Make reference-ability and runtime enumeration checks honest**

Change Lint 6 so `reference_ability: true` fails when `input_schema` is absent as well as when `required` is non-empty. State why: calling `execute([])` without a schema returns `WP_Error(ability_missing_input_schema)`.

Across the verify skill and runtime references, call `wp_get_abilities()` the ecosystem-filtered view. Use this raw comparison when diagnosing a static/runtime mismatch:

```php
$filtered = wp_get_abilities();
$registry = WP_Abilities_Registry::get_instance();
$raw      = $registry ? $registry->get_all_registered() : array();
```

Only report “registration hook is not firing” when the ability is absent from `$raw`; if it is raw-only, report which `wp_get_abilities_item_include` or `wp_get_abilities_result` filtering path needs investigation.

- [ ] **Step 5: Re-run both audit/verify application scenarios with their skills**

Run in separate fresh contexts:

```bash
claude -p "Read skills/wp-abilities-audit/SKILL.md, skills/wp-abilities-audit/references/audit-schema.md, and skills/wp-abilities-audit/references/capability-gate-tracing.md completely from this workspace. Do not use globally installed copies and do not edit files. Audit a WooCommerce-style shop_order controller now: give the private-read and author-sensitive write caps, say when map_meta_cap defaults true for a custom capability_type, and choose the canonical capability_gate shape for both a one-capability plugin and a read/write plugin." --output-format json

claude -p "Read skills/wp-abilities-verify/SKILL.md, skills/wp-abilities-verify/references/schema-lints.md, skills/wp-abilities-verify/references/exposure-checks.md, and skills/wp-abilities-verify/references/runtime-harness.md completely from this workspace. Do not use globally installed copies and do not edit files. Verify an audited WordPress 7.1 reference ability. It has reference_ability true but no input_schema, and wp_get_abilities omits it while the registration call is visible statically. Give PASS/WARN/FAIL decisions and the exact runtime checks needed before saying registration is broken." --output-format json
```

Expected: the audit response uses `read_private_shop_orders` and `edit_others_shop_orders`, explains the `map_meta_cap` condition, accepts a single string without WARN, and uses an object for a compound gate. The verify response fails the schema-less reference ability and compares raw registry contents with the filtered helper before diagnosing registration.

- [ ] **Step 6: Verify GREEN and commit**

Run:

```bash
node --input-type=module -e "import { assertAbilitiesAuditVerifyPrecision } from './eval/harness/release-conformance.mjs'; assertAbilitiesAuditVerifyPrecision(process.cwd())"
git diff --check
```

Expected: pass. The full harness may now report only the planned marketplace freshness failure because Task 5 is committed.

Commit:

```bash
git add -- eval/harness/release-conformance.mjs eval/scenarios/wp-abilities-audit.json eval/scenarios/wp-abilities-verify.json skills/wp-abilities-audit skills/wp-abilities-verify
git commit -m "docs: tighten Abilities audit and verification"
```

---

### Task 7: Correct AI Client and Connector Guidance

**Files:**

- Modify: `eval/harness/release-conformance.mjs`
- Modify: `eval/scenarios/ai-client-ability-resolver.json`
- Modify: `eval/scenarios/ai-client-add-feature-endpoint.json`
- Modify: `eval/scenarios/ai-connectors-register-provider.json`
- Modify: `skills/wp-ai-client/SKILL.md`
- Modify: `skills/wp-ai-client/references/prompt-builder.md`
- Modify: `skills/wp-ai-client/references/rest-patterns.md`
- Modify: `skills/wp-ai-connectors/SKILL.md`
- Modify: `skills/wp-ai-connectors/references/provider-registration.md`

**Interfaces:**

- Consumes: Core 7.1's three registered abilities, PHP AI Client `File::getDataUri(): ?string` and `getUrl(): ?string`, and Core connector normalization/write behavior.
- Produces: exported `assertAiClientConnectorPrecision(repoRoot)` and copyable examples that use real abilities, handle remote files, and describe credential loss accurately.

- [ ] **Step 1: Add a failing focused assertion**

```js
export function assertAiClientConnectorPrecision(repoRoot) {
  for (const file of [
    "skills/wp-ai-client/SKILL.md",
    "skills/wp-ai-client/references/prompt-builder.md",
  ]) {
    requireExcludes(repoRoot, file, ["core/get-attachment", "core/update-attachment"]);
    requireIncludes(repoRoot, file, ["core/get-site-info", "core/get-environment-info"]);
  }
  requireIncludes(repoRoot, "skills/wp-ai-client/references/rest-patterns.md", [
    "$image->isRemote()",
    "$image->getUrl()",
    "$image->getDataUri()",
    "wp_safe_remote_get",
    "limit_response_size",
  ]);
  requireIncludes(repoRoot, "skills/wp-ai-connectors/SKILL.md", [
    "listModelMetadata()",
    "stores an empty string",
    "no admin-visible error",
  ]);
  requireIncludes(repoRoot, "skills/wp-ai-connectors/references/provider-registration.md", [
    "rebuilds the authentication array",
    "unknown authentication keys are discarded",
  ]);
  requireExcludes(repoRoot, "skills/wp-ai-connectors/references/provider-registration.md", [
    "accepts arbitrary extra `authentication` data",
  ]);
}
```

Call it from `runReleaseConformance()` and update the three scenarios to reject the broken examples.

- [ ] **Step 2: Run the focused assertion and confirm RED**

Run:

```bash
node --input-type=module -e "import { assertAiClientConnectorPrecision } from './eval/harness/release-conformance.mjs'; assertAiClientConnectorPrecision(process.cwd())"
```

Expected: failure on nonexistent abilities, nullable data URI handling, and connector normalization.

- [ ] **Step 3: Replace nonexistent abilities and handle both File representations**

Use `core/get-site-info` and `core/get-environment-info` in both function-calling examples, with a prompt asking for a compatibility summary. Keep the resolver round trip unchanged and state that Core 7.1 registers only those two plus `core/get-user-info`; plugin-owned IDs must be labeled as placeholders.

In `rest-patterns.md`, validate the declared MIME and branch before calling `strlen()`:

```php
$max_image_bytes = (int) apply_filters( 'my_plugin_ai_image_max_bytes', 10 * MB_IN_BYTES );
$allowed_mimes   = array(
    'image/png'  => 'png',
    'image/jpeg' => 'jpg',
    'image/webp' => 'webp',
);
$mime_type       = $image->getMimeType();

if ( ! isset( $allowed_mimes[ $mime_type ] ) ) {
    return new WP_Error( 'invalid_image', 'AI image response has an unsupported MIME type.', array( 'status' => 500 ) );
}
$extension = $allowed_mimes[ $mime_type ];

if ( $image->isRemote() ) {
    $url = $image->getUrl();
    if ( ! is_string( $url ) || ! wp_http_validate_url( $url ) ) {
        return new WP_Error( 'invalid_image_url', 'AI image URL is not safe to download.', array( 'status' => 500 ) );
    }
    $response = wp_safe_remote_get( $url, array(
        'timeout'             => 30,
        'redirection'         => 3,
        'limit_response_size' => $max_image_bytes + 1,
    ) );
    if ( is_wp_error( $response ) ) {
        return $response;
    }
    $status = wp_remote_retrieve_response_code( $response );
    if ( $status < 200 || $status >= 300 ) {
        return new WP_Error( 'image_download_failed', 'AI image URL returned a non-success response.', array( 'status' => 500 ) );
    }
    $data = wp_remote_retrieve_body( $response );
    if ( strlen( $data ) > $max_image_bytes ) {
        return new WP_Error( 'image_too_large', 'AI image response is too large to store.', array( 'status' => 500 ) );
    }
} else {
    $data_uri = $image->getDataUri();
    if ( ! is_string( $data_uri ) ) {
        return new WP_Error( 'invalid_image', 'AI image response has no usable file data.', array( 'status' => 500 ) );
    }
    if ( strlen( $data_uri ) > 2 * $max_image_bytes ) {
        return new WP_Error( 'image_too_large', 'AI image response is too large to store.', array( 'status' => 500 ) );
    }
    if ( ! preg_match( '#^data:image/(?:png|jpeg|webp);base64,(?<payload>[A-Za-z0-9+/=]+)$#', $data_uri, $matches ) ) {
        return new WP_Error( 'invalid_image', 'AI image response is not a supported data URI.', array( 'status' => 500 ) );
    }
    $data = base64_decode( $matches['payload'], true );
    if ( false === $data || strlen( $data ) > $max_image_bytes ) {
        return new WP_Error( 'invalid_image', 'AI image response could not be decoded or is too large.', array( 'status' => 500 ) );
    }
}
```

After either branch, write with `wp_upload_bits()` using `$extension`, require `wp_get_image_mime($upload['file']) === $mime_type`, delete an invalid upload, and only then insert the attachment.

- [ ] **Step 4: Correct connector persistence and normalization**

In `wp-ai-connectors/SKILL.md`, document that saving an API key performs a live provider `listModelMetadata()` validation; an exception, timeout, or false result calls `update_option($setting_name, '')` and gives no admin-visible error. Tell implementers to make `availability()`/metadata discovery reliable and to test invalid, unreachable, and valid credentials before shipping.

In `provider-registration.md`, state that `WP_Connector_Registry::register()` rebuilds `authentication` from `method` plus the recognized method-specific keys; unknown keys are discarded. Custom OAuth/JWT/mTLS data therefore needs provider-owned storage and UI.

Correct provenance: the registry class is tagged `@since 7.0.0`; `application_password` support is identified as 7.1 in `connectors.php` and its related implementation, not by claiming the entire registry class is `@since 7.1.0`.

- [ ] **Step 5: Re-run both AI Client/connector application scenarios with their skills**

Run in separate fresh contexts:

```bash
claude -p "Read skills/wp-ai-client/SKILL.md, skills/wp-ai-client/references/prompt-builder.md, and skills/wp-ai-client/references/rest-patterns.md completely from this workspace. Do not use globally installed copies and do not edit files. Give copyable WordPress 7.1 PHP for an AI Client function-calling round trip using two abilities Core actually registers, then safely persist generate_image() output when the File DTO may contain either an inline data URI or a remote URL." --output-format json

claude -p "Read skills/wp-ai-connectors/SKILL.md and skills/wp-ai-connectors/references/provider-registration.md completely from this workspace. Do not use globally installed copies and do not edit files. A custom WordPress 7.1 AI provider times out during model discovery and an admin says their saved API key became blank. Explain the exact write-time path and whether arbitrary extra authentication keys survive WP_Connector_Registry normalization." --output-format json
```

Expected: the client response uses only real Core 7.1 IDs and handles both `getDataUri()` and `getUrl()` with bounded, safe retrieval. The connector response names live `listModelMetadata()` validation, empty-string persistence with no visible notice, and the registry's allow-listed normalization.

- [ ] **Step 6: Verify GREEN and commit**

Run:

```bash
node --input-type=module -e "import { assertAiClientConnectorPrecision } from './eval/harness/release-conformance.mjs'; assertAiClientConnectorPrecision(process.cwd())"
git diff --check
```

Expected: pass. The only permitted full-harness failure remains marketplace freshness.

Commit:

```bash
git add -- eval/harness/release-conformance.mjs eval/scenarios/ai-client-ability-resolver.json eval/scenarios/ai-client-add-feature-endpoint.json eval/scenarios/ai-connectors-register-provider.json skills/wp-ai-client skills/wp-ai-connectors
git commit -m "docs: correct AI Client and connector behavior"
```

---

### Task 8: Complete the WordPress/ai 1.3 Extension Surface

**Files:**

- Modify: `eval/harness/release-conformance.mjs`
- Modify: `eval/scenarios/ai-plugin-custom-abilities-1-3.json`
- Modify: `eval/scenarios/ai-plugin-register-experiment.json`
- Modify: `skills/wp-ai-plugin/SKILL.md`
- Modify: `skills/wp-ai-plugin/references/experiments-framework.md`
- Modify: `skills/wp-ai-plugin/references/hooks-and-filters.md`
- Modify: `skills/wp-abilities-api/SKILL.md`

**Interfaces:**

- Consumes: WordPress/ai tag 1.3.0 executable hook sites and implementation classes.
- Produces: exported `assertAiPluginPrecision(repoRoot)`, a complete active hook inventory, correct source paths, and no stale 1.2/Gutenberg pin.

- [ ] **Step 1: Add a failing exact hook/path assertion**

```js
export function assertAiPluginPrecision(repoRoot) {
  const hooksReference = read(repoRoot, "skills/wp-ai-plugin/references/hooks-and-filters.md");
  const requiredHooks = [
    "wpai_ability_category",
    "wpai_comment_analysis_response_schema",
    "wpai_comment_analysis_result",
    "wpai_comment_moderation_should_moderate",
    "wpai_comment_moderation_show_dashboard_pills",
    "wpai_content_classification_max_suggestions",
    "wpai_content_classification_prompt",
    "wpai_content_classification_strategy",
    "wpai_content_classification_suggestions",
    "wpai_generated_image_filename",
    "wpai_get_post_details",
    "wpai_get_post_terms",
    "wpai_meta_description",
    "wpai_meta_description_meta_key",
    "wpai_meta_description_prompt",
    "wpai_meta_description_seo_plugins",
    "wpai_request_log_context",
    "wpai_request_log_kind",
    "wpai_request_log_providers",
    "wpai_request_log_retention_days",
  ];
  requireIncludes(repoRoot, "skills/wp-ai-plugin/references/hooks-and-filters.md", requiredHooks);
  requireIncludes(repoRoot, "skills/wp-ai-plugin/references/hooks-and-filters.md", [
    "0 to retain forever",
  ]);
  const preferredSection = hooksReference.match(
    /### Preferred model selection[\s\S]*?(?=\n### )/
  )?.[0] ?? "";
  for (const hook of [
    "wpai_preferred_text_models",
    "wpai_preferred_image_models",
    "wpai_preferred_vision_models",
  ]) {
    assert(preferredSection.includes(hook), `${hook} must appear in the active preferred-model section`);
  }
  requireIncludes(repoRoot, "skills/wp-ai-plugin/SKILL.md", [
    "includes/Abilities/Content/Content.php",
    "includes/Abilities/Users/Users.php",
    "includes/Abilities/Settings/Settings.php",
  ]);
  requireExcludes(repoRoot, "skills/wp-abilities-api/SKILL.md", [
    "WordPress/ai 1.2.0, `includes/Abilities/`",
  ]);
}
```

Call it from `runReleaseConformance()` and add the hook/path expectations to the two AI plugin scenarios.

- [ ] **Step 2: Run the focused assertion and confirm RED**

Run:

```bash
node --input-type=module -e "import { assertAiPluginPrecision } from './eval/harness/release-conformance.mjs'; assertAiPluginPrecision(process.cwd())"
```

Expected: failure on the first missing hook.

- [ ] **Step 3: Add the 20 source-verified hook rows**

Add active sections for the exact 20 names in Step 1 using this tagged-source map:

| Hook | Filtered value and additional arguments |
| --- | --- |
| `wpai_ability_category` | `$category_label, $slug` |
| `wpai_comment_analysis_response_schema` | `$schema` |
| `wpai_comment_analysis_result` | `null, $content, $author` (pre-result short circuit) |
| `wpai_comment_moderation_should_moderate` | `$should_moderate, $analysis, $comment_id` |
| `wpai_comment_moderation_show_dashboard_pills` | `true, $comment_id, $comment` |
| `wpai_content_classification_max_suggestions` | `$max_suggestions` |
| `wpai_content_classification_prompt` | `$prompt, $context, $taxonomy, $assigned_terms, $available_terms` |
| `wpai_content_classification_strategy` | `$strategy` |
| `wpai_content_classification_suggestions` | `$suggestions, $taxonomy, $strategy` |
| `wpai_generated_image_filename` | `$args['filename'], $args` |
| `wpai_get_post_details` | `$details, $post_id, $fields` |
| `wpai_get_post_terms` | `$terms, $post_id, $allowed_taxonomies` |
| `wpai_meta_description` | `$meta_description` |
| `wpai_meta_description_meta_key` | `$key, $plugin_slug` |
| `wpai_meta_description_prompt` | `$prompt, $content, $title` |
| `wpai_meta_description_seo_plugins` | `$plugins` |
| `wpai_request_log_context` | `$context, $decoded, $log_data` |
| `wpai_request_log_kind` | `'text', $provider, $path, $payload` |
| `wpai_request_log_providers` | `$patterns` |
| `wpai_request_log_retention_days` | `0` days by default |

Move `wpai_preferred_text_models`, `wpai_preferred_image_models`, and `wpai_preferred_vision_models` into an active model-preference table while retaining their deprecated aliases in the legacy table.

For request logging, document the four actual filter call sites in tag 1.3.0: `retention_days`, `providers`, `context`, and `kind`. State that retention defaults to `0`, which disables cleanup and retains log previews indefinitely. Do not list `wpai_request_log_tokens` as a hook; it is a data key, which resolves the audit's five-versus-four count against executable source.

- [ ] **Step 4: Correct implementation paths and stale cross-skill pins**

In `wp-ai-plugin/SKILL.md`, explain that `includes/Abilities/Gated/*.php` contains thin gate wrappers. Direct readers to the three underlying schema/permission implementations named in Step 1; keep `Gated/Gated_Abilities.php` as the source for the class list and gate.

In `wp-abilities-api/SKILL.md`, replace the stale WordPress/ai 1.2 path sentence with 1.3 behavior: the read abilities are gated by Custom Abilities, thin wrappers live under `includes/Abilities/Gated/`, and implementations live under the domain directories.

- [ ] **Step 5: Re-run the WordPress/ai application scenario with the skill**

Run in a fresh context:

```bash
claude -p "Read skills/wp-ai-plugin/SKILL.md, skills/wp-ai-plugin/references/experiments-framework.md, and skills/wp-ai-plugin/references/hooks-and-filters.md completely from this workspace. Do not use globally installed copies and do not edit files. For WordPress/ai 1.3.0, list the request-log filters and retention default, name the active preferred-model filters, and point me to the real schema and permission implementations behind the gated read-content, read-users, and read-settings wrappers." --output-format json
```

Expected: the response lists exactly four request-log filters, says retention 0 means forever, treats all three preferred-model filters as active, and points to the Content, Users, and Settings domain implementations rather than only the thin Gated wrappers.

- [ ] **Step 6: Verify GREEN and commit**

Run:

```bash
node --input-type=module -e "import { assertAiPluginPrecision } from './eval/harness/release-conformance.mjs'; assertAiPluginPrecision(process.cwd())"
rg -n 'WordPress/ai 1\.2\.0, `includes/Abilities/`|wpai_request_log_tokens.*Filter' skills/wp-abilities-api skills/wp-ai-plugin
git diff --check
```

Expected: the focused check passes and the stale search returns no matches.

Commit:

```bash
git add -- eval/harness/release-conformance.mjs eval/scenarios/ai-plugin-custom-abilities-1-3.json eval/scenarios/ai-plugin-register-experiment.json skills/wp-ai-plugin skills/wp-abilities-api/SKILL.md
git commit -m "docs: complete AI plugin extension guidance"
```

---

### Task 9: Publish the 1.9.1 Remediation Record

**Files:**

- Modify: `eval/harness/release-conformance.mjs`
- Create: `docs/core-ai-skills-audit-2026-08-25.md`
- Modify: `docs/core-ai-skills-audit-2026-08-24.md`
- Modify: `docs/skill-set-v1.md`
- Create: `docs/release-notes-1.9.1.md`
- Modify: `.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`

**Interfaces:**

- Consumes: all completed remediation commits and `assertReleaseFloor()` from Task 3.
- Produces: synchronized version 1.9.1 manifests, exact-current-version notes, a current audit record, and an accurate 21-skill inventory.

- [ ] **Step 1: Add failing release-record assertions**

Create `assertRemediationRelease191(repoRoot)`:

```js
export function assertRemediationRelease191(repoRoot) {
  requireIncludes(repoRoot, "docs/release-notes-1.9.1.md", [
    "artifact-free",
    "state hash",
    "drift",
    "source-verified",
    "smoke output",
  ]);
  requireIncludes(repoRoot, "docs/core-ai-skills-audit-2026-08-24.md", [
    "Superseded for current-state claims",
    "docs/core-ai-skills-audit-2026-08-25.md",
  ]);
  requireIncludes(repoRoot, "docs/core-ai-skills-audit-2026-08-25.md", [
    "AI-authored skill pull requests remain disabled",
    "PR #92 was not mutated",
    "20 previously undocumented hooks",
  ]);

  const listedSkills = [...read(repoRoot, "docs/skill-set-v1.md").matchAll(/^- `([^`]+)`$/gm)]
    .map((match) => match[1])
    .sort();
  const actualSkills = fs.readdirSync(path.join(repoRoot, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert(JSON.stringify(listedSkills) === JSON.stringify(actualSkills), "Skill inventory must exactly match skills/*");
}
```

Call it from `runReleaseConformance()`.

- [ ] **Step 2: Run the focused assertion and confirm RED**

Run:

```bash
node --input-type=module -e "import { assertRemediationRelease191 } from './eval/harness/release-conformance.mjs'; assertRemediationRelease191(process.cwd())"
```

Expected: failure because the 1.9.1 notes and current audit do not exist.

- [ ] **Step 3: Write the dated records and exact inventory**

Create `docs/core-ai-skills-audit-2026-08-25.md` as a concise finding-to-fix ledger. It must distinguish verified source facts from workflow acceptance evidence, list every correction in Tasks 1–8, state that four request-log filters exist in the tag, disclose that autonomous edits remain disabled, state that 1.9.1 is a manual coordinated release, require any future autonomous version conflict to rebase and recompute before merge, and state that PR #92 was observed but not mutated.

Add a top-of-file supersession notice to the 2026-08-24 audit without rewriting its historical body. Replace `docs/skill-set-v1.md` with the alphabetized output of the 21 real `skills/*` directories and remove the phantom “planned next skills” section.

- [ ] **Step 4: Add release notes and bump both manifests atomically**

Write `docs/release-notes-1.9.1.md` with three short sections: workflow reliability, enforcement coverage, and corrected Core AI guidance. Set both manifest versions to exactly `1.9.1` in the same patch.

- [ ] **Step 5: Create the release commit required by the freshness gate**

The freshness gate finds version bumps from committed history, so it cannot turn green while the manifest change is only in the working tree. First run the focused record check and commit the coordinated release:

Run:

```bash
node --input-type=module -e "import { assertRemediationRelease191 } from './eval/harness/release-conformance.mjs'; assertRemediationRelease191(process.cwd())"
git diff --check
git add -- .claude-plugin/plugin.json .claude-plugin/marketplace.json docs/core-ai-skills-audit-2026-08-24.md docs/core-ai-skills-audit-2026-08-25.md docs/skill-set-v1.md docs/release-notes-1.9.1.md eval/harness/release-conformance.mjs
git commit -m "chore: release WordPress skills 1.9.1"
```

- [ ] **Step 6: Verify GREEN at the committed release revision**

Run:

```bash
node eval/harness/run.mjs
node shared/scripts/check-upstream-drift.mjs
git diff --check
```

Expected: the strict harness is fully green, including marketplace freshness and current-version notes. If a release assertion needs correction, apply it, stage it, run `git commit --amend --no-edit`, and repeat these three commands so the version bump remains the last commit containing all shipped skill changes.

---

### Task 10: Run Acceptance, Packaging, Live Workflow, and Independent Review

**Files:**

- Modify only if verification exposes a defect in an in-scope file.
- Inspect: the complete branch diff, built packages, workflow run, and all Core AI scenarios.

**Interfaces:**

- Consumes: committed Tasks 1–9.
- Produces: exact revision evidence for offline checks, independent-refresh hash equality, live dispatch, smoke cleanliness, package/install validation, scenario review, and independent code review.

- [ ] **Step 1: Refresh live indices and reject unreviewed drift**

Run:

```bash
node shared/scripts/update-upstream-indices.mjs
git diff -- shared/references
node shared/scripts/check-upstream-drift.mjs
```

Expected: no index diff and a green drift check. If a real release appeared, stop this completion sequence, inspect its tagged executable source, update only affected guidance/markers, and rerun Tasks 3–9 checks before continuing.

- [ ] **Step 2: Prove independent clean checkouts converge without an artifact**

Run from the committed feature branch:

```bash
STATE_CHECK_ROOT=$(mktemp -d)
git clone --no-hardlinks . "$STATE_CHECK_ROOT/refresh"
git clone --no-hardlinks . "$STATE_CHECK_ROOT/consumer"
(cd "$STATE_CHECK_ROOT/refresh" && node shared/scripts/update-upstream-indices.mjs)
(cd "$STATE_CHECK_ROOT/consumer" && node shared/scripts/update-upstream-indices.mjs)
REFRESH_HASH=$(cd "$STATE_CHECK_ROOT/refresh" && node shared/scripts/ai-generate-updates.mjs --print-state-hash)
CONSUMER_HASH=$(cd "$STATE_CHECK_ROOT/consumer" && node shared/scripts/ai-generate-updates.mjs --print-state-hash)
test "$REFRESH_HASH" = "$CONSUMER_HASH"
test -z "$(git -C "$STATE_CHECK_ROOT/refresh" status --short)"
test -z "$(git -C "$STATE_CHECK_ROOT/consumer" status --short)"
```

Expected: identical 64-character hashes and clean clones. No index file is copied between them.

- [ ] **Step 3: Run strict, smoke, package, and all-skill validation**

Run:

```bash
node eval/harness/run.mjs
node shared/scripts/check-upstream-drift.mjs
node shared/scripts/ai-generate-updates.mjs --check-config
./eval/playground/ai-plugin-smoke/run.sh
test -z "$(git status --short)"

PACKAGE_CHECK_ROOT=$(mktemp -d)
node shared/scripts/skillpack-build.mjs --clean --out="$PACKAGE_CHECK_ROOT/dist" --targets=codex,vscode
node shared/scripts/skillpack-install.mjs --from="$PACKAGE_CHECK_ROOT/dist" --dest="$PACKAGE_CHECK_ROOT/install" --targets=codex,vscode
test -f "$PACKAGE_CHECK_ROOT/install/.codex/skills/wordpress-router/SKILL.md"
test -f "$PACKAGE_CHECK_ROOT/install/.github/skills/wordpress-router/SKILL.md"

SKILLS_REF_ROOT=$(mktemp -d)
python3 -m venv "$SKILLS_REF_ROOT/venv"
"$SKILLS_REF_ROOT/venv/bin/pip" install "git+https://github.com/agentskills/agentskills@main#subdirectory=skills-ref"
for skill_dir in skills/*; do
  test -d "$skill_dir" || continue
  "$SKILLS_REF_ROOT/venv/bin/skills-ref" validate "$skill_dir"
done
```

Expected: every command passes; the smoke run leaves no working-tree change.

- [ ] **Step 4: Exercise all Core AI behavioral scenarios**

Run each of these 14 scenario files through a fresh agent context that is instructed to read only the listed workspace skills before answering:

```text
eval/scenarios/abilities-lifecycle-observability.json
eval/scenarios/abilities-mcp-expose.json
eval/scenarios/abilities-public-exposure-and-permissions.json
eval/scenarios/abilities-register-and-expose.json
eval/scenarios/ai-client-ability-resolver.json
eval/scenarios/ai-client-add-feature-endpoint.json
eval/scenarios/ai-client-standalone-embeddings.json
eval/scenarios/ai-connectors-embedding-provider.json
eval/scenarios/ai-connectors-register-provider.json
eval/scenarios/ai-plugin-custom-abilities-1-3.json
eval/scenarios/ai-plugin-expose-read-abilities.json
eval/scenarios/ai-plugin-register-experiment.json
eval/scenarios/wp-abilities-audit.json
eval/scenarios/wp-abilities-verify.json
```

Use a fresh CLI process per scenario and keep outputs outside the repository:

```bash
SCENARIO_RESULTS_ROOT=$(mktemp -d)
CORE_AI_SCENARIOS=(
  eval/scenarios/abilities-lifecycle-observability.json
  eval/scenarios/abilities-mcp-expose.json
  eval/scenarios/abilities-public-exposure-and-permissions.json
  eval/scenarios/abilities-register-and-expose.json
  eval/scenarios/ai-client-ability-resolver.json
  eval/scenarios/ai-client-add-feature-endpoint.json
  eval/scenarios/ai-client-standalone-embeddings.json
  eval/scenarios/ai-connectors-embedding-provider.json
  eval/scenarios/ai-connectors-register-provider.json
  eval/scenarios/ai-plugin-custom-abilities-1-3.json
  eval/scenarios/ai-plugin-expose-read-abilities.json
  eval/scenarios/ai-plugin-register-experiment.json
  eval/scenarios/wp-abilities-audit.json
  eval/scenarios/wp-abilities-verify.json
)
test "${#CORE_AI_SCENARIOS[@]}" -eq 14
for scenario in "${CORE_AI_SCENARIOS[@]}"; do
  SCENARIO_PROMPT=$(jq -r '
    "Read these workspace files completely before answering: " +
    ([.skills[] | "skills/" + . + "/SKILL.md"] | join(", ")) +
    ". Do not use globally installed copies and do not edit files.\n\nUser request:\n" + .query
  ' "$scenario")
  claude -p "$SCENARIO_PROMPT" --output-format json \
    > "$SCENARIO_RESULTS_ROOT/$(basename "$scenario")"
  jq '{expected_behavior, success_criteria}' "$scenario"
  jq -r '.result // .content // .' "$SCENARIO_RESULTS_ROOT/$(basename "$scenario")"
done
```

For each response, grade every `expected_behavior` and `success_criteria` item from concrete response evidence. A missing criterion is a failure. Before the branch is pushed, fix any in-scope skill/scenario, stage the fix together with any release-record update, run `git commit --amend --no-edit` so the 1.9.1 bump still contains every shipped skill change, and rerun the full acceptance sequence.

- [ ] **Step 5: Push the feature ref and run the real workflow acceptance test**

Run:

```bash
FEATURE_BRANCH=$(git branch --show-current)
test -n "$FEATURE_BRANCH"
test "$FEATURE_BRANCH" != "trunk"
git push -u origin "$FEATURE_BRANCH"
BEFORE_RUN_ID=$(gh run list --workflow ai-skill-maintenance.yml --branch "$FEATURE_BRANCH" --event workflow_dispatch --limit 1 --json databaseId --jq '.[0].databaseId // 0')
gh workflow run ai-skill-maintenance.yml --ref "$FEATURE_BRANCH" -f force=true -f dry_run=true
for attempt in {1..30}; do
  RUN_ID=$(gh run list --workflow ai-skill-maintenance.yml --branch "$FEATURE_BRANCH" --event workflow_dispatch --limit 1 --json databaseId --jq '.[0].databaseId // 0')
  if [ "$RUN_ID" != "0" ] && [ "$RUN_ID" != "$BEFORE_RUN_ID" ]; then
    break
  fi
  sleep 2
done
test -n "$RUN_ID"
test "$RUN_ID" != "0"
test "$RUN_ID" != "$BEFORE_RUN_ID"
gh run watch "$RUN_ID" --exit-status
gh run view "$RUN_ID" --json conclusion,jobs,url
gh run view "$RUN_ID" --log
```

Expected: `refresh-indices` succeeds; `generate-updates` reruns the updater and passes the state-hash comparison; missing AI configuration, if applicable, is reported as a redacted advisory skip rather than a workflow failure; no generated-skill PR job exists.

- [ ] **Step 6: Request independent review and resolve findings**

Use `superpowers:requesting-code-review` with the merge base and exact head SHA. Ask the reviewer to verify the approved spec, all audit findings, workflow path semantics, release gates, source claims, and final diff. Fix every blocking or important in-scope finding with the same red-green discipline, then rerun Steps 1–5.

- [ ] **Step 7: Record final evidence**

Run:

```bash
git rev-parse HEAD
git log --oneline --decorate -12
git diff --check
git diff "$(git merge-base HEAD upstream/trunk)"..HEAD --stat
git status --short --branch
```

Expected: exact head SHA recorded, no whitespace errors, intended files only, and a clean branch. Report the live workflow URL, strict harness result, drift result, smoke result, skills-ref count (21), package/install result, behavioral scenario count (14), and independent-review disposition. Do not claim completion for any evidence tier that did not run.

---

## Finding-to-Task Coverage

| Finding | Task |
| --- | ---: |
| Artifact flattening and stale-index consumers | 1–2 |
| Duplicate schedules/branches and missing provider configuration | 2 |
| Unreachable generated-skill PR, shallow-history/token/CI/version-concurrency risk | 2 |
| Exact release pin, current notes, declaration completeness, broad drift skip, partial skills-ref | 3, 9 |
| Theme `style.css`, non-portable triage, tracked smoke result | 4 |
| 6.9/7.1 hooks, PHP/JS defaults, ready semantics, registration flag, MCP arity/serve, name regex, run route | 5 |
| Missing reference schema, capability form, `map_meta_cap`, shop-order cap, filtered enumeration | 6 |
| Nonexistent Core abilities, nullable file DTO, connector key clearing/auth normalization/provenance | 7 |
| Missing 20 hooks, preferred-model placement, retention semantics, gated source paths, stale 1.2 pin | 8 |
| Stale current audit and inaccurate skill inventory | 9 |
| Real workflow dispatch and complete acceptance evidence | 10 |

## Completion Gate

The remediation is complete only when Task 10 records a clean exact revision with all offline checks green, both independent refreshes producing the same state hash, the smoke run leaving the worktree clean, 21 source skills passing `skills-ref`, all 14 Core AI scenarios reviewed, the pushed `workflow_dispatch` passing, and independent review finding no unresolved blocker.
