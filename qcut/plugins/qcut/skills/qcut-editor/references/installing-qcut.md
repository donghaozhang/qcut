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
confirmation before opening the link. Do not silently execute an installer,
disable operating-system security, or use an unofficial mirror.

After confirmation:

```bash
node <plugin-root>/scripts/qcut-setup.mjs open-download --confirm
```

## macOS

1. Use the architecture-matched DMG returned by `status`.
2. Open the DMG and move **QCut AI Video Editor** to `/Applications`.
3. Launch QCut normally. Do not bypass Gatekeeper warnings.
4. Rerun `status`; the standard application path is detected automatically.

## Windows

1. Use the `QCut.AI.Video.Editor-Setup-<version>.exe` returned by `status`.
2. Let the user complete the installer and choose its location.
3. Do not tell the user to bypass SmartScreen or signature warnings.
4. Rerun `status`. For a nonstandard directory, set `QCUT_APP_PATH` to the app
   executable or installation directory.

## Linux

1. Prefer the AppImage returned by `status`, or the official `.deb` on a
   Debian-compatible system.
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
