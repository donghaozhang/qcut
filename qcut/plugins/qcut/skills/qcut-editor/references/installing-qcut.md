# Installing QCut

Use only QCut's official GitHub release channel:

<https://github.com/Quriosity-agent/qcut/releases/latest>

Do not hardcode a versioned asset URL. Resolve the current release and the
platform-specific asset at execution time:

```bash
node <plugin-root>/scripts/qcut-setup.mjs status
```

## Consent boundary

Show the version, asset name, download size, and URL before downloading. Ask for
confirmation before installing. Do not silently execute an installer, disable
operating-system security, or use an unofficial mirror.

After confirmation:

```bash
node <plugin-root>/scripts/qcut-setup.mjs update --confirm
```

The helper first tries `qcut update --yes`. For older QCut builds without that
command, it uses the plugin bootstrap updater. Both paths require an official
GitHub release URL, expected package size, and GitHub's SHA-256 digest. The
macOS bootstrap also verifies the Quriosity code-signing identity before
replacing the application bundle atomically.

To inspect without installing:

```bash
qcut update --check --json
```

## macOS

1. The updater selects the architecture-matched signed ZIP used by QCut's
   updater, verifies it, and stages it beside the installed app.
2. It atomically replaces **QCut AI Video Editor** in `/Applications` and rolls
   back if post-install signature verification fails.
3. QCut relaunches normally. Do not bypass Gatekeeper warnings.
4. Rerun `status`; the standard application path is detected automatically.

## Windows

1. The updater selects the official `QCut-AI-Video-Editor-Setup-<version>.exe`.
2. After verification it starts the NSIS installer in update mode.
3. Do not tell the user to bypass SmartScreen or signature warnings.
4. Rerun `status`. For a nonstandard directory, set `QCUT_APP_PATH` to the app
   executable or installation directory.

## Linux

1. The updater replaces an existing AppImage atomically, or uses the official
   `.deb` on a Debian-compatible installation.
2. Ask before changing executable permissions or installing the package.
3. Set `QCUT_APP_PATH` when the AppImage or installation directory is
   nonstandard.
4. An AppImage can be detected and launched, but it may not expose the embedded
   CLI. In that case install `qcut`/`qcut-pipeline` on `PATH` or set
   `QCUT_CLI_PATH` before automation.
5. Rerun `status` before editor automation.

## Enter the editor

After installation, list projects through the CLI. Never choose between
multiple projects without user input. Once a project ID is known:

```bash
node <plugin-root>/scripts/qcut-setup.mjs open-media --project-id <project-id>
```

Success requires `verified: true` and `panel: "media"`. A command response that
only says it switched panels is not sufficient verification.
