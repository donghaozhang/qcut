# Create Issue & Branch

Create a GitHub issue and a matching branch with Linear integration. Default workflow: GitHub → Linear.

## Steps (Default: GitHub → Linear)

1. Ask the user for: issue title, description (optional), and Linear issue ID (e.g. `QUR-XX`). If no Linear ID is provided, auto-assign one after step 2.
2. Create a GitHub issue using `gh issue create` with the title and description (without `QUR-XX` yet).
3. **Sync the numbers**: Get the newly created GitHub issue number (e.g. `#42`). Use the **same number** for QUR — i.e. `QUR-42`. This keeps GitHub and Linear issue numbers aligned.
4. **Update the issue body**: Edit the GitHub issue to include `Part of QUR-42` using `gh issue edit`.
5. Create a new git branch from the current branch. Use the naming convention: `<username>/qur-XX-short-description` (kebab-case, lowercase), where XX matches the GitHub issue number.
6. Push the branch to remote with `git push -u origin <branch>`.
7. Report the issue URL, branch name, and Linear ID (`QUR-XX` = GitHub issue number).
8. Linear auto-links via magic words in commits/PRs ✅

## Workflow Reference

### Method A: GitHub → Linear (Default)

```text
Create GitHub issue with QUR-XX in body
    ↓
Create branch → write code → commit with "Part of QUR-XX"
    ↓
Submit PR with QUR-XX in title or description
    ↓
Linear auto-links ✅
```

### Method B: Linear → GitHub

```text
Linear: create issue (e.g. QUR-11: Add export feature)
    ↓
Linear: click "Copy git branch name"
    → auto-generates: <username>/qur-11-add-export
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

- **QUR number = GitHub issue number** — always sync them (e.g. GitHub #42 → QUR-42)
- Branch names must be kebab-case and include the Linear issue ID
- Always include the Linear issue ID in the GitHub issue body
- Do not create duplicate issues — check existing issues first
