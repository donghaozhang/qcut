# Create Issue & Branch

Create a GitHub issue and a matching branch with Linear integration. Default workflow: GitHub → Linear.

## Steps (Default: GitHub → Linear)

1. Ask the user for: issue title, description (optional), and Linear issue ID (e.g. `QUR-XX`).
2. Create a GitHub issue using `gh issue create` with the title and description. Include `Part of QUR-XX` in the body if a Linear ID is provided.
3. Create a new git branch from the current branch. Use the naming convention: `peter/qur-XX-short-description` (kebab-case, lowercase).
4. Push the branch to remote with `git push -u origin <branch>`.
5. Report the issue URL, branch name, and Linear ID.
6. Linear auto-links via magic words in commits/PRs ✅

## Workflow Reference

### Method A: GitHub → Linear (Default)

```
Create GitHub issue with QUR-XX in body
    ↓
Create branch → write code → commit with "Part of QUR-XX"
    ↓
Submit PR with QUR-XX in title or description
    ↓
Linear auto-links ✅
```

### Method B: Linear → GitHub

```
Linear: create issue (e.g. QUR-11: Add export feature)
    ↓
Linear: click "Copy git branch name"
    → auto-generates: peter/qur-11-add-export
    ↓
Create branch → write code → submit PR
    ↓
Linear auto-tracks ✅
```

## Linear Magic Words

Use these in commit messages, PR titles, or PR descriptions:

- `Part of QUR-XX` — incremental work on an issue
- `Fixes QUR-XX` / `Closes QUR-XX` — fully resolves the issue
- `Resolves QUR-XX` — also fully resolves the issue

## Rules

- Branch names must be kebab-case and include the Linear issue ID
- Always include the Linear issue ID in the GitHub issue body
- Do not create duplicate issues — check existing issues first
