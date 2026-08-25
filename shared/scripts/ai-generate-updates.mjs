import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CORE_AI_UPSTREAMS } from "./core-ai-upstreams.mjs";

const REPO_ROOT = process.cwd();
const SKILLS_DIR = path.join(REPO_ROOT, "skills");
const STATE_FILE = path.join(REPO_ROOT, ".github", "state", "last-sync.json");
const RESULT_FILE = path.join(REPO_ROOT, ".github", "state", "generator-result.json");
const SUMMARY_FILE = path.join(REPO_ROOT, ".github", "state", "update-summary.json");

const HELP = `Usage: node shared/scripts/ai-generate-updates.mjs [options]

Generate advisory, source-evidenced Core AI skill updates.

Options:
  --check-config      Inspect ANTHROPIC_API_KEY / ANTHROPIC_MODEL configuration without network access
  --print-state-hash  Print the canonical SHA-256 hash of the committed upstream indices and exit.
                      Read-only and provider-independent: it reads no environment credentials,
                      makes no network request, and writes no file.
  --help              Show this help

Environment:
  ANTHROPIC_API_KEY  Required for generation; configure as a repository secret
  ANTHROPIC_MODEL    Required for generation; configure as a repository variable
  AI_DRY_RUN         Set to true to suppress skill and sync-state writes
`;

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function versionFromIndex(upstream, index) {
  if (upstream.sourceType === "wordpress-version-check") {
    return typeof index?.latest === "string" ? index.latest : null;
  }
  if (upstream.sourceType === "html-version-map") return null;
  return typeof index?.latest?.tag === "string" ? index.latest.tag : null;
}

function releaseUrlFromIndex(upstream, index) {
  return typeof index?.latest?.url === "string" ? index.latest.url : upstream.source;
}

export function buildUpstreamState(indices, registry = CORE_AI_UPSTREAMS) {
  const versions = {};
  let versionMapRowCount = 0;
  for (const upstream of [...registry].sort((a, b) => a.id.localeCompare(b.id))) {
    const index = indices[upstream.id];
    if (upstream.sourceType === "html-version-map") {
      versionMapRowCount = Array.isArray(index?.rows) ? index.rows.length : 0;
    } else {
      versions[upstream.id] = versionFromIndex(upstream, index);
    }
  }
  return { schemaVersion: 2, versions, versionMapRowCount };
}

export function getUpstreamStateHash(indices, registry = CORE_AI_UPSTREAMS) {
  const state = buildUpstreamState(indices, registry);
  const hash = crypto.createHash("sha256").update(JSON.stringify(state)).digest("hex");
  return { hash, state };
}

function allAffectedSkills(registry) {
  return [...new Set(registry.flatMap((upstream) => upstream.affectedSkills))].sort();
}

export function detectUpstreamChanges(
  lastSync,
  currentState,
  indices,
  registry = CORE_AI_UPSTREAMS
) {
  const legacyHash = typeof lastSync?.hash === "string" && /^[A-Za-z0-9+/]{16}$/.test(lastSync.hash);
  if (!lastSync?.state?.versions || lastSync.state.schemaVersion !== 2 || legacyHash) {
    return [
      {
        type: legacyHash ? "state-schema-migration" : "initial-sync",
        sourceId: null,
        description: legacyHash
          ? "Migrate the partial 16-character state hash to the complete Core AI source state"
          : "Initialize the complete Core AI source state",
        oldVersion: null,
        newVersion: currentState.hash,
        releaseUrl: null,
        affectedSkills: allAffectedSkills(registry),
        riskLevel: "medium",
        taggedFiles: [],
      },
    ];
  }

  const changes = [];
  for (const upstream of registry) {
    const isMap = upstream.sourceType === "html-version-map";
    const oldVersion = isMap
      ? lastSync.state.versionMapRowCount
      : lastSync.state.versions[upstream.id] ?? null;
    const newVersion = isMap
      ? currentState.state.versionMapRowCount
      : currentState.state.versions[upstream.id] ?? null;
    if (oldVersion === newVersion) continue;
    changes.push({
      type: isMap ? "version-map-update" : "upstream-release",
      sourceId: upstream.id,
      description: `${upstream.id} updated: ${oldVersion ?? "unknown"} → ${newVersion ?? "unknown"}`,
      oldVersion,
      newVersion,
      releaseUrl: releaseUrlFromIndex(upstream, indices[upstream.id]),
      affectedSkills: [...upstream.affectedSkills],
      riskLevel: isMap ? "low" : "medium",
      taggedFiles: [],
    });
  }
  return changes;
}

