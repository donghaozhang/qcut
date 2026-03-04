---
name: organize-project
description: Organize files and folders with QCut's native pipeline CLI. Use for project setup, media categorization, and structure audits.
disable-model-invocation: true
---

# Organize Project (CLI First)

Use QCut's built-in TypeScript CLI commands instead of ad-hoc shell moves.
This skill is intentionally narrow and delegates to:

- `bun run pipeline init-project`
- `bun run pipeline organize-project`
- `bun run pipeline structure-info`

For broader CLI coverage, use `.claude/skills/native-cli/SKILL.md`.

## Standard Pipeline Structure

```
{project-dir}/
├── input/
│   ├── images/
│   ├── videos/
│   ├── audio/
│   ├── text/
│   └── pipelines/
├── output/
│   ├── images/
│   ├── videos/
│   └── audio/
└── config/
```

## File Categorization Rules

- Images: `.png .jpg .jpeg .gif .webp .bmp .svg .tiff` -> `input/images/`
- Videos: `.mp4 .mov .avi .mkv .webm .flv .wmv` -> `input/videos/`
- Audio: `.mp3 .wav .flac .aac .ogg .m4a .wma` -> `input/audio/`
- Text/config assets: `.txt .md .json .yaml .yml .csv` -> `input/text/`

Unknown extensions are skipped.

## Default Workflow

1. Create missing folders.
2. Preview organization with `--dry-run`.
3. Run actual organization.
4. Verify counts with `structure-info`.

```bash
# 1) Initialize structure
bun run pipeline init-project --directory ./my-project

# 2) Preview file moves (safe)
bun run pipeline organize-project \
  --directory ./my-project \
  --source ./incoming-media \
  --recursive \
  --dry-run

# 3) Execute organization
bun run pipeline organize-project \
  --directory ./my-project \
  --source ./incoming-media \
  --recursive

# 4) Verify structure and counts
bun run pipeline structure-info --directory ./my-project
```

## Safety Rules

- Always run `--dry-run` first when moving user files.
- Use `--source` for external ingest folders instead of scanning the project root blindly.
- Use `--recursive` only when you need nested scanning.
- Avoid `--include-output` unless you intentionally want to reorganize files under `output/`.

## Common Commands

```bash
# JSON output for automation
bun run pipeline structure-info --directory ./my-project --json

# Organize current directory into input/* categories
bun run pipeline organize-project --directory .

# Organize and target output/* instead of input/*
bun run pipeline organize-project --directory . --include-output

# Initialize then inspect
bun run pipeline init-project --directory ./my-project
bun run pipeline structure-info --directory ./my-project
```

## Failure Handling

If a move fails, the CLI reports errors and returns non-zero exit status.
Common causes:
- Missing source directory
- Permission denied
- Locked files
- Cross-device rename fallback failure

Use `--json` to capture machine-readable failure details.
