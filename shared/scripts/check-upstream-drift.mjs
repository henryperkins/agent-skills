import fs from "node:fs";
import path from "node:path";

/**
 * Compares committed upstream release indices against the versions skills
 * declare as canonical, so CI turns red when a skill lags upstream.
 *
 * Deterministic and offline: this reads only committed files. The indices
 * are refreshed by `shared/scripts/update-upstream-indices.mjs` (the
 * Upstream Sync workflow opens a PR with the refreshed index); once a newer
 * release lands in the index, this check fails until the skill is re-synced
 * and its declared canonical release is bumped.
 *
 * A check only earns its place when the skill makes version-specific claims
 * that a release can falsify. All five below do:
 *
 * - wp-ai-plugin tracks Experiments, Abilities, and hooks that change per
 *   release (1.3.0 moved five built-in Abilities behind an opt-in Experiment).
 * - wp-abilities-api documents MCP Adapter packaging and exposure resolution
 *   (0.6.0 reversed both).
 * - wp-ai-client documents the standalone embedding contract (1.5.0 made the
 *   model mandatory and removed two builder methods).
 * - wp-block-themes carries a per-core-version theme.json section; 7.1 added
 *   responsive style states and two top-level settings.
 * - wp-ai-client also states which PHP AI Client version Core bundles, which
 *   is only checkable against a known Core version.
 *
 * Deliberately NOT tracked: the Gutenberg plugin. It releases fortnightly, so
 * a marker pinned to it would be red most of the time and would be switched
 * off rather than acted on. The block skills describe what is in core, and the
 * two core-version checks fire on the ~2-3 minor releases a year that actually
 * move that line. Gutenberg-ahead-of-core claims are labelled as such in prose
 * instead.
 */

