import path from "node:path";
import { pathToFileURL } from "node:url";
import { CORE_AI_UPSTREAMS } from "./core-ai-upstreams.mjs";
import {
  collectUpstreamDrift,
  formatDriftJson,
  formatDriftMarkdown,
  formatDriftText,
} from "./upstream-drift-lib.mjs";

const HELP = `Usage: node shared/scripts/check-upstream-drift.mjs [options]

Compare every registry-declared Core AI skill marker with its committed index.

Options:
  --format text|markdown|json  Output format (default: text)
  --allow-drift               Report all drift but exit successfully
  --help                      Show this help
`;

function usageError(message) {
  const error = new Error(message);
  error.exitCode = 2;
  return error;
}

export function parseArguments(args) {
  const options = { format: "text", allowDrift: false, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") {
      options.help = true;
    } else if (argument === "--allow-drift") {
      options.allowDrift = true;
    } else if (argument === "--format") {
      const format = args[index + 1];
      if (!format) throw usageError("--format requires text, markdown, or json");
      options.format = format;
      index += 1;
    } else if (argument.startsWith("--format=")) {
      options.format = argument.slice("--format=".length);
    } else {
      throw usageError(`Unknown argument: ${argument}`);
    }
  }
  if (!["text", "markdown", "json"].includes(options.format)) {
    throw usageError(`Unsupported format: ${options.format}`);
  }
  return options;
}

export function runCli(args = process.argv.slice(2), repoRoot = process.cwd()) {
  const options = parseArguments(args);
  if (options.help) {
    process.stdout.write(HELP);
    return 0;
  }

  const report = collectUpstreamDrift(repoRoot, CORE_AI_UPSTREAMS);
  if (options.format === "markdown") process.stdout.write(formatDriftMarkdown(report));
  else if (options.format === "json") process.stdout.write(formatDriftJson(report));
  else process.stdout.write(formatDriftText(report));

  return report.failures.length > 0 && !options.allowDrift ? 1 : 0;
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedUrl === import.meta.url) {
  try {
    process.exitCode = runCli();
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n\n${HELP}`);
    process.exitCode = error.exitCode ?? 1;
  }
}
