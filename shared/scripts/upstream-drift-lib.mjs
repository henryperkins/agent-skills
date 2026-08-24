import fs from "node:fs";
import path from "node:path";

const RELEASE_MARKER_PATTERN = /(WordPress Core|Gutenberg|AI plugin|MCP Adapter|PHP AI Client|WP AI Client|Anthropic provider|Google provider|OpenAI provider) verified through:\s*v?(\d+(?:\.\d+)+)/g;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function frontmatter(text) {
  const match = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match?.[1] ?? "";
}

export function parseVersion(value) {
  return String(value)
    .replace(/^v/, "")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
}

export function compareVersions(a, b, granularity = "patch") {
  const depth = granularity === "minor" ? 2 : Infinity;
  const pa = parseVersion(a).slice(0, depth);
  const pb = parseVersion(b).slice(0, depth);
  const length = Math.max(pa.length, pb.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (pa[index] ?? 0) - (pb[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function latestVersion(upstream, index) {
  if (upstream.sourceType === "wordpress-version-check") {
    return typeof index?.latest === "string" ? index.latest : null;
  }
  if (upstream.sourceType === "html-version-map") return null;
  return typeof index?.latest?.tag === "string" ? index.latest.tag : null;
}

function addFailure(failures, code, details) {
  failures.push({ code, ...details });
}

/**
 * Pure drift collection used by both filesystem checks and unit fixtures.
 * `indices` is keyed by upstream id; `skillTexts` is keyed by skill name.
 */
export function collectUpstreamDriftFromData(indices, skillTexts, registry) {
  const checks = [];
  const failures = [];
  const declaredMarkers = new Set();

  for (const upstream of registry) {
    if (upstream.declarations.length === 0) continue;
    const index = indices[upstream.id];
    const latest = latestVersion(upstream, index);
    if (!latest) {
      addFailure(failures, "invalid-index", {
        upstreamId: upstream.id,
        indexFile: upstream.indexFile,
        message: `${upstream.indexFile} has no usable latest version.`,
      });
    }

    for (const declaration of upstream.declarations) {
      const markerKey = `${declaration.skill}\u0000${declaration.label}`;
      if (declaredMarkers.has(markerKey)) {
        addFailure(failures, "duplicate-declaration", {
          upstreamId: upstream.id,
          skill: declaration.skill,
          label: declaration.label,
          message: `${declaration.skill} / ${declaration.label} has more than one registry declaration.`,
        });
      }
      declaredMarkers.add(markerKey);

      const skillText = skillTexts[declaration.skill];
      const marker = new RegExp(
        `${escapeRegExp(declaration.label)}:\\s*v?(\\d+(?:\\.\\d+)+)`,
        "g"
      );
      const matches = skillText ? [...frontmatter(skillText).matchAll(marker)] : [];
      const declared = matches.length === 1 ? matches[0][1] : null;
      const check = {
        upstreamId: upstream.id,
        source: upstream.source,
        indexFile: upstream.indexFile,
        skill: declaration.skill,
        skillFile: `skills/${declaration.skill}/SKILL.md`,
        label: declaration.label,
        granularity: declaration.granularity,
        latest,
        declared,
        status: "ok",
      };

      if (!latest) {
        check.status = "invalid-index";
      } else if (typeof skillText !== "string") {
        check.status = "missing-skill";
        addFailure(failures, "missing-skill", {
          ...check,
          message: `Missing ${check.skillFile}.`,
        });
      } else if (matches.length !== 1) {
        check.status = "invalid-marker";
        addFailure(failures, "invalid-marker", {
          ...check,
          message: `${check.skillFile} must contain exactly one frontmatter marker '${declaration.label}: <version>' (found ${matches.length}).`,
        });
      } else if (latest) {
        const comparison = compareVersions(latest, declared, declaration.granularity);
        if (comparison > 0) {
          check.status = "drift";
          addFailure(failures, "upstream-newer", {
            ...check,
            message: `${upstream.id} is ${latest}, but ${declaration.skill} declares ${declared}. Re-verify the skill against tagged executable source and update '${declaration.label}'.`,
          });
        } else if (comparison < 0) {
          check.status = "declaration-ahead";
          addFailure(failures, "declaration-ahead", {
            ...check,
            message: `${declaration.skill} declares ${declared}, ahead of the committed ${upstream.id} index at ${latest}. Refresh the index or correct the marker.`,
          });
        }
      }
      checks.push(check);
    }
  }

  for (const [skill, text] of Object.entries(skillTexts)) {
    for (const match of frontmatter(text).matchAll(RELEASE_MARKER_PATTERN)) {
      const label = `${match[1]} verified through`;
      if (!declaredMarkers.has(`${skill}\u0000${label}`)) {
        addFailure(failures, "unregistered-marker", {
          skill,
          label,
          declared: match[2],
          message: `skills/${skill}/SKILL.md has release marker '${label}' with no registry declaration.`,
        });
      }
    }
  }

  return { checks, failures };
}

export function collectUpstreamDrift(repoRoot, registry) {
  const indices = {};
  const skillTexts = {};

  for (const upstream of registry) {
    const indexPath = path.join(repoRoot, upstream.indexFile);
    try {
      indices[upstream.id] = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    } catch {
      indices[upstream.id] = null;
    }
    for (const declaration of upstream.declarations) {
      if (declaration.skill in skillTexts) continue;
      const skillPath = path.join(repoRoot, "skills", declaration.skill, "SKILL.md");
      try {
        skillTexts[declaration.skill] = fs.readFileSync(skillPath, "utf8");
      } catch {
        skillTexts[declaration.skill] = null;
      }
    }
  }

  return collectUpstreamDriftFromData(indices, skillTexts, registry);
}

export function formatDriftText(report) {
  const lines = report.checks.map(
    (check) =>
      `${check.status === "ok" ? "OK" : "DRIFT"}: ${check.upstreamId} ${check.latest ?? "?"} -> ${check.skill} ${check.declared ?? "?"} (${check.granularity})`
  );
  if (report.failures.length > 0) {
    lines.push("", ...report.failures.map((failure) => `DRIFT: ${failure.message}`));
  } else {
    lines.push("", `OK: ${report.checks.length} Core AI declaration checks passed.`);
  }
  return `${lines.join("\n")}\n`;
}

export function formatDriftMarkdown(report) {
  const rows = report.checks.map(
    (check) =>
      `| ${check.status === "ok" ? "✅" : "❌"} | ${check.upstreamId} | ${check.latest ?? "—"} | ${check.skill} | ${check.declared ?? "—"} | ${check.granularity} |`
  );
  const failures = report.failures.length
    ? `\n### Required follow-up\n\n${report.failures.map((failure) => `- ${failure.message}`).join("\n")}\n`
    : "\nAll Core AI release declarations match their committed indices.\n";
  return `## Core AI upstream drift\n\n| Status | Upstream | Latest | Skill | Verified | Granularity |\n| --- | --- | ---: | --- | ---: | --- |\n${rows.join("\n")}\n${failures}`;
}

export function formatDriftJson(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}
