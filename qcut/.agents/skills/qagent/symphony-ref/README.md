# Symphony Reference Skills

Adapted from [OpenAI Symphony](https://github.com/openai/symphony) for QCut/QAgent.

These are agent workflow guidelines (not code) that define how agents should handle git operations, PR lifecycle, and issue execution.

## Skills

| File | Purpose |
|------|---------|
| `workflow.md` | Full issue lifecycle: Todo → In Progress → Human Review → Merge → Done |
| `commit.md` | How to write clean, conventional commits |
| `pull.md` | How to sync with main and resolve merge conflicts |
| `push.md` | How to push and create/update PRs |
| `land.md` | How to monitor CI, handle reviews, and merge PRs |
| `linear.md` | Linear issue tracker operations via `linear-cli` |
| `pr-template.md` | PR description template |

## Usage

These files are reference material for agents working on QCut issues. They can be:
- Injected into agent prompts via QAgent
- Referenced in `.claude/` skill definitions
- Used as training material for new workflow patterns

## Origin

Original Symphony skills were designed for Codex + Linear. These versions are adapted for:
- **Claude Code** instead of Codex
- **GitHub Issues** instead of Linear
- **Bun + Biome** instead of Mix/Elixir tooling
- **QCut conventions** (Electron, monorepo, native CLI)

## License

Original Symphony code: Apache License 2.0 (OpenAI)
