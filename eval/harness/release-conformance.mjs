import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseWpGutenbergMapFromHtml } from "../../shared/scripts/upstream-index-lib.mjs";
import { CORE_AI_UPSTREAMS } from "../../shared/scripts/core-ai-upstreams.mjs";
import {
  normalizeWpVersionCheckPayload,
  normalizeGitHubReleases,
  normalizePackagistVersions,
  updateUpstreamIndicesFromPayloads,
} from "../../shared/scripts/update-upstream-indices.mjs";
import {
  collectUpstreamDrift,
  collectUpstreamDriftFromData,
  formatDriftJson,
  formatDriftMarkdown,
  getBlockingUpstreamFailures,
} from "../../shared/scripts/upstream-drift-lib.mjs";
import {
  buildUpstreamState,
  detectUpstreamChanges,
  getUpstreamStateHash,
  inspectConfiguration,
} from "../../shared/scripts/ai-generate-updates.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** Numeric version compare. String comparison ranks "7.0.10" below "7.0.4". */
function compareSemver(a, b) {
  const pa = String(a).split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function read(repoRoot, relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function readJson(repoRoot, relativePath) {
  return JSON.parse(read(repoRoot, relativePath));
}

const IMMEDIATE_UNWATCH_PATTERN = /\}\s*\);\s*(?:\/\/[^\r\n]*\r?\n)?\s*unwatch\(\);/;

export function requireIncludes(repoRoot, relativePath, expected) {
  const content = read(repoRoot, relativePath);
  for (const value of expected) {
    assert(content.includes(value), `${relativePath} must include: ${value}`);
  }
}

export function requireExcludes(repoRoot, relativePath, forbidden) {
  const content = read(repoRoot, relativePath);
  for (const value of forbidden) {
    assert(!content.includes(value), `${relativePath} must not include: ${value}`);
  }
}

export function requireNoMatch(repoRoot, relativePath, pattern, message) {
  const content = read(repoRoot, relativePath);
  assert(!pattern.test(content), `${relativePath} ${message}`);
}

const PLUGIN_MANIFEST = ".claude-plugin/plugin.json";
const MARKETPLACE_MANIFEST = ".claude-plugin/marketplace.json";

