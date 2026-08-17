import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseWpGutenbergMapFromHtml } from "../../shared/scripts/upstream-index-lib.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** Numeric version compare. String comparison ranks "7.0.10" below "7.0.4". */
function compareSemver(a, b) {
  const pa = String(a).split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
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
const MARKETPLACE_MANIFEST = ".claude-plugin/marketplace.json";

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

/**
 * Keep the marketplace catalog entry's version in step with the plugin manifest.
 *
 * `assertPluginVersionFresh` above only reads `plugin.json` — it tells you to
 * bump both files, but nothing checks that you did. So the catalog entry can
 * silently keep advertising the previous version while `plugin.json` moves on,
 * and a marketplace consumer reading the catalog never learns an update exists.
 * That is the same failure the freshness gate exists to prevent, one file over.
 *
 * A catalog entry that omits `version` resolves it from `plugin.json` and can
 * never drift, so only a declared version is checked.
 */
export function assertMarketplaceVersionMatches(repoRoot) {
  const plugin = readJson(repoRoot, PLUGIN_MANIFEST);
  const marketplace = readJson(repoRoot, MARKETPLACE_MANIFEST);

  assert(
    typeof plugin.version === "string" && plugin.version !== "",
    `${PLUGIN_MANIFEST} must declare a non-empty "version" string`
  );
  assert(
    Array.isArray(marketplace.plugins),
    `${MARKETPLACE_MANIFEST} must declare a "plugins" array`
  );

  // Join on name: the catalog may list plugins this repo does not own.
  const entry = marketplace.plugins.find((p) => p && p.name === plugin.name);
  assert(
    entry,
    `${MARKETPLACE_MANIFEST} has no entry named "${plugin.name}" — the plugin this repo ships is not listed in its own marketplace catalog.`
  );

  if (entry.version === undefined) return;

  assert(
    entry.version === plugin.version,
    `${MARKETPLACE_MANIFEST} lists "${plugin.name}" at version ${entry.version} but ${PLUGIN_MANIFEST} declares ${plugin.version}. Bump both together, or drop "version" from the catalog entry so it resolves from the manifest.`
  );
}

export function runReleaseConformance(repoRoot) {
  assertPluginVersionFresh(repoRoot);
  assertMarketplaceVersionMatches(repoRoot);
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
  // The core index tracks a moving upstream. Pinning an exact version here
  // guarantees the assertion goes stale and then blocks the very refresh it
  // exists to protect — which is how this index sat at 7.0.2 while WordPress
  // shipped 7.0.4. Assert shape and a floor instead, and leave "a new minor
  // shipped, go re-verify the skills" to the drift gate in
  // shared/scripts/check-upstream-drift.mjs, which reports it with the
  // context needed to act on it.
  const CORE_FLOOR = "7.0.4";
  assert(typeof core.latest === "string", "WordPress core index must have a latest version string");
  assert(
    Array.isArray(core.recent) && core.recent[0] === core.latest,
    "WordPress core index recent[] must be sorted newest-first and lead with latest"
  );
  assert(
    compareSemver(core.latest, CORE_FLOOR) >= 0,
    `WordPress latest must not regress below ${CORE_FLOOR} (found ${core.latest}) — refresh with shared/scripts/update-upstream-indices.mjs`
  );
  assert(
    core.recent.some((v) => v.startsWith("6.9.")),
    "WordPress recent must include the maintained 6.9 branch (the Abilities API floor)"
  );
  // Same reasoning as CORE_FLOOR above — this assertion was an exact pin at
  // v23.5.3 and did exactly what the comment predicts: the index refreshed to
  // v23.7.2 and the pin rejected it. The failure stayed hidden because
  // assertPluginVersionFresh() throws earlier in this function, so it only
  // surfaced once that gate was satisfied. Floor, not pin.
  const GUTENBERG_FLOOR = "23.5.3";
  assert(
    typeof gutenberg.latest?.tag === "string" && gutenberg.latest.tag.startsWith("v"),
    "Gutenberg index must have a latest.tag string in vX.Y.Z form"
  );
  assert(
    Array.isArray(gutenberg.recent) && gutenberg.recent[0]?.tag === gutenberg.latest.tag,
    "Gutenberg index recent[] must be sorted newest-first and lead with latest"
  );
  assert(
    compareSemver(gutenberg.latest.tag.replace(/^v/, ""), GUTENBERG_FLOOR) >= 0,
    `Gutenberg latest must not regress below v${GUTENBERG_FLOOR} (found ${gutenberg.latest.tag}) — refresh with shared/scripts/update-upstream-indices.mjs`
  );
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

  requireIncludes(repoRoot, "skills/wp-abilities-api/references/mcp-exposure.md", [
    "meta.mcp.public",
    "composer require automattic/jetpack-autoloader",
    "vendor/autoload_packages.php",
    "^7.4 || ^8.0",
    "WP\\MCP\\Transport\\HttpTransport",
    "WP\\MCP\\Infrastructure\\ErrorHandling\\ErrorLogMcpErrorHandler",
    "WP\\MCP\\Infrastructure\\Observability\\NullMcpObservabilityHandler",
    // Adapter 0.6.0 reversed the default: an absent meta.mcp.public now
    // inherits meta.public. Guidance that omits this understates the MCP
    // surface, so the reversal must stay documented.
    "Current release: 0.6.1",
    "McpAbilityExposure::is_public()",
    "@since 0.6.0",
    "verified in v0.6.1",
  ]);
  requireExcludes(repoRoot, "skills/wp-abilities-api/references/mcp-exposure.md", [
    "discover and call every server-registered ability",
    "vendor/autoloader.php",
    "WP\\MCP\\Transport\\Http\\HttpTransport",
    "ErrorHandling\\Implementations",
    "Observability\\Implementations",
    // Pre-0.6.0 claims. Both are now false and the second is security-relevant.
    "ships in no release as of 0.5.0",
    "is not a key the core Abilities API defines",
  ]);
  requireIncludes(repoRoot, "skills/wp-abilities-api/SKILL.md", [
    "MCP Adapter 0.6.1 requires PHP 7.4+",
    "current canonical release: v0.6.1",
    "upgrade the site runtime or stop before installing the adapter",
    "Read `references/mcp-exposure.md` before giving installation, bootstrap, or server code.",
    "composer require automattic/jetpack-autoloader",
    "vendor/autoload_packages.php",
    "meta.mcp.public ?? meta.public ?? false",
    "references/execution-lifecycle.md",
  ]);
  requireExcludes(repoRoot, "skills/wp-abilities-api/SKILL.md", [
    "released adapter 0.5.0 reads that key and nothing else",
    // The feature plugin was archived 2026-02-05; core is the only source.
    "you may need the Abilities API plugin/package rather than relying on core",
  ]);
  // WP 7.1 defines meta.public in core (WP_Ability::DEFAULT_PUBLIC), resolved
  // in prepare_properties(). The registration reference must not deny it.
  requireIncludes(repoRoot, "skills/wp-abilities-api/references/php-registration.md", [
    "DEFAULT_PUBLIC",
    "prepare_properties()",
    "meta.public",
    "archived on 5 February 2026",
  ]);
  requireExcludes(repoRoot, "skills/wp-abilities-api/references/php-registration.md", [
    "Released adapter 0.5.0 consults no other key",
    "is not a key the core Abilities API defines",
  ]);
  requireIncludes(repoRoot, "skills/wp-abilities-api/references/rest-api.md", [
    "/wp-abilities/v1/abilities/{name}/run",
    "meta.mcp.public ?? meta.public ?? false",
    "wp_get_abilities( array $args = array() ): array",
    "Exposure is not authorization",
  ]);
  requireIncludes(repoRoot, "skills/wp-abilities-api/references/execution-lifecycle.md", [
    "wp_ability_invoked",
    "wp_pre_execute_ability",
    "WP_Filter_Sentinel",
    "ArgumentCountError",
    "wp_ability_permission_result",
  ]);
  requireIncludes(repoRoot, "skills/wp-abilities-verify/references/exposure-checks.md", [
    "meta.mcp.public ?? meta.public ?? false",
    "adapter 0.6.0",
  ]);
  requireExcludes(repoRoot, "skills/wp-ai-plugin/references/experiments-framework.md", [
    "MCP Adapter 0.5.0 uses explicit",
  ]);
  requireIncludes(repoRoot, "eval/scenarios/abilities-mcp-expose.json", [
    "PHP 7.4+",
    "composer require automattic/jetpack-autoloader",
    "vendor/autoload_packages.php",
    "meta.mcp.public ?? meta.public ?? false",
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
    "PHP AI Client 1.4.0",
    "AiClient::generateEmbeddingResult()",
  ]);
  requireIncludes(repoRoot, "skills/wp-ai-client/references/embedding-builder.md", [
    "usingModelPreference()",
    "AiClient::generateEmbeddings()",
    "BeforeGenerateEmbeddingEvent",
    "AfterGenerateEmbeddingEvent",
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
  requireIncludes(repoRoot, "skills/wp-ai-plugin/references/experiments-framework.md", [
    "v1.2.0",
    "Type_Ahead",
    "Key_Encryption",
    "Suggest_Reply",
    "core/read-content",
    "core/read-users",
  ]);
  requireIncludes(repoRoot, "skills/wp-ai-plugin/references/hooks-and-filters.md", [
    "wpai_default_request_timeout",
    "wpai_settings_feature_groups",
    "wpai_settings_feature_metadata",
    // Verified against WordPress/ai: absent at 0.6.0, present at 0.7.0 with
    // `@since 0.7.0` on Abstract_Ability::get_system_instruction(), unchanged
    // through 1.2.0. This pin previously asserted v1.2.0 and so guarded the
    // error into place — the version marker for a hook is only as good as the
    // tag someone actually read.
    "The global `wpai_system_instruction` hook ships in v0.7.0",
  ]);
  requireIncludes(repoRoot, "skills/wp-ai-plugin/references/guidelines-integration.md", [
    "that hook ships in v0.7.0",
    "wpai_{$ability_slug}_system_instruction",
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
    "references/pattern-registration.md",
    "references/block-markup-reference.md",
  ]);
  // Escaping and preset-over-hardcoded guidance moved out of SKILL.md and into
  // these reference files upstream (#79). Assert them where they now live so the
  // guarantee survives the progressive-disclosure refactor.
  requireIncludes(repoRoot, "skills/wp-patterns/references/pattern-registration.md", [
    "Auto-Registration via `/patterns/` Directory",
    "register_block_pattern()",
    "esc_html_e()",
    "Always use:",
    "`esc_url()` for URLs",
  ]);
  requireIncludes(repoRoot, "skills/wp-patterns/references/design-with-tokens.md", [
    "theme.json",
    "Preset",
    "reference theme.json values by name (preferred)",
    "Never use inline `<style>` tags",
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
