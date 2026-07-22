# QCut Codex Plugin

This plugin lets Codex use QCut's structured CLI for AI media workflows and
control a running QCut desktop editor.

## Requirements

- Codex CLI or the Codex app with plugin support.
- QCut AI Video Editor, or a standalone QCut CLI version 1.0.0 or newer.
- QCut must be running for `editor:*` commands.

The plugin never bundles API credentials. Configure provider keys through
QCut's interactive setup or desktop settings.

## First run

Inspect the machine, check the official latest release, and report the exact
installer for the current platform:

```bash
node plugins/qcut/scripts/qcut-setup.mjs status
```

When QCut is missing, the agent shows the official GitHub download URL and asks
before opening it. After confirmation:

```bash
node plugins/qcut/scripts/qcut-setup.mjs open-download --confirm
```

After installation, open a project directly on its Media page:

```bash
node plugins/qcut/scripts/qcut-setup.mjs open-media --project-id <project-id>
```

The setup helper launches QCut, uses the CLI for navigation, and verifies the
active project and `media` panel from editor state before reporting success.

## Local development

Add this repository as a local marketplace, install the plugin, and start a new
Codex session:

```bash
codex plugin marketplace add /absolute/path/to/qcut
codex plugin add qcut --marketplace qcut
```

Check CLI discovery without changing a project:

```bash
node plugins/qcut/scripts/qcut-runner.mjs doctor
node plugins/qcut/scripts/qcut-runner.mjs doctor --require-editor
```

During repository development, the runner can use QCut's built JavaScript CLI
or fall back to `bun run qcut`. Installed users should expose `qcut` or
`qcut-pipeline` on `PATH`, set `QCUT_CLI_PATH`, or install QCut. On packaged
desktop builds, the runner automatically uses the CLI embedded in `app.asar`.

## Plugin layout

```text
qcut/
|-- .codex-plugin/plugin.json
|-- assets/
|-- scripts/qcut-app.mjs
|-- scripts/qcut-runner.mjs
|-- scripts/qcut-setup.mjs
`-- skills/
    |-- qcut-cli/
    `-- qcut-editor/
```

This is an initial skills-only plugin. It does not include a remote MCP server.