export function inspectConfiguration(environment = process.env) {
  const model = String(environment.ANTHROPIC_MODEL ?? "").trim();
  const apiKeyConfigured = String(environment.ANTHROPIC_API_KEY ?? "").trim() !== "";
  return {
    configured: apiKeyConfigured && model !== "",
    apiKeyConfigured,
    modelConfigured: model !== "",
    model: model || null,
    category: !apiKeyConfigured ? "missing-api-key" : model === "" ? "missing-model" : "configured",
  };
}

export function loadUpstreamIndices(repoRoot = REPO_ROOT, registry = CORE_AI_UPSTREAMS) {
  return Object.fromEntries(
    registry.map((upstream) => [
      upstream.id,
      loadJson(path.join(repoRoot, upstream.indexFile)),
    ])
  );
}

function loadSkillContent(skillName) {
  try {
    return fs.readFileSync(path.join(SKILLS_DIR, skillName, "SKILL.md"), "utf8");
  } catch {
    return null;
  }
}

function loadSkillReferences(skillName) {
  const references = {};
  try {
    for (const file of fs.readdirSync(path.join(SKILLS_DIR, skillName, "references"))) {
      if (file.endsWith(".md")) {
        references[file] = fs.readFileSync(path.join(SKILLS_DIR, skillName, "references", file), "utf8");
      }
    }
  } catch {
    // A skill may have no references directory.
  }
  return references;
}

function sourceContext(changes) {
  return changes
    .map(
      (change) =>
        `- source: ${change.sourceId ?? "registry-state"}\n  version: ${change.oldVersion ?? "unknown"} -> ${change.newVersion}\n  release: ${change.releaseUrl ?? "not available"}\n  affected skills: ${change.affectedSkills.join(", ")}\n  supplied tagged files: ${change.taggedFiles.length ? change.taggedFiles.join(", ") : "none"}`
    )
    .join("\n");
}

export function buildAnalysisPrompt(changes) {
  return `You are triaging upstream changes for WordPress Core AI skills.

Source precedence is mandatory: tagged executable source, tests in that tag, release notes/changelog, then handbook prose. A changelog claim never overrides executable behavior.

## Sources
${sourceContext(changes)}

If no tagged files are supplied, do not speculate or propose file rewrites. Return review recommendations that name the tag and source areas a human or source-capable agent must inspect. If tagged files are supplied, cite only those files as inspected.

Respond as JSON:
{
  "analysis": "summary",
  "skillUpdates": [{"skill":"name","reason":"why","riskLevel":"low|medium|high","priority":1,"taggedFilesInspected":["path"],"reviewRecommendation":"what remains"}],
  "skipUpdate": true,
  "skipReason": "reason"
}`;
}

function buildUpdatePrompt(skillName, skillContent, references, relevantChanges) {
  const referenceText = Object.entries(references)
    .map(([name, content]) => `### ${name}\n${content.slice(0, 2000)}`)
    .join("\n\n");
  return `Update the WordPress skill ${skillName} only when supplied tagged executable evidence supports the edit.

Source precedence: tagged executable source > tagged tests > release notes/changelog > handbook prose.

## Source changes
${sourceContext(relevantChanges)}

## SKILL.md
${skillContent}

## References (truncated)
${referenceText || "(none)"}

Without supplied tagged-file evidence, set skillUpdated=false and return a reviewRecommendation. Never invent a file as inspected.

Respond as JSON:
{
  "skillUpdated": false,
  "taggedFilesInspected": [],
  "changes": [{"file":"SKILL.md","description":"what changed","newContent":"full content"}],
  "summary": "summary",
  "reviewRecommendation": "source work still required",
  "noChangeReason": "reason"
}`;
}

async function callClaude(client, model, prompt) {
  const response = await client.messages.create({
    model,
    max_tokens: 8192,
    system: "You maintain WordPress development skills. Return valid JSON and never claim source inspection without supplied evidence.",
    messages: [{ role: "user", content: prompt }],
  });
  const value = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
  const match = value.match(/```json\s*([\s\S]*?)\s*```/) ?? value.match(/```\s*([\s\S]*?)\s*```/);
  try {
    return JSON.parse(match?.[1] ?? value);
  } catch (error) {
    throw new Error(`invalid-json-response: ${error.message}`);
  }
}

function hasSuppliedTaggedEvidence(result, relevantChanges) {
  const supplied = new Set(relevantChanges.flatMap((change) => change.taggedFiles));
  const inspected = Array.isArray(result?.taggedFilesInspected) ? result.taggedFilesInspected : [];
  return supplied.size > 0 && inspected.length > 0 && inspected.every((file) => supplied.has(file));
}

function safeChangePath(skill, relativeFile) {
  const skillRoot = path.resolve(SKILLS_DIR, skill);
  const filePath = path.resolve(skillRoot, relativeFile);
  if (filePath !== skillRoot && !filePath.startsWith(`${skillRoot}${path.sep}`)) {
    throw new Error(`unsafe-generated-path: ${relativeFile}`);
  }
  return filePath;
}

