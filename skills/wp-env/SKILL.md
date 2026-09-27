---
name: wp-env
description: "Use when setting up, configuring, or troubleshooting local WordPress development environments with @wordpress/env (wp-env). Triggers on mentions of wp-env, local WordPress development, Docker-based WordPress, or requests to start/stop/configure a local WordPress instance. For a quick, disposable local site without Docker, use wp-playground instead."
compatibility: "Targets WordPress 6.9+ (PHP 7.2.24+). Requires Docker (default runtime) and Node.js 18.12+; verified against @wordpress/env 11.16.0."
license: GPL-2.0-or-later
---

# @wordpress/env (wp-env)

Zero-config, Docker-based local WordPress development environment for plugins, themes, and core.

Verified against `@wordpress/env` 11.16.0. When exact flags matter, check `wp-env --version` and `wp-env <command> --help`.

## When to use

- User asks to set up a local WordPress development environment
- Project contains a `.wp-env.json` file
- User mentions `wp-env`, `@wordpress/env`, or Docker-based WordPress development
- User wants to run WP-CLI commands, PHPUnit tests, or debug with Xdebug locally
- Triage detects a plugin or theme project that needs a local WordPress instance

**wp-env or wp-playground?** For a quick local WordPress, prefer the **wp-playground** skill by default — it's faster, disposable, and needs no Docker. Use **wp-env** when the task actually requires it:

- the repo already contains a `.wp-env.json`
- a real MySQL database is needed (PHPUnit against the DB, `wp db` commands, data that survives restarts)
- arbitrary commands must run inside the environment (shell access, Composer, full WP-CLI via `wp-env run`)
- this is a WordPress core or Gutenberg checkout
- the user explicitly asks for wp-env or Docker

wp-env can also run without Docker by using Playground as its runtime (`npx @wordpress/env start --runtime=playground`, experimental). That is still wp-env, driven by the same `.wp-env.json`, so treat it as a Docker-free fallback for a project that already carries wp-env config, not as a third option. It swaps MySQL for SQLite and drops `wp-env run` and the separate tests environment, which are most of the reasons to pick wp-env in the first place. For a quick Docker-free WordPress with no wp-env config, use the **wp-playground** skill directly.

## Inputs required

1. **Docker status** -- verify Docker is installed and running: `docker info`
2. **Node.js version** -- must be >= 18.12.0: `node -v`
3. **Project type** -- plugin, theme, or full site (check for `.wp-env.json`, plugin headers, or `style.css` theme headers)
4. **Existing config** -- read `.wp-env.json` and `.wp-env.override.json` if present

## Procedure

### 1. Install wp-env

```sh
# Global (recommended)
npm -g install @wordpress/env

# Or project-local
npm i @wordpress/env --save-dev
# Then use: npm exec --no -- wp-env start
```

Run a project-local install with `npm exec --no -- wp-env` (or a `package.json` script), not `npx wp-env`. If the local install is missing, `npx wp-env` fetches the unscoped `wp-env` package from the registry, which is not `@wordpress/env`, and a non-interactive shell installs it without asking. `--no` makes npm fail instead.

### 2. Start the environment

```sh
wp-env start
```

Default credentials:
- **URL:** http://localhost:8888/wp-admin/
- **Username:** `admin`
- **Password:** `password`

Common start options:
- `wp-env start --update` -- pull latest sources and reconfigure
- `wp-env start --xdebug` -- enable Xdebug (debug mode)
- `wp-env start --xdebug=profile,trace` -- multiple Xdebug modes
- `wp-env start --auto-port` -- find available ports when defaults are busy (ignored when `CI` is set)

By default `start` also creates a separate tests environment (port 8889, `tests-*` containers) and prints a deprecation warning. Add `"testsEnvironment": false` to `.wp-env.json` to start only the development environment; for an isolated test site, run a second environment from its own config file with `wp-env start --config=<file>`.

### 3. Auto-detection (no config file)

When no `.wp-env.json` exists, wp-env scans the current directory:

| Detected type | How detected | Auto-config |
|--------------|-------------|-------------|
| Plugin | `Plugin Name:` header in a root `.php` file | `{ "plugins": ["."] }` |
| Theme | `Theme Name:` header in `style.css` | `{ "themes": ["."] }` |
| Core | `wp-includes/version.php` exists | `{ "core": "." }` |

### 4. Configure with `.wp-env.json`

Place at the project root. All fields are optional.

```json
{
  "core": null,
  "phpVersion": "8.1",
  "plugins": [
    ".",
    "https://downloads.wordpress.org/plugin/akismet.zip",
    "WordPress/classic-editor"
  ],
  "themes": [],
  "port": 8888,
  "multisite": false,
  "phpmyadmin": false,
  "config": {
    "WP_DEBUG": true,
    "SCRIPT_DEBUG": true
  },
  "mappings": {
    "wp-content/mu-plugins": "./mu-plugins"
  },
  "lifecycleScripts": {
    "afterStart": "wp-env run cli wp rewrite structure /%postname%/"
  }
}
```

#### Source string formats (for `core`, `plugins`, `themes`, `mappings`)

| Format | Example |
|--------|---------|
| Local path | `"."`, `"./path"`, `"../path"` |
| GitHub shorthand | `"WordPress/classic-editor"`, `"owner/repo#branch"` |
| ZIP URL | `"https://downloads.wordpress.org/plugin/akismet.zip"` |
| Git SSH | `"ssh://user@host/repo.git#ref"` |

