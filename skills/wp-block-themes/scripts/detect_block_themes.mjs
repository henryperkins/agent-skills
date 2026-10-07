import fs from "node:fs";
import path from "node:path";

const DEFAULT_IGNORES = new Set([
  ".git",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
]);

function statSafe(p) {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

function existsDir(p) {
  const st = statSafe(p);
  return Boolean(st && st.isDirectory());
}

function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function findFilesRecursive(repoRoot, predicate, { maxFiles = 6000, maxDepth = 10 } = {}) {
  const results = [];
  const queue = [{ dir: repoRoot, depth: 0 }];
  let visited = 0;

  while (queue.length > 0) {
    const { dir, depth } = queue.shift();
    if (depth > maxDepth) continue;

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const ent of entries) {
      const fullPath = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (DEFAULT_IGNORES.has(ent.name)) continue;
        queue.push({ dir: fullPath, depth: depth + 1 });
        continue;
      }
      if (!ent.isFile()) continue;

      visited += 1;
      if (visited > maxFiles) return { results, truncated: true };
      if (predicate(fullPath)) results.push(fullPath);
    }
  }

  return { results, truncated: false };
}

function summarizeTheme(repoRoot, rootPath) {
  const themeJsonPath = path.join(rootPath, "theme.json");
  const json = readJsonSafe(themeJsonPath);
  const hasThemeJson = statSafe(themeJsonPath)?.isFile() ?? false;
  const rel = hasThemeJson ? path.relative(repoRoot, themeJsonPath).split(path.sep).join("/") : null;
  const rootDir = path.relative(repoRoot, rootPath).split(path.sep).join("/") || ".";

  const templatesDir = path.join(repoRoot, rootDir, "templates");
  const partsDir = path.join(repoRoot, rootDir, "parts");
  const patternsDir = path.join(repoRoot, rootDir, "patterns");
  const stylesDir = path.join(repoRoot, rootDir, "styles");

  const hasTemplates = existsDir(templatesDir);
  const hasParts = existsDir(partsDir);
  let parentRoot = null;
  try {
    const header = fs.readFileSync(path.join(rootPath, "style.css"), "utf8").slice(0, 8192);
    const parentName = header.match(/^[\s*#]*Template\s*:\s*([^\r\n]+)/im)?.[1]?.trim();
    if (parentName) {
      const candidate = path.resolve(path.dirname(rootPath), parentName);
      const relative = path.relative(repoRoot, candidate);
      if (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
        const parentHeader = fs.readFileSync(path.join(candidate, "style.css"), "utf8").slice(0, 8192);
        if (/^[\s*#]*Theme Name\s*:\s*\S/im.test(parentHeader)) parentRoot = candidate;
      }
    }
  } catch { /* Parent files outside the scan or missing from disk remain unverified. */ }
  const indexTemplate = ["templates/index.html", "block-templates/index.html"].find((candidate) => {
    const ownTemplate = path.join(rootPath, candidate);
    const template = statSafe(ownTemplate) || parentRoot === null ? ownTemplate : path.join(parentRoot, candidate);
    if (!statSafe(template)?.isFile()) return false;
    try { fs.accessSync(template, fs.constants.R_OK); return true; } catch { return false; }
  });

  return {
    themeRoot: rootDir,
    themeJson: rel,
    version: typeof json?.version === "number" ? json.version : null,
    hasTemplates,
    hasParts,
    hasPatterns: existsDir(patternsDir),
    hasStyles: existsDir(stylesDir),
    isBlockTheme: Boolean(indexTemplate),
    indexTemplate: indexTemplate ?? null,
  };
}

function usage() {
  process.stdout.write(
    [
      "detect_block_themes — inventory theme roots in the current working directory (repo root).",
      "",
      "Usage:",
      "  node scripts/detect_block_themes.mjs [--help]",
      "",
      "Behavior:",
      "  - Finds Theme Name headers in style.css and theme.json roots, including classic themes.",
      "  - Classifies block themes using a readable templates/index.html or block-templates/index.html.",
      "  - Prints a structured JSON report to stdout; diagnostics (if any) go to stderr.",
      "  - Read-only and non-interactive. Exit code 0 on success.",
      "",
      "Options:",
      "  -h, --help   Show this help and exit.",
      "",
    ].join("\n")
  );
}

function main() {
  if (process.argv.slice(2).some((a) => a === "--help" || a === "-h")) {
    usage();
    return;
  }
  const repoRoot = process.cwd();

  const { results: candidates, truncated } = findFilesRecursive(repoRoot, (p) => ["theme.json", "style.css"].includes(path.basename(p)), {
    maxFiles: 8000,
    maxDepth: 12,
  });

  const roots = new Set();
  for (const candidate of candidates) {
    if (path.basename(candidate) === "style.css") {
      let header;
      try { header = fs.readFileSync(candidate, "utf8").slice(0, 8192); } catch { continue; }
      if (!/^[\s*#]*Theme Name\s*:\s*\S/im.test(header)) continue;
    }
    roots.add(path.dirname(candidate));
  }
  const themes = [...roots].map((root) => summarizeTheme(repoRoot, root));

  const report = {
    tool: { name: "detect_block_themes", version: "0.2.0" },
    repoRoot,
    truncated,
    count: themes.length,
    themes,
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main();

