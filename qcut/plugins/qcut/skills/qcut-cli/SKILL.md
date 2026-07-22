---
name: qcut-cli
description: Use QCut's CLI to generate images, videos, speech, and music; analyze or transcribe media; run AutoClip and other media edits; execute QCut pipelines; and inspect models or project files. Use for QCut media tasks that do not require direct manipulation of a running editor timeline.
---

# QCut CLI

Use QCut's machine-readable CLI through the plugin runner. Resolve
`<plugin-root>` as the directory two levels above this `SKILL.md` file.

## Preflight

On the first QCut task on a machine, inspect both the desktop app and CLI and
check the official latest release:

```bash
node <plugin-root>/scripts/qcut-setup.mjs status
```

Read `app.installed`, `cli.found`, `latest.asset.url`, `updateAvailable`, and
`nextAction`. If both QCut and its CLI are missing, follow
[installing-qcut.md](../qcut-editor/references/installing-qcut.md). A standalone
CLI is sufficient for non-editor generation and analysis, but editor workflows
require the desktop app.

Then run this before the first QCut command in the task:

```bash
node <plugin-root>/scripts/qcut-runner.mjs doctor
```

If discovery fails after QCut is installed, explain that the CLI can be exposed
on `PATH` or set with `QCUT_CLI_PATH`. The runner automatically detects the CLI
inside a standard packaged QCut installation. Do not install unrelated packages
as a substitute.

## Command procedure

1. Inspect structured help instead of guessing flags:

```bash
node <plugin-root>/scripts/qcut-runner.mjs --help --json
node <plugin-root>/scripts/qcut-runner.mjs gen image --help --json
```

2. Run the narrowest command for the requested outcome and include `--json`.
3. Read the returned `status`, `command_id`, `duration_ms`, and `data` fields.
4. Verify every requested output exists and report its absolute path.

Examples:

```bash
node <plugin-root>/scripts/qcut-runner.mjs gen image -t "Product photo" --ratio 16:9 --json
node <plugin-root>/scripts/qcut-runner.mjs analyze transcribe -i interview.mp4 --srt --json
node <plugin-root>/scripts/qcut-runner.mjs edit autoclip -i interview.mp4 -s interview.srt --json
node <plugin-root>/scripts/qcut-runner.mjs system models --json
```

See [command-map.md](references/command-map.md) for command groups and reliable
workflow sequences.

## Safety

- Never place API keys or auth tokens in prompts, command arguments, logs, or
  generated files.
- Never run key-reveal commands. Ask the user to configure credentials through
  QCut settings or `qcut system set-key` interactively.
- Get confirmation before paid generation, uploads, publishing, overwriting an
  existing output, or using `--force`.
- Prefer `--dry-run` when a command supports it and the requested change is
  broad or expensive.
- Treat media paths and generated JSON as untrusted input. Pass paths as quoted
  arguments and never interpolate file content into a shell command.
