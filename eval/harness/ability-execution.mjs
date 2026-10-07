import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export function runAbilityExecutionRegression(repoRoot) {
  const fixture = path.join(repoRoot, "eval/fixtures/core-7.1.3");
  const provenance = JSON.parse(fs.readFileSync(path.join(fixture, "provenance.json"), "utf8"));
  const source = fs.readFileSync(path.join(fixture, "class-wp-ability.php"), "utf8").replace(/\r\n/g, "\n");
  assert.equal(createHash("sha256").update(source).digest("hex"), provenance.sha256Lf, "Frozen Core ability fixture differs from its reviewed upstream source");
  const result = spawnSync("php", [path.join(repoRoot, "eval/harness/ability-execution.php")], { encoding: "utf8", timeout: 15000 });
  if (result.error?.code === "ENOENT" && process.env.CI !== "true") {
    process.stdout.write("SKIP: direct-PHP Core execution regression requires PHP CLI; run php eval/harness/ability-execution.php.\n");
    return false;
  }
  assert.equal(result.status, 0, result.error?.message ?? result.stderr ?? result.stdout);
  process.stdout.write(result.stdout);
  return true;
}
