/**
 * Canonical metadata for every upstream that can change the Core AI skills.
 *
 * This registry deliberately contains no network or parsing logic. Consumers
 * decide how to fetch each sourceType, while declarations provide the exact
 * skill-local version marker that deterministic drift checks must resolve.
 */
export const CORE_AI_UPSTREAMS = Object.freeze([
  {
    id: "wordpress-core",
    indexFile: "shared/references/wordpress-core-versions.json",
    source: "https://api.wordpress.org/core/version-check/1.7/",
    sourceType: "wordpress-version-check",
    affectedSkills: [
      "wp-abilities-api",
      "wp-abilities-audit",
      "wp-abilities-verify",
      "wp-ai-client",
      "wp-ai-connectors",
      "wp-ai-plugin",
    ],
    declarations: [
      "wp-abilities-api",
      "wp-abilities-audit",
      "wp-abilities-verify",
      "wp-ai-client",
      "wp-ai-connectors",
      "wp-ai-plugin",
    ].map((skill) => ({ skill, label: "WordPress Core verified through", granularity: "minor" })),
  },
  {
    id: "gutenberg",
    indexFile: "shared/references/gutenberg-releases.json",
    source: "https://api.github.com/repos/WordPress/gutenberg/releases?per_page=50",
    sourceType: "github-releases",
    affectedSkills: ["wp-abilities-api", "wp-ai-plugin", "wp-ai-connectors"],
    declarations: [
      { skill: "wp-abilities-api", label: "Gutenberg verified through", granularity: "patch" },
      { skill: "wp-ai-plugin", label: "Gutenberg verified through", granularity: "patch" },
    ],
  },
  {
    id: "wordpress-ai-plugin",
    indexFile: "shared/references/ai-plugin-releases.json",
    source: "https://api.github.com/repos/WordPress/ai/releases?per_page=30",
    sourceType: "github-releases",
    affectedSkills: ["wp-ai-plugin", "wp-ai-client"],
    declarations: [
      { skill: "wp-ai-plugin", label: "AI plugin verified through", granularity: "patch" },
    ],
  },
  {
    id: "mcp-adapter",
    indexFile: "shared/references/mcp-adapter-releases.json",
    source: "https://api.github.com/repos/WordPress/mcp-adapter/releases?per_page=30",
    sourceType: "github-releases",
    affectedSkills: ["wp-abilities-api", "wp-abilities-audit", "wp-abilities-verify", "wp-ai-plugin"],
    declarations: [
      { skill: "wp-abilities-api", label: "MCP Adapter verified through", granularity: "patch" },
      { skill: "wp-abilities-audit", label: "MCP Adapter verified through", granularity: "patch" },
      { skill: "wp-abilities-verify", label: "MCP Adapter verified through", granularity: "patch" },
    ],
  },
  {
    id: "php-ai-client",
    indexFile: "shared/references/php-ai-client-releases.json",
    source: "https://repo.packagist.org/p2/wordpress/php-ai-client.json",
    sourceType: "packagist",
    packageName: "wordpress/php-ai-client",
    affectedSkills: ["wp-ai-client", "wp-ai-connectors", "wp-ai-plugin"],
    declarations: [
      { skill: "wp-ai-client", label: "PHP AI Client verified through", granularity: "patch" },
      { skill: "wp-ai-connectors", label: "PHP AI Client verified through", granularity: "patch" },
    ],
  },
  {
    id: "wp-ai-client",
    indexFile: "shared/references/wp-ai-client-releases.json",
    source: "https://api.github.com/repos/WordPress/wp-ai-client/releases?per_page=30",
    sourceType: "github-releases",
    affectedSkills: ["wp-ai-client"],
    declarations: [
      { skill: "wp-ai-client", label: "WP AI Client verified through", granularity: "patch" },
    ],
  },
  {
    id: "anthropic-provider",
    indexFile: "shared/references/ai-provider-anthropic-releases.json",
    source: "https://api.github.com/repos/WordPress/ai-provider-for-anthropic/releases?per_page=30",
    sourceType: "github-releases",
    affectedSkills: ["wp-ai-connectors", "wp-ai-client"],
    declarations: [
      { skill: "wp-ai-connectors", label: "Anthropic provider verified through", granularity: "patch" },
    ],
  },
  {
    id: "google-provider",
    indexFile: "shared/references/ai-provider-google-releases.json",
    source: "https://api.github.com/repos/WordPress/ai-provider-for-google/releases?per_page=30",
    sourceType: "github-releases",
    affectedSkills: ["wp-ai-connectors", "wp-ai-client"],
    declarations: [
      { skill: "wp-ai-connectors", label: "Google provider verified through", granularity: "patch" },
    ],
  },
  {
    id: "openai-provider",
    indexFile: "shared/references/ai-provider-openai-releases.json",
    source: "https://api.github.com/repos/WordPress/ai-provider-for-openai/releases?per_page=30",
    sourceType: "github-releases",
    affectedSkills: ["wp-ai-connectors", "wp-ai-client"],
    declarations: [
      { skill: "wp-ai-connectors", label: "OpenAI provider verified through", granularity: "patch" },
    ],
  },
  {
    id: "wp-gutenberg-version-map",
    indexFile: "shared/references/wp-gutenberg-version-map.json",
    source: "https://developer.wordpress.org/block-editor/contributors/versions-in-wordpress/",
    sourceType: "html-version-map",
    affectedSkills: ["wp-abilities-api", "wp-ai-connectors", "wordpress-router"],
    declarations: [],
  },
]);