**GOTCHA:** WordPress.org plugin/theme slugs (bare names like `"akismet"`) do NOT work. Use the full ZIP URL. Relative local paths must start with `.` (`"."`, `"./path"`, `"../path"`): `"plugins/my-plugin"` is parsed as the GitHub repository `plugins/my-plugin`.

#### Local overrides with `.wp-env.override.json`

Create `.wp-env.override.json` next to `.wp-env.json` for personal settings (gitignored). `config`, `mappings`, and `lifecycleScripts` are **merged** key by key -- all other fields (including `plugins` and `themes` arrays) **fully replace** the base.

### 5. Run commands in containers

```sh
# WP-CLI commands
wp-env run cli wp user list
wp-env run cli wp plugin list
wp-env run cli wp option update blogname "My Site"
wp-env run cli wp rewrite structure /%postname%/

# Run commands in a specific directory
wp-env run cli --env-cwd=wp-content/plugins/my-plugin composer install

# PHPUnit tests
wp-env run cli --env-cwd=wp-content/plugins/my-plugin vendor/bin/phpunit

# Pass flags with -- separator
wp-env run cli php -- --version

# MySQL access
wp-env run mysql mariadb -- --user=root --password=password wordpress
```

`wp-env run` hands each argument straight to `docker compose exec` without a shell. Never wrap the whole command in one quoted string: `wp-env run cli "wp user list"` fails with `executable file not found in $PATH`. Quote only individual arguments that contain spaces. The database image is `mariadb:lts`, which ships a `mariadb` client but no `mysql` binary.

Available containers: `mysql`, `wordpress`, `cli`, and `phpmyadmin` (only when enabled), plus `tests-mysql`, `tests-wordpress`, and `tests-cli` while the tests environment is on. The `composer` and `phpunit` containers were removed; run those tools in `cli`.

### 6. Manage the environment

```sh
wp-env stop                    # Stop and free ports
wp-env reset development       # Reset dev database (keeps test)
wp-env reset all               # Reset all databases
wp-env logs                    # Stream PHP/Docker logs
wp-env logs --no-watch         # Print logs and exit
wp-env status                  # Show URLs, ports, config
wp-env status --json           # Machine-readable status
wp-env cleanup --force         # Remove containers/volumes (keep images)
wp-env destroy --force         # Remove everything including images
```

`cleanup` and `destroy` delete the site's database and content. Without `--force` they wait for an interactive confirmation that a non-interactive agent shell cannot answer, so get the user's go-ahead first and then pass `--force`.

### 7. Xdebug setup

```sh
wp-env start --xdebug          # Enable debug mode
wp-env start --xdebug=coverage # For code coverage
wp-env start                   # Disable Xdebug (restart without flag)
```

Modes: `debug`, `profile`, `trace`, `develop`, `coverage`.

IDE listens on port **9003**. VS Code `launch.json` needs:
```json
{
  "type": "php",
  "request": "launch",
  "name": "Listen for Xdebug",
  "port": 9003,
  "pathMappings": {
    "/var/www/html/wp-content/plugins/your-plugin": "${workspaceFolder}"
  }
}
```

### 8. Multisite

```json
{ "multisite": true, "plugins": ["."] }
```

## Verification

- [ ] `wp-env status` shows running containers with correct ports
- [ ] `http://localhost:8888/wp-admin/` loads the WordPress admin
- [ ] `wp-env run cli wp plugin list` shows expected plugins
- [ ] Plugin/theme under development appears in the WordPress admin
- [ ] Database resets work: `wp-env reset development`

## Failure modes / debugging

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Cannot connect to Docker daemon" | Docker not running | Start Docker Desktop |
| "Port 8888 already in use" | Port conflict | Use `--auto-port` or set custom `port` in `.wp-env.json` |
| Plugin not appearing | Missing `Plugin Name:` header in main PHP file | Add standard plugin header comment |
| `Invalid or unrecognized source: "<value>"` | Bare wp.org slug, or a relative path without a leading `.` | Use the full ZIP URL for wp.org plugins; prefix local paths with `./` |
| Stale environment after source changes | Cached Docker volumes | `wp-env start --update`; if that fails and the user accepts losing local data, `wp-env destroy --force` then `wp-env start` |
| White screen / PHP errors | PHP fatal in the code under development, or a corrupted database | Check `wp-env logs --no-watch` first; if the database is the cause, `wp-env reset all && wp-env start` (deletes all site content) |
| Override not taking effect | Wrong merge behavior | `plugins`/`themes` in override **replace** base arrays; only `config`/`mappings`/`lifecycleScripts` merge |
| Tests environment not accessible | Wrong port, or `"testsEnvironment": false` | It runs on port 8889 unless disabled; the separate tests environment is deprecated, so prefer a second config started with `--config` |
| Xdebug not connecting | IDE not listening or wrong port | Ensure IDE listens on port 9003 with correct `pathMappings` |
| npm global install permission error | Node installed to a system path | Use `nvm`, or install locally: `npm i -D @wordpress/env` and run via `npm exec --no -- wp-env` |

## Escalation

- Docker issues beyond wp-env scope (networking, disk space, WSL2 backend)
- Custom Docker Compose configurations that conflict with wp-env
- CI/CD pipeline integration requiring non-standard Docker setups
- WordPress Playground runtime (`--runtime=playground`) is experimental and has limited feature parity

## References

- [Official documentation](https://developer.wordpress.org/block-editor/reference-guides/packages/packages-env/)
- [Getting started guide](https://developer.wordpress.org/block-editor/getting-started/devenv/get-started-with-wp-env/)
- [Source code](https://github.com/WordPress/gutenberg/tree/trunk/packages/env)
