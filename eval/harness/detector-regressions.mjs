import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function runDetectorRegressions(repoRoot) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "wp-detector-regressions-"));
  const failures = [];
  let checks = 0;
  function fixture(name, files) {
    const root = path.join(scratch, name);
    fs.mkdirSync(root, { recursive: true });
    for (const [file, contents] of Object.entries(files)) {
      const destination = path.join(root, file);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, contents);
    }
    return root;
  }
  function run(skill, script, cwd, skillsRoot = path.join(repoRoot, "skills")) {
    const result = spawnSync(process.execPath, [path.join(skillsRoot, skill, "scripts", script)], {
      cwd, encoding: "utf8", timeout: 15000,
    });
    assert.equal(result.status, 0, result.error?.message ?? result.stderr);
    return JSON.parse(result.stdout);
  }
  function check(name, callback) {
    checks += 1;
    try { callback(); } catch (error) { failures.push(`${name}: ${error.message}`); }
  }
  const themeHeader = "/*\nTheme Name: Fixture\n*/\n";
  const blockIndex = "<!-- wp:paragraph --><p>Fixture</p><!-- /wp:paragraph -->\n";
  try {
    for (const indexPath of ["templates/index.html", "block-templates/index.html"]) {
      const root = fixture(indexPath.split("/")[0], { "style.css": themeHeader, [indexPath]: blockIndex });
      const triage = run("wp-project-triage", "detect_wp_project.mjs", root);
      const inventory = run("wp-block-themes", "detect_block_themes.mjs", root);
      check(`${indexPath}: triage without theme.json`, () => assert.equal(triage.project.primary, "wp-block-theme"));
      check(`${indexPath}: inventory without theme.json`, () => {
        assert.equal(inventory.count, 1);
        assert.equal(inventory.themes[0].isBlockTheme, true);
        assert.equal(inventory.themes[0].themeJson, null);
      });
    }
    const classic = fixture("classic", {
      "style.css": themeHeader, "index.php": "<?php\n", "theme.json": '{"version":3}',
      "parts/header.php": "<?php\n", "templates/single.html": blockIndex,
    });
    check("classic with parts and theme.json stays classic", () => {
      assert.equal(run("wp-project-triage", "detect_wp_project.mjs", classic).project.primary, "wp-theme");
      assert.equal(run("wp-block-themes", "detect_block_themes.mjs", classic).themes[0].isBlockTheme, false);
    });
    const nested = fixture("nested", {
      "theme/style.css": themeHeader, "theme/templates/index.html": blockIndex,
    });
    check("nested theme uses its own root", () => {
      assert.equal(run("wp-project-triage", "detect_wp_project.mjs", nested).project.primary, "wp-block-theme");
      assert.equal(run("wp-block-themes", "detect_block_themes.mjs", nested).themes[0].themeRoot, "theme");
    });
    const decoy = fixture("decoy-root", {
      "theme/style.css": themeHeader, "theme/index.php": "<?php\n", "theme/theme.json": '{"version":3}',
      "templates/index.html": blockIndex,
    });
    check("wrapper templates do not relabel nested classic theme", () => {
      assert.equal(run("wp-project-triage", "detect_wp_project.mjs", decoy).project.primary, "wp-theme");
    });
    const plugin = fixture("plugin-with-theme-fixture", {
      "plugin.php": "<?php\n/*\nPlugin Name: Fixture Plugin\n*/\n",
      "tests/theme/style.css": themeHeader, "tests/theme/templates/index.html": blockIndex,
    });
    check("nested theme fixture does not relabel a plugin", () => {
      assert.equal(run("wp-project-triage", "detect_wp_project.mjs", plugin).project.primary, "wp-plugin");
    });
    const child = fixture("child-theme", {
      "child/style.css": "/*\nTheme Name: Child\nTemplate: parent\n*/\n",
      "parent/style.css": themeHeader, "parent/templates/index.html": blockIndex,
    });
    check("child theme inherits an in-scope parent index template", () => {
      assert.equal(run("wp-project-triage", "detect_wp_project.mjs", child).project.primary, "wp-block-theme");
      const inventory = run("wp-block-themes", "detect_block_themes.mjs", child);
      assert.equal(inventory.themes.find((theme) => theme.themeRoot === "child").isBlockTheme, true);
    });
    fs.mkdirSync(path.join(child, "child/templates/index.html"), { recursive: true });
    check("an invalid child override shadows the same parent template", () => {
      assert.equal(run("wp-project-triage", "detect_wp_project.mjs", child).project.primary, "wp-theme");
    });
    for (const dependencyType of ["require", "require-dev"]) {
      const root = fixture(`phpunit-${dependencyType}`, {
        "composer.json": JSON.stringify({ [dependencyType]: { "phpunit/phpunit": "^10.0" } }),
      });
      const triage = run("wp-project-triage", "detect_wp_project.mjs", root);
      check(`PHPUnit in ${dependencyType} is declared but not installed`, () => {
        assert.equal(triage.tooling.tests.hasPhpUnit, true);
        assert.equal(triage.tooling.php.hasPhpUnitDependency, true);
        assert.equal(triage.tooling.php.hasPhpUnitExecutable, false);
        assert.equal(triage.recommendations.commands.includes("vendor/bin/phpunit"), false);
      });
    }
    const installed = fixture("phpunit-installed", {
      "composer.json": '{"require-dev":{"phpunit/phpunit":"^10.0"}}', "vendor/bin/phpunit": "#!/usr/bin/env php\n",
    });
    check("installed PHPUnit executable is reported separately", () => {
      assert.equal(run("wp-project-triage", "detect_wp_project.mjs", installed).tooling.php.hasPhpUnitExecutable, true);
    });
    const unrelated = fixture("unrelated-tool", { "composer.json": '{"require-dev":{"phpunit":"invalid-key"}}' });
    check("a non-Composer phpunit key is not a PHPUnit dependency", () => {
      assert.equal(run("wp-project-triage", "detect_wp_project.mjs", unrelated).tooling.tests.hasPhpUnit, false);
    });
    const target = fixture("separate target project", { "style.css": themeHeader, "templates/index.html": blockIndex });
    const skillsRoot = path.join(scratch, "installed skills");
    for (const skill of ["wp-project-triage", "wp-block-themes"]) {
      fs.cpSync(path.join(repoRoot, "skills", skill), path.join(skillsRoot, skill), { recursive: true });
      const script = skill === "wp-project-triage" ? "detect_wp_project.mjs" : "detect_block_themes.mjs";
      check(`installed ${skill} scans the target cwd with spaces`, () => {
        const report = run(skill, script, target, skillsRoot);
        assert.equal(report.repoRoot ?? report.signals.paths.repoRoot, target);
        assert.equal(report.project?.primary ?? report.themes[0]?.isBlockTheme, skill === "wp-project-triage" ? "wp-block-theme" : true);
      });
    }
    const ai = fixture("ai-paths", { "assets/sdk.php": "<?php AiClient::prompt( 'Hello' );\n" });
    check("AI detector reports portable feature paths", () => {
      assert.deepEqual(run("wp-ai-client", "detect_ai_client.mjs", ai).feature_endpoints, ["assets/sdk.php"]);
    });
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  assert.equal(failures.length, 0, `${failures.length}/${checks} detector regressions failed:\n${failures.join("\n")}`);
  return checks;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const checks = runDetectorRegressions(process.cwd());
  process.stdout.write(`OK: ${checks} detector and installed-launch regressions passed.\n`);
}
