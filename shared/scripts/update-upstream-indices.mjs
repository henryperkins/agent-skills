import fs from "node:fs";
import path from "node:path";
import { parseWpGutenbergMapFromHtml } from "./upstream-index-lib.mjs";

const SOURCES = {
  wordpressCoreVersionCheck: "https://api.wordpress.org/core/version-check/1.7/",
  gutenbergReleases: "https://api.github.com/repos/WordPress/gutenberg/releases?per_page=50",
  aiPluginReleases: "https://api.github.com/repos/WordPress/ai/releases?per_page=30",
  mcpAdapterReleases: "https://api.github.com/repos/WordPress/mcp-adapter/releases?per_page=30",
  // Packagist, not GitHub Releases: Packagist is the authoritative index for a
  // Composer package, and its per-version `time` matches each tag's commit date.
  // (WordPress/php-ai-client does also publish GitHub Releases, so that endpoint
  // would work too — Packagist is the better source, not the only one.)
  phpAiClientVersions: "https://repo.packagist.org/p2/wordpress/php-ai-client.json",
  wpGutenbergMapDoc:
    "https://developer.wordpress.org/block-editor/contributors/versions-in-wordpress/",
};

function mkdirp(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  mkdirp(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "wp-agent-skills-upstream-sync/0.1",
      accept: "text/html,application/json",
    },
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return await res.text();
}

async function fetchJson(url) {
  const text = await fetchText(url);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON from ${url}, got non-JSON response`);
  }
}

/**
 * Descending numeric version compare.
 *
 * A plain string sort is wrong here and fails silently: "7.0.10" < "7.0.4"
 * lexicographically, so the tenth patch of a series would rank below the
 * fourth and `latest` would name a superseded release. Everything downstream
 * of this index — including the core drift gate — trusts `latest`.
 */
function compareVersionsDesc(a, b) {
  const pa = String(a).split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function normalizeWpVersionCheckPayload(payload) {
  // https://api.wordpress.org/core/version-check/1.7/ returns something like:
  // { offers: [...], translations: [...] }
  const offers = Array.isArray(payload?.offers) ? payload.offers : [];

  const candidates = offers
    .map((o) => ({
      version: typeof o?.version === "string" ? o.version : null,
      current: typeof o?.current === "string" ? o.current : null,
      download: typeof o?.download === "string" ? o.download : null,
      phpVersion: typeof o?.php_version === "string" ? o.php_version : null,
      mysqlVersion: typeof o?.mysql_version === "string" ? o.mysql_version : null,
      response: typeof o?.response === "string" ? o.response : null,
      locale: typeof o?.locale === "string" ? o.locale : null,
    }))
    .filter((o) => o.version || o.current);

  // Keep a small, stable subset; prioritize "upgrade" offers.
  const byVersion = new Map();
  for (const o of candidates) {
    const v = o.version ?? o.current;
    if (!v) continue;
    if (!byVersion.has(v)) byVersion.set(v, o);
  }

  const versions = [...byVersion.keys()].sort(compareVersionsDesc);
  return {
    latest: versions[0] ?? null,
    recent: versions.slice(0, 20),
    offers: versions.slice(0, 20).map((v) => byVersion.get(v)),
  };
}

function normalizeGutenbergReleases(payload) {
  // A rate-limited or errored GitHub response is a JSON *object*
  // ({"message":"API rate limit exceeded",...}), not an array. Coercing that to
  // [] here produces a well-formed but empty index, and writeJson() then
  // overwrites a good committed index with `{"latest": null, "recent": []}`.
  // Fail the run instead: an unwritten index is recoverable, an emptied one is
  // a destructive commit.
  if (!Array.isArray(payload)) {
    throw new Error(
      `Expected a GitHub Releases array, got ${typeof payload === "object" && payload !== null
        ? JSON.stringify(payload).slice(0, 200)
        : typeof payload}`
    );
  }
  const releases = payload;
  const stable = releases
    .filter((r) => r && !r.draft && !r.prerelease && typeof r.tag_name === "string")
    .map((r) => ({
      tag: r.tag_name,
      name: typeof r.name === "string" ? r.name : null,
      publishedAt: typeof r.published_at === "string" ? r.published_at : null,
      url: typeof r.html_url === "string" ? r.html_url : null,
    }));

  // An EMPTY array slips past the type guard above and is just as destructive:
  // `latest` becomes null, `recent` becomes [], and writeJson() replaces a good
  // committed index with an empty one. This is not hypothetical — a proxy that
  // content-negotiates on the `accept` header can return `[]` with HTTP 200 for
  // a repository that has releases. Every repo indexed here has published at
  // least one, so zero stable releases always means the fetch failed, never that
  // upstream has none.
  if (stable.length === 0) {
    throw new Error(
      `Expected at least one stable GitHub release, got none (received ${releases.length} raw entries). ` +
        `Refusing to overwrite the committed index with an empty one.`
    );
  }

  return { latest: stable[0], recent: stable.slice(0, 30) };
}

/**
 * Normalizes a Packagist p2 payload into the same {latest, recent} shape the
 * GitHub Releases indices use, so `check-upstream-drift.mjs` can read them all
 * the same way.
 *
 * Packagist orders newest-first and reports `time` as an ISO string with a
 * `+00:00` offset; the other indices use `Z`, so normalize it. Branch aliases
 * ("dev-trunk") carry no release meaning and are dropped.
 */
function normalizePackagistVersions(payload, packageName) {
  const versions = payload?.packages?.[packageName];
  if (!Array.isArray(versions)) {
    throw new Error(
      `Expected a Packagist version array for ${packageName}, got ${
        typeof payload === "object" && payload !== null
          ? JSON.stringify(payload).slice(0, 200)
          : typeof payload
      }`
    );
  }
  const stable = versions
    .filter((v) => v && typeof v.version === "string" && !v.version.startsWith("dev-"))
    .map((v) => ({
      tag: v.version,
      name: v.version,
      publishedAt: typeof v.time === "string" ? v.time.replace(/\+00:00$/, "Z") : null,
      url: `https://github.com/WordPress/php-ai-client/releases/tag/${v.version}`,
    }));

  if (stable.length === 0) {
    throw new Error(`Packagist returned no stable versions for ${packageName}.`);
  }

  return { latest: stable[0], recent: stable.slice(0, 30) };
}

