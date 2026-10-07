import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Evaluate the small, fail-closed expression subset used by these write gates.
// No JS eval and no workflow dispatch: the tests consume the actual YAML guard.
function evaluate(expression, context) {
  const source = expression.trim().replace(/^\$\{\{\s*|\s*\}\}$/g, "");
  const tokens = source.match(/always\(\)|[A-Za-z_][\w.-]*|'[^']*'|==|!=|&&|\|\||[()]/g) ?? [];
  assert.equal(tokens.join(""), source.replace(/\s+/g, ""), `Unsupported gate: ${source}`);
  let position = 0;
  function atom() {
    const token = tokens[position++];
    if (token === "(") { const value = or(); assert.equal(tokens[position++], ")"); return value; }
    if (token === "always()" || token === "true") return true;
    if (token === "false") return false;
    if (token?.startsWith("'")) return token.slice(1, -1);
    assert.ok(Object.hasOwn(context, token), `Unknown expression input: ${token}`);
    return context[token];
  }
  function equality() {
    const left = atom();
    if (!["==", "!="].includes(tokens[position])) return left;
    const operator = tokens[position++];
    const right = atom();
    return operator === "==" ? left === right : left !== right;
  }
  function and() { let value = equality(); while (tokens[position] === "&&") { position++; const right = equality(); value = Boolean(value && right); } return value; }
  function or() { let value = and(); while (tokens[position] === "||") { position++; const right = and(); value = Boolean(value || right); } return value; }
  const value = or();
  assert.equal(position, tokens.length, "Unconsumed gate expression");
  return Boolean(value);
}

export function runWorkflowRegressions(repoRoot) {
  const workflow = fs.readFileSync(path.join(repoRoot, ".github/workflows/ai-skill-maintenance.yml"), "utf8");
  const job = workflow.match(/^  create-index-pr:\r?\n([\s\S]*?)(?=^  [\w-]+:|(?![\s\S]))/m)?.[1];
  assert.ok(job, "Missing index PR job");
  const jobGate = job.match(/^    if: (.+)$/m)?.[1];
  assert.ok(jobGate, "PR write job must be gated");
  assert.match(job, /uses: peter-evans\/create-pull-request@/);
  const cases = [
    { name: "dry run with changed indices", dry: true, changed: "true", result: "success", event: "workflow_dispatch", expected: false },
    { name: "dry run without configured advisory provider", dry: true, changed: "true", result: "success", generation: "skipped", event: "workflow_dispatch", expected: false },
    { name: "real run without configured advisory provider", dry: false, changed: "true", result: "success", generation: "skipped", event: "workflow_dispatch", expected: true },
    { name: "manual real run with changed indices", dry: false, changed: "true", result: "success", event: "workflow_dispatch", expected: true },
    { name: "real run without changed indices", dry: false, changed: "false", result: "success", event: "workflow_dispatch", expected: false },
    { name: "repository release dispatch", dry: "", changed: "true", result: "success", event: "repository_dispatch", expected: true },
    { name: "failed refresh cannot write", dry: false, changed: "true", result: "failure", event: "workflow_dispatch", expected: false },
  ];
  const failures = [];
  for (const scenario of cases) {
    const actual = evaluate(jobGate, {
      "inputs.dry_run": scenario.dry,
      "github.event.inputs.dry_run": scenario.dry === "" ? "" : String(scenario.dry),
      "github.event_name": scenario.event,
      "needs.refresh-indices.outputs.has_index_changes": scenario.changed,
      "needs.refresh-indices.result": scenario.result,
      "needs.generate-updates.result": scenario.generation ?? "success",
    });
    if (actual !== scenario.expected) failures.push(`${scenario.name}: write job ${actual ? "allowed" : "blocked"}`);
  }
  assert.deepEqual(failures, [], `Workflow write-gate failures: ${failures.join("; ")}`);
  return cases.length;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.stdout.write(`OK: ${runWorkflowRegressions(process.cwd())} workflow write-gate regressions passed.\n`);
}