const CHECKS = [
  {
    name: "wp-ai-plugin vs WordPress/ai releases",
    indexFile: "shared/references/ai-plugin-releases.json",
    skillFile: "skills/wp-ai-plugin/SKILL.md",
    // Matches the frontmatter compatibility line, e.g.
    // "(current canonical release: v1.3.0)".
    skillPattern: /current canonical release:\s*v?(\d+(?:\.\d+)+)/,
    hint: "Re-sync skills/wp-ai-plugin to the newer release (verify against the tagged source per docs/upstream-sync.md), then bump the 'current canonical release' marker in its SKILL.md compatibility line.",
  },
  {
    name: "wp-abilities-api vs WordPress/mcp-adapter releases",
    indexFile: "shared/references/mcp-adapter-releases.json",
    skillFile: "skills/wp-abilities-api/SKILL.md",
    skillPattern: /Verified against MCP Adapter\s+v?(\d+(?:\.\d+)+)/,
    hint: "Re-sync skills/wp-abilities-api (SKILL.md and references/mcp-exposure.md) against the tagged adapter source — check packaging guidance, McpAbilityExposure, create_server(), and the default-server capability floors — then bump the 'Verified against MCP Adapter' marker.",
  },
  {
    name: "wp-ai-client vs WordPress/php-ai-client releases",
    indexFile: "shared/references/php-ai-client-releases.json",
    skillFile: "skills/wp-ai-client/SKILL.md",
    skillPattern: /Verified against PHP AI Client\s+v?(\d+(?:\.\d+)+)/,
    hint: "Re-sync skills/wp-ai-client (SKILL.md and references/embedding-builder.md) against the tagged SDK source — the embedding builder's model contract has already broken once — then bump the 'Verified against PHP AI Client' marker.",
  },
  {
    name: "wp-block-themes theme.json baseline vs WordPress core releases",
    indexFile: "shared/references/wordpress-core-versions.json",
    skillFile: "skills/wp-block-themes/SKILL.md",
    skillPattern: /Verified against WordPress\s+v?(\d+(?:\.\d+)+)/,
    // theme.json grows a "WordPress X.Y additions" section most minor
    // releases (6.9 form elements and radius presets, 7.0 dimensionSizes and
    // button pseudo-selectors, 7.1 responsive states and blockVisibility), so
    // a minor bump is exactly when the reference needs re-reading. Patch
    // releases never move it.
    compareDepth: 2,
    hint: "Diff WP_Theme_JSON::VALID_SETTINGS, VALID_STYLES, VALID_BLOCK_PSEUDO_SELECTORS, and VALID_BLOCK_CUSTOM_STATES between the old and new core branches, add a 'WordPress X.Y additions' section to references/theme-json.md for anything new, then bump the 'Verified against WordPress' marker.",
  },
  {
    name: "wp-ai-client bundled-SDK baseline vs WordPress core releases",
    indexFile: "shared/references/wordpress-core-versions.json",
    skillFile: "skills/wp-ai-client/SKILL.md",
    skillPattern: /and WordPress\s+v?(\d+(?:\.\d+)+)\s+\(bundles/,
    // Core ships patch releases that never change the bundled SDK, so compare
    // only major.minor. A minor bump is the event worth re-checking.
    compareDepth: 2,
    hint: "A new WordPress minor release may bundle a different PHP AI Client version. Re-check AiClient::VERSION and src/Builders/ in the new branch's src/wp-includes/php-ai-client/, update the bundled-versus-standalone section, then bump the 'and WordPress X.Y (bundles ...)' marker.",
  },
];

function parseVersion(value, depth) {
  const parts = String(value)
    .replace(/^v/, "")
    .split(".")
    .map((n) => Number.parseInt(n, 10) || 0);
  return typeof depth === "number" ? parts.slice(0, depth) : parts;
}

function compareVersions(a, b, depth) {
  const pa = parseVersion(a, depth);
  const pb = parseVersion(b, depth);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Reads the newest release from an index.
 *
 * GitHub Releases indices store objects (`latest.tag`); the WordPress core
 * index stores a bare version string (`latest`).
 */
function latestFromIndex(index) {
  if (typeof index?.latest === "string") return index.latest;
  return index?.latest?.tag ?? null;
}

function main() {
  const repoRoot = process.cwd();
  const failures = [];

  for (const check of CHECKS) {
    const indexPath = path.join(repoRoot, check.indexFile);
    const skillPath = path.join(repoRoot, check.skillFile);

    if (!fs.existsSync(indexPath)) {
      failures.push(
        `[${check.name}] Missing index ${check.indexFile} — run \`node shared/scripts/update-upstream-indices.mjs\`.`
      );
      continue;
    }
    if (!fs.existsSync(skillPath)) {
      failures.push(`[${check.name}] Missing skill file ${check.skillFile}.`);
      continue;
    }

    let latestTag = null;
    try {
      latestTag = latestFromIndex(JSON.parse(fs.readFileSync(indexPath, "utf8")));
    } catch {
      failures.push(`[${check.name}] Could not parse ${check.indexFile} as JSON.`);
      continue;
    }
    if (!latestTag) {
      failures.push(`[${check.name}] ${check.indexFile} has no latest release.`);
      continue;
    }

    const skillText = fs.readFileSync(skillPath, "utf8");
    const match = skillText.match(check.skillPattern);
    if (!match) {
      failures.push(
        `[${check.name}] ${check.skillFile} does not declare a canonical release matching ${check.skillPattern}.`
      );
      continue;
    }

    const declared = match[1];
    if (compareVersions(latestTag, declared, check.compareDepth) > 0) {
      failures.push(
        `[${check.name}] Upstream latest is ${latestTag} but the skill declares ${declared}. ${check.hint}`
      );
    }
  }

  if (failures.length > 0) {
    for (const f of failures) {
      process.stderr.write(`DRIFT: ${f}\n`);
    }
    process.exit(1);
  }

  process.stdout.write(`OK: upstream drift checks passed (${CHECKS.length} tracked).\n`);
}

main();
