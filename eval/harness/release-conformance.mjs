import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseWpGutenbergMapFromHtml } from "../../shared/scripts/upstream-index-lib.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(repoRoot, relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function readJson(repoRoot, relativePath) {
  return JSON.parse(read(repoRoot, relativePath));
}

const IMMEDIATE_UNWATCH_PATTERN = /\}\s*\);\s*(?:\/\/[^\r\n]*\r?\n)?\s*unwatch\(\);/;

export function requireIncludes(repoRoot, relativePath, expected) {
  const content = read(repoRoot, relativePath);
  for (const value of expected) {
    assert(content.includes(value), `${relativePath} must include: ${value}`);
  }
}

export function requireExcludes(repoRoot, relativePath, forbidden) {
  const content = read(repoRoot, relativePath);
  for (const value of forbidden) {
    assert(!content.includes(value), `${relativePath} must not include: ${value}`);
  }
}

export function requireNoMatch(repoRoot, relativePath, pattern, message) {
  const content = read(repoRoot, relativePath);
  assert(!pattern.test(content), `${relativePath} ${message}`);
}

const PLUGIN_MANIFEST = ".claude-plugin/plugin.json";

function git(repoRoot, args) {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

/**
 * Marketplace consumers only receive an update when the resolved plugin version
 * changes. Because `plugin.json` declares an explicit `version`, that string is
 * the update signal — pushing commits without bumping it leaves every installed
 * copy pinned, and `/plugin update` reports "already at the latest version".
 *
 * Fail when `skills/` has moved since the commit that last changed the version,
 * so the bump lands in the same change as the content it ships.
 *
 * https://code.claude.com/docs/en/plugins-reference#version-management
 */
export function assertPluginVersionFresh(repoRoot) {
  // Requires real history: shallow clones and source tarballs cannot answer this.
  if (git(repoRoot, ["rev-parse", "--is-inside-work-tree"]) !== "true") return;
  if (git(repoRoot, ["rev-parse", "--is-shallow-repository"]) === "true") return;

  // -G, not -S: -S counts occurrences of the string, so changing "1.1.0" to
  // "1.2.0" leaves the count of `"version"` at one and the bump goes unseen.
  const lastBump = git(repoRoot, ["log", "-1", "--format=%H", "-G", '"version":', "--", PLUGIN_MANIFEST]);
  if (!lastBump) return;

  const changed = git(repoRoot, ["diff", "--name-only", `${lastBump}..HEAD`, "--", "skills/"]);
  if (changed === null || changed === "") return;

  const files = changed.split("\n").filter(Boolean);
  throw new Error(
    [
      `${files.length} file(s) under skills/ changed since the last ${PLUGIN_MANIFEST} version bump (${lastBump.slice(0, 7)}).`,
      `Marketplace users stay pinned to the current version and will not receive them.`,
      `Bump "version" in ${PLUGIN_MANIFEST} and .claude-plugin/marketplace.json in this change.`,
      `Changed: ${files.slice(0, 5).join(", ")}${files.length > 5 ? `, +${files.length - 5} more` : ""}`,
    ].join(" ")
  );
}

export function runReleaseConformance(repoRoot) {
  assertPluginVersionFresh(repoRoot);
  assert(
    IMMEDIATE_UNWATCH_PATTERN.test("const unwatch = watch( () => { return cleanup; } );\n// Dispose later.\nunwatch();"),
    "Immediate-unwatch regression fixture must exercise the structural check"
  );
  const reversedHeaderFixture = `
    <table>
      <tr><th>Gutenberg Version</th><th>WordPress Version</th></tr>
      <tr><td>22.6</td><td>7.0.X</td></tr>
      <tr><td>21.9</td><td>6.9.X</td></tr>
    </table>`;
  const parsed = parseWpGutenbergMapFromHtml(reversedHeaderFixture);
  assert(parsed.rows.length === 2, "Version-map parser must return both rows");
  assert(
    parsed.rows[0].wordpress === "7.0.X" && parsed.rows[0].gutenberg === "22.6",
    "Version-map parser must map columns by header, not position"
  );
  assert(parsed.note === null, "A successful map parse must have note: null");

  let missingTableError = null;
  try {
    parseWpGutenbergMapFromHtml("<p>No mapping table</p>");
  } catch (error) {
    missingTableError = error;
  }
  assert(missingTableError, "Missing mapping data must throw");

  const core = readJson(repoRoot, "shared/references/wordpress-core-versions.json");
  const gutenberg = readJson(repoRoot, "shared/references/gutenberg-releases.json");
  const map = readJson(repoRoot, "shared/references/wp-gutenberg-version-map.json");
  assert(core.latest === "7.0.2", "WordPress latest must be 7.0.2");
  assert(
    core.recent.includes("6.9.5"),
    "WordPress recent must include maintained release 6.9.5"
  );
  assert(gutenberg.latest?.tag === "v23.5.3", "Gutenberg latest must be v23.5.3");
  assert(map.note === null && map.rows.length > 0, "WP/Gutenberg map must be non-empty");
  assert(
    map.rows.some((row) => row.wordpress === "7.0.X" && row.gutenberg === "22.6"),
    "WP/Gutenberg map must include WordPress 7.0.X → Gutenberg 22.6"
  );

  requireIncludes(repoRoot, "README.md", [
    "--targets=antigravity",
    ".agents/skills/",
    "--targets=antigravity-global",
    "~/.gemini/antigravity/skills/",
  ]);
  requireIncludes(repoRoot, "docs/packaging.md", [
    "dist/antigravity/.agents/skills/*",
    "--targets=antigravity",
    "--targets=antigravity-global",
  ]);

  requireIncludes(repoRoot, "skills/blueprint/SKILL.md", [
    '"version": 2',
    '"blueprintMeta"',
    '"applicationOptions"',
    '"additionalStepsAfterExecution"',
    "references/v1-compatibility.md",
  ]);
  requireExcludes(repoRoot, "skills/blueprint/SKILL.md", [
    'Object = `{ username?, password? }`',
  ]);
  requireIncludes(repoRoot, "skills/blueprint/references/v1-compatibility.md", [
    '"resource": "git:directory"',
    '"resource": "literal:directory"',
    '"resource": "bundled"',
    '"step": "installPlugin"',
    '"pluginData"',
    '"step": "writeFiles"',
    '"filesTree"',
    '"step": "runPHP"',
    "require '/wordpress/wp-load.php';",
    '"step": "runSql"',
    '"step": "importWordPressFiles"',
    '"wordPressFilesZip"',
    '"step": "request"',
    '"userId"',
  ]);

  for (const file of [
    "skills/wp-playground/SKILL.md",
    "skills/wp-playground/references/cli.md",
    "skills/wp-playground/references/website.md",
    "skills/wp-playground/references/debugging.md",
  ]) {
    requireExcludes(repoRoot, file, [
      "--enable-xdebug",
      "--experimental-multi-worker",
      "--skip-wordpress-setup",
    ]);
  }
  requireIncludes(repoRoot, "skills/wp-playground/references/cli.md", [
    "3.1.45",
    "@wp-playground/cli@3.1.45 start",
    "--xdebug",
    "--workers=auto",
    "--wordpress-install-mode=install-from-existing-files-if-needed",
    '"8.5"',
  ]);
  requireIncludes(repoRoot, "skills/wp-playground/SKILL.md", [
    "references/cli.md",
    "references/website.md",
    "references/debugging.md",
  ]);

  // MCP Adapter 0.6.0 reversed the packaging recommendation (bundling is
  // deprecated in favour of the canonical plugin) and moved exposure into
  // McpAbilityExposure::is_public(), which inherits meta.public when
  // meta.mcp.public is absent. WordPress 7.1 added meta.public and marks every
  // core ability public, so "omitting meta.mcp.public hides it" is now false.
  requireIncludes(repoRoot, "skills/wp-abilities-api/references/mcp-exposure.md", [
    "meta.mcp.public",
    "McpAbilityExposure",
    "Requires Plugins: mcp-adapter",
    "wp plugin install https://github.com/WordPress/mcp-adapter/releases/latest/download/mcp-adapter.zip",
    "WordPress 6.9+ and PHP 7.4+",
    "WP\\MCP\\Transport\\HttpTransport",
    "WP\\MCP\\Infrastructure\\ErrorHandling\\ErrorLogMcpErrorHandler",
    "WP\\MCP\\Infrastructure\\Observability\\NullMcpObservabilityHandler",
  ]);
  requireExcludes(repoRoot, "skills/wp-abilities-api/references/mcp-exposure.md", [
    "discover and call every server-registered ability",
    "vendor/autoloader.php",
    "WP\\MCP\\Transport\\Http\\HttpTransport",
    "ErrorHandling\\Implementations",
    "Observability\\Implementations",
    "The adapter is designed to be a Composer dependency",
    "ships in no release as of 0.5.0",
    "reads that key and nothing else",
  ]);
  requireIncludes(repoRoot, "skills/wp-abilities-api/SKILL.md", [
    "MCP Adapter 0.6.x requires **WordPress 6.9+ and PHP 7.4+**",
    "upgrade the site runtime or stop before installing the adapter",
    "Read `references/mcp-exposure.md` before giving installation, bootstrap, or server code.",
    "Install the canonical MCP Adapter plugin",
    "Requires Plugins: mcp-adapter",
  ]);
  requireIncludes(repoRoot, "skills/wp-abilities-api/references/php-registration.md", [
    "@since 7.1.0",
    "$args['meta']['show_in_rest'] ?? $args['meta']['public'] ?? false",
  ]);
  requireExcludes(repoRoot, "skills/wp-abilities-api/references/php-registration.md", [
    "`meta.public` is not a key the core Abilities API defines",
  ]);
  requireIncludes(repoRoot, "eval/scenarios/abilities-mcp-expose.json", [
    "PHP 7.4+",
    "Requires Plugins",
    "meta.public",
  ]);
  requireExcludes(repoRoot, "skills/wp-abilities-api/references/client-side.md", [
    "currentUserCan(",
    "core enqueues `@wordpress/core-abilities` on all admin pages",
  ]);
  requireIncludes(repoRoot, "skills/wp-abilities-api/references/client-side.md", [
    "wp_enqueue_script_module( '@wordpress/core-abilities' )",
    "data-can-manage-options",
  ]);

  requireIncludes(repoRoot, "skills/wp-ai-client/SKILL.md", [
    "is_wp_error( $result )",
    "get_error_message()",
    "PHP AI Client 1.3.1",
    "PHP AI Client 1.5.0",
    "AiClient::generateEmbeddingResult()",
    "usingProviderModel(",
  ]);
  // php-ai-client 1.5.0 removed automatic model resolution from EmbeddingBuilder
  // (#274). Every embedding example must name a model, and the builder must no
  // longer be described as sharing the prompt builder's resolution trait.
  requireIncludes(repoRoot, "skills/wp-ai-client/references/embedding-builder.md", [
    "usingProviderModel(",
    "An embedding model must be specified",
    "AiClient::generateEmbeddings()",
    "BeforeGenerateEmbeddingEvent",
    "AfterGenerateEmbeddingEvent",
  ]);
  requireExcludes(repoRoot, "skills/wp-ai-client/references/embedding-builder.md", [
    "`EmbeddingBuilder` also uses `ModelResolutionTrait`",
    "$model_or_config",
  ]);
  requireExcludes(repoRoot, "skills/wp-ai-client/SKILL.md", [
    "Pull `getProviderMetadata()` off the result",
  ]);

  for (const file of [
    "skills/wp-ai-plugin/SKILL.md",
    "skills/wp-ai-plugin/references/dashboard-widgets.md",
    "skills/wp-ai-plugin/references/experiments-framework.md",
    "skills/wp-ai-plugin/references/hooks-and-filters.md",
  ]) {
    requireExcludes(repoRoot, file, ["v1.0.2", "'1.0.2'"]);
  }
  // AI plugin 1.3.0 gated the five built-in read Abilities behind the
  // Custom Abilities experiment (#881) and released the ability-scoped prompt
  // hooks that 1.2.0-era notes called unreleased.
  requireIncludes(repoRoot, "skills/wp-ai-plugin/references/experiments-framework.md", [
    "v1.3.0",
    "Type_Ahead",
    "Key_Encryption",
    "Suggest_Reply",
    "Custom_Abilities",
    "Slug_Generation",
    "wpai_gated_abilities",
    "Abstract_Gated_Ability",
    "core/read-content",
    "core/read-users",
  ]);
  requireExcludes(repoRoot, "skills/wp-ai-plugin/references/experiments-framework.md", [
    "### Added after v1.2.0 (unreleased on",
    "The v1.2.0 plugin directly registers five non-Experiment utility/read Abilities",
  ]);
  requireIncludes(repoRoot, "skills/wp-ai-plugin/references/hooks-and-filters.md", [
    "wpai_default_request_timeout",
    "wpai_settings_feature_groups",
    "wpai_settings_feature_metadata",
    "The global `wpai_system_instruction` hook ships in v1.2.0",
    "wpai_gated_abilities",
    "wpai_remove_data_on_uninstall",
    "log_ai_request",
    "### Ability-scoped prompt filters (v1.3.0+)",
  ]);
  requireIncludes(repoRoot, "skills/wp-ai-plugin/references/guidelines-integration.md", [
    "that hook ships in v1.2.0",
    "wpai_{$ability_slug}_system_instruction",
  ]);
  requireIncludes(repoRoot, "skills/wp-ai-plugin/SKILL.md", [
    "current canonical release: v1.3.0",
    "Custom Abilities",
  ]);
  // docs/skill-audit.md finding 1: cross-skill scripts must resolve from the
  // skill root, so a standalone install degrades instead of failing.
  requireExcludes(repoRoot, "skills/wp-ai-plugin/SKILL.md", [
    "node skills/wp-project-triage/scripts/detect_wp_project.mjs",
  ]);
  requireIncludes(repoRoot, "skills/wp-ai-connectors/references/capabilities-declaration.md", [
    "CapabilityEnum::embeddingGeneration()",
    "OptionEnum::dimensions()",
    "EmbeddingGenerationModelInterface",
    "supportedOptions",
  ]);
  requireIncludes(repoRoot, "skills/wordpress-router/references/decision-tree.md", [
    "EmbeddingBuilder",
    "EmbeddingGenerationModelInterface",
    "Content Translation",
  ]);

  for (const file of [
    "skills/wp-block-development/SKILL.md",
    "skills/wp-block-development/references/block-json.md",
  ]) {
    requireIncludes(repoRoot, file, ["every block inserted", "API version 3"]);
    requireExcludes(repoRoot, file, ["regardless of block apiVersion", "always use the iframe"]);
  }
  requireIncludes(repoRoot, "skills/wp-block-themes/references/theme-json.md", [
    "## WordPress 7.0 additions",
    "settings.dimensions",
    "width",
    "height",
    "min-height",
    ":focus-visible",
  ]);
  requireExcludes(repoRoot, "skills/wp-block-themes/references/theme-json.md", [
    "**Button pseudo-classes:**",
    "Style Button block hover and focus states directly in theme.json.",
  ]);
  requireIncludes(repoRoot, "skills/wp-block-themes/references/theme-json.md", [
    "## Slug normalisation gotcha",
    "_wp_to_kebab_case()",
    "slug `3xl` becomes `--wp--preset--font-size--3-xl`",
    "var\\(\\s*--wp--(?:preset|custom)--[a-z-]+--\\d+[a-z]",
    "`styles.elements.textInput`",
    "email, number, password, search, text, tel, url",
    "There is no `input`, `checkbox`, `radio`, or `label` element key.",
  ]);
  requireExcludes(repoRoot, "skills/wp-block-themes/references/theme-json.md", [
    "`styles.elements.input`",
  ]);
  requireIncludes(repoRoot, "skills/wp-block-themes/references/debugging.md", [
    "the slug is likely un-normalised",
    "Slug normalisation gotcha",
  ]);
  requireIncludes(repoRoot, "skills/wp-patterns/SKILL.md", [
    "name: wp-patterns",
    "license: GPL-2.0-or-later",
    "WordPress 6.9 with PHP 7.2.24 or later",
    "No inline `<style>` tags",
    "Always escape",
    "Prefer presets over hardcoded values",
    "references/pattern-registration.md",
    "references/block-markup-reference.md",
  ]);
  requireIncludes(repoRoot, "skills/wp-patterns/references/pattern-registration.md", [
    "Auto-Registration via `/patterns/` Directory",
    "register_block_pattern()",
    "esc_html_e()",
  ]);
  requireIncludes(repoRoot, "skills/wp-patterns/references/design-with-tokens.md", [
    "theme.json",
    "Preset",
  ]);
  requireIncludes(repoRoot, "skills/wp-interactivity-api/SKILL.md", [
    "watch()",
    "unwatch()",
    "export function disposeNavigationAnalytics()",
    "Do not call it immediately after registering the watcher.",
    "state.url",
    "state.navigation.hasStarted",
    "state.navigation.hasFinished",
  ]);
  requireNoMatch(
    repoRoot,
    "skills/wp-interactivity-api/SKILL.md",
    IMMEDIATE_UNWATCH_PATTERN,
    "must not call unwatch immediately after watch registration"
  );
  requireNoMatch(
    repoRoot,
    "skills/wp-interactivity-api/SKILL.md",
    /state\.navigation\.(?:hasStarted|hasFinished)(?!`)/,
    "must mention deprecated navigation state only as code-formatted prose, never as a recommended direct read"
  );

  for (const file of [
    "skills/wp-plugin-directory-guidelines/SKILL.md",
    "skills/wp-plugin-directory-guidelines/references/gpl-compliance.md",
    "skills/wp-plugin-directory-guidelines/references/guideline-review-checklist.md",
  ]) {
    requireIncludes(repoRoot, file, ["License URI", "optional"]);
    requireExcludes(repoRoot, file, [
      "Missing `License:` or `License URI:`",
      "has a `License URI:` header",
    ]);
  }
  requireIncludes(repoRoot, "skills/wpds/SKILL.md", [
    "If the WPDS MCP server is unavailable",
    "developer.wordpress.org/block-editor/reference-guides/components",
    "@wordpress/components",
    "@wordpress/ui",
    "get_components",
    "get_component_details",
    "get_design_tokens",
    "npm 11.10.0 or newer",
    "do not enforce the two-day delay",
  ]);
  requireExcludes(repoRoot, "skills/wpds/SKILL.md", [
    "Requires WPDS MCP server configured and running",
    "DO NOT search the web",
    "wpds://",
  ]);
}
