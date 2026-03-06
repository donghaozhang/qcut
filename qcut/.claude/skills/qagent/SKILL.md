---
name: qagent
description: Orchestrate parallel AI agents for Qcut development. Use when spawning agents on issues, checking session status, handling CI failures, managing PRs, or batch-processing multiple tasks. Covers all qagent CLI commands configured for Qcut.
argument-hint: [command] [args...]
---

# QAgent — Agent Orchestrator for Qcut

Use the `qagent` CLI to spawn and manage parallel AI coding agents for Qcut development. The config is at `qagent.yaml` in the repo root.

## Quick Start

```bash
# 1) Start visualization first (keep this terminal running)
qagent dashboard --no-open
# Then open: http://localhost:3000

# If dashboard fails with Turbopack/500, use local web package Next:
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT/packages/qagent/packages/web"
QAGENT_CONFIG_PATH="$ROOT/qagent.yaml" ./node_modules/.bin/next dev -p 3000

# Back to repo root for normal workflow
cd "$ROOT"

# 2) Spawn an agent on a GitHub issue
qagent spawn qcut 170

# 3) Spawn multiple agents in parallel
qagent batch-spawn qcut 170 171 172 173

# 4) Check all sessions
qagent status

# 5) Keep dashboard + session list side-by-side while operating
```

## Common Workflows

### Spawn an agent on an issue
```bash
qagent spawn qcut <issue-number>
```
Creates a git worktree, launches a Claude Code session, and starts working on the issue. The agent gets Qcut-specific rules (Bun, Biome, Electron conventions) injected automatically.

### Batch spawn for parallel development
```bash
qagent batch-spawn qcut 170 171 172 173
```
Spawns 4 agents simultaneously in isolated worktrees. Each gets its own branch, PR, and CI pipeline. Duplicate detection prevents re-spawning already-active issues.

### Monitor all sessions
```bash
qagent status                    # All sessions with branch/CI/PR/review info
qagent status -p qcut            # Qcut sessions only
qagent status --json             # Machine-readable output
```

### Send a message to a running agent
```bash
qagent send qcut-170 "Focus on the FFmpeg handler, not the UI"
qagent send qcut-170 "CI is failing on lint, please fix"
```

### Team inbox messaging (filesystem queue)
```bash
qagent team init qcut-team team-lead observer
qagent team add-member qcut-team reviewer       # Add member to existing team
qagent team members qcut-team                   # List team members
qagent team send qcut-team observer team-lead "Observer reporting in"
qagent team send qcut-team observer team-lead --protocol idle_notification --payload '{"idleReason":"available"}'
qagent team inbox qcut-team team-lead --unread --json
qagent team ack qcut-team team-lead
```

### Harness-style runtime controls
```bash
qagent harness spawn codex "Audit failing tests and fix them"
qagent harness status                         # Show current harness state
qagent harness sessions                       # List all harness sessions
qagent harness steer "tighten logs and continue"
qagent harness cancel
qagent harness model openai/gpt-5.2
qagent harness permissions strict
qagent harness timeout 120                    # Set timeout in seconds
qagent harness cwd /path/to/dir              # Set working directory
qagent harness set <key> <value>             # Set generic runtime option
qagent harness reset-options                 # Clear all runtime overrides
qagent harness relay --team qcut-team --member codex
qagent harness close
qagent harness doctor                        # Health check environment
qagent harness install                       # Print setup instructions
```

### Inspect workflow policy gates
```bash
qagent policy check                          # Check all sessions
qagent policy check -p qcut                  # Qcut sessions only
qagent policy check qcut-170                 # One session
qagent policy explain qcut-170               # Why session passes/fails gates
qagent policy workflow lint                  # Validate workflow contract files
```

### Check and handle PR reviews automatically
```bash
qagent review-check qcut                     # Check all Qcut PRs for review comments
qagent review-check qcut --dry-run           # Preview what would happen
```

### Export and forward PR comments
```bash
qagent pr-comments export Quriosity-agent/qcut 170        # Export to markdown
qagent pr-comments export-all Quriosity-agent/qcut 170    # Include thread + review
qagent pr-comments forward qcut-170                        # Export + send to agent
qagent pr-comments preprocess <dir>                        # Convert to task files
qagent pr-comments analyze <dir>                           # Group by source file
qagent pr-comments resolve Quriosity-agent/qcut 170 <id>  # Resolve a thread
```

### Session management
```bash
qagent session ls                # List all sessions
qagent session kill qcut-170     # Kill a session and clean up worktree
qagent session cleanup qcut      # Kill sessions where PR is merged or issue closed
qagent session restore qcut-170  # Restore a crashed session
```

### Open session in terminal
```bash
qagent open qcut-170             # Open in iTerm2 tab
```

### Start/stop the orchestrator
```bash
qagent start qcut                # Start lifecycle manager + dashboard
qagent stop qcut                 # Stop everything
```

## What Happens Automatically

When `qagent start` is running, the orchestrator polls all sessions and:
- **CI failures**: Sends fix instructions to the agent (retries 2x, then notifies you)
- **Bot review comments** (CodeRabbit etc.): Waits 2 min for comments to settle, then forwards them to the agent as structured tasks. After the review loop converges, sends `/buildit` instructions to verify CI, then notifies you when ready to merge.
- **Review changes requested**: Forwards human review comments to the agent
- **Approved + green**: Sends desktop notification to merge (or auto-merges if configured)
- **Agent stuck**: Notifies you if an agent needs input or is stuck
- **Policy gates**: Blocks or warns on merge if workflow policy violations exist (enforced/advisory modes)
- **All complete**: Notifies when every session has merged or been killed

## Setup (first time)

```bash
qagent init                      # Interactive setup wizard (creates qagent.yaml)
```

Or manually:
```bash
bun run qagent:setup             # Install deps + build qagent
# or
cd packages/qagent
bun install
bun run build
```
