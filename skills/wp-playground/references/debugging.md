# Debugging Playground CLI 3.1.45

For a normal local debugging session, use `start`:

```powershell
npx @wp-playground/cli@3.1.45 start --path=. --php=8.3 --xdebug
```

It auto-detects the project, opens the browser, and retains local state. Configure VS Code or PhpStorm using the host, port, and IDE key printed by the CLI, then confirm a breakpoint resolves from mounted code.

Use `server` only for advanced controls:

```powershell
npx @wp-playground/cli@3.1.45 server --auto-mount=. --workers=auto --xdebug
npx @wp-playground/cli@3.1.45 server --auto-mount=. --wordpress-install-mode=install-from-existing-files-if-needed --xdebug
```

## Breakpoints not hit

- Confirm the IDE listens on the port printed by the CLI.
- Confirm path mappings cover the mounted VFS path Playground reports.
- If the installed CLI's flags differ from this reference, check `npx @wp-playground/cli@3.1.45 server --help`.

## Slow, stuck, or failing runs

- Add `--verbosity=debug` for step-level logs.
- Add `--debug` to print the PHP error log when boot fails.
- Adjust request workers with `--workers=<n|auto>`; use `--workers=1` to isolate worker-related behavior.

## Mount issues

- Use an absolute `--mount=/host/path:/vfs/path` when auto-detection picks the wrong tree.
- Use `--mount-before-install` when installer or Blueprint steps need the files present before WordPress setup completes.
- Choose another `--port=<free-port>` when 9400 is occupied.

## Inspecting runtime state

- Open the Playground browser console; the Service Worker logs network and filesystem events.
- Use the "Terminal" tab, where available, to run WP-CLI inside the instance.

Playground runs WordPress in WebAssembly with SQLite; native extensions or production infrastructure need a full WordPress stack.