function git(repoRoot, args) {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

/**
 * Marketplace consumers only receive an update when the resolved plugin version
 * changes. Because `plugin.json` declares an explicit `version`, that string is
 * the update signal — pushing commits without bumping it leaves every installed
 * copy pinned, and `/plugin update` reports "already at the latest version".
 *
 * Fail when `skills/` has moved since the commit that last changed the version,
 * so the bump lands in the same change as the content it ships.
 *
 * https://code.claude.com/docs/en/plugins-reference#version-management
 */
export function assertPluginVersionFresh(repoRoot) {
  // Requires real history: shallow clones and source tarballs cannot answer this.
  if (git(repoRoot, ["rev-parse", "--is-inside-work-tree"]) !== "true") return;
  if (git(repoRoot, ["rev-parse", "--is-shallow-repository"]) === "true") return;

  // -G, not -S: -S counts occurrences of the string, so changing "1.1.0" to
  // "1.2.0" leaves the count of `"version"` at one and the bump goes unseen.
  const lastBump = git(repoRoot, ["log", "-1", "--format=%H", "-G", '"version":', "--", PLUGIN_MANIFEST]);
  if (!lastBump) return;

  const changed = git(repoRoot, ["diff", "--name-only", `${lastBump}..HEAD`, "--", "skills/"]);
  if (changed === null || changed === "") return;

  const files = changed.split("\n").filter(Boolean);
  throw new Error(
    [
      `${files.length} file(s) under skills/ changed since the last ${PLUGIN_MANIFEST} version bump (${lastBump.slice(0, 7)}).`,
      `Marketplace users stay pinned to the current version and will not receive them.`,
      `Bump "version" in ${PLUGIN_MANIFEST} and .claude-plugin/marketplace.json in this change.`,
      `Changed: ${files.slice(0, 5).join(", ")}${files.length > 5 ? `, +${files.length - 5} more` : ""}`,
    ].join(" ")
  );
}

/**
 * Keep the marketplace catalog entry's version in step with the plugin manifest.
 *
 * `assertPluginVersionFresh` above only reads `plugin.json` — it tells you to
 * bump both files, but nothing checks that you did. So the catalog entry can
 * silently keep advertising the previous version while `plugin.json` moves on,
 * and a marketplace consumer reading the catalog never learns an update exists.
 * That is the same failure the freshness gate exists to prevent, one file over.
 *
 * A catalog entry that omits `version` resolves it from `plugin.json` and can
 * never drift, so only a declared version is checked.
 */
export function assertMarketplaceVersionMatches(repoRoot) {
  const plugin = readJson(repoRoot, PLUGIN_MANIFEST);
  const marketplace = readJson(repoRoot, MARKETPLACE_MANIFEST);

  assert(
    typeof plugin.version === "string" && plugin.version !== "",
    `${PLUGIN_MANIFEST} must declare a non-empty "version" string`
  );
  assert(
    Array.isArray(marketplace.plugins),
    `${MARKETPLACE_MANIFEST} must declare a "plugins" array`
  );

  // Join on name: the catalog may list plugins this repo does not own.
  const entry = marketplace.plugins.find((p) => p && p.name === plugin.name);
  assert(
    entry,
    `${MARKETPLACE_MANIFEST} has no entry named "${plugin.name}" — the plugin this repo ships is not listed in its own marketplace catalog.`
  );

  if (entry.version === undefined) return;

  assert(
    entry.version === plugin.version,
    `${MARKETPLACE_MANIFEST} lists "${plugin.name}" at version ${entry.version} but ${PLUGIN_MANIFEST} declares ${plugin.version}. Bump both together, or drop "version" from the catalog entry so it resolves from the manifest.`
  );
}

/**
 * An exact release pin goes stale the moment the next release ships and then
 * blocks it. Assert a floor, manifest equality, and notes for the *current*
 * version instead, so the gate keeps working across releases.
 */
export function assertReleaseVersionAtLeast(actual, floor = "1.9.0") {
  assert(
    compareSemver(actual, floor) >= 0,
    `Release version ${actual} must be at least ${floor}`
  );
}

/**
 * The floor advances with the repository instead of staying a literal.
 *
 * A static floor plus `assertPluginVersionFresh` enforces "a bump accompanies
 * new content" but not "the version never goes backwards": that gate resolves
 * its baseline from the last commit that *changed* the version line in either
 * direction, so a commit lowering the version resets the baseline to itself and
 * the skills/ diff comes back empty. Deriving the floor from the release notes
 * already in the tree closes that, and keeps advancing on its own.
 */
export function highestReleaseNotesVersion(repoRoot) {
  const versions = fs
    .readdirSync(path.join(repoRoot, "docs"))
    .map((name) => name.match(/^release-notes-(\d+(?:\.\d+)*)\.md$/)?.[1])
    .filter(Boolean)
    .sort(compareSemver);
  return versions.at(-1) ?? "1.9.0";
}

export function assertReleaseFloor(repoRoot) {
  assertReleaseVersionAtLeast("1.9.1", "1.9.0");
  expectThrow(
    () => assertReleaseVersionAtLeast("1.8.9", "1.9.0"),
    "A version below the release floor must fail"
  );

  const plugin = readJson(repoRoot, PLUGIN_MANIFEST);
  const marketplace = readJson(repoRoot, MARKETPLACE_MANIFEST);
  const entry = marketplace.plugins?.find((candidate) => candidate?.name === plugin.name);

  assertReleaseVersionAtLeast(plugin.version, highestReleaseNotesVersion(repoRoot));
  assert(
    entry?.version === plugin.version,
    `${MARKETPLACE_MANIFEST} must list "${plugin.name}" at version ${plugin.version}`
  );

  const notes = `docs/release-notes-${plugin.version}.md`;
  assert(fs.existsSync(path.join(repoRoot, notes)), `${notes} must exist for release ${plugin.version}`);
}

export function assertCoreAiUpstreamRegistry(repoRoot) {
  const requiredIds = new Set([
    "wordpress-core",
    "gutenberg",
    "wordpress-ai-plugin",
    "mcp-adapter",
    "php-ai-client",
    "wp-ai-client",
    "anthropic-provider",
    "google-provider",
    "openai-provider",
    "wp-gutenberg-version-map",
  ]);
  const ids = new Set();
  const files = new Set();
  const sources = new Set();

  for (const upstream of CORE_AI_UPSTREAMS) {
    assert(requiredIds.delete(upstream.id), `Unexpected or duplicate Core AI upstream id: ${upstream.id}`);
    assert(!ids.has(upstream.id), `Duplicate Core AI upstream id: ${upstream.id}`);
    assert(!files.has(upstream.indexFile), `Duplicate Core AI upstream index: ${upstream.indexFile}`);
    assert(!sources.has(upstream.source), `Duplicate Core AI upstream source: ${upstream.source}`);
    ids.add(upstream.id);
    files.add(upstream.indexFile);
    sources.add(upstream.source);

    assert(Array.isArray(upstream.affectedSkills) && upstream.affectedSkills.length > 0, `${upstream.id} must affect at least one skill`);
    for (const skill of upstream.affectedSkills) {
      assert(fs.existsSync(path.join(repoRoot, "skills", skill, "SKILL.md")), `${upstream.id} names unknown skill: ${skill}`);
    }
    assert(Array.isArray(upstream.declarations), `${upstream.id} must declare a declarations array`);
    for (const declaration of upstream.declarations) {
      assert(upstream.affectedSkills.includes(declaration.skill), `${upstream.id} declaration names an unaffected skill: ${declaration.skill}`);
      assert(typeof declaration.label === "string" && declaration.label !== "", `${upstream.id} declaration must have a label`);
      assert(["minor", "patch"].includes(declaration.granularity), `${upstream.id} declaration has invalid granularity`);
    }

    // An affected skill with no declaration is invisible to the drift gate: the
    // index can advance past it forever and nothing turns red. The WP/Gutenberg
    // HTML map is exempt because it has no single release version to declare.
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

    const index = readJson(repoRoot, upstream.indexFile);
    assert(index.source === upstream.source, `${upstream.indexFile} source must match the Core AI registry`);
    if (upstream.sourceType === "wordpress-version-check") {
      assert(typeof index.latest === "string" && /^\d+(?:\.\d+)+$/.test(index.latest), `${upstream.indexFile} must have a parseable latest version`);
    } else if (upstream.sourceType === "html-version-map") {
      assert(Array.isArray(index.rows) && index.rows.length > 0, `${upstream.indexFile} must have mapping rows`);
    } else {
      assert(typeof index.latest?.tag === "string" && /^v?\d+(?:\.\d+)+$/.test(index.latest.tag), `${upstream.indexFile} must have a parseable latest tag`);
    }
  }
  assert(requiredIds.size === 0, `Missing Core AI upstream ids: ${[...requiredIds].join(", ")}`);
  requireIncludes(repoRoot, "eval/scenarios/upstream-sync-indices.json", [
    "all ten Core AI upstreams",
    "wp-ai-client-releases.json",
    "ai-provider-anthropic-releases.json",
    "ai-provider-google-releases.json",
    "ai-provider-openai-releases.json",
    "before writing any index",
  ]);
  requireIncludes(repoRoot, "shared/scripts/check-upstream-drift.mjs", [
    "collectUpstreamDrift",
    "formatDriftMarkdown",
    "formatDriftJson",
    '"--format"',
    '"--allow-drift"',
    '"--help"',
  ]);
  requireExcludes(repoRoot, "shared/scripts/check-upstream-drift.mjs", [
    "const CHECKS",
    "gate above already covers",
  ]);
  const driftHelp = spawnSync(
    "node",
    [path.join(repoRoot, "shared/scripts/check-upstream-drift.mjs"), "--help"],
    { cwd: repoRoot, encoding: "utf8" }
  );
  assert(driftHelp.status === 0 && driftHelp.stdout.includes("--allow-drift"), "Drift CLI --help must succeed");
  const invalidDriftArgument = spawnSync(
    "node",
    [path.join(repoRoot, "shared/scripts/check-upstream-drift.mjs"), "--unknown-option"],
    { cwd: repoRoot, encoding: "utf8" }
  );
  assert(invalidDriftArgument.status === 2, "Unknown drift CLI arguments must exit 2");
  assert(!invalidDriftArgument.stderr.includes("at file:"), "Drift CLI usage errors must not print a stack trace");

  // A hand-maintained list of skills-ref targets silently stops covering every
  // skill added after it was written. Enumerate the directory instead.
  const ci = read(repoRoot, ".github/workflows/ci.yml");
  assert(
    ci.includes("for skill_dir in skills/*; do") &&
      ci.includes('test -d "$skill_dir" || continue') &&
      ci.includes('skills-ref validate "$skill_dir"'),
    "CI must validate every skills/* directory by enumeration"
  );
  assert(
    !/skills-ref validate skills\//.test(ci),
    "CI must not hard-code individual skills-ref validate targets"
  );
}

function expectThrow(callback, message) {
  let error = null;
  try {
    callback();
  } catch (caught) {
    error = caught;
  }
  assert(error, message);
}

export function assertUpstreamNormalization(repoRoot) {
  expectThrow(
    () => normalizeGitHubReleases({ message: "rate limited" }),
    "GitHub error objects must fail normalization"
  );
  expectThrow(() => normalizeGitHubReleases([]), "Empty GitHub release arrays must fail normalization");
  expectThrow(
    () => normalizePackagistVersions({ packages: {} }, "wordpress/php-ai-client"),
    "Missing Packagist packages must fail normalization"
  );
  expectThrow(
    () => normalizeWpVersionCheckPayload({ offers: [] }),
    "Empty WordPress version-check offers must fail normalization"
  );

  const releases = normalizeGitHubReleases([
    { tag_name: "v1.0.9", name: "older", published_at: "2026-01-01T00:00:00Z", html_url: "https://example.test/1.0.9" },
    { tag_name: "v2.0.0", draft: true, name: "draft" },
    { tag_name: "v1.1.0-beta.1", prerelease: true, name: "prerelease" },
    { tag_name: "v1.0.10", name: "newer", published_at: "2026-01-02T00:00:00Z", html_url: "https://example.test/1.0.10" },
  ]);
  assert(releases.latest.tag === "v1.0.10", "GitHub releases must sort numeric versions newest-first");
  assert(
    releases.latest.name === "newer" &&
      releases.latest.publishedAt === "2026-01-02T00:00:00Z" &&
      releases.latest.url === "https://example.test/1.0.10",
    "GitHub release tags, names, dates, and URLs must survive normalization"
  );
  assert(releases.recent.length === 2, "GitHub drafts and prereleases must be excluded");

  const wordpress = normalizeWpVersionCheckPayload({
    offers: [{ version: "7.0.4" }, { version: "7.0.10" }],
  });
  assert(wordpress.latest === "7.0.10", "WordPress versions must sort numerically");

  const packagist = normalizePackagistVersions(
    {
      packages: {
        "wordpress/php-ai-client": [
          { version: "1.4.9", time: "2026-01-01T00:00:00+00:00" },
          { version: "dev-trunk", time: "2026-01-03T00:00:00+00:00" },
          { version: "1.4.10", time: "2026-01-02T00:00:00+00:00" },
        ],
      },
    },
    "wordpress/php-ai-client",
    CORE_AI_UPSTREAMS.find((upstream) => upstream.id === "php-ai-client").releaseUrlBase
  );
  assert(packagist.latest.tag === "1.4.10", "Packagist versions must sort numerically");
  assert(packagist.latest.publishedAt.endsWith("Z"), "Packagist UTC dates must normalize to Z");

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

  const registry = [
    { id: "good", indexFile: "good.json", source: "https://example.test/good", sourceType: "github-releases" },
    { id: "bad", indexFile: "bad.json", source: "https://example.test/bad", sourceType: "github-releases" },
  ];
  const payloads = new Map([
    ["good", [{ tag_name: "1.0.0", html_url: "https://example.test/good/1.0.0" }]],
    ["bad", { message: "upstream error" }],
  ]);
  let writes = 0;
  expectThrow(
    () => updateUpstreamIndicesFromPayloads(repoRoot, payloads, { registry, writeJsonImpl: () => { writes += 1; } }),
    "One invalid source must fail the update"
  );
  assert(writes === 0, "One invalid source must leave every index untouched");

  requireIncludes(repoRoot, "shared/scripts/update-upstream-indices.mjs", ["CORE_AI_UPSTREAMS"]);
  requireExcludes(repoRoot, "shared/scripts/update-upstream-indices.mjs", ["const SOURCES"]);
  requireIncludes(repoRoot, "shared/scripts/ai-generate-updates.mjs", ["CORE_AI_UPSTREAMS"]);
  requireExcludes(repoRoot, "shared/scripts/ai-generate-updates.mjs", [
    'path.join(REFERENCES_DIR, "wordpress-core-versions.json")',
    'path.join(REFERENCES_DIR, "gutenberg-releases.json")',
    'path.join(REFERENCES_DIR, "wp-gutenberg-version-map.json")',
    "claude-sonnet-4-20250514",
    '.toString("base64").slice(0, 16)',
  ]);
  requireIncludes(repoRoot, "shared/scripts/ai-generate-updates.mjs", [
    'from "node:crypto"',
    'createHash("sha256")',
    "ANTHROPIC_MODEL",
    "--check-config",
    "tagged executable source",
    "taggedFilesInspected",
    "reviewRecommendation",
    "source-evidenced",
  ]);
  requireIncludes(repoRoot, ".github/workflows/ai-skill-maintenance.yml", [
    "ANTHROPIC_MODEL: ${{ vars.ANTHROPIC_MODEL }}",
    "continue-on-error: true",
    "generation_outcome",
    "generator-result.json",
    "node eval/harness/run.mjs --skip-upstream-drift",
    "--format markdown --allow-drift",
    "AI generation is advisory",
    "actions/upload-artifact@v4",
  ]);
  requireIncludes(repoRoot, ".github/workflows/upstream-sync.yml", [
    "node eval/harness/run.mjs --skip-upstream-drift",
    "--format markdown --allow-drift",
    "core-ai-upstreams.mjs --format markdown",
    "upstream-drift.md",
    "actions/upload-artifact@v4",
    "secrets.UPSTREAM_SYNC_TOKEN || secrets.GITHUB_TOKEN",
    "Normal pull_request workflows may not run recursively",
  ]);
  requireIncludes(repoRoot, "docs/upstream-sync.md", [
    "CORE_AI_UPSTREAMS",
    "nine release sources",
    "deterministic",
    "advisory",
    "UPSTREAM_SYNC_TOKEN",
    "fine-grained",
    "rotate",
    "--skip-upstream-drift",
    "red drift",
  ]);
}

export function assertIndependentUpstreamDrift() {
  const baselines = {
    "wordpress-core": "7.1",
    gutenberg: "23.8.0",
    "wordpress-ai-plugin": "1.3.0",
    "mcp-adapter": "0.6.1",
    "php-ai-client": "1.4.0",
    "wp-ai-client": "0.4.0",
    "anthropic-provider": "1.0.4",
    "google-provider": "1.1.1",
    "openai-provider": "1.1.0",
  };
  const indices = Object.fromEntries(
    CORE_AI_UPSTREAMS.map((upstream) => [
      upstream.id,
      upstream.sourceType === "wordpress-version-check"
        ? { latest: baselines[upstream.id] }
        : upstream.sourceType === "html-version-map"
          ? { rows: [{ wordpress: "7.1.X", gutenberg: "23.6" }] }
          : { latest: { tag: baselines[upstream.id] } },
    ])
  );
  const markersBySkill = {};
  for (const upstream of CORE_AI_UPSTREAMS) {
    for (const declaration of upstream.declarations) {
      (markersBySkill[declaration.skill] ??= []).push(
        `${declaration.label}: ${baselines[upstream.id]}`
      );
    }
  }
  const skillTexts = Object.fromEntries(
    Object.entries(markersBySkill).map(([skill, markers]) => [
      skill,
      `---\nname: ${skill}\ncompatibility: "${markers.join("; ")}"\n---\n`,
    ])
  );

  const clean = collectUpstreamDriftFromData(indices, skillTexts, CORE_AI_UPSTREAMS);
  assert(clean.failures.length === 0, "Aligned Core AI drift fixtures must pass");

  // Filesystem collection must read every skills/*/SKILL.md, not only the ones
  // a declaration names. Otherwise a release marker added to an undeclared
  // skill is never checked and never reported as unregistered.
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

  // `--skip-upstream-drift` exists for exactly one expected condition: the
  // index refreshed ahead of a skill marker. Every other failure code is a
  // defect in the registry or a skill file and must stay blocking.
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
  assert(
    getBlockingUpstreamFailures(mixedFailures).length === 5,
    "Without the skip flag every drift failure stays blocking"
  );

  const driftedSkills = (upstreamId, version, texts = skillTexts) => {
    const fixture = structuredClone(indices);
    const upstream = CORE_AI_UPSTREAMS.find((candidate) => candidate.id === upstreamId);
    if (upstream.sourceType === "wordpress-version-check") fixture[upstreamId].latest = version;
    else fixture[upstreamId].latest.tag = version;
    return collectUpstreamDriftFromData(fixture, texts, CORE_AI_UPSTREAMS).failures
      .filter((failure) => failure.upstreamId === upstreamId)
      .map((failure) => failure.skill)
      .sort();
  };

  const coreTexts = { ...skillTexts };
  coreTexts["wp-abilities-api"] = coreTexts["wp-abilities-api"].replace(
    "WordPress Core verified through: 7.1",
    "WordPress Core verified through: 7.2"
  );
  assert(
    JSON.stringify(driftedSkills("wordpress-core", "7.2", coreTexts)) ===
      JSON.stringify(["wp-abilities-audit", "wp-abilities-verify", "wp-ai-client", "wp-ai-connectors", "wp-ai-plugin"]),
    "A current wp-abilities-api Core marker must not cover the other five Core AI skills"
  );
  assert(
    JSON.stringify(driftedSkills("mcp-adapter", "0.6.2")) ===
      JSON.stringify(["wp-abilities-api", "wp-abilities-audit", "wp-abilities-verify", "wp-ai-plugin"]),
    "MCP Adapter drift must reach every exposure consumer"
  );
  assert(
    JSON.stringify(driftedSkills("php-ai-client", "1.4.1")) ===
      JSON.stringify(["wp-ai-client", "wp-ai-connectors", "wp-ai-plugin"]),
    "PHP AI Client drift must reach every consumer"
  );
  assert(JSON.stringify(driftedSkills("wp-ai-client", "0.4.1")) === JSON.stringify(["wp-ai-client"]), "WP AI Client drift must be independent");
  assert(JSON.stringify(driftedSkills("wordpress-ai-plugin", "1.3.1")) === JSON.stringify(["wp-ai-plugin"]), "AI plugin drift must be independent");
  assert(
    JSON.stringify(driftedSkills("gutenberg", "23.9.0")) ===
      JSON.stringify(["wp-abilities-api", "wp-ai-connectors", "wp-ai-plugin"]),
    "Gutenberg drift must reach Abilities, connector, and Knowledge consumers"
  );
  for (const [id, version] of [
    ["anthropic-provider", "1.0.5"],
    ["google-provider", "1.1.2"],
    ["openai-provider", "1.1.1"],
  ]) {
    assert(JSON.stringify(driftedSkills(id, version)) === JSON.stringify(["wp-ai-connectors"]), `${id} drift must be independent`);
  }

  assert(formatDriftMarkdown(clean).includes("| Upstream | Latest | Skill |"), "Markdown drift report must contain the complete table");
  assert(JSON.parse(formatDriftJson(clean)).checks.length === clean.checks.length, "JSON drift report must preserve every check");
}

export function assertCompleteMaintenanceState() {
  const baselines = {
    "wordpress-core": "7.1",
    gutenberg: "23.8.0",
    "wordpress-ai-plugin": "1.3.0",
    "mcp-adapter": "0.6.1",
    "php-ai-client": "1.4.0",
    "wp-ai-client": "0.4.0",
    "anthropic-provider": "1.0.4",
    "google-provider": "1.1.1",
    "openai-provider": "1.1.0",
  };
  const nextVersions = {
    "wordpress-core": "7.2",
    gutenberg: "23.8.1",
    "wordpress-ai-plugin": "1.3.1",
    "mcp-adapter": "0.6.2",
    "php-ai-client": "1.4.1",
    "wp-ai-client": "0.4.1",
    "anthropic-provider": "1.0.5",
    "google-provider": "1.1.2",
    "openai-provider": "1.1.1",
  };
  const indices = Object.fromEntries(
    CORE_AI_UPSTREAMS.map((upstream) => [
      upstream.id,
      upstream.sourceType === "wordpress-version-check"
        ? { latest: baselines[upstream.id] }
        : upstream.sourceType === "html-version-map"
          ? { rows: [{ wordpress: "7.1.X", gutenberg: "23.6" }] }
          : { latest: { tag: baselines[upstream.id], url: `https://example.test/${upstream.id}/${baselines[upstream.id]}` } },
    ])
  );
  const baseline = getUpstreamStateHash(indices, CORE_AI_UPSTREAMS);
  assert(buildUpstreamState(indices, CORE_AI_UPSTREAMS).schemaVersion === 3, "Maintenance state must use schema version 3");
  assert(/^[a-f0-9]{64}$/.test(baseline.hash), "Maintenance state must use a SHA-256 hash");
  const reorderedIndices = structuredClone(indices);
  const gutenbergLatest = reorderedIndices.gutenberg.latest;
  reorderedIndices.gutenberg.latest = { url: gutenbergLatest.url, tag: gutenbergLatest.tag };
  assert(
    getUpstreamStateHash(reorderedIndices, CORE_AI_UPSTREAMS).hash === baseline.hash,
    "Equivalent index objects must hash identically regardless of key insertion order"
  );

  for (const upstream of CORE_AI_UPSTREAMS.filter((candidate) => candidate.sourceType !== "html-version-map")) {
    const changedIndices = structuredClone(indices);
    if (upstream.sourceType === "wordpress-version-check") changedIndices[upstream.id].latest = nextVersions[upstream.id];
    else changedIndices[upstream.id].latest.tag = nextVersions[upstream.id];
    const changedState = getUpstreamStateHash(changedIndices, CORE_AI_UPSTREAMS);
    assert(changedState.hash !== baseline.hash, `${upstream.id} must change the maintenance state hash`);
    const changes = detectUpstreamChanges(
      { hash: baseline.hash, state: baseline.state },
      changedState,
      changedIndices,
      CORE_AI_UPSTREAMS
    );
    const change = changes.find((candidate) => candidate.sourceId === upstream.id);
    assert(change, `${upstream.id} must produce an independent maintenance change`);
    assert(
      JSON.stringify([...change.affectedSkills].sort()) === JSON.stringify([...upstream.affectedSkills].sort()),
      `${upstream.id} must use registry-declared affected skills`
    );
  }

  const core = CORE_AI_UPSTREAMS.find((upstream) => upstream.id === "wordpress-core");
  assert(core.affectedSkills.length === 6, "A Core release must reach all six Core AI skills");
  const changedMap = structuredClone(indices);
  changedMap["wp-gutenberg-version-map"].rows[0].gutenberg = "23.7";
  const changedMapState = getUpstreamStateHash(changedMap, CORE_AI_UPSTREAMS);
  assert(
    changedMapState.hash !== baseline.hash,
    "A same-count version-map row replacement must change the maintenance state hash"
  );
  const mapChanges = detectUpstreamChanges(
    { hash: baseline.hash, state: baseline.state },
    changedMapState,
    changedMap,
    CORE_AI_UPSTREAMS
  );
  assert(
    mapChanges.some((change) => change.sourceId === "wp-gutenberg-version-map"),
    "A same-count version-map row replacement must produce a maintenance change"
  );

  const maintenanceRelease = structuredClone(indices);
  maintenanceRelease["wordpress-core"].recent = ["7.1", "7.0.5"];
  const maintenanceState = getUpstreamStateHash(maintenanceRelease, CORE_AI_UPSTREAMS);
  assert(
    maintenanceState.hash !== baseline.hash,
    "A non-latest maintenance release must change the maintenance state hash"
  );
  const maintenanceChanges = detectUpstreamChanges(
    { hash: baseline.hash, state: baseline.state },
    maintenanceState,
    maintenanceRelease,
    CORE_AI_UPSTREAMS
  );
  const maintenanceChange = maintenanceChanges.find((change) => change.sourceId === "wordpress-core");
  assert(
    maintenanceChange?.type === "upstream-index-update" &&
      maintenanceChange.oldVersion === "7.1" &&
      maintenanceChange.newVersion === "7.1",
    "A non-latest maintenance release must produce a same-version upstream index change"
  );
  const migration = detectUpstreamChanges(
    { hash: "YWJjZGVmZ2hpamts", state: { wpLatest: "7.0" } },
    baseline,
    indices,
    CORE_AI_UPSTREAMS
  );
  assert(migration[0]?.type === "state-schema-migration", "Legacy 16-character state hashes must migrate once");
  const schemaMigration = detectUpstreamChanges(
    { hash: baseline.hash, state: { ...baseline.state, schemaVersion: 2 } },
    baseline,
    indices,
    CORE_AI_UPSTREAMS
  );
  assert(schemaMigration[0]?.type === "state-schema-migration", "Schema version 2 state must migrate once");

  const missing = inspectConfiguration({});
  assert(!missing.configured && missing.category === "missing-api-key", "Config checks must classify a missing API key");
  const configured = inspectConfiguration({ ANTHROPIC_API_KEY: "test-only", ANTHROPIC_MODEL: "test-model" });
  assert(configured.configured && !JSON.stringify(configured).includes("test-only"), "Config checks must never expose the API key");
}

/**
 * The AI maintenance workflow is advisory. It may never become a second
 * scheduled index owner, may never hand a mutated workspace between jobs, and
 * may never open a skill PR while `taggedFiles` is always empty — the evidence
 * gate in `ai-generate-updates.mjs` can never be satisfied, so such a job is
 * unreachable by construction. Each consuming job instead reruns the
 * deterministic updater and compares the canonical upstream state hash, so a
 * release that lands mid-run fails closed instead of shipping a mixed snapshot.
 */
/**
 * Repository-local runtime hygiene.
 *
 * Three defects share one root cause: a helper that only works when it happens
 * to be run from this checkout. The AI Client detector ignored theme
 * `style.css` headers, so a block theme declaring `Requires at least: 7.1`
 * reported no floor at all; a skill told readers to run a path that exists only
 * here; and the Playground smoke wrote its result into the working tree.
 */
export function assertLocalRuntimeHygiene(repoRoot) {
  const themeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wp-ai-client-theme-"));
  fs.writeFileSync(
    path.join(themeRoot, "style.css"),
    "/*\nTheme Name: Detector Fixture\nRequires at least: 7.1\n*/\n",
    "utf8"
  );
  // A stylesheet with no `Theme Name:` is not a theme stylesheet and must not
  // contribute a floor — otherwise a plugin's admin CSS could decide the answer.
  fs.mkdirSync(path.join(themeRoot, "assets"), { recursive: true });
  fs.writeFileSync(
    path.join(themeRoot, "assets", "style.css"),
    "/*\nRequires at least: 4.0\n*/\n",
    "utf8"
  );
  const detector = spawnSync(
    "node",
    [path.join(repoRoot, "skills/wp-ai-client/scripts/detect_ai_client.mjs"), "--root", themeRoot],
    { encoding: "utf8" }
  );
  fs.rmSync(themeRoot, { recursive: true, force: true });
  assert(detector.status === 0, "AI Client detector must exit successfully on a theme fixture");
  const detectorReport = JSON.parse(detector.stdout);
  assert(detectorReport.wp_floor === "7.1", "Theme style.css must set the detected WordPress floor");
  assert(detectorReport.supports_ai_client === true, "A theme requiring 7.1 must support the Core AI Client path");

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
  // Requires real history, like assertPluginVersionFresh: a source tarball has
  // no git, and `git()` returns null there — which is not the same as "tracked".
  if (git(repoRoot, ["rev-parse", "--is-inside-work-tree"]) === "true") {
    assert(
      git(repoRoot, ["ls-files", "--", "eval/playground/ai-plugin-smoke/mu-plugins/result.json"]) === "",
      "Runtime smoke output must not be tracked"
    );
  }
}

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

/**
 * Abilities API guidance that must stay exact.
 *
 * Each string below marks a place where a plausible-but-wrong answer costs a
 * day: the 6.9-vs-7.1 hook split (an arity mistake is a site-wide fatal), the
 * PHP/AJV divergence on schema defaults, what awaiting `ready` actually proves,
 * the MCP validation filter's variable arity, and Core's ability-name regex.
 */
export function assertAbilitiesApiPrecision(repoRoot) {
  requireIncludes(repoRoot, "skills/wp-abilities-api/SKILL.md", [
    "wp_ability_normalize_input",
    "wp_ability_execute_result",
    "wp_before_execute_ability and wp_after_execute_ability predate 7.1",
  ]);

  // Anchor the split to the frontmatter description, not just to the file.
  // The description is the routing surface an agent reads before the body is
  // ever loaded, and `requireIncludes` reads the whole file — so body prose
  // alone would keep the check green while the description reintroduced the
  // exact defect (a 7.1 arity written against a 6.9 action is a fatal).
  const abilitiesFrontmatter =
    read(repoRoot, "skills/wp-abilities-api/SKILL.md").match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
  const abilitiesDescription = abilitiesFrontmatter.match(/^description:\s*(.*)$/m)?.[1] ?? "";
  const sevenNewHooks = abilitiesDescription.match(/new in WP 7\.1 \(([^)]*)\)/)?.[1] ?? "";
  assert(
    sevenNewHooks !== "",
    "wp-abilities-api description must name the hooks that are new in WP 7.1"
  );
  for (const hook of [
    "wp_ability_invoked",
    "wp_pre_execute_ability",
    "wp_ability_normalize_input",
    "wp_ability_validate_input",
    "wp_ability_permission_result",
    "wp_ability_execute_result",
    "wp_ability_validate_output",
  ]) {
    assert(
      sevenNewHooks.includes(hook),
      `wp-abilities-api description must list ${hook} among the 7.1 additions`
    );
  }
  for (const older of ["wp_before_execute_ability", "wp_after_execute_ability"]) {
    assert(
      !sevenNewHooks.includes(older),
      `wp-abilities-api description must not list the 6.9 action ${older} among the 7.1 additions`
    );
    assert(
      abilitiesDescription.includes(older),
      `wp-abilities-api description must still name the 6.9 action ${older}`
    );
  }
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

/**
 * Audit and verification contracts that must not be ambiguous.
 *
 * An audit lint that grades the wrong way is worse than no lint: it signs off a
 * reference ability that cannot be executed, or reports "registration is broken"
 * for an ability that registered fine and was filtered out of the ecosystem view.
 */
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

/**
 * AI Client and connector examples that must be runnable and honest.
 *
 * A copyable example naming an ability Core does not register fails on a stock
 * install; one that reads `getDataUri()` unconditionally breaks the moment a
 * provider returns a remote URL; and connector guidance that understates
 * write-time credential loss sends implementers hunting the wrong bug.
 */
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

/**
 * WordPress/ai 1.3.0 extension surface.
 *
 * The hook inventory is the skill's load-bearing content: an extender who
 * cannot find a hook writes a worse integration around it. Every name below was
 * read off an `apply_filters()` call site in tag 1.3.0.
 *
 * `wpai_request_log_tokens` is in this list deliberately. The 2026-08-25 audit
 * classified it as a data key and put the request-log filter count at four; the
 * tag has it as a real filter at `Logging/Log_Data_Extractor.php:257`, so the
 * count is five. Executable source wins over the audit note.
 */
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
    "wpai_request_log_tokens",
  ];
  requireIncludes(repoRoot, "skills/wp-ai-plugin/references/hooks-and-filters.md", requiredHooks);
  requireIncludes(repoRoot, "skills/wp-ai-plugin/references/hooks-and-filters.md", [
    "0 to retain forever",
  ]);
  // Match to the next `### ` heading, or to end-of-file if that section ever
  // becomes the last one — an empty slice would silently pass the loop below.
  const preferredSection = hooksReference.match(
    /### Preferred model selection[\s\S]*?(?=\n### |$)/
  )?.[0] ?? "";
  assert(
    preferredSection !== "",
    "hooks-and-filters.md must have a '### Preferred model selection' section"
  );
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

