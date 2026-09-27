#!/usr/bin/env bash
# Live smoke test for skills/wp-ai-plugin against real WordPress + the
# canonical AI plugin in WordPress Playground. Requires Node >= 20.18 and
# network access (downloads WP + the ai plugin zip on each run).
set -euo pipefail
cd "$(dirname "$0")"
# The MU plugin writes its result into the mounted directory. Remove it on every
# exit path so a run never leaves a working-tree artifact behind.
trap 'rm -f mu-plugins/result.json' EXIT

rm -f mu-plugins/result.json
npx -y @wp-playground/cli@latest run-blueprint \
  --blueprint=./blueprint.json \
  --mount="$PWD/mu-plugins:/wordpress/wp-content/mu-plugins"

node --input-type=module -e '
import fs from "node:fs";
const r = JSON.parse(fs.readFileSync("mu-plugins/result.json", "utf8"));
const failures = [];
const gated = ["read_content", "read_users", "read_settings", "get_post_details", "get_post_terms"];
const versionAtLeast = (actual, minimum) => {
  const a = String(actual ?? "").split(".").map(Number);
  const b = minimum.split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) > (b[index] ?? 0);
  }
  return true;
};
if (!r.abstract_feature) failures.push("WordPress\\AI\\Abstracts\\Abstract_Feature class missing");
if (!versionAtLeast(r.wpai_version, "1.3.0")) failures.push(`AI plugin ${JSON.stringify(r.wpai_version)} is older than 1.3.0`);
for (const phase of ["disabled", "enabled"]) {
  const state = r[phase];
  if (!state) {
    failures.push(`${phase} state missing`);
    continue;
  }
  if (!state.smoke_ability) failures.push(`${phase}: downstream ability smoke/echo not registered (filter -> Loader -> register() chain broke)`);
  if (state.smoke_exec !== "hi") failures.push(`${phase}: smoke/echo execute returned ${JSON.stringify(state.smoke_exec)} (expected "hi")`);
  if (!state.suggest_reply) failures.push(`${phase}: suggest_reply ability missing`);
}
if (r.disabled?.custom_abilities_feature) failures.push("disabled: Custom Abilities toggle unexpectedly enabled");
if (!r.enabled?.custom_abilities_feature) failures.push("enabled: Custom Abilities toggle did not enable");
for (const key of gated) {
  if (r.disabled?.[key]) failures.push(`disabled: ${key} ability unexpectedly registered`);
  if (!r.enabled?.[key]) failures.push(`enabled: ${key} ability missing`);
}
if (failures.length) {
  console.error("SMOKE FAIL:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(`SMOKE OK (AI plugin ${r.wpai_version}; disabled gated abilities: 0/5; enabled gated abilities: 5/5)`);
'
