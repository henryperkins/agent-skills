#!/usr/bin/env node
/**
 * detect_ai_client.mjs
 *
 * Deterministic detection for the WP 7.0+ AI Client surface in the current repo.
 * Reads only the filesystem; does not call WP-CLI or hit the running site.
 *
 * Outputs JSON to stdout:
 *   {
 *     "wp_floor":              "<earliest 'Requires at least' across plugin PHP and theme style.css headers, or null>",
 *     "supports_ai_client":    <bool — true iff every detected floor is >= 7.0>,
 *     "uses_ai_client":        <bool — true iff a Core wrapper or SDK entry point is called in PHP>,
 *     "uses_legacy_packages":  <bool — true iff composer.json requires a standalone AI package at runtime>,
 *     "feature_endpoints":     [<paths where an AI Client entry point is called>],
 *     "notes":                 [<advisory strings>]
 *   }
 *
 * Usage:
 *   node scripts/detect_ai_client.mjs
 *   node scripts/detect_ai_client.mjs --root <path>
 */

import { promises as fs } from "node:fs";
import path from "node:path";

const IGNORED_DIRS = new Set([
  "node_modules",
  "vendor",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".cache",
  ".vercel",
]);

function parseArgs(argv) {
  const args = { root: process.cwd() };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--root" && argv[i + 1]) {
      args.root = path.resolve(argv[i + 1]);
      i++;
    }
  }
  return args;
}

