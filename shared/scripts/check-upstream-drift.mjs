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
 */

const CHECKS = [
  {
    name: "wp-ai-plugin vs WordPress/ai releases",
    indexFile: "shared/references/ai-plugin-releases.json",
    skillFile: "skills/wp-ai-plugin/SKILL.md",
    // Matches the frontmatter compatibility line, e.g.
    // "(current canonical release: v1.2.0)".
    skillPattern: /current canonical release:\s*v?(\d+(?:\.\d+)+)/,
    hint: "Re-sync skills/wp-ai-plugin to the newer release (verify against the tagged source per docs/upstream-sync.md), then bump the 'current canonical release' marker in its SKILL.md compatibility line.",
  },
  {
    // The adapter is versioned independently of core and has already reversed
    // its ability-exposure default once (0.6.0 made `meta.public` grant MCP
    // exposure). Guidance written against an older adapter is not merely stale,
    // it inverts a security-relevant default — so this surface needs a gate.
    name: "wp-abilities-api vs WordPress/mcp-adapter releases",
    indexFile: "shared/references/mcp-adapter-releases.json",
    skillFile: "skills/wp-abilities-api/SKILL.md",
    // Matches the frontmatter compatibility line, e.g.
    // "current canonical release: v0.6.1".
    skillPattern: /current canonical release:\s*v?(\d+(?:\.\d+)+)/,
    hint: "Re-verify skills/wp-abilities-api against the newer MCP Adapter release — especially McpAbilityExposure::is_public() and create_server() — then update references/mcp-exposure.md and bump the 'current canonical release' marker in the SKILL.md compatibility line.",
  },
  {
    // The abilities skills carry a large WP 7.1 surface (the execution
    // lifecycle hooks, meta.public, wp_get_abilities() args, typed REST
    // inputs) that was verified against the 7.1 *branch* while it was still
    // a release candidate. Branch content moves until it ships, so the gate
    // fires when a new core minor actually releases and someone has to
    // re-verify against the released build.
    //
    // Minor granularity on purpose: a patch release almost never touches this
    // surface, and firing on every 7.0.x would train people to ignore the gate.
    name: "wp-abilities-api vs released WordPress core",
    indexFile: "shared/references/wordpress-core-versions.json",
    skillFile: "skills/wp-abilities-api/SKILL.md",
    // Matches the frontmatter compatibility line, e.g.
    // "(core verified through: 7.0)".
    skillPattern: /core verified through:\s*(\d+\.\d+)/,
    // This index stores `latest` as a plain version string, not a release object.
    latestFrom: (index) => (typeof index?.latest === "string" ? index.latest : null),
    granularity: "minor",
    hint: "A new WordPress minor has shipped. Re-verify the 7.1+ surface in skills/wp-abilities-api (and the exposure rules in wp-abilities-verify) against the released branch rather than the pre-release one, then bump the 'core verified through' marker in the SKILL.md compatibility line.",
  },
];

function parseVersion(value) {
  return String(value)
    .replace(/^v/, "")
    .split(".")
    .map((n) => Number.parseInt(n, 10) || 0);
}

function compareVersions(a, b, granularity = "patch") {
  const depth = granularity === "minor" ? 2 : Infinity;
  const pa = parseVersion(a).slice(0, depth);
  const pb = parseVersion(b).slice(0, depth);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
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

    const latestFrom = check.latestFrom ?? ((index) => index?.latest?.tag ?? null);

    let latestTag = null;
    try {
      const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
      latestTag = latestFrom(index) ?? null;
    } catch {
      failures.push(`[${check.name}] Could not parse ${check.indexFile} as JSON.`);
      continue;
    }
    if (!latestTag) {
      failures.push(`[${check.name}] ${check.indexFile} has no usable latest version.`);
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
    if (compareVersions(latestTag, declared, check.granularity) > 0) {
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

  process.stdout.write("OK: upstream drift checks passed.\n");
}

main();
