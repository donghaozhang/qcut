# QCut Plugin 1.1.0 Release Notes

This update expands the public QCut skills-only plugin for ChatGPT and Codex.

- Detects QCut and its structured CLI across macOS, Windows, and Linux.
- Links only to verified official QCut release assets and asks before opening an installer.
- Opens local projects directly on the Media page and verifies editor state.
- Adds QCut curve-speed guidance for None, Custom, Montage, Hero moment, Bullet time, Jump cut, Flash in, and Flash out.
- Adds `timelineDuration` to exported media elements so agents can distinguish the speed-adjusted timeline length from trimmed source `duration`.
- Documents state verification for draggable speed control points and the 0.1x to 10x range.
- Supports media generation, transcription, timeline editing, export, screenshots, and non-activating background Agent pointer workflows.
- Adds repeatable HD demo capture with 1080p minimum-resolution, duration, preview-frame, and audio checks.
- Bundles no API credentials, remote MCP server, connector, or telemetry service.
- Adds public publisher metadata, support, privacy, terms, and reproducible review cases.

Reviewers need QCut 2026.07.26.1 or newer for editor and background pointer
cases. Provider-backed generation or transcription requires credentials
configured through QCut settings; no demo secrets are embedded in the plugin.
