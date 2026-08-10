# Playground CLI 3.1.45 workflows

Use this reference for local WordPress Playground runs with `@wp-playground/cli`: disposable or persisted local servers, mounted plugins/themes, Blueprint execution, snapshots, version switching, and local smoke tests.

Pin `@wp-playground/cli@3.1.45`. PHP 8.3 is the default; audited choices are `"5.2"`, `"7.4"`, and `"8.0"` through `"8.5"`.

## Prerequisites

- Node.js 20.18+ with `npm`/`npx` available.
- A local project, plugin, theme, Blueprint file, or Blueprint bundle path.
- A free local port when using `server`; the default is `9400`.

Check the installed CLI help when exact flags matter:

```powershell
npx @wp-playground/cli@3.1.45 --help
npx @wp-playground/cli@3.1.45 start --help
npx @wp-playground/cli@3.1.45 server --help
```

## Normal local work: `start`

Use `start` for the common local plugin, theme, `wp-content`, or WordPress workflow. It detects the project type, mounts the project, opens a browser, enables admin auto-login, and persists the site between sessions.

```powershell
node -v
npx @wp-playground/cli@3.1.45 start --path=. --wp=latest --php=8.3
npx @wp-playground/cli@3.1.45 start --path=. --xdebug
npx @wp-playground/cli@3.1.45 start --path=. --php=8.3 --xdebug
```

- Use `start --reset` when the persisted site should be recreated from scratch.
- Pass explicit `--wp=<version>` and `--php=<version>` when reproducing compatibility issues instead of relying on moving defaults.

## Advanced control: `server`

Use `server` when you need full manual control, a disposable site, CI-style behavior, custom mounts, or a Blueprint-backed server:

```powershell
npx @wp-playground/cli@3.1.45 server --auto-mount=. --workers=auto
npx @wp-playground/cli@3.1.45 server --auto-mount=. --wordpress-install-mode=install-from-existing-files-if-needed
```

- `--auto-mount[=<path>]` detects a WordPress directory, plugin, theme, wp-content directory, or PHP/HTML directory.
- `--workers=4` fixes the count; `--workers=auto` uses one worker per CPU core minus one. Both are server-only — do not put worker or install-mode controls on `start`.
- Add `--port=<free-port>` when the default port is busy.
- Valid install modes are `download-and-install`, `install-from-existing-files`, `install-from-existing-files-if-needed`, and `do-not-attempt-installing`. For existing WordPress files, prefer `install-from-existing-files-if-needed` to skip setup when a site is already present. Use `do-not-attempt-installing` only when WordPress files and database integration are already handled by the mounted tree.

## Manual mounts

Use explicit mounts when auto-mount is not enough:

```powershell
npx @wp-playground/cli@3.1.45 server --mount=/absolute/host/path:/wordpress/wp-content/plugins/my-plugin
```

- Use absolute host paths.
- Repeat `--mount=` for multiple plugins, mu-plugins, themes, or custom content.
- Use `--mount-before-install` when installer or Blueprint steps need mounted files before WordPress setup completes.
- On Windows, where colon-separated mappings are awkward, use `--mount-dir "/host/path" "/vfs/path"` or `--mount-dir-before-install "/host/path" "/vfs/path"`.

## Batch Blueprint operations

For headless setup or CI-style validation:

```powershell
npx @wp-playground/cli@3.1.45 run-blueprint --blueprint=./blueprint.json --blueprint-may-read-adjacent-files
npx @wp-playground/cli@3.1.45 build-snapshot --blueprint=./blueprint.json --outfile=./site.zip
```

- Use the `blueprint` skill for Blueprint JSON structure and schema details.
- Use `--blueprint-may-read-adjacent-files` only when a local Blueprint directory or bundle references nearby files. ZIP bundles are self-contained and do not need it.
- `run-blueprint` exits after execution; `build-snapshot` writes the requested ZIP.
- Add `--verbosity=debug` when step execution needs inspection.

## Start a server from a Blueprint

```powershell
npx @wp-playground/cli@3.1.45 server --blueprint=./blueprint.json
npx @wp-playground/cli@3.1.45 server --blueprint=./my-bundle/ --blueprint-may-read-adjacent-files
```

## Version switching

- Use `--wp=<version>` to pin WordPress.
- Use `--php=<version>` to pin PHP, using a supported major.minor value.
- Prefer explicit versions for bug reproduction and compatibility testing.

## Verification

- Confirm the plugin appears in the admin plugin list and is active when expected.
- Confirm the selected theme is active when testing themes.
- For Blueprints, verify expected options, pages, plugins, themes, or files after the run.
- For snapshots, load the ZIP in a fresh Playground instance before sharing it as a repro artifact.

## Failure modes

- **Node version error**: upgrade to Node.js 20.18+.
- **Mount not applied**: use an absolute path, verify the virtual path, and rerun with `--verbosity=debug`.
- **Blueprint cannot read local assets**: add `--blueprint-may-read-adjacent-files` for local directory bundles.
- **Port already used**: pass `--port=<free-port>`.
- **Need a fresh persisted `start` site**: rerun with `start --reset`.
- **Need breakpoints or runtime logs**: see [debugging.md](debugging.md) for Xdebug, logs, worker flags, and stuck CLI runs.

Native PHP extensions, external database workflows, and production-only infrastructure need a full WordPress stack.
