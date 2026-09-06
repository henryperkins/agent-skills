import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CORE_AI_UPSTREAMS } from "./core-ai-upstreams.mjs";
import { parseWpGutenbergMapFromHtml } from "./upstream-index-lib.mjs";

function mkdirp(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  mkdirp(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function buildUpstreamRequestHeaders(url, env = process.env) {
  const headers = {
    "user-agent": "wp-agent-skills-upstream-sync/0.2",
    accept: "text/html,application/json",
  };
  const token = typeof env.GITHUB_TOKEN === "string" ? env.GITHUB_TOKEN.trim() : "";
  if (token !== "" && new URL(url).hostname === "api.github.com") {
    headers.authorization = `Bearer ${token}`;
  }
  return headers;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: buildUpstreamRequestHeaders(url),
  });
  if (!response.ok) throw new Error(`Fetch failed ${response.status} for ${url}`);
  return await response.text();
}

async function fetchJson(url) {
  const value = await fetchText(url);
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Expected JSON from ${url}, got non-JSON response`);
  }
}

/** Descending numeric version comparison. */
export function compareVersionsDesc(a, b) {
  const pa = String(a).replace(/^v/, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const pb = String(b).replace(/^v/, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(pa.length, pb.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (pb[index] ?? 0) - (pa[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function normalizeWpVersionCheckPayload(payload) {
  const offers = Array.isArray(payload?.offers) ? payload.offers : [];
  const candidates = offers
    .map((offer) => ({
      version: typeof offer?.version === "string" ? offer.version : null,
      current: typeof offer?.current === "string" ? offer.current : null,
      download: typeof offer?.download === "string" ? offer.download : null,
      phpVersion: typeof offer?.php_version === "string" ? offer.php_version : null,
      mysqlVersion: typeof offer?.mysql_version === "string" ? offer.mysql_version : null,
      response: typeof offer?.response === "string" ? offer.response : null,
      locale: typeof offer?.locale === "string" ? offer.locale : null,
    }))
    .filter((offer) => /^\d+(?:\.\d+)+$/.test(offer.version ?? offer.current ?? ""));

  const byVersion = new Map();
  for (const offer of candidates) {
    const version = offer.version ?? offer.current;
    if (!byVersion.has(version)) byVersion.set(version, offer);
  }
  const versions = [...byVersion.keys()].sort(compareVersionsDesc);
  if (versions.length === 0) {
    throw new Error("WordPress version-check returned no stable versions.");
  }

  return {
    latest: versions[0],
    recent: versions.slice(0, 20),
    offers: versions.slice(0, 20).map((version) => byVersion.get(version)),
  };
}

export function normalizeGitHubReleases(payload) {
  if (!Array.isArray(payload)) {
    throw new Error(
      `Expected a GitHub Releases array, got ${
        typeof payload === "object" && payload !== null
          ? JSON.stringify(payload).slice(0, 200)
          : typeof payload
      }`
    );
  }

  const stable = payload
    .filter(
      (release) =>
        release &&
        !release.draft &&
        !release.prerelease &&
        typeof release.tag_name === "string" &&
        /^v?\d+(?:\.\d+)+$/.test(release.tag_name)
    )
    .map((release) => ({
      tag: release.tag_name,
      name: typeof release.name === "string" ? release.name : null,
      publishedAt: typeof release.published_at === "string" ? release.published_at : null,
      url: typeof release.html_url === "string" ? release.html_url : null,
    }))
    .sort((a, b) => compareVersionsDesc(a.tag, b.tag));

  if (stable.length === 0) {
    throw new Error(
      `Expected at least one stable GitHub release, got none (received ${payload.length} raw entries). Refusing to overwrite the committed index with an empty one.`
    );
  }

  return { latest: stable[0], recent: stable.slice(0, 30) };
}

export function normalizePackagistVersions(payload, packageName, releaseUrlBase) {
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
  if (typeof releaseUrlBase !== "string" || releaseUrlBase === "") {
    throw new Error(`Missing Packagist releaseUrlBase for ${packageName}.`);
  }

  const stable = versions
    .filter(
      (version) =>
        version &&
        typeof version.version === "string" &&
        /^v?\d+(?:\.\d+)+$/.test(version.version)
    )
    .map((version) => ({
      tag: version.version,
      name: version.version,
      publishedAt: typeof version.time === "string" ? version.time.replace(/\+00:00$/, "Z") : null,
      url: `${releaseUrlBase}/${version.version}`,
    }))
    .sort((a, b) => compareVersionsDesc(a.tag, b.tag));

  if (stable.length === 0) {
    throw new Error(`Packagist returned no stable versions for ${packageName}.`);
  }

  return { latest: stable[0], recent: stable.slice(0, 30) };
}

function normalizeEntry(upstream, payload) {
  switch (upstream.sourceType) {
    case "wordpress-version-check":
      return normalizeWpVersionCheckPayload(payload);
    case "github-releases":
      return normalizeGitHubReleases(payload);
    case "packagist":
      return normalizePackagistVersions(payload, upstream.packageName, upstream.releaseUrlBase);
    case "html-version-map":
      if (typeof payload !== "string") throw new Error(`Expected HTML text for ${upstream.id}.`);
      return parseWpGutenbergMapFromHtml(payload);
    default:
      throw new Error(`Unsupported Core AI source type: ${upstream.sourceType}`);
  }
}

export function prepareIndexUpdates(payloads, registry = CORE_AI_UPSTREAMS) {
  return registry.map((upstream) => {
    if (!payloads.has(upstream.id)) {
      throw new Error(`Missing fetched payload for ${upstream.id}.`);
    }
    return {
      indexFile: upstream.indexFile,
      value: {
        source: upstream.source,
        ...normalizeEntry(upstream, payloads.get(upstream.id)),
      },
    };
  });
}

/** Normalize every payload before the first write. */
export function updateUpstreamIndicesFromPayloads(
  repoRoot,
  payloads,
  { registry = CORE_AI_UPSTREAMS, writeJsonImpl = writeJson } = {}
) {
  const updates = prepareIndexUpdates(payloads, registry);
  for (const update of updates) {
    writeJsonImpl(path.join(repoRoot, update.indexFile), update.value);
  }
  return updates;
}

export async function fetchUpstreamPayloads(
  registry = CORE_AI_UPSTREAMS,
  { fetchJsonImpl = fetchJson, fetchTextImpl = fetchText } = {}
) {
  const pairs = await Promise.all(
    registry.map(async (upstream) => [
      upstream.id,
      upstream.sourceType === "html-version-map"
        ? await fetchTextImpl(upstream.source)
        : await fetchJsonImpl(upstream.source),
    ])
  );
  return new Map(pairs);
}

export async function updateUpstreamIndices(
  repoRoot = process.cwd(),
  { registry = CORE_AI_UPSTREAMS, fetchJsonImpl, fetchTextImpl, writeJsonImpl } = {}
) {
  const payloads = await fetchUpstreamPayloads(registry, { fetchJsonImpl, fetchTextImpl });
  return updateUpstreamIndicesFromPayloads(repoRoot, payloads, { registry, writeJsonImpl });
}

async function main() {
  await updateUpstreamIndices(process.cwd());
  process.stdout.write("OK: updated all Core AI upstream indices\n");
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedUrl === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack || String(error)}\n`);
    process.exit(1);
  });
}