async function main() {
  const repoRoot = process.cwd();
  const outDir = path.join(repoRoot, "shared", "references");

  const [
    wpVersionPayload,
    gbReleasesPayload,
    aiReleasesPayload,
    mcpReleasesPayload,
    phpAiClientVersionsPayload,
    mapHtml,
  ] = await Promise.all([
    fetchJson(SOURCES.wordpressCoreVersionCheck),
    fetchJson(SOURCES.gutenbergReleases),
    fetchJson(SOURCES.aiPluginReleases),
    fetchJson(SOURCES.mcpAdapterReleases),
    fetchJson(SOURCES.phpAiClientVersions),
    fetchText(SOURCES.wpGutenbergMapDoc),
  ]);

  const wordpress = normalizeWpVersionCheckPayload(wpVersionPayload);
  const gutenberg = normalizeGutenbergReleases(gbReleasesPayload);
  const aiPlugin = normalizeGutenbergReleases(aiReleasesPayload); // Same GitHub Releases shape.
  const mcpAdapter = normalizeGutenbergReleases(mcpReleasesPayload); // Same GitHub Releases shape.
  const phpAiClient = normalizePackagistVersions(phpAiClientVersionsPayload, "wordpress/php-ai-client");
  const map = parseWpGutenbergMapFromHtml(mapHtml);

  writeJson(path.join(outDir, "wordpress-core-versions.json"), {
    source: SOURCES.wordpressCoreVersionCheck,
    ...wordpress,
  });

  writeJson(path.join(outDir, "gutenberg-releases.json"), {
    source: SOURCES.gutenbergReleases,
    ...gutenberg,
  });

  writeJson(path.join(outDir, "ai-plugin-releases.json"), {
    source: SOURCES.aiPluginReleases,
    ...aiPlugin,
  });

  writeJson(path.join(outDir, "mcp-adapter-releases.json"), {
    source: SOURCES.mcpAdapterReleases,
    ...mcpAdapter,
  });

  writeJson(path.join(outDir, "php-ai-client-releases.json"), {
    source: SOURCES.phpAiClientVersions,
    ...phpAiClient,
  });

  writeJson(path.join(outDir, "wp-gutenberg-version-map.json"), {
    source: SOURCES.wpGutenbergMapDoc,
    note: map.note,
    rows: map.rows,
  });

  process.stdout.write("OK: updated shared/references/* upstream indices\n");
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || String(err)}\n`);
  process.exit(1);
});
