import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CORE_AI_UPSTREAMS } from "../../shared/scripts/core-ai-upstreams.mjs";
import { getUpstreamStateHash, loadUpstreamIndices } from "../../shared/scripts/ai-generate-updates.mjs";
import { assertCompleteMaintenanceState } from "./release-conformance.mjs";

export function runMaintenancePreviewRegressions(repoRoot) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "maintenance-preview-"));
  const stateFile = ".github/state/last-sync.json";
  // Seed a reviewed baseline only inside the fixture. The caller may itself be
  // validating unreviewed indices; never advance its on-disk maintenance state.
  const originalState = JSON.stringify(getUpstreamStateHash(loadUpstreamIndices(repoRoot)), null, 2);
  const write = (relative, value) => {
    const file = path.join(scratch, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
  };
  let checks = 0;
  const failures = [];
  const check = (name, fn) => {
    checks++;
    try { fn(); } catch (error) { failures.push(`${name}: ${error.message}`); }
  };
  try {
    for (const upstream of CORE_AI_UPSTREAMS) write(upstream.indexFile, fs.readFileSync(path.join(repoRoot, upstream.indexFile), "utf8"));
    write(stateFile, originalState);
    check("reviewed indices pass the strict state gate", () => assertCompleteMaintenanceState(scratch));
    const mcp = CORE_AI_UPSTREAMS.find((upstream) => upstream.id === "mcp-adapter");
    const index = JSON.parse(fs.readFileSync(path.join(scratch, mcp.indexFile), "utf8"));
    const parts = index.latest.tag.replace(/^v/, "").split(".");
    parts[parts.length - 1] = String(Number(parts.at(-1)) + 1);
    index.latest.tag = `v${parts.join(".")}`;
    write(mcp.indexFile, index);
    check("unreviewed indices remain blocked by default", () => assert.throws(() => assertCompleteMaintenanceState(scratch), /match every committed upstream index/));
    check("index preview accepts refreshed indices without advancing state", () => assertCompleteMaintenanceState(scratch, { indexPreview: true }));
    check("preview preserves the recorded state byte for byte", () => assert.equal(fs.readFileSync(path.join(scratch, stateFile), "utf8"), originalState));
    const badChecksum = JSON.parse(originalState);
    badChecksum.hash = "0".repeat(64);
    write(stateFile, badChecksum);
    check("preview rejects a corrupt recorded checksum", () => assert.throws(() => assertCompleteMaintenanceState(scratch, { indexPreview: true }), /checksum/));
    const missingSource = JSON.parse(originalState);
    delete missingSource.state.fingerprints["mcp-adapter"];
    write(stateFile, missingSource);
    check("preview rejects an incomplete recorded source state", () => assert.throws(() => assertCompleteMaintenanceState(scratch, { indexPreview: true }), /fingerprint/));
    write(stateFile, originalState);
    index.latest.tag = "";
    write(mcp.indexFile, index);
    check("preview rejects an invalid refreshed index", () => assert.throws(() => assertCompleteMaintenanceState(scratch, { indexPreview: true }), /indexed latest release/));
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  assert.equal(failures.length, 0, `${failures.length}/${checks} maintenance preview cases failed:\n${failures.join("\n")}`);
  return checks;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.stdout.write(`OK: ${runMaintenancePreviewRegressions(process.cwd())} maintenance preview regressions passed.\n`);
}
