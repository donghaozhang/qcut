# QCut Plugin for Codex and Claude Code

This plugin lets Codex and Claude Code use QCut's structured CLI for AI media
workflows and control a running QCut desktop editor.

## Requirements

- Codex CLI, the Codex app with plugin support, or Claude Code.
- QCut AI Video Editor 2026.07.26.2 or newer, or a standalone QCut CLI
  version 1.0.0 or newer.
- QCut must be running for `editor:*` commands.

The plugin never bundles API credentials. Configure provider keys through
QCut's interactive setup or desktop settings.

## Install for Codex

Install the public marketplace directly from GitHub:

```bash
codex plugin marketplace add Quriosity-agent/qcut
codex plugin add qcut@qcut
```

Start a new Codex task after installation so the two bundled skills are loaded.

## Install for Claude Code

Run these commands inside Claude Code:

```text
/plugin marketplace add Quriosity-agent/qcut
/plugin install qcut@qcut
/reload-plugins
```

The same setup can be scripted from a terminal:

```bash
claude plugin marketplace add Quriosity-agent/qcut
claude plugin install qcut@qcut
```

The source, Codex and Claude Code manifests, privacy notice, and terms are all
public in the [QCut repository](https://github.com/Quriosity-agent/qcut).

## First run

Inspect the machine, check the official latest release, and report the exact
installer for the current platform:

```bash
node plugins/qcut/scripts/qcut-setup.mjs status
```

When QCut is missing or outdated, the agent shows the official GitHub release
details and asks before installing it. After confirmation:

```bash
node plugins/qcut/scripts/qcut-setup.mjs update --confirm
```

The same updater is available directly from QCut's CLI:

```bash
qcut update --check
qcut update --yes
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
|-- .claude-plugin/plugin.json
|-- .codex-plugin/plugin.json
|-- assets/
|-- scripts/qcut-app.mjs
|-- scripts/qcut-release.mjs
|-- scripts/qcut-runner.mjs
|-- scripts/qcut-setup.mjs
|-- scripts/qcut-update.mjs
`-- skills/
    |-- qcut-cli/
    `-- qcut-editor/
```

This is a skills-only plugin. It does not include a remote MCP server.

## Public directory submission

The public GitHub package is separate from OpenAI's curated Plugins Directory.
See [PUBLISHING.md](PUBLISHING.md) for the validation, packaging, review, and
publication flow. Submission-ready listing copy and reviewer cases live under
[`submission/`](submission/).
