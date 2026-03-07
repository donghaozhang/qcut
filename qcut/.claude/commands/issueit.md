# Create Issue & Branch

Create a GitHub issue and a matching branch. Linear auto-links via magic words.

## Steps

1. Ask the user for: issue title and description (optional).
2. Create a GitHub issue using `gh issue create` with the title and description.
3. Get the GitHub issue number (e.g. `#210`).
4. Create a new git branch from the current branch. Use the naming convention: `<username>/issue-XXX-short-description` (kebab-case, lowercase), where XXX is the GitHub issue number.
5. Push the branch to remote with `git push -u origin <branch>`.
6. Report: GitHub issue URL and branch name.

## Linear Auto-Linking

Linear automatically links when it sees magic words in commits, PR titles, or PR descriptions:

- `Part of QUR-XX` — incremental work on an issue
- `Fixes QUR-XX` / `Closes QUR-XX` — fully resolves the issue
- `Resolves QUR-XX` — also fully resolves the issue

If there's a matching Linear issue, include the magic word in commits and PRs. Don't force Linear issue numbers to match GitHub numbers — they are independent sequences.

## Rules

- Branch names must be kebab-case and include the GitHub issue number
- Do not create duplicate issues — check existing issues first