/**
 * The 1.9.1 remediation record.
 *
 * A release that corrects guidance has to say what it corrected, and the audit
 * that superseded the previous one has to say so at the top of the previous
 * one — otherwise the stale document keeps being cited. The inventory check is
 * filesystem-backed because the last hand-maintained list drifted by seven
 * skills and grew a "planned" section readers used as an inventory.
 */
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

export function runReleaseConformance(repoRoot) {
  assertPluginVersionFresh(repoRoot);
  assertMarketplaceVersionMatches(repoRoot);
  assertReleaseFloor(repoRoot);
  assertUpstreamNormalization(repoRoot);
  assertIndependentUpstreamDrift();
  assertCompleteMaintenanceState();
  assertCoreAiUpstreamRegistry(repoRoot);
  assertAiMaintenanceWorkflow(repoRoot);
  assertLocalRuntimeHygiene(repoRoot);
  assertAbilitiesApiPrecision(repoRoot);
  assertAbilitiesAuditVerifyPrecision(repoRoot);
  assertAiClientConnectorPrecision(repoRoot);
  assertAiPluginPrecision(repoRoot);
  assertRemediationRelease191(repoRoot);
  assert(
    IMMEDIATE_UNWATCH_PATTERN.test("const unwatch = watch( () => { return cleanup; } );\n// Dispose later.\nunwatch();"),
    "Immediate-unwatch regression fixture must exercise the structural check"
  );
  const reversedHeaderFixture = `
    <table>
      <tr><th>Gutenberg Version</th><th>WordPress Version</th></tr>
      <tr><td>22.6</td><td>7.0.X</td></tr>
      <tr><td>21.9</td><td>6.9.X</td></tr>
    </table>`;
  const parsed = parseWpGutenbergMapFromHtml(reversedHeaderFixture);
  assert(parsed.rows.length === 2, "Version-map parser must return both rows");
  assert(
    parsed.rows[0].wordpress === "7.0.X" && parsed.rows[0].gutenberg === "22.6",
    "Version-map parser must map columns by header, not position"
  );
  assert(parsed.note === null, "A successful map parse must have note: null");

  let missingTableError = null;
  try {
    parseWpGutenbergMapFromHtml("<p>No mapping table</p>");
  } catch (error) {
    missingTableError = error;
  }
  assert(missingTableError, "Missing mapping data must throw");

  const core = readJson(repoRoot, "shared/references/wordpress-core-versions.json");
  const gutenberg = readJson(repoRoot, "shared/references/gutenberg-releases.json");
  const map = readJson(repoRoot, "shared/references/wp-gutenberg-version-map.json");
  // The core index tracks a moving upstream. Pinning an exact version here
  // guarantees the assertion goes stale and then blocks the very refresh it
  // exists to protect — which is how this index sat at 7.0.2 while WordPress
  // shipped 7.0.4. Assert shape and a floor instead, and leave "a new minor
  // shipped, go re-verify the skills" to the drift gate in
  // shared/scripts/check-upstream-drift.mjs, which reports it with the
  // context needed to act on it.
  const CORE_FLOOR = "7.0.4";
  assert(typeof core.latest === "string", "WordPress core index must have a latest version string");
  assert(
    Array.isArray(core.recent) && core.recent[0] === core.latest,
    "WordPress core index recent[] must be sorted newest-first and lead with latest"
  );
  assert(
    compareSemver(core.latest, CORE_FLOOR) >= 0,
    `WordPress latest must not regress below ${CORE_FLOOR} (found ${core.latest}) — refresh with shared/scripts/update-upstream-indices.mjs`
  );
  assert(
    core.recent.some((v) => v.startsWith("6.9.")),
    "WordPress recent must include the maintained 6.9 branch (the Abilities API floor)"
  );
  // Same reasoning as CORE_FLOOR above — this assertion was an exact pin at
  // v23.5.3 and did exactly what the comment predicts: the index refreshed to
  // v23.7.2 and the pin rejected it. The failure stayed hidden because
  // assertPluginVersionFresh() throws earlier in this function, so it only
  // surfaced once that gate was satisfied. Floor, not pin.
  const GUTENBERG_FLOOR = "23.5.3";
  assert(
    typeof gutenberg.latest?.tag === "string" && gutenberg.latest.tag.startsWith("v"),
    "Gutenberg index must have a latest.tag string in vX.Y.Z form"
  );
  assert(
    Array.isArray(gutenberg.recent) && gutenberg.recent[0]?.tag === gutenberg.latest.tag,
    "Gutenberg index recent[] must be sorted newest-first and lead with latest"
  );
  assert(
    compareSemver(gutenberg.latest.tag.replace(/^v/, ""), GUTENBERG_FLOOR) >= 0,
    `Gutenberg latest must not regress below v${GUTENBERG_FLOOR} (found ${gutenberg.latest.tag}) — refresh with shared/scripts/update-upstream-indices.mjs`
  );
  assert(map.note === null && map.rows.length > 0, "WP/Gutenberg map must be non-empty");
  assert(
    map.rows.some((row) => row.wordpress === "7.0.X" && row.gutenberg === "22.6"),
    "WP/Gutenberg map must include WordPress 7.0.X → Gutenberg 22.6"
  );

  requireIncludes(repoRoot, "README.md", [
    "--targets=antigravity",
    ".agents/skills/",
    "--targets=antigravity-global",
    "~/.gemini/antigravity/skills/",
  ]);
  requireIncludes(repoRoot, "docs/packaging.md", [
    "dist/antigravity/.agents/skills/*",
    "--targets=antigravity",
    "--targets=antigravity-global",
  ]);

  requireIncludes(repoRoot, "skills/blueprint/SKILL.md", [
    '"version": 2',
    '"blueprintMeta"',
    '"applicationOptions"',
    '"additionalStepsAfterExecution"',
    "references/v1-compatibility.md",
  ]);
  requireExcludes(repoRoot, "skills/blueprint/SKILL.md", [
    'Object = `{ username?, password? }`',
  ]);
  requireIncludes(repoRoot, "skills/blueprint/references/v1-compatibility.md", [
    '"resource": "git:directory"',
    '"resource": "literal:directory"',
    '"resource": "bundled"',
    '"step": "installPlugin"',
    '"pluginData"',
    '"step": "writeFiles"',
    '"filesTree"',
    '"step": "runPHP"',
    "require '/wordpress/wp-load.php';",
    '"step": "runSql"',
    '"step": "importWordPressFiles"',
    '"wordPressFilesZip"',
    '"step": "request"',
    '"userId"',
  ]);

  for (const file of [
    "skills/wp-playground/SKILL.md",
    "skills/wp-playground/references/cli.md",
    "skills/wp-playground/references/website.md",
    "skills/wp-playground/references/debugging.md",
  ]) {
    requireExcludes(repoRoot, file, [
      "--enable-xdebug",
      "--experimental-multi-worker",
      "--skip-wordpress-setup",
    ]);
  }
  requireIncludes(repoRoot, "skills/wp-playground/references/cli.md", [
    "3.1.45",
    "@wp-playground/cli@3.1.45 start",
    "--xdebug",
    "--workers=auto",
    "--wordpress-install-mode=install-from-existing-files-if-needed",
    '"8.5"',
  ]);
  requireIncludes(repoRoot, "skills/wp-playground/SKILL.md", [
    "references/cli.md",
    "references/website.md",
    "references/debugging.md",
  ]);

  requireIncludes(repoRoot, "skills/wp-abilities-api/references/mcp-exposure.md", [
    "meta.mcp.public",
    "composer require automattic/jetpack-autoloader",
    "vendor/autoload_packages.php",
    "^7.4 || ^8.0",
    "WP\\MCP\\Transport\\HttpTransport",
    "WP\\MCP\\Infrastructure\\ErrorHandling\\ErrorLogMcpErrorHandler",
    "WP\\MCP\\Infrastructure\\Observability\\NullMcpObservabilityHandler",
    // Adapter 0.6.0 reversed the default: an absent meta.mcp.public now
    // inherits meta.public. Guidance that omits this understates the MCP
    // surface, so the reversal must stay documented.
    "Current release: 0.6.1",
    "McpAbilityExposure::is_public()",
    "@since 0.6.0",
    "verified in v0.6.1",
  ]);
  requireExcludes(repoRoot, "skills/wp-abilities-api/references/mcp-exposure.md", [
    "discover and call every server-registered ability",
    "vendor/autoloader.php",
    "WP\\MCP\\Transport\\Http\\HttpTransport",
    "ErrorHandling\\Implementations",
    "Observability\\Implementations",
    // Pre-0.6.0 claims. Both are now false and the second is security-relevant.
    "ships in no release as of 0.5.0",
    "is not a key the core Abilities API defines",
  ]);
  requireIncludes(repoRoot, "skills/wp-abilities-api/SKILL.md", [
    "WordPress Core verified through: 7.1",
    "Gutenberg verified through: 23.8.0",
    "MCP Adapter 0.6.1 requires PHP 7.4+",
    "MCP Adapter verified through: 0.6.1",
    "upgrade the site runtime or stop before installing the adapter",
    "Read `references/mcp-exposure.md` before giving installation, bootstrap, or server code.",
    "composer require automattic/jetpack-autoloader",
    "vendor/autoload_packages.php",
    "meta.mcp.public ?? meta.public ?? false",
    "references/execution-lifecycle.md",
  ]);
  requireExcludes(repoRoot, "skills/wp-abilities-api/SKILL.md", [
    "released adapter 0.5.0 reads that key and nothing else",
    // The feature plugin was archived 2026-02-05; core is the only source.
    "you may need the Abilities API plugin/package rather than relying on core",
  ]);
  requireIncludes(repoRoot, "skills/wp-abilities-audit/SKILL.md", [
    "WordPress Core verified through: 7.1",
    "MCP Adapter verified through: 0.6.1",
  ]);
  requireIncludes(repoRoot, "skills/wp-abilities-verify/SKILL.md", [
    "WordPress Core verified through: 7.1",
    "MCP Adapter verified through: 0.6.1",
  ]);
  // WP 7.1 defines meta.public in core (WP_Ability::DEFAULT_PUBLIC), resolved
  // in prepare_properties(). The registration reference must not deny it.
  requireIncludes(repoRoot, "skills/wp-abilities-api/references/php-registration.md", [
    "DEFAULT_PUBLIC",
    "prepare_properties()",
    "meta.public",
    "archived on 5 February 2026",
  ]);
  requireExcludes(repoRoot, "skills/wp-abilities-api/references/php-registration.md", [
    "Released adapter 0.5.0 consults no other key",
    "is not a key the core Abilities API defines",
  ]);
  requireIncludes(repoRoot, "skills/wp-abilities-api/references/rest-api.md", [
    "/wp-abilities/v1/abilities/{name}/run",
    "meta.mcp.public ?? meta.public ?? false",
    "wp_get_abilities( array $args = array() ): array",
    "Exposure is not authorization",
  ]);
  requireIncludes(repoRoot, "skills/wp-abilities-api/references/execution-lifecycle.md", [
    "wp_ability_invoked",
    "wp_pre_execute_ability",
    "WP_Filter_Sentinel",
    "ArgumentCountError",
    "wp_ability_permission_result",
  ]);
  requireIncludes(repoRoot, "skills/wp-abilities-verify/references/exposure-checks.md", [
    "meta.mcp.public ?? meta.public ?? false",
    "adapter 0.6.0",
    "Verified unchanged in WordPress 7.1 final",
    "MCP Adapter 0.6.1",
  ]);
  requireExcludes(repoRoot, "skills/wp-ai-plugin/references/experiments-framework.md", [
    "MCP Adapter 0.5.0 uses explicit",
  ]);
  requireIncludes(repoRoot, "eval/scenarios/abilities-mcp-expose.json", [
    "PHP 7.4+",
    "composer require automattic/jetpack-autoloader",
    "vendor/autoload_packages.php",
    "meta.mcp.public ?? meta.public ?? false",
  ]);
  requireExcludes(repoRoot, "skills/wp-abilities-api/references/client-side.md", [
    "currentUserCan(",
    "core enqueues `@wordpress/core-abilities` on all admin pages",
  ]);
  requireIncludes(repoRoot, "skills/wp-abilities-api/references/client-side.md", [
    "wp_enqueue_script_module( '@wordpress/core-abilities' )",
    "data-can-manage-options",
  ]);

  requireIncludes(repoRoot, "skills/wp-ai-client/SKILL.md", [
    "WordPress Core verified through: 7.1",
    "PHP AI Client verified through: 1.4.0 standalone",
    "WP AI Client verified through: 0.4.0 standalone",
    "is_wp_error( $result )",
    "get_error_message()",
    "PHP AI Client 1.3.1",
    "PHP AI Client 1.4.0",
    "AiClient::generateEmbeddingResult()",
  ]);
  requireIncludes(repoRoot, "skills/wp-ai-client/references/embedding-builder.md", [
    "SDK_Overlay::register()",
    "commented out",
    "usingModelPreference()",
    "AiClient::generateEmbeddings()",
    "BeforeGenerateEmbeddingEvent",
    "AfterGenerateEmbeddingEvent",
  ]);
  requireExcludes(repoRoot, "skills/wp-ai-client/SKILL.md", [
    "Pull `getProviderMetadata()` off the result",
  ]);

  for (const file of [
    "skills/wp-ai-plugin/SKILL.md",
    "skills/wp-ai-plugin/references/dashboard-widgets.md",
    "skills/wp-ai-plugin/references/experiments-framework.md",
    "skills/wp-ai-plugin/references/hooks-and-filters.md",
  ]) {
    requireExcludes(repoRoot, file, ["v1.0.2", "'1.0.2'"]);
  }
  requireIncludes(repoRoot, "skills/wp-ai-plugin/SKILL.md", [
    "AI plugin verified through: 1.3.0",
    "Gutenberg verified through: 23.8.0",
    "wpai_feature_custom-abilities_enabled",
  ]);
  requireIncludes(repoRoot, "skills/wp-ai-plugin/references/experiments-framework.md", [
    "v1.3.0",
    "nineteen entries",
    "Type_Ahead",
    "Key_Encryption",
    "Suggest_Reply",
    "Content_Translation",
    "Slug_Generation",
    "Custom_Abilities",
    "wpai_feature_custom-abilities_enabled",
    "wpai_gated_abilities",
    "core/read-content",
    "core/read-settings",
    "core/read-users",
    "ai/get-post-details",
    "ai/get-post-terms",
  ]);
  requireIncludes(repoRoot, "skills/wp-ai-plugin/references/hooks-and-filters.md", [
    "wpai_default_request_timeout",
    "wpai_settings_feature_groups",
    "wpai_settings_feature_metadata",
    // Verified against WordPress/ai: absent at 0.6.0, present at 0.7.0 with
    // `@since 0.7.0` on Abstract_Ability::get_system_instruction(), unchanged
    // through 1.2.0. This pin previously asserted v1.2.0 and so guarded the
    // error into place — the version marker for a hook is only as good as the
    // tag someone actually read.
    "The global `wpai_system_instruction` hook ships in v0.7.0",
    "wpai_{$ability_slug}_system_instruction",
    "wpai_{$ability_slug}_prompt",
    "wpai_{$ability_slug}_prompt_builder",
    "wpai_gated_abilities",
    "WordPress\\AI\\log_ai_request()",
    "SDK_Overlay::register()",
    "commented out",
    "ai_embeddings_unsupported",
  ]);
  requireExcludes(repoRoot, "skills/wp-ai-plugin/references/experiments-framework.md", [
    "Added after v1.2.0 (unreleased on `develop`)",
    "ability-scoped prompt extension points to `Abstract_Ability` after the v1.2.0 tag",
  ]);
  requireExcludes(repoRoot, "skills/wp-ai-plugin/references/hooks-and-filters.md", [
    "Other `develop`-only hooks (unreleased after v1.2.0)",
    "Ability-scoped prompt filters (`develop`, unreleased after v1.2.0)",
  ]);
  requireIncludes(repoRoot, "skills/wp-ai-plugin/references/guidelines-integration.md", [
    "that hook ships in v0.7.0",
    "wpai_{$ability_slug}_system_instruction",
  ]);
  requireIncludes(repoRoot, "eval/playground/ai-plugin-smoke/blueprint.json", [
    '"wp": "7.1"',
    '"wpai_feature_custom-abilities_enabled": "0"',
    '"wpai_feature_custom-abilities_enabled": "1"',
    "wpai_skill_smoke_record_state( 'disabled' )",
    "wpai_skill_smoke_record_state( 'enabled' )",
  ]);
  requireIncludes(repoRoot, "eval/playground/ai-plugin-smoke/run.sh", [
    'const gated = ["read_content", "read_users", "read_settings", "get_post_details", "get_post_terms"]',
    'versionAtLeast(r.wpai_version, "1.3.0")',
    "disabled",
    "enabled",
  ]);
  requireIncludes(repoRoot, "eval/playground/ai-plugin-smoke/mu-plugins/wpai-skill-smoke.php", [
    "function wpai_skill_smoke_record_state( $phase )",
    "'custom_abilities_feature'",
    "'ai/get-post-details'",
    "'ai/get-post-terms'",
  ]);
  requireIncludes(repoRoot, "eval/playground/ai-plugin-smoke/README.md", [
    "WordPress 7.1",
    "AI plugin 1.3.0",
    "all five are absent",
    "all five are present",
  ]);
  requireIncludes(repoRoot, "skills/wp-ai-connectors/references/capabilities-declaration.md", [
    "Anthropic 1.0.4",
    "Claude Opus 4.7",
    "Claude 5",
    "empty tool-call arguments",
    "CapabilityEnum::embeddingGeneration()",
    "OptionEnum::dimensions()",
    "EmbeddingGenerationModelInterface",
    "supportedOptions",
  ]);
  requireIncludes(repoRoot, "skills/wp-ai-connectors/SKILL.md", [
    "WordPress Core verified through: 7.1",
    "PHP AI Client verified through: 1.4.0",
    "Anthropic provider verified through: 1.0.4",
    "Google provider verified through: 1.1.1",
    "OpenAI provider verified through: 1.1.0",
  ]);
  requireIncludes(repoRoot, "skills/wp-ai-connectors/references/provider-registration.md", [
    "ai-provider-for-anthropic` v1.0.4",
    "Google 1.1.1",
    "OpenAI 1.1.0",
  ]);
  requireIncludes(repoRoot, "eval/scenarios/ai-connectors-register-provider.json", [
    "Anthropic 1.0.4",
    "Google 1.1.1",
    "OpenAI 1.1.0",
    "empty tool-call arguments",
    "model-aware",
    "interface_exists( EmbeddingGenerationModelInterface::class )",
  ]);
  requireIncludes(repoRoot, "skills/wordpress-router/references/decision-tree.md", [
    "EmbeddingBuilder",
    "EmbeddingGenerationModelInterface",
    "Content Translation",
  ]);

  for (const file of [
    "skills/wp-block-development/SKILL.md",
    "skills/wp-block-development/references/block-json.md",
  ]) {
    requireIncludes(repoRoot, file, ["every block inserted", "API version 3"]);
    requireExcludes(repoRoot, file, ["regardless of block apiVersion", "always use the iframe"]);
  }
  requireIncludes(repoRoot, "skills/wp-block-themes/references/theme-json.md", [
    "## WordPress 7.0 additions",
    "settings.dimensions",
    "width",
    "height",
    "min-height",
    ":focus-visible",
  ]);
  requireExcludes(repoRoot, "skills/wp-block-themes/references/theme-json.md", [
    "**Button pseudo-classes:**",
    "Style Button block hover and focus states directly in theme.json.",
  ]);
  requireIncludes(repoRoot, "skills/wp-block-themes/references/theme-json.md", [
    "## Slug normalisation gotcha",
    "_wp_to_kebab_case()",
    "slug `3xl` becomes `--wp--preset--font-size--3-xl`",
    "var\\(\\s*--wp--(?:preset|custom)--[a-z-]+--\\d+[a-z]",
    "`styles.elements.textInput`",
    "email, number, password, search, text, tel, url",
    "There is no `input`, `checkbox`, `radio`, or `label` element key.",
  ]);
  requireExcludes(repoRoot, "skills/wp-block-themes/references/theme-json.md", [
    "`styles.elements.input`",
  ]);
  requireIncludes(repoRoot, "skills/wp-block-themes/references/debugging.md", [
    "the slug is likely un-normalised",
    "Slug normalisation gotcha",
  ]);
  requireIncludes(repoRoot, "skills/wp-patterns/SKILL.md", [
    "name: wp-patterns",
    "license: GPL-2.0-or-later",
    "WordPress 6.9 with PHP 7.2.24 or later",
    "No inline `<style>` tags",
    "references/pattern-registration.md",
    "references/block-markup-reference.md",
  ]);
  // Escaping and preset-over-hardcoded guidance moved out of SKILL.md and into
  // these reference files upstream (#79). Assert them where they now live so the
  // guarantee survives the progressive-disclosure refactor.
  requireIncludes(repoRoot, "skills/wp-patterns/references/pattern-registration.md", [
    "Auto-Registration via `/patterns/` Directory",
    "register_block_pattern()",
    "esc_html_e()",
    "Always use:",
    "`esc_url()` for URLs",
  ]);
  requireIncludes(repoRoot, "skills/wp-patterns/references/design-with-tokens.md", [
    "theme.json",
    "Preset",
    "reference theme.json values by name (preferred)",
    "Never use inline `<style>` tags",
  ]);
  requireIncludes(repoRoot, "skills/wp-interactivity-api/SKILL.md", [
    "watch()",
    "unwatch()",
    "export function disposeNavigationAnalytics()",
    "Do not call it immediately after registering the watcher.",
    "state.url",
    "state.navigation.hasStarted",
    "state.navigation.hasFinished",
  ]);
  requireNoMatch(
    repoRoot,
    "skills/wp-interactivity-api/SKILL.md",
    IMMEDIATE_UNWATCH_PATTERN,
    "must not call unwatch immediately after watch registration"
  );
  requireNoMatch(
    repoRoot,
    "skills/wp-interactivity-api/SKILL.md",
    /state\.navigation\.(?:hasStarted|hasFinished)(?!`)/,
    "must mention deprecated navigation state only as code-formatted prose, never as a recommended direct read"
  );

  for (const file of [
    "skills/wp-plugin-directory-guidelines/SKILL.md",
    "skills/wp-plugin-directory-guidelines/references/gpl-compliance.md",
    "skills/wp-plugin-directory-guidelines/references/guideline-review-checklist.md",
  ]) {
    requireIncludes(repoRoot, file, ["License URI", "optional"]);
    requireExcludes(repoRoot, file, [
      "Missing `License:` or `License URI:`",
      "has a `License URI:` header",
    ]);
  }
  requireIncludes(repoRoot, "skills/wpds/SKILL.md", [
    "If the WPDS MCP server is unavailable",
    "developer.wordpress.org/block-editor/reference-guides/components",
    "@wordpress/components",
    "@wordpress/ui",
    "get_components",
    "get_component_details",
    "get_design_tokens",
    "npm 11.10.0 or newer",
    "do not enforce the two-day delay",
  ]);
  requireExcludes(repoRoot, "skills/wpds/SKILL.md", [
    "Requires WPDS MCP server configured and running",
    "DO NOT search the web",
    "wpds://",
  ]);
}
