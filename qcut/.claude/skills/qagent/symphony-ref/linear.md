# Linear Skill

Interact with Linear issue tracker via `linear-cli` or `gh` for QCut project management.

## Prerequisites

```bash
brew install schpet/tap/linear
linear auth login
cd /Users/peter/Desktop/code/qcut/qcut
linear config
```

## Common Operations

### Query Issues

```bash
# List your unstarted issues
linear issue list

# List all unstarted issues (any assignee)
linear issue list -A

# Filter by state
linear issue list -s "In Progress"
linear issue list -s "Todo"

# View current branch's issue
linear issue view

# View specific issue
linear issue view QUR-11

# Open in browser
linear issue view -w

# Get just the issue ID from current branch
linear issue id
```

### Start Working on an Issue

```bash
# Interactive: choose from your issues
linear issue start

# Start a specific issue (auto-creates branch)
linear issue start QUR-11

# Branch name will be like: peter/qur-11-add-export
```

### Create Issues

```bash
# Interactive
linear issue create

# With flags
linear issue create -t "Fix video export crash" -d "Crash when exporting to MP4 on Apple Silicon"

# With project/milestone
linear issue create --project "QCut Desktop" --milestone "v2.0"
```

### Update Issues

```bash
# Interactive update
linear issue update

# Set milestone
linear issue update QUR-11 --milestone "v2.0"
```

### Comments (Workpad)

```bash
# List comments
linear issue comment list

# Add a comment (for workpad)
linear issue comment add

# Reply to a specific comment
linear issue comment add -p <comment-id>

# Update a comment (for workpad updates)
linear issue comment update <comment-id>
```

### Create PR with Issue Context

```bash
# Auto-fills PR title/body from issue
linear issue pr

# This calls `gh pr create` under the hood
```

### Projects & Milestones

```bash
linear project list
linear milestone list --project <projectId>
linear milestone create --project <projectId> --name "v2.0" --target-date "2026-06-30"
```

### Documents

```bash
# Create a doc attached to an issue
linear document create --title "Design Spec" --content-file ./spec.md --issue QUR-11

# View a doc
linear document view --raw

# Update a doc
linear document update --edit
```

## Auto-Linking Rules

Linear automatically tracks GitHub PRs when any of these contain `QUR-XX`:

- ✅ Branch name: `peter/qur-11-add-export`
- ✅ PR title: `[QUR-11] Add export feature`
- ✅ PR description: `Closes QUR-11`
- ✅ Commit message: `feat: add export (QUR-11)`

## Status Auto-Transitions

| GitHub Event | Linear Status |
|-------------|--------------|
| Branch created | → In Progress |
| PR opened | → In Review |
| PR merged | → Done |
| PR closed (no merge) | → Previous state |

> Requires GitHub Integration enabled in Linear Settings.

## Agent Workflow Integration

When working on a Linear issue:

1. `linear issue start QUR-XX` → creates branch with issue ID
2. Work on the code
3. `linear issue comment add` → update workpad with progress
4. `linear issue pr` → create PR with auto-filled context
5. PR merge → Linear auto-closes issue

## Fallback: GitHub CLI

If `linear-cli` is not available, use `gh` with issue ID in branch names:

```bash
# Create branch with Linear ID
git checkout -b qur-11-fix-export

# Create PR with Linear ID in title
gh pr create --title "[QUR-11] Fix video export crash"

# Linear will auto-link via GitHub Integration
```

---

*Adapted from [OpenAI Symphony](https://github.com/openai/symphony) linear skill*
*Uses `linear-cli` instead of raw GraphQL API*