function classifyError(error) {
  const value = String(error?.message ?? error).toLowerCase();
  if (value.includes("anthropic_api_key") || value.includes("missing-api-key")) return "missing-api-key";
  if (value.includes("anthropic_model") || value.includes("missing-model")) return "missing-model";
  if (value.includes("401") || value.includes("authentication")) return "authentication";
  if (value.includes("429") || value.includes("rate limit")) return "rate-limit";
  if (value.includes("quota") || value.includes("credit")) return "quota";
  if (value.includes("model") && (value.includes("access") || value.includes("not found"))) return "model-access";
  if (value.includes("cannot find package")) return "dependency-missing";
  if (value.includes("fetch") || value.includes("network")) return "network";
  if (value.includes("invalid-json-response")) return "invalid-response";
  return "generation-error";
}

function writeGeneratorResult(result) {
  writeJson(RESULT_FILE, { timestamp: new Date().toISOString(), ...result });
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

async function generate() {
  const configuration = inspectConfiguration();
  if (!configuration.apiKeyConfigured) throw new Error("missing-api-key: ANTHROPIC_API_KEY is required");
  if (!configuration.modelConfigured) throw new Error("missing-model: ANTHROPIC_MODEL is required");
  const dryRun = process.env.AI_DRY_RUN === "true";

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const indices = loadUpstreamIndices();
  const currentState = getUpstreamStateHash(indices);
  const lastSync = loadJson(STATE_FILE) ?? { hash: null, state: null };
  const changes = detectUpstreamChanges(lastSync, currentState, indices);

  if (changes.length === 0) {
    writeGeneratorResult({ outcome: "no-change", errorCategory: null, changes: [] });
    process.stdout.write("No upstream state changes detected.\n");
    return;
  }

  const analysis = await callClaude(client, configuration.model, buildAnalysisPrompt(changes));
  const candidates = Array.isArray(analysis.skillUpdates) ? analysis.skillUpdates : [];
  const updates = [];
  const reviewRecommendations = [];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate.skill !== "string") continue;
    const relevantChanges = changes.filter((change) => change.affectedSkills.includes(candidate.skill));
    if (relevantChanges.length === 0) continue;
    const skillContent = loadSkillContent(candidate.skill);
    if (!skillContent) continue;
    const result = await callClaude(
      client,
      configuration.model,
      buildUpdatePrompt(candidate.skill, skillContent, loadSkillReferences(candidate.skill), relevantChanges)
    );
    if (!hasSuppliedTaggedEvidence(result, relevantChanges)) {
      reviewRecommendations.push({
        skill: candidate.skill,
        recommendation:
          result.reviewRecommendation ?? "Inspect tagged executable source before editing this skill.",
      });
      continue;
    }
    if (result.skillUpdated && Array.isArray(result.changes) && result.changes.length > 0) {
      updates.push({ skill: candidate.skill, ...result });
    }
  }

  for (const update of updates) {
    for (const change of update.changes) {
      const filePath = safeChangePath(update.skill, change.file);
      if (!dryRun && typeof change.newContent === "string") {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, change.newContent, "utf8");
      }
    }
  }

  if (!dryRun) {
    writeJson(STATE_FILE, {
      ...currentState,
      lastSync: new Date().toISOString(),
      lastChanges: changes,
    });
  }
  writeJson(SUMMARY_FILE, {
    timestamp: new Date().toISOString(),
    changes,
    analysis: analysis.analysis ?? "",
    updates: updates.map((update) => ({
      skill: update.skill,
      summary: update.summary,
      files: update.changes.map((change) => change.file),
      taggedFilesInspected: update.taggedFilesInspected,
    })),
    reviewRecommendations,
  });
  writeGeneratorResult({
    outcome: updates.length > 0 ? "updated" : "review-only",
    errorCategory: null,
    updateCount: updates.length,
    reviewCount: reviewRecommendations.length,
    dryRun,
  });
  process.stdout.write(
    updates.length > 0
      ? `Generated ${updates.length} source-evidenced skill update(s).\n`
      : "No source-evidenced skill edits generated; review recommendations recorded.\n"
  );
}

export async function runCli(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  if (options.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (options.checkConfig) {
    process.stdout.write(`${JSON.stringify(inspectConfiguration(), null, 2)}\n`);
    return 0;
  }
  if (options.printStateHash) {
    const { hash } = getUpstreamStateHash(loadUpstreamIndices());
    process.stdout.write(`${hash}\n`);
    return 0;
  }
  await generate();
  return 0;
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedUrl === import.meta.url) {
  runCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      const category = classifyError(error);
      writeGeneratorResult({ outcome: "failed", errorCategory: category });
      process.stderr.write(`ERROR [${category}]: AI maintenance generation failed.\n`);
      process.exitCode = error.exitCode ?? 1;
    });
}