async function* walk(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

function compareVersions(a, b) {
  // Returns -1 if a<b, 0 if a==b, 1 if a>b. Handles "7.0", "7.0.1", "6.9.4".
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

function extractHeaderField(contents, field) {
  // Plugin/theme headers: " * Requires at least: 7.0" or "Requires at least: 7.0"
  const re = new RegExp(`^[\\s*#]*${field}\\s*:\\s*([^\\r\\n]+)`, "im");
  const match = contents.match(re);
  const value = match ? match[1].trim() : null;
  return value && /^\d+(?:\.\d+){1,2}(?:[-+][0-9A-Za-z.-]+)?$/.test(value) ? value : null;
}

function callsAiClient(contents) {
  const withoutWrapperDefinitions = contents.replace(
    /\bfunction\s+wp_ai_client_prompt\s*\(/g,
    "function __wp_ai_client_prompt_definition("
  );
  return (
    /\bwp_ai_client_prompt\s*\(/.test(withoutWrapperDefinitions) ||
    /\bAiClient\s*::\s*(?:prompt|generate[A-Z][A-Za-z0-9_]*)\s*\(/.test(contents)
  );
}

function usage() {
  process.stdout.write(
    [
      "detect_ai_client — detect the WP 7.0+ AI Client surface in a WordPress project.",
      "",
      "Usage:",
      "  node scripts/detect_ai_client.mjs [--root <path>] [--help]",
      "",
      "Behavior:",
      "  - Reads only the filesystem (no WP-CLI, no network) under the target root.",
      "  - Prints a structured JSON report to stdout; diagnostics (if any) go to stderr.",
      "  - Read-only and non-interactive. Exit code 0 on success, 1 on error.",
      "",
      "Options:",
      "  --root <path>   Directory to scan (default: current working directory).",
      "  -h, --help      Show this help and exit.",
      "",
    ].join("\n")
  );
}

async function main() {
  if (process.argv.slice(2).some((a) => a === "--help" || a === "-h")) {
    usage();
    return;
  }
  const { root } = parseArgs(process.argv);
  const rootStat = await fs.stat(root);
  if (!rootStat.isDirectory()) {
    throw new Error(`Scan root is not a directory: ${root}`);
  }
  const result = {
    wp_floor: null,
    supports_ai_client: false,
    uses_ai_client: false,
    uses_legacy_packages: false,
    feature_endpoints: [],
    notes: [],
  };

  let lowestFloor = null;
  const floors = [];

  // 1) Composer dependency check.
  const composerPath = path.join(root, "composer.json");
  try {
    const composer = JSON.parse(await fs.readFile(composerPath, "utf8"));
    const deps = composer.require || {};
    if (deps["wordpress/php-ai-client"] || deps["wordpress/wp-ai-client"]) {
      result.uses_legacy_packages = true;
      result.notes.push(
        "Detected a runtime Composer dependency on wordpress/php-ai-client or wordpress/wp-ai-client. On WordPress 7.0+, Core supplies the SDK; use Core or a prefixed standalone copy rather than mixing unprefixed SDK versions and namespaces. See references/prompt-builder.md#migration."
      );
    }
  } catch {
    // No composer.json; fine.
  }

  // 2) Walk plugin PHP and theme stylesheets, gather signals.
  //
  // A block theme declares its WordPress floor in style.css, not in PHP, so a
  // PHP-only walk reports wp_floor: null for an otherwise 7.1-ready theme and
  // wrongly says the Core AI Client path is unsupported. Read style.css for
  // headers; scan AI usage only in PHP.
  for await (const file of walk(root)) {
    const isPhp = file.endsWith(".php");
    const isStylesheet = path.basename(file) === "style.css";
    if (!isPhp && !isStylesheet) continue;

    let contents;
    let headerContents;
    try {
      const bytes = await fs.readFile(file);
      contents = bytes.toString("utf8");
      headerContents = bytes.subarray(0, 8192).toString("utf8");
    } catch {
      continue;
    }

    // Only a *theme* stylesheet declares a WordPress floor. WordPress itself
    // identifies one by its `Theme Name:` header, so require that before
    // trusting a style.css — otherwise a plugin's admin CSS or a vendored
    // stylesheet that happens to carry the header line could set a bogus floor.
    if (isStylesheet && !/^[\s*#]*Theme Name\s*:/im.test(headerContents)) continue;

    const floor = extractHeaderField(headerContents, "Requires at least");
    if (floor) {
      floors.push({ file: path.relative(root, file), floor });
      if (lowestFloor === null || compareVersions(floor, lowestFloor) < 0) {
        lowestFloor = floor;
      }
    }

    if (!isPhp) continue;

    // AI Client usage.
    if (callsAiClient(contents)) {
      result.uses_ai_client = true;
      result.feature_endpoints.push(path.relative(root, file));
    }

    // Legacy SDK class reference (works as a hint even without composer.json).
    if (/AI_Client\s*::\s*prompt\s*\(/.test(contents)) {
      result.uses_legacy_packages = true;
    }
  }

  result.wp_floor = lowestFloor;
  result.supports_ai_client =
    lowestFloor !== null && compareVersions(lowestFloor, "7.0") >= 0;

  // `wp_floor` is the minimum across the whole tree, so a nested theme — a test
  // fixture, a bundled starter theme — can decide it. Name the file when the
  // deciding header is not at the scan root, so the number is auditable rather
  // than mysterious.
  const decidingFloors = floors.filter((entry) => entry.floor === lowestFloor);
  const nestedDeciders = decidingFloors.filter((entry) => entry.file.includes(path.sep));
  if (lowestFloor !== null && nestedDeciders.length === decidingFloors.length && nestedDeciders.length > 0) {
    result.notes.push(
      `Lowest 'Requires at least' (${lowestFloor}) comes only from nested file(s): ${nestedDeciders
        .map((entry) => entry.file)
        .join(", ")}. If that is a test fixture or a bundled theme rather than the project's own floor, re-run with --root pointed at the real project directory.`
    );
  }

  if (lowestFloor === null) {
    result.notes.push(
      "No 'Requires at least' header found in any plugin PHP file or theme style.css. Cannot determine WP version floor; assume the project may run on < 7.0 unless confirmed otherwise."
    );
  } else if (!result.supports_ai_client) {
    result.notes.push(
      `Lowest 'Requires at least' is ${lowestFloor} (< 7.0). Either bump to 7.0, depend on the deprecated compatibility plugin, or ship a prefixed standalone SDK.`
    );
  }

  if (result.uses_ai_client && result.uses_legacy_packages) {
    result.notes.push(
      "Both an AI Client call and an unprefixed standalone runtime dependency were detected. Pick Core or a prefixed standalone copy; mixing SDK versions and PSR namespaces on WordPress 7.0+ is unsupported."
    );
  }

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

main().catch((err) => {
  process.stderr.write(`detect_ai_client error: ${err.message}\n`);
  process.exit(1);
});
